// panel.js – HTML Ticket-Verlauf mit Namen statt IDs (angepasst)
// Änderungen: robuster POST-/panel-Handler für korrektes Speichern der Embeds & FormFields
//  - Leere Felder werden als leer gespeichert (nicht mehr "verschluckt")
//  - Hex-Farbe wird validiert & mit führendem # normalisiert
//  - Topics: Tabellenwerte haben Vorrang, sonst topicsJson
//  - /tickets rendert tickets.ejs inkl. Member-Map für Namen statt IDs

require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const VERSION = 'Alpha 1.0'; // Bot Version

/* ====== Config laden ====== */
const CONFIG = path.join(__dirname, 'config.json');
function readCfg(){ try { return JSON.parse(fs.readFileSync(CONFIG,'utf8')); } catch { return {}; } }
let cfg = readCfg();

/* ====== Basis-URL (für Callback) ====== */
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
    if(!entry) return res.status(403).send('Nicht auf Ziel-Server.');
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
      return res.status(429).send('Zu viele Login-Versuche – bitte 4s warten. <a href="/">Zurück</a>');
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
  router.get('/panel', isAuth, async (req,res)=>{
    cfg = readCfg();

    // Channels vom Server laden
    let channels = [];
    try {
      const guild = await client.guilds.fetch(cfg.guildId);
      const fetchedChannels = await guild.channels.fetch();
      channels = fetchedChannels
        .filter(ch => ch.type === 0 || ch.type === 4) // Text Channels (0) und Kategorien (4)
        .map(ch => ({ id: ch.id, name: ch.name, type: ch.type }))
        .sort((a,b) => a.name.localeCompare(b.name));
    } catch(err) {
      console.error('Fehler beim Laden der Channels:', err);
    }

    res.render('panel', { cfg, msg: req.query.msg||null, channels, version: VERSION });
  });

  /* ====== Panel speichern (Topics + FormFields + Embeds + Server Settings – FIXED) ====== */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();

      // ---------- Server Settings ----------
      if(req.body.guildId) cfg.guildId = req.body.guildId.trim();
      if(req.body.ticketCategoryId) cfg.ticketCategoryId = req.body.ticketCategoryId.trim();
      if(req.body.logChannelId) cfg.logChannelId = req.body.logChannelId.trim();
      if(req.body.transcriptChannelId) cfg.transcriptChannelId = req.body.transcriptChannelId.trim();

      // ---------- Topics: Tabellen-Werte haben Vorrang ----------
      const labelInputs = [].concat(req.body.label||[]);
      const valueInputs = [].concat(req.body.value||[]);
      const emojiInputs = [].concat(req.body.emoji||[]);
      let tableTopics = [];
      for(let i=0;i<labelInputs.length;i++){
        const L=(labelInputs[i]||'').trim();
        if(!L) continue; // nur ausgefüllte Zeilen
        const V=(valueInputs[i]||'').trim() || L.toLowerCase().replace(/\s+/g,'-');
        const E=(emojiInputs[i]||'').trim();
        tableTopics.push({ label:L, value:V, emoji:E||undefined });
      }
      if(tableTopics.length>0){
        cfg.topics = tableTopics;
      } else {
        const rawJson=(req.body.topicsJson||'').trim();
        if(rawJson){ try{ const parsed=JSON.parse(rawJson); if(Array.isArray(parsed)) cfg.topics=parsed; }catch{/*ignore*/} }
        if(!Array.isArray(cfg.topics)) cfg.topics = [];
      }

      // ---------- Form Fields (JSON direkt) ----------
      if(Object.prototype.hasOwnProperty.call(req.body,'formFieldsJson')){
        try {
          const ff = JSON.parse(req.body.formFieldsJson);
          cfg.formFields = Array.isArray(ff) ? ff : [];
        } catch { cfg.formFields = []; }
      }

      // ---------- Embeds (Ticket & Panel) – echte Übernahme auch bei leeren Strings ----------
      const ensureHex = (s, fallback) => {
        const str = (s ?? '').toString().trim();
        if(/^#?[0-9a-fA-F]{6}$/.test(str)){ return str.startsWith('#') ? str : '#'+str; }
        // wenn ungültig und fallback vorhanden → fallback normalisieren
        const fb = (fallback ?? '').toString().trim() || '#2b90d9';
        return fb.startsWith('#') ? fb : '#'+fb;
      };
      const take = (bodyKey, current) => (
        Object.prototype.hasOwnProperty.call(req.body, bodyKey) ? req.body[bodyKey] : (current ?? '')
      );

      // Ticket Embed
      const prevTE = cfg.ticketEmbed || {};
      cfg.ticketEmbed = {
        title:       take('embedTitle',       prevTE.title),
        description: take('embedDescription', prevTE.description),
        color:       ensureHex(take('embedColor', prevTE.color), '#2b90d9'),
        footer:      take('embedFooter',      prevTE.footer)
      };

      // Panel Embed
      const prevPE = cfg.panelEmbed || {};
      cfg.panelEmbed = {
        title:       take('panelTitle',       prevPE.title),
        description: take('panelDescription', prevPE.description),
        color:       ensureHex(take('panelColor', prevPE.color), '#5865F2'),
        footer:      take('panelFooter',      prevPE.footer)
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
    const map = {};
    const ids = new Set();
    tickets.forEach(t => {
      if(t.userId) ids.add(t.userId);
      if(t.claimer) ids.add(t.claimer);
    });
    for(const id of ids){
      try {
        const m = await guild.members.fetch(id);
        map[id] = {
          tag: m.user.tag,
          username: m.user.username,
          nickname: m.nickname || null,
          display: m.displayName
        };
      } catch {
        map[id] = { tag:id, username:id, nickname:null, display:id };
      }
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
      res.render('tickets', {
        tickets: JSON.stringify(tickets),
        memberMap: JSON.stringify(memberMap),
        guildId: cfg.guildId,
        version: VERSION
      });
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden'); }
  });

  /* ====== Tickets JSON für Fetch ====== */
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
