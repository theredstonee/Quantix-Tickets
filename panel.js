// panel.js loop-fix v3 + Tickets-Ansicht (minimal notwendige Ergänzungen)
// Nur Änderungen für /tickets HTML Übersicht + Filter/Suche/Claimer.
// Rest deines vorhandenen Codes UNVERÄNDERT gelassen, außer Hinzufügen der neuen Route
// und einer kleinen Hilfsfunktion zum Laden der tickets.json.

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
      let embedOpts = {};
      if(cfg.panelEmbed){
        const p = cfg.panelEmbed;
        const embed = new EmbedBuilder().setTitle(p.title || '🎟️ Ticket erstellen').setDescription(p.description || 'Wähle dein Thema unten aus.');
        if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)) embed.setColor(parseInt(p.color.replace('#',''),16));
        if(p.footer) embed.setFooter({ text:p.footer });
        embedOpts.embeds=[embed];
      }
      const sent = await channel.send({ ...embedOpts, components:[row] });
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
      let embedOpts = {};
      if(cfg.panelEmbed){
        const p = cfg.panelEmbed;
        const embed = new EmbedBuilder().setTitle(p.title || '🎟️ Ticket erstellen').setDescription(p.description || 'Wähle dein Thema unten aus.');
        if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)) embed.setColor(parseInt(p.color.replace('#',''),16));
        if(p.footer) embed.setFooter({ text:p.footer });
        embedOpts.embeds=[embed];
      }
      await msg.edit({ ...embedOpts, components:[row] });
      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ==========================================================
   * NEU: /tickets – HTML Übersicht mit Filter / Suche / Claimer
   * (Minimal invasive Ergänzung – ersetzt NICHT die alte JSON Route,
   *  sondern liefert HTML. Falls du die reine JSON Version brauchst,
   *  ändere den Pfad dort z.B. auf /tickets.json.)
   * ========================================================== */
  router.get('/tickets', isAuth, (req,res)=>{
    try {
      const ticketsPath = path.join(__dirname,'tickets.json');
      const tickets = JSON.parse(fs.readFileSync(ticketsPath,'utf8'));

      // Filter Parameter
      const q = (req.query.q||'').toLowerCase();
      const statusFilter  = req.query.status  || 'alle';      // alle | offen | geschlossen
      const claimedFilter = req.query.claimed || 'alle';      // alle | yes | no
      const prioFilter    = req.query.prio    || 'alle';      // alle | 0 | 1 | 2

      // Grundliste (neueste zuerst)
      let list = tickets.slice().sort((a,b)=>b.id - a.id);

      if(statusFilter !== 'alle')      list = list.filter(t=>t.status === statusFilter);
      if(claimedFilter === 'yes')      list = list.filter(t=>!!t.claimer);
      if(claimedFilter === 'no')       list = list.filter(t=>!t.claimer);
      if(['0','1','2'].includes(prioFilter)) list = list.filter(t=>(t.priority||0).toString() === prioFilter);
      if(q) list = list.filter(t =>
        String(t.id).includes(q) ||
        (t.topic||'').toLowerCase().includes(q) ||
        (t.userId||'').includes(q) ||
        (t.claimer||'').includes(q)
      );

      const counts = {
        all: tickets.length,
        open: tickets.filter(t=>t.status==='offen').length,
        closed: tickets.filter(t=>t.status==='geschlossen').length
      };

      // Inline HTML (separate tickets.ejs wäre auch möglich – hier direkt für Minimaländerung)
      res.send(`<!doctype html><html lang='de'><head><meta charset='utf-8'><title>Tickets Übersicht</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
<style>
body{max-width:1300px}
filter-bar{display:block;margin:.75rem 0}
.badge{display:inline-block;padding:.25rem .65rem;border-radius:999px;background:#eee;font-size:.65rem;margin-right:.35rem}
.badge.on{background:#3b82f6;color:#fff}
.prio-dot{font-size:1.05rem}
.status-offen{color:#2bd94a;font-weight:600}
.status-geschlossen{color:#d92b2b;font-weight:600}
.table-wrap{overflow-x:auto}
.search-row{display:flex;gap:.75rem;align-items:center;margin-bottom:.75rem;flex-wrap:wrap}
#tickets tbody tr.hide{display:none}
.auto-info{font-size:.65rem;opacity:.6;margin-left:.5rem}
</style></head><body class='container'>
<h1>🎟️ Tickets Übersicht</h1>
<p style='font-size:.8rem;opacity:.7'>Nur für Team-Mitglieder sichtbar. Live-Daten aus <code>tickets.json</code>.</p>
<nav><a href='/panel'>⬅️ Zurück zum Panel</a></nav>

<div class='search-row'>
  <input id='search' type='text' placeholder='Suche (ID, Topic, User, Claimer)' value='${q.replace(/'/g,"&#39;")}' />
  <label style='display:flex;align-items:center;gap:.4rem'><input type='checkbox' id='autoref' checked> <span class='auto-info'>Auto-Refresh (30s)</span></label>
  <button id='refresh' type='button'>🔄 Aktualisieren</button>
</div>
<div class='search-row'>
  <div id='statusFilters'>
    ${['alle','offen','geschlossen'].map(s=>`<button data-s='${s}' class='statusBtn ${statusFilter===s?'secondary':''}'>${s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join('')}
  </div>
  <div id='claimFilters'>
    ${[['alle','Alle'],['yes','Claimed'],['no','Unclaimed']].map(([v,l])=>`<button data-c='${v}' class='claimBtn ${claimedFilter===v?'secondary':''}'>${l}</button>`).join('')}
  </div>
  <div id='prioFilters'>
    ${['alle','0','1','2'].map(p=>`<button data-p='${p}' class='prioBtn ${prioFilter===p?'secondary':''}'>Prio: ${p==='alle'?'Alle':p}</button>`).join('')}
  </div>
</div>

<p style='font-size:.7rem;opacity:.7'>Gesamt: <strong>${counts.all}</strong> • Offen: <strong>${counts.open}</strong> • Geschlossen: <strong>${counts.closed}</strong></p>
<div class='table-wrap'>
<table id='tickets'>
  <thead><tr><th>#</th><th>Prio</th><th>Status</th><th>Topic</th><th>User</th><th>Claimer</th><th>Erstellt</th><th>Kanal</th></tr></thead>
  <tbody>
  ${list.map(t=>{ const dots=['🟢','🟠','🔴']; const prio=t.priority||0; return `<tr data-search='${t.id} ${t.topic||''} ${t.userId||''} ${t.claimer||''}'>
    <td>#${t.id}</td>
    <td class='prio-dot'>${dots[prio]}</td>
    <td class='status-${t.status}'>${t.status}</td>
    <td>${t.topic||''}</td>
    <td><code>${t.userId}</code></td>
    <td>${t.claimer?`<code>${t.claimer}</code>`:''}</td>
    <td>${new Date(t.timestamp).toLocaleString('de-DE')}</td>
    <td><a href='https://discord.com/channels/${cfg.guildId}/${t.channelId}' target='_blank'>🔗</a></td>
  </tr>`; }).join('')}
  </tbody>
</table>
</div>
<footer style='margin-top:2rem;font-size:.65rem;opacity:.6'>Ticket-Verlauf • Client-Filter & Suche • Letztes Update: ${new Date().toLocaleTimeString('de-DE')}</footer>
<script>
const qIn=document.getElementById('search');
qIn.addEventListener('input',()=>{const v=qIn.value.toLowerCase(); document.querySelectorAll('#tickets tbody tr').forEach(tr=>{const hay=tr.getAttribute('data-search').toLowerCase(); tr.classList.toggle('hide', !hay.includes(v));});});
// Auto reload
const auto=document.getElementById('autoref'); let iv=setInterval(()=>{ if(auto.checked) location.reload(); },30000);
// Buttons rebuild query
function buildQuery(k,v){ const url=new URL(location.href); if(v==='alle'||v===''){ url.searchParams.delete(k);} else { url.searchParams.set(k,v);} url.searchParams.delete('q'); return url.toString(); }
// Status
[...document.querySelectorAll('.statusBtn')].forEach(b=>b.addEventListener('click',()=>location.href=buildQuery('status', b.dataset.s)));
[...document.querySelectorAll('.claimBtn')].forEach(b=>b.addEventListener('click',()=>location.href=buildQuery('claimed', b.dataset.c)));
[...document.querySelectorAll('.prioBtn')].forEach(b=>b.addEventListener('click',()=>location.href=buildQuery('prio', b.dataset.p)));
// Refresh Button
document.getElementById('refresh').addEventListener('click',()=>location.reload());
</script>
</body></html>`);
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
