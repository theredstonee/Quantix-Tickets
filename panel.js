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
const { getTranslations, t, getLanguageName } = require('./translations');
const cookieParser = require('cookie-parser');

const VERSION = 'Alpha 1.0.1'; // Bot Version

/* ====== Config laden (Multi-Server) ====== */
const CONFIG_DIR = path.join(__dirname, 'configs');
if(!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR);

// Legacy config.json als Fallback
const LEGACY_CONFIG = path.join(__dirname, 'config.json');

function readCfg(guildId){
  try {
    if(!guildId){
      // Fallback auf legacy config.json
      try {
        const data = JSON.parse(fs.readFileSync(LEGACY_CONFIG,'utf8'));
        return data || {};
      } catch {
        return {};
      }
    }
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(configPath,'utf8'));
      return data || {};
    } catch {
      // Wenn keine Config existiert, erstelle default
      const defaultCfg = {
        guildId: guildId,
        topics: [],
        formFields: [],
        teamRoleId: '1387525699908272218', // Default Team-Rolle
        ticketEmbed: {
          title: '🎫 Ticket #{ticketNumber}',
          description: 'Hallo {userMention}\n**Thema:** {topicLabel}',
          color: '#2b90d9',
          footer: 'TRS Tickets ©️'
        },
        panelEmbed: {
          title: '🎫 Ticket System',
          description: 'Wähle dein Thema',
          color: '#5865F2',
          footer: 'TRS Tickets ©️'
        }
      };
      writeCfg(guildId, defaultCfg);
      return defaultCfg;
    }
  } catch(err) {
    console.error('readCfg error:', err);
    return {};
  }
}

function writeCfg(guildId, data){
  try {
    if(!guildId){
      fs.writeFileSync(LEGACY_CONFIG, JSON.stringify(data, null, 2));
      return;
    }
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  } catch(err) {
    console.error('writeCfg error:', err);
  }
}

let cfg = readCfg(); // Legacy fallback

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

  /* ====== Log Helper ====== */
  async function logEvent(guildId, text, user){
    try {
      const cfg = readCfg(guildId);
      if(!cfg.logChannelId) return;
      const guild = await client.guilds.fetch(guildId);
      const ch = await guild.channels.fetch(cfg.logChannelId);
      if(!ch) return;

      const embed = new EmbedBuilder()
        .setDescription(text)
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ text: 'TRS Tickets ©️' });

      if(user){
        embed.setAuthor({ name: `${user.username}`, iconURL: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined });
      }

      await ch.send({ embeds: [embed] });
    } catch(err) {
      console.error('Log Error:', err);
    }
  }

  /* ====== Session ====== */
  router.use(cookieParser());
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly:true, sameSite:'lax', secure: /^https:\/\//i.test(BASE) }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  /* ====== Language Middleware ====== */
  router.use((req, res, next) => {
    // Get language from guild config if available, otherwise use cookie
    const guildId = req.session?.selectedGuild;
    let lang = 'de';

    if (guildId) {
      const cfg = readCfg(guildId);
      lang = cfg.language || 'de';
    } else {
      lang = req.cookies.lang || 'de';
    }

    res.locals.lang = lang;
    res.locals.t = getTranslations(lang);
    next();
  });

  /* ====== Helper: Auth Middleware (Server-spezifisch) ====== */
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    // Prüfe ob ein Server ausgewählt wurde
    if(!req.session.selectedGuild) return res.redirect('/select-server');

    const guildId = req.session.selectedGuild;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    if(!entry) return res.status(403).send('Du bist nicht auf diesem Server oder der Bot ist nicht auf dem Server.');

    // Nur Administrator darf zugreifen
    const ADMIN = 0x8n; // Administrator Permission
    if(!(BigInt(entry.permissions) & ADMIN)) {
      return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte auf diesem Server.');
    }

    next();
  }

  /* ====== Root ====== */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/select-server');
    const lang = req.cookies.lang || 'de';
    res.render('home', {
      lang: lang,
      t: getTranslations(lang)
    });
  });

  /* ====== Terms of Service (No Auth Required) ====== */
  router.get('/terms-of-service', (req, res) => {
    const lang = req.cookies.lang || 'de';
    res.render('terms-of-service', {
      t: getTranslations(lang),
      lang: lang
    });
  });

  /* ====== Privacy Policy (No Auth Required) ====== */
  router.get('/privacy-policy', (req, res) => {
    const lang = req.cookies.lang || 'de';
    res.render('privacy-policy', {
      t: getTranslations(lang),
      lang: lang
    });
  });

  /* ====== Server Auswahl ====== */
  router.get('/select-server', async (req,res)=>{
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    try {
      // Hole alle Guilds wo der Bot ist
      const botGuilds = await client.guilds.fetch();
      const botGuildIds = new Set(botGuilds.map(g => g.id));

      // Filter User-Guilds: Nur wo Bot ist UND User Admin ist
      const ADMIN = 0x8n;
      const availableServers = (req.user.guilds || [])
        .filter(g => {
          const hasBot = botGuildIds.has(g.id);
          const isAdmin = (BigInt(g.permissions) & ADMIN) === ADMIN;
          return hasBot && isAdmin;
        })
        .map(g => ({
          id: g.id,
          name: g.name,
          icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
        }));

      if(availableServers.length === 0){
        return res.send('<h1>Keine Server verfügbar</h1><p>Du bist auf keinem Server Administrator wo der Bot ist.</p><p><a href="/logout">Logout</a></p>');
      }

      res.render('select-server', {
        servers: availableServers,
        version: VERSION,
        currentGuild: req.session.selectedGuild || null,
        t: res.locals.t
      });
    } catch(err){
      console.error('Server-Auswahl Fehler:', err);
      res.status(500).send('Fehler beim Laden der Server');
    }
  });

  /* ====== Server Auswahl speichern ====== */
  router.post('/select-server', (req,res)=>{
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    const guildId = req.body.guildId;
    if(!guildId) return res.redirect('/select-server');

    // Prüfe ob User Admin auf dem Server ist
    const ADMIN = 0x8n;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    if(!entry || !(BigInt(entry.permissions) & ADMIN)){
      return res.status(403).send('Keine Administrator-Rechte auf diesem Server.');
    }

    req.session.selectedGuild = guildId;
    res.redirect('/panel');
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

  /* ====== User Language Preference (Cookie-based, No Auth) ====== */
  router.get('/set-user-language/:lang', (req, res) => {
    const lang = ['de', 'en', 'he'].includes(req.params.lang) ? req.params.lang : 'de';
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, path: '/' }); // 1 year
    res.redirect('/');
  });

  /* ====== Language Switch (Guild-based) ====== */
  router.get('/set-language/:lang', isAuth, async (req, res) => {
    const lang = ['de', 'en', 'he'].includes(req.params.lang) ? req.params.lang : 'de';
    const guildId = req.session.selectedGuild;

    if (guildId) {
      const cfg = readCfg(guildId);
      cfg.language = lang;
      writeCfg(guildId, cfg);

      // Log Event
      const langName = getLanguageName(lang);
      await logEvent(guildId, t(guildId, 'logs.language_changed', { language: langName }), req.user);
    }

    res.redirect(req.get('referer') || '/panel');
  });

  /* ====== Panel Ansicht ====== */
  router.get('/panel', isAuth, async (req,res)=>{
    const guildId = req.session.selectedGuild;
    const cfg = readCfg(guildId);

    // Channels und Rollen vom Server laden
    let channels = [];
    let roles = [];
    let guildName = 'Server';
    try {
      const guild = await client.guilds.fetch(guildId);
      guildName = guild.name;

      // Channels laden
      const fetchedChannels = await guild.channels.fetch();
      channels = fetchedChannels
        .filter(ch => ch.type === 0 || ch.type === 4) // Text Channels (0) und Kategorien (4)
        .map(ch => ({ id: ch.id, name: ch.name, type: ch.type }))
        .sort((a,b) => a.name.localeCompare(b.name));

      // Rollen laden
      const fetchedRoles = await guild.roles.fetch();
      roles = fetchedRoles
        .filter(r => r.id !== guild.id) // @everyone ausschließen
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
        .sort((a,b) => a.name.localeCompare(b.name));
    } catch(err) {
      console.error('Fehler beim Laden der Channels/Rollen:', err);
    }

    res.render('panel', {
      cfg,
      msg: req.query.msg||null,
      channels,
      roles,
      version: VERSION,
      guildName,
      guildId
    });
  });

  /* ====== Panel speichern (Topics + FormFields + Embeds + Server Settings – FIXED) ====== */
  router.post('/panel', isAuth, async (req,res)=>{
    try {
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);

      // ---------- Server Settings ----------
      cfg.guildId = guildId; // Immer die ausgewählte Guild
      if(req.body.ticketCategoryId) cfg.ticketCategoryId = req.body.ticketCategoryId.trim();
      if(req.body.logChannelId) cfg.logChannelId = req.body.logChannelId.trim();
      if(req.body.transcriptChannelId) cfg.transcriptChannelId = req.body.transcriptChannelId.trim();
      if(req.body.teamRoleId) cfg.teamRoleId = req.body.teamRoleId.trim();

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

      writeCfg(guildId, cfg);

      // Log Event
      await logEvent(guildId, t(guildId, 'logs.config_updated'), req.user);

      res.redirect('/panel?msg=saved');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht senden ====== */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);
      cfg.panelChannelId = req.body.channelId;
      const guild   = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const row = buildPanelSelect(cfg);
      let embed = buildPanelEmbed(cfg);
      const sent = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = sent.id;
      writeCfg(guildId, cfg);

      // Log Event
      await logEvent(guildId, t(guildId, 'logs.panel_sent', { channel: `<#${cfg.panelChannelId}>` }), req.user);

      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht bearbeiten ====== */
  router.post('/panel/edit', isAuth, async (req,res)=>{
    const guildId = req.session.selectedGuild;
    const cfg = readCfg(guildId);
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      const guild   = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg     = await channel.messages.fetch(cfg.panelMessageId);
      const row     = buildPanelSelect(cfg);
      const embed   = buildPanelEmbed(cfg);
      await msg.edit({ embeds: embed? [embed]: undefined, components:[row] });

      // Log Event
      await logEvent(guildId, t(guildId, 'logs.panel_edited', { channel: `<#${cfg.panelChannelId}>` }), req.user);

      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Tickets Helper ====== */
  const TICKETS_PATH = path.join(__dirname,'tickets.json'); // Legacy fallback
  function getTicketsPath(guildId){
    if(!guildId) return TICKETS_PATH;
    return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
  }
  function loadTickets(guildId){
    const ticketsPath = getTicketsPath(guildId);
    try {
      if(!fs.existsSync(ticketsPath)) return [];
      return JSON.parse(fs.readFileSync(ticketsPath,'utf8'));
    } catch {
      return [];
    }
  }

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
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);
      const tickets = loadTickets(guildId);
      const guild = await client.guilds.fetch(guildId);
      const memberMap = await buildMemberMap(guild,tickets);
      res.render('tickets', {
        tickets: JSON.stringify(tickets),
        memberMap: JSON.stringify(memberMap),
        guildId: guildId,
        version: VERSION
      });
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden'); }
  });

  /* ====== Tickets JSON für Fetch ====== */
  router.get('/tickets/data', isAuth, (req,res)=>{ res.json(loadTickets(req.session.selectedGuild)); });

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
  const topics = (cfg.topics||[]).filter(t => t && t.label && t.value);
  if(topics.length === 0){
    topics.push({ label: 'Keine Topics konfiguriert', value: 'none', emoji: '⚠️' });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions(topics.map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
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
