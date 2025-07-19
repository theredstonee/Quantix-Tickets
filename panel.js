// panel.js (Loop-Safe Version) – behebt Redirect-Schleifen & Rate-Limit
// Features:
//  * Root zeigt Landing (kein Auto-Redirect Spam)
//  * /login nur wenn nicht eingeloggt
//  * Rate-Limit Schutz (4s) pro Session
//  * Logout Route
//  * BASE URL für OAuth (PUBLIC_BASE_URL)
//  * trust proxy Hinweis

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, 'config.json');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG,'utf8')); } catch { cfg = {}; }

module.exports = (client) => {
  const router = express.Router();

  // Hinter Cloudflare / Proxy
  // Stelle in index.js sicher: app.set('trust proxy', 1);

  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!process.env.PUBLIC_BASE_URL?.startsWith('https://')
    }
  }));

  passport.serializeUser((u,d)=>d(null,u));
  passport.deserializeUser((u,d)=>d(null,u));

  const BASE = process.env.PUBLIC_BASE_URL || '';
  passport.use(new Strategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `${BASE}/auth/discord/callback`,
    scope: ['identify','guilds','guilds.members.read'],
    state: true
  }, (_a,_b,profile,done)=>done(null,profile)));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    const m = req.user.guilds?.find(g=>g.id===cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!m || !(BigInt(m.permissions) & ALLOWED)) return res.status(403).send('Keine Berechtigung');
    next();
  }

  // Root Landing (kein sofortiger Loop)
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send(`<!doctype html><html><head><meta charset='utf-8'><title>Ticket Panel</title><style>body{font-family:Arial;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column}a{color:#4ea1ff;text-decoration:none;padding:.7rem 1.1rem;border:1px solid #4ea1ff;border-radius:6px}a:hover{background:#4ea1ff22}</style></head><body><h1>Ticket Panel</h1><p><a href="/login">Mit Discord einloggen</a></p></body></html>`);
  });

  // Login mit einfachem Rate-Limit
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login-Versuche – bitte kurz warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  // OAuth Callback mit Fehlerbehandlung
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord', (err,user)=>{
      if(err){
        console.error('OAuth Fehler', err);
        if(err.oauthError) return res.status(429).send('<h2>Rate Limit</h2><p>Bitte 30 Sekunden warten.</p><p><a href="/login">Erneut</a></p>');
        return res.status(500).send('OAuth Fehler.');
      }
      if(!user) return res.redirect('/login');
      req.logIn(user, (lerr)=>{
        if(lerr){ console.error('Login Fehler', lerr); return res.status(500).send('Session Fehler'); }
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  router.get('/logout',(req,res)=>{
    req.logout && req.logout(()=>{});
    req.session.destroy(()=>res.redirect('/'));
  });

  // Panel Ansicht
  router.get('/panel', isAuth, (req,res)=>{
    res.render('panel', { cfg, msg: req.query.msg||null });
  });

  // Speichern (Topics / Ticket + Panel Embed)
  router.post('/panel', isAuth, (req,res)=>{
    try {
      // Topics aus Tabelle
      let topics=[];
      if(Array.isArray(req.body.label)){
        req.body.label.forEach((label,idx)=>{
          if(!label.trim()) return;
            topics.push({
              label: label.trim(),
              value: (req.body.value?.[idx]||label.trim().toLowerCase().replace(/\s+/g,'-')),
              emoji: (req.body.emoji?.[idx]||'')
            });
        });
      }
      // RAW JSON überschreibt Tabelle falls ausgefüllt
      if(req.body.topicsJson && req.body.topicsJson.trim()){
        try { topics = JSON.parse(req.body.topicsJson); } catch { /* ignorieren */ }
      }
      cfg.topics = topics;

      cfg.ticketEmbed = {
        title: req.body.embedTitle||'',
        description: req.body.embedDescription||'',
        color: req.body.embedColor||'#2b90d9',
        footer: req.body.embedFooter||''
      };
      cfg.panelEmbed = {
        title: req.body.panelTitle||'',
        description: req.body.panelDescription||'',
        color: req.body.panelColor||'#5865F2',
        footer: req.body.panelFooter||''
      };

      if(req.body.formFieldsJson && req.body.formFieldsJson.trim()){
        try { cfg.formFields = JSON.parse(req.body.formFieldsJson); } catch { /* ignorieren */ }
      }

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    } catch(e){
      console.error('Save Fehler', e);
      res.redirect('/panel?msg=error');
    }
  });

  // Panel-Nachricht senden
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const id = await sendOrEditPanelMessage(client, req.body.channelId, null);
      cfg.panelChannelId = req.body.channelId;
      cfg.panelMessageId = id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  // Panel-Nachricht bearbeiten
  router.post('/panel/edit', isAuth, async (req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      await sendOrEditPanelMessage(client, cfg.panelChannelId, cfg.panelMessageId);
      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  async function sendOrEditPanelMessage(client, channelId, messageId){
    const guild = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(channelId);
    const { StringSelectMenuBuilder, EmbedBuilder, ActionRowBuilder } = require('discord.js');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })));

    const row = new ActionRowBuilder().addComponents(menu);

    let embed=null;
    if(cfg.panelEmbed){
      embed = new EmbedBuilder()
        .setTitle(cfg.panelEmbed.title||'🎟️ Ticket erstellen')
        .setDescription(cfg.panelEmbed.description||'Bitte Thema unten auswählen.')
      if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color))
        embed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
      if(cfg.panelEmbed.footer)
        embed.setFooter({ text: cfg.panelEmbed.footer });
    }

    const payload = embed ? { embeds:[embed], components:[row] } : { components:[row] };

    if(messageId){
      const msg = await channel.messages.fetch(messageId);
      await msg.edit(payload);
      return messageId;
    } else {
      const sent = await channel.send(payload);
      return sent.id;
    }
  }

  return router;
};
