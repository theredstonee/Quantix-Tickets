// panel.js – Panel + Topics/Formular Verwaltung + Tickets HTML Ansicht
// Änderungen ggü. deiner letzten geposteten panel.js Version:
//  * /tickets rendert jetzt eine HTML Ansicht (tickets.ejs) statt Roh‑JSON.
//  * /tickets/data liefert weiterhin die JSON Rohdaten (für evtl. Auto‑Reload via Fetch).
//  * /tickets.json alias auf /tickets/data (falls externe Tools das alte JSON brauchen).
//  * /transcript/:id gibt (falls vorhanden) transcript_<id>.html aus (optional; falls du in index.js Transcripts erzeugst).
//  * Restliche Routen (Login, Speichern, Panel senden/bearbeiten) unverändert außer notwendige Ergänzungen.
//  * FormFields + Topics Logik bleibt wie zuvor: Tabellenfelder überschreiben JSON bei Eingabe.

require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

/* ====== Pfade & Config ====== */
const CONFIG = path.join(__dirname,'config.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');
function readCfg(){ try { return JSON.parse(fs.readFileSync(CONFIG,'utf8')); } catch { return {}; } }
let cfg = readCfg();

/* ====== Basis‑URL (Callback) ====== */
const BASE = process.env.PUBLIC_BASE_URL || '';

/* ====== Passport ====== */
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));
passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: BASE ? `${BASE.replace(/\/$/,'')}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_r,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  /* ====== Session ====== */
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly:true, sameSite:'lax', secure: /^https:\/\//i.test(BASE) }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  /* ====== Auth Middleware ====== */
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    cfg = readCfg();
    const entry = req.user.guilds?.find(g=>g.id===cfg.guildId);
    if(!entry) return res.status(403).send('Nicht auf Ziel‑Server.');
    const ALLOWED = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!(BigInt(entry.permissions) & ALLOWED)) return res.status(403).send('Keine Berechtigung.');
    next();
  }

  /* ====== Root ====== */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send('<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>');
  });

  /* ====== Login (Rate Limit) ====== */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login‑Versuche – bitte 4s warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now; next();
  }, passport.authenticate('discord'));

  /* ====== OAuth Callback ====== */
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){ console.error('OAuth Fehler:', err); return res.status(500).send('OAuth Fehler.'); }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{ if(e){ console.error('Session Fehler:', e); return res.status(500).send('Session Fehler.'); } res.redirect('/panel'); });
    })(req,res,next);
  });

  /* ====== Logout ====== */
  router.get('/logout',(req,res)=>{ req.logout?.(()=>{}); req.session.destroy(()=>res.redirect('/')); });

  /* ====== Panel Seite ====== */
  router.get('/panel', isAuth, (req,res)=>{ cfg=readCfg(); res.render('panel',{ cfg, msg:req.query.msg||null }); });

  /* ====== Panel speichern ====== */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
      // Topics aus Tabelle
      const labels=[].concat(req.body.label||[]);
      const values=[].concat(req.body.value||[]);
      const emojis=[].concat(req.body.emoji||[]);
      const topics=[];
      for(let i=0;i<labels.length;i++){
        const L=(labels[i]||'').trim(); if(!L) continue;
        const V=(values[i]||'').trim() || L.toLowerCase().replace(/\s+/g,'-');
        const E=(emojis[i]||'').trim();
        topics.push({ label:L, value:V, emoji:E||undefined });
      }
      // Falls Tabelle genutzt wurde → hat Vorrang; sonst optional JSON
      if(topics.length>0){
        cfg.topics = topics;
      } else if(req.body.topicsJson){
        try { const tj=JSON.parse(req.body.topicsJson); if(Array.isArray(tj)) cfg.topics=tj; } catch{}
      }

      // FormFields (immer direkt aus JSON, da kein Tabelleneditor nötig war)
      if(req.body.formFieldsJson){
        try { const ff=JSON.parse(req.body.formFieldsJson); if(Array.isArray(ff)) cfg.formFields=ff; } catch{}
      }

      // Ticket Embed
      cfg.ticketEmbed = {
        title: req.body.embedTitle || '',
        description: req.body.embedDescription || '',
        color: req.body.embedColor || '#2b90d9',
        footer: req.body.embedFooter || ''
      };
      // Panel Embed
      cfg.panelEmbed = {
        title: req.body.panelTitle || '',
        description: req.body.panelDescription || '',
        color: req.body.panelColor || '#5865F2',
        footer: req.body.panelFooter || ''
      };

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht Senden ====== */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      cfg = readCfg();
      cfg.panelChannelId = req.body.channelId;
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const row = buildPanelSelect(cfg);
      const embed = buildPanelEmbed(cfg);
      const sent = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = sent.id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht Bearbeiten ====== */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      cfg = readCfg();
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg = await channel.messages.fetch(cfg.panelMessageId);
      const row = buildPanelSelect(cfg);
      const embed = buildPanelEmbed(cfg);
      await msg.edit({ embeds: embed? [embed]: undefined, components:[row] });
      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ========================================================= */
  /* =============== Tickets HTML Ansicht ==================== */
  /* ========================================================= */
  function loadTickets(){ try { return JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8')); } catch { return []; } }

  // /tickets -> HTML Rendering (tickets.ejs erforderlich)
  router.get('/tickets', isAuth, async (req,res)=>{
    try {
      cfg = readCfg();
      const tickets = loadTickets();
      const statusFilter = (req.query.status||'alle').toLowerCase();

      // Optional: Member Namen auflösen (nur die IDs die wir brauchen)
      const guild = await client.guilds.fetch(cfg.guildId);
      const ids = new Set(); tickets.forEach(t=>{ ids.add(t.userId); if(t.claimer) ids.add(t.claimer); });
      const memberMap = {};
      for(const id of ids){
        try { const m = await guild.members.fetch(id); memberMap[id] = { tag:m.user.tag, display:m.displayName }; } catch { memberMap[id] = { tag:id, display:id }; }
      }

      let list = tickets;
      if(statusFilter==='offen') list = list.filter(t=>t.status==='offen');
      else if(statusFilter==='geschlossen') list = list.filter(t=>t.status==='geschlossen');

      // tickets.ejs erhält Serialisierte Daten (stringify) zur clientseitigen Filterung/Sortierung
      res.render('tickets', {
        guildId: cfg.guildId,
        tickets: JSON.stringify(tickets),
        memberMap: JSON.stringify(memberMap),
        status: statusFilter
      });
    } catch(err){ console.error(err); res.status(500).send('Fehler beim Laden'); }
  });

  // Daten-Endpunkte
  router.get('/tickets/data', isAuth, (_req,res)=>{ res.json(loadTickets()); }); // rohe JSON
  router.get('/tickets.json', isAuth, (_req,res)=>{ res.json(loadTickets()); }); // alias (Abwärtskompatibilität)

  // Transcript HTML ausliefern (falls existiert)
  router.get('/transcript/:id', isAuth, (req,res)=>{
    const id = req.params.id.replace(/[^0-9]/g,'');
    if(!id) return res.status(400).send('ID fehlt');
    const file = path.join(__dirname, `transcript_${id}.html`);
    if(!fs.existsSync(file)) return res.status(404).send('Transcript nicht gefunden');
    res.sendFile(file);
  });

  return router;
};

/* ====== Helper: Panel Select + Panel Embed ====== */
function buildPanelSelect(cfg){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Thema wählen …')
      .addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
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
