/* Ticket‑Bot | Web‑Panel (Express) */
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const { Strategy } = require('passport-discord');
const fs        = require('fs');
const path      = require('path');

const CONFIG = path.join(__dirname, 'config.json');
const cfg     = require(CONFIG);
const app     = express();

/* ───── Passport‑Setup ───── */
passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((u, d) => d(null, u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',
  scope: ['identify', 'guilds', 'guilds.members.read']
}, (_a, _b, profile, done) => done(null, profile)));

app
  .set('view engine', 'ejs')
  .use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  }))
  .use(passport.initialize())
  .use(passport.session())
  .use(express.urlencoded({ extended: true }));

/* ───── Auth‑Middleware (nur Admins) ───── */
// panel.js
function isAuthorized (req, res, next) {
  // 1) überhaupt eingeloggt?
  if (!req.isAuthenticated()) return res.redirect('/login');

  // 2) Member-Objekt des Users im Ziel-Guild ermitteln
  const member = req.user.guilds.find(g => g.id === cfg.guildId);

  // 3) Berechtigung prüfen (Admin ODER „Server verwalten“)
  const ALLOWED = 0x8n | 0x20n;          // 0x8 = Administrator, 0x20 = Manage Guild
  if (!member || !(BigInt(member.permissions) & ALLOWED))
    return res.send('Keine Berechtigung');

  // alles gut → weiter
  next();
}


/* ───── Routen ───── */
app.get('/login', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (_req, res) => res.redirect('/panel')
);

app.get('/panel', isAuthorized, (_req, res) =>
  res.render('panel', { cfg })
);

app.post('/panel', isAuthorized, (req, res) => {
  const t = [];
  req.body.label.forEach((label, i) => {
    if (!label.trim()) return;
    t.push({
      label,
      value:  req.body.value[i]  || label.toLowerCase(),
      emoji:  req.body.emoji[i]  || ''
    });
  });
  cfg.topics = t;
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
  res.redirect('/panel');
});

module.exports = app;
