// panel.js loop-fix v3  (ERWEITERT: Ticket-Übersicht + Transcript-Routen)
// Nur notwendige Ergänzungen für /tickets HTML-Ansicht mit Namen, Suche/Filter horizontal
// und /transcript/:id Serving. Original Login / Panel Logik unverändert.

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

  /* ====== Tickets Daten (JSON roh) ====== */
  router.get('/tickets/data', isAuth, (_req,res)=>{
    try { const tickets = JSON.parse(fs.readFileSync(path.join(__dirname,'tickets.json'),'utf8')); res.json(tickets); }
    catch { res.json([]); }
  });

  /* ====== Transcript Serve ====== */
  router.get('/transcript/:id', isAuth, (req,res)=>{
    const id = req.params.id.replace(/[^0-9]/g,'');
    if(!id) return res.status(400).send('ID fehlt');
    const file = path.join(__dirname,`transcript_${id}.html`);
    if(!fs.existsSync(file)) return res.status(404).send('Transcript nicht gefunden');
    res.sendFile(file);
  });

  /* ====== Tickets Übersicht (HTML) ====== */
  router.get('/tickets', isAuth, async (req,res)=>{
    try {
      const ticketsPath = path.join(__dirname,'tickets.json');
      const raw = fs.readFileSync(ticketsPath,'utf8');
      const tickets = raw? JSON.parse(raw): [];

      // Für Namen Mapping (nur benötigte IDs fetchen)
      const guild = await client.guilds.fetch(cfg.guildId).catch(()=>null);
      const ids = new Set();
      tickets.forEach(t=>{ if(t.userId) ids.add(t.userId); if(t.claimer) ids.add(t.claimer); });
      const nameMap = {};
      if(guild){
        for(const id of ids){
          try { const m = await guild.members.fetch(id); nameMap[id] = m.displayName || m.user.username || id; }
          catch { nameMap[id] = id; }
        }
      }

      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(renderTicketsHTML({ tickets, nameMap, guildId: cfg.guildId }));
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

/* ====== HTML Renderer Tickets ====== */
function renderTicketsHTML({ tickets, nameMap, guildId }){
  const esc = s=>String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  const dots=['🟢','🟠','🔴'];
  // Tabelle Zeilen
  const rows = tickets.sort((a,b)=>b.id-a.id).map(t=>{
    const prio = t.priority||0;
    const userName = nameMap[t.userId]||t.userId;
    const claimer  = t.claimer ? (nameMap[t.claimer]||t.claimer) : '';
    const transcriptExists = fs.existsSync(path.join(__dirname,`transcript_${t.id}.html`));
    return `<tr data-status="${t.status}" data-claimed="${t.claimer? 'claimed':'unclaimed'}" data-prio="${prio}" data-search="${esc(`${t.id} ${t.topic} ${userName} ${claimer} ${t.userId} ${t.claimer||''}`)}">\n      <td class="nowrap">#${t.id}</td>\n      <td>${dots[prio]}</td>\n      <td class="status-${t.status}">${t.status}</td>\n      <td>${esc(t.topic||'')}</td>\n      <td><span class="pill" title="${esc(t.userId)}">${esc(userName)}</span></td>\n      <td>${claimer? `<span class=\"pill\" title=\"${esc(t.claimer)}\">${esc(claimer)}</span>`:''}</td>\n      <td>${new Date(t.timestamp).toLocaleString('de-DE')}</td>\n      <td><a href="https://discord.com/channels/${guildId}/${t.channelId}" target="_blank">🔗</a></td>\n      <td>${transcriptExists? `<a href="/transcript/${t.id}" target="_blank" title="Transcript">📄</a>`:''}</td>\n    </tr>`; }).join('\n');

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Tickets Übersicht</title>\n<link rel=stylesheet href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">\n<style>body{max-width:1350px}h1{display:flex;gap:.6rem;align-items:center}.filters{display:flex;flex-wrap:wrap;gap:.5rem;margin:.8rem 0}button.tab{background:#eef0f5;border:0;padding:.45rem 1rem;border-radius:999px;cursor:pointer;font-size:.7rem;font-weight:500}button.tab.active{background:#4062ff;color:#fff}.bar{background:#13202b;color:#fff;padding:.7rem 1rem;border-radius:6px;margin:1rem 0 .8rem;display:flex;align-items:center;justify-content:space-between}table{width:100%;font-size:.8rem}th{white-space:nowrap}td .pill{background:#e4e7ec;padding:.15rem .45rem;border-radius:4px;font-family:monospace;font-size:.65rem}.status-offen{color:#2bd94a;font-weight:600}.status-geschlossen{color:#d92b2b;font-weight:600}tr.hide{display:none}.nowrap{white-space:nowrap}</style></head><body class=container>\n<h1>📔 Tickets Übersicht</h1><p style="font-size:.7rem;opacity:.65;margin-top:-.4rem">Nur Team. Daten aus <code>tickets.json</code>. Filter client‑seitig.</p><p><a href="/panel">⬅️ Zurück zum Panel</a></p>\n<div style="display:flex;flex-wrap:wrap;gap:.8rem;align-items:center;margin:1.2rem 0 .6rem"><input id=search placeholder="Suche (ID, Topic, User, Claimer)" style="flex:1;min-width:320px"><label style="font-size:.65rem;display:flex;align-items:center;gap:.3rem"><input id=auto type=checkbox checked> Auto-Refresh (30s)</label></div>\n<div class=filters id=fTabs>\n  <button class=tab data-status=alle>Alle</button><button class=tab data-status=offen>Offen</button><button class=tab data-status=geschlossen>Geschlossen</button>\n  <button class=tab data-claim=alle>Claimed+Unclaimed</button><button class=tab data-claim=claimed>Claimed</button><button class=tab data-claim=unclaimed>Unclaimed</button>\n  <button class=tab data-prio=alle>Prio: Alle</button><button class=tab data-prio=0>🟢</button><button class=tab data-prio=1>🟠</button><button class=tab data-prio=2>🔴</button>\n</div>\n<div class=bar><button id=reload style="background:#1e2d3a;border:0;color:#fff;padding:.45rem 1rem;border-radius:4px;cursor:pointer">🔄 Aktualisieren</button><span id=info style="font-size:.65rem;opacity:.75">–</span></div>\n<table id=ticketsTbl><thead><tr><th>#</th><th>Prio</th><th>Status</th><th>Topic</th><th>User</th><th>Claimer</th><th>Erstellt</th><th>Kanal</th><th>Transcript</th></tr></thead><tbody>${rows}</tbody></table><footer style="margin:2rem 0 .8rem;font-size:.6rem;opacity:.55">Ticket-Verlauf • Letztes Update: <span id=last>–</span></footer>\n<script>\nconst q=document.getElementById('search');const info=document.getElementById('info');const last=document.getElementById('last');let curStatus='alle',curClaim='alle',curPrio='alle';function setActive(sel,attr,val){sel.querySelectorAll('[data-'+attr+']').forEach(b=>b.classList.toggle('active',b.getAttribute('data-'+attr)===val));}const tBody=document.querySelector('#ticketsTbl tbody');function apply(){const term=q.value.toLowerCase();let shown=0,total=0; tBody.querySelectorAll('tr').forEach(tr=>{total++;const okStatus=(curStatus==='alle')||tr.dataset.status===curStatus;const okClaim=(curClaim==='alle')||tr.dataset.claimed===curClaim;const okPrio=(curPrio==='alle')||tr.dataset.prio===curPrio;const okSearch=!term||tr.dataset.search.includes(term);const vis=okStatus&&okClaim&&okPrio&&okSearch; tr.classList.toggle('hide',!vis); if(vis) shown++;}); info.textContent='Angezeigt: '+shown+' / Gesamt: '+total; last.textContent=new Date().toLocaleTimeString('de-DE'); } apply(); q.addEventListener('input',apply); document.getElementById('fTabs').addEventListener('click',e=>{if(e.target.matches('[data-status]')){curStatus=e.target.getAttribute('data-status');setActive(fTabs,'status',curStatus);apply();} if(e.target.matches('[data-claim]')){curClaim=e.target.getAttribute('data-claim');setActive(fTabs,'claim',curClaim);apply();} if(e.target.matches('[data-prio]')){curPrio=e.target.getAttribute('data-prio');setActive(fTabs,'prio',curPrio);apply();}}); const auto=document.getElementById('auto'); setInterval(()=>{ if(auto.checked) location.reload(); },30000); document.getElementById('reload').addEventListener('click',()=>location.reload()); // Default aktive Buttons
['[data-status=alle]','[data-claim=alle]','[data-prio=alle]'].forEach(sel=>{const b=document.querySelector(sel); b&&b.classList.add('active');});\n</script></body></html>`;
}
