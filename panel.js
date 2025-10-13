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
          footer: 'TRS Tickets ©️'
        },
        panelEmbed: {
          title: '🎫 Ticket System',
          description: 'Wähle dein Thema',
          color: '#5865F2',
          footer: 'TRS Tickets ©️'
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
      if(!cfg.logChannelId) return;
      const guild = await client.guilds.fetch(guildId);
      const ch = await guild.channels.fetch(cfg.logChannelId);
      if(!ch) return;

      const embed = new EmbedBuilder()
        .setDescription(text)
        .setColor(0x00ff00)
        .setTimestamp()
        .setFooter({ text: COPYRIGHT });

      if(user){
        embed.setAuthor({ name: `${user.username}`, iconURL: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined });
      }

      await ch.send({ embeds: [embed] });
    } catch(err) {
      console.error('Log Error:', err);
    }
  }

  router.use(cookieParser());
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly:true, sameSite:'lax', secure: /^https:\/\//i.test(BASE) }
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

  router.get('/', (req,res)=>{
    const lang = req.cookies.lang || 'de';
    const isAuthenticated = req.isAuthenticated && req.isAuthenticated();
    res.render('home', {
      lang: lang,
      t: getTranslations(lang),
      user: isAuthenticated ? req.user : null,
      isAuthenticated: isAuthenticated
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
      const availableServers = (req.user.guilds || [])
        .filter(g => {
          const hasBot = botGuildIds.has(g.id);
          const isAdmin = (BigInt(g.permissions) & ADMIN) === ADMIN;
          return hasBot && isAdmin;
        })
        .map(g => ({
          id: g.id,
          name: g.name,
          icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
        }));

      if(availableServers.length === 0){
        return res.send('<h1>Keine Server verfügbar</h1><p>Du bist auf keinem Server Administrator wo der Bot ist.</p><p><a href="/logout">Logout</a></p>');
      }

      res.render('select-server', {
        servers: availableServers,
        version: VERSION,
        currentGuild: req.session.selectedGuild || null,
        t: res.locals.t
      });
    } catch(err){
      console.error('Server-Auswahl Fehler:', err);
      res.status(500).send('Fehler beim Laden der Server');
    }
  });

  router.post('/select-server', (req,res)=>{
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');

    const guildId = req.body.guildId;
    if(!guildId) return res.redirect('/select-server');

    const ADMIN = 0x8n;
    const entry = req.user.guilds?.find(g=>g.id===guildId);
    if(!entry || !(BigInt(entry.permissions) & ADMIN)){
      return res.status(403).send('Keine Administrator-Rechte auf diesem Server.');
    }

    req.session.selectedGuild = guildId;
    res.redirect('/panel');
  });

  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login-Versuche – bitte 4s warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);
        if(err.oauthError) return res.status(429).send('<h2>Rate Limit</h2><p>Bitte kurz warten.</p><p><a href="/login">Login</a></p>');
        return res.status(500).send('OAuth Fehler.');
      }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{
        if(e){ console.error('Session Fehler:', e); return res.status(500).send('Session Fehler.'); }
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  router.get('/logout',(req,res)=>{ req.logout?.(()=>{}); req.session.destroy(()=>res.redirect('/')); });

  router.get('/set-user-language/:lang', (req, res) => {
    const lang = ['de', 'en', 'he', 'ja', 'ru', 'pt'].includes(req.params.lang) ? req.params.lang : 'de';
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, path: '/' });
    res.redirect('/');
  });

  router.get('/set-language/:lang', isAuth, async (req, res) => {
    const lang = ['de', 'en', 'he', 'ja', 'ru', 'pt'].includes(req.params.lang) ? req.params.lang : 'de';
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

  router.get('/panel', isAuth, async (req,res)=>{
    const guildId = req.session.selectedGuild;
    const cfg = readCfg(guildId);

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

    res.render('panel', {
      cfg,
      msg: req.query.msg||null,
      channels,
      roles,
      version: VERSION,
      guildName,
      guildId
    });
  });

  router.post('/panel', isAuth, async (req,res)=>{
    try {
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);

      cfg.guildId = guildId;
      if(req.body.ticketCategoryId) cfg.ticketCategoryId = req.body.ticketCategoryId.trim();
      if(req.body.logChannelId) cfg.logChannelId = req.body.logChannelId.trim();
      if(req.body.transcriptChannelId) cfg.transcriptChannelId = req.body.transcriptChannelId.trim();
      if(req.body.teamRoleId) cfg.teamRoleId = req.body.teamRoleId.trim();

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

      if(Object.prototype.hasOwnProperty.call(req.body,'formFieldsJson')){
        try {
          const ff = JSON.parse(req.body.formFieldsJson);
          cfg.formFields = Array.isArray(ff) ? ff : [];
        } catch { cfg.formFields = []; }
      }

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
        title:       take('embedTitle',       prevTE.title),
        description: take('embedDescription', prevTE.description),
        color:       ensureHex(take('embedColor', prevTE.color), '#2b90d9'),
        footer:      take('embedFooter',      prevTE.footer)
      };

      const prevPE = cfg.panelEmbed || {};
      cfg.panelEmbed = {
        title:       take('panelTitle',       prevPE.title),
        description: take('panelDescription', prevPE.description),
        color:       ensureHex(take('panelColor', prevPE.color), '#5865F2'),
        footer:      take('panelFooter',      prevPE.footer)
      };

      writeCfg(guildId, cfg);

      await logEvent(guildId, t(guildId, 'logs.config_updated'), req.user);

      res.redirect('/panel?msg=saved');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const guildId = req.session.selectedGuild;
      const cfg = readCfg(guildId);
      cfg.panelChannelId = req.body.channelId;
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
    const guildId = req.session.selectedGuild;
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

  router.get('/tickets', isAuth, async (req,res)=>{
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
        version: VERSION
      });
    } catch(e){ console.error(e); res.status(500).send('Fehler beim Laden'); }
  });

  router.get('/tickets/data', isAuth, (req,res)=>{ res.json(loadTickets(req.session.selectedGuild)); });

  router.get('/transcript/:id', isAuth, (req,res)=>{
    const id = req.params.id.replace(/[^0-9]/g,'');
    if(!id) return res.status(400).send('ID fehlt');
    const file = path.join(__dirname, `transcript_${id}.html`);
    if(!fs.existsSync(file)) return res.status(404).send('Transcript nicht gefunden');
    res.sendFile(file);
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
              .setFooter({ text: 'TRS Tickets Bot Updates' });

            if (commit.url) {
              embed.setURL(commit.url);
            }

            await channel.send({ embeds: [embed] });
          }

          if (commits.length > 5) {
            const moreEmbed = new EmbedBuilder()
              .setDescription(`... und ${commits.length - 5} weitere Commit(s)`)
              .setColor(0x00ff88)
              .setFooter({ text: 'TRS Tickets Bot Updates' });
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
  <title>TRS Tickets Bot - Status</title>
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
      <h1 class="bot-name">${user ? user.username : 'TRS Tickets Bot'}</h1>
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
      <p>TRS Tickets Bot ©️ ${new Date().getFullYear()}</p>
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
