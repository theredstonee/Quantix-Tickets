// panel.js – Erweiterung: /tickets HTML-Übersicht mit Filter / Suche / Claimer-Anzeige
// Nur die für die Tickets-Ansicht notwendigen Ergänzungen wurden vorgenommen.
// Rest (Login-Loop Fix, Session, OAuth) unverändert gelassen.

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

/* ====== Passport Setup ====== */
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

const BASE = process.env.PUBLIC_BASE_URL || '';
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

  /* ====== Auth Middleware ====== */
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

  /* ====== Login ====== */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login‑Versuche – bitte 4s warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  /* ====== Callback ====== */
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){ console.error('OAuth Fehler:', err); return res.status(500).send('OAuth Fehler.'); }
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

  /* ====== Panel ====== */
  router.get('/panel', isAuth, (req,res)=>{
    cfg = readCfg();
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  /* ====== Panel speichern ====== */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
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
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg = await channel.messages.fetch(cfg.panelMessageId);
      const row = buildPanelSelect(cfg);
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

  /* ====== Tickets Übersicht (HTML + Filter / Suche) ====== */
  router.get('/tickets', isAuth, (req,res)=>{
    try {
      const ticketsPath = path.join(__dirname,'tickets.json');
      const tickets = JSON.parse(fs.readFileSync(ticketsPath,'utf8'));
      const q = (req.query.q||'').toLowerCase();
      const statusFilter = req.query.status || 'alle'; // alle | offen | geschlossen
      const claimedFilter = req.query.claimed || 'alle'; // alle | yes | no
      let list = tickets.slice().sort((a,b)=>b.id-a.id);
      if(statusFilter!=='alle') list = list.filter(t=>t.status===statusFilter);
      if(claimedFilter==='yes') list = list.filter(t=>!!t.claimer);
      if(claimedFilter==='no')  list = list.filter(t=>!t.claimer);
      if(q) list = list.filter(t => String(t.id).includes(q) || (t.topic||'').toLowerCase().includes(q) || (t.userId||'').includes(q) || (t.claimer||'').includes(q));

      const counts = {
        all: tickets.length,
        open: tickets.filter(t=>t.status==='offen').length,
        closed: tickets.filter(t=>t.status==='geschlossen').length
      };

      res.render('tickets', { list, counts, q, status:statusFilter, claimed:claimedFilter, guildId:cfg.guildId });
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden der Tickets'); }
  });

  return router;
};

/* ====== Helpers ====== */
function buildPanelSelect(cfg){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})))
  );
}
