// panel.js (fix redirect loop): Root redirect + login handling
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

/* Passport Setup */
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

const BASE = process.env.PUBLIC_BASE_URL || '';

passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: BASE ? `${BASE}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read']
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!BASE && BASE.startsWith('https://') // nur secure Cookie bei HTTPS Domain
    }
  }));
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  function isAuth(req,res,next){
    if(!req.isAuthenticated || !req.isAuthenticated()) return res.redirect('/login');
    const guildInfo = req.user.guilds?.find(g=>g.id===cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!guildInfo || !(BigInt(guildInfo.permissions) & ALLOWED)) return res.status(403).send('Keine Berechtigung');
    next();
  }

  // Root: nur weiterleiten wenn NICHT bereits auf /login oder /auth... (Schutz gegen Loop)
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    return res.redirect('/login');
  });

  // Login: wenn eingeloggt -> Panel, sonst OAuth
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    next();
  }, passport.authenticate('discord'));

  router.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/login' }),
    (_req,res)=> res.redirect('/panel')
  );

  // Panel Ansicht
  router.get('/panel', isAuth, (req,res)=>{
    res.render('panel', { cfg, msg: null });
  });

  // Update Topics / Embeds
  router.post('/panel', isAuth, (req,res)=>{
    try {
      // Falls Tabellen genutzt wurden
      if(Array.isArray(req.body.label)){
        const topics = [];
        req.body.label.forEach((label,i)=>{
          if(!label.trim()) return;
          topics.push({
            label: label.trim(),
            value: (req.body.value?.[i] || label.trim().toLowerCase().replace(/\s+/g,'-')), 
            emoji: (req.body.emoji?.[i]||'').trim()
          });
        });
        cfg.topics = topics;
      }

      // Ticket Embed Felder
      cfg.ticketEmbed = {
        title: req.body.embedTitle || '',
        description: req.body.embedDescription || '',
        color: req.body.embedColor || '#2b90d9',
        footer: req.body.embedFooter || ''
      };

      // Panel Embed Felder
      cfg.panelEmbed = {
        title: req.body.panelTitle || '',
        description: req.body.panelDescription || '',
        color: req.body.panelColor || '#5865F2',
        footer: req.body.panelFooter || ''
      };

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      return res.redirect('/panel?msg=saved');
    } catch(err){
      console.error('Panel Save Error', err);
      return res.redirect('/panel?msg=error');
    }
  });

  // Panel Nachricht senden
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const channelId = req.body.channelId;
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(channelId);

      const { StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
      const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Wähle dein Thema …')
          .addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})))
      );

      let embed = null;
      if(cfg.panelEmbed){
        embed = new EmbedBuilder().setTitle(cfg.panelEmbed.title||'🎟️ Ticket erstellen')
          .setDescription(cfg.panelEmbed.description||'Wähle unten ein Thema aus.')
        if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color))
          embed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
        if(cfg.panelEmbed.footer) embed.setFooter({ text: cfg.panelEmbed.footer });
      }

      const sent = await channel.send({ embeds: embed? [embed]: undefined, components:[menuRow] });
      cfg.panelChannelId = channelId;
      cfg.panelMessageId = sent.id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(err){
      console.error('Send Panel Error', err);
      res.redirect('/panel?msg=error');
    }
  });

  // Panel Nachricht bearbeiten
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      const guild = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg = await channel.messages.fetch(cfg.panelMessageId);
      const { StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
      const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Wähle dein Thema …')
          .addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})))
      );
      let embed = null;
      if(cfg.panelEmbed){
        embed = new EmbedBuilder().setTitle(cfg.panelEmbed.title||'🎟️ Ticket erstellen')
          .setDescription(cfg.panelEmbed.description||'Wähle unten ein Thema aus.')
        if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color))
          embed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
        if(cfg.panelEmbed.footer) embed.setFooter({ text: cfg.panelEmbed.footer });
      }
      await msg.edit({ embeds: embed? [embed]: undefined, components:[menuRow] });
      res.redirect('/panel?msg=edited');
    } catch(err){
      console.error('Edit Panel Error', err);
      res.redirect('/panel?msg=error');
    }
  });

  return router;
};
