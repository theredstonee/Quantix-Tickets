// panel.js loop-safe v3
// Änderungen ggü. deiner v2 NUR für echten Loop-Fix + minimale Verbesserungen.
// Alles andere (Form / Embed / Senden / Bearbeiten) bleibt unverändert.
// WICHTIG: In index.js UNBEDINGT vor den Routern setzen: app.set('trust proxy', 1);
// Außerdem: BASE korrekt in .env setzen, z.B. PUBLIC_BASE_URL=https://trstickets.theredstonee.de

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
let cfg = readCfg();

/* ========= Passport Setup ========= */
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

const BASE = process.env.PUBLIC_BASE_URL || ''; // z.B. https://trstickets.theredstonee.de
const CALLBACK_PATH = '/auth/discord/callback';
const CALLBACK_URL  = BASE ? (BASE.replace(/\/$/,'') + CALLBACK_PATH) : CALLBACK_PATH; // trailing slash entfernen

passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: CALLBACK_URL,
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  /* ========= Session ========= */
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!BASE.startsWith('https://'), // nur Secure wenn wirklich HTTPS Basis
      maxAge: 1000*60*60*6 // 6h
    }
  }));

  /* ========= Middleware ========= */
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  // Optionales Debug
  // router.use((req,_res,next)=>{ console.log('DBG', req.method, req.path, 'auth=', !!(req.isAuthenticated && req.isAuthenticated())); next(); });

  /* ========= Auth Helper ========= */
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    cfg = readCfg();
    const memberGuild = req.user.guilds?.find(g=>g.id===cfg.guildId);
    if(!memberGuild) return res.status(403).send('Nicht auf dem Ziel-Server.');
    const PERM = 0x8n | 0x20n; // ADMINISTRATOR oder MANAGE_GUILD
    if(!(BigInt(memberGuild.permissions) & PERM)) return res.status(403).send('Keine Berechtigung.');
    next();
  }

  /* ========= Root ========= */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send(`<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>`);
  });

  /* ========= Login mit einfachem Rate-Limit ========= */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login-Versuche – bitte kurz warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  /* ========= OAuth Callback ========= */
  router.get(CALLBACK_PATH, (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);
        if(err.oauthError) return res.status(429).send('<h2>Rate Limit</h2><p>Bitte warten und erneut versuchen.</p><p><a href="/login">Login</a></p>');
        return res.status(500).send('OAuth Fehler.');
      }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{
        if(e){ console.error('Session Fehler:', e); return res.status(500).send('Session Fehler.'); }
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  /* ========= Logout ========= */
  router.get('/logout',(req,res)=>{
    req.logout?.(()=>{});
    req.session.destroy(()=>res.redirect('/'));
  });

  /* ========= Panel Ansicht ========= */
  router.get('/panel', isAuth, (req,res)=>{
    cfg = readCfg();
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  /* ========= Speichern (Topics + Embeds) ========= */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
      const labels = [].concat(req.body.label||[]);
      const values = [].concat(req.body.value||[]);
      const emojis = [].concat(req.body.emoji||[]);
      const topics=[];
      for(let i=0;i<labels.length;i++){
        const L=(labels[i]||'').trim(); if(!L) continue;
        const V=(values[i]||'').trim() || L.toLowerCase().replace(/\s+/g,'-');
        const E=(emojis[i]||'').trim();
        topics.push({ label:L, value:V, emoji:E||undefined });
      }
      cfg.topics = topics;

      if(req.body.topicsJson){ try { const tj=JSON.parse(req.body.topicsJson); if(Array.isArray(tj)) cfg.topics=tj; } catch{} }
      if(req.body.formFieldsJson){ try { const fj=JSON.parse(req.body.formFieldsJson); if(Array.isArray(fj)) cfg.formFields=fj; } catch{} }

      cfg.ticketEmbed = {
        title: req.body.embedTitle || '',
        description: req.body.embedDescription || '',
        color: req.body.embedColor || '#2b90d9',
        footer: req.body.embedFooter || ''
      };
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

  /* ========= Panel Nachricht Senden ========= */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      cfg.panelChannelId = req.body.channelId;
      await sendOrEdit(true);
      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ========= Panel Nachricht Bearbeiten ========= */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try { await sendOrEdit(false); res.redirect('/panel?msg=edited'); } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ========= Hilfsfunktion Senden/Bearbeiten ========= */
  async function sendOrEdit(send){
    cfg = readCfg();
    const guild = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(cfg.panelChannelId);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Thema wählen …')
      .addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})));
    const row = new ActionRowBuilder().addComponents(menu);

    let embed = null;
    if(cfg.panelEmbed && (cfg.panelEmbed.title || cfg.panelEmbed.description)){
      embed = new EmbedBuilder();
      if(cfg.panelEmbed.title) embed.setTitle(cfg.panelEmbed.title);
      if(cfg.panelEmbed.description) embed.setDescription(cfg.panelEmbed.description);
      if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) embed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
      if(cfg.panelEmbed.footer) embed.setFooter({ text: cfg.panelEmbed.footer });
    }

    if(send){
      const msg = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = msg.id;
    } else {
      const msg = await channel.messages.fetch(cfg.panelMessageId);
      await msg.edit({ embeds: embed? [embed]: undefined, components:[row] });
    }
    fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
  }

  return router;
};
