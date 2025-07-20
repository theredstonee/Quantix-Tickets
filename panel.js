// panel.js – Topics Edit Fix
// Änderung NUR im POST /panel Handler, damit eingetragene Kategorien (Label/Value/Emoji)
// nicht mehr durch das unveränderte RAW JSON Feld überschrieben werden.
// Logik: Wenn mindestens EIN Label-Feld ausgefüllt wurde, werden diese Werte benutzt
// und *topicsJson* wird IGNORIERT (auch wenn im Formular gesendet). Möchte man stattdessen
// das JSON nutzen, lässt man einfach alle Label-Felder leer oder entfernt sie und editiert
// nur das JSON.
// Alle anderen Teile der Datei unverändert.

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

  /* ====== Panel speichern (FIX für Topics) ====== */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
      // 1. Eingaben aus Tabellenfeldern sammeln
      const labelInputs = [].concat(req.body.label||[]);
      const valueInputs = [].concat(req.body.value||[]);
      const emojiInputs = [].concat(req.body.emoji||[]);

      let tableTopics = [];
      for(let i=0;i<labelInputs.length;i++){
        const L = (labelInputs[i]||'').trim();
        if(!L) continue; // nur wirklich ausgefüllte Zeilen
        const V = (valueInputs[i]||'').trim() || L.toLowerCase().replace(/\s+/g,'-');
        const E = (emojiInputs[i]||'').trim();
        tableTopics.push({ label:L, value:V, emoji:E||undefined });
      }

      const hasTableTopics = tableTopics.length > 0; // mind. eine Zeile ausgefüllt -> Vorrang vor JSON

      // 2. Falls KEINE Tabelle (alle leer) aber JSON-Feld vorhanden & nicht nur whitespace -> JSON übernehmen
      if(!hasTableTopics){
        const rawJson = (req.body.topicsJson||'').trim();
        if(rawJson){
          try {
            const parsed = JSON.parse(rawJson);
            if(Array.isArray(parsed)) tableTopics = parsed;
          } catch(err){ console.warn('topicsJson parse Fehler ignoriert'); }
        }
      }

      // 3. Übernehmen
      cfg.topics = tableTopics;

      // 4. (Optional) formFieldsJson gleiches Prinzip: nur wenn nicht leer
      if(req.body.formFieldsJson){
        try { const ff = JSON.parse(req.body.formFieldsJson); if(Array.isArray(ff)) cfg.formFields = ff; } catch{}
      }

      // 5. Embeds
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

  /* ====== Tickets Übersicht (einfach JSON) ====== */
  router.get('/tickets', isAuth, (_req,res)=>{
    try { const tickets = JSON.parse(fs.readFileSync(path.join(__dirname,'tickets.json'),'utf8')); res.json(tickets); }
    catch { res.json([]); }
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
