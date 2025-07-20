// panel.js loop-fix v3 (unverändert außer: /tickets HTML-Ansicht mit Namen + Suche/Filter)
// Nur notwendige Ergänzungen für die Ticket-Übersicht. Rest des Codes NICHT verändert.

require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

/* ====== Config laden ====== */
const CONFIG = path.join(__dirname, 'config.json');
function readCfg(){ try { return JSON.parse(fs.readFileSync(CONFIG,'utf8')); } catch { return {}; } }
let cfg = readCfg();

/* ====== Basis‑URL (für Callback) ====== */
const BASE = process.env.PUBLIC_BASE_URL || '';

/* ====== Passport Serialisierung ====== */
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

/* ====== Discord Strategy ====== */
passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: BASE ? `${BASE.replace(/\/$/,'')}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  /* ====== Session ====== */
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: /^https:\/\//i.test(BASE)
    }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  /* ====== Helper: Auth Middleware ====== */
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    const entry = req.user.guilds?.find(g=>g.id===cfg.guildId);
    if(!entry) return res.status(403).send('Nicht auf Ziel‑Server.');
    const ALLOWED = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!(BigInt(entry.permissions) & ALLOWED)) return res.status(403).send('Keine Berechtigung.');
    next();
  }

  /* ====== Root (kein Auto‑Loop) ====== */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send('<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>');
  });

  /* ====== Login mit einfachem Rate‑Limit pro Session ====== */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login‑Versuche – bitte 4s warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  /* ====== OAuth Callback ====== */
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);
        if(err.oauthError) return res.status(429).send('<h2>Rate Limit</h2><p>Bitte kurz warten.</p><p><a href="/login">Login</a></p>');
        return res.status(500).send('OAuth Fehler.');
      }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{
        if(e){ console.error('Session Fehler:', e); return res.status(500).send('Session Fehler.'); }
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  /* ====== Logout ====== */
  router.get('/logout',(req,res)=>{
    req.logout?.(()=>{});
    req.session.destroy(()=>res.redirect('/'));
  });

  /* ====== Panel Ansicht ====== */
  router.get('/panel', isAuth, (req,res)=>{
    cfg = readCfg();
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  /* ====== Panel speichern ====== */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
      // Tabellen‑Topics
      const labels = [].concat(req.body.label||[]);
      const values = [].concat(req.body.value||[]);
      const emojis = [].concat(req.body.emoji||[]);
      const topics = [];
      for(let i=0;i<labels.length;i++){
        const L=(labels[i]||'').trim(); if(!L) continue;
        const V=(values[i]||'').trim() || L.toLowerCase().replace(/\s+/g,'-');
        const E=(emojis[i]||'').trim();
        topics.push({ label:L, value:V, emoji:E||undefined });
      }
      if(req.body.topicsJson){ try{ const tj=JSON.parse(req.body.topicsJson); if(Array.isArray(tj)) topics.splice(0, topics.length, ...tj); } catch{} }
      cfg.topics = topics;

      cfg.ticketEmbed = {
        title: req.body.embedTitle || cfg.ticketEmbed?.title || '',
        description: req.body.embedDescription || cfg.ticketEmbed?.description || '',
        color: req.body.embedColor || cfg.ticketEmbed?.color || '#2b90d9',
        footer: req.body.embedFooter || cfg.ticketEmbed?.footer || ''
      };
      cfg.panelEmbed = {
        title: req.body.panelTitle || cfg.panelEmbed?.title || '',
        description: req.body.panelDescription || cfg.panelEmbed?.description || '',
        color: req.body.panelColor || cfg.panelEmbed?.color || '#5865F2',
        footer: req.body.panelFooter || cfg.panelEmbed?.footer || ''
      };

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht senden ====== */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      cfg = readCfg();
      cfg.panelChannelId = req.body.channelId;
      const guild   = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const row = buildPanelSelect(cfg);
      let embed = buildPanelEmbed(cfg);
      const sent = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = sent.id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht bearbeiten ====== */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      cfg = readCfg();
      const guild   = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg     = await channel.messages.fetch(cfg.panelMessageId);
      const row     = buildPanelSelect(cfg);
      const embed   = buildPanelEmbed(cfg);
      await msg.edit({ embeds: embed? [embed]: undefined, components:[row] });
      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Tickets Übersicht (HTML Ansicht mit Suche/Filter, User- & Claimer-Namen, Transcript-Links) ====== */
  router.get('/tickets', isAuth, async (req,res)=>{
    try {
      const ticketsPath = path.join(__dirname,'tickets.json');
      const ticketsRaw = fs.readFileSync(ticketsPath,'utf8');
      const tickets = ticketsRaw? JSON.parse(ticketsRaw): [];

      // Filter Parameter
      const q = (req.query.q||'').toLowerCase(); // freie Suche
      const statusFilter = (req.query.status||'alle').toLowerCase(); // offen | geschlossen | alle
      const claimedFilter = (req.query.claimed||'alle').toLowerCase(); // yes | no | alle
      const prioFilter = req.query.prio || 'alle'; // 0 | 1 | 2 | alle

      // Kopie & Sortierung (neueste zuerst)
      let list = tickets.slice().sort((a,b)=>b.id-a.id);

      // Anwenden serverseitiger Filter (Basis)
      if(statusFilter !== 'alle') list = list.filter(t=>t.status === statusFilter);
      if(claimedFilter === 'yes') list = list.filter(t=>!!t.claimer);
      if(claimedFilter === 'no')  list = list.filter(t=>!t.claimer);
      if(prioFilter !== 'alle') list = list.filter(t=>(t.priority||0).toString() === prioFilter);
      if(q) list = list.filter(t=> [t.id, t.topic, t.userId, t.claimer].filter(Boolean).some(v=>String(v).toLowerCase().includes(q)) );

      // Benutzer-Namen (DisplayName oder Tag) auflösen
      const guild = await client.guilds.fetch(cfg.guildId).catch(()=>null);
      const neededIds = new Set();
      list.forEach(t=>{ neededIds.add(t.userId); if(t.claimer) neededIds.add(t.claimer); });
      const nameMap = {}; // id -> Anzeige
      if(guild){
        for(const id of neededIds){
          try {
            const m = await guild.members.fetch(id);
            nameMap[id] = m.displayName || m.user.username || id;
          } catch { nameMap[id] = id; }
        }
      }

      // Counts für Kopfzeile (immer auf Basis aller Tickets)
      const counts = {
        all: tickets.length,
        open: tickets.filter(t=>t.status==='offen').length,
        closed: tickets.filter(t=>t.status==='geschlossen').length
      };

      // HTML direkt senden (keine extra EJS nötig)
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(renderTicketsHTML({ list, counts, q, statusFilter, claimedFilter, prioFilter, nameMap, guildId: cfg.guildId }));
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden der Tickets'); }
  });

  return router;
};

/* ====== Helper für Select & Embed ====== */
function buildPanelSelect(cfg){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})))
  );
}
function buildPanelEmbed(cfg){
  if(!cfg.panelEmbed || (!cfg.panelEmbed.title && !cfg.panelEmbed.description)) return null;
  const e = new EmbedBuilder();
  if(cfg.panelEmbed.title) e.setTitle(cfg.panelEmbed.title);
  if(cfg.panelEmbed.description) e.setDescription(cfg.panelEmbed.description);
  if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) e.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
  if(cfg.panelEmbed.footer) e.setFooter({ text: cfg.panelEmbed.footer });
  return e;
}

/* ====== HTML Renderer für Tickets ====== */
function renderTicketsHTML({ list, counts, q, statusFilter, claimedFilter, prioFilter, nameMap, guildId }){
  const esc = s=>String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const dots = ['🟢','🟠','🔴'];
  const now = new Date();
  const opt = (val,label,cur)=>`<button data-status="${val}" class="tab ${cur===val?'active':''}" type="button">${label}</button>`;
  const optClaim = (val,label,cur)=>`<button data-claimed="${val}" class="tab ${cur===val?'active':''}" type="button">${label}</button>`;
  const optPrio = (val,label,cur)=>`<button data-prio="${val}" class="tab ${cur===val?'active':''}" type="button">${label}</button>`;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Tickets Übersicht</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
<style>
body{max-width:1350px}
:root{--accent:#4062ff}
header h1{display:flex;align-items:center;gap:.6rem}
.tabs{display:flex;flex-wrap:wrap;gap:.4rem;margin:.75rem 0 1rem}
.tab{background:#eef0f5;border:0;padding:.45rem .9rem;border-radius:999px;cursor:pointer;font-size:.75rem;line-height:1;font-weight:500}
.tab.active{background:var(--accent);color:#fff}
#refreshBar{background:#14202b;color:#fff;padding:.85rem 1.2rem;border-radius:6px;margin:.3rem 0 1.1rem;display:flex;align-items:center;justify-content:space-between}
#ticketsTable{width:100%;font-size:.85rem}
#ticketsTable th{white-space:nowrap}
.badge{background:#e5e8ec;padding:.15rem .55rem;border-radius:4px;font-family:monospace;font-size:.7rem}
.status-offen{color:#2bd94a;font-weight:600}
.status-geschlossen{color:#d92b2b;font-weight:600}
.prio{font-size:1rem}
.controls{display:flex;flex-direction:column;gap:.7rem;margin-bottom:.5rem}
.controls .row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.searchBox{flex:1 1 500px;min-width:300px}
footer{margin:2.2rem 0 .8rem;font-size:.7rem;opacity:.55}
.tag{padding:.25rem .55rem;border-radius:4px;background:#eef0f5;font-size:.65rem;margin-right:.35rem}
tr.hide{display:none}
.trans-link{font-size:1rem;text-decoration:none}
</style></head><body class="container">
<header>
  <h1>🧾 Tickets Übersicht</h1>
  <p style="font-size:.75rem;opacity:.7">Nur für Team‑Mitglieder sichtbar. Live‑Daten aus <code>tickets.json</code></p>
  <p style="font-size:.7rem;opacity:.65">Gesamt: <strong>${counts.all}</strong> • Offen: <strong>${counts.open}</strong> • Geschlossen: <strong>${counts.closed}</strong></p>
  <p><a href="/panel">⬅️ Zurück zum Panel</a></p>
</header>
<section class="controls">
  <div class="row"><input id="search" class="searchBox" placeholder="Suche (ID, Topic, User, Claimer)" value="${esc(q)}" autocomplete="off"><label style="display:flex;align-items:center;gap:.4rem;font-size:.75rem"><input type="checkbox" id="auto" checked> Auto‑Refresh (30s)</label></div>
  <div class="row tabs" id="statusTabs">
    ${opt('alle','Alle',statusFilter)}${opt('offen','Offen',statusFilter)}${opt('geschlossen','Geschlossen',statusFilter)}
    ${optClaim('alle','Claimed+Unclaimed',claimedFilter)}${optClaim('yes','Claimed',claimedFilter)}${optClaim('no','Unclaimed',claimedFilter)}
    ${optPrio('alle','Prio: Alle',prioFilter)}${optPrio('0','🟢',prioFilter)}${optPrio('1','🟠',prioFilter)}${optPrio('2','🔴',prioFilter)}
  </div>
  <div id="refreshBar"><button id="manualRefresh" style="background:#1e2d3a;border:0;color:#fff;padding:.5rem 1rem;border-radius:4px;cursor:pointer;display:flex;align-items:center;gap:.5rem">🔄 Aktualisieren</button><span id="lastUpdate" style="font-size:.7rem;opacity:.75">Letztes Update: –</span></div>
</section>
<table id="ticketsTable"><thead><tr>
  <th>#</th><th>Prio</th><th>Status</th><th>Topic</th><th>User</th><th>Claimer</th><th>Erstellt</th><th>Kanal</th><th>Transcript</th>
</tr></thead><tbody>
${list.map(t=>{
  const prio = t.priority||0;
  const statusClass = 'status-'+t.status;
  const userName = nameMap[t.userId]||t.userId;
  const claimerName = t.claimer? (nameMap[t.claimer]||t.claimer):'';
  const transcriptHtml = path.join(__dirname,`transcript_${t.id}.html`);
  const hasTranscript = fs.existsSync(transcriptHtml);
  const created = new Date(t.timestamp);
  const ts = created.toLocaleString('de-DE');
  const searchStr = `${t.id} ${t.topic} ${userName} ${claimerName} ${t.userId} ${t.claimer||''}`.toLowerCase();
  return `<tr data-status="${t.status}" data-claimed="${t.claimer? 'yes':'no'}" data-prio="${prio}" data-search="${esc(searchStr)}">
    <td class="badge">${t.id}</td>
    <td class="prio">${dots[prio]}</td>
    <td class="${statusClass}">${t.status}</td>
    <td>${esc(t.topic)}</td>
    <td><span class="badge" title="${esc(t.userId)}">${esc(userName)}</span></td>
    <td>${claimerName? `<span class="badge" title="${esc(t.claimer)}">${esc(claimerName)}</span>`:''}</td>
    <td>${esc(ts)}</td>
    <td><a href="https://discord.com/channels/${guildId}/${t.channelId}" target="_blank" title="Channel öffnen">🔗</a></td>
    <td>${hasTranscript? `<a class="trans-link" href="/transcript/${t.id}" title="Transcript anzeigen" target="_blank">📄</a>`:''}</td>
  </tr>`; }).join('\n')}
</tbody></table>
<footer>Ticket‑Verlauf • Filtering & Sorting client-seitig • Letztes Update: <span id="footerUpdate">–</span></footer>
<script>
// Client Filter / Suche (ohne neuen Request)
const searchInput = document.getElementById('search');
const statusTabs = document.getElementById('statusTabs');
let curStatus='${statusFilter}', curClaim='${claimedFilter}', curPrio='${prioFilter}';
function applyFilters(){
  const q = searchInput.value.toLowerCase();
  document.querySelectorAll('#ticketsTable tbody tr').forEach(tr=>{
    const matchStatus = (curStatus==='alle') || tr.dataset.status===curStatus;
    const matchClaim = (curClaim==='alle') || tr.dataset.claimed===curClaim;
    const matchPrio = (curPrio==='alle') || tr.dataset.prio===curPrio;
    const hay = tr.dataset.search;
    const matchSearch = !q || hay.includes(q);
    tr.classList.toggle('hide', !(matchStatus && matchClaim && matchPrio && matchSearch));
  });
}
searchInput.addEventListener('input', applyFilters);
statusTabs.addEventListener('click', e=>{
  if(e.target.matches('[data-status]')){ curStatus=e.target.getAttribute('data-status'); document.querySelectorAll('[data-status].tab').forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); applyFilters(); }
  if(e.target.matches('[data-claimed]')){ curClaim=e.target.getAttribute('data-claimed'); document.querySelectorAll('[data-claimed].tab').forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); applyFilters(); }
  if(e.target.matches('[data-prio]')){ curPrio=e.target.getAttribute('data-prio'); document.querySelectorAll('[data-prio].tab').forEach(b=>b.classList.remove('active')); e.target.classList.add('active'); applyFilters(); }
});
applyFilters();
// Refresh
const auto = document.getElementById('auto');
function setTimes(){ const ts=new Date().toLocaleString('de-DE'); document.getElementById('lastUpdate').textContent='Letztes Update: '+ts; document.getElementById('footerUpdate').textContent=ts; }
setTimes();
let iv=setInterval(()=>{ if(auto.checked) location.reload(); },30000);

document.getElementById('manualRefresh').addEventListener('click', ()=>location.reload());
</script>
</body></html>`;
}
