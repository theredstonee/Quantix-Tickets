require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const FileStore = require('session-file-store')(session);
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getTranslations, t, getLanguageName } = require('./translations');
const cookieParser = require('cookie-parser');
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { VERSION, COPYRIGHT } = require('./version.config');
const { handleAutoUpdate, showUpdateLog } = require('./auto-update');
const { isPremium, hasFeature, getPremiumTier, getPremiumInfo, activatePremium, deactivatePremium, renewPremium, downgradePremium, cancelPremium, PREMIUM_TIERS, listPartnerServers } = require('./premium');
const { getComprehensiveInsights } = require('./insights-analytics');
const { generateCSVExport, generateStatsCSVExport } = require('./export-utils');
const {
  sanitizeHtml,
  sanitizeText,
  sanitizeUrl,
  sanitizeEmail,
  sanitizeDiscordId,
  sanitizeColor,
  sanitizeNumber,
  sanitizeString,
  sanitizeUsername,
  validateDiscordId,
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
        embed.setAuthor({ name: sanitizeUsername(user.username || user.tag || user.id), iconURL: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined });
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

  // Session configuration
  const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh session on every request
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: /^https:\/\//i.test(BASE)
      // No maxAge = Session cookie (expires when browser closes, but rolling keeps it alive)
    }
  };

  // Choose session store: Redis > FileStore > MemoryStore
  if (process.env.REDIS_URL) {
    try {
      console.log('🔄 Initializing Redis session store...');

      // Import Redis modules only when needed
      const RedisStore = require('connect-redis').default;
      const { createClient } = require('redis');

      const redisClient = createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.warn('⚠️  Redis connection failed after 10 retries');
              return new Error('Redis connection failed');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      redisClient.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      redisClient.connect().then(() => {
        sessionConfig.store = new RedisStore({ client: redisClient });
        console.log('✅ Redis session store initialized');
      }).catch(err => {
        console.warn('⚠️  Redis connection failed, using FileStore fallback:', err.message);
        sessionConfig.store = new FileStore({
          path: './sessions',
          retries: 0
          // No TTL = Sessions persist indefinitely
        });
        console.log('✅ FileStore session store initialized');
      });
    } catch (err) {
      console.warn('⚠️  Redis initialization failed, using FileStore fallback:', err.message);
      sessionConfig.store = new FileStore({
        path: './sessions',
        retries: 0
        // No TTL = Sessions persist indefinitely
      });
      console.log('✅ FileStore session store initialized');
    }
  } else {
    // Use FileStore instead of MemoryStore (survives restarts)
    sessionConfig.store = new FileStore({
      path: './sessions',
      retries: 0
      // No TTL = Sessions persist indefinitely
    });
    console.log('✅ FileStore session store initialized (sessions survive restarts)');
  }

  router.use(session(sessionConfig));

  router.use(passport.initialize());
  router.use(passport.session());

  // Auto-logout middleware removed - sessions now persist indefinitely

  router.use(checkUserBlacklist); // Check if user is blacklisted
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

  /**
   * Middleware to check if user is blacklisted
   * Must be called AFTER authentication check
   */
  function checkUserBlacklist(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      if (isUserBlacklisted(req.user.id)) {
        console.log(`🚫 Blacklisted user blocked: ${req.user.username} (${req.user.id})`);
        req.logout(() => {});
        return res.status(403).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zugriff gesperrt</title>
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
    .icon { font-size: 5rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🚫</div>
    <h1>Zugriff gesperrt</h1>
    <p><strong>Dein Account wurde vom Panel-Zugriff ausgeschlossen.</strong></p>
  </div>
</body>
</html>
        `);
      }
    }
    next();
  }

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

  // Simple authentication middleware (no admin check, just login check)
  function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    res.redirect('/login');
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
  // Founder-only middleware (restricted to 3 specific IDs)
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

      console.log('=== isAuthOrTeam Debug ===');
      console.log('User ID:', req.user.id);
      console.log('Guild ID:', guildId);
      console.log('Team Role ID in Config:', cfg.teamRoleId);

      if(!cfg.teamRoleId) {
        console.log('❌ Keine Team-Rolle konfiguriert!');
        return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte oder die Team-Rolle.');
      }

      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(req.user.id);

      const memberRoles = member.roles.cache.map(r => `${r.name} (${r.id})`);
      console.log('Member Roles:', memberRoles);

      // Support both string and array for teamRoleId
      const teamRoleIds = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
      console.log('Team Role IDs to check:', teamRoleIds);

      const hasTeamRole = teamRoleIds.some(roleId => member.roles.cache.has(roleId));
      console.log('Has Team Role:', hasTeamRole);

      if(hasTeamRole) {
        console.log('✅ Team-Mitglied hat Zugriff!');
        req.isAdmin = false; // Team-Mitglied, kein Admin
        return next();
      }

      console.log('❌ Team-Mitglied hat NICHT die erforderliche Team-Rolle!');
      return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte oder die Team-Rolle.');
    } catch(err) {
      console.error('❌ Team Role Check Error:', err);
      return res.status(403).send('Keine Berechtigung. Du brauchst Administrator-Rechte oder die Team-Rolle.');
    }
  }

  // ============================================================
  // MULTER FILE UPLOAD CONFIGURATION
  // ============================================================

  // Ensure avatars directory exists
  const avatarsDir = path.join(__dirname, 'public', 'avatars');
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }

  // Configure multer storage
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, avatarsDir);
    },
    filename: function (req, file, cb) {
      const guildId = req.session.selectedGuild;
      const ext = path.extname(file.originalname);
      cb(null, `avatar_${guildId}_${Date.now()}${ext}`);
    }
  });

  // File filter for images only
  const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilder sind erlaubt (PNG, JPG, GIF, WEBP)'), false);
    }
  };

  const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });

  // ============================================================
  // ROUTES
  // ============================================================

  router.get('/', async (req,res)=>{
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
    let averageRating = 0;
    let totalRatings = 0;

    try {
      const feedbackFile = './feedback.json';
      if (fs.existsSync(feedbackFile)) {
        const allFeedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));

        // Calculate average rating (only from general feedbacks with rating > 0)
        const ratedFeedbacks = allFeedbacks.filter(f => f.type === 'general' && f.rating && f.rating > 0);
        if (ratedFeedbacks.length > 0) {
          const totalRating = ratedFeedbacks.reduce((sum, f) => sum + f.rating, 0);
          averageRating = (totalRating / ratedFeedbacks.length).toFixed(1);
          totalRatings = ratedFeedbacks.length;
        }

        // Sort by timestamp (newest first) and limit to 6 for display
        feedbacks = allFeedbacks
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 6);
      }
    } catch(err) {
      console.error('Error loading feedbacks:', err);
    }

    // Load partner servers
    let partnerServers = [];
    try {
      const partners = listPartnerServers();

      for (const partner of partners) {
        try {
          const guild = await client.guilds.fetch(partner.guildId);
          partnerServers.push({
            guildId: partner.guildId,
            name: guild.name,
            icon: guild.iconURL({ size: 128, extension: 'png' }) || null,
            link: partner.partnerLink || null,
            partnerUserId: partner.partnerUserId
          });
        } catch (err) {
          console.error(`Error fetching partner guild ${partner.guildId}:`, err);
        }
      }
    } catch(err) {
      console.error('Error loading partner servers:', err);
    }

    res.render('home', {
      lang: lang,
      t: getTranslations(lang),
      user: isAuthenticated ? req.user : null,
      isAuthenticated: isAuthenticated,
      totalGuilds: totalGuilds || 150,
      totalTickets: totalTickets || 5000,
      feedbacks: feedbacks,
      averageRating: averageRating,
      totalRatings: totalRatings,
      partnerServers: partnerServers
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
      if (!name || !type || !message) {
        return res.redirect('/feedback?error=true');
      }

      // Rating validation (only for general feedback)
      let ratingNum = 0;
      if (type === 'general') {
        ratingNum = parseInt(rating);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
          return res.redirect('/feedback?error=true');
        }
      } else {
        // For non-general feedback, rating is 0
        ratingNum = 0;
      }

      const feedback = {
        id: Date.now().toString(),
        name: sanitizeString(name.trim(), 100),
        email: email ? sanitizeEmail(email.trim()) : '',
        type: sanitizeString(type, 50),
        rating: ratingNum,
        message: sanitizeString(message.trim(), 2000),
        userId: validateDiscordId(req.user.id) || req.user.id,
        username: sanitizeUsername(req.user.username || req.user.tag || req.user.id),
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

      // Sammle Server mit Team-Rolle
      // Durchlaufe ALLE Bot-Server, nicht nur req.user.guilds
      const teamServers = [];
      const adminServerIds = new Set(adminServers.map(s => s.id));

      for (const [guildId, guildData] of botGuilds) {
        // Skip wenn User bereits Admin auf diesem Server ist
        if (adminServerIds.has(guildId)) continue;

        try {
          const cfg = readCfg(guildId);
          if (!cfg.teamRoleId) continue;

          const guild = await client.guilds.fetch(guildId);
          const member = await guild.members.fetch(req.user.id).catch(() => null);

          if (!member) continue;

          // Support both string and array for teamRoleId
          const teamRoleIds = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
          const hasTeamRole = teamRoleIds.some(roleId => member.roles.cache.has(roleId));

          if (hasTeamRole) {
            teamServers.push({
              id: guildId,
              name: guild.name,
              icon: guild.icon,
              hasBot: true,
              permissions: '0' // Team members haben keine Admin-Permissions
            });
          }
        } catch (err) {
          console.error(`Error checking team role for guild ${guildId}:`, err);
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

    const guildId = validateDiscordId(req.body.guildId);
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

      if(member) {
        // Support both string and array for teamRoleId
        const teamRoleIds = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
        const hasTeamRole = teamRoleIds.some(roleId => member.roles.cache.has(roleId));

        if(hasTeamRole) {
          req.session.selectedGuild = guildId;
          return res.redirect('/panel');
        }
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
  }, passport.authenticate('discord', { prompt: 'none' }));

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

      // Check if user is blacklisted
      if (isUserBlacklisted(user.id)) {
        console.log(`🚫 Blacklisted user attempted login: ${user.username} (${user.id})`);
        return res.status(403).send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Zugriff gesperrt</title>
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
    .icon { font-size: 5rem; margin-bottom: 1rem; }
    .warning-box {
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
    <div class="icon">🚫</div>
    <h1>Zugriff gesperrt</h1>
    <p><strong>Dein Account wurde vom Panel-Zugriff ausgeschlossen.</strong></p>

    <div class="warning-box">
      <strong>ℹ️ Hinweis:</strong><br>
      Wenn du denkst, dies ist ein Fehler, kontaktiere bitte die Administratoren.
    </div>
  </div>
</body>
</html>
        `);
      }

      // Track user login
      trackUserLogin(user);

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
    const { getTicketSystem, getDefaultTicketSystem, getAllTicketSystems, migrateToTicketSystems } = require('./ticket-systems');

    // Migrate config to multi-system if needed
    const cfg = migrateToTicketSystems(guildId);

    // Get selected system from query parameter or use default
    const selectedSystemId = req.query.system || 'default';
    const selectedSystem = getTicketSystem(guildId, selectedSystemId) || getDefaultTicketSystem(guildId);

    // Get all systems for dropdown
    const allSystems = getAllTicketSystems(guildId);

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
    if (!cfg.applicationEmbed) {
      cfg.applicationEmbed = {
        title: '',
        description: '',
        color: '#10b981',
        footer: ''
      };
      needsSave = true;
    }
    if (needsSave) {
      writeCfg(guildId, cfg);
    }

    let channels = [];
    let categories = [];
    let voiceChannels = [];
    let roles = [];
    let guildName = 'Server';
    let guildIcon = null;
    try {
      const guild = await client.guilds.fetch(guildId);
      guildName = guild.name;
      guildIcon = guild.iconURL({ size: 128, extension: 'png' });

      const fetchedChannels = await guild.channels.fetch();
      channels = fetchedChannels
        .filter(ch => ch.type === 0 || ch.type === 4)
        .map(ch => ({ id: ch.id, name: ch.name, type: ch.type }))
        .sort((a,b) => a.name.localeCompare(b.name));

      // Extract categories separately for application system
      categories = fetchedChannels
        .filter(ch => ch.type === 4)
        .map(ch => ({ id: ch.id, name: ch.name }))
        .sort((a,b) => a.name.localeCompare(b.name));

      // Extract voice channels for voice support system
      voiceChannels = fetchedChannels
        .filter(ch => ch.type === 2)
        .map(ch => ({ id: ch.id, name: ch.name }))
        .sort((a,b) => a.name.localeCompare(b.name));

      const fetchedRoles = await guild.roles.fetch();
      roles = fetchedRoles
        .filter(r => r.id !== guild.id)
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
        .sort((a,b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    } catch(err) {
      console.error('Fehler beim Laden der Channels/Rollen:', err);
    }

    const premiumInfo = getPremiumInfo(guildId);

    res.render('panel', {
      cfg,
      system: selectedSystem, // Current ticket system
      selectedSystem: selectedSystemId, // ID of selected system
      allSystems, // All ticket systems for dropdown
      msg: req.query.msg||null,
      channels,
      categories,
      voiceChannels,
      roles,
      version: VERSION,
      guildName,
      guildId,
      guildIcon,
      selectedGuild: guildId, // Add selectedGuild for hasFeature checks
      premiumTier: premiumInfo.tier,
      premiumTierName: premiumInfo.tierName,
      isPremium: premiumInfo.isActive,
      isTrial: premiumInfo.isTrial || false,
      trialInfo: premiumInfo.trialInfo || null,
      isAdmin: req.isAdmin, // Flag ob User Admin ist oder nur Team-Mitglied
      user: req.user, // User object for display
      t: res.locals.t, // Translation object
      lang: res.locals.lang, // Language code
      hasFeature: hasFeature // Add hasFeature function
    });
  });

  // ============================================================
  // AVATAR UPLOAD ROUTE
  // ============================================================

  router.post('/panel/upload-avatar', isAuth, upload.single('avatar'), async (req, res) => {
    const guildId = req.session.selectedGuild;

    // Check Basic+ feature
    if (!hasFeature(guildId, 'customAvatar')) {
      if (req.file) {
        // Delete uploaded file if no permission
        fs.unlinkSync(req.file.path);
      }
      return res.json({ success: false, error: 'Basic+ Premium erforderlich' });
    }

    try {
      if (!req.file) {
        return res.json({ success: false, error: 'Keine Datei hochgeladen' });
      }

      // Generate public URL for avatar
      const avatarUrl = `/avatars/${req.file.filename}`;

      // Update config
      const cfg = readCfg(guildId);

      // Delete old avatar file if it exists and is a local file
      if (cfg.customAvatarUrl && cfg.customAvatarUrl.startsWith('/avatars/')) {
        const oldFilename = path.basename(cfg.customAvatarUrl);
        const oldFilePath = path.join(avatarsDir, oldFilename);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      cfg.customAvatarUrl = avatarUrl;
      writeCfg(guildId, cfg);

      await logEvent(guildId, `✅ Custom Avatar hochgeladen von <@${req.user.id}>`, req.user);

      res.json({ success: true, avatarUrl });
    } catch (error) {
      console.error('Avatar upload error:', error);
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.json({ success: false, error: 'Upload fehlgeschlagen' });
    }
  });

  // Delete Avatar Route
  router.post('/panel/delete-avatar', isAuth, async (req, res) => {
    const guildId = req.session.selectedGuild;

    try {
      const cfg = readCfg(guildId);

      // Delete avatar file if it's a local file
      if (cfg.customAvatarUrl && cfg.customAvatarUrl.startsWith('/avatars/')) {
        const filename = path.basename(cfg.customAvatarUrl);
        const filePath = path.join(avatarsDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      cfg.customAvatarUrl = null;
      writeCfg(guildId, cfg);

      await logEvent(guildId, `🗑️ Custom Avatar gelöscht von <@${req.user.id}>`, req.user);

      res.json({ success: true });
    } catch (error) {
      console.error('Avatar delete error:', error);
      res.json({ success: false, error: 'Löschen fehlgeschlagen' });
    }
  });

  // Multi-Ticket-System: Create new system
  router.post('/panel/system/create', isAuth, async (req, res) => {
    const guildId = req.session.selectedGuild;

    // Check Pro feature
    if (!hasFeature(guildId, 'multiTicketSystems')) {
      return res.json({ success: false, error: 'Pro feature required' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.json({ success: false, error: 'Invalid name' });
    }

    try {
      const { createTicketSystem } = require('./ticket-systems');
      const newSystem = createTicketSystem(guildId, { name: name.trim() });

      res.json({ success: true, systemId: newSystem.id });
    } catch (error) {
      console.error('Error creating ticket system:', error);
      res.json({ success: false, error: 'Internal error' });
    }
  });

  // Multi-Ticket-System: Delete system
  router.post('/panel/system/:systemId/delete', isAuth, async (req, res) => {
    const guildId = req.session.selectedGuild;
    const { systemId } = req.params;

    // Check Pro feature
    if (!hasFeature(guildId, 'multiTicketSystems')) {
      return res.json({ success: false, error: 'Pro feature required' });
    }

    // Cannot delete default system
    if (systemId === 'default') {
      return res.json({ success: false, error: 'Cannot delete default system' });
    }

    try {
      const { deleteTicketSystem } = require('./ticket-systems');
      const success = deleteTicketSystem(guildId, systemId);

      res.json({ success });
    } catch (error) {
      console.error('Error deleting ticket system:', error);
      res.json({ success: false, error: 'Internal error' });
    }
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

    // Check if updating a specific ticket system (Multi-System)
    const selectedSystemId = req.body.systemId || req.query.system;
    if (selectedSystemId && selectedSystemId !== 'default' && hasFeature(guildId, 'multiTicketSystems')) {
      try {
        const { getTicketSystem, updateTicketSystem, migrateToTicketSystems } = require('./ticket-systems');
        migrateToTicketSystems(guildId);

        const system = getTicketSystem(guildId, selectedSystemId);
        if (!system) {
          return res.redirect('/panel?msg=error&system=' + selectedSystemId);
        }

        // Update system-specific fields
        const systemUpdates = {
          name: sanitizeString(req.body.systemName || system.name, 100),
          enabled: req.body.systemEnabled === 'true' || req.body.systemEnabled === true,
          topics: system.topics, // Keep existing topics (will be updated separately)
          teamRoleId: sanitizeDiscordId(req.body.teamRoleId),
          categoryId: sanitizeDiscordId(req.body.categoryId),
          logChannelId: Array.isArray(req.body.logChannelId)
            ? req.body.logChannelId.filter(id => id && id.trim()).map(id => sanitizeDiscordId(id) || id.trim())
            : (req.body.logChannelId ? [sanitizeDiscordId(req.body.logChannelId) || req.body.logChannelId.trim()] : []),
          transcriptChannelId: Array.isArray(req.body.transcriptChannelId)
            ? req.body.transcriptChannelId.filter(id => id && id.trim()).map(id => sanitizeDiscordId(id) || id.trim())
            : (req.body.transcriptChannelId ? [sanitizeDiscordId(req.body.transcriptChannelId) || req.body.transcriptChannelId.trim()] : []),
          embedTitle: sanitizeString(req.body.embedTitle || system.embedTitle, 256),
          embedDescription: sanitizeString(req.body.embedDescription || system.embedDescription, 4096),
          embedColor: req.body.embedColor || system.embedColor,
          notifyUserOnStatusChange: req.body.notifyUserOnStatusChange !== 'false'
        };

        // Priority roles
        const priorityRoles = {};
        for (let i = 0; i <= 2; i++) {
          const rolesStr = req.body[`priorityRole${i}`];
          if (rolesStr) {
            priorityRoles[i] = rolesStr.split(',')
              .map(id => id.trim())
              .filter(id => id)
              .map(id => sanitizeDiscordId(id) || id);
          }
        }
        systemUpdates.priorityRoles = priorityRoles;

        updateTicketSystem(guildId, selectedSystemId, systemUpdates);

        return res.redirect('/panel?msg=saved&system=' + selectedSystemId);
      } catch (error) {
        console.error('Error updating ticket system:', error);
        return res.redirect('/panel?msg=error&system=' + selectedSystemId);
      }
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

      cfg.sendTranscriptToCreator = req.body.sendTranscriptToCreator === 'on' || req.body.sendTranscriptToCreator === true;

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

      // Auto-Priority System (per-role configuration)
      if (req.body.autoPriorityConfig) {
        try {
          const config = JSON.parse(req.body.autoPriorityConfig);
          cfg.autoPriorityConfig = Array.isArray(config)
            ? config
                .filter(item => item && item.roleId && typeof item.roleId === 'string' && item.roleId.trim())
                .map(item => ({
                  roleId: String(item.roleId).trim(),
                  level: parseInt(item.level, 10) || 0
                }))
            : [];
        } catch (e) {
          console.error('Error parsing autoPriorityConfig:', e);
          cfg.autoPriorityConfig = cfg.autoPriorityConfig || [];
        }
      }

      if(req.body.githubWebhookChannelId){
        cfg.githubWebhookChannelId = req.body.githubWebhookChannelId.trim();
      } else {
        cfg.githubWebhookChannelId = null;
      }

      // GitHub Commits Enabled (checkbox)
      cfg.githubCommitsEnabled = req.body.githubCommitsEnabled === 'true' || req.body.githubCommitsEnabled === 'on';

      // Ticket Archive Settings
      cfg.archiveEnabled = req.body.archiveEnabled === 'true';
      if(req.body.archiveCategoryId){
        const archiveCatId = sanitizeDiscordId(req.body.archiveCategoryId);
        cfg.archiveCategoryId = archiveCatId || req.body.archiveCategoryId.trim();
      } else {
        cfg.archiveCategoryId = null;
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

      // Process Tags (Basic+ Feature)
      const customTags = [];
      let tagIndex = 0;
      while(true) {
        const idKey = `tag_id_${tagIndex}`;
        const labelKey = `tag_label_${tagIndex}`;
        const emojiKey = `tag_emoji_${tagIndex}`;
        const colorKey = `tag_color_${tagIndex}`;

        // Check if tag exists
        if(!Object.prototype.hasOwnProperty.call(req.body, idKey)) {
          break;
        }

        const id = sanitizeString(req.body[idKey], 100);
        const label = sanitizeString(req.body[labelKey], 50);
        const emoji = sanitizeString(req.body[emojiKey], 10);
        const color = sanitizeString(req.body[colorKey], 10);

        if(id && label) {
          customTags.push({
            id: id,
            label: label,
            emoji: emoji || '🏷️',
            color: color || '#00ff88'
          });
        }

        tagIndex++;
      }

      cfg.customTags = customTags;

      // Process Templates (Basic+ Feature)
      const templates = [];
      let templateIndex = 0;
      while(true) {
        const idKey = `template_id_${templateIndex}`;
        const nameKey = `template_name_${templateIndex}`;
        const descriptionKey = `template_description_${templateIndex}`;
        const contentKey = `template_content_${templateIndex}`;
        const colorKey = `template_color_${templateIndex}`;

        // Check if template exists
        if(!Object.prototype.hasOwnProperty.call(req.body, idKey)) {
          break;
        }

        const id = sanitizeString(req.body[idKey], 100);
        const name = sanitizeString(req.body[nameKey], 100);
        const description = sanitizeString(req.body[descriptionKey], 150);
        const content = sanitizeString(req.body[contentKey], 2000);
        const color = sanitizeString(req.body[colorKey], 10);

        if(id && name && content) {
          templates.push({
            id: id,
            name: name,
            description: description || '',
            content: content,
            color: color || '#0ea5e9'
          });
        }

        templateIndex++;
      }

      cfg.templates = templates;

      // Process Departments (Basic+ Feature)
      const departments = [];
      let deptIndex = 0;
      while(true) {
        const idKey = `dept_id_${deptIndex}`;
        if(!Object.prototype.hasOwnProperty.call(req.body, idKey)) break;

        const id = sanitizeString(req.body[idKey], 100);
        const name = sanitizeString(req.body[`dept_name_${deptIndex}`], 100);
        const emoji = sanitizeString(req.body[`dept_emoji_${deptIndex}`], 10);
        const description = sanitizeString(req.body[`dept_description_${deptIndex}`], 500);
        const teamRole = sanitizeString(req.body[`dept_teamRole_${deptIndex}`], 20);

        if(id && name) {
          departments.push({
            id: id,
            name: name,
            emoji: emoji || '📁',
            description: description || '',
            teamRole: teamRole || ''
          });
        }

        deptIndex++;
      }

      cfg.departments = departments;

      // Process Custom Branding (Pro Feature)
      cfg.branding = {
        primaryColor: sanitizeString(req.body.brandingPrimaryColor, 10) || '#0ea5e9',
        successColor: sanitizeString(req.body.brandingSuccessColor, 10) || '#00ff88',
        errorColor: sanitizeString(req.body.brandingErrorColor, 10) || '#ff4444',
        warningColor: sanitizeString(req.body.brandingWarningColor, 10) || '#ff9900',
        claimButtonText: sanitizeString(req.body.brandingClaimButtonText, 50) || 'Ticket claimen',
        closeButtonText: sanitizeString(req.body.brandingCloseButtonText, 50) || 'Ticket schließen',
        unclaimButtonText: sanitizeString(req.body.brandingUnclaimButtonText, 50) || 'Unclaimen',
        reopenButtonText: sanitizeString(req.body.brandingReopenButtonText, 50) || 'Erneut öffnen'
      };

      // Process topics from individual card inputs (like form fields)
      const topics = [];
      let topicIndex = 0;
      while(true) {
        const labelKey = `topic_label_${topicIndex}`;
        const valueKey = `topic_value_${topicIndex}`;
        const emojiKey = `topic_emoji_${topicIndex}`;

        // Check if topic exists
        if(!Object.prototype.hasOwnProperty.call(req.body, labelKey)) {
          break;
        }

        const label = (req.body[labelKey] || '').trim();
        const value = (req.body[valueKey] || '').trim();
        const emoji = (req.body[emojiKey] || '').trim();

        if(label && value) {
          topics.push({
            label: label,
            value: value,
            emoji: emoji || '📌'
          });
        }

        topicIndex++;
      }

      cfg.topics = topics;

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

      const prevAE = cfg.applicationEmbed || {};
      cfg.applicationEmbed = {
        title:       sanitizeString(take('applicationEmbedTitle',       prevAE.title), 256),
        description: sanitizeString(take('applicationEmbedDescription', prevAE.description), 4096),
        color:       ensureHex(take('applicationEmbedColor', prevAE.color), '#10b981'),
        footer:      sanitizeString(take('applicationEmbedFooter',      prevAE.footer), 2048)
      };

      // Auto-Close Configuration (kostenlos für alle)
      if (!cfg.autoClose) cfg.autoClose = {};
      cfg.autoClose.enabled = req.body.autoCloseEnabled === 'on';
      // Zeit in Stunden (min: 25h damit Warnung 24h vorher funktioniert, max: 720h = 30 Tage)
      cfg.autoClose.inactiveHours = sanitizeNumber(req.body.autoCloseInactiveHours, 25, 720) || 72;

      // Parse excludePriority as array
      if (req.body.autoCloseExcludePriority) {
        const excludeStr = Array.isArray(req.body.autoCloseExcludePriority)
          ? req.body.autoCloseExcludePriority
          : [req.body.autoCloseExcludePriority];
        cfg.autoClose.excludePriority = excludeStr
          .map(p => parseInt(p, 10))
          .filter(p => !isNaN(p) && p >= 0 && p <= 2);
      } else {
        cfg.autoClose.excludePriority = [];
      }

      // Multi-Ticket Configuration
      cfg.maxTicketsPerUser = sanitizeNumber(req.body.maxTicketsPerUser, 0, 100) || 3;
      cfg.notifyUserOnStatusChange = req.body.notifyUserOnStatusChange !== 'off';

      // AntiSpam Configuration
      if (!cfg.antiSpam) {
        cfg.antiSpam = {
          enabled: true,
          maxTickets: 3,
          timeWindowMinutes: 10,
          maxButtonClicks: 5,
          buttonTimeWindowSeconds: 10
        };
      }

      cfg.antiSpam.enabled = req.body.antiSpamEnabled !== 'off';
      cfg.antiSpam.maxTickets = sanitizeNumber(req.body.antiSpamMaxTickets, 1, 20) || 3;
      cfg.antiSpam.timeWindowMinutes = sanitizeNumber(req.body.antiSpamTimeWindow, 1, 120) || 10;

      // Ticket Rating Configuration
      if (!cfg.ticketRating) {
        cfg.ticketRating = {
          enabled: true,
          requireFeedback: false,
          showInAnalytics: true
        };
      }

      cfg.ticketRating.enabled = req.body.ticketRatingEnabled === 'on';
      cfg.ticketRating.requireFeedback = req.body.ticketRatingRequireFeedback === 'on';
      cfg.ticketRating.showInAnalytics = req.body.ticketRatingShowInAnalytics === 'on';

      // Survey System Configuration (Basic+ Feature)
      if (!cfg.surveySystem) {
        cfg.surveySystem = {
          enabled: false,
          sendOnClose: true,
          showInAnalytics: true,
          defaultQuestions: [
            {
              id: 'satisfaction',
              type: 'rating',
              text: { de: 'Wie zufrieden bist du mit dem Support?', en: 'How satisfied are you with the support?' },
              required: true
            },
            {
              id: 'recommend',
              type: 'nps',
              text: { de: 'Wie wahrscheinlich ist es, dass du uns weiterempfiehlst?', en: 'How likely are you to recommend us?' },
              required: true
            },
            {
              id: 'feedback',
              type: 'text',
              text: { de: 'Was können wir besser machen?', en: 'What can we improve?' },
              required: false,
              maxLength: 1000
            }
          ]
        };
      }

      cfg.surveySystem.enabled = req.body.surveySystemEnabled === 'on';
      cfg.surveySystem.sendOnClose = req.body.surveySystemSendOnClose !== 'off';
      cfg.surveySystem.showInAnalytics = req.body.surveySystemShowInAnalytics !== 'off';

      // Ensure defaultQuestions exist when enabling survey system
      if (cfg.surveySystem.enabled && (!cfg.surveySystem.defaultQuestions || cfg.surveySystem.defaultQuestions.length === 0)) {
        cfg.surveySystem.defaultQuestions = [
          {
            id: 'satisfaction',
            type: 'rating',
            text: { de: 'Wie zufrieden bist du mit dem Support?', en: 'How satisfied are you with the support?' },
            required: true
          },
          {
            id: 'recommend',
            type: 'nps',
            text: { de: 'Wie wahrscheinlich ist es, dass du uns weiterempfiehlst?', en: 'How likely are you to recommend us?' },
            required: true
          },
          {
            id: 'feedback',
            type: 'text',
            text: { de: 'Was können wir besser machen?', en: 'What can we improve?' },
            required: false,
            maxLength: 1000
          }
        ];
      }

      // SLA System Configuration (Pro Feature)
      if (!cfg.sla) {
        cfg.sla = {
          enabled: false,
          priority0Hours: 24,
          priority1Hours: 4,
          priority2Hours: 1,
          warnAtPercent: 80,
          escalateToRole: null
        };
      }

      if (hasFeature(guildId, 'slaSystem')) {
        cfg.sla.enabled = req.body.slaEnabled === 'on';
        cfg.sla.priority0Hours = sanitizeNumber(req.body.slaPriority0Hours, 1, 168) || 24;
        cfg.sla.priority1Hours = sanitizeNumber(req.body.slaPriority1Hours, 1, 72) || 4;
        cfg.sla.priority2Hours = sanitizeNumber(req.body.slaPriority2Hours, 1, 24) || 1;
        cfg.sla.warnAtPercent = sanitizeNumber(req.body.slaWarnAtPercent, 50, 95) || 80;
        cfg.sla.escalateToRole = sanitizeString(req.body.slaEscalateToRole, 30) || null;
        if (cfg.sla.escalateToRole === '') cfg.sla.escalateToRole = null;
      }

      // Voice-Support Configuration (Basic+ Feature)
      if (!cfg.voiceSupport) {
        cfg.voiceSupport = {
          enabled: false,
          showButton: true
        };
      }

      if (hasFeature(guildId, 'voiceSupport')) {
        cfg.voiceSupport.enabled = req.body.voiceSupportEnabled === 'on';
        cfg.voiceSupport.showButton = req.body.voiceSupportShowButton !== 'off';
      }

      // Auto-Assignment Configuration (Basic+ Feature)
      const { getDefaultAutoAssignmentConfig } = require('./auto-assignment');
      if (!cfg.autoAssignment) {
        cfg.autoAssignment = getDefaultAutoAssignmentConfig();
      }

      cfg.autoAssignment.enabled = req.body.autoAssignmentEnabled === 'on';
      cfg.autoAssignment.assignOnCreate = req.body.autoAssignmentAssignOnCreate !== 'off';
      cfg.autoAssignment.notifyAssignee = req.body.autoAssignmentNotifyAssignee !== 'off';
      cfg.autoAssignment.strategy = req.body.autoAssignmentStrategy || 'workload';

      // Pro features
      if (hasFeature(guildId, 'autoAssignment')) {
        cfg.autoAssignment.checkOnlineStatus = req.body.autoAssignmentCheckOnlineStatus === 'on';
      }

      // Auto-Responses / FAQ Configuration (Free Feature)
      if (!cfg.autoResponses) cfg.autoResponses = { enabled: true, responses: [] };
      cfg.autoResponses.enabled = req.body.autoResponsesEnabled !== 'off';

      // Process auto-responses
      const autoResponses = [];
      let arIndex = 0;
      while(true) {
        const questionKey = `autoResponse_question_${arIndex}`;
        const answerKey = `autoResponse_answer_${arIndex}`;
        const keywordsKey = `autoResponse_keywords_${arIndex}`;

        if(!Object.prototype.hasOwnProperty.call(req.body, questionKey)) {
          break;
        }

        const question = sanitizeString(req.body[questionKey], 500);
        const answer = sanitizeString(req.body[answerKey], 2000);
        const keywords = sanitizeString(req.body[keywordsKey], 500);

        if(question && answer) {
          autoResponses.push({
            question: question,
            answer: answer,
            keywords: keywords ? keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [],
            id: `ar_${arIndex}`
          });
        }

        arIndex++;
      }

      cfg.autoResponses.responses = autoResponses;

      // Application System Configuration (Basic+ Feature)
      const serverLang = cfg.language || 'de';
      if (!cfg.applicationSystem) {
        cfg.applicationSystem = {
          enabled: false,
          panelChannelId: null,
          categoryId: null,
          teamRoleId: null,
          panelTitle: serverLang === 'de' ? '📝 Bewerbungen' : '📝 Applications',
          panelDescription: serverLang === 'de' ? 'Möchtest du Teil unseres Teams werden? Klicke auf den Button unten und fülle das Bewerbungsformular aus!' : 'Want to join our team? Click the button below and fill out the application form!',
          panelColor: '#3b82f6',
          buttonText: serverLang === 'de' ? '📝 Jetzt bewerben' : '📝 Apply Now',
          ticketTitle: serverLang === 'de' ? '📝 Bewerbung von {username}' : '📝 Application from {username}',
          ticketDescription: serverLang === 'de' ? 'Willkommen {username}! Vielen Dank für deine Bewerbung. Unser Team wird sie prüfen und sich zeitnah bei dir melden.' : 'Welcome {username}! Thank you for your application. Our team will review it and get back to you soon.',
          ticketColor: '#10b981',
          formFields: [
            { label: serverLang === 'de' ? 'Wie alt bist du?' : 'How old are you?', id: 'age', style: 'short', required: true },
            { label: serverLang === 'de' ? 'Warum möchtest du Teil unseres Teams werden?' : 'Why do you want to join our team?', id: 'motivation', style: 'paragraph', required: true },
            { label: serverLang === 'de' ? 'Hast du Erfahrung in diesem Bereich?' : 'Do you have experience in this field?', id: 'experience', style: 'paragraph', required: true }
          ]
        };
      }

      const hasApplicationSystemFeature = hasFeature(guildId, 'applicationSystem');
      console.log('=== Application System Debug ===');
      console.log('Guild ID:', guildId);
      console.log('Has applicationSystem Feature:', hasApplicationSystemFeature);
      console.log('applicationSystemEnabled from form:', req.body.applicationSystemEnabled);

      if (hasApplicationSystemFeature) {
        cfg.applicationSystem.enabled = req.body.applicationSystemEnabled === 'on';
        cfg.applicationSystem.panelChannelId = sanitizeDiscordId(req.body.applicationPanelChannelId) || null;
        cfg.applicationSystem.categoryId = sanitizeDiscordId(req.body.applicationCategoryId) || null;
        cfg.applicationSystem.teamRoleId = sanitizeDiscordId(req.body.applicationTeamRoleId) || null;
        cfg.applicationSystem.panelTitle = sanitizeString(req.body.applicationPanelTitle, 256) || cfg.applicationSystem.panelTitle;
        cfg.applicationSystem.panelDescription = sanitizeString(req.body.applicationPanelDescription, 2048) || cfg.applicationSystem.panelDescription;
        cfg.applicationSystem.panelColor = sanitizeString(req.body.applicationPanelColor, 7) || '#3b82f6';
        cfg.applicationSystem.buttonText = sanitizeString(req.body.applicationButtonText, 80) || cfg.applicationSystem.buttonText;
        cfg.applicationSystem.ticketTitle = sanitizeString(req.body.applicationTicketTitle, 256) || cfg.applicationSystem.ticketTitle;
        cfg.applicationSystem.ticketDescription = sanitizeString(req.body.applicationTicketDescription, 2048) || cfg.applicationSystem.ticketDescription;
        cfg.applicationSystem.ticketColor = sanitizeString(req.body.applicationTicketColor, 7) || '#10b981';

        // Cooldown & Requirements
        cfg.applicationSystem.cooldownDays = sanitizeNumber(req.body.applicationCooldownDays, 0, 365) || 0;
        cfg.applicationSystem.minAccountAgeDays = sanitizeNumber(req.body.applicationMinAccountAge, 0, 365) || 0;
        cfg.applicationSystem.minServerJoinDays = sanitizeNumber(req.body.applicationMinServerJoin, 0, 365) || 0;

        // Voting System
        cfg.applicationSystem.votingEnabled = req.body.applicationVotingEnabled === 'on';
        cfg.applicationSystem.votingChannelId = sanitizeDiscordId(req.body.applicationVotingChannelId) || null;

        // Auto-Expire & Archive
        cfg.applicationSystem.autoExpireDays = sanitizeNumber(req.body.applicationAutoExpireDays, 0, 365) || 0;
        cfg.applicationSystem.archiveChannelId = sanitizeDiscordId(req.body.applicationArchiveChannelId) || null;

        // Interview System
        cfg.applicationSystem.interviewEnabled = req.body.applicationInterviewEnabled === 'on';
        cfg.applicationSystem.interviewReminderMinutes = sanitizeNumber(req.body.applicationInterviewReminderMinutes, 5, 1440) || 30;

        // Blacklist
        const blacklistText = req.body.applicationBlacklist || '';
        cfg.applicationSystem.blacklist = blacklistText.split('\n')
          .map(id => id.trim())
          .filter(id => /^\d{17,20}$/.test(id));

        // Process Application Form Fields (New format: applicationField_label_0, applicationField_id_0, etc.)
        const appFormFields = [];
        for (let i = 0; i < 5; i++) { // Max 5 fields (Discord Limit)
          const label = req.body[`applicationField_label_${i}`];
          const id = req.body[`applicationField_id_${i}`];
          const style = req.body[`applicationField_style_${i}`];
          const required = req.body[`applicationField_required_${i}`];

          if (label && id) {
            appFormFields.push({
              label: sanitizeString(label, 45), // Discord Modal label limit
              id: sanitizeString(id, 100).replace(/[^a-z0-9_]/g, ''), // Only lowercase, numbers, underscores
              style: ['short', 'paragraph', 'number'].includes(style) ? style : 'short', // short, paragraph or number
              required: required === 'on' || required === true
            });
          }
        }

        // Always update fields (empty array if no fields provided) - Legacy support
        cfg.applicationSystem.formFields = appFormFields;

        // Process Positions Embed Settings
        if (!cfg.applicationSystem.positionsEmbed) cfg.applicationSystem.positionsEmbed = {};
        cfg.applicationSystem.positionsEmbed.enabled = req.body.positionsEmbedEnabled === 'on';
        cfg.applicationSystem.positionsEmbed.title = sanitizeString(req.body.positionsEmbedTitle, 256) || '';
        cfg.applicationSystem.positionsEmbed.description = sanitizeString(req.body.positionsEmbedDescription, 2048) || '';
        cfg.applicationSystem.positionsEmbed.color = sanitizeString(req.body.positionsEmbedColor, 7) || '#3b82f6';

        // Process Application Categories (New system)
        const appCategories = [];
        for (let catIdx = 0; catIdx < 25; catIdx++) { // Max 25 categories (Discord Select Menu Limit)
          const catName = req.body[`appCat_name_${catIdx}`];
          if (!catName) continue; // Skip if no name

          const category = {
            id: `cat_${catIdx}_${Date.now()}`,
            name: sanitizeString(catName, 100),
            emoji: sanitizeString(req.body[`appCat_emoji_${catIdx}`], 10) || '',
            description: sanitizeString(req.body[`appCat_description_${catIdx}`], 100) || '',
            teamRoleId: sanitizeDiscordId(req.body[`appCat_teamRoleId_${catIdx}`]) || null,
            status: req.body[`appCat_status_${catIdx}`] === 'closed' ? 'closed' : 'open',
            positionInfo: sanitizeString(req.body[`appCat_positionInfo_${catIdx}`], 200) || '',
            requirements: sanitizeString(req.body[`appCat_requirements_${catIdx}`], 2000) || '',
            formFields: []
          };

          // Process fields for this category
          for (let fieldIdx = 0; fieldIdx < 5; fieldIdx++) { // Max 5 fields per category
            const fieldLabel = req.body[`appCat_${catIdx}_field_label_${fieldIdx}`];
            const fieldId = req.body[`appCat_${catIdx}_field_id_${fieldIdx}`];
            const fieldStyle = req.body[`appCat_${catIdx}_field_style_${fieldIdx}`];
            const fieldRequired = req.body[`appCat_${catIdx}_field_required_${fieldIdx}`];

            if (fieldLabel && fieldId) {
              category.formFields.push({
                label: sanitizeString(fieldLabel, 45),
                id: sanitizeString(fieldId, 100).replace(/[^a-z0-9_]/g, ''),
                style: ['short', 'paragraph', 'number'].includes(fieldStyle) ? fieldStyle : 'short',
                required: fieldRequired === 'on' || fieldRequired === true
              });
            }
          }

          appCategories.push(category);
        }

        cfg.applicationSystem.categories = appCategories;

        console.log(`✅ Application System: ${appCategories.length} Kategorien gespeichert:`, appCategories.map(c => c.name));
      } else {
        console.log('❌ Application System Feature ist nicht verfügbar für diese Guild!');
      }

      // Voice Support Configuration
      if(!cfg.voiceSupport) cfg.voiceSupport = {};

      cfg.voiceSupport.enabled = req.body.voiceSupportEnabled === 'on' || req.body.voiceSupportEnabled === 'true';
      cfg.voiceSupport.mode = req.body.voiceSupportMode === 'category_embed' ? 'category_embed' : 'custom_channels';

      cfg.voiceSupport.waitingRoomChannelId = sanitizeDiscordId(req.body.voiceWaitingRoomChannelId) || null;
      cfg.voiceSupport.supportChannelId = sanitizeDiscordId(req.body.voiceSupportChannelId) || null;
      cfg.voiceSupport.categoryId = sanitizeDiscordId(req.body.voiceCategoryId) || null;
      cfg.voiceSupport.notificationChannelId = sanitizeDiscordId(req.body.voiceNotificationChannelId) || null;

      cfg.voiceSupport.enforceHours = req.body.voiceEnforceHours !== 'false' && req.body.voiceEnforceHours !== false;
      cfg.voiceSupport.customMusicPath = sanitizeString(req.body.voiceCustomMusicPath, 500) || null;
      cfg.voiceSupport.embedTitle = sanitizeString(req.body.voiceEmbedTitle, 256) || 'Neuer Voice Support Fall';
      cfg.voiceSupport.embedColor = sanitizeString(req.body.voiceEmbedColor, 7) || '#3b82f6';

      // Support Hours
      if(!cfg.voiceSupport.supportHours) cfg.voiceSupport.supportHours = {};

      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      days.forEach(day => {
        const enabled = req.body[`voiceHours_${day}_enabled`] === 'on';
        const start = sanitizeString(req.body[`voiceHours_${day}_start`], 5) || '13:00';
        const end = sanitizeString(req.body[`voiceHours_${day}_end`], 5) || '22:00';

        cfg.voiceSupport.supportHours[day] = {
          enabled: enabled,
          start: start,
          end: end
        };
      });

      // Ticket Behavior Settings
      cfg.forceClaimEnabled = req.body.forceClaimEnabled === 'on' || req.body.forceClaimEnabled === 'true';
      // Default to true if not set (for existing servers)
      if (cfg.forceClaimEnabled === undefined) cfg.forceClaimEnabled = true;

      // Changelog Settings
      cfg.changelogEnabled = req.body.changelogEnabled === 'true' || req.body.changelogEnabled === 'on';
      cfg.changelogChannelId = sanitizeDiscordId(req.body.changelogChannelId) || null;

      // AntiSpam Settings
      if (!cfg.antiSpam) cfg.antiSpam = { enabled: false, maxTickets: 3, timeWindowMinutes: 30 };
      cfg.antiSpam.enabled = req.body.antiSpamEnabled === 'true' || req.body.antiSpamEnabled === 'on';
      cfg.antiSpam.maxTickets = sanitizeNumber(req.body.antiSpamMaxTickets, 1, 10) || 3;
      cfg.antiSpam.timeWindowMinutes = sanitizeNumber(req.body.antiSpamTimeWindow, 5, 60) || 30;

      // Application System Settings
      if (!cfg.applications) cfg.applications = { enabled: false };
      cfg.applications.enabled = req.body.applicationsEnabled === 'true' || req.body.applicationsEnabled === 'on';
      cfg.maxApplicationsPerUser = sanitizeNumber(req.body.maxApplicationsPerUser, 1, 5) || 2;

      // File Upload Settings
      if (!cfg.fileUpload) cfg.fileUpload = { maxSizeMB: 10, allowedFormats: ['png', 'jpg', 'jpeg', 'pdf', 'txt', 'log'] };
      cfg.fileUpload.maxSizeMB = sanitizeNumber(req.body.fileUploadMaxSizeMB, 1, 25) || 10;
      if (req.body.fileUploadAllowedFormats) {
        const formats = req.body.fileUploadAllowedFormats.split(',').map(f => f.trim().toLowerCase()).filter(f => f);
        cfg.fileUpload.allowedFormats = formats.length > 0 ? formats : ['png', 'jpg', 'jpeg', 'pdf', 'txt', 'log'];
      }

      // Rating System Settings
      if (!cfg.ratings) cfg.ratings = { enabled: false, sendDM: true, requireFeedback: false };
      cfg.ratings.enabled = req.body.ratingsEnabled === 'true' || req.body.ratingsEnabled === 'on';
      cfg.ratings.sendDM = req.body.ratingsSendDM === 'true' || req.body.ratingsSendDM === 'on';
      cfg.ratings.requireFeedback = req.body.ratingsRequireFeedback === 'true' || req.body.ratingsRequireFeedback === 'on';

      // SLA System Settings
      if (!cfg.sla) cfg.sla = { enabled: false, warnPercent: 80, escalationRoleId: null };
      cfg.sla.enabled = req.body.slaEnabled === 'true' || req.body.slaEnabled === 'on';
      cfg.sla.warnPercent = sanitizeNumber(req.body.slaWarnPercent, 50, 95) || 80;
      cfg.sla.escalationRoleId = sanitizeDiscordId(req.body.slaEscalationRoleId) || null;

      // Voice Support Category (separate from ticket category)
      cfg.voiceSupportCategoryId = sanitizeDiscordId(req.body.voiceSupportCategoryId) || null;

      writeCfg(guildId, cfg);

      // Auto-update Positions Embed in Discord (if exists)
      try {
        const positionsEmbed = cfg.applicationSystem?.positionsEmbed;
        const categories = cfg.applicationSystem?.categories || [];
        const channelId = cfg.applicationSystem?.panelChannelId;
        const messageId = cfg.applicationSystem?.positionsMessageId;

        if (channelId && messageId && categories.length > 0) {
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (channel) {
              const message = await channel.messages.fetch(messageId).catch(() => null);
              if (message) {
                if (positionsEmbed?.enabled) {
                  // Update embed
                  const posColor = parseInt((positionsEmbed.color || '#3b82f6').replace('#', ''), 16);
                  let positionsText = positionsEmbed.description || '';
                  if (positionsText) positionsText += '\n\n';

                  categories.forEach(cat => {
                    const statusIcon = cat.status === 'closed' ? '❌' : '✅';
                    const emoji = cat.emoji || '📋';
                    positionsText += `${statusIcon} **${emoji} ${cat.name}**`;
                    if (cat.positionInfo) positionsText += ` — ${cat.positionInfo}`;
                    positionsText += '\n';
                    if (cat.requirements) {
                      positionsText += `> ${cat.requirements.split('\n').join('\n> ')}\n`;
                    }
                    positionsText += '\n';
                  });

                  const { EmbedBuilder } = require('discord.js');
                  const newEmbed = new EmbedBuilder()
                    .setColor(posColor)
                    .setTitle(positionsEmbed.title || '📋 Offene Stellen')
                    .setDescription(positionsText.trim())
                    .setFooter({ text: '✅ = Offen • ❌ = Geschlossen' })
                    .setTimestamp();

                  await message.edit({ embeds: [newEmbed] });
                  console.log(`✅ Positions embed updated for guild ${guildId}`);
                } else {
                  // Disable: delete the message
                  await message.delete().catch(() => {});
                  cfg.applicationSystem.positionsMessageId = null;
                  writeCfg(guildId, cfg);
                  console.log(`🗑️ Positions embed deleted for guild ${guildId}`);
                }
              }
            }
          }
        }
      } catch (updateErr) {
        console.error('Error updating positions embed:', updateErr);
      }

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

      // Verwende Custom Bot wenn aktiv, sonst Haupt-Bot
      const customBotManager = require('./custom-bot-manager.js');
      const activeClient = customBotManager.getActiveClient(guildId, client);

      const guild   = await activeClient.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const row = buildPanelSelect(cfg);
      let embed = buildPanelEmbed(cfg, guild);
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
      const embed   = buildPanelEmbed(cfg, guild);
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
          tag: sanitizeUsername(m.user.tag || m.user.username || id),
          username: sanitizeUsername(m.user.username || id),
          nickname: m.nickname ? sanitizeUsername(m.nickname) : null,
          display: sanitizeUsername(m.displayName || m.user.username || id)
        };
      } catch {
        map[id] = { tag: sanitizeUsername(id), username: sanitizeUsername(id), nickname: null, display: sanitizeUsername(id) };
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
        customTags: JSON.stringify(cfg.customTags || []),
        guildId: guildId,
        version: VERSION,
        isAdmin: req.isAdmin // Flag ob User Admin ist oder nur Team-Mitglied
      });
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden'); }
  });

  router.get('/tickets/data', isAuth, (req,res)=>{ res.json(loadTickets(req.session.selectedGuild)); });

  // User's own tickets (no admin required, just authenticated)
  router.get('/my-tickets', ensureAuthenticated, async (req,res)=>{
    try {
      const userId = req.user.id;

      // Collect all user's tickets across all servers where the bot exists
      let allUserTickets = [];
      const guildMap = {};

      console.log(`[My Tickets] Loading tickets for user ${userId}`);

      // Iterate through ALL guilds where the bot is present
      for(const [guildId, guild] of client.guilds.cache) {
        try {
          // Check if user is a member of this guild
          const member = await guild.members.fetch(userId).catch(() => null);
          if(!member) continue; // User not in this guild

          const tickets = loadTickets(guildId);
          const userTickets = tickets.filter(t => t.userId === userId);

          console.log(`[My Tickets] Guild ${guild.name} (${guildId}): Found ${userTickets.length} tickets`);

          if(userTickets.length > 0) {
            guildMap[guildId] = {
              name: sanitizeString(guild.name, 100),
              icon: guild.iconURL({ size: 64 })
            };

            userTickets.forEach(ticket => {
              ticket.guildId = guildId;
              ticket.guildName = guildMap[guildId].name;
              allUserTickets.push(ticket);
            });
          }
        } catch(err) {
          console.error(`[My Tickets] Error loading tickets for guild ${guildId}:`, err.message);
        }
      }

      console.log(`[My Tickets] Total tickets found: ${allUserTickets.length}`);

      // Sort by timestamp (newest first)
      allUserTickets.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      res.render('my-tickets', {
        tickets: JSON.stringify(allUserTickets),
        guildMap: JSON.stringify(guildMap),
        user: req.user,
        version: VERSION
      });
    } catch(e){
      console.error('[My Tickets] Error:', e);
      res.status(500).send('Fehler beim Laden deiner Tickets');
    }
  });

  // User's own transcript (no admin required, just authenticated + owns ticket)
  router.get('/panel/transcripts/:guildId/:ticketId', ensureAuthenticated, async (req, res) => {
    try {
      const { guildId, ticketId } = req.params;
      const userId = req.user.id;

      // Validate inputs
      if (!guildId || !ticketId) {
        return res.status(400).send('Guild ID oder Ticket ID fehlt');
      }

      const cleanGuildId = guildId.replace(/[^0-9]/g, '');
      const cleanTicketId = ticketId.replace(/[^0-9]/g, '');

      // Check if user owns this ticket
      const tickets = loadTickets(cleanGuildId);
      const ticket = tickets.find(t => t.id === parseInt(cleanTicketId));

      if (!ticket) {
        return res.status(404).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>📄 Ticket nicht gefunden</h2><p>Das Ticket existiert nicht.</p></div></body></html>');
      }

      // Check permission: user must be ticket creator OR team member
      const isCreator = ticket.userId === userId;
      let isTeam = false;

      try {
        const guild = await client.guilds.fetch(cleanGuildId).catch(() => null);
        if (guild) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            isTeam = member.permissions.has('ManageMessages') || member.permissions.has('Administrator');
          }
        }
      } catch (e) {}

      if (!isCreator && !isTeam) {
        return res.status(403).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>🚫 Zugriff verweigert</h2><p>Du hast keinen Zugriff auf dieses Transcript.</p></div></body></html>');
      }

      // Try to find transcript file
      const transcriptsDir = path.join(__dirname, 'transcripts', cleanGuildId);
      const htmlPath = path.join(transcriptsDir, `transcript_${cleanTicketId}.html`);

      if (fs.existsSync(htmlPath)) {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        return res.sendFile(htmlPath);
      }

      return res.status(404).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>📄 Transcript nicht gefunden</h2><p>Das Transcript für Ticket #' + cleanTicketId + ' wurde noch nicht erstellt oder ist nicht mehr verfügbar.</p></div></body></html>');
    } catch (err) {
      console.error('Error in /panel/transcripts:', err);
      return res.status(500).send('Fehler beim Laden des Transcripts');
    }
  });

  // Live transcript for open tickets (shows current channel messages)
  router.get('/panel/live-transcript/:guildId/:ticketId', ensureAuthenticated, async (req, res) => {
    try {
      const { guildId, ticketId } = req.params;
      const userId = req.user.id;

      // Validate inputs
      if (!guildId || !ticketId) {
        return res.status(400).send('Guild ID oder Ticket ID fehlt');
      }

      const cleanGuildId = guildId.replace(/[^0-9]/g, '');
      const cleanTicketId = ticketId.replace(/[^0-9]/g, '');

      // Check if user owns this ticket
      const tickets = loadTickets(cleanGuildId);
      const ticket = tickets.find(t => t.id === parseInt(cleanTicketId));

      if (!ticket) {
        return res.status(404).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>📄 Ticket nicht gefunden</h2><p>Das Ticket existiert nicht.</p></div></body></html>');
      }

      // Check if ticket is closed
      if (ticket.status === 'geschlossen' || ticket.status === 'closed') {
        return res.redirect(`/panel/transcripts/${cleanGuildId}/${cleanTicketId}`);
      }

      // Check permission: user must be ticket creator OR team member
      const isCreator = ticket.userId === userId;
      let isTeam = false;

      try {
        const guild = await client.guilds.fetch(cleanGuildId).catch(() => null);
        if (!guild) {
          return res.status(404).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>🚫 Server nicht gefunden</h2><p>Der Server wurde nicht gefunden.</p></div></body></html>');
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          isTeam = member.permissions.has('ManageMessages') || member.permissions.has('Administrator');
        }

        if (!isCreator && !isTeam) {
          return res.status(403).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>🚫 Zugriff verweigert</h2><p>Du hast keinen Zugriff auf dieses Ticket.</p></div></body></html>');
        }

        // Fetch ticket channel
        const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
        if (!channel) {
          return res.status(404).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>📄 Channel nicht gefunden</h2><p>Der Ticket-Channel wurde nicht gefunden.</p></div></body></html>');
        }

        // Fetch messages (last 100)
        const messages = await channel.messages.fetch({ limit: 100 }).catch(() => new Map());
        const messageArray = Array.from(messages.values()).reverse(); // Oldest first

        // Generate HTML
        let html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Transcript - Ticket #${String(ticket.id).padStart(5, '0')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #1a1a1a;
      color: #dcddde;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }
    .header h1 {
      color: #fff;
      font-size: 28px;
      margin-bottom: 10px;
    }
    .header p {
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
    }
    .live-badge {
      display: inline-block;
      background: #22c55e;
      color: #fff;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      margin-left: 10px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .message {
      background: #2b2d31;
      padding: 15px 20px;
      margin-bottom: 10px;
      border-radius: 8px;
      border-left: 3px solid #5865f2;
    }
    .message-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      gap: 10px;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #5865f2;
    }
    .author {
      font-weight: 600;
      color: #fff;
    }
    .timestamp {
      color: #949ba4;
      font-size: 12px;
      margin-left: auto;
    }
    .content {
      color: #dcddde;
      word-wrap: break-word;
    }
    .attachment {
      margin-top: 10px;
      padding: 10px;
      background: #1a1a1a;
      border-radius: 5px;
    }
    .attachment a {
      color: #00b0f4;
      text-decoration: none;
    }
    .refresh-btn {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      border: none;
      padding: 15px 30px;
      border-radius: 50px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      transition: all 0.3s;
    }
    .refresh-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📝 Live Transcript <span class="live-badge">🔴 LIVE</span></h1>
    <p>Ticket #${String(ticket.id).padStart(5, '0')} • ${sanitizeString(ticket.topic || 'Kein Thema', 50)} • ${guild.name}</p>
  </div>
`;

        // Add messages
        for (const msg of messageArray) {
          const timestamp = msg.createdAt.toLocaleString('de-DE');
          const author = sanitizeString(msg.author.username, 50);
          const content = sanitizeString(msg.content || '(Keine Nachricht)', 2000);
          const avatarUrl = msg.author.displayAvatarURL({ size: 64 });

          html += `
  <div class="message">
    <div class="message-header">
      <img src="${avatarUrl}" alt="${author}" class="avatar">
      <span class="author">${author}</span>
      <span class="timestamp">${timestamp}</span>
    </div>
    <div class="content">${content.replace(/\n/g, '<br>')}</div>
`;

          // Add attachments
          if (msg.attachments.size > 0) {
            html += '<div class="attachment">';
            for (const [, attachment] of msg.attachments) {
              if (attachment.contentType?.startsWith('image/')) {
                html += `<img src="${attachment.url}" alt="Attachment" style="max-width: 100%; border-radius: 5px; margin-top: 5px;">`;
              } else {
                html += `<a href="${attachment.url}" target="_blank">📎 ${sanitizeString(attachment.name, 100)}</a><br>`;
              }
            }
            html += '</div>';
          }

          html += `
  </div>
`;
        }

        html += `
  <button class="refresh-btn" onclick="location.reload()">🔄 Aktualisieren</button>
  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
        return res.send(html);

      } catch (e) {
        console.error('[Live Transcript] Error:', e);
        return res.status(500).send('Fehler beim Laden des Live-Transcripts');
      }

    } catch (err) {
      console.error('[Live Transcript] Error:', err);
      return res.status(500).send('Fehler beim Laden des Live-Transcripts');
    }
  });

  router.get('/transcript/:id', isAuthOrTeam, (req,res)=>{
    try {
      const id = req.params.id.replace(/[^0-9]/g,'');
      if(!id) return res.status(400).send('ID fehlt');

      // Override X-Frame-Options to allow iframe embedding from same origin
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");

      // Try to get guildId from session first
      let guildId = req.session.selectedGuild;
      const transcriptsDir = path.join(__dirname, 'transcripts');

      // Strategy 1: Search in selectedGuild folder if available
      if (guildId) {
        const guildTranscriptFile = path.join(transcriptsDir, guildId, `transcript_${id}.html`);
        if(fs.existsSync(guildTranscriptFile)) {
          console.log(`📄 Transcript gefunden: ${guildTranscriptFile}`);
          return res.sendFile(guildTranscriptFile);
        }

        // Transcript nicht im ausgewählten Server gefunden
        console.log(`❌ Transcript nicht gefunden im ausgewählten Server: ID ${id}, Guild: ${guildId}`);
        return res.status(404).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>📄 Transcript nicht gefunden</h2><p>Das Transcript mit der ID <strong>' + id + '</strong> existiert nicht auf diesem Server.</p><p style="opacity: 0.7; font-size: 0.9rem; margin-top: 1rem;">Bitte stelle sicher, dass du den richtigen Server ausgewählt hast.</p></div></body></html>');
      }

      // No guildId in session - should not happen with isAuthOrTeam middleware
      console.log(`⚠️ Kein Server ausgewählt für Transcript ID ${id}`);
      return res.status(400).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>⚠️ Fehler</h2><p>Kein Server ausgewählt. Bitte wähle einen Server aus.</p><p style="margin-top: 1rem;"><a href="/select-server" style="color: #00ff88; text-decoration: none;">← Server auswählen</a></p></div></body></html>');
    } catch(err) {
      console.error('❌ Fehler beim Laden des Transcripts:', err);
      return res.status(500).send('<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a1a;color:#fff;"><div style="text-align:center;"><h2>⚠️ Fehler</h2><p>Das Transcript konnte nicht geladen werden.</p></div></body></html>');
    }
  });

  router.get('/analytics', isAuthOrTeam, async (req,res)=>{
    try {
      const guildId = req.session.selectedGuild;

      // Analytics requires at least Basic+ (Insights) - Pro unlocks advanced reports
      if (!hasFeature(guildId, 'statistics')) {
        return res.redirect('/premium?msg=analytics-requires-basic');
      }

      const premiumInfo = getPremiumInfo(guildId);
      // CSV Export ist für alle mit statistics Feature verfügbar (Basic+ und Pro)
      const canExportCSV = hasFeature(guildId, 'statistics');

      const tickets = loadTickets(guildId);
      const guild = await client.guilds.fetch(guildId);

      // Statistiken berechnen
      const closedStatuses = ['geschlossen', 'accepted', 'rejected'];
      const stats = {
        total: tickets.length,
        closed: tickets.filter(t => closedStatuses.includes(t.status)).length,
        open: tickets.filter(t => !closedStatuses.includes(t.status)).length,
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
        let username = sanitizeUsername(userId); // Fallback auf User ID
        try {
          const member = await guild.members.fetch(userId);
          username = sanitizeUsername(member.user.username || member.user.tag || userId);
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

      // Rating-Statistiken berechnen
      const ratingStats = {
        total: 0,
        average: 0,
        byStars: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        withFeedback: 0,
        recent: [],
        byTeamMember: {}
      };

      const ratedTickets = tickets.filter(t => t.rating);
      ratingStats.total = ratedTickets.length;

      if (ratedTickets.length > 0) {
        let totalStars = 0;

        for (const ticket of ratedTickets) {
          const stars = ticket.rating.stars;
          totalStars += stars;
          ratingStats.byStars[stars.toString()] = (ratingStats.byStars[stars.toString()] || 0) + 1;

          if (ticket.rating.feedback) {
            ratingStats.withFeedback++;
          }

          // Per Team-Mitglied (Claimer)
          if (ticket.claimer) {
            if (!ratingStats.byTeamMember[ticket.claimer]) {
              ratingStats.byTeamMember[ticket.claimer] = {
                userId: ticket.claimer,
                ratings: [],
                average: 0,
                count: 0
              };
            }
            ratingStats.byTeamMember[ticket.claimer].ratings.push(stars);
            ratingStats.byTeamMember[ticket.claimer].count++;
          }
        }

        ratingStats.average = (totalStars / ratedTickets.length).toFixed(1);

        // Durchschnitte pro Team-Mitglied berechnen
        for (const memberId in ratingStats.byTeamMember) {
          const member = ratingStats.byTeamMember[memberId];
          const sum = member.ratings.reduce((a, b) => a + b, 0);
          member.average = (sum / member.ratings.length).toFixed(1);
        }

        // Team-Mitglieder Namen auflösen
        for (const memberId in ratingStats.byTeamMember) {
          try {
            const member = await guild.members.fetch(memberId);
            ratingStats.byTeamMember[memberId].username = sanitizeUsername(member.user.username || member.user.tag || memberId);
          } catch (err) {
            ratingStats.byTeamMember[memberId].username = sanitizeUsername(memberId);
          }
        }

        // Letzte 10 Bewertungen mit Feedback
        ratingStats.recent = ratedTickets
          .filter(t => t.rating.feedback)
          .sort((a, b) => b.rating.ratedAt - a.rating.ratedAt)
          .slice(0, 10)
          .map(t => ({
            ticketId: t.id,
            stars: t.rating.stars,
            feedback: t.rating.feedback,
            ratedAt: t.rating.ratedAt
          }));
      }

      // Get comprehensive insights (Basic+ Feature)
      const timeRange = req.query.range || 'all';
      const insights = getComprehensiveInsights(guildId, timeRange);

      // Survey Statistics (Basic+ Feature)
      const cfg = readCfg(guildId);
      let surveyStats = null;
      if (cfg.surveySystem && cfg.surveySystem.enabled) {
        const { getSurveyAnalytics } = require('./survey-system');
        surveyStats = getSurveyAnalytics(tickets);

        // Resolve usernames for team member performance
        for (const memberId in surveyStats.byTeamMember) {
          try {
            const member = await guild.members.fetch(memberId);
            surveyStats.byTeamMember[memberId].username = sanitizeUsername(member.user.username || member.user.tag || memberId);
          } catch (err) {
            surveyStats.byTeamMember[memberId].username = sanitizeUsername(memberId);
          }
        }
      }

      // Auto-Assignment Statistics (Basic+ Feature)
      let autoAssignStats = null;
      if (cfg.autoAssignment && cfg.autoAssignment.enabled) {
        const { getAssignmentStats } = require('./auto-assignment');
        autoAssignStats = getAssignmentStats(cfg, tickets);

        // Resolve usernames for assignment stats
        const assignmentsByMemberWithNames = [];
        for (const [userId, count] of Object.entries(autoAssignStats.assignmentsByMember || {})) {
          let username = sanitizeUsername(userId);
          try {
            const member = await guild.members.fetch(userId);
            username = sanitizeUsername(member.user.username || member.user.tag || userId);
          } catch (err) {
            console.log(`Konnte User ${userId} nicht fetchen`);
          }
          assignmentsByMemberWithNames.push({ userId, username, count });
        }
        autoAssignStats.assignmentsByMemberWithNames = assignmentsByMemberWithNames.sort((a, b) => b.count - a.count);

        // Resolve usernames for current workloads
        const currentWorkloadsWithNames = [];
        for (const [userId, workload] of Object.entries(autoAssignStats.currentWorkloads || {})) {
          let username = sanitizeUsername(userId);
          try {
            const member = await guild.members.fetch(userId);
            username = sanitizeUsername(member.user.username || member.user.tag || userId);
          } catch (err) {
            console.log(`Konnte User ${userId} nicht fetchen`);
          }
          currentWorkloadsWithNames.push({ userId, username, workload });
        }
        autoAssignStats.currentWorkloadsWithNames = currentWorkloadsWithNames.sort((a, b) => b.workload - a.workload);
      }

      res.render('analytics', {
        guildName: guild.name,
        stats: stats,
        insights: insights,
        ratingStats: ratingStats,
        surveyStats: surveyStats,
        autoAssignStats: autoAssignStats,
        canExportCSV: canExportCSV,
        timeRange: timeRange,
        guildId: guildId,
        hasFeature: hasFeature,
        isAdmin: req.isAdmin // Flag ob User Admin ist oder nur Team-Mitglied
      });
    } catch(e) {
      console.error('Analytics Error:', e);
      res.status(500).send('Fehler beim Laden der Analytics');
    }
  });

  // CSV Export Routes (Basic+ Feature - requires statistics)
  router.get('/export/tickets/csv', isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;

      // Check if statistics feature is available (Basic+ and Pro)
      if (!hasFeature(guildId, 'statistics')) {
        return res.status(403).send('CSV Export requires Premium Basic+ or higher');
      }

      const options = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        status: req.query.status,
        priority: req.query.priority
      };

      const csvContent = generateCSVExport(guildId, options);
      const filename = `tickets_${guildId}_${Date.now()}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\uFEFF' + csvContent); // BOM for UTF-8 Excel compatibility
    } catch (e) {
      console.error('CSV Export Error:', e);
      res.status(500).send('Fehler beim CSV-Export');
    }
  });

  router.get('/export/stats/csv', isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;

      // Check if statistics feature is available (Basic+ and Pro)
      if (!hasFeature(guildId, 'statistics')) {
        return res.status(403).send('CSV Export requires Premium Basic+ or higher');
      }

      const csvContent = generateStatsCSVExport(guildId);
      const filename = `statistics_${guildId}_${Date.now()}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\uFEFF' + csvContent); // BOM for UTF-8 Excel compatibility
    } catch (e) {
      console.error('CSV Export Error:', e);
      res.status(500).send('Fehler beim CSV-Export');
    }
  });

  router.post('/webhook/github', async (req, res) => {
    try {
      // Immediately respond to GitHub
      res.status(200).send('OK');

      const payload = req.body;
      const event = req.headers['x-github-event'];

      console.log(`📡 GitHub Webhook erhalten: Event=${event}, Repo=${payload.repository?.full_name || 'Unknown'}`);

      // Only process push events
      if (event !== 'push') {
        console.log(`⏭️ Event ${event} ignoriert (nur push wird verarbeitet)`);
        return;
      }

      const repository = payload.repository?.full_name || 'Unknown Repository';
      const commits = payload.commits || [];
      const pusher = payload.pusher?.name || 'Unknown';
      const ref = payload.ref || '';
      const branch = ref.replace('refs/heads/', '');

      console.log(`🔀 Push Event: ${commits.length} Commit(s) auf ${branch} von ${pusher} in ${repository}`);

      // Check if there are commits to process
      if (commits.length === 0) {
        console.log(`⏭️ Keine Commits im Push Event, ignoriere Webhook`);
        return;
      }

      const guilds = await client.guilds.fetch();
      console.log(`📤 Verarbeite Webhook für ${guilds.size} Server...`);

      let sentCount = 0;
      let enabledCount = 0;

      for (const [guildId, guildData] of guilds) {
        try {
          const cfg = readCfg(guildId);

          // Check if GitHub commits are explicitly enabled
          if (!cfg.githubCommitsEnabled || cfg.githubCommitsEnabled === false) {
            continue;
          }

          enabledCount++;

          if (!cfg.githubWebhookChannelId) {
            console.log(`⚠️ Guild ${guildData.name || guildId} (${guildId}): GitHub aktiviert aber kein Channel konfiguriert`);
            continue;
          }

          const guild = await client.guilds.fetch(guildId);
          if (!guild) {
            console.log(`❌ Guild ${guildId}: Konnte Guild nicht fetchen`);
            continue;
          }

          const channel = await guild.channels.fetch(cfg.githubWebhookChannelId).catch(() => null);
          if (!channel || !channel.isTextBased()) {
            console.log(`❌ Guild ${guild.name} (${guildId}): Channel ${cfg.githubWebhookChannelId} nicht gefunden oder kein Text-Channel`);
            continue;
          }

          console.log(`✅ Guild ${guild.name} (${guildId}): Sende ${commits.length} Commit(s) zu #${channel.name}`);

          // Send commits (max 5 individual embeds)
          for (const commit of commits.slice(0, 5)) {
            try {
              const commitMessage = (commit.message || 'No commit message').substring(0, 4096);
              const commitAuthor = commit.author?.name || commit.author?.username || 'Unknown';

              const embed = new EmbedBuilder()
                .setTitle('📝 New Commit')
                .setDescription(commitMessage)
                .setColor(0x00ff88)
                .addFields(
                  { name: '👤 Author', value: commitAuthor, inline: true },
                  { name: '🌿 Branch', value: branch || 'main', inline: true },
                  { name: '📦 Repository', value: repository, inline: false }
                )
                .setFooter({ text: 'Quantix Tickets Bot Updates' });

              if (commit.timestamp) {
                embed.setTimestamp(new Date(commit.timestamp));
              }

              if (commit.url) {
                embed.setURL(commit.url);
              }

              await channel.send({ embeds: [embed] });
            } catch (sendErr) {
              console.error(`Fehler beim Senden von Commit ${commit.id}:`, sendErr);
            }
          }

          // Show "... and X more commits" if needed
          if (commits.length > 5) {
            try {
              const moreEmbed = new EmbedBuilder()
                .setDescription(`... und ${commits.length - 5} weitere Commit(s)`)
                .setColor(0x00ff88)
                .setFooter({ text: 'Quantix Tickets Bot Updates' });
              await channel.send({ embeds: [moreEmbed] });
            } catch (moreErr) {
              console.error('Fehler beim Senden des "mehr Commits" Embed:', moreErr);
            }
          }

          sentCount++;

        } catch (err) {
          console.error(`GitHub Webhook Error für Guild ${guildId}:`, err);
        }
      }

      console.log(`✅ GitHub Webhook erfolgreich verarbeitet:`);
      console.log(`   📊 ${guilds.size} Server insgesamt`);
      console.log(`   ✅ ${enabledCount} Server mit GitHub aktiviert`);
      console.log(`   📤 ${sentCount} Server erfolgreich benachrichtigt`);
      console.log(`   📝 ${commits.length} Commit(s) verarbeitet`);

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
      <h1 class="bot-name">${user ? sanitizeUsername(user.username || user.tag || 'Quantix Tickets Bot') : 'Quantix Tickets Bot'}</h1>
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
      willCancel: premiumInfo.willCancel || false,
      cancelledAt: premiumInfo.cancelledAt || null,
      version: VERSION
    });
  });

  router.post('/purchase-premium', isAuth, async (req, res) => {
    const guildId = req.session.selectedGuild;
    const tier = req.body.tier;
    const billingPeriod = req.body.billingPeriod || 'monthly';

    // Nur Pro-Tier verfügbar (Basic wurde entfernt)
    if (tier !== 'pro') {
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

      // Stripe Subscription kündigen (am Ende der Laufzeit)
      const stripeEnabled = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'your_stripe_secret_key_here';

      if (stripeEnabled && result.subscriptionId) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        try {
          // Kündige am Ende der Laufzeit, nicht sofort
          await stripe.subscriptions.update(result.subscriptionId, {
            cancel_at_period_end: true
          });
          console.log(`🚫 Stripe Subscription ${result.subscriptionId} zur Kündigung markiert (läuft bis ${result.expiresAt}) für Guild ${guildId}`);
        } catch (stripeErr) {
          console.error('Stripe Cancellation Error:', stripeErr);
          // Premium wurde bereits lokal zur Kündigung markiert, auch wenn Stripe-Call fehlschlägt
        }
      }

      const expiresDate = result.expiresAt ? new Date(result.expiresAt).toLocaleDateString('de-DE') : 'unbekannt';
      await logEvent(guildId, `🚫 Premium zur Kündigung markiert - läuft bis ${expiresDate}`, req.user);

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
          let onBot = true;
          try {
            const guild = await client.guilds.fetch(guildId);
            guildInfo = {
              id: guild.id,
              name: guild.name,
              memberCount: guild.memberCount,
              icon: guild.iconURL({ size: 128 })
            };
          } catch(err) {
            onBot = false;
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
            onBot: onBot,
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
        pro: guildsData.filter(g => g.premium === 'pro').length,
        beta: guildsData.filter(g => g.premium === 'beta').length,
        partner: guildsData.filter(g => g.premium === 'partner').length
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

      // Load pending deletions
      let pendingDeletions = [];
      try {
        const pendingFile = './pending-deletions.json';
        if (fs.existsSync(pendingFile)) {
          pendingDeletions = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
          // Enrich with guild names and icons
          pendingDeletions = pendingDeletions.map(deletion => {
            const guild = guildsData.find(g => g.id === deletion.guildId);
            return {
              ...deletion,
              guildName: guild ? guild.name : deletion.guildName || 'Unbekannt',
              guildIcon: guild ? guild.icon : null
            };
          });
        }
      } catch(err) {
        console.error('Error loading pending deletions for owner:', err);
      }

      res.render('owner', {
        user: req.user,
        guilds: guildsData,
        totalGuilds: guildsData.length,
        totalTickets: totalTickets,
        premiumStats: premiumStats,
        botUptime: formatUptime(client.uptime),
        version: VERSION,
        feedbacks: feedbacks,
        pendingDeletions: pendingDeletions
      });
    } catch(err) {
      console.error('Owner Panel Error:', err);
      res.status(500).send('Fehler beim Laden des Owner Panels');
    }
  });

  // API endpoint for live stats (Owner Only)
  router.get('/api/owner/stats', isOwner, async (req, res) => {
    try {
      const allGuilds = await client.guilds.fetch();
      const configFiles = fs.readdirSync('./configs').filter(f =>
        f.endsWith('.json') && !f.includes('_tickets') && !f.includes('_counter')
      );

      let totalTickets = 0;

      for (const file of configFiles) {
        try {
          const guildId = file.replace('.json', '');
          try {
            const tickets = JSON.parse(fs.readFileSync(`./configs/${guildId}_tickets.json`, 'utf8'));
            totalTickets += tickets.length || 0;
          } catch(err) {}
        } catch(err) {}
      }

      // Calculate uptime
      const uptimeMs = client.uptime;
      const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);

      let uptimeString = '';
      if (days > 0) uptimeString += `${days}d `;
      if (hours > 0) uptimeString += `${hours}h `;
      if (minutes > 0) uptimeString += `${minutes}m `;
      uptimeString += `${seconds}s`;

      res.json({
        success: true,
        stats: {
          totalGuilds: allGuilds.size,
          totalTickets: totalTickets,
          botUptime: uptimeString.trim(),
          version: VERSION
        }
      });
    } catch(err) {
      console.error('API Stats Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch stats' });
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
      const guildId = validateDiscordId(req.params.guildId);
      if (!guildId) return res.redirect('/owner?error=invalid-guild-id');

      const guild = await client.guilds.fetch(guildId).catch(() => null);

      // If bot is NOT on the server, delete immediately without warning
      if (!guild) {
        console.log(`🗑️ Bot not on server ${guildId}, deleting immediately...`);

        // Delete all server data files
        const configFile = `./configs/${guildId}.json`;
        const ticketsFile = `./configs/${guildId}_tickets.json`;
        const counterFile = `./configs/${guildId}_counter.json`;
        const transcriptsDir = path.join(__dirname, 'transcripts', guildId);

        let deletedFiles = 0;

        // Delete config files
        if (fs.existsSync(configFile)) {
          fs.unlinkSync(configFile);
          console.log(`🗑️ Deleted config: ${configFile}`);
          deletedFiles++;
        }
        if (fs.existsSync(ticketsFile)) {
          fs.unlinkSync(ticketsFile);
          console.log(`🗑️ Deleted tickets: ${ticketsFile}`);
          deletedFiles++;
        }
        if (fs.existsSync(counterFile)) {
          fs.unlinkSync(counterFile);
          console.log(`🗑️ Deleted counter: ${counterFile}`);
          deletedFiles++;
        }

        // Delete transcripts directory
        if (fs.existsSync(transcriptsDir)) {
          fs.rmSync(transcriptsDir, { recursive: true, force: true });
          console.log(`🗑️ Deleted transcripts: ${transcriptsDir}`);
          deletedFiles++;
        }

        console.log(`✅ Immediately deleted all data for server ${guildId} (${deletedFiles} items) by ${sanitizeUsername(req.user.username || req.user.id)}`);
        return res.redirect('/owner?success=server-deleted-immediately');
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

  // Cancel Pending Deletion (Owner Only)
  router.post('/owner/cancel-deletion/:guildId', isOwner, async (req, res) => {
    try {
      const guildId = validateDiscordId(req.params.guildId);
      if (!guildId) return res.redirect('/owner?error=invalid-guild-id');

      const pendingFile = './pending-deletions.json';
      let pending = [];
      if (fs.existsSync(pendingFile)) {
        pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
      }

      const deletionIndex = pending.findIndex(p => p.guildId === guildId);
      if (deletionIndex === -1) {
        return res.redirect('/owner?error=no-pending-deletion');
      }

      const deletion = pending[deletionIndex];

      // Remove from pending list
      pending.splice(deletionIndex, 1);
      fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

      // Try to delete the warning message in Discord
      try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (guild && deletion.channelId && deletion.messageId) {
          const channel = await guild.channels.fetch(deletion.channelId).catch(() => null);
          if (channel) {
            await channel.messages.delete(deletion.messageId).catch(() => {});
          }
        }
      } catch(err) {
        console.log('Could not delete warning message:', err.message);
      }

      console.log(`✅ Deletion cancelled for ${guildId} by ${sanitizeUsername(req.user.username || req.user.id)}`);
      res.redirect('/owner?success=deletion-cancelled');
    } catch(err) {
      console.error('Cancel deletion error:', err);
      res.redirect('/owner?error=cancel-failed');
    }
  });

  // Premium Management (Owner Only)
  router.post('/owner/manage-premium', isOwner, async (req, res) => {
    try {
      const { serverId, action, tier, days } = req.body;
      const { activateLifetimePremium, removeLifetimePremium, activateBetatester, deactivateBetatester, activatePartner, deactivatePartner } = require('./premium');

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
          console.log(`♾️ Lifetime ${tier} Premium activated for ${sanitizeString(guild.name, 100)} (${serverId}) by ${sanitizeUsername(req.user.username || req.user.id)}`);
          return res.redirect('/owner?success=premium-activated');
        }
      } else if (action === 'betatester') {
        // Activate Betatester
        const duration = parseInt(days) || 30;
        const guildOwner = await guild.fetchOwner();
        result = activateBetatester(serverId, duration, guildOwner.id);

        if (result.success) {
          console.log(`🧪 Betatester activated for ${sanitizeString(guild.name, 100)} (${serverId}) for ${duration} days by ${sanitizeUsername(req.user.username || req.user.id)}`);
          return res.redirect('/owner?success=premium-activated');
        }
      } else if (action === 'partner') {
        // Activate Partner
        const guildOwner = await guild.fetchOwner();
        result = activatePartner(serverId, guildOwner.id, null);

        if (result.success) {
          // Assign Partner Role on Theredstonee Projects server
          const PARTNER_SERVER_ID = '1403053662825222388';
          const PARTNER_ROLE_ID = '1432763693535465554';

          try {
            const partnerServerGuild = await client.guilds.fetch(PARTNER_SERVER_ID);
            const member = await partnerServerGuild.members.fetch(guildOwner.id);

            if (!member.roles.cache.has(PARTNER_ROLE_ID)) {
              await member.roles.add(PARTNER_ROLE_ID);
              console.log(`✅ Partner-Rolle vergeben an ${guildOwner.user.tag} (${guildOwner.id})`);
            } else {
              console.log(`✅ User ${guildOwner.user.tag} hatte bereits die Partner-Rolle`);
            }
          } catch (err) {
            console.error(`⚠️ Fehler beim Vergeben der Partner-Rolle: ${err.message}`);
          }

          console.log(`🤝 Partner activated for ${sanitizeString(guild.name, 100)} (${serverId}) by ${sanitizeUsername(req.user.username || req.user.id)}`);
          return res.redirect('/owner?success=premium-activated');
        }
      } else if (action === 'remove') {
        // Remove Premium - works for ALL premium types (Lifetime, Beta, Trial, Regular, Partner)
        const { deactivatePremium, deactivatePartner, getPremiumInfo } = require('./premium');
        const premiumInfo = getPremiumInfo(serverId);

        // Check if server has any premium
        if (premiumInfo.tier === 'none') {
          return res.redirect('/owner?error=no-premium-to-remove');
        }

        // Remove Partner Role if removing Partner status
        if (premiumInfo.tier === 'partner' && premiumInfo.partnerUserId) {
          const PARTNER_SERVER_ID = '1403053662825222388';
          const PARTNER_ROLE_ID = '1432763693535465554';

          try {
            const partnerServerGuild = await client.guilds.fetch(PARTNER_SERVER_ID);
            const member = await partnerServerGuild.members.fetch(premiumInfo.partnerUserId);

            if (member.roles.cache.has(PARTNER_ROLE_ID)) {
              await member.roles.remove(PARTNER_ROLE_ID);
              console.log(`✅ Partner-Rolle entfernt von User ${premiumInfo.partnerUserId}`);
            }
          } catch (err) {
            console.error(`⚠️ Fehler beim Entfernen der Partner-Rolle: ${err.message}`);
          }
        }

        // Deactivate premium - use specific function for Partner
        if (premiumInfo.tier === 'partner') {
          deactivatePartner(serverId);
        } else {
          deactivatePremium(serverId);
        }

        const premiumType = premiumInfo.isTrial ? 'Trial' :
                           premiumInfo.isLifetime ? 'Lifetime' :
                           premiumInfo.tier === 'beta' ? 'Beta' :
                           premiumInfo.tier === 'partner' ? 'Partner' :
                           premiumInfo.tier;

        console.log(`🚫 ${premiumType} Premium removed for ${sanitizeString(guild.name, 100)} (${serverId}) by ${sanitizeUsername(req.user.username || req.user.id)}`);
        return res.redirect('/owner?success=premium-removed');
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
  const USER_BLACKLIST_FILE = './user-blacklist.json';
  const SESSIONS_FILE = './sessions.json';

  /**
   * Read user blacklist
   */
  function readUserBlacklist() {
    try {
      if (!fs.existsSync(USER_BLACKLIST_FILE)) {
        return { users: {} };
      }
      return JSON.parse(fs.readFileSync(USER_BLACKLIST_FILE, 'utf8'));
    } catch (err) {
      console.error('Error reading user blacklist:', err);
      return { users: {} };
    }
  }

  /**
   * Write user blacklist
   */
  function writeUserBlacklist(data) {
    try {
      fs.writeFileSync(USER_BLACKLIST_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error writing user blacklist:', err);
    }
  }

  /**
   * Read sessions
   */
  function readSessions() {
    try {
      if (!fs.existsSync(SESSIONS_FILE)) {
        return { users: {} };
      }
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    } catch (err) {
      console.error('Error reading sessions:', err);
      return { users: {} };
    }
  }

  /**
   * Write sessions
   */
  function writeSessions(data) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error writing sessions:', err);
    }
  }

  /**
   * Track user login
   */
  function trackUserLogin(user) {
    try {
      const sessions = readSessions();
      const userId = user.id;

      if (!sessions.users[userId]) {
        sessions.users[userId] = {
          id: userId,
          username: sanitizeUsername(user.username),
          discriminator: user.discriminator,
          avatar: user.avatar,
          firstLogin: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          loginCount: 1
        };
      } else {
        sessions.users[userId].username = sanitizeUsername(user.username);
        sessions.users[userId].discriminator = user.discriminator;
        sessions.users[userId].avatar = user.avatar;
        sessions.users[userId].lastLogin = new Date().toISOString();
        sessions.users[userId].loginCount = (sessions.users[userId].loginCount || 0) + 1;
      }

      writeSessions(sessions);
    } catch (err) {
      console.error('Error tracking user login:', err);
    }
  }

  /**
   * Check if user is blacklisted
   */
  function isUserBlacklisted(userId) {
    const blacklist = readUserBlacklist();
    const userBan = blacklist.users[userId];

    if (!userBan) return false;

    // Check if ban is permanent
    if (userBan.isPermanent) return true;

    // Check if temporary ban has expired
    if (userBan.expiresAt) {
      const now = Date.now();
      const expiryTime = new Date(userBan.expiresAt).getTime();

      if (now >= expiryTime) {
        // Ban has expired, remove it and send unblock notification
        console.log(`⏰ Temporary ban expired for ${userBan.username} (${userId})`);

        // Send auto-unblock notification
        (async () => {
          try {
            const user = await client.users.fetch(userId);
            if (user) {
              const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

              const unblockDate = new Date().toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              let description = `Deine temporäre Sperre ist **automatisch abgelaufen** und dein Zugang zu **Quantix Tickets** wurde wiederhergestellt.\n\n`;

              description += `**✅ Du hast jetzt wieder Zugriff auf:**\n`;
              description += `• Dashboard-Login\n`;
              description += `• Alle Panel-Funktionen\n`;
              description += `• Server-Verwaltung\n\n`;

              description += `**🎫 Nächste Schritte:**\n`;
              description += `Du kannst dich jetzt wieder am Dashboard anmelden und dein Ticket-System verwalten.\n\n`;

              description += `**⚠️ Wichtig:**\n`;
              description += `Bitte beachte die Nutzungsbedingungen, um zukünftige Sperrungen zu vermeiden.\n\n`;

              description += `Viel Erfolg mit deinem Ticket-System!`;

              const unblockEmbed = new EmbedBuilder()
                .setTitle('✅ Temporäre Sperre abgelaufen')
                .setDescription(description)
                .setColor(0x00ff88)
                .addFields(
                  { name: '🕒 Automatisch entsperrt am', value: unblockDate, inline: false }
                )
                .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
                .setTimestamp()
                .setFooter({ text: 'Quantix Tickets © 2025 • Automatische Benachrichtigung' });

              // Dashboard & Support Buttons
              const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setURL(process.env.PUBLIC_BASE_URL || 'https://tickets.quantix-bot.de')
                  .setStyle(ButtonStyle.Link)
                  .setLabel('Zum Dashboard')
                  .setEmoji('🎫'),
                new ButtonBuilder()
                  .setURL('https://discord.com/invite/mnYbnpyyBS')
                  .setStyle(ButtonStyle.Link)
                  .setLabel('Support')
                  .setEmoji('🛟')
              );

              await user.send({ embeds: [unblockEmbed], components: [buttonRow] });
              console.log(`📧 Auto-unblock notification sent to ${userBan.username} (${userId})`);
            }
          } catch (dmErr) {
            console.log(`⚠️ Could not send auto-unblock DM to ${userBan.username} (${userId}):`, dmErr.message);
          }
        })();

        // Remove from blacklist
        delete blacklist.users[userId];
        writeUserBlacklist(blacklist);
        return false;
      }

      return true; // Ban still active
    }

    // Fallback: if no isPermanent and no expiresAt, treat as permanent
    return true;
  }

  /**
   * Send ban message to server before bot leaves
   * @param {Guild} guild - Discord Guild object
   * @param {string} reason - Ban reason
   * @param {string} bannedBy - Username who initiated the ban
   */
  async function sendBanMessage(guild, reason, bannedBy) {
    try {
      const { EmbedBuilder } = require('discord.js');
      const { COPYRIGHT } = require('./version.config');

      // Try to find a suitable channel
      let targetChannel = null;
      const cfg = readCfg(guild.id);

      // Priority 1: Log channel
      if (cfg.logChannelId) {
        targetChannel = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
      }

      // Priority 2: General channel
      if (!targetChannel) {
        const generalNames = ['general', 'allgemein', 'chat', 'main', 'lobby'];
        for (const name of generalNames) {
          const channel = guild.channels.cache.find(ch =>
            ch.type === 0 && // Text channel
            ch.name.toLowerCase().includes(name) &&
            ch.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])
          );
          if (channel) {
            targetChannel = channel;
            break;
          }
        }
      }

      // Priority 3: First available text channel
      if (!targetChannel) {
        targetChannel = guild.channels.cache.find(ch =>
          ch.type === 0 && // Text channel
          ch.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])
        );
      }

      if (!targetChannel) {
        console.log(`⚠️ No suitable channel found in ${guild.name} for ban message`);
        return;
      }

      // Create ban embed
      const banEmbed = new EmbedBuilder()
        .setTitle('🚫 Server wurde gebannt')
        .setDescription(
          `**Dieser Server wurde vom Quantix Tickets Bot gebannt.**\n\n` +
          `**Grund:**\n${reason}\n\n` +
          `**Gebannt von:** ${bannedBy}\n` +
          `**Datum:** ${new Date().toLocaleString('de-DE')}\n\n` +
          `Der Bot wird diesen Server jetzt verlassen. Bei Fragen oder um den Ban anzufechten, ` +
          `kontaktiere bitte unseren Support-Server: https://discord.com/invite/mnYbnpyyBS`
        )
        .setColor(0xff0000) // Red
        .setFooter({ text: COPYRIGHT })
        .setTimestamp();

      await targetChannel.send({ embeds: [banEmbed] });
      console.log(`✅ Ban message sent to ${guild.name} in channel #${targetChannel.name}`);
    } catch (err) {
      console.error(`❌ Error sending ban message to ${guild.name}:`, err);
      throw err;
    }
  }

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
      // Check if user has restricted view (only servers where user is member)
      const RESTRICTED_USER_ID = '928901974106202113';
      const isRestrictedView = req.user.id === RESTRICTED_USER_ID;

      const allGuilds = await client.guilds.fetch();
      const blacklist = loadBlacklist();

      const guildsData = [];
      const processedGuildIds = new Set();

      // Add all guilds where bot is currently a member
      for (const [guildId, guild] of allGuilds) {
        try {
          const fullGuild = await client.guilds.fetch(guildId);
          processedGuildIds.add(fullGuild.id);

          // If restricted view, check if user is member of this guild
          let isMember = true;
          if (isRestrictedView) {
            try {
              await fullGuild.members.fetch(req.user.id);
              isMember = true;
            } catch (err) {
              isMember = false;
            }
          }

          // Only add guild if user is member (or not restricted view)
          if (!isRestrictedView || isMember) {
            const isBlocked = blacklist.guilds.hasOwnProperty(fullGuild.id);
            guildsData.push({
              id: fullGuild.id,
              name: fullGuild.name,
              icon: fullGuild.iconURL({ size: 128 }),
              memberCount: fullGuild.memberCount,
              blocked: isBlocked,
              blockReason: isBlocked ? blacklist.guilds[fullGuild.id].reason : null
            });
          }
        } catch (err) {
          console.error(`Error fetching guild ${guildId}:`, err.message);
        }
      }

      // Add blocked guilds that bot is no longer a member of (only for non-restricted view)
      if (!isRestrictedView) {
        for (const [blockedGuildId, blockedData] of Object.entries(blacklist.guilds)) {
          if (!processedGuildIds.has(blockedGuildId)) {
            guildsData.push({
              id: blockedGuildId,
              name: blockedData.name + ' (Verlassen)',
              icon: null,
              memberCount: 0,
              blocked: true,
              blockReason: blockedData.reason || null
            });
          }
        }
      }

      // Sort: blocked last, then by member count
      guildsData.sort((a, b) => {
        if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
        return b.memberCount - a.memberCount;
      });

      // Load user sessions and blacklist
      const sessions = readSessions();
      const userBlacklist = readUserBlacklist();

      const usersData = [];
      for (const [userId, userData] of Object.entries(sessions.users)) {
        const isBlocked = !!userBlacklist.users[userId];
        const banData = userBlacklist.users[userId];
        usersData.push({
          id: userId,
          username: userData.username || 'Unknown',
          discriminator: userData.discriminator || '0',
          avatar: userData.avatar,
          firstLogin: userData.firstLogin,
          lastLogin: userData.lastLogin,
          loginCount: userData.loginCount || 0,
          blocked: isBlocked,
          blockReason: isBlocked ? banData.reason : null,
          blockedAt: isBlocked ? banData.blockedAt : null,
          blockedBy: isBlocked ? banData.blockedBy : null,
          isPermanent: isBlocked ? (banData.isPermanent !== false) : false,
          expiresAt: isBlocked ? banData.expiresAt : null
        });
      }

      // Sort: blocked first, then by last login (most recent first)
      usersData.sort((a, b) => {
        if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
        return new Date(b.lastLogin) - new Date(a.lastLogin);
      });

      res.render('founder', {
        user: req.user,
        guilds: guildsData,
        users: usersData,
        restrictedView: isRestrictedView
      });
    } catch (err) {
      console.error('Founder panel error:', err);
      res.status(500).send('Error loading founder panel');
    }
  });

  // Block Server - POST Route
  router.post('/founder/block-server/:guildId', isFounder, async (req, res) => {
    try {
      // Restricted user cannot perform admin actions
      const RESTRICTED_USER_ID = '928901974106202113';
      if (req.user.id === RESTRICTED_USER_ID) {
        return res.status(403).send('Keine Berechtigung für diese Aktion');
      }

      const guildId = validateDiscordId(req.params.guildId);
      if (!guildId) return res.redirect('/founder?error=invalid-guild-id');

      const banReason = req.body.reason ? sanitizeString(req.body.reason.trim(), 500) : 'Kein Grund angegeben';

      const blacklist = loadBlacklist();

      if (!blacklist.guilds.hasOwnProperty(guildId)) {
        // Get guild info before leaving
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        const guildName = guild ? guild.name : `Server ${guildId}`;

        // Send ban message BEFORE leaving
        if (guild) {
          try {
            await sendBanMessage(guild, banReason, req.user.username || req.user.id);
          } catch (err) {
            console.error(`⚠️ Could not send ban message to ${guildName}:`, err.message);
          }
        }

        // Add to blacklist with name and reason
        blacklist.guilds[guildId] = {
          name: sanitizeString(guildName, 100),
          blockedAt: new Date().toISOString(),
          blockedBy: sanitizeUsername(req.user.username || req.user.id),
          reason: banReason
        };
        saveBlacklist(blacklist);
        console.log(`🚫 Server ${sanitizeString(guildName, 100)} (${guildId}) wurde von ${sanitizeUsername(req.user.username || req.user.id)} blockiert - Grund: ${banReason}`);

        // Leave the server after blocking and sending message
        if (guild) {
          await guild.leave();
          console.log(`👋 Bot hat blockierten Server ${guildName} (${guildId}) verlassen`);
        }
      }

      res.redirect('/founder?success=server-banned');
    } catch (err) {
      console.error('Block server error:', err);
      res.redirect('/founder?error=block-failed');
    }
  });

  // Unblock Server - POST Route
  router.post('/founder/unblock-server/:guildId', isFounder, async (req, res) => {
    try {
      // Restricted user cannot perform admin actions
      const RESTRICTED_USER_ID = '928901974106202113';
      if (req.user.id === RESTRICTED_USER_ID) {
        return res.status(403).send('Keine Berechtigung für diese Aktion');
      }

      const guildId = validateDiscordId(req.params.guildId);
      if (!guildId) return res.redirect('/founder?error=invalid-guild-id');

      const blacklist = loadBlacklist();

      if (blacklist.guilds.hasOwnProperty(guildId)) {
        const serverName = sanitizeString(blacklist.guilds[guildId].name, 100);
        delete blacklist.guilds[guildId];
        saveBlacklist(blacklist);
        console.log(`✅ Server ${serverName} (${guildId}) wurde von ${sanitizeUsername(req.user.username || req.user.id)} entsperrt`);
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
      // Restricted user cannot perform admin actions
      const RESTRICTED_USER_ID = '928901974106202113';
      if (req.user.id === RESTRICTED_USER_ID) {
        return res.status(403).send('Keine Berechtigung für diese Aktion');
      }

      const guildId = validateDiscordId(req.params.guildId);
      if (!guildId) return res.redirect('/founder?error=invalid-guild-id');

      const guild = await client.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        const guildName = sanitizeString(guild.name, 100);
        await guild.leave();
        console.log(`👋 Bot wurde von ${sanitizeUsername(req.user.username || req.user.id)} vom Server ${guildName} (${guildId}) gekickt`);
      }

      res.redirect('/founder');
    } catch (err) {
      console.error('Kick server error:', err);
      res.redirect('/founder?error=kick-failed');
    }
  });

  router.post('/founder/force-delete-server/:guildId', isFounder, async (req, res) => {
    try {
      // Restricted user cannot perform admin actions
      const RESTRICTED_USER_ID = '928901974106202113';
      if (req.user.id === RESTRICTED_USER_ID) {
        return res.status(403).send('Keine Berechtigung für diese Aktion');
      }

      const guildId = validateDiscordId(req.params.guildId);
      if (!guildId) return res.redirect('/founder?error=invalid-guild-id');

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      const guildName = guild ? sanitizeString(guild.name, 100) : `Server ${guildId}`;

      // 1. Leave server if bot is still on it
      if (guild) {
        await guild.leave();
        console.log(`👋 Bot left server during force delete: ${guildName} (${guildId})`);
      }

      // 2. Delete all server data files
      const configFile = `./configs/${guildId}.json`;
      const ticketsFile = `./configs/${guildId}_tickets.json`;
      const counterFile = `./configs/${guildId}_counter.json`;
      const transcriptsDir = path.join(__dirname, 'transcripts', guildId);

      // Delete config files
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
        console.log(`🗑️ Deleted config: ${configFile}`);
      }
      if (fs.existsSync(ticketsFile)) {
        fs.unlinkSync(ticketsFile);
        console.log(`🗑️ Deleted tickets: ${ticketsFile}`);
      }
      if (fs.existsSync(counterFile)) {
        fs.unlinkSync(counterFile);
        console.log(`🗑️ Deleted counter: ${counterFile}`);
      }

      // Delete transcripts directory
      if (fs.existsSync(transcriptsDir)) {
        fs.rmSync(transcriptsDir, { recursive: true, force: true });
        console.log(`🗑️ Deleted transcripts: ${transcriptsDir}`);
      }

      console.log(`🗑️ Force deleted all data for ${guildName} (${guildId}) by ${sanitizeUsername(req.user.username || req.user.id)}`);
      res.redirect('/founder?success=server-deleted');
    } catch (err) {
      console.error('Force delete server error:', err);
      res.redirect('/founder?error=delete-failed');
    }
  });

  // Block User - POST Route
  router.post('/founder/block-user/:userId', isFounder, async (req, res) => {
    try {
      // Restricted user cannot perform admin actions
      const RESTRICTED_USER_ID = '928901974106202113';
      if (req.user.id === RESTRICTED_USER_ID) {
        return res.status(403).send('Keine Berechtigung für diese Aktion');
      }

      const userId = validateDiscordId(req.params.userId);
      if (!userId) return res.redirect('/founder?error=invalid-user-id');

      const blockReason = req.body.reason ? sanitizeString(req.body.reason.trim(), 500) : 'Kein Grund angegeben';
      const duration = req.body.duration || 'permanent'; // permanent, 1, 3, 7, 14, 30, 90

      // Calculate expiration date
      let expiresAt = null;
      let isPermanent = true;
      if (duration !== 'permanent') {
        const days = parseInt(duration);
        if (!isNaN(days) && days > 0) {
          expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
          isPermanent = false;
        }
      }

      const blacklist = readUserBlacklist();

      if (!blacklist.users[userId]) {
        // Get user info from sessions
        const sessions = readSessions();
        const username = sessions.users[userId]?.username || `User ${userId}`;

        // Send DM to user before blocking
        try {
          const user = await client.users.fetch(userId);
          if (user) {
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const blockedDate = new Date().toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            let description = `Dein Zugang zu **Quantix Tickets** wurde gesperrt.\n\n`;

            // Reason field
            description += `**📋 Grund:**\n> ${blockReason}\n\n`;

            // Duration field
            if (isPermanent) {
              description += `**⏰ Dauer:**\n> Permanent\n\n`;
              description += `**❌ Konsequenzen:**\n`;
              description += `• Du kannst dich nicht mehr am Dashboard anmelden\n`;
              description += `• Alle aktiven Sessions wurden beendet\n`;
              description += `• Der Zugriff wurde dauerhaft gesperrt\n\n`;
            } else {
              const expiryDate = new Date(expiresAt).toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              const daysText = duration === '1' ? '1 Tag' : `${duration} Tage`;
              description += `**⏰ Dauer:**\n> Temporär - ${daysText}\n\n`;
              description += `**📅 Läuft ab am:**\n> ${expiryDate}\n\n`;
              description += `**❌ Konsequenzen:**\n`;
              description += `• Du kannst dich bis zum Ablauf nicht am Dashboard anmelden\n`;
              description += `• Alle aktiven Sessions wurden beendet\n`;
              description += `• Nach Ablauf wird der Zugriff automatisch wiederhergestellt\n\n`;
            }

            description += `**📞 Support:**\n`;
            description += `Bei Fragen oder Einspruch wende dich an unseren Support-Server.`;

            const blockEmbed = new EmbedBuilder()
              .setTitle('🚫 Zugang gesperrt')
              .setDescription(description)
              .setColor(0xe74c3c)
              .addFields(
                { name: '🕒 Gesperrt am', value: blockedDate, inline: true },
                { name: '👤 Gesperrt von', value: sanitizeUsername(req.user.username || req.user.id), inline: true }
              )
              .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
              .setTimestamp()
              .setFooter({ text: 'Quantix Tickets © 2025 • Automatische Benachrichtigung' });

            // Support Server Button
            const buttonRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setURL('https://discord.com/invite/mnYbnpyyBS')
                .setStyle(ButtonStyle.Link)
                .setLabel('Support Server')
                .setEmoji('🛟')
            );

            await user.send({ embeds: [blockEmbed], components: [buttonRow] });
            console.log(`📧 ${isPermanent ? 'Permanent' : 'Temporary'} block notification sent to ${username} (${userId})`);
          }
        } catch (dmErr) {
          console.log(`⚠️ Could not send DM to ${username} (${userId}):`, dmErr.message);
          // Continue blocking even if DM fails (user might have DMs disabled)
        }

        blacklist.users[userId] = {
          username: username,
          blockedAt: new Date().toISOString(),
          blockedBy: sanitizeUsername(req.user.username || req.user.id),
          reason: blockReason,
          expiresAt: expiresAt,
          isPermanent: isPermanent
        };

        writeUserBlacklist(blacklist);
        console.log(`🚫 User blocked: ${username} (${userId}) by ${req.user.username}`);
      }

      res.redirect('/founder?success=user-blocked');
    } catch (err) {
      console.error('Block user error:', err);
      res.redirect('/founder?error=block-failed');
    }
  });

  // Unblock User - POST Route
  router.post('/founder/unblock-user/:userId', isFounder, async (req, res) => {
    try {
      // Restricted user cannot perform admin actions
      const RESTRICTED_USER_ID = '928901974106202113';
      if (req.user.id === RESTRICTED_USER_ID) {
        return res.status(403).send('Keine Berechtigung für diese Aktion');
      }

      const userId = validateDiscordId(req.params.userId);
      if (!userId) return res.redirect('/founder?error=invalid-user-id');

      const blacklist = readUserBlacklist();

      if (blacklist.users[userId]) {
        const username = blacklist.users[userId].username || `User ${userId}`;

        // Send DM to user about unblocking
        try {
          const user = await client.users.fetch(userId);
          if (user) {
            const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

            const unblockDate = new Date().toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            let description = `Deine Sperre wurde aufgehoben und dein Zugang zu **Quantix Tickets** wurde wiederhergestellt.\n\n`;

            description += `**✅ Du hast jetzt wieder Zugriff auf:**\n`;
            description += `• Dashboard-Login\n`;
            description += `• Alle Panel-Funktionen\n`;
            description += `• Server-Verwaltung\n\n`;

            description += `**🎫 Nächste Schritte:**\n`;
            description += `Du kannst dich jetzt wieder am Dashboard anmelden und dein Ticket-System verwalten.\n\n`;

            description += `Viel Erfolg mit deinem Ticket-System!`;

            const unblockEmbed = new EmbedBuilder()
              .setTitle('✅ Zugang wiederhergestellt')
              .setDescription(description)
              .setColor(0x00ff88)
              .addFields(
                { name: '🕒 Entsperrt am', value: unblockDate, inline: true },
                { name: '👤 Entsperrt von', value: sanitizeUsername(req.user.username || req.user.id), inline: true }
              )
              .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
              .setTimestamp()
              .setFooter({ text: 'Quantix Tickets © 2025 • Automatische Benachrichtigung' });

            // Dashboard & Support Buttons
            const buttonRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setURL(process.env.PUBLIC_BASE_URL || 'https://tickets.quantix-bot.de')
                .setStyle(ButtonStyle.Link)
                .setLabel('Zum Dashboard')
                .setEmoji('🎫'),
              new ButtonBuilder()
                .setURL('https://discord.com/invite/mnYbnpyyBS')
                .setStyle(ButtonStyle.Link)
                .setLabel('Support')
                .setEmoji('🛟')
            );

            await user.send({ embeds: [unblockEmbed], components: [buttonRow] });
            console.log(`📧 Unblock notification sent to ${username} (${userId})`);
          }
        } catch (dmErr) {
          console.log(`⚠️ Could not send DM to ${username} (${userId}):`, dmErr.message);
          // Continue unblocking even if DM fails
        }

        delete blacklist.users[userId];
        writeUserBlacklist(blacklist);
        console.log(`✅ User unblocked: ${username} (${userId}) by ${req.user.username}`);
      }

      res.redirect('/founder?success=user-unblocked');
    } catch (err) {
      console.error('Unblock user error:', err);
      res.redirect('/founder?error=unblock-failed');
    }
  });

  // Broadcast changelog to all servers - POST Route
  router.post('/founder/broadcast', isFounder, async (req, res) => {
    try {
      // Restricted user cannot perform admin actions
      const RESTRICTED_USER_ID = '928901974106202113';
      if (req.user.id === RESTRICTED_USER_ID) {
        return res.status(403).json({ success: false, error: 'Keine Berechtigung für diese Aktion' });
      }

      // Load changelog
      const { EmbedBuilder } = require('discord.js');
      const { getGuildLanguage } = require('./translations');
      const { COPYRIGHT, VERSION } = require('./version.config');

      let changelog;
      try {
        const changelogPath = path.join(__dirname, 'changelog.json');
        const changelogData = fs.readFileSync(changelogPath, 'utf8');
        changelog = JSON.parse(changelogData);
      } catch (err) {
        console.error('Error loading changelog:', err);
        return res.status(500).json({ success: false, error: 'Changelog konnte nicht geladen werden' });
      }

      const currentVersionData = changelog.versions.find(v => v.version === VERSION);
      if (!currentVersionData) {
        return res.status(400).json({ success: false, error: `Keine Changelog-Daten für Version ${VERSION} gefunden` });
      }

      // Get all guilds
      const guilds = client.guilds.cache;
      const results = [];

      console.log(`📢 Broadcasting changelog v${VERSION} to ${guilds.size} servers by ${req.user.username} (${req.user.id})`);

      for (const [guildId, guild] of guilds) {
        try {
          const cfg = readCfg(guildId);

          // Only send to log channel
          if (!cfg.logChannelId) {
            results.push({
              success: false,
              guildId: guildId,
              guildName: guild.name,
              error: 'Kein Log-Channel konfiguriert'
            });
            continue;
          }

          const targetChannel = guild.channels.cache.get(cfg.logChannelId);
          if (!targetChannel) {
            results.push({
              success: false,
              guildId: guildId,
              guildName: guild.name,
              error: 'Log-Channel nicht gefunden oder keine Berechtigung'
            });
            continue;
          }

          // Get guild language and changelog
          const guildLang = getGuildLanguage(guildId) || 'de';
          const changes = currentVersionData.changes[guildLang] || currentVersionData.changes.de || [];

          // Translation texts
          const texts = {
            de: {
              title: '📢 Versions-Update',
              description: `**Quantix Tickets Bot** wurde auf Version **${VERSION}** aktualisiert`,
              versionLabel: '🆕 Version',
              dateLabel: '📅 Datum',
              changesLabel: '✨ Änderungen'
            },
            en: {
              title: '📢 Version Update',
              description: `**Quantix Tickets Bot** has been updated to version **${VERSION}**`,
              versionLabel: '🆕 Version',
              dateLabel: '📅 Date',
              changesLabel: '✨ Changes'
            },
            he: {
              title: '📢 עדכון גרסה',
              description: `**בוט Quantix Tickets** עודכן לגרסה **${VERSION}**`,
              versionLabel: '🆕 גרסה',
              dateLabel: '📅 תאריך',
              changesLabel: '✨ שינויים'
            },
            ja: {
              title: '📢 バージョンアップデート',
              description: `**Quantix Tickets Bot** がバージョン **${VERSION}** にアップデートされました`,
              versionLabel: '🆕 バージョン',
              dateLabel: '📅 日付',
              changesLabel: '✨ 変更点'
            },
            ru: {
              title: '📢 Обновление версии',
              description: `**Quantix Tickets Bot** обновлен до версии **${VERSION}**`,
              versionLabel: '🆕 Версия',
              dateLabel: '📅 Дата',
              changesLabel: '✨ Изменения'
            },
            pt: {
              title: '📢 Atualização de Versão',
              description: `**Quantix Tickets Bot** foi atualizado para a versão **${VERSION}**`,
              versionLabel: '🆕 Versão',
              dateLabel: '📅 Data',
              changesLabel: '✨ Mudanças'
            },
            es: {
              title: '📢 Actualización de Versión',
              description: `**Quantix Tickets Bot** se actualizó a la versión **${VERSION}**`,
              versionLabel: '🆕 Versión',
              dateLabel: '📅 Fecha',
              changesLabel: '✨ Cambios'
            },
            id: {
              title: '📢 Pembaruan Versi',
              description: `**Quantix Tickets Bot** telah diperbarui ke versi **${VERSION}**`,
              versionLabel: '🆕 Versi',
              dateLabel: '📅 Tanggal',
              changesLabel: '✨ Perubahan'
            },
            ar: {
              title: '📢 تحديث الإصدار',
              description: `**بوت Quantix Tickets** تم تحديثه إلى الإصدار **${VERSION}**`,
              versionLabel: '🆕 الإصدار',
              dateLabel: '📅 التاريخ',
              changesLabel: '✨ التغييرات'
            }
          };

          const t = texts[guildLang] || texts.de;

          // Create changelog embed
          const embed = new EmbedBuilder()
            .setColor(0x00b894)
            .setTitle(t.title)
            .setDescription(t.description)
            .addFields([
              { name: t.versionLabel, value: VERSION, inline: true },
              { name: t.dateLabel, value: currentVersionData.date || new Date().toLocaleDateString('de-DE'), inline: true }
            ])
            .setFooter({ text: COPYRIGHT })
            .setTimestamp();

          if (changes.length > 0) {
            embed.addFields([
              {
                name: t.changesLabel,
                value: changes.join('\n')
              }
            ]);
          }

          await targetChannel.send({ embeds: [embed] });

          results.push({
            success: true,
            guildId: guildId,
            guildName: guild.name,
            channelName: targetChannel.name
          });

          console.log(`✅ Changelog sent to ${guild.name} (${guildId}) in #${targetChannel.name}`);
        } catch (guildErr) {
          results.push({
            success: false,
            guildId: guildId,
            guildName: guild.name,
            error: guildErr.message || 'Unbekannter Fehler'
          });
          console.error(`❌ Failed to send changelog to ${guild.name} (${guildId}):`, guildErr.message);
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`📊 Changelog broadcast completed: ${successCount}/${guilds.size} servers reached`);

      res.json({
        success: true,
        version: VERSION,
        results: results
      });
    } catch (err) {
      console.error('Broadcast error:', err);
      res.status(500).json({ success: false, error: err.message || 'Interner Serverfehler' });
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
  // BACKUP SYSTEM - Download & Upload Config
  // ============================================================

  // Download Config Backup
  router.get('/api/backup/download/:guildId', isAuthOrTeam, async (req, res) => {
    try {
      const { guildId } = req.params;

      // Check if user has access to this guild
      if (req.session.selectedGuild !== guildId) {
        return res.status(403).json({ error: 'Kein Zugriff auf diesen Server' });
      }

      const cfg = readCfg(guildId);
      if (!cfg) {
        return res.status(404).json({ error: 'Konfiguration nicht gefunden' });
      }

      // Create backup object with metadata
      const backup = {
        _backup: {
          version: '1.5.1',
          createdAt: new Date().toISOString(),
          guildId: guildId
        },
        config: cfg
      };

      // Send as downloadable JSON file
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="quantix-backup-${guildId}-${Date.now()}.json"`);
      res.send(JSON.stringify(backup, null, 2));

    } catch (err) {
      console.error('Backup download error:', err);
      res.status(500).json({ error: 'Backup konnte nicht erstellt werden' });
    }
  });

  // Upload Config Backup
  router.post('/api/backup/upload/:guildId', isAuthOrTeam, express.json({ limit: '5mb' }), async (req, res) => {
    try {
      const { guildId } = req.params;

      // Check if user has access to this guild
      if (req.session.selectedGuild !== guildId) {
        return res.status(403).json({ error: 'Kein Zugriff auf diesen Server' });
      }

      const backup = req.body;

      // Validate backup structure
      if (!backup || !backup._backup || !backup.config) {
        return res.status(400).json({ error: 'Ungültiges Backup-Format' });
      }

      // Sanitize and validate critical fields
      const newConfig = backup.config;

      // Preserve some fields from current config
      const currentCfg = readCfg(guildId) || {};
      newConfig.premium = currentCfg.premium; // Don't allow premium override

      // Save the restored config
      writeCfg(guildId, newConfig);

      res.json({
        success: true,
        message: 'Backup erfolgreich wiederhergestellt',
        backupDate: backup._backup.createdAt
      });

    } catch (err) {
      console.error('Backup upload error:', err);
      res.status(500).json({ error: 'Backup konnte nicht wiederhergestellt werden' });
    }
  });

  // Reopen closed ticket
  router.post('/api/ticket/reopen', isAuthOrTeam, express.json(), async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;
      const { ticketId } = req.body;

      if (!guildId || !ticketId) {
        return res.status(400).json({ error: 'Guild ID oder Ticket ID fehlt' });
      }

      const tickets = loadTickets(guildId);
      const ticketIndex = tickets.findIndex(t => t.id === parseInt(ticketId));

      if (ticketIndex === -1) {
        return res.status(404).json({ error: 'Ticket nicht gefunden' });
      }

      const ticket = tickets[ticketIndex];

      if (ticket.status === 'offen' || ticket.status === 'open') {
        return res.status(400).json({ error: 'Ticket ist bereits offen' });
      }

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        return res.status(404).json({ error: 'Server nicht gefunden' });
      }

      const cfg = readCfg(guildId);
      const categoryId = cfg.categoryId;

      // Create new channel
      const channelName = `ticket-${ticket.id}`;
      const permissionOverwrites = [
        {
          id: guild.id,
          deny: ['ViewChannel']
        },
        {
          id: ticket.userId,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        }
      ];

      // Add team roles
      if (cfg.teamRoleId) {
        const teamRoles = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
        teamRoles.forEach(roleId => {
          if (roleId) {
            permissionOverwrites.push({
              id: roleId,
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
            });
          }
        });
      }

      const newChannel = await guild.channels.create({
        name: channelName,
        type: 0,
        parent: categoryId || null,
        permissionOverwrites
      });

      // Update ticket
      ticket.status = 'offen';
      ticket.channelId = newChannel.id;
      ticket.reopenedAt = new Date().toISOString();
      ticket.reopenedBy = req.user.id;
      delete ticket.closedAt;
      delete ticket.closedBy;

      saveTickets(guildId, tickets);

      // Send message in new channel with buttons
      const reopenEmbed = new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('🔄 Ticket wiedereröffnet')
        .setDescription(
          `Dieses Ticket wurde vom Web-Panel aus wiedereröffnet.\n\n` +
          `**Ticket:** #${ticket.id}\n` +
          `**Thema:** ${ticket.topic || 'Kein Thema'}\n` +
          `**Ersteller:** <@${ticket.userId}>`
        )
        .setFooter({ text: 'Quantix Tickets • Ticket wiedereröffnet' })
        .setTimestamp();

      // Create ticket control buttons
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('request_close')
          .setEmoji('📩')
          .setLabel('Schließung anfragen')
          .setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close')
          .setEmoji('🔐')
          .setLabel('Schließen')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('priority_down')
          .setEmoji('⬇️')
          .setLabel('Priorität -')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('priority_up')
          .setEmoji('⬆️')
          .setLabel('Priorität +')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('claim')
          .setEmoji('✨')
          .setLabel('Claim')
          .setStyle(ButtonStyle.Success)
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('add_user')
          .setEmoji('👥')
          .setLabel('User hinzufügen')
          .setStyle(ButtonStyle.Secondary)
      );

      await newChannel.send({
        content: `<@${ticket.userId}>`,
        embeds: [reopenEmbed],
        components: [row1, row2, row3]
      });

      res.json({
        success: true,
        channelId: newChannel.id,
        channelName: newChannel.name
      });

    } catch (err) {
      console.error('Ticket reopen error:', err);
      res.status(500).json({ error: 'Ticket konnte nicht wiedereröffnet werden: ' + err.message });
    }
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

  // Whitelabel Page (Premium only)
  router.get('/whitelabel', ensureAuthenticated, isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);

      const premiumInfo = getPremiumInfo(guildId);
      const hasPremium = premiumInfo.tier === 'pro' || premiumInfo.tier === 'beta';

      res.render('whitelabel', {
        config: cfg,
        isPremium: hasPremium,
        premiumInfo: premiumInfo,
        user: req.user,
        version: VERSION
      });
    } catch (err) {
      console.error('[Whitelabel] Error loading page:', err);
      res.status(500).send('Fehler beim Laden der Whitelabel-Seite');
    }
  });

  // Whitelabel Save API (Premium only)
  router.post('/api/whitelabel/save', ensureAuthenticated, isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);

      // Check premium
      const premiumInfo = getPremiumInfo(guildId);
      const hasPremium = premiumInfo.tier === 'pro' || premiumInfo.tier === 'beta';

      if (!hasPremium) {
        return res.status(403).send('Premium erforderlich');
      }

      // Initialize whitelabel object if not exists
      if (!cfg.whitelabel) {
        cfg.whitelabel = {
          enabled: false,
          botName: '',
          botToken: '',
          botAvatar: '',
          botBanner: '',
          botStatus: { type: 'online', text: '' },
          footerImage: ''
        };
      }

      // Update whitelabel config
      cfg.whitelabel.botName = sanitizeText(req.body.botName || '');
      cfg.whitelabel.botStatus = {
        type: sanitizeText(req.body.statusType || 'online'),
        text: sanitizeText(req.body.statusText || '')
      };

      // Only update token if provided
      if (req.body.botToken && req.body.botToken.length > 10) {
        cfg.whitelabel.botToken = req.body.botToken; // Store encrypted in production!
      }

      // Handle file uploads (if multer is configured)
      // For now, we'll handle base64 encoded images from frontend
      if (req.body.botAvatarData) {
        cfg.whitelabel.botAvatar = req.body.botAvatarData;
      }
      if (req.body.botBannerData) {
        cfg.whitelabel.botBanner = req.body.botBannerData;
      }
      if (req.body.footerImageData) {
        cfg.whitelabel.footerImage = req.body.footerImageData;
      }

      cfg.whitelabel.enabled = true;

      writeCfg(guildId, cfg);

      console.log(`[Whitelabel] Config updated for guild ${guildId}`);

      // Auto-start/restart custom bot if token is provided
      if (cfg.whitelabel.botToken && cfg.whitelabel.botToken.length > 10) {
        try {
          const customBotManager = require('./custom-bot-manager.js');

          // Check if bot is already running
          if (customBotManager.getBot(guildId)) {
            console.log(`[Whitelabel] Restarting custom bot for guild ${guildId}...`);
            await customBotManager.restartBot(guildId);
          } else {
            console.log(`[Whitelabel] Starting custom bot for guild ${guildId}...`);
            await customBotManager.startBot(guildId);
          }
        } catch (error) {
          console.error(`[Whitelabel] Error starting/restarting custom bot:`, error);
          // Don't fail the save if bot startup fails
        }
      }

      res.status(200).send('Gespeichert');

    } catch (err) {
      console.error('[Whitelabel] Error saving:', err);
      res.status(500).send('Fehler beim Speichern');
    }
  });

  // Custom Bot Control API
  router.post('/api/custom-bot/start', ensureAuthenticated, isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;
      const customBotManager = require('./custom-bot-manager.js');

      const result = await customBotManager.startBot(guildId);
      if (result.success) {
        res.json({ success: true, message: 'Bot gestartet' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('[Custom Bot API] Start error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/api/custom-bot/stop', ensureAuthenticated, isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;
      const customBotManager = require('./custom-bot-manager.js');

      const result = await customBotManager.stopBot(guildId);
      res.json({ success: true, message: 'Bot gestoppt' });
    } catch (error) {
      console.error('[Custom Bot API] Stop error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/api/custom-bot/restart', ensureAuthenticated, isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;
      const customBotManager = require('./custom-bot-manager.js');

      const result = await customBotManager.restartBot(guildId);
      if (result.success) {
        res.json({ success: true, message: 'Bot neugestartet' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('[Custom Bot API] Restart error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/api/custom-bot/status', ensureAuthenticated, isAuth, async (req, res) => {
    try {
      const guildId = req.session.selectedGuild;
      const customBotManager = require('./custom-bot-manager.js');

      const bot = customBotManager.getBot(guildId);
      const status = customBotManager.getBotStatus(guildId);

      res.json({
        running: bot !== null,
        status: status.status,
        error: status.error,
        username: bot?.user?.username || null,
        tag: bot?.user?.tag || null
      });
    } catch (error) {
      console.error('[Custom Bot API] Status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Mount API routes
  router.use('/api', apiRoutes);

  // Mount Mobile API routes
  const mobileApi = require('./mobile-api');
  mobileApi.app = { locals: { discordClient: client } };
  router.use('/api/mobile', mobileApi);

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

/**
 * Validate and parse emoji for Discord API
 * @param {string} emoji - Emoji string (Unicode or custom format)
 * @returns {object|string|undefined} - Valid emoji object/string or undefined
 */
function parseEmoji(emoji) {
  if (!emoji || typeof emoji !== 'string') return undefined;

  const trimmed = emoji.trim();
  if (!trimmed) return undefined;

  // Check if it's a custom emoji format: <:name:id> or <a:name:id>
  const customEmojiMatch = trimmed.match(/^<(a?):([^:]+):(\d+)>$/);
  if (customEmojiMatch) {
    return {
      name: customEmojiMatch[2],
      id: customEmojiMatch[3],
      animated: customEmojiMatch[1] === 'a'
    };
  }

  // Check if it's just a custom emoji ID format: name:id
  const idFormatMatch = trimmed.match(/^([^:]+):(\d+)$/);
  if (idFormatMatch) {
    return {
      name: idFormatMatch[1],
      id: idFormatMatch[2],
      animated: false
    };
  }

  // Check if it's a Unicode emoji (contains emoji characters)
  // Unicode emojis are typically 1-4 characters and contain special unicode ranges
  const emojiRegex = /^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Component}]+$/u;
  if (emojiRegex.test(trimmed) && trimmed.length <= 10) {
    return trimmed; // Return as string for Unicode emoji
  }

  // If it's just text (like "wink"), it's invalid - return undefined
  console.log(`⚠️ Invalid emoji detected and skipped: "${trimmed}"`);
  return undefined;
}

function buildPanelSelect(cfg){
  const topics = (cfg.topics||[]).filter(t => t && t.label && t.value);
  if(topics.length === 0){
    topics.push({ label: 'Keine Topics konfiguriert', value: 'none', emoji: '⚠️' });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Thema wählen …')
      .addOptions(topics.map(t => {
        const parsedEmoji = parseEmoji(t.emoji);
        return {
          label: t.label,
          value: t.value,
          emoji: parsedEmoji
        };
      }))
  );
}

function buildPanelEmbed(cfg, guild = null){
  if(!cfg.panelEmbed || (!cfg.panelEmbed.title && !cfg.panelEmbed.description)) return null;
  const e = new EmbedBuilder();
  if(cfg.panelEmbed.title) e.setTitle(cfg.panelEmbed.title);
  if(cfg.panelEmbed.description) e.setDescription(cfg.panelEmbed.description);
  if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) e.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
  if(cfg.panelEmbed.footer) e.setFooter({ text: cfg.panelEmbed.footer });

  // Add server icon as thumbnail
  if(guild) {
    const iconURL = guild.iconURL({ size: 128, extension: 'png' });
    if(iconURL) e.setThumbnail(iconURL);
  }

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
