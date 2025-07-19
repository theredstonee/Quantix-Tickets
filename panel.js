// panel.js loop-safe v2
// Fix für dein Redirect- / Login-Loop + Rate-Limit Schutz
// WICHTIG: In index.js -> app.set('trust proxy', 1); vor app.use('/', require('./panel')(client));

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

const BASE = process.env.PUBLIC_BASE_URL || '';

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: `${BASE}/auth/discord/callback`,
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  // Session
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly:true, sameSite:'lax', secure: true }
  }));

  // Debug (optional aktivieren)
  // router.use((req,_res,next)=>{ console.log('DBG', req.path, 'auth=', req.isAuthenticated&&req.isAuthenticated()); next(); });

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  /* Helper: Auth Check */
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    const m = req.user.guilds?.find(g=>g.id===cfg.guildId);
    if(!m) return res.status(403).send('Nicht auf dem Ziel-Server.');
    const PERM = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!(BigInt(m.permissions) & PERM)) return res.status(403).send('Keine Berechtigung.');
    next();
  }

  /* Root Landing (kein Auto-Redirect-Loop) */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send(`<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>`);
  });

  /* Login (mit Rate-Limit Guard) */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login-Versuche – bitte 4s warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  /* Callback mit Fehlerbehandlung */
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);
        if(err.oauthError) return res.status(429).send('<h2>Rate Limit</h2><p>Bitte kurz warten und erneut versuchen.</p><p><a href="/login">Login</a></p>');
        return res.status(500).send('OAuth Fehler.');
      }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{
        if(e){ console.error('Login Fehler:', e); return res.status(500).send('Session Fehler.'); }
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  /* Logout */
  router.get('/logout',(req,res)=>{
    req.logout?.(()=>{});
    req.session.destroy(()=>{ res.redirect('/'); });
  });

  /* Panel Ansicht */
  router.get('/panel', isAuth, (req,res)=>{
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  /* Speichern */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      // Topics aus Tabelle
      const labels = Array.isArray(req.body.label)? req.body.label : [req.body.label].filter(Boolean);
      const values = Array.isArray(req.body.value)? req.body.value : [req.body.value].filter(Boolean);
      const emojis = Array.isArray(req.body.emoji)? req.body.emoji : [req.body.emoji].filter(Boolean);
      const topics=[];
      labels.forEach((l,idx)=>{
        if(!l) return;
        topics.push({ label:l, value: (values[idx]||l).toLowerCase(), emoji: emojis[idx]||'' });
      });
      cfg.topics = topics;

      // Ticket Embed Felder
      cfg.ticketEmbed = {
        title: req.body.embedTitle || cfg.ticketEmbed?.title || '',
        description: req.body.embedDescription || cfg.ticketEmbed?.description || '',
        color: req.body.embedColor || cfg.ticketEmbed?.color || '#2b90d9',
        footer: req.body.embedFooter || cfg.ticketEmbed?.footer || ''
      };
      // Panel Embed Felder
      cfg.panelEmbed = {
        title: req.body.panelTitle || cfg.panelEmbed?.title || '',
        description: req.body.panelDescription || cfg.panelEmbed?.description || '',
        color: req.body.panelColor || cfg.panelEmbed?.color || '#5865F2',
        footer: req.body.panelFooter || cfg.panelEmbed?.footer || ''
      };

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    } catch(err){ console.error(err); res.redirect('/panel?msg=error'); }
  });

  /* Panel Nachricht senden */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const channelId = req.body.channelId;
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(channelId);
      const row = buildPanelSelect(cfg);
      let embedOpts = {};
      if(cfg.panelEmbed){
        const p = cfg.panelEmbed;
        const embed = new (require('discord.js').EmbedBuilder)()
          .setTitle(p.title || '🎟️ Ticket erstellen')
          .setDescription(p.description || 'Wähle dein Thema unten aus.');
        if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)) embed.setColor(parseInt(p.color.replace('#',''),16));
        if(p.footer) embed.setFooter({ text:p.footer });
        embedOpts.embeds=[embed];
      }
      const sent = await channel.send({ ...embedOpts, components:[row] });
      cfg.panelChannelId = channelId;
      cfg.panelMessageId = sent.id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(err){ console.error(err); res.redirect('/panel?msg=error'); }
  });

  /* Panel Nachricht bearbeiten */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg = await channel.messages.fetch(cfg.panelMessageId);
      const row = buildPanelSelect(cfg);
      let embedOpts = {};
      if(cfg.panelEmbed){
        const p = cfg.panelEmbed;
        const embed = new (require('discord.js').EmbedBuilder)()
          .setTitle(p.title || '🎟️ Ticket erstellen')
          .setDescription(p.description || 'Wähle dein Thema unten aus.');
        if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)) embed.setColor(parseInt(p.color.replace('#',''),16));
        if(p.footer) embed.setFooter({ text:p.footer });
        embedOpts.embeds=[embed];
      }
      await msg.edit({ ...embedOpts, components:[row] });
      res.redirect('/panel?msg=edited');
    } catch(err){ console.error(err); res.redirect('/panel?msg=error'); }
  });

  /* Tickets Übersicht (einfach) */
  router.get('/tickets', isAuth, (_req,res)=>{
    try {
      const tickets = safeRead(path.join(__dirname,'tickets.json'), []);
      res.json(tickets);
    } catch(err){ res.json([]); }
  });

  function buildPanelSelect(cfg){
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})))
    );
  }

  function safeRead(f,fb){ try{ return JSON.parse(fs.readFileSync(f,'utf8')); } catch{ return fb; } }

  return router;
};
