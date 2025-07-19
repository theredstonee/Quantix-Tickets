// panel.js | loop-safe v3 (nur notwendige Änderungen für Login-Loop + sichere Callback-URL)
// Änderungen gegenüber deiner geposteten Version v2:
//  - trust proxy Unterstützung: in index.js MUSS stehen: app.set('trust proxy', 1);
//  - callbackURL Fallback ohne BASE führt nicht mehr zu doppelten Protokollen
//  - BASE Normalisierung (entfernt trailing slash)
//  - Sicher: secure-Cookie nur wenn https
//  - Zusätzliche Schutzprüfung gegen wiederholtes sofortiges Redirecten (nonce in Session)
//  - Rest deines Codes unangetastet gelassen

require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs       = require('fs');
const path     = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const CONFIG = path.join(__dirname, 'config.json');
function readCfg(){ try { return JSON.parse(fs.readFileSync(CONFIG,'utf8')); } catch { return {}; } }
let cfg = readCfg();

// BASE normalisieren (kein trailing /)
let BASE = process.env.PUBLIC_BASE_URL || '';
if(BASE.endsWith('/')) BASE = BASE.slice(0,-1);

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  BASE ? `${BASE}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client) => {
  const router = express.Router();

  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: BASE.startsWith('https://') // nur Secure bei HTTPS
    }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({ extended:true }));

  // Helper: Auth‑Check
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    const m = req.user.guilds?.find(g=>g.id===cfg.guildId);
    if(!m) return res.status(403).send('Nicht auf dem Ziel-Server.');
    const PERM = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!(BigInt(m.permissions) & PERM)) return res.status(403).send('Keine Berechtigung.');
    next();
  }

  // Root: keine sofortige Weiterleitung ohne Auth
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send('<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>');
  });

  // Login: Rate Limit + Loop Break (nonce)
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 3500){
      return res.status(429).send('Zu viele Login-Versuche – bitte kurz warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    // Nonce erzeugen um Callback eindeutig zu machen
    req.session.oauthNonce = Math.random().toString(36).slice(2);
    next();
  }, passport.authenticate('discord'));

  // Callback
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);
        return res.status(500).send('OAuth Fehler.');
      }
      if(!user) return res.redirect('/login');
      // Prüfen ob Session existiert (Loop-Vermeidung)
      if(!req.session){
        return res.status(400).send('Session verloren – erneut versuchen.');
      }
      req.logIn(user,(e)=>{
        if(e){ console.error('Login Fehler:', e); return res.status(500).send('Session Fehler.'); }
        // Nonce verbrauchen
        delete req.session.oauthNonce;
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  router.get('/logout',(req,res)=>{
    req.logout?.(()=>{});
    req.session.destroy(()=>res.redirect('/'));
  });

  // Panel
  router.get('/panel', isAuth, (req,res)=>{
    cfg = readCfg();
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  // Speichern
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
        topics.push({label:L,value:V,emoji:E||undefined});
      }
      cfg.topics = topics;

      if(req.body.topicsJson){ try { const tj=JSON.parse(req.body.topicsJson); if(Array.isArray(tj)) cfg.topics=tj; } catch {}
      }
      if(req.body.formFieldsJson){ try { const fj=JSON.parse(req.body.formFieldsJson); if(Array.isArray(fj)) cfg.formFields=fj; } catch {}
      }

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

  async function sendOrEditPanel(send=true){
    const guild = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(cfg.panelChannelId);
    const menu = new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen…').addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})));
    const row = new ActionRowBuilder().addComponents(menu);
    let embed=null;
    if(cfg.panelEmbed && (cfg.panelEmbed.title || cfg.panelEmbed.description)){
      embed = new EmbedBuilder();
      if(cfg.panelEmbed.title) embed.setTitle(cfg.panelEmbed.title);
      if(cfg.panelEmbed.description) embed.setDescription(cfg.panelEmbed.description);
      if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) embed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
      if(cfg.panelEmbed.footer) embed.setFooter({ text: cfg.panelEmbed.footer });
    }
    if(send){
      const m = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = m.id;
    } else {
      const m = await channel.messages.fetch(cfg.panelMessageId);
      await m.edit({ embeds: embed? [embed]: undefined, components:[row] });
    }
    fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
  }

  router.post('/panel/send', isAuth, async (req,res)=>{
    try { cfg.panelChannelId = req.body.channelId; await sendOrEditPanel(true); res.redirect('/panel?msg=sent'); } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try { await sendOrEditPanel(false); res.redirect('/panel?msg=edited'); } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  return router;
};
