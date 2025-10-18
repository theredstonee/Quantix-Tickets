require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getTranslations, t, getLanguageName } = require('./translations');
const cookieParser = require('cookie-parser');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { VERSION, COPYRIGHT } = require('./version.config');
const { handleAutoUpdate, showUpdateLog } = require('./auto-update');
const { isPremium, hasFeature, getPremiumTier, getPremiumInfo, activatePremium, deactivatePremium, renewPremium, downgradePremium, cancelPremium, PREMIUM_TIERS } = require('./premium');
const {
  sanitizeHtml,
  sanitizeText,
  sanitizeUrl,
  sanitizeEmail,
  sanitizeDiscordId,
  sanitizeColor,
  sanitizeNumber,
  sanitizeString,
  sanitizeJson,
  cspMiddleware,
  sanitizeBodyMiddleware,
  xssRateLimitMiddleware
} = require('./xss-protection');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false
});

function renderMarkdown(text){
  if(!text) return '';
  try {
    const html = marked.parse(text);
    return DOMPurify.sanitize(html);
  } catch(err) {
    console.error('Markdown Error:', err);
    return text;
  }
}

const CONFIG_DIR = path.join(__dirname, 'configs');
if(!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR);

const LEGACY_CONFIG = path.join(__dirname, 'config.json');

function readCfg(guildId){
  try {
    if(!guildId){
      try {
        const data = JSON.parse(fs.readFileSync(LEGACY_CONFIG,'utf8'));
        return data || {};
      } catch {
        return {};
      }
    }
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(configPath,'utf8'));
      return data || {};
    } catch {
      const defaultCfg = {
        guildId: guildId,
        topics: [],
        formFields: [],
        teamRoleId: '1387525699908272218',
        ticketEmbed: {
          title: '🎫 Ticket #{ticketNumber}',
          description: 'Hallo {userMention}\n**Thema:** {topicLabel}',
          color: '#2b90d9',
          footer: 'Quantix Tickets ©️'
        },
        panelEmbed: {
          title: '🎫 Ticket System',
          description: 'Wähle dein Thema',
          color: '#5865F2',
          footer: 'Quantix Tickets ©️'
        }
      };
      writeCfg(guildId, defaultCfg);
      return defaultCfg;
    }
  } catch(err) {
    console.error('readCfg error:', err);
    return {};
  }
}

function writeCfg(guildId, data){
  try {
    if(!guildId){
      fs.writeFileSync(LEGACY_CONFIG, JSON.stringify(data, null, 2));
      return;
    }
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  } catch(err) {
    console.error('writeCfg error:', err);
  }
}

let cfg = readCfg();

const BASE = process.env.PUBLIC_BASE_URL || '';

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: BASE ? `${BASE.replace(/\/$/,'')}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  async function logEvent(guildId, text, user){
    try {
      const cfg = readCfg(guildId);

      // Support both single ID and array of IDs
      const logChannelIds = Array.isArray(cfg.logChannelId)
        ? cfg.logChannelId
        : (cfg.logChannelId ? [cfg.logChannelId] : []);

      if(logChannelIds.length === 0) return;

      const guild = await client.guilds.fetch(guildId);

      const embed = new EmbedBuilder()
        .setDescription(text)
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ text: COPYRIGHT });

      if(user){
        embed.setAuthor({ name: `${user.username}`, iconURL: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined });
      }

      // Send to all configured log channels
      for(const channelId of logChannelIds){
        try {
          const ch = await guild.channels.fetch(channelId);
          if(ch) await ch.send({ embeds: [embed] });
        } catch(err) {
          console.error(`Log-Channel ${channelId} nicht gefunden:`, err.message);
        }
      }
    } catch(err) {
      console.error('Log Error:', err);
    }
  }

  router.use(cookieParser());
  router.use(cspMiddleware());
  router.use(xssRateLimitMiddleware);
  router.use(express.json({ limit: '1mb' }));
  router.use(express.urlencoded({ extended: true, limit: '1mb' }));
  router.use(sanitizeBodyMiddleware);
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: /^https:\/\//i.test(BASE),
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days - Auto-login
    }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));
  router.use(express.json());

  router.use((req, res, next) => {
    const guildId = req.session?.selectedGuild;
    let lang = 'de';

    if (guildId) {
      const cfg = readCfg(guildId);
      lang = cfg.language || 'de';
    } else {
      lang = req.cookies.lang || 'de';
    }

    res.locals.lang = lang;
    res.locals.t = getTranslations(lang);
    res.locals.renderMarkdown = renderMarkdown;
    next();
  });

  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    if(!req.session.selectedGuild) return res.redirect('/select-server');

    const guildId = req.session.selectedGuild;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    if(!entry) return res.status(403).send('Du bist nicht auf diesem Server oder der Bot ist nicht auf dem Server.');

    const ADMIN = 0x8n;
    if(!(BigInt(entry.permissions) & ADMIN)) {
      return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte auf diesem Server.');
    }

    next();
  }

  function isOwner(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    const OWNER_IDS = ['928901974106202113', '1159182333316968530', '1415387837359984740', '1048900200497954868'];
    const userId = req.user.id;

    if(!OWNER_IDS.includes(userId)) {
      return res.status(403).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zugriff verweigert - Nur für Owner</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
    }

    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
      background-size: 50px 50px;
      animation: bgMove 20s linear infinite;
      pointer-events: none;
    }

    @keyframes bgMove {
      0% { transform: translate(0, 0); }
      100% { transform: translate(50px, 50px); }
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    .container {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      padding: 3rem;
      border-radius: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      text-align: center;
      animation: slideIn 0.4s ease;
      position: relative;
      z-index: 1;
    }

    .icon {
      font-size: 5rem;
      margin-bottom: 1.5rem;
      display: inline-block;
      animation: bounce 2s infinite;
    }

    h1 {
      color: #2d3748;
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      font-weight: 700;
    }

    .subtitle {
      color: #718096;
      font-size: 1.1rem;
      margin-bottom: 2rem;
    }

    .info-box {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
      border: 2px solid rgba(102, 126, 234, 0.3);
      border-radius: 16px;
      padding: 1.5rem;
      margin: 2rem 0;
      text-align: left;
    }

    .info-box strong {
      display: block;
      color: #667eea;
      font-size: 1.2rem;
      margin-bottom: 1rem;
      text-align: center;
    }

    .info-box p {
      color: #4a5568;
      line-height: 1.6;
      margin-bottom: 1rem;
    }

    .info-box ul {
      list-style: none;
      padding: 0;
    }

    .info-box li {
      color: #4a5568;
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(102, 126, 234, 0.1);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .info-box li:last-child {
      border-bottom: none;
    }

    .info-box li i {
      color: #667eea;
      font-size: 1.2rem;
      width: 24px;
      text-align: center;
    }

    .btn-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-top: 2rem;
      flex-wrap: wrap;
    }

    .btn-group a {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.875rem 1.75rem;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s ease;
      font-size: 1rem;
    }

    .btn-group a:first-child {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    .btn-group a:first-child:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    .btn-group a.secondary {
      background: rgba(102, 126, 234, 0.1);
      color: #667eea;
      border: 2px solid rgba(102, 126, 234, 0.3);
    }

    .btn-group a.secondary:hover {
      background: rgba(102, 126, 234, 0.2);
      border-color: rgba(102, 126, 234, 0.5);
      transform: translateY(-2px);
    }

    @media (max-width: 640px) {
      .container {
        padding: 2rem 1.5rem;
      }

      h1 {
        font-size: 2rem;
      }

      .icon {
        font-size: 4rem;
      }

      .btn-group {
        flex-direction: column;
      }

      .btn-group a {
        width: 100%;
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔒</div>
    <h1>Zugriff verweigert</h1>
    <p class="subtitle">Nur für Owner zugänglich</p>

    <div class="info-box">
      <strong><i class="fas fa-crown"></i> Owner-Bereich</strong>
      <p>Dieser Bereich enthält administrative Funktionen, die nur den Ownern des Bots zur Verfügung stehen:</p>
      <ul>
        <li><i class="fas fa-server"></i> Server-Verwaltung & Blacklist</li>
        <li><i class="fas fa-chart-line"></i> System-Statistiken</li>
        <li><i class="fas fa-shield-alt"></i> Sicherheitseinstellungen</li>
      </ul>
    </div>

    <div class="btn-group">
      <a href="/" class="secondary">
        <i class="fas fa-home"></i>
        Zur Startseite
      </a>
      <a href="/panel">
        <i class="fas fa-cog"></i>
        Zum Panel
      </a>
    </div>
  </div>
</body>
</html>
      `);
    }

    next();
  }

  // Middleware für Zugriff mit Admin ODER Team-Rolle
  // Founder-only middleware (restricted to 2 specific IDs)
  function isFounder(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    const FOUNDER_IDS = ['1048900200497954868', '1159182333316968530'];
    const userId = req.user.id;

    if(!FOUNDER_IDS.includes(userId)) {
      return res.status(403).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zugriff verweigert - Nur für Gründer</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
    }

    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%);
      pointer-events: none;
    }

    .container {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      padding: 3rem;
      border-radius: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      text-align: center;
      position: relative;
      z-index: 1;
      animation: slideIn 0.4s ease;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .icon {
      font-size: 5rem;
      margin-bottom: 1.5rem;
      display: inline-block;
      animation: bounce 2s infinite;
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    h1 {
      font-size: 2.5rem;
      color: #667eea;
      margin-bottom: 1rem;
      font-weight: 700;
    }

    .subtitle {
      font-size: 1.3rem;
      color: #333;
      margin-bottom: 2rem;
      font-weight: 600;
    }

    p {
      font-size: 1.1rem;
      color: #666;
      line-height: 1.6;
      margin-bottom: 2rem;
    }

    .info-box {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
      border-left: 4px solid #667eea;
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      text-align: left;
    }

    .info-box strong {
      color: #667eea;
      display: block;
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
    }

    .info-box ul {
      list-style: none;
      margin-top: 1rem;
    }

    .info-box li {
      padding: 0.5rem 0;
      color: #555;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .info-box li i {
      color: #667eea;
      font-size: 1.2rem;
    }

    .btn-group {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    a {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      transition: all 0.3s;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    a:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }

    a.secondary {
      background: white;
      color: #667eea;
      border: 2px solid #667eea;
      box-shadow: none;
    }

    a.secondary:hover {
      background: #667eea;
      color: white;
    }

    @media (max-width: 768px) {
      .container {
        padding: 2rem;
      }

      h1 {
        font-size: 2rem;
      }

      .subtitle {
        font-size: 1.1rem;
      }

      .icon {
        font-size: 4rem;
      }

      .btn-group {
        flex-direction: column;
      }

      a {
        width: 100%;
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔒</div>
    <h1>Zugriff verweigert</h1>
    <p class="subtitle">Nur für Gründer zugänglich</p>

    <p>Diese Seite ist ausschließlich für die Gründer des Quantix Tickets Bots reserviert.</p>

    <div class="info-box">
      <strong><i class="fas fa-crown"></i> Gründer-Bereich</strong>
      <p style="margin: 0; color: #666;">
        Dieser Bereich enthält administrative Funktionen, die nur den Gründern des Bots zur Verfügung stehen:
      </p>
      <ul>
        <li><i class="fas fa-server"></i> Server-Verwaltung & Blacklist</li>
        <li><i class="fas fa-gem"></i> Premium-Verwaltung</li>
        <li><i class="fas fa-chart-line"></i> System-Statistiken</li>
        <li><i class="fas fa-shield-alt"></i> Sicherheitseinstellungen</li>
      </ul>
    </div>

    <div class="btn-group">
      <a href="/" class="secondary">
        <i class="fas fa-home"></i>
        Zur Startseite
      </a>
      <a href="/panel">
        <i class="fas fa-cog"></i>
        Zum Panel
      </a>
    </div>
  </div>
</body>
</html>
      `);
    }

    next();
  }

  async function isAuthOrTeam(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    if(!req.session.selectedGuild) return res.redirect('/select-server');

    const guildId = req.session.selectedGuild;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    if(!entry) return res.status(403).send('Du bist nicht auf diesem Server oder der Bot ist nicht auf dem Server.');

    const ADMIN = 0x8n;
    const isAdmin = (BigInt(entry.permissions) & ADMIN) === ADMIN;

    // Admin hat immer Zugriff
    if(isAdmin) {
      req.isAdmin = true; // Flag für Templates
      return next();
    }

    // Prüfe ob User Team-Rolle hat
    try {
      const cfg = readCfg(guildId);
      if(!cfg.teamRoleId) {
        return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte oder die Team-Rolle.');
      }

      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(req.user.id);

      if(member.roles.cache.has(cfg.teamRoleId)) {
        req.isAdmin = false; // Team-Mitglied, kein Admin
        return next();
      }

      return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte oder die Team-Rolle.');
    } catch(err) {
      console.error('Team Role Check Error:', err);
      return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte oder die Team-Rolle.');
    }
  }

  router.get('/', (req,res)=>{
    const lang = req.cookies.lang || 'de';
    const isAuthenticated = req.isAuthenticated && req.isAuthenticated();

    let totalGuilds = 0;
    let totalTickets = 0;

    try {
      const configFiles = fs.readdirSync('./configs').filter(f =>
        f.endsWith('.json') && !f.includes('_tickets') && !f.includes('_counter')
      );
      totalGuilds = configFiles.length;

      const ticketFiles = fs.readdirSync('./configs').filter(f => f.includes('_tickets.json'));
      for (const file of ticketFiles) {
        try {
          const tickets = JSON.parse(fs.readFileSync(`./configs/${file}`, 'utf8'));
          totalTickets += tickets.length || 0;
        } catch(err) {}
      }
    } catch(err) {
      console.error('Error calculating stats:', err);
    }

    // Load feedbacks
    let feedbacks = [];
    try {
      const feedbackFile = './feedback.json';
      if (fs.existsSync(feedbackFile)) {
        feedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
        // Sort by timestamp (newest first) and limit to 6
        feedbacks = feedbacks
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 6);
      }
    } catch(err) {
      console.error('Error loading feedbacks:', err);
    }

    res.render('home', {
      lang: lang,
      t: getTranslations(lang),
      user: isAuthenticated ? req.user : null,
      isAuthenticated: isAuthenticated,
      totalGuilds: totalGuilds || 150,
      totalTickets: totalTickets || 5000,
      feedbacks: feedbacks
    });
  });

  router.get('/terms-of-service', (req, res) => {
    const lang = req.cookies.lang || 'de';
    res.render('terms-of-service', {
      t: getTranslations(lang),
      lang: lang
    });
  });

  router.get('/privacy-policy', (req, res) => {
    const lang = req.cookies.lang || 'de';
    res.render('privacy-policy', {
      t: getTranslations(lang),
      lang: lang
    });
  });

  router.get('/invite', (req, res) => {
    const lang = req.cookies.lang || 'de';
    const isAuthenticated = req.isAuthenticated && req.isAuthenticated();

    // Bot Invite Link mit allen benötigten Permissions
    const permissions = '8'; // Administrator
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands`;

    res.render('invite', {
      t: getTranslations(lang),
      lang: lang,
      user: isAuthenticated ? req.user : null,
      isAuthenticated: isAuthenticated,
      inviteUrl: inviteUrl
    });
  });

  router.get('/feedback', (req, res) => {
    const lang = req.cookies.lang || 'de';
    const isAuthenticated = req.isAuthenticated && req.isAuthenticated();

    // Feedback requires authentication
    if (!isAuthenticated) {
      return res.redirect('/login?redirect=/feedback');
    }

    res.render('feedback', {
      t: getTranslations(lang),
      lang: lang,
      user: req.user,
      isAuthenticated: true,
      success: req.query.success === 'true',
      error: req.query.error === 'true'
    });
  });

  router.post('/feedback', async (req, res) => {
    try {
      const isAuthenticated = req.isAuthenticated && req.isAuthenticated();

      // Feedback requires authentication
      if (!isAuthenticated) {
        return res.redirect('/login?redirect=/feedback');
      }

      const { name, email, type, message, rating } = req.body;

      // Validation (email is now optional)
      if (!name || !type || !message || !rating) {
        return res.redirect('/feedback?error=true');
      }

      const ratingNum = parseInt(rating);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.redirect('/feedback?error=true');
      }

      const feedback = {
        id: Date.now().toString(),
        name: name.trim(),
        email: email ? email.trim() : '',
        type: type,
        rating: ratingNum,
        message: message.trim(),
        userId: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : null,
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress
      };

      // Save to JSON file
      const feedbackFile = './feedback.json';
      let feedbacks = [];

      try {
        if (fs.existsSync(feedbackFile)) {
          feedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
        }
      } catch(err) {
        console.error('Error reading feedback file:', err);
      }

      feedbacks.push(feedback);
      fs.writeFileSync(feedbackFile, JSON.stringify(feedbacks, null, 2));

      console.log('📬 New Feedback received:', feedback);

      res.redirect('/feedback?success=true');
    } catch(err) {
      console.error('Feedback submission error:', err);
      res.redirect('/feedback?error=true');
    }
  });

  router.get('/all-feedbacks', (req, res) => {
    const lang = req.cookies.lang || 'de';
    const isAuthenticated = req.isAuthenticated && req.isAuthenticated();

    let feedbacks = [];
    try {
      const feedbackFile = './feedback.json';
      if (fs.existsSync(feedbackFile)) {
        feedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
        feedbacks = feedbacks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }
    } catch(err) {
      console.error('Error loading feedbacks:', err);
    }

    res.render('all-feedbacks', {
      t: getTranslations(lang),
      lang: lang,
      user: isAuthenticated ? req.user : null,
      isAuthenticated: isAuthenticated,
      feedbacks: feedbacks
    });
  });

  router.get('/imprint', (req, res) => {
    const lang = req.cookies.lang || 'de';
    res.render('imprint', {
      t: getTranslations(lang),
      lang: lang
    });
  });

  router.get('/select-server', async (req,res)=>{
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    try {
      const botGuilds = await client.guilds.fetch();
      const botGuildIds = new Set(botGuilds.map(g => g.id));

      const ADMIN = 0x8n;

      // Sammle ALLE Server mit Admin-Rechten (auch ohne Bot)
      const adminServers = (req.user.guilds || [])
        .filter(g => {
          const isAdmin = (BigInt(g.permissions) & ADMIN) === ADMIN;
          return isAdmin;
        })
        .map(g => ({
          ...g,
          hasBot: botGuildIds.has(g.id)
        }));

      // Sammle Server mit Team-Rolle (aber ohne Admin, nur mit Bot)
      const teamServers = [];
      for (const guildData of (req.user.guilds || [])) {
        const hasBot = botGuildIds.has(guildData.id);
        const isAdmin = (BigInt(guildData.permissions) & ADMIN) === ADMIN;

        // Skip wenn bereits Admin oder Bot nicht auf dem Server
        if (!hasBot || isAdmin) continue;

        try {
          const cfg = readCfg(guildData.id);
          if (!cfg.teamRoleId) continue;

          const guild = await client.guilds.fetch(guildData.id);
          const member = await guild.members.fetch(req.user.id).catch(() => null);

          if (member && member.roles.cache.has(cfg.teamRoleId)) {
            teamServers.push({
              ...guildData,
              hasBot: true
            });
          }
        } catch (err) {
          console.error(`Error checking team role for guild ${guildData.id}:`, err);
        }
      }

      // Kombiniere beide Listen
      const allServers = [...adminServers, ...teamServers];

      const availableServers = allServers.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
        hasBot: g.hasBot || false
      }));

      // Bot Invite Link
      const permissions = '8'; // Administrator
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=${permissions}&scope=bot%20applications.commands`;

      res.render('select-server', {
        servers: availableServers,
        version: VERSION,
        currentGuild: req.session.selectedGuild || null,
        user: req.user,
        inviteUrl: inviteUrl,
        installUrl: 'https://tickets.quantix-bot.de/install',
        clientId: process.env.CLIENT_ID,
        t: res.locals.t
      });
    } catch(err){
      console.error('Server-Auswahl Fehler:', err);
      res.status(500).send('Fehler beim Laden der Server');
    }
  });

  router.post('/select-server', async (req,res)=>{
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    const guildId = req.body.guildId;
    if(!guildId) return res.redirect('/select-server');

    const ADMIN = 0x8n;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    if(!entry) {
      return res.status(403).send('Du bist nicht auf diesem Server.');
    }

    const isAdmin = (BigInt(entry.permissions) & ADMIN) === ADMIN;

    // Wenn Admin, direkt erlauben
    if(isAdmin) {
      req.session.selectedGuild = guildId;
      return res.redirect('/panel');
    }

    // Prüfe ob Team-Mitglied
    try {
      const cfg = readCfg(guildId);
      if(!cfg.teamRoleId) {
        return res.status(403).send('Keine Administrator-Rechte oder Team-Rolle auf diesem Server.');
      }

      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(req.user.id).catch(() => null);

      if(member && member.roles.cache.has(cfg.teamRoleId)) {
        req.session.selectedGuild = guildId;
        return res.redirect('/panel');
      }

      return res.status(403).send('Keine Administrator-Rechte oder Team-Rolle auf diesem Server.');
    } catch(err) {
      console.error('Team Role Check Error:', err);
      return res.status(403).send('Keine Administrator-Rechte oder Team-Rolle auf diesem Server.');
    }
  });

  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()){
      // Check if user already has a selected server
      if(req.session.selectedGuild){
        return res.redirect('/panel');
      }
      return res.redirect('/select-server');
    }
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitte warten...</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #667eea;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    <h1>⏳ Bitte warten...</h1>
    <p>Zu viele Login-Versuche. Bitte kurz warten.</p>
    <a href="/">← Zurück zur Startseite</a>
  </div>
</body>
</html>
      `);
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);

        // Check for rate limit error
        if(err.code === 'invalid_request' || (err.message && err.message.includes('rate limit'))) {
          return res.status(429).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rate Limit - Zu viele Anfragen</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      max-width: 600px;
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    p { font-size: 1.1rem; line-height: 1.6; margin: 1rem 0; }
    .countdown {
      font-size: 3rem;
      font-weight: bold;
      margin: 2rem 0;
      color: #fff;
    }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #ff6b6b;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
    .warning {
      background: rgba(255,255,255,0.2);
      padding: 1rem;
      border-radius: 10px;
      margin-top: 1rem;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⏳ Discord OAuth Rate Limit</h1>
    <p><strong>Zu viele Login-Versuche!</strong></p>
    <p>Du hast Discord's Rate Limit erreicht durch zu viele Anmeldeversuche in kurzer Zeit.</p>

    <div class="countdown" id="countdown">5:00</div>

    <div class="warning">
      <strong>⚠️ Wichtig:</strong><br>
      Bitte warte 5-10 Minuten, bevor du dich erneut anmeldest.<br>
      Weitere Versuche können die Wartezeit verlängern!
    </div>

    <p style="font-size: 0.9rem; opacity: 0.8; margin-top: 2rem;">
      Dieser Schutz ist von Discord, nicht vom Bot.
    </p>

    <a href="/">← Zurück zur Startseite</a>
  </div>

  <script>
    let seconds = 300; // 5 minutes
    const countdownEl = document.getElementById('countdown');

    setInterval(() => {
      if (seconds > 0) {
        seconds--;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        countdownEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      } else {
        countdownEl.textContent = 'Bereit!';
        countdownEl.style.color = '#00ff88';
      }
    }, 1000);
  </script>
</body>
</html>
          `);
        }

        if(err.oauthError) return res.status(429).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rate Limit</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #ff6b6b;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    <h1>⏳ Rate Limit</h1>
    <p>Bitte kurz warten und erneut versuchen.</p>
    <a href="/">← Zurück zur Startseite</a>
  </div>
</body>
</html>
        `);
        return res.status(500).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OAuth Fehler</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #ff6b6b;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ OAuth Fehler</h1>
    <p>Es gab ein Problem bei der Anmeldung.</p>
    <a href="/">← Zurück zur Startseite</a>
  </div>
</body>
</html>
        `);
      }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{
        if(e){ console.error('Session Fehler:', e); return res.status(500).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Fehler</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #ff6b6b;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Session Fehler</h1>
    <p>Es gab ein Problem beim Erstellen der Session.</p>
    <a href="/">← Zurück zur Startseite</a>
  </div>
</body>
</html>
        `); }

        // Show loading animation and redirect
        res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erfolgreich angemeldet</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      overflow: hidden;
    }

    .container {
      text-align: center;
      background: rgba(255,255,255,0.05);
      padding: 4rem 3rem;
      border-radius: 30px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      border: 1px solid rgba(0,255,136,0.2);
      max-width: 500px;
      width: 90%;
    }

    .success-icon {
      font-size: 5rem;
      margin-bottom: 1.5rem;
      animation: pulse 1.5s ease-in-out infinite;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: #00ff88;
    }

    p {
      font-size: 1.1rem;
      opacity: 0.8;
      margin-bottom: 2rem;
    }

    .loader {
      width: 50px;
      height: 50px;
      border: 5px solid rgba(0,255,136,0.1);
      border-top: 5px solid #00ff88;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 2rem auto;
    }

    .redirect-text {
      font-size: 0.9rem;
      opacity: 0.6;
      margin-top: 1rem;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }

    @media (max-width: 768px) {
      .container {
        padding: 3rem 2rem;
      }

      h1 { font-size: 1.5rem; }
      p { font-size: 1rem; }
      .success-icon { font-size: 4rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <h1>Erfolgreich angemeldet!</h1>
    <p>Willkommen zurück! Du wirst weitergeleitet...</p>
    <div class="loader"></div>
    <p class="redirect-text">Automatische Weiterleitung in wenigen Sekunden</p>
  </div>

  <script>
    setTimeout(() => {
      window.location.href = '/select-server';
    }, 1500);
  </script>
</body>
</html>
        `);
      });
    })(req,res,next);
  });

  router.get('/logout', (req, res) => {
    // Logout-Seite HTML Template
    const logoutPage = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Abgemeldet - Quantix Tickets</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      overflow: hidden;
    }

    .container {
      text-align: center;
      background: rgba(255,255,255,0.05);
      padding: 4rem 3rem;
      border-radius: 30px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      border: 1px solid rgba(0,255,136,0.2);
      max-width: 500px;
      width: 90%;
      animation: fadeIn 0.5s ease-in-out;
    }

    .logout-icon {
      font-size: 5rem;
      margin-bottom: 1.5rem;
      animation: slideDown 0.6s ease-out;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: #00ff88;
      animation: fadeIn 0.8s ease-in-out;
    }

    p {
      font-size: 1.1rem;
      opacity: 0.8;
      margin-bottom: 2rem;
      animation: fadeIn 1s ease-in-out;
    }

    .checkmark {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 4px solid #00ff88;
      margin: 0 auto 2rem;
      position: relative;
      animation: scaleIn 0.5s ease-out;
    }

    .checkmark::after {
      content: '';
      position: absolute;
      top: 20px;
      left: 25px;
      width: 15px;
      height: 30px;
      border: solid #00ff88;
      border-width: 0 4px 4px 0;
      transform: rotate(45deg);
      animation: checkmark 0.5s 0.3s ease-out forwards;
      opacity: 0;
    }

    .redirect-text {
      font-size: 0.9rem;
      opacity: 0.6;
      margin-top: 1rem;
      animation: fadeIn 1.2s ease-in-out;
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: rgba(0,255,136,0.2);
      border-radius: 2px;
      margin-top: 2rem;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #00ff88;
      width: 0%;
      animation: progress 2s linear forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideDown {
      from {
        transform: translateY(-50px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @keyframes scaleIn {
      from {
        transform: scale(0);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    @keyframes checkmark {
      from {
        opacity: 0;
        transform: rotate(45deg) scale(0);
      }
      to {
        opacity: 1;
        transform: rotate(45deg) scale(1);
      }
    }

    @keyframes progress {
      from { width: 0%; }
      to { width: 100%; }
    }

    @media (max-width: 768px) {
      .container {
        padding: 3rem 2rem;
      }

      h1 { font-size: 1.5rem; }
      p { font-size: 1rem; }
      .logout-icon { font-size: 4rem; }
      .checkmark {
        width: 60px;
        height: 60px;
      }
      .checkmark::after {
        top: 15px;
        left: 20px;
        width: 12px;
        height: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logout-icon">👋</div>
    <div class="checkmark"></div>
    <h1>Erfolgreich abgemeldet!</h1>
    <p>Du wurdest sicher abgemeldet. Bis bald!</p>
    <p class="redirect-text">Du wirst zur Startseite weitergeleitet...</p>
    <div class="progress-bar">
      <div class="progress-fill"></div>
    </div>
  </div>

  <script>
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  </script>
</body>
</html>
    `;

    // Schritt 1: Passport logout (falls vorhanden)
    if (req.logout) {
      req.logout((logoutErr) => {
        if (logoutErr) {
          console.error('Logout error:', logoutErr);
        }

        // Schritt 2: Session zerstören (nach Passport logout)
        if (req.session) {
          req.session.destroy((destroyErr) => {
            if (destroyErr) {
              console.error('Session destroy error:', destroyErr);
            }
            // Schritt 3: Response senden (nach Session destroy)
            res.send(logoutPage);
          });
        } else {
          // Keine Session vorhanden, direkt Response senden
          res.send(logoutPage);
        }
      });
    } else {
      // Kein Passport logout, nur Session zerstören
      if (req.session) {
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            console.error('Session destroy error:', destroyErr);
          }
          res.send(logoutPage);
        });
      } else {
        // Weder Passport noch Session, direkt Response
        res.send(logoutPage);
      }
    }
  });

  router.get('/set-user-language/:lang', (req, res) => {
    const lang = ['de', 'en', 'he', 'ja', 'ru', 'pt', 'es', 'id', 'zh', 'ar'].includes(req.params.lang) ? req.params.lang : 'de';
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, path: '/' });
    res.redirect('/');
  });

  router.get('/set-language/:lang', isAuth, async (req, res) => {
    const lang = ['de', 'en', 'he', 'ja', 'ru', 'pt', 'es', 'id', 'zh', 'ar'].includes(req.params.lang) ? req.params.lang : 'de';
    const guildId = req.session.selectedGuild;

    if (guildId) {
      const cfg = readCfg(guildId);
      cfg.language = lang;
      writeCfg(guildId, cfg);

      const langName = getLanguageName(lang);
      await logEvent(guildId, t(guildId, 'logs.language_changed', { language: langName }), req.user);
    }

    res.redirect(req.get('referer') || '/panel');
  });

  router.get('/panel', isAuthOrTeam, async (req,res)=>{
    const guildId = req.session.selectedGuild;
    const cfg = readCfg(guildId);

    // Auto-Migration: Convert old flat embed fields to nested structure
    let needsSave = false;
    if (!cfg.ticketEmbed) {
      cfg.ticketEmbed = {
        title: cfg.embedTitle || '',
        description: cfg.embedDescription || '',
        color: cfg.embedColor || '#0ea5e9',
        footer: cfg.embedFooter || ''
      };
      // Clean up old fields
      delete cfg.embedTitle;
      delete cfg.embedDescription;
      delete cfg.embedColor;
      delete cfg.embedFooter;
      needsSave = true;
    }
    if (!cfg.panelEmbed) {
      cfg.panelEmbed = {
        title: cfg.panelTitle || '',
        description: cfg.panelDescription || '',
        color: cfg.panelColor || '#5865F2',
        footer: cfg.panelFooter || ''
      };
      // Clean up old fields
      delete cfg.panelTitle;
      delete cfg.panelDescription;
      delete cfg.panelColor;
      delete cfg.panelFooter;
      needsSave = true;
    }
    if (needsSave) {
      writeCfg(guildId, cfg);
    }

    let channels = [];
    let roles = [];
    let guildName = 'Server';
    try {
      const guild = await client.guilds.fetch(guildId);
      guildName = guild.name;

      const fetchedChannels = await guild.channels.fetch();
      channels = fetchedChannels
        .filter(ch => ch.type === 0 || ch.type === 4)
        .map(ch => ({ id: ch.id, name: ch.name, type: ch.type }))
        .sort((a,b) => a.name.localeCompare(b.name));

      const fetchedRoles = await guild.roles.fetch();
      roles = fetchedRoles
        .filter(r => r.id !== guild.id)
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
        .sort((a,b) => a.name.localeCompare(b.name));
    } catch(err) {
      console.error('Fehler beim Laden der Channels/Rollen:', err);
    }

    const premiumInfo = getPremiumInfo(guildId);

    res.render('panel', {
      cfg,
      msg: req.query.msg||null,
      channels,
      roles,
      version: VERSION,
      guildName,
      guildId,
      premiumTier: premiumInfo.tier,
      premiumTierName: premiumInfo.tierName,
      isPremium: premiumInfo.isActive,
      isAdmin: req.isAdmin, // Flag ob User Admin ist oder nur Team-Mitglied
      user: req.user, // User object for display
      t: res.locals.t, // Translation object
      lang: res.locals.lang // Language code
    });
  });

  router.post('/panel', isAuth, async (req,res)=>{
    // Check if user is admin (not just team member)
    const guildId = req.session.selectedGuild;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    const ADMIN = 0x8n;
    const isAdmin = entry && (BigInt(entry.permissions) & ADMIN) === ADMIN;

    if (!isAdmin) {
      return res.status(403).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keine Berechtigung</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      max-width: 600px;
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    p { font-size: 1.1rem; line-height: 1.6; margin: 1rem 0; }
    .icon { font-size: 5rem; margin-bottom: 1rem; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #f39c12;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
    .info-box {
      background: rgba(255,255,255,0.2);
      padding: 1rem;
      border-radius: 10px;
      margin-top: 1.5rem;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">👁️</div>
    <h1>Nur-Lese-Modus</h1>
    <p><strong>Du hast keine Berechtigung, Einstellungen zu ändern!</strong></p>
    <p>Du bist als <strong>Team-Mitglied</strong> angemeldet und kannst nur Einstellungen ansehen.</p>

    <div class="info-box">
      <strong>💡 Hinweis:</strong><br>
      Nur Server-Administratoren können Einstellungen bearbeiten.<br>
      Wenn du Änderungen vornehmen musst, kontaktiere einen Administrator.
    </div>

    <a href="/panel">← Zurück zum Panel</a>
  </div>
</body>
</html>
      `);
    }

    try {
      const cfg = readCfg(guildId);

      cfg.guildId = guildId;

      // Multi-Select Support: Convert to arrays
      cfg.ticketCategoryId = Array.isArray(req.body.ticketCategoryId)
        ? req.body.ticketCategoryId.filter(id => id && id.trim()).map(id => sanitizeDiscordId(id) || id.trim())
        : (req.body.ticketCategoryId ? [sanitizeDiscordId(req.body.ticketCategoryId) || req.body.ticketCategoryId.trim()] : []);

      cfg.logChannelId = Array.isArray(req.body.logChannelId)
        ? req.body.logChannelId.filter(id => id && id.trim()).map(id => sanitizeDiscordId(id) || id.trim())
        : (req.body.logChannelId ? [sanitizeDiscordId(req.body.logChannelId) || req.body.logChannelId.trim()] : []);

      cfg.transcriptChannelId = Array.isArray(req.body.transcriptChannelId)
        ? req.body.transcriptChannelId.filter(id => id && id.trim()).map(id => sanitizeDiscordId(id) || id.trim())
        : (req.body.transcriptChannelId ? [sanitizeDiscordId(req.body.transcriptChannelId) || req.body.transcriptChannelId.trim()] : []);

      cfg.teamRoleId = Array.isArray(req.body.teamRoleId)
        ? req.body.teamRoleId.filter(id => id && id.trim()).map(id => sanitizeDiscordId(id) || id.trim())
        : (req.body.teamRoleId ? [sanitizeDiscordId(req.body.teamRoleId) || req.body.teamRoleId.trim()] : []);

      if(!cfg.priorityRoles) cfg.priorityRoles = {'0':[], '1':[], '2':[]};

      cfg.priorityRoles['0'] = Array.isArray(req.body.priorityRoles_0)
        ? req.body.priorityRoles_0.filter(r => r && r.trim())
        : (req.body.priorityRoles_0 ? [req.body.priorityRoles_0.trim()] : []);

      cfg.priorityRoles['1'] = Array.isArray(req.body.priorityRoles_1)
        ? req.body.priorityRoles_1.filter(r => r && r.trim())
        : (req.body.priorityRoles_1 ? [req.body.priorityRoles_1.trim()] : []);

      cfg.priorityRoles['2'] = Array.isArray(req.body.priorityRoles_2)
        ? req.body.priorityRoles_2.filter(r => r && r.trim())
        : (req.body.priorityRoles_2 ? [req.body.priorityRoles_2.trim()] : []);

      if(req.body.githubWebhookChannelId){
        cfg.githubWebhookChannelId = req.body.githubWebhookChannelId.trim();
      } else {
        cfg.githubWebhookChannelId = null;
      }

      // Email-Benachrichtigungen (Pro Feature)
      if(req.body.notificationEmail){
        const email = sanitizeEmail(req.body.notificationEmail);
        cfg.notificationEmail = email || null;
      } else {
        cfg.notificationEmail = null;
      }

      // Auto-Close System (Pro Feature)
      cfg.autoCloseEnabled = req.body.autoCloseEnabled === 'on';
      if(req.body.autoCloseDays){
        cfg.autoCloseDays = sanitizeNumber(req.body.autoCloseDays, 1, 365);
      }

      // Custom Bot-Avatar (Basic+ Feature)
      if(req.body.customAvatarUrl){
        const url = sanitizeUrl(req.body.customAvatarUrl);
        cfg.customAvatarUrl = url || null;
      } else {
        cfg.customAvatarUrl = null;
      }

      // Discord DM-Benachrichtigungen (Pro Feature)
      if(req.body.dmNotificationUsers){
        const userIdsText = sanitizeString(req.body.dmNotificationUsers, 10000);
        if(userIdsText){
          // Parse User-IDs (eine pro Zeile)
          const userIds = userIdsText
            .split('\n')
            .map(id => sanitizeDiscordId(id))
            .filter(id => id); // Filter empty strings
          cfg.dmNotificationUsers = userIds;
        } else {
          cfg.dmNotificationUsers = [];
        }
      } else {
        cfg.dmNotificationUsers = [];
      }

      const labelInputs = [].concat(req.body.label||[]);
      const valueInputs = [].concat(req.body.value||[]);
      const emojiInputs = [].concat(req.body.emoji||[]);
      let tableTopics = [];
      for(let i=0;i<labelInputs.length;i++){
        const L=(labelInputs[i]||'').trim();
        if(!L) continue;
        const V=(valueInputs[i]||'').trim() || L.toLowerCase().replace(/\s+/g,'-');
        const E=(emojiInputs[i]||'').trim();
        tableTopics.push({ label:L, value:V, emoji:E||undefined });
      }
      if(tableTopics.length>0){
        cfg.topics = tableTopics;
      } else {
        const rawJson=(req.body.topicsJson||'').trim();
        if(rawJson){ try{ const parsed=JSON.parse(rawJson); if(Array.isArray(parsed)) cfg.topics=parsed; }catch{} }
        if(!Array.isArray(cfg.topics)) cfg.topics = [];
      }

      // Process form fields from individual inputs
      const formFields = [];
      let fieldIndex = 0;
      while(true) {
        const labelKey = `formField_label_${fieldIndex}`;
        const placeholderKey = `formField_placeholder_${fieldIndex}`;
        const styleKey = `formField_style_${fieldIndex}`;
        const requiredKey = `formField_required_${fieldIndex}`;
        const topicKey = `formField_topic_${fieldIndex}`;

        // Check if field exists
        if(!Object.prototype.hasOwnProperty.call(req.body, labelKey)) {
          break;
        }

        const label = (req.body[labelKey] || '').trim();
        if(!label) {
          fieldIndex++;
          continue;
        }

        const placeholder = (req.body[placeholderKey] || '').trim();
        const style = req.body[styleKey] || 'short';
        const required = req.body[requiredKey] === 'on';

        // Handle topic selection (can be array or single value)
        let topic = req.body[topicKey];
        if(Array.isArray(topic)) {
          // Filter out empty values
          topic = topic.filter(t => t && t.trim());
          if(topic.length === 0 || (topic.length === 1 && topic[0] === '')) {
            topic = null;
          }
        } else if(topic === '' || !topic) {
          topic = null;
        }

        formFields.push({
          label: label,
          placeholder: placeholder || '',
          style: style,
          required: required,
          topic: topic,
          id: `field_${fieldIndex}`
        });

        fieldIndex++;
      }

      cfg.formFields = formFields;

      const ensureHex = (s, fallback) => {
        const str = (s ?? '').toString().trim();
        if(/^#?[0-9a-fA-F]{6}$/.test(str)){ return str.startsWith('#') ? str : '#'+str; }
        const fb = (fallback ?? '').toString().trim() || '#2b90d9';
        return fb.startsWith('#') ? fb : '#'+fb;
      };
      const take = (bodyKey, current) => (
        Object.prototype.hasOwnProperty.call(req.body, bodyKey) ? req.body[bodyKey] : (current ?? '')
      );

      const prevTE = cfg.ticketEmbed || {};
      cfg.ticketEmbed = {
        title:       sanitizeString(take('embedTitle',       prevTE.title), 256),
        description: sanitizeString(take('embedDescription', prevTE.description), 4096),
        color:       ensureHex(take('embedColor', prevTE.color), '#2b90d9'),
        footer:      sanitizeString(take('embedFooter',      prevTE.footer), 2048)
      };

      const prevPE = cfg.panelEmbed || {};
      cfg.panelEmbed = {
        title:       sanitizeString(take('panelTitle',       prevPE.title), 256),
        description: sanitizeString(take('panelDescription', prevPE.description), 4096),
        color:       ensureHex(take('panelColor', prevPE.color), '#5865F2'),
        footer:      sanitizeString(take('panelFooter',      prevPE.footer), 2048)
      };

      writeCfg(guildId, cfg);

      await logEvent(guildId, t(guildId, 'logs.config_updated'), req.user);

      res.redirect('/panel?msg=saved');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  router.post('/panel/send', isAuth, async (req,res)=>{
    // Check if user is admin (not just team member)
    const guildId = req.session.selectedGuild;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    const ADMIN = 0x8n;
    const isAdmin = entry && (BigInt(entry.permissions) & ADMIN) === ADMIN;

    if (!isAdmin) {
      return res.status(403).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keine Berechtigung</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      max-width: 600px;
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    p { font-size: 1.1rem; line-height: 1.6; margin: 1rem 0; }
    .icon { font-size: 5rem; margin-bottom: 1rem; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #f39c12;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
    .info-box {
      background: rgba(255,255,255,0.2);
      padding: 1rem;
      border-radius: 10px;
      margin-top: 1.5rem;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">👁️</div>
    <h1>Nur-Lese-Modus</h1>
    <p><strong>Du hast keine Berechtigung, das Panel zu senden!</strong></p>
    <p>Du bist als <strong>Team-Mitglied</strong> angemeldet und kannst keine Aktionen ausführen.</p>

    <div class="info-box">
      <strong>💡 Hinweis:</strong><br>
      Nur Server-Administratoren können das Panel senden oder bearbeiten.<br>
      Wenn du dies tun musst, kontaktiere einen Administrator.
    </div>

    <a href="/panel">← Zurück zum Panel</a>
  </div>
</body>
</html>
      `);
    }

    try {
      const cfg = readCfg(guildId);

      // Only update panelChannelId if provided in request body
      if(req.body.channelId) {
        cfg.panelChannelId = req.body.channelId;
      }

      // Check if panelChannelId is set
      if(!cfg.panelChannelId) {
        return res.redirect('/panel?msg=nopanel');
      }

      const guild   = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const row = buildPanelSelect(cfg);
      let embed = buildPanelEmbed(cfg);
      const sent = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = sent.id;
      writeCfg(guildId, cfg);

      await logEvent(guildId, t(guildId, 'logs.panel_sent', { channel: `<#${cfg.panelChannelId}>` }), req.user);

      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  router.post('/panel/edit', isAuth, async (req,res)=>{
    // Check if user is admin (not just team member)
    const guildId = req.session.selectedGuild;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    const ADMIN = 0x8n;
    const isAdmin = entry && (BigInt(entry.permissions) & ADMIN) === ADMIN;

    if (!isAdmin) {
      return res.status(403).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keine Berechtigung</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      max-width: 600px;
    }
    h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    p { font-size: 1.1rem; line-height: 1.6; margin: 1rem 0; }
    .icon { font-size: 5rem; margin-bottom: 1rem; }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 1rem 2rem;
      background: white;
      color: #f39c12;
      text-decoration: none;
      border-radius: 10px;
      font-weight: bold;
      transition: transform 0.2s;
    }
    a:hover { transform: scale(1.05); }
    .info-box {
      background: rgba(255,255,255,0.2);
      padding: 1rem;
      border-radius: 10px;
      margin-top: 1.5rem;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">👁️</div>
    <h1>Nur-Lese-Modus</h1>
    <p><strong>Du hast keine Berechtigung, das Panel zu bearbeiten!</strong></p>
    <p>Du bist als <strong>Team-Mitglied</strong> angemeldet und kannst keine Aktionen ausführen.</p>

    <div class="info-box">
      <strong>💡 Hinweis:</strong><br>
      Nur Server-Administratoren können das Panel senden oder bearbeiten.<br>
      Wenn du dies tun musst, kontaktiere einen Administrator.
    </div>

    <a href="/panel">← Zurück zum Panel</a>
  </div>
</body>
</html>
      `);
    }

    const cfg = readCfg(guildId);
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      const guild   = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg     = await channel.messages.fetch(cfg.panelMessageId);
      const row     = buildPanelSelect(cfg);
      const embed   = buildPanelEmbed(cfg);
      await msg.edit({ embeds: embed? [embed]: undefined, components:[row] });

      await logEvent(guildId, t(guildId, 'logs.panel_edited', { channel: `<#${cfg.panelChannelId}>` }), req.user);

      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  const TICKETS_PATH = path.join(__dirname,'tickets.json');
  function getTicketsPath(guildId){
    if(!guildId) return TICKETS_PATH;
    return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
  }
  function loadTickets(guildId){
    const ticketsPath = getTicketsPath(guildId);
    try {
      if(!fs.existsSync(ticketsPath)) return [];
      return JSON.parse(fs.readFileSync(ticketsPath,'utf8'));
    } catch {
      return [];
    }
  }

  async function buildMemberMap(guild, tickets){
    const map = {};
    const ids = new Set();
    tickets.forEach(t => {
      if(t.userId) ids.add(t.userId);
      if(t.claimer) ids.add(t.claimer);
    });
    for(const id of ids){
      try {
        const m = await guild.members.fetch(id);
        map[id] = {
          tag: m.user.tag,
          username: m.user.username,
          nickname: m.nickname || null,
          display: m.displayName
        };
      } catch {
        map[id] = { tag:id, username:id, nickname:null, display:id };
      }
    }
    return map;
  }

  router.get('/tickets', isAuthOrTeam, async (req,res)=>{
    try {
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);
      const tickets = loadTickets(guildId);
      const guild = await client.guilds.fetch(guildId);
      const memberMap = await buildMemberMap(guild,tickets);
      res.render('tickets', {
        tickets: JSON.stringify(tickets),
        memberMap: JSON.stringify(memberMap),
        guildId: guildId,
        version: VERSION,
        isAdmin: req.isAdmin // Flag ob User Admin ist oder nur Team-Mitglied
      });
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden'); }
  });

  router.get('/tickets/data', isAuth, (req,res)=>{ res.json(loadTickets(req.session.selectedGuild)); });

  router.get('/transcript/:id', isAuthOrTeam, (req,res)=>{
    const id = req.params.id.replace(/[^0-9]/g,'');
    const guildId = req.session.selectedGuild;
    if(!id) return res.status(400).send('ID fehlt');

    // Override X-Frame-Options to allow iframe embedding from same origin
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Check guild-specific transcript folder first
    const transcriptsDir = path.join(__dirname, 'transcripts');
    const guildTranscriptFile = path.join(transcriptsDir, guildId, `transcript_${id}.html`);

    if(fs.existsSync(guildTranscriptFile)) {
      return res.sendFile(guildTranscriptFile);
    }

    // Fallback: check legacy root directory for old transcripts
    const legacyFile = path.join(__dirname, `transcript_${id}.html`);
    if(fs.existsSync(legacyFile)) {
      return res.sendFile(legacyFile);
    }

    return res.status(404).send('Transcript nicht gefunden');
  });

  router.get('/analytics', isAuthOrTeam, async (req,res)=>{
    try {
      const guildId = req.session.selectedGuild;

      // Prüfe ob Pro Feature (Beta hat auch Zugriff)
      const premiumInfo = getPremiumInfo(guildId);
      if (premiumInfo.tier !== 'pro' && premiumInfo.tier !== 'beta' && guildId !== '1291125037876904026') {
        return res.redirect('/premium?msg=analytics-requires-pro');
      }

      const tickets = loadTickets(guildId);
      const guild = await client.guilds.fetch(guildId);

      // Statistiken berechnen
      const stats = {
        total: tickets.length,
        closed: tickets.filter(t => t.status === 'geschlossen').length,
        open: tickets.filter(t => t.status === 'offen' || t.status !== 'geschlossen').length,
        claimed: tickets.filter(t => t.claimer).length,
        byTopic: {},
        byPriority: { '0': 0, '1': 0, '2': 0 },
        topClaimers: [],
        last30Days: {
          today: 0,
          week: 0,
          month: 0,
          avgPerDay: 0
        }
      };

      // Tickets nach Topic zählen
      tickets.forEach(t => {
        if (t.topic) {
          stats.byTopic[t.topic] = (stats.byTopic[t.topic] || 0) + 1;
        }
      });

      // Tickets nach Priorität zählen
      tickets.forEach(t => {
        const priority = t.priority || 0;
        stats.byPriority[priority.toString()] = (stats.byPriority[priority.toString()] || 0) + 1;
      });

      // Top Claimer berechnen
      const claimerCounts = {};
      tickets.forEach(t => {
        if (t.claimer) {
          claimerCounts[t.claimer] = (claimerCounts[t.claimer] || 0) + 1;
        }
      });

      // User IDs zu Benutzernamen auflösen
      const topClaimersWithNames = [];
      for (const [userId, count] of Object.entries(claimerCounts)) {
        let username = userId; // Fallback auf User ID
        try {
          const member = await guild.members.fetch(userId);
          username = member.user.username || member.user.tag || userId;
        } catch (err) {
          console.log(`Konnte User ${userId} nicht fetchen`);
        }
        topClaimersWithNames.push({ userId, username, count });
      }

      stats.topClaimers = topClaimersWithNames.sort((a, b) => b.count - a.count);

      // Letzte 30 Tage Statistiken
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const today = new Date().setHours(0, 0, 0, 0);
      const weekAgo = now - (7 * oneDayMs);
      const monthAgo = now - (30 * oneDayMs);

      tickets.forEach(t => {
        if (t.timestamp >= today) stats.last30Days.today++;
        if (t.timestamp >= weekAgo) stats.last30Days.week++;
        if (t.timestamp >= monthAgo) stats.last30Days.month++;
      });

      stats.last30Days.avgPerDay = stats.last30Days.month > 0
        ? Math.round(stats.last30Days.month / 30 * 10) / 10
        : 0;

      res.render('analytics', {
        guildName: guild.name,
        stats: stats,
        guildId: guildId
      });
    } catch(e) {
      console.error('Analytics Error:', e);
      res.status(500).send('Fehler beim Laden der Analytics');
    }
  });

  router.post('/webhook/github', async (req, res) => {
    try {
      res.status(200).send('OK');

      const payload = req.body;
      const event = req.headers['x-github-event'];

      console.log(`📡 GitHub Webhook erhalten: Event=${event}, Repo=${payload.repository?.full_name || 'Unknown'}`);

      if (event !== 'push') {
        console.log(`⏭️ Event ${event} ignoriert (nur push wird verarbeitet)`);
        return;
      }

      const repository = payload.repository?.full_name || 'Unknown';
      const commits = payload.commits || [];
      const pusher = payload.pusher?.name || 'Unknown';
      const ref = payload.ref || '';
      const branch = ref.replace('refs/heads/', '');

      console.log(`🔀 Push Event: ${commits.length} Commit(s) auf ${branch} von ${pusher}`);

      if (!repository.toLowerCase().includes('trs-tickets-bot')) {
        console.log(`⏭️ Repository ${repository} ist nicht TRS-Tickets-Bot, ignoriere Webhook`);
        return;
      }

      const guilds = await client.guilds.fetch();
      console.log(`📤 Verarbeite Webhook für ${guilds.size} Server...`);

      let sentCount = 0;
      for (const [guildId, guildData] of guilds) {
        try {
          const cfg = readCfg(guildId);

          if (cfg.githubCommitsEnabled === false) {
            console.log(`⏭️ Guild ${guildData.name || guildId} (${guildId}): GitHub Logs deaktiviert`);
            continue;
          }

          if (!cfg.githubWebhookChannelId) {
            console.log(`⚠️ Guild ${guildData.name || guildId} (${guildId}): Kein Webhook Channel konfiguriert`);
            continue;
          }

          const guild = await client.guilds.fetch(guildId);
          if (!guild) {
            console.log(`❌ Guild ${guildId}: Konnte Guild nicht fetchen`);
            continue;
          }

          const channel = await guild.channels.fetch(cfg.githubWebhookChannelId).catch(() => null);
          if (!channel) {
            console.log(`❌ Guild ${guild.name} (${guildId}): Channel ${cfg.githubWebhookChannelId} nicht gefunden`);
            continue;
          }

          console.log(`✅ Guild ${guild.name} (${guildId}): Sende ${commits.length} Commit(s) zu #${channel.name}`);

          for (const commit of commits.slice(0, 5)) {
            const embed = new EmbedBuilder()
              .setTitle('📝 New Commit')
              .setDescription(commit.message || 'No commit message')
              .setColor(0x00ff88)
              .addFields(
                { name: '👤 Author', value: commit.author?.name || 'Unknown', inline: true },
                { name: '🌿 Branch', value: branch, inline: true },
                { name: '📦 Repository', value: repository, inline: false }
              )
              .setTimestamp(new Date(commit.timestamp))
              .setFooter({ text: 'Quantix Tickets Bot Updates' });

            if (commit.url) {
              embed.setURL(commit.url);
            }

            await channel.send({ embeds: [embed] });
          }

          if (commits.length > 5) {
            const moreEmbed = new EmbedBuilder()
              .setDescription(`... und ${commits.length - 5} weitere Commit(s)`)
              .setColor(0x00ff88)
              .setFooter({ text: 'Quantix Tickets Bot Updates' });
            await channel.send({ embeds: [moreEmbed] });
          }

          sentCount++;

        } catch (err) {
          console.error(`GitHub Webhook Error für Guild ${guildId}:`, err);
        }
      }

      console.log(`✅ GitHub Webhook erfolgreich an ${sentCount} Server gesendet`);

    } catch (err) {
      console.error('GitHub Webhook Error:', err);
    }
  });

  router.get('/health', (req, res) => {
    try {
      const isOnline = client && client.isReady && client.isReady();
      const uptime = client?.uptime || 0;
      const guildsCount = client?.guilds?.cache?.size || 0;
      const ping = client?.ws?.ping || 0;

      if (!isOnline) {
        return res.status(503).json({
          status: 'offline',
          message: 'Bot ist offline',
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        status: 'online',
        uptime: Math.floor(uptime / 1000),
        uptimeFormatted: formatUptime(uptime),
        guilds: guildsCount,
        ping: ping,
        version: VERSION,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Health Check: Bot Online | ${guildsCount} Guilds | ${ping}ms`);
    } catch (err) {
      console.error('Health Check Error:', err);
      res.status(503).json({
        status: 'error',
        message: 'Health Check Fehler',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Auto-Update Webhook
  router.post('/webhook/auto-update', handleAutoUpdate);

  // Auto-Update Log Viewer
  router.get('/update-log', showUpdateLog);

  router.get('/status', (req, res) => {
    try {
      const isOnline = client && client.isReady && client.isReady();
      const uptime = client?.uptime || 0;
      const guildsCount = client?.guilds?.cache?.size || 0;
      const ping = client?.ws?.ping || 0;
      const user = client?.user;

      const statusColor = isOnline ? '#00ff88' : '#ff4444';
      const statusText = isOnline ? 'ONLINE' : 'OFFLINE';
      const statusEmoji = isOnline ? '🟢' : '🔴';

      const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quantix Tickets Bot - Status</title>
  <meta http-equiv="refresh" content="30">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 2rem;
    }
    .container {
      max-width: 600px;
      width: 100%;
      background: rgba(255,255,255,0.05);
      border-radius: 20px;
      padding: 3rem;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .status-badge {
      display: inline-block;
      padding: 1rem 2rem;
      border-radius: 50px;
      background: ${statusColor};
      color: #000;
      font-size: 1.5rem;
      font-weight: bold;
      margin-bottom: 1rem;
      box-shadow: 0 4px 20px ${statusColor}55;
    }
    .bot-name {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    .version {
      opacity: 0.7;
      font-size: 0.9rem;
    }
    .stats {
      margin-top: 2rem;
    }
    .stat-item {
      display: flex;
      justify-content: space-between;
      padding: 1rem;
      margin-bottom: 0.5rem;
      background: rgba(255,255,255,0.03);
      border-radius: 10px;
      border-left: 3px solid ${statusColor};
    }
    .stat-label {
      opacity: 0.8;
    }
    .stat-value {
      font-weight: bold;
      color: ${statusColor};
    }
    .footer {
      text-align: center;
      margin-top: 2rem;
      opacity: 0.5;
      font-size: 0.85rem;
    }
    .refresh-info {
      text-align: center;
      margin-top: 1rem;
      opacity: 0.6;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="status-badge">${statusEmoji} ${statusText}</div>
      <h1 class="bot-name">${user ? user.username : 'Quantix Tickets Bot'}</h1>
      <p class="version">Version ${VERSION}</p>
    </div>

    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">📊 Status</span>
        <span class="stat-value">${statusText}</span>
      </div>
      ${isOnline ? `
      <div class="stat-item">
        <span class="stat-label">⏱️ Uptime</span>
        <span class="stat-value">${formatUptime(uptime)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">🏠 Server</span>
        <span class="stat-value">${guildsCount} Guilds</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">🏓 Ping</span>
        <span class="stat-value">${ping}ms</span>
      </div>
      ` : `
      <div class="stat-item">
        <span class="stat-label">⚠️ Info</span>
        <span class="stat-value">Bot ist offline</span>
      </div>
      `}
      <div class="stat-item">
        <span class="stat-label">🕐 Letzte Prüfung</span>
        <span class="stat-value">${new Date().toLocaleTimeString('de-DE')}</span>
      </div>
    </div>

    <div class="refresh-info">
      ↻ Automatische Aktualisierung alle 30 Sekunden
    </div>

    <div class="footer">
      <p>Quantix Tickets Bot ©️ ${new Date().getFullYear()}</p>
      <p style="margin-top: 0.5rem;"><a href="/" style="color: ${statusColor}; text-decoration: none;">← Zurück zur Homepage</a></p>
    </div>
  </div>
</body>
</html>
      `;

      res.status(200).send(html);
    } catch (err) {
      console.error('Status Page Error:', err);
      res.status(500).send('Status-Seite konnte nicht geladen werden.');
    }
  });

  // Premium Routes
  router.get('/premium', isAuth, (req, res) => {
    const guildId = req.session.selectedGuild;
    const premiumInfo = getPremiumInfo(guildId);

    res.render('premium', {
      lang: res.locals.lang || 'de',
      guildId: guildId,
      currentTier: premiumInfo.tier,
      currentTierName: premiumInfo.tierName,
      expiresAt: premiumInfo.expiresAt,
      version: VERSION
    });
  });

  router.post('/purchase-premium', isAuth, async (req, res) => {
    const guildId = req.session.selectedGuild;
    const tier = req.body.tier;
    const billingPeriod = req.body.billingPeriod || 'monthly';

    if (!['basic', 'pro'].includes(tier)) {
      return res.status(400).send('Ungültiges Premium-Tier');
    }

    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return res.status(400).send('Ungültiger Abrechnungszeitraum');
    }

    try {
      // WICHTIG: Hier Stripe Integration einbauen
      // Für jetzt: Nur Platzhalter

      const stripeEnabled = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key_here';

      if (!stripeEnabled) {
        // Entwicklungsmodus: Direkt aktivieren (NUR ZU TESTZWECKEN!)
        console.log(`⚠️ ENTWICKLUNGSMODUS: Premium ${tier} (${billingPeriod}) für Guild ${guildId} aktiviert ohne Payment`);
        activatePremium(guildId, tier, 'dev_subscription_' + Date.now(), 'dev_customer_' + guildId, null, billingPeriod);
        await logEvent(guildId, `💎 Premium ${tier.toUpperCase()} (${billingPeriod === 'yearly' ? 'Jährlich' : 'Monatlich'}) wurde aktiviert (Entwicklungsmodus)`, req.user);
        return res.redirect('/premium?msg=success');
      }

      // Produktions-Modus: Stripe Checkout
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

      // Price IDs basierend auf Tier und Billing Period
      const prices = {
        basic_monthly: process.env.STRIPE_PRICE_BASIC || 'price_basic',
        basic_yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || 'price_basic_yearly',
        pro_monthly: process.env.STRIPE_PRICE_PRO || 'price_pro',
        pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly'
      };

      const priceKey = `${tier}_${billingPeriod}`;
      const selectedPrice = prices[priceKey];

      if (!selectedPrice) {
        return res.status(400).send('Ungültige Preis-Konfiguration');
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price: selectedPrice,
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${BASE.replace(/\/$/, '')}/premium-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${BASE.replace(/\/$/, '')}/premium?guild=${guildId}`,
        client_reference_id: guildId,
        metadata: {
          tier: tier,
          guildId: guildId,
          billingPeriod: billingPeriod
        }
      });

      res.redirect(303, session.url);
    } catch (err) {
      console.error('Premium Purchase Error:', err);
      res.status(500).send('Fehler beim Erstellen der Zahlung. Bitte kontaktiere den Support.');
    }
  });

  router.get('/premium-success', isAuth, async (req, res) => {
    const sessionId = req.query.session_id;

    if (!sessionId) {
      return res.redirect('/premium');
    }

    try {
      const stripeEnabled = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key_here';

      if (!stripeEnabled) {
        // Entwicklungsmodus
        return res.send(`
          <html>
            <head>
              <title>Premium Aktiviert</title>
              <style>
                body { font-family: Arial; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { text-align: center; background: rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; }
                h1 { font-size: 3rem; margin-bottom: 20px; }
                a { display: inline-block; margin-top: 20px; padding: 15px 30px; background: white; color: #667eea; text-decoration: none; border-radius: 10px; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>💎 Premium Aktiviert!</h1>
                <p>Dein Premium-Plan wurde erfolgreich aktiviert (Entwicklungsmodus).</p>
                <a href="/panel">Zum Dashboard</a>
              </div>
            </body>
          </html>
        `);
      }

      // Stripe Session abrufen
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid') {
        const guildId = session.client_reference_id;
        const tier = session.metadata.tier;
        const billingPeriod = session.metadata.billingPeriod || 'monthly';

        activatePremium(guildId, tier, session.subscription, session.customer, req.user.id, billingPeriod);
        await logEvent(guildId, `💎 Premium ${tier.toUpperCase()} (${billingPeriod === 'yearly' ? 'Jährlich' : 'Monatlich'}) wurde aktiviert!`, req.user);

        res.send(`
          <html>
            <head>
              <title>Premium Aktiviert</title>
              <style>
                body { font-family: Arial; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .container { text-align: center; background: rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; }
                h1 { font-size: 3rem; margin-bottom: 20px; }
                p { font-size: 1.2rem; }
                a { display: inline-block; margin-top: 20px; padding: 15px 30px; background: white; color: #667eea; text-decoration: none; border-radius: 10px; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>💎 Zahlung erfolgreich!</h1>
                <p>Dein Premium ${tier.toUpperCase()}-Plan wurde aktiviert.</p>
                <p>Vielen Dank für deine Unterstützung!</p>
                <a href="/panel">Zum Dashboard</a>
              </div>
            </body>
          </html>
        `);
      } else {
        res.redirect('/premium?msg=payment-pending');
      }
    } catch (err) {
      console.error('Premium Success Error:', err);
      res.status(500).send('Fehler beim Abrufen der Zahlungsinformationen.');
    }
  });

  // Premium Kündigen
  router.post('/cancel-premium', isAuth, async (req, res) => {
    const guildId = req.session.selectedGuild;

    try {
      const result = cancelPremium(guildId);

      if (!result.success) {
        return res.redirect('/premium?msg=no-active-premium');
      }

      // Stripe Subscription kündigen
      const stripeEnabled = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key_here';

      if (stripeEnabled && result.subscriptionId) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        try {
          await stripe.subscriptions.cancel(result.subscriptionId);
          console.log(`🚫 Stripe Subscription ${result.subscriptionId} gekündigt für Guild ${guildId}`);
        } catch (stripeErr) {
          console.error('Stripe Cancellation Error:', stripeErr);
          // Premium wurde bereits lokal gekündigt, auch wenn Stripe-Call fehlschlägt
        }
      }

      await logEvent(guildId, '🚫 Premium wurde gekündigt', req.user);

      res.redirect('/premium?msg=cancelled');
    } catch (err) {
      console.error('Cancel Premium Error:', err);
      res.status(500).send('Fehler beim Kündigen. Bitte kontaktiere den Support.');
    }
  });

  // Premium Downgrade (Pro → Basic)
  router.post('/downgrade-premium', isAuth, async (req, res) => {
    const guildId = req.session.selectedGuild;

    try {
      const premiumInfo = getPremiumInfo(guildId);

      if (premiumInfo.tier !== 'pro') {
        return res.redirect('/premium?msg=not-pro');
      }

      const success = downgradePremium(guildId);

      if (!success) {
        return res.redirect('/premium?msg=downgrade-failed');
      }

      // Stripe Subscription auf Basic umstellen
      const stripeEnabled = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key_here';

      if (stripeEnabled && premiumInfo.subscriptionId) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const basicPriceId = process.env.STRIPE_PRICE_BASIC || 'price_basic';

        try {
          const subscription = await stripe.subscriptions.retrieve(premiumInfo.subscriptionId);

          await stripe.subscriptions.update(premiumInfo.subscriptionId, {
            items: [{
              id: subscription.items.data[0].id,
              price: basicPriceId
            }],
            proration_behavior: 'create_prorations'
          });

          console.log(`⬇️ Stripe Subscription ${premiumInfo.subscriptionId} downgraded zu Basic für Guild ${guildId}`);
        } catch (stripeErr) {
          console.error('Stripe Downgrade Error:', stripeErr);
          // Premium wurde bereits lokal downgraded, auch wenn Stripe-Call fehlschlägt
        }
      }

      await logEvent(guildId, '⬇️ Premium wurde von Pro zu Basic downgraded', req.user);

      res.redirect('/premium?msg=downgraded');
    } catch (err) {
      console.error('Downgrade Premium Error:', err);
      res.status(500).send('Fehler beim Downgrade. Bitte kontaktiere den Support.');
    }
  });

  // Stripe Webhook (für automatische Verlängerungen & Kündigungen)
  router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error('⚠️ STRIPE_WEBHOOK_SECRET nicht gesetzt!');
        return res.status(400).send('Webhook Secret fehlt');
      }

      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      console.log(`📡 Stripe Webhook erhalten: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const guildId = session.client_reference_id;
          const tier = session.metadata.tier;
          const billingPeriod = session.metadata.billingPeriod || 'monthly';

          activatePremium(guildId, tier, session.subscription, session.customer, null, billingPeriod);
          console.log(`✅ Premium ${tier} (${billingPeriod}) aktiviert für Guild ${guildId}`);
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object;
          const customerId = invoice.customer;

          // Finde Guild anhand der Customer ID
          const files = fs.readdirSync(CONFIG_DIR);
          for (const file of files) {
            if (!file.endsWith('.json') || file.includes('_tickets')) continue;
            const guildId = file.replace('.json', '');
            const cfg = readCfg(guildId);

            if (cfg.premium?.customerId === customerId) {
              renewPremium(guildId);
              console.log(`✅ Premium verlängert für Guild ${guildId}`);
              break;
            }
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const customerId = subscription.customer;

          // Finde Guild und deaktiviere Premium
          const files = fs.readdirSync(CONFIG_DIR);
          for (const file of files) {
            if (!file.endsWith('.json') || file.includes('_tickets')) continue;
            const guildId = file.replace('.json', '');
            const cfg = readCfg(guildId);

            if (cfg.premium?.customerId === customerId) {
              deactivatePremium(guildId);
              console.log(`❌ Premium deaktiviert für Guild ${guildId} (Subscription cancelled)`);
              break;
            }
          }
          break;
        }

        default:
          console.log(`⏭️ Unhandled Stripe event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Stripe Webhook Error:', err);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  router.get('/owner', isOwner, async (req, res) => {
    try {
      const allGuilds = await client.guilds.fetch();
      const configFiles = fs.readdirSync('./configs').filter(f =>
        f.endsWith('.json') && !f.includes('_tickets') && !f.includes('_counter')
      );

      const guildsData = [];
      let totalTickets = 0;

      for (const file of configFiles) {
        try {
          const guildId = file.replace('.json', '');
          const cfg = JSON.parse(fs.readFileSync(`./configs/${file}`, 'utf8'));

          let guildInfo = null;
          try {
            const guild = await client.guilds.fetch(guildId);
            guildInfo = {
              id: guild.id,
              name: guild.name,
              memberCount: guild.memberCount,
              icon: guild.iconURL({ size: 128 })
            };
          } catch(err) {
            guildInfo = {
              id: guildId,
              name: 'Unbekannt (Bot nicht auf Server)',
              memberCount: 0,
              icon: null
            };
          }

          let ticketCount = 0;
          try {
            const tickets = JSON.parse(fs.readFileSync(`./configs/${guildId}_tickets.json`, 'utf8'));
            ticketCount = tickets.length || 0;
            totalTickets += ticketCount;
          } catch(err) {}

          const premiumInfo = getPremiumInfo(guildId);

          guildsData.push({
            ...guildInfo,
            tickets: ticketCount,
            premium: premiumInfo.tier,
            premiumExpires: premiumInfo.expiresAt,
            premiumLifetime: premiumInfo.lifetime || false,
            language: cfg.language || 'de'
          });
        } catch(err) {
          console.error('Error loading guild data:', err);
        }
      }

      guildsData.sort((a, b) => b.tickets - a.tickets);

      const premiumStats = {
        none: guildsData.filter(g => g.premium === 'none').length,
        basic: guildsData.filter(g => g.premium === 'basic').length,
        pro: guildsData.filter(g => g.premium === 'pro').length,
        beta: guildsData.filter(g => g.premium === 'beta').length
      };

      // Load feedbacks
      let feedbacks = [];
      try {
        const feedbackFile = './feedback.json';
        if (fs.existsSync(feedbackFile)) {
          feedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
          feedbacks = feedbacks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
      } catch(err) {
        console.error('Error loading feedbacks for owner:', err);
      }

      res.render('owner', {
        user: req.user,
        guilds: guildsData,
        totalGuilds: guildsData.length,
        totalTickets: totalTickets,
        premiumStats: premiumStats,
        botUptime: formatUptime(client.uptime),
        version: VERSION,
        feedbacks: feedbacks
      });
    } catch(err) {
      console.error('Owner Panel Error:', err);
      res.status(500).send('Fehler beim Laden des Owner Panels');
    }
  });

  // Delete Feedback (Owner Only)
  router.post('/owner/delete-feedback/:id', isOwner, async (req, res) => {
    try {
      const feedbackId = req.params.id;
      const feedbackFile = './feedback.json';

      if (!fs.existsSync(feedbackFile)) {
        return res.redirect('/owner?error=not-found');
      }

      let feedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
      const initialLength = feedbacks.length;

      feedbacks = feedbacks.filter(f => f.id !== feedbackId);

      if (feedbacks.length === initialLength) {
        return res.redirect('/owner?error=not-found');
      }

      fs.writeFileSync(feedbackFile, JSON.stringify(feedbacks, null, 2));
      console.log(`🗑️ Owner deleted feedback: ${feedbackId}`);

      res.redirect('/owner?success=deleted');
    } catch(err) {
      console.error('Delete feedback error:', err);
      res.redirect('/owner?error=delete-failed');
    }
  });

  // Delete server data route (Owner only) - Initiates 24h deletion process
  router.post('/owner/delete-server-data/:guildId', isOwner, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const guild = await client.guilds.fetch(guildId).catch(() => null);

      if (!guild) {
        return res.redirect('/owner?error=guild-not-found');
      }

      console.log(`⚠️ Owner initiated deletion for guild: ${guildId}`);

      // Load pending deletions
      const pendingFile = './pending-deletions.json';
      let pending = [];
      if (fs.existsSync(pendingFile)) {
        pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
      }

      // Check if already pending
      if (pending.find(p => p.guildId === guildId)) {
        return res.redirect('/owner?error=already-pending');
      }

      // Get log channel or first available text channel
      const cfg = readCfg(guildId);
      let targetChannel = null;

      if (cfg.logChannelId) {
        targetChannel = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
      }

      if (!targetChannel) {
        // Find first text channel
        const channels = await guild.channels.fetch();
        targetChannel = channels.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
      }

      if (!targetChannel) {
        return res.redirect('/owner?error=no-channel-available');
      }

      // Create deletion entry
      const deletion = {
        guildId: guildId,
        guildName: guild.name,
        initiatedAt: Date.now(),
        executesAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        channelId: targetChannel.id,
        messageId: null
      };

      // Send warning message with @everyone ping and cancel button
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

      const embed = new EmbedBuilder()
        .setTitle('⚠️ DATEN-LÖSCHUNG GEPLANT')
        .setDescription(
          `Der Bot-Owner hat eine vollständige Daten-Löschung für diesen Server initiiert.\n\n` +
          `**Was wird gelöscht:**\n` +
          `• Alle Konfigurationsdateien\n` +
          `• Alle Tickets und deren Daten\n` +
          `• Alle Ticket-Transkripte\n` +
          `• Der Bot wird den Server verlassen\n\n` +
          `**Zeitpunkt:** <t:${Math.floor(deletion.executesAt / 1000)}:R>\n\n` +
          `**Um die Löschung abzubrechen, klicke auf den Button unten!**`
        )
        .setColor(0xe74c3c)
        .setFooter({ text: 'Diese Aktion wurde vom Bot-Owner initiiert' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cancel-deletion-${guildId}`)
          .setLabel('Löschung abbrechen')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🛑')
      );

      const message = await targetChannel.send({
        content: '@everyone',
        embeds: [embed],
        components: [row]
      });

      deletion.messageId = message.id;

      // Save pending deletion
      pending.push(deletion);
      fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

      console.log(`✅ Deletion scheduled for ${guildId} - Executes at: ${new Date(deletion.executesAt).toISOString()}`);

      res.redirect('/owner?success=deletion-scheduled');
    } catch(err) {
      console.error('Schedule deletion error:', err);
      res.redirect('/owner?error=schedule-failed');
    }
  });

  // Premium Management (Owner Only)
  router.post('/owner/manage-premium', isOwner, async (req, res) => {
    try {
      const { serverId, action, tier, days } = req.body;
      const { activateLifetimePremium, removeLifetimePremium, activateBetatester, deactivateBetatester } = require('./premium');

      if (!serverId || !action) {
        return res.redirect('/owner?error=missing-params');
      }

      // Fetch guild info
      const guild = await client.guilds.fetch(serverId).catch(() => null);
      if (!guild) {
        return res.redirect('/owner?error=guild-not-found');
      }

      let result;

      if (action === 'lifetime' && tier) {
        // Activate Lifetime Premium
        const guildOwner = await guild.fetchOwner();
        result = activateLifetimePremium(serverId, tier, guildOwner.id);

        if (result.success) {
          console.log(`♾️ Lifetime ${tier} Premium activated for ${guild.name} (${serverId}) by ${req.user.username}`);
          return res.redirect('/owner?success=premium-activated');
        }
      } else if (action === 'betatester') {
        // Activate Betatester
        const duration = parseInt(days) || 30;
        const guildOwner = await guild.fetchOwner();
        result = activateBetatester(serverId, duration, guildOwner.id);

        if (result.success) {
          console.log(`🧪 Betatester activated for ${guild.name} (${serverId}) for ${duration} days by ${req.user.username}`);
          return res.redirect('/owner?success=premium-activated');
        }
      } else if (action === 'remove') {
        // Remove Premium
        const premiumInfo = require('./premium').getPremiumInfo(serverId);

        if (premiumInfo.lifetime) {
          result = removeLifetimePremium(serverId);
        } else if (premiumInfo.tier === 'beta') {
          result = deactivateBetatester(serverId);
        } else {
          return res.redirect('/owner?error=cannot-remove-subscriptionunknown');
        }

        if (result.success) {
          console.log(`🚫 Premium removed for ${guild.name} (${serverId}) by ${req.user.username}`);
          return res.redirect('/owner?success=premium-removed');
        }
      }

      res.redirect('/owner?error=premium-update-failed');
    } catch(err) {
      console.error('Premium Management Error:', err);
      res.redirect('/owner?error=premium-update-failed');
    }
  });

  // ==================== FOUNDER ROUTES ====================
  // Blacklist file handling
  const BLACKLIST_FILE = './server-blacklist.json';

  function loadBlacklist() {
    try {
      if (fs.existsSync(BLACKLIST_FILE)) {
        const data = fs.readFileSync(BLACKLIST_FILE, 'utf8');
        const parsed = JSON.parse(data);

        // Migrate old format (array) to new format (object with metadata)
        if (Array.isArray(parsed.guilds)) {
          const newFormat = { guilds: {} };
          for (const guildId of parsed.guilds) {
            newFormat.guilds[guildId] = {
              name: `Server ${guildId}`,
              blockedAt: new Date().toISOString()
            };
          }
          saveBlacklist(newFormat);
          return newFormat;
        }

        return parsed;
      }
    } catch (err) {
      console.error('Error loading blacklist:', err);
    }
    return { guilds: {} };
  }

  function saveBlacklist(blacklist) {
    try {
      fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklist, null, 2));
      return true;
    } catch (err) {
      console.error('Error saving blacklist:', err);
      return false;
    }
  }

  function isGuildBlacklisted(guildId) {
    const blacklist = loadBlacklist();
    return blacklist.guilds.hasOwnProperty(guildId);
  }

  // Founder Panel - GET Route
  router.get('/founder', isFounder, async (req, res) => {
    try {
      const allGuilds = await client.guilds.fetch();
      const blacklist = loadBlacklist();

      const guildsData = [];
      const processedGuildIds = new Set();

      // Add all guilds where bot is currently a member
      for (const [guildId, guild] of allGuilds) {
        try {
          const fullGuild = await client.guilds.fetch(guildId);
          processedGuildIds.add(fullGuild.id);

          guildsData.push({
            id: fullGuild.id,
            name: fullGuild.name,
            icon: fullGuild.icon ? `https://cdn.discordapp.com/icons/${fullGuild.id}/${fullGuild.icon}.png?size=256` : null,
            memberCount: fullGuild.memberCount,
            blocked: blacklist.guilds.hasOwnProperty(fullGuild.id)
          });
        } catch (err) {
          console.error(`Error fetching guild ${guildId}:`, err.message);
        }
      }

      // Add blocked guilds that bot is no longer a member of
      for (const [blockedGuildId, blockedData] of Object.entries(blacklist.guilds)) {
        if (!processedGuildIds.has(blockedGuildId)) {
          guildsData.push({
            id: blockedGuildId,
            name: blockedData.name + ' (Verlassen)',
            icon: null,
            memberCount: 0,
            blocked: true
          });
        }
      }

      // Sort: blocked last, then by member count
      guildsData.sort((a, b) => {
        if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
        return b.memberCount - a.memberCount;
      });

      res.render('founder', {
        user: req.user,
        guilds: guildsData
      });
    } catch (err) {
      console.error('Founder panel error:', err);
      res.status(500).send('Error loading founder panel');
    }
  });

  // Block Server - POST Route
  router.post('/founder/block-server/:guildId', isFounder, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const blacklist = loadBlacklist();

      if (!blacklist.guilds.hasOwnProperty(guildId)) {
        // Get guild info before leaving
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        const guildName = guild ? guild.name : `Server ${guildId}`;

        // Add to blacklist with name
        blacklist.guilds[guildId] = {
          name: guildName,
          blockedAt: new Date().toISOString(),
          blockedBy: req.user.username
        };
        saveBlacklist(blacklist);
        console.log(`🚫 Server ${guildName} (${guildId}) wurde von ${req.user.username} blockiert`);

        // Leave the server after blocking
        if (guild) {
          await guild.leave();
          console.log(`👋 Bot hat blockierten Server ${guildName} (${guildId}) verlassen`);
        }
      }

      res.redirect('/founder');
    } catch (err) {
      console.error('Block server error:', err);
      res.redirect('/founder?error=block-failed');
    }
  });

  // Unblock Server - POST Route
  router.post('/founder/unblock-server/:guildId', isFounder, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const blacklist = loadBlacklist();

      if (blacklist.guilds.hasOwnProperty(guildId)) {
        const serverName = blacklist.guilds[guildId].name;
        delete blacklist.guilds[guildId];
        saveBlacklist(blacklist);
        console.log(`✅ Server ${serverName} (${guildId}) wurde von ${req.user.username} entsperrt`);
      }

      res.redirect('/founder');
    } catch (err) {
      console.error('Unblock server error:', err);
      res.redirect('/founder?error=unblock-failed');
    }
  });

  // Kick from Server - POST Route
  router.post('/founder/kick-server/:guildId', isFounder, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const guild = await client.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const guildName = guild.name;
        await guild.leave();
        console.log(`👋 Bot wurde von ${req.user.username} vom Server ${guildName} (${guildId}) gekickt`);
      }

      res.redirect('/founder');
    } catch (err) {
      console.error('Kick server error:', err);
      res.redirect('/founder?error=kick-failed');
    }
  });

  // Global Settings Click Counter (User-wide)
  const GLOBAL_CLICKS_FILE = './global-settings-clicks.json';

  function loadGlobalClicks() {
    try {
      if (fs.existsSync(GLOBAL_CLICKS_FILE)) {
        const data = fs.readFileSync(GLOBAL_CLICKS_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Error loading global clicks:', err);
    }
    return { count: 0 };
  }

  function saveGlobalClicks(count) {
    try {
      fs.writeFileSync(GLOBAL_CLICKS_FILE, JSON.stringify({ count }, null, 2));
    } catch (err) {
      console.error('Error saving global clicks:', err);
    }
  }

  // API: Get global click count
  router.get('/api/settings-clicks', (req, res) => {
    const data = loadGlobalClicks();
    res.json(data);
  });

  // API: Increment global click count
  router.post('/api/settings-clicks/increment', (req, res) => {
    const data = loadGlobalClicks();
    data.count++;
    saveGlobalClicks(data.count);
    res.json(data);
  });

  // ============================================================
  // REST API ROUTES (Frontend/Backend Separation)
  // ============================================================

  const apiRoutes = require('./api/routes');

  // Make client accessible to API routes
  router.use((req, res, next) => {
    req.app.locals.client = client;
    next();
  });

  // Mount API routes
  router.use('/api', apiRoutes);

  return router;
};

function formatUptime(ms) {
  if (!ms) return '0s';

  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  return parts.join(' ') || '0s';
}

function buildPanelSelect(cfg){
  const topics = (cfg.topics||[]).filter(t => t && t.label && t.value);
  if(topics.length === 0){
    topics.push({ label: 'Keine Topics konfiguriert', value: 'none', emoji: '⚠️' });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions(topics.map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
  );
}

function buildPanelEmbed(cfg){
  if(!cfg.panelEmbed || (!cfg.panelEmbed.title && !cfg.panelEmbed.description)) return null;
  const e = new EmbedBuilder();
  if(cfg.panelEmbed.title) e.setTitle(cfg.panelEmbed.title);
  if(cfg.panelEmbed.description) e.setDescription(cfg.panelEmbed.description);
  if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) e.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
  if(cfg.panelEmbed.footer) e.setFooter({ text: cfg.panelEmbed.footer });
  return e;
}

// ============================================================
// UTILITY FUNCTIONS FOR API
// ============================================================

function loadTickets(guildId) {
  const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
  try {
    const data = fs.readFileSync(ticketsPath, 'utf8');
    return JSON.parse(data) || [];
  } catch (err) {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
  fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));
}

// Export helper functions for API routes
module.exports.readCfg = readCfg;
module.exports.writeCfg = writeCfg;
module.exports.loadTickets = loadTickets;
module.exports.saveTickets = saveTickets;
