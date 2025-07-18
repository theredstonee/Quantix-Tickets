// --- panel.js | Router‑Factory mit Passport & Admin‑Auth ---
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const { Strategy } = require('passport-discord');
const fs        = require('fs');
const path      = require('path');

const CONFIG = path.join(__dirname, 'config.json');
let   cfg    = require(CONFIG);

/* ───── Passport‑Grundsetup (einmal global) ───── */
passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((u, d) => d(null, u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',   // relativ, da Router gemountet
  scope: ['identify', 'guilds', 'guilds.members.read']
}, (_a, _b, profile, done) => done(null, profile)));

/* ───── Router‑Factory ───── */
module.exports = (_client) => {
  const router = express.Router();

  /* View‑Engine ist im Haupt‑Express‑App bereits gesetzt */

  /* ── Middlewares ── */
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false
  }));
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({ extended: true }));

  /* ── Auth‑Check (Admin oder Manage Guild) ── */
  function isAuthorized(req, res, next) {
    if (!req.isAuthenticated()) return res.redirect('/login');
    const member = req.user.guilds.find(g => g.id === cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Administrator oder Manage Guild
    if (!member || !(BigInt(member.permissions) & ALLOWED))
      return res.send('Keine Berechtigung');
    next();
  }

  /* ── Routen ── */
  router.get('/login', passport.authenticate('discord'));

  router.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (_req, res) => res.redirect('/panel')
  );

  router.get('/panel', isAuthorized, (_req, res) => res.render('panel', { cfg }));

  router.post('/panel', isAuthorized, (req, res) => {
    try {
      cfg.topics     = JSON.parse(req.body.topics     || '[]');
      cfg.formFields = JSON.parse(req.body.formFields || '[]');
      fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
      res.redirect('/panel');
    } catch(err) {
      res.status(400).send('❌ JSON Fehler in Eingabefeldern');
    }
  });

  /* Tickets Übersicht (optional) */
  router.get('/tickets', isAuthorized, (_req,res)=>{
    const tickets = JSON.parse(fs.readFileSync(path.join(__dirname,'tickets.json'),'utf8'));
    res.render('tickets', { tickets });
  });

  return router; // wichtig!
};