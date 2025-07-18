// --- panel.js | Router‑Factory mit Admin‑Auth + Panel‑Nachricht senden/bearbeiten ---
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const { Strategy } = require('passport-discord');
const fs        = require('fs');
const path      = require('path');
const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder
} = require('discord.js');

const CONFIG = path.join(__dirname, 'config.json');
let   cfg    = require(CONFIG);

/* ───── Passport‑Grundsetup ───── */
passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((u, d) => d(null, u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',
  scope: ['identify', 'guilds', 'guilds.members.read']
}, (_a, _b, profile, done) => done(null, profile)));

/* ───── Router‑Factory ───── */
module.exports = (client) => {
  const router = express.Router();

  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false
  }));
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({ extended: true }));

  /* ── Auth‑Middleware (Admin oder Manage Guild) ── */
  function isAuth(req, res, next) {
    if (!req.isAuthenticated()) return res.redirect('/login');
    const m = req.user.guilds.find(g => g.id === cfg.guildId);
    const ALLOWED = 0x8n | 0x20n;
    if (!m || !(BigInt(m.permissions) & ALLOWED)) return res.send('Keine Berechtigung');
    next();
  }

  /* ───── Discord Panel‑Nachricht posten ───── */
  async function sendPanelMessage(channelId) {
    const guild   = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(channelId);
    const menu = new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Wähle dein Thema …').addOptions(cfg.topics);
    await channel.send({
      embeds:[ new EmbedBuilder().setTitle('🎫 Ticket‑System').setDescription('Bitte Thema auswählen') ],
      components:[ new ActionRowBuilder().addComponents(menu) ]
    });
  }

  /* ── Auth Routen ── */
  router.get('/login', passport.authenticate('discord'));
  router.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect:'/' }), (_req,res)=>res.redirect('/panel'));

  /* ── Panel Hauptseite ── */
  router.get('/panel', isAuth, (_req, res) => res.render('panel', { cfg }));

  /* Update Themen/Formular */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg.topics     = JSON.parse(req.body.topics     || '[]');
      cfg.formFields = JSON.parse(req.body.formFields || '[]');
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel');
    } catch(e){ res.status(400).send('JSON Fehler'); }
  });

  /* ── Panel‑Nachricht senden (Button im Web) ── */
  router.post('/panel/send', isAuth, async (req,res)=>{
    const chanId = req.body.channelId || cfg.panelChannelId;
    try {
      await sendPanelMessage(chanId);
      res.redirect('/panel');
    } catch(err){ res.status(500).send('Fehler beim Senden: '+err.message); }
  });

  /* Ticket‑Übersicht */
  router.get('/tickets', isAuth, (_req,res)=>{
    const tickets = JSON.parse(fs.readFileSync(path.join(__dirname,'tickets.json'),'utf8'));
    res.render('tickets', { tickets });
  });

  return router;
};
