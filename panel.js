// panel.js | loop-safe v3 (nur notwendige Änderungen für Login-Loop-Fix, Rest unverändert gelassen)
// Änderungen gegenüber deiner geposteten Version (v2):
//  - trust proxy Hinweis (muss in index.js gesetzt sein: app.set('trust proxy', 1))
//  - BASE Erkennung: wenn keine PUBLIC_BASE_URL gesetzt, nutzen wir absolute Pfade ohne BASE Präfix
//  - secure Cookie nur bei HTTPS Domain (BASE beginnt mit https://)
//  - Mehr Logging optional (auskommentiert)
//  - Kleinere Robustheit beim Laden/Speichern der config
//  - KEINE sonstigen Funktionalitätsänderungen

require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs       = require('fs');
const path     = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const CONFIG = path.join(__dirname,'config.json');
function readCfg(){ try { return JSON.parse(fs.readFileSync(CONFIG,'utf8')); } catch { return {}; } }
function writeCfg(c){ try { fs.writeFileSync(CONFIG, JSON.stringify(c,null,2)); } catch(e){ console.error('Config speichern fehlgeschlagen:', e); } }
let cfg = readCfg();

// Basis‑URL (z.B. https://trstickets.theredstonee.de)
const BASE = process.env.PUBLIC_BASE_URL || '';

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: BASE ? `${BASE}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  /* ---- Session ---- */
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!BASE.startsWith('https://') // nur Secure wenn HTTPS
    }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  // Optional Debug
  // router.use((req,_res,next)=>{ console.log('[DBG]', req.method, req.path, 'auth=', req.isAuthenticated&&req.isAuthenticated()); next(); });

  /* ---- Auth Helper ---- */
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    cfg = readCfg();
    const g = (req.user.guilds||[]).find(g=>g.id===cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!g || !(BigInt(g.permissions) & ALLOWED)) return res.status(403).send('Keine Berechtigung');
    next();
  }

  /* ---- Root ---- */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send(`<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>`);
  });

  /* ---- Login (Rate Limit Guard) ---- */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login-Versuche – bitte 4s warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  /* ---- OAuth Callback ---- */
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);
        if(err.oauthError) return res.status(429).send('<h2>Rate Limit</h2><p>Bitte kurz warten.</p><p><a href="/login">Login</a></p>');
        return res.status(500).send('OAuth Fehler');
      }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{
        if(e){ console.error('Session Fehler:', e); return res.status(500).send('Session Fehler'); }
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  /* ---- Logout ---- */
  router.get('/logout',(req,res)=>{
    req.logout?.(()=>{});
    req.session.destroy(()=>res.redirect('/'));
  });

  /* ---- Panel Ansicht ---- */
  router.get('/panel', isAuth, (req,res)=>{
    cfg = readCfg();
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  /* ---- Speichern ---- */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
      // Tabellen-Eingaben
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
      if(req.body.topicsJson){ try { const tj=JSON.parse(req.body.topicsJson); if(Array.isArray(tj)) cfg.topics=tj; } catch{} }
      else cfg.topics = topics;

      if(req.body.formFieldsJson){ try { const fj=JSON.parse(req.body.formFieldsJson); if(Array.isArray(fj)) cfg.formFields=fj; } catch{} }

      cfg.ticketEmbed = {
        title: req.body.embedTitle       || cfg.ticketEmbed?.title       || '',
        description: req.body.embedDescription || cfg.ticketEmbed?.description || '',
        color: req.body.embedColor       || cfg.ticketEmbed?.color       || '#2b90d9',
        footer: req.body.embedFooter     || cfg.ticketEmbed?.footer     || ''
      };
      cfg.panelEmbed = {
        title: req.body.panelTitle       || cfg.panelEmbed?.title       || '',
        description: req.body.panelDescription || cfg.panelEmbed?.description || '',
        color: req.body.panelColor       || cfg.panelEmbed?.color       || '#5865F2',
        footer: req.body.panelFooter     || cfg.panelEmbed?.footer     || ''
      };

      writeCfg(cfg);
      res.redirect('/panel?msg=saved');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  async function sendOrEditPanel(send=true){
    cfg = readCfg();
    const guild   = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(cfg.panelChannelId);

    const menu = new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})));
    const row  = new ActionRowBuilder().addComponents(menu);

    let embed=null;
    if(cfg.panelEmbed && (cfg.panelEmbed.title || cfg.panelEmbed.description)){
      embed = new EmbedBuilder();
      if(cfg.panelEmbed.title) embed.setTitle(cfg.panelEmbed.title);
      if(cfg.panelEmbed.description) embed.setDescription(cfg.panelEmbed.description);
      if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) embed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
      if(cfg.panelEmbed.footer) embed.setFooter({ text: cfg.panelEmbed.footer });
    }

    if(send){
      const sent = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = sent.id;
    } else {
      if(!cfg.panelMessageId) throw new Error('Keine gespeicherte panelMessageId');
      const msg = await channel.messages.fetch(cfg.panelMessageId);
      await msg.edit({ embeds: embed? [embed]: undefined, components:[row] });
    }
    writeCfg(cfg);
  }

  /* ---- Panel Nachricht senden ---- */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      cfg.panelChannelId = req.body.channelId;
      await sendOrEditPanel(true);
      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ---- Panel Nachricht bearbeiten ---- */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      await sendOrEditPanel(false);
      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  return router;
};
