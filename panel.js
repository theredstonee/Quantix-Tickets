// panel.js – HTML Ticket-Verlauf mit Namen statt IDs (angepasst)
// Anpassung: /tickets Rendert tickets.ejs (musst du haben) UND liefert zusätzlich eine Member-Map,
// damit im Frontend User- und Claimer-Namen (Anzeige-Namen) statt reiner IDs erscheinen.
// Rest deiner zuletzt geposteten Datei bleibt erhalten – nur Tickets-Routen ersetzt/ergänzt.

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
    cookie: { httpOnly:true, sameSite:'lax', secure: /^https:\/\//i.test(BASE) }
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

  /* ====== Root ====== */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send('<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>');
  });

  /* ====== Login Rate-Limit ====== */
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
  router.get('/logout',(req,res)=>{ req.logout?.(()=>{}); req.session.destroy(()=>res.redirect('/')); });

  /* ====== Panel Ansicht ====== */
  router.get('/panel', isAuth, (req,res)=>{ cfg = readCfg(); res.render('panel', { cfg, msg:req.query.msg||null }); });

  /* ====== Panel speichern (Topics + FormFields + Embeds) ====== */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
      // Topics aus Tabelle
      const labelInputs = [].concat(req.body.label||[]);
      const valueInputs = [].concat(req.body.value||[]);
      const emojiInputs = [].concat(req.body.emoji||[]);
      let tableTopics = [];
      for(let i=0;i<labelInputs.length;i++){
        const L=(labelInputs[i]||'').trim(); if(!L) continue;
        const V=(valueInputs[i]||'').trim() || L.toLowerCase().replace(/\s+/g,'-');
        const E=(emojiInputs[i]||'').trim();
        tableTopics.push({ label:L, value:V, emoji:E||undefined });
      }
      const hasTableTopics = tableTopics.length>0;
      if(!hasTableTopics){
        const rawJson=(req.body.topicsJson||'').trim();
        if(rawJson){ try{ const parsed=JSON.parse(rawJson); if(Array.isArray(parsed)) tableTopics=parsed; }catch{/*ignore*/} }
      }
      cfg.topics = tableTopics;

      // Form Fields
      if(req.body.formFieldsJson){
        try { const ff=JSON.parse(req.body.formFieldsJson); if(Array.isArray(ff)) cfg.formFields=ff; } catch{}
      }

      // Embeds
      function val(c,f){ return /^#?[0-9a-fA-F]{6}$/.test(c||'') ? c : f; }
      cfg.ticketEmbed = {
        title: req.body.embedTitle || cfg.ticketEmbed?.title || '',
        description: req.body.embedDescription || cfg.ticketEmbed?.description || '',
        color: val(req.body.embedColor || cfg.ticketEmbed?.color,'#2b90d9'),
        footer: req.body.embedFooter || cfg.ticketEmbed?.footer || ''
      };
      cfg.panelEmbed = {
        title: req.body.panelTitle || cfg.panelEmbed?.title || '',
        description: req.body.panelDescription || cfg.panelEmbed?.description || '',
        color: val(req.body.panelColor || cfg.panelEmbed?.color,'#5865F2'),
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

  /* ====== Tickets Helper ====== */
  const TICKETS_PATH = path.join(__dirname,'tickets.json');
  function loadTickets(){ try { return JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8')); } catch { return []; } }

  async function buildMemberMap(guild, tickets){
    const map={};
    const ids=new Set();
    tickets.forEach(t=>{ if(t.userId) ids.add(t.userId); if(t.claimer) ids.add(t.claimer); });
    for(const id of ids){
      try { const m=await guild.members.fetch(id); map[id]={ tag:m.user.tag, display:m.displayName }; }
      catch { map[id]={ tag:id, display:id }; }
    }
    return map;
  }

  /* ====== Tickets HTML Übersicht (NAMEN statt IDs) ====== */
  router.get('/tickets', isAuth, async (req,res)=>{
    try {
      cfg=readCfg();
      const tickets=loadTickets();
      const guild=await client.guilds.fetch(cfg.guildId);
      const memberMap=await buildMemberMap(guild,tickets);
      res.render('tickets', { tickets: JSON.stringify(tickets), memberMap: JSON.stringify(memberMap), guildId: cfg.guildId });
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden'); }
  });

  /* ====== Tickets JSON für Fetch (nur Daten) ====== */
  router.get('/tickets/data', isAuth, (_req,res)=>{ res.json(loadTickets()); });

  /* ====== Transcript Serve ====== */
  router.get('/transcript/:id', isAuth, (req,res)=>{
    const id = req.params.id.replace(/[^0-9]/g,'');
    if(!id) return res.status(400).send('ID fehlt');
    const file = path.join(__dirname, `transcript_${id}.html`);
    if(!fs.existsSync(file)) return res.status(404).send('Transcript nicht gefunden');
    res.sendFile(file);
  });

  return router;
};

/* ====== Helper für Select & Embed ====== */
function buildPanelSelect(cfg){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
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
