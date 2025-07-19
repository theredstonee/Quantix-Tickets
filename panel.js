// --- panel.js | Discord Ticket Panel (OAuth + Root Redirect + Panel/Ticket Editing) ---
// Änderungen:
//  * Root "/" leitet nun automatisch auf /login (oder /panel wenn eingeloggt)
//  * /login leitet eingeloggte Benutzer direkt auf /panel
//  * callbackURL nutzt PUBLIC_BASE_URL aus .env (Fallback relativ)
//  * Panel-/Ticket-Konfig bearbeitbar (topics, formFields, embeds)
//  * Panel-Nachricht senden / bearbeiten
//  * Ticket-Übersicht (/tickets) – getrennt nach offen/geschlossen
//  * EXPORT: module.exports = (client) => router (wie zuvor)

require('dotenv').config();
const express    = require('express');
const session    = require('express-session');
const passport   = require('passport');
const { Strategy } = require('passport-discord');
const fs         = require('fs');
const path       = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const CONFIG_PATH = path.join(__dirname,'config.json');
let   cfg         = loadConfig();

function loadConfig(){
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8')); } catch { return {}; }
}
function saveConfig(){ fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg,null,2)); }

/* ========= Passport Setup ========= */
passport.serializeUser((user, done)=> done(null, user));
passport.deserializeUser((obj, done)=> done(null, obj));

const BASE = process.env.PUBLIC_BASE_URL || ''; // z.B. https://trstickets.theredstonee.de

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  BASE ? `${BASE}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read']
}, (_a,_r,profile,done)=> done(null, profile)));

/* ========= Auth Guard ========= */
function isAuth(req,res,next){
  if(!req.isAuthenticated || !req.isAuthenticated()) return res.redirect('/login');
  // Guild & Permissions
  const guildInfo = req.user.guilds?.find(g=> g.id === cfg.guildId);
  if(!guildInfo) return res.status(403).send('Nicht auf dem Ziel-Server.');
  const ALLOWED = 0x8n | 0x20n; // ADMIN oder MANAGE_GUILD
  try {
    if(!(BigInt(guildInfo.permissions) & ALLOWED)) return res.status(403).send('Keine Berechtigung.');
  } catch { /* falls permissions fehlt */ }
  next();
}

/* ========= Panel Embed Builder ========= */
function buildPanelPayload(){
  const menu = new StringSelectMenuBuilder()
    .setCustomId('topic')
    .setPlaceholder('Wähle dein Thema …')
    .addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji || undefined })));

  let embed;
  if(cfg.panelEmbed){
    embed = new EmbedBuilder();
    if(cfg.panelEmbed.title) embed.setTitle(cfg.panelEmbed.title);
    if(cfg.panelEmbed.description) embed.setDescription(cfg.panelEmbed.description);
    if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color))
      embed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
    if(cfg.panelEmbed.footer) embed.setFooter({ text: cfg.panelEmbed.footer });
  } else {
    embed = new EmbedBuilder().setTitle('🎟️ Ticket erstellen').setDescription('Bitte wähle unten dein Thema.');
  }
  return {
    embeds:[embed],
    components:[ new ActionRowBuilder().addComponents(menu) ]
  };
}

/* ========= Exported Router Factory ========= */
module.exports = (client)=>{
  const router = express.Router();

  // Sessions
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave:false,
    saveUninitialized:false,
    cookie:{
      httpOnly:true,
      sameSite:'lax',
      secure: !!BASE // nur wenn echte https Domain genutzt wird
    }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));
  router.use(express.json());

  /* ===== Root Redirect ===== */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    return res.redirect('/login');
  });

  /* ===== Login ===== */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    next();
  }, passport.authenticate('discord'));

  router.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (_req,res)=> res.redirect('/panel')
  );

  /* ===== Panel Ansicht ===== */
  router.get('/panel', isAuth, (req,res)=>{
    cfg = loadConfig();
    res.render('panel', { cfg, msg: req.query.msg });
  });

  /* ===== Topics + Embeds speichern ===== */
  router.post('/panel', isAuth, (req,res)=>{
    cfg = loadConfig();

    // Tabellen-Eingaben (label/value/emoji) sammeln → falls JSON Felder nicht benutzt
    const labels = Array.isArray(req.body.label) ? req.body.label : (req.body.label? [req.body.label]: []);
    const values = Array.isArray(req.body.value) ? req.body.value : (req.body.value? [req.body.value]: []);
    const emojis = Array.isArray(req.body.emoji) ? req.body.emoji : (req.body.emoji? [req.body.emoji]: []);

    if(labels.length){
      cfg.topics = labels.map((l,i)=>({
        label: l.trim(),
        value: (values[i] && values[i].trim()) || l.trim().toLowerCase().replace(/\s+/g,'-'),
        emoji: (emojis[i] && emojis[i].trim()) || ''
      })).filter(t=>t.label);
    }

    // Optional RAW JSON Felder
    if(req.body.topicsJson){
      try { cfg.topics = JSON.parse(req.body.topicsJson); } catch {/* ignore */}
    }
    if(req.body.formFieldsJson){
      try { cfg.formFields = JSON.parse(req.body.formFieldsJson); } catch {/* ignore */}
    }

    // Ticket Embed Vorlage
    cfg.ticketEmbed = {
      title:       req.body.embedTitle || '',
      description: req.body.embedDescription || '',
      color:       req.body.embedColor || '#2b90d9',
      footer:      req.body.embedFooter || ''
    };

    // Panel Embed
    cfg.panelEmbed = {
      title: req.body.panelTitle || '',
      description: req.body.panelDescription || '',
      color: req.body.panelColor || '#5865F2',
      footer: req.body.panelFooter || ''
    };

    saveConfig();
    res.redirect('/panel?msg=saved');
  });

  /* ===== Panel-Nachricht senden ===== */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const channelId = req.body.channelId;
      if(!channelId) return res.redirect('/panel?msg=error');
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(channelId);
      const payload = buildPanelPayload();
      const sent = await channel.send(payload);
      cfg.panelChannelId = channelId;
      cfg.panelMessageId = sent.id;
      saveConfig();
      res.redirect('/panel?msg=sent');
    } catch(err){
      console.error('Panel send Fehler', err);
      res.redirect('/panel?msg=error');
    }
  });

  /* ===== Panel-Nachricht bearbeiten ===== */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    try {
      if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg = await channel.messages.fetch(cfg.panelMessageId);
      const payload = buildPanelPayload();
      await msg.edit(payload);
      res.redirect('/panel?msg=edited');
    } catch(err){
      console.error('Panel edit Fehler', err);
      res.redirect('/panel?msg=error');
    }
  });

  /* ===== Tickets Übersicht ===== */
  router.get('/tickets', isAuth, (_req,res)=>{
    const ticketsPath = path.join(__dirname,'tickets.json');
    let tickets = [];
    try { tickets = JSON.parse(fs.readFileSync(ticketsPath,'utf8')); } catch{}
    // Sort neueste zuerst
    tickets.sort((a,b)=> b.timestamp - a.timestamp);
    res.render('tickets', { tickets });
  });

  return router;
};
