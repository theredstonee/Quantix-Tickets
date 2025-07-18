// --- panel.js | Router‑Factory: senden & bearbeiten Panel‑Nachricht, Fehlermeldung sauber ---
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const { Strategy } = require('passport-discord');
const fs        = require('fs');
const path      = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const CONFIG = path.join(__dirname, 'config.json');
let   cfg    = require(CONFIG);

/* ───── Passport Setup ───── */
passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((u, d) => d(null, u));
passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',
  scope: ['identify', 'guilds', 'guilds.members.read']
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client) => {
  const router = express.Router();

  /* ── Middlewares ── */
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false
  }));
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({ extended:true }));

  /* ── Auth helper ── */
  function isAuth(req,res,next){
    if(!req.isAuthenticated()) return res.redirect('/login');
    const m=req.user.guilds.find(g=>g.id===cfg.guildId);
    const ALLOWED=0x8n|0x20n;
    if(!m||!(BigInt(m.permissions)&ALLOWED)) return res.send('Keine Berechtigung');
    next();
  }

  /* ── Panel Nachricht builder ── */
  async function buildPanel(channelId,msgId=null){
    const guild   = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(channelId);
    const menu = new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions(cfg.topics);
    const payload = {
      embeds:[ new EmbedBuilder().setTitle('🎫 Ticket‑System').setDescription('Bitte Thema auswählen') ],
      components:[ new ActionRowBuilder().addComponents(menu) ]
    };
    if(msgId){
      const msg = await channel.messages.fetch(msgId);
      return msg.edit(payload);
    }
    const sent = await channel.send(payload);
    return sent.id;
  }

  /* ── Auth routes ── */
  router.get('/login', passport.authenticate('discord'));
  router.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect:'/' }), (_req,res)=>res.redirect('/panel'));

  /* ── Panel UI ── */
  router.get('/panel', isAuth, (req,res)=> res.render('panel', { cfg, msg:req.query.msg||null }) );

  /* Save topics/form fields */
  router.post('/panel', isAuth, (req,res)=>{
    try{
      cfg.topics     = JSON.parse(req.body.topics     || '[]');
      cfg.formFields = JSON.parse(req.body.formFields || '[]');
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    }catch(e){ res.redirect('/panel?msg=jsonerror'); }
  });

  /* Send new panel message */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try{
      const id = await buildPanel(req.body.channelId);
      cfg.panelChannelId=req.body.channelId;
      cfg.panelMessageId=id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    }catch(e){ res.redirect('/panel?msg=error'); }
  });

  /* Edit existing panel message */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId||!cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try{
      await buildPanel(cfg.panelChannelId,cfg.panelMessageId);
      res.redirect('/panel?msg=edited');
    }catch(e){ res.redirect('/panel?msg=error'); }
  });

  return router;
};
