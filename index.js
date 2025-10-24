require('dotenv').config();

const fs = require('fs');
const path = require('path');

let REQUIRED_APP_KEY;
try {
  const keyPath = path.join(__dirname, 'app.key');
  REQUIRED_APP_KEY = fs.readFileSync(keyPath, 'utf8').trim();
  if(!REQUIRED_APP_KEY || REQUIRED_APP_KEY.length < 10){
    throw new Error('Invalid key format');
  }
} catch(err) {
  console.error('\n❌ CRITICAL ERROR: app.key file not found or invalid!');
  console.error('📝 Please ensure app.key file exists in the root directory');
  console.error('🔐 Contact the developer for the correct app.key file');
  console.error('⛔ Bot startup aborted for security reasons\n');
  process.exit(1);
}

if (!process.env.APPLICATION_KEY || process.env.APPLICATION_KEY !== REQUIRED_APP_KEY) {
  console.error('\n❌ CRITICAL ERROR: Invalid or missing APPLICATION_KEY!');
  console.error('📝 Please set APPLICATION_KEY in your .env file');
  console.error('🔐 Contact the developer for the correct APPLICATION_KEY');
  console.error('⛔ Bot startup aborted for security reasons\n');
  process.exit(1);
}

console.log('✅ Application Key verified successfully');

// Show startup banner
const { showBanner } = require('./startup-banner');
showBanner();

const express = require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST, SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, Events, AttachmentBuilder,
  StringSelectMenuBuilder, ActivityType
} = require('discord.js');
const { getGuildLanguage, setGuildLanguage, t, getLanguageName } = require('./translations');
const { VERSION, COPYRIGHT } = require('./version.config');
const { initEmailService, sendTicketNotification, getGuildEmail } = require('./email-notifications');
const { sendDMNotification } = require('./dm-notifications');
const { sanitizeUsername, validateDiscordId, sanitizeString } = require('./xss-protection');
const { startAutoCloseService } = require('./auto-close-service');
const { handleTagAdd, handleTagRemove } = require('./tag-handler');
const { createVoiceChannel, deleteVoiceChannel, hasVoiceChannel } = require('./voice-support');
const { handleTemplateUse } = require('./template-handler');
const { handleDepartmentForward } = require('./department-handler');
const { hasFeature, isPremium, getPremiumInfo, getExpiringTrials, wasWarningSent, markTrialWarningSent, getTrialInfo, isTrialActive, activateAutoTrial, checkExpiredCancellations } = require('./premium');

const PREFIX    = '🎫│';
const PRIORITY_STATES = [
  { dot: '🟢', embedColor: 0x2bd94a, label: 'Grün'   },
  { dot: '🟠', embedColor: 0xff9900, label: 'Orange' },
  { dot: '🔴', embedColor: 0xd92b2b, label: 'Rot'    }
];

function getTeamRole(guildId){
  const cfg = readCfg(guildId);
  // Legacy support: Return first team role ID or null
  if(Array.isArray(cfg.teamRoleId)){
    return cfg.teamRoleId.length > 0 ? cfg.teamRoleId[0] : null;
  }
  return cfg.teamRoleId || null;
}

function getPriorityRoles(guildId, priority = null){
  const cfg = readCfg(guildId);

  if(cfg.priorityRoles){
    if(priority !== null){
      const roles = cfg.priorityRoles[priority.toString()] || [];
      return Array.isArray(roles) ? roles : [];
    }
    const allRoles = [];
    Object.values(cfg.priorityRoles).forEach(roleList => {
      if(Array.isArray(roleList)) allRoles.push(...roleList);
    });
    return [...new Set(allRoles)];
  }

  // Legacy support: teamRoleId can be string or array
  if(Array.isArray(cfg.teamRoleId)){
    return cfg.teamRoleId.filter(r => r && r.trim());
  }
  return cfg.teamRoleId ? [cfg.teamRoleId] : [];
}

function getAllTeamRoles(guildId){
  const cfg = readCfg(guildId);
  const roles = new Set();

  console.log(`🔍 getAllTeamRoles (index.js) - Raw config:`, {
    teamRoleId: cfg.teamRoleId,
    priorityRoles: cfg.priorityRoles
  });

  if(cfg.priorityRoles){
    Object.entries(cfg.priorityRoles).forEach(([priority, roleList]) => {
      if(Array.isArray(roleList)){
        roleList.forEach(r => {
          if(r && r.trim()){
            roles.add(r.trim());
            console.log(`  ✅ Added priority role [${priority}]: ${r.trim()}`);
          }
        });
      } else if(typeof roleList === 'string' && roleList.trim()){
        roles.add(roleList.trim());
        console.log(`  ✅ Added priority role [${priority}]: ${roleList.trim()}`);
      }
    });
  }

  // Legacy support: teamRoleId can be string or array
  if(cfg.teamRoleId){
    if(Array.isArray(cfg.teamRoleId)){
      cfg.teamRoleId.forEach(r => {
        if(r && r.trim()){
          roles.add(r.trim());
          console.log(`  ✅ Added team role: ${r.trim()}`);
        }
      });
    } else if(typeof cfg.teamRoleId === 'string' && cfg.teamRoleId.trim()){
      roles.add(cfg.teamRoleId.trim());
      console.log(`  ✅ Added team role: ${cfg.teamRoleId.trim()}`);
    }
  }

  const finalRoles = Array.from(roles).filter(r => r && r.trim());
  console.log(`📋 Final team roles (index.js):`, finalRoles);
  return finalRoles;
}

/**
 * Check if a member has any of the configured team roles
 * @param {GuildMember} member - Discord guild member
 * @param {string} guildId - Guild ID
 * @returns {boolean} True if member has any team role
 */
function hasAnyTeamRole(member, guildId){
  const allTeamRoles = getAllTeamRoles(guildId);
  console.log(`🔍 hasAnyTeamRole - Checking member ${member.user.tag}:`, {
    memberRoles: Array.from(member.roles.cache.keys()),
    teamRoles: allTeamRoles
  });

  const hasRole = allTeamRoles.some(roleId => {
    const has = member.roles.cache.has(roleId);
    if(has) console.log(`  ✅ Member has team role: ${roleId}`);
    return has;
  });

  console.log(`  Result: ${hasRole ? '✅ Has team role' : '❌ No team role'}`);
  return hasRole;
}

function getHierarchicalPriorityRoles(guildId, priority = 0){
  const cfg = readCfg(guildId);
  const roles = new Set();

  if(!cfg.priorityRoles){
    // Legacy support: teamRoleId can be string or array
    if(Array.isArray(cfg.teamRoleId)){
      return cfg.teamRoleId.filter(r => r && r.trim());
    }
    return cfg.teamRoleId ? [cfg.teamRoleId] : [];
  }

  // Hierarchisch: Rot (2) sieht 2+1+0, Orange (1) sieht 1+0, Grün (0) sieht nur 0
  for(let level = priority; level >= 0; level--){
    const levelRoles = cfg.priorityRoles[level.toString()] || [];
    if(Array.isArray(levelRoles)){
      levelRoles.forEach(r => roles.add(r));
    }
  }

  return Array.from(roles).filter(r => r && r.trim());
}

const { Collection } = require('discord.js');
const commandsCollection = new Collection();

function loadCommands(){
  commandsCollection.clear();
  const commandFiles = fs.readdirSync(path.join(__dirname,'commands')).filter(f=>f.endsWith('.js'));
  for(const file of commandFiles){
    const filePath = path.join(__dirname,'commands',file);
    delete require.cache[require.resolve(filePath)];
    try {
      const cmd = require(filePath);
      if(cmd.data && cmd.execute) commandsCollection.set(cmd.data.name, cmd);
    } catch(err){ console.error(`Fehler beim Laden von ${file}:`, err); }
  }
  console.log(`📦 ${commandsCollection.size} Commands geladen`);
}

const CONFIG_DIR   = path.join(__dirname,'configs');
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');

function getTicketsPath(guildId){
  if(!guildId) return TICKETS_PATH;
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}
function getCounterPath(guildId){
  if(!guildId) return COUNTER_PATH;
  return path.join(CONFIG_DIR, `${guildId}_counter.json`);
}

function safeRead(file, fallback){
  try { const raw = fs.readFileSync(file,'utf8'); return raw?JSON.parse(raw):fallback; } catch { return fallback; }
}
function safeWrite(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }

// SLA System Helper Functions
function calculateSLADeadline(guildId, priority, createdAt = Date.now()){
  const cfg = readCfg(guildId);
  if(!cfg.sla || !cfg.sla.enabled) return null;

  const hours = priority === 2 ? cfg.sla.priority2Hours : priority === 1 ? cfg.sla.priority1Hours : cfg.sla.priority0Hours;
  return createdAt + (hours * 60 * 60 * 1000);
}

function getSLAStatusText(deadline){
  if(!deadline) return null;
  const now = Date.now();
  const remaining = deadline - now;

  if(remaining <= 0){
    const overdue = Math.abs(remaining);
    const hours = Math.floor(overdue / (60 * 60 * 1000));
    const minutes = Math.floor((overdue % (60 * 60 * 1000)) / (60 * 1000));
    return `🚨 **ÜBERFÄLLIG** (${hours}h ${minutes}m)`;
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if(hours < 1){
    return `⚠️ **${minutes}m verbleibend**`;
  }
  return `⏱️ ${hours}h ${minutes}m verbleibend`;
}

function getSLAProgress(createdAt, deadline){
  if(!deadline) return 0;
  const total = deadline - createdAt;
  const elapsed = Date.now() - createdAt;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

if(!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR);

function readCfg(guildId){
  try {
    if(!guildId){
      return safeRead(CFG_PATH, {}) || {};
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
        priorityRoles: {
          '0': [],
          '1': [],
          '2': []
        },
        githubCommitsEnabled: true,
        githubWebhookChannelId: null,
        maxTicketsPerUser: 3,
        antiSpam: {
          enabled: true,
          maxTickets: 3,
          timeWindowMinutes: 10,
          maxButtonClicks: 5,
          buttonTimeWindowSeconds: 10
        },
        ticketRating: {
          enabled: true,
          requireFeedback: false,
          showInAnalytics: true
        },
        sla: {
          enabled: false,
          priority0Hours: 24,
          priority1Hours: 4,
          priority2Hours: 1,
          warnAtPercent: 80,
          escalateToRole: null
        },
        fileUpload: {
          enabled: true,
          maxSizeMB: 10,
          allowedFormats: ['png', 'jpg', 'jpeg', 'pdf', 'txt', 'log']
        },
        notifyUserOnStatusChange: true,
        autoClose: {
          enabled: false,
          inactiveDays: 7,
          warningDays: 2,
          excludePriority: []
        },
        autoResponses: {
          enabled: true,
          responses: []
        },
        ticketEmbed: {
          title: '🎫 Ticket #{ticketNumber}',
          description: 'Hallo {userMention}\n**Thema:** {topicLabel}',
          color: '#2b90d9',
          footer: COPYRIGHT
        },
        panelEmbed: {
          title: '🎫 Ticket System',
          description: 'Wähle dein Thema',
          color: '#5865F2',
          footer: COPYRIGHT
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
      safeWrite(CFG_PATH, data);
      return;
    }
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  } catch(err) {
    console.error('writeCfg error:', err);
  }
}

if(!fs.existsSync(COUNTER_PATH)) safeWrite(COUNTER_PATH, { last: 0 });
if(!fs.existsSync(TICKETS_PATH)) safeWrite(TICKETS_PATH, []);

function loadTickets(guildId){
  const ticketsPath = getTicketsPath(guildId);
  if(!fs.existsSync(ticketsPath)) safeWrite(ticketsPath, []);
  return safeRead(ticketsPath, []);
}
function saveTickets(guildId, tickets){
  const ticketsPath = getTicketsPath(guildId);
  safeWrite(ticketsPath, tickets);
}

// AntiSpam System
const ticketCreationLog = new Map(); // userId -> [{timestamp, guildId}]
const buttonClickLog = new Map(); // userId -> [{timestamp, buttonId}]

function checkTicketRateLimit(userId, guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.antiSpam || !cfg.antiSpam.enabled) {
    return { allowed: true };
  }

  const now = Date.now();
  const maxTickets = cfg.antiSpam.maxTickets || 3;
  const timeWindow = (cfg.antiSpam.timeWindowMinutes || 10) * 60 * 1000;

  if (!ticketCreationLog.has(userId)) {
    ticketCreationLog.set(userId, []);
  }

  const userLog = ticketCreationLog.get(userId);

  // Entferne alte Einträge außerhalb des Zeitfensters
  const recentTickets = userLog.filter(entry =>
    now - entry.timestamp < timeWindow && entry.guildId === guildId
  );

  ticketCreationLog.set(userId, recentTickets);

  if (recentTickets.length >= maxTickets) {
    const oldestTicket = recentTickets[0];
    const waitTime = Math.ceil((timeWindow - (now - oldestTicket.timestamp)) / 1000 / 60);
    return {
      allowed: false,
      reason: 'ticket_limit',
      waitMinutes: waitTime,
      count: recentTickets.length,
      max: maxTickets
    };
  }

  return { allowed: true };
}

function logTicketCreation(userId, guildId) {
  const now = Date.now();

  if (!ticketCreationLog.has(userId)) {
    ticketCreationLog.set(userId, []);
  }

  ticketCreationLog.get(userId).push({ timestamp: now, guildId });
}

function checkButtonRateLimit(userId, buttonId) {
  const now = Date.now();
  const key = `${userId}_${buttonId}`;

  if (!buttonClickLog.has(key)) {
    buttonClickLog.set(key, []);
  }

  const clicks = buttonClickLog.get(key);

  // Entferne Klicks älter als 10 Sekunden
  const recentClicks = clicks.filter(timestamp => now - timestamp < 10000);
  buttonClickLog.set(key, recentClicks);

  if (recentClicks.length >= 5) {
    return {
      allowed: false,
      reason: 'button_spam',
      waitSeconds: Math.ceil((10000 - (now - recentClicks[0])) / 1000)
    };
  }

  return { allowed: true };
}

function logButtonClick(userId, buttonId) {
  const now = Date.now();
  const key = `${userId}_${buttonId}`;

  if (!buttonClickLog.has(key)) {
    buttonClickLog.set(key, []);
  }

  buttonClickLog.get(key).push(now);
}

// Cleanup alte Einträge alle 5 Minuten
setInterval(() => {
  const now = Date.now();
  const maxAge = 15 * 60 * 1000; // 15 Minuten

  for (const [userId, entries] of ticketCreationLog.entries()) {
    const recent = entries.filter(e => now - e.timestamp < maxAge);
    if (recent.length === 0) {
      ticketCreationLog.delete(userId);
    } else {
      ticketCreationLog.set(userId, recent);
    }
  }

  for (const [key, timestamps] of buttonClickLog.entries()) {
    const recent = timestamps.filter(t => now - t < 15000);
    if (recent.length === 0) {
      buttonClickLog.delete(key);
    } else {
      buttonClickLog.set(key, recent);
    }
  }
}, 5 * 60 * 1000);

// Express Server (nur wenn nicht BOT_ONLY Modus)
let app;
if (!process.env.BOT_ONLY) {
  app = express();
  app.set('view engine','ejs');
  app.set('views', path.join(__dirname,'views'));
  app.use(express.urlencoded({ extended:true }));
  app.use(express.static('public'));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences  // Für Online-Status-Erkennung
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Initialize Discord Logger to send all console logs to Discord channel
const { initializeLogger } = require('./discord-logger');
initializeLogger(client);

// Panel nur starten wenn nicht BOT_ONLY Modus
if (!process.env.BOT_ONLY && app) {
  app.set('trust proxy', 1);
  app.use('/', require('./panel')(client));
  app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));
  console.log('ℹ️  Running in FULL mode (Bot + Web Panel)');
} else {
  console.log('ℹ️  Running in BOT_ONLY mode (no Web Panel)');
}

const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_FIXED_URL = 'https://quantixtickets.theredstonee.de/panel';

function nextTicket(guildId){
  const counterPath = getCounterPath(guildId);
  if(!fs.existsSync(counterPath)) safeWrite(counterPath, {last:0});
  const c = safeRead(counterPath,{last:0});
  c.last++;
  safeWrite(counterPath,c);
  return c.last;
}

function buttonRows(claimed, guildId = null, ticket = null){
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('request_close')
      .setEmoji('📩')
      .setLabel(t(guildId, 'buttons.request_close'))
      .setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close')
      .setEmoji('🔐')
      .setLabel(t(guildId, 'buttons.close'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('priority_down')
      .setEmoji('⬇️')
      .setLabel(t(guildId, 'buttons.priority_down'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('priority_up')
      .setEmoji('⬆️')
      .setLabel(t(guildId, 'buttons.priority_up'))
      .setStyle(ButtonStyle.Primary),
    claimed
      ? new ButtonBuilder()
          .setCustomId('unclaim')
          .setEmoji('↩️')
          .setLabel(t(guildId, 'buttons.unclaim'))
          .setStyle(ButtonStyle.Secondary)
      : new ButtonBuilder()
          .setCustomId('claim')
          .setEmoji('✨')
          .setLabel(t(guildId, 'buttons.claim'))
          .setStyle(ButtonStyle.Success)
  );

  const row3Components = [
    new ButtonBuilder()
      .setCustomId('add_user')
      .setEmoji('👥')
      .setLabel(t(guildId, 'buttons.add_user'))
      .setStyle(ButtonStyle.Secondary)
  ];

  // Voice-Support Button (Basic+ Feature)
  if (guildId && hasFeature(guildId, 'voiceSupport')) {
    const cfg = readCfg(guildId);
    if (cfg.voiceSupport && cfg.voiceSupport.enabled && cfg.voiceSupport.showButton !== false) {
      // Prüfe ob Voice-Channel bereits existiert
      const hasVoice = ticket && ticket.voiceChannelId;

      console.log(`🔍 buttonRows() - Ticket: ${ticket?.id}, voiceChannelId: ${ticket?.voiceChannelId}, hasVoice: ${hasVoice}`);

      row3Components.push(
        new ButtonBuilder()
          .setCustomId(hasVoice ? 'end_voice' : 'request_voice')
          .setEmoji(hasVoice ? '🔇' : '🎤')
          .setLabel(hasVoice ? t(guildId, 'voiceSupport.end_voice') : t(guildId, 'voiceSupport.request_voice'))
          .setStyle(hasVoice ? ButtonStyle.Danger : ButtonStyle.Primary)
      );
    }
  }

  const row3 = new ActionRowBuilder().addComponents(...row3Components);
  return [row1,row2,row3];
}

function buildPanelSelect(cfg){
  const topics = (cfg.topics||[]).filter(t => t && t.label && t.value);
  if(topics.length === 0){
    topics.push({ label: 'Keine Topics konfiguriert', value: 'none', emoji: '⚠️' });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions(topics.map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
  );
}

async function deployCommands(){
  loadCommands();
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const commands = Array.from(commandsCollection.values()).map(cmd => cmd.data.toJSON());

  const guilds = await client.guilds.fetch();
  for(const [guildId, guild] of guilds){
    try {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commands }
      );
      console.log(`✅ ${commands.length} Commands → ${guild.name} (${guildId})`);
    } catch(err){
      console.error(`❌ Commands Fehler für ${guildId}:`, err);
    }
  }
}

async function cleanupOldServerData(){
  try {
    const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const activeGuilds = new Set(client.guilds.cache.map(g => g.id));

    const configFiles = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json') && !f.includes('_tickets') && !f.includes('_counter'));

    let deletedCount = 0;
    for(const file of configFiles){
      const guildId = file.replace('.json', '');

      if(activeGuilds.has(guildId)){
        continue;
      }

      const configPath = path.join(CONFIG_DIR, file);
      const stats = fs.statSync(configPath);
      const fileAge = now - stats.mtimeMs;

      if(fileAge > TWO_MONTHS_MS){
        console.log(`🗑️ Lösche alte Server-Daten: ${guildId} (${Math.floor(fileAge / (24*60*60*1000))} Tage alt)`);

        fs.unlinkSync(configPath);

        const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
        const counterPath = path.join(CONFIG_DIR, `${guildId}_counter.json`);

        if(fs.existsSync(ticketsPath)) fs.unlinkSync(ticketsPath);
        if(fs.existsSync(counterPath)) fs.unlinkSync(counterPath);

        deletedCount++;
      }
    }

    if(deletedCount > 0){
      console.log(`✅ ${deletedCount} alte Server-Konfiguration(en) gelöscht`);
    } else {
      console.log(`✅ Keine alten Server-Daten zum Löschen gefunden`);
    }
  } catch(err){
    console.error('❌ Fehler beim Cleanup alter Server-Daten:', err);
  }
}

function startPremiumExpiryChecker(){
  const THEREDSTONEE_GUILD_ID = '1291125037876904026';
  const PREMIUM_ROLE_ID = '1428069033269268551';

  const checkPremiumExpiry = async () => {
    try {
      const now = new Date();
      const configFiles = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json') && !f.includes('_tickets') && !f.includes('_counter'));

      for(const file of configFiles){
        const guildId = file.replace('.json', '');
        const cfg = readCfg(guildId);

        // Prüfe ob Premium existiert und abgelaufen ist
        if(!cfg.premium || !cfg.premium.expiresAt) continue;

        const expiresAt = new Date(cfg.premium.expiresAt);
        if(expiresAt > now) continue; // Noch nicht abgelaufen

        // Premium ist abgelaufen
        const tier = cfg.premium.tier;
        const buyerId = cfg.premium.buyerId;

        if(!buyerId) continue; // Keine Buyer ID vorhanden

        console.log(`⏰ Premium abgelaufen für Guild ${guildId} (Tier: ${tier}, Buyer: ${buyerId})`);

        // Entferne Premium-Rolle von Theredstonee Projects Server
        try {
          const guild = await client.guilds.fetch(THEREDSTONEE_GUILD_ID);
          const member = await guild.members.fetch(buyerId).catch(() => null);

          if(member && member.roles.cache.has(PREMIUM_ROLE_ID)){
            await member.roles.remove(PREMIUM_ROLE_ID);
            console.log(`🚫 Premium-Rolle entfernt für User ${buyerId} (Guild: ${guildId})`);
          }
        } catch(err){
          console.error(`❌ Fehler beim Entfernen der Premium-Rolle für ${buyerId}:`, err.message);
        }

        // Setze Premium auf "none"
        cfg.premium = {
          tier: 'none',
          expiresAt: null,
          buyerId: null,
          lifetime: false
        };
        writeCfg(guildId, cfg);
        console.log(`✅ Premium-Status auf "none" gesetzt für Guild ${guildId}`);
      }
    } catch(err){
      console.error('❌ Fehler beim Premium Expiry Check:', err);
    }
  };

  // Initiale Prüfung beim Start
  console.log('🔍 Premium Expiry Checker gestartet (läuft jede Minute)');
  checkPremiumExpiry();

  // Prüfung jede Minute
  setInterval(checkPremiumExpiry, 60 * 1000);
}

// Pending Deletions Checker
function startPendingDeletionsChecker() {
  const checkPendingDeletions = async () => {
    try {
      const pendingFile = './pending-deletions.json';
      if (!fs.existsSync(pendingFile)) return;

      let pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
      const now = Date.now();
      const toExecute = pending.filter(p => p.executesAt <= now);

      for (const deletion of toExecute) {
        await executeDeletion(deletion);
        // Remove from pending list
        pending = pending.filter(p => p.guildId !== deletion.guildId);
      }

      if (toExecute.length > 0) {
        fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
      }
    } catch (err) {
      console.error('❌ Fehler beim Pending Deletions Check:', err);
    }
  };

  // Initial check
  console.log('🗑️ Pending Deletions Checker gestartet (läuft jede Minute)');
  checkPendingDeletions();

  // Check every minute
  setInterval(checkPendingDeletions, 60 * 1000);
}

// Cancellation Checker - Prüft abgelaufene, gekündigte Abos
function startCancellationChecker() {
  const checkCancellations = () => {
    try {
      const downgradedGuilds = checkExpiredCancellations();

      // Optional: Benachrichtige Guild-Admins über Downgrade
      if (downgradedGuilds.length > 0) {
        for (const { guildId, oldTier } of downgradedGuilds) {
          // Hier könnte man eine Benachrichtigung an den Server senden
          // z.B. über den Log-Channel
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            logEvent(guild, `⬇️ Premium wurde nach Kündigung beendet (${oldTier} → Free)`).catch(err => {
              console.error(`Fehler beim Senden der Downgrade-Benachrichtigung für Guild ${guildId}:`, err);
            });
          }
        }
      }
    } catch (err) {
      console.error('❌ Fehler beim Cancellation Check:', err);
    }
  };

  // Initial check beim Start
  console.log('🔍 Cancellation Checker gestartet (läuft jede Stunde)');
  checkCancellations();

  // Prüfung jede Stunde (3600000ms)
  setInterval(checkCancellations, 60 * 60 * 1000);
}

// Trial Expiry Warning Checker
function startTrialExpiryWarningChecker() {
  const checkTrialWarnings = async () => {
    try {
      const expiringTrials = getExpiringTrials();

      if (expiringTrials.length === 0) return;

      console.log(`🔔 ${expiringTrials.length} Trial(s) läuft/laufen bald ab`);

      for (const trial of expiringTrials) {
        // Check if warning was already sent for this day count
        if (wasWarningSent(trial.guildId, trial.daysRemaining)) {
          continue;
        }

        try {
          const guild = await client.guilds.fetch(trial.guildId).catch(() => null);
          if (!guild) continue;

          const cfg = readCfg(trial.guildId);
          const guildLanguage = getGuildLanguage(trial.guildId);
          const isGerman = guildLanguage === 'de';
          const dashboardUrl = (process.env.PUBLIC_BASE_URL || 'https://quantixtickets.theredstonee.de').replace(/\/+$/, '');

          // Find target channel (log channel or general channel)
          let targetChannel = null;

          if (cfg.logChannelId) {
            targetChannel = await guild.channels.fetch(cfg.logChannelId).catch(() => null);
          }

          if (!targetChannel) {
            const generalNames = ['general', 'allgemein', 'chat', 'main', 'lobby'];
            for (const name of generalNames) {
              const channel = guild.channels.cache.find(ch =>
                ch.type === ChannelType.GuildText &&
                ch.name.toLowerCase().includes(name) &&
                ch.permissionsFor(guild.members.me).has([
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages
                ])
              );
              if (channel) {
                targetChannel = channel;
                break;
              }
            }
          }

          if (!targetChannel) {
            targetChannel = guild.channels.cache.find(ch =>
              ch.type === ChannelType.GuildText &&
              ch.permissionsFor(guild.members.me).has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages
              ])
            );
          }

          if (!targetChannel) {
            console.log(`⚠️ Kein geeigneter Channel für Trial-Warnung in ${guild.name}`);
            continue;
          }

          // Build warning message
          const title = isGerman
            ? `⚠️ Dein Premium Pro Trial läuft bald ab!`
            : `⚠️ Your Premium Pro Trial is expiring soon!`;

          const description = isGerman
            ? `🎁 **Premium Pro Trial** läuft in **${trial.daysRemaining} Tag${trial.daysRemaining !== 1 ? 'en' : ''}** ab!\n\n` +
              `**💎 Premium Pro Features:**\n` +
              `✅ Unbegrenzte Kategorien\n` +
              `✅ Auto-Close für inaktive Tickets\n` +
              `✅ Email-Benachrichtigungen\n` +
              `✅ Discord DM-Benachrichtigungen\n` +
              `✅ Erweiterte Analytics\n` +
              `✅ Priority Support\n\n` +
              `**🚀 Upgrade jetzt:**\n` +
              `Besuche das **[Dashboard](${dashboardUrl})** und wähle ein Premium-Paket, um weiterhin von allen Features zu profitieren!\n\n` +
              `💰 **Premium Preise:**\n` +
              `• **Basic** (€2.99/Monat): 7 Kategorien, Custom Avatar, Statistiken\n` +
              `• **Pro** (€4.99/Monat): Alle Features ohne Limits!`
            : `🎁 **Premium Pro Trial** expires in **${trial.daysRemaining} day${trial.daysRemaining !== 1 ? 's' : ''}**!\n\n` +
              `**💎 Premium Pro Features:**\n` +
              `✅ Unlimited categories\n` +
              `✅ Auto-close for inactive tickets\n` +
              `✅ Email notifications\n` +
              `✅ Discord DM notifications\n` +
              `✅ Advanced analytics\n` +
              `✅ Priority support\n\n` +
              `**🚀 Upgrade now:**\n` +
              `Visit the **[Dashboard](${dashboardUrl})** and choose a premium plan to continue enjoying all features!\n\n` +
              `💰 **Premium Pricing:**\n` +
              `• **Basic** (€2.99/month): 7 categories, custom avatar, statistics\n` +
              `• **Pro** (€4.99/month): All features without limits!`;

          const warningEmbed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(0xff6b6b) // Red warning color
            .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: COPYRIGHT })
            .setTimestamp();

          const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setURL(`${dashboardUrl}/premium`)
              .setStyle(ButtonStyle.Link)
              .setLabel(isGerman ? '💎 Upgrade zu Premium' : '💎 Upgrade to Premium')
              .setEmoji('🚀'),
            new ButtonBuilder()
              .setURL('https://discord.com/invite/mnYbnpyyBS')
              .setStyle(ButtonStyle.Link)
              .setLabel(isGerman ? '💬 Support Server' : '💬 Support Server')
              .setEmoji('🛟')
          );

          await targetChannel.send({
            embeds: [warningEmbed],
            components: [buttonRow]
          });

          // Mark warning as sent
          markTrialWarningSent(trial.guildId, trial.daysRemaining);

          console.log(`✅ Trial-Warnung gesendet an ${guild.name} (${trial.daysRemaining} Tage verbleibend)`);

          // Rate limiting: Wait 1s between messages
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          console.error(`❌ Fehler beim Senden der Trial-Warnung für Guild ${trial.guildId}:`, err.message);
        }
      }
    } catch (err) {
      console.error('❌ Fehler beim Trial Warning Check:', err);
    }
  };

  // Initial check
  console.log('🔔 Trial Expiry Warning Checker gestartet (läuft alle 6 Stunden)');
  checkTrialWarnings();

  // Check every 6 hours (6 * 60 * 60 * 1000 ms)
  setInterval(checkTrialWarnings, 6 * 60 * 60 * 1000);
}

// SLA Warning & Escalation Checker
function startSLAChecker() {
  const checkSLAStatus = async () => {
    try {
      const configFiles = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.json') && !f.includes('_tickets') && !f.includes('_counter'));

      for (const file of configFiles) {
        const guildId = file.replace('.json', '');
        const cfg = readCfg(guildId);

        // Skip if SLA not enabled or not Pro
        if (!cfg.sla || !cfg.sla.enabled || !hasFeature(guildId, 'slaSystem')) continue;

        const ticketsPath = getTicketsPath(guildId);
        if (!fs.existsSync(ticketsPath)) continue;

        const tickets = safeRead(ticketsPath, []);
        const now = Date.now();

        for (const ticket of tickets) {
          // Skip if ticket closed or no SLA deadline
          if (ticket.status !== 'offen' || !ticket.slaDeadline) continue;

          const progress = getSLAProgress(ticket.timestamp, ticket.slaDeadline);

          // SLA Warning at 80%
          if (progress >= cfg.sla.warnAtPercent && !ticket.slaWarned) {
            try {
              const guild = await client.guilds.fetch(guildId).catch(() => null);
              if (!guild) continue;

              const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
              if (!channel) continue;

              const remaining = ticket.slaDeadline - now;
              const hours = Math.floor(remaining / (60 * 60 * 1000));
              const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

              const warningEmbed = new EmbedBuilder()
                .setColor(0xff9900)
                .setTitle('⚠️ SLA-Warnung')
                .setDescription(
                  `**Dieses Ticket nähert sich der SLA-Deadline!**\n\n` +
                  `⏱️ **Verbleibende Zeit:** ${hours}h ${minutes}m\n` +
                  `📊 **SLA-Fortschritt:** ${Math.round(progress)}%`
                )
                .setFooter({ text: 'Quantix Tickets • SLA System' })
                .setTimestamp();

              await channel.send({ embeds: [warningEmbed] });

              // Mark as warned
              ticket.slaWarned = true;
              safeWrite(ticketsPath, tickets);

              console.log(`⚠️ SLA-Warnung gesendet für Ticket #${ticket.id} in Guild ${guildId}`);
            } catch (err) {
              console.error(`❌ Fehler beim Senden der SLA-Warnung für Ticket #${ticket.id}:`, err.message);
            }
          }

          // SLA Escalation at 100%
          if (now >= ticket.slaDeadline && !ticket.slaEscalated) {
            try {
              const guild = await client.guilds.fetch(guildId).catch(() => null);
              if (!guild) continue;

              const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
              if (!channel) continue;

              const overdue = now - ticket.slaDeadline;
              const hours = Math.floor(overdue / (60 * 60 * 1000));
              const minutes = Math.floor((overdue % (60 * 60 * 1000)) / (60 * 1000));

              const escalationEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚨 SLA ÜBERSCHRITTEN')
                .setDescription(
                  `**Dieses Ticket hat die SLA-Deadline überschritten!**\n\n` +
                  `❌ **Überfällig seit:** ${hours}h ${minutes}m\n` +
                  `⚡ **Sofortige Bearbeitung erforderlich!**`
                )
                .setFooter({ text: 'Quantix Tickets • SLA Eskalation' })
                .setTimestamp();

              let mentionText = '';
              if (cfg.sla.escalateToRole && cfg.sla.escalateToRole.trim()) {
                mentionText = `<@&${cfg.sla.escalateToRole}>`;
              }

              await channel.send({
                content: mentionText || undefined,
                embeds: [escalationEmbed]
              });

              // Mark as escalated
              ticket.slaEscalated = true;
              safeWrite(ticketsPath, tickets);

              console.log(`🚨 SLA-Eskalation gesendet für Ticket #${ticket.id} in Guild ${guildId}`);
            } catch (err) {
              console.error(`❌ Fehler beim Senden der SLA-Eskalation für Ticket #${ticket.id}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ Fehler beim SLA Status Check:', err.message || err);
      if (err.stack) console.error(err.stack);
    }
  };

  // Initial check
  console.log('⏱️ SLA Checker gestartet (läuft alle 10 Minuten)');
  checkSLAStatus();

  // Check every 10 minutes
  setInterval(checkSLAStatus, 10 * 60 * 1000);
}

async function executeDeletion(deletion) {
  try {
    console.log(`🗑️ Executing deletion for guild: ${deletion.guildId}`);

    // Delete all files
    const configFile = `./configs/${deletion.guildId}.json`;
    if (fs.existsSync(configFile)) fs.unlinkSync(configFile);

    const ticketsFile = `./configs/${deletion.guildId}_tickets.json`;
    if (fs.existsSync(ticketsFile)) fs.unlinkSync(ticketsFile);

    const counterFile = `./configs/${deletion.guildId}_counter.json`;
    if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);

    const transcriptsDir = `./transcripts/${deletion.guildId}`;
    if (fs.existsSync(transcriptsDir)) {
      const files = fs.readdirSync(transcriptsDir);
      for (const file of files) {
        fs.unlinkSync(`${transcriptsDir}/${file}`);
      }
      fs.rmdirSync(transcriptsDir);
    }

    console.log(`✅ Deleted all data for ${deletion.guildId}`);

    // Leave the guild
    const guild = await client.guilds.fetch(deletion.guildId).catch(() => null);
    if (guild) {
      await guild.leave();
      console.log(`👋 Bot left guild: ${guild.name} (${deletion.guildId})`);
    }
  } catch (err) {
    console.error(`❌ Error executing deletion for ${deletion.guildId}:`, err);
  }
}

/**
 * Status-Rotation - wechselt alle 20 Sekunden zwischen verschiedenen Status
 */
function startStatusRotation() {
  let currentStatusIndex = 0;

  const updateStatus = () => {
    // Check if maintenance mode is active
    const maintenanceFile = path.join(__dirname, 'maintenance.json');
    let maintenanceState = { enabled: false };
    if (fs.existsSync(maintenanceFile)) {
      try {
        maintenanceState = JSON.parse(fs.readFileSync(maintenanceFile, 'utf8'));
      } catch (err) {
        console.error('Error reading maintenance state in status rotation:', err);
      }
    }

    // Don't rotate status if maintenance mode is active
    if (maintenanceState.enabled) {
      console.log('⏭️ Status-Rotation übersprungen: Maintenance-Mode aktiv');
      return;
    }

    const serverCount = client.guilds.cache.size;

    // Berechne Gesamt-Member-Anzahl
    const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

    const statuses = [
      { name: `auf ${serverCount} Servern`, type: ActivityType.Playing },
      { name: `Release v${VERSION}`, type: ActivityType.Playing },
      { name: `Quantix Development`, type: ActivityType.Playing },
      { name: `!commands für Hilfe`, type: ActivityType.Playing },
      { name: `${totalMembers} Members zu`, type: ActivityType.Watching }
    ];

    const status = statuses[currentStatusIndex];

    client.user.setPresence({
      activities: [{ name: status.name, type: status.type }],
      status: 'online'
    });

    currentStatusIndex = (currentStatusIndex + 1) % statuses.length;
  };

  // Setze initialen Status
  updateStatus();

  // Wechsle alle 20 Sekunden
  setInterval(updateStatus, 15000);
}

client.once('clientReady', async () => {
  await deployCommands();
  await cleanupOldServerData();
  initEmailService(); // Email-Benachrichtigungen initialisieren
  console.log(`🤖 ${client.user.tag} bereit`);

  // Status-Rotation starten
  startStatusRotation();

  // Premium Expiry Checker - läuft jede Minute
  startPremiumExpiryChecker();

  // Auto-Close Service starten (Premium Pro Feature)
  startAutoCloseService(client);

  // Pending Deletions Checker - läuft jede Minute
  startPendingDeletionsChecker();

  // Cancellation Checker - läuft jede Stunde
  startCancellationChecker();

  // Trial Expiry Warning Checker - läuft alle 6 Stunden
  startTrialExpiryWarningChecker();

  // SLA Warning & Escalation Checker - läuft alle 10 Minuten
  startSLAChecker();

  // Send startup notification to all guilds
  await sendStartupNotifications();
});

/**
 * Send startup notification to all guilds
 */
async function sendStartupNotifications() {
  try {
    const { VERSION, RELEASE_DATE } = require('./version.config');
    const guilds = await client.guilds.fetch();
    let successCount = 0;
    let failCount = 0;

    console.log(`📢 Sende Startup-Benachrichtigungen an ${guilds.size} Server...`);

    for (const [guildId, guild] of guilds) {
      try {
        const fullGuild = await client.guilds.fetch(guildId);
        const cfg = readCfg(guildId);

        // Check if startup notifications are enabled for this guild (default: false)
        if (!cfg.startupNotificationsEnabled) {
          console.log(`⏭️ Startup-Benachrichtigung übersprungen für: ${fullGuild.name} (deaktiviert)`);
          continue;
        }

        // Try to send to log channel first, otherwise find a suitable channel
        let targetChannel = null;

        if (cfg.logChannelId) {
          targetChannel = await fullGuild.channels.fetch(cfg.logChannelId).catch(() => null);
        }

        // If no log channel, find a suitable text channel
        if (!targetChannel) {
          const channels = await fullGuild.channels.fetch();
          for (const [channelId, channel] of channels) {
            if (channel.type === 0) { // Text channel
              const permissions = channel.permissionsFor(client.user);
              if (permissions && permissions.has('SendMessages') && permissions.has('EmbedLinks')) {
                targetChannel = channel;
                break;
              }
            }
          }
        }

        if (targetChannel) {
          const embed = {
            color: 0x00ff88,
            title: '🚀 Bot erfolgreich neu gestartet',
            description: `**Quantix Tickets Bot** wurde erfolgreich aktualisiert und ist jetzt wieder online!`,
            fields: [
              { name: '📦 Version', value: `v${VERSION}`, inline: true },
              { name: '📅 Release', value: RELEASE_DATE, inline: true },
              { name: '✨ Status', value: 'Online & Bereit', inline: true }
            ],
            footer: { text: 'Quantix Tickets' },
            timestamp: new Date()
          };

          await targetChannel.send({ embeds: [embed] });
          successCount++;
          console.log(`✅ Nachricht gesendet an: ${fullGuild.name}`);
        } else {
          failCount++;
          console.log(`⚠️ Kein geeigneter Channel gefunden für: ${fullGuild.name}`);
        }
      } catch (err) {
        failCount++;
        console.error(`❌ Fehler beim Senden an Guild ${guildId}:`, err.message);
      }

      // Rate limiting: Wait 1s between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`📢 Startup-Benachrichtigungen abgeschlossen: ${successCount} erfolgreich, ${failCount} fehlgeschlagen`);
  } catch (err) {
    console.error('❌ Fehler beim Senden der Startup-Benachrichtigungen:', err);
  }
}

async function sendWelcomeMessage(guild) {
  try {
    // Find a suitable channel to send the welcome message
    // Priority: 1. "general" channel, 2. first text channel where bot can send messages
    let targetChannel = null;

    // Try to find a channel named "general", "allgemein", or similar
    const generalNames = ['general', 'allgemein', 'chat', 'main', 'lobby'];
    for (const name of generalNames) {
      const channel = guild.channels.cache.find(ch =>
        ch.type === ChannelType.GuildText &&
        ch.name.toLowerCase().includes(name) &&
        ch.permissionsFor(guild.members.me).has([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ])
      );
      if (channel) {
        targetChannel = channel;
        break;
      }
    }

    // If no "general" channel found, get the first available text channel
    if (!targetChannel) {
      targetChannel = guild.channels.cache.find(ch =>
        ch.type === ChannelType.GuildText &&
        ch.permissionsFor(guild.members.me).has([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ])
      );
    }

    if (!targetChannel) {
      console.log(`⚠️ No suitable channel found in ${guild.name} to send welcome message`);
      return;
    }

    // Detect server language (default: German, fallback: English if server is not German)
    const guildLanguage = getGuildLanguage(guild.id);
    const isGerman = guildLanguage === 'de' || guild.preferredLocale?.startsWith('de');

    const dashboardUrl = (process.env.PUBLIC_BASE_URL || 'https://quantixtickets.theredstonee.de').replace(/\/+$/, '');

    // Check if trial is active
    const trialActive = isTrialActive(guild.id);
    const trialInfo = trialActive ? getTrialInfo(guild.id) : null;

    // Build description with trial banner
    let description = '';

    if (trialActive && trialInfo) {
      // Trial Banner
      description += isGerman
        ? `## 🎁 **14 Tage Premium Pro - KOSTENLOS!**\n` +
          `🎉 Dein Server hat **Premium Pro** für **14 Tage gratis** aktiviert!\n` +
          `⏰ Noch **${trialInfo.daysRemaining} Tage** verbleibend\n\n` +
          `**💎 Du hast jetzt Zugriff auf:**\n` +
          `✅ Unbegrenzte Kategorien\n` +
          `✅ Auto-Close für inaktive Tickets\n` +
          `✅ Email-Benachrichtigungen\n` +
          `✅ Discord DM-Benachrichtigungen\n` +
          `✅ Erweiterte Analytics\n` +
          `✅ Priority Support\n\n`
        : `## 🎁 **14 Days Premium Pro - FREE!**\n` +
          `🎉 Your server has **Premium Pro** activated for **14 days free**!\n` +
          `⏰ **${trialInfo.daysRemaining} days** remaining\n\n` +
          `**💎 You now have access to:**\n` +
          `✅ Unlimited categories\n` +
          `✅ Auto-close for inactive tickets\n` +
          `✅ Email notifications\n` +
          `✅ Discord DM notifications\n` +
          `✅ Advanced analytics\n` +
          `✅ Priority support\n\n`;
    }

    description += isGerman
      ? `Vielen Dank, dass du Quantix Tickets zu deinem Server hinzugefügt hast!\n\n` +
        `**🚀 Schnellstart:**\n` +
        `1️⃣ Öffne das **[Dashboard](${dashboardUrl})** und melde dich mit Discord an\n` +
        `2️⃣ Wähle deinen Server aus\n` +
        `3️⃣ Konfiguriere deine Ticket-Kategorien und Team-Rollen\n` +
        `4️⃣ Sende das Ticket-Panel in einen Channel mit \`/panel/send\`\n\n` +
        `💡 **Tipp:** Nutze \`!commands\` um alle verfügbaren Befehle zu sehen!\n\n` +
        `**✨ Features:**\n` +
        `• 🌍 **Multi-Language:** 9 Sprachen\n` +
        `• 🎨 **Anpassbar:** Custom Embeds & Formulare\n` +
        `• 📊 **Analytics:** Detaillierte Statistiken\n` +
        `• 🎯 **Priority System:** 3 Prioritätsstufen\n` +
        `• 📝 **Transcripts:** HTML & TXT Transcripts`
      : `Thank you for adding Quantix Tickets to your server!\n\n` +
        `**🚀 Quick Start:**\n` +
        `1️⃣ Open the **[Dashboard](${dashboardUrl})** and login with Discord\n` +
        `2️⃣ Select your server\n` +
        `3️⃣ Configure your ticket categories and team roles\n` +
        `4️⃣ Send the ticket panel to a channel with \`/panel/send\`\n\n` +
        `💡 **Tip:** Use \`!commands\` to see all available commands!\n\n` +
        `**✨ Features:**\n` +
        `• 🌍 **Multi-Language:** 9 languages\n` +
        `• 🎨 **Customizable:** Custom embeds & forms\n` +
        `• 📊 **Analytics:** Detailed statistics\n` +
        `• 🎯 **Priority System:** 3 priority levels\n` +
        `• 📝 **Transcripts:** HTML & TXT transcripts`;

    // Create welcome embed
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(isGerman ? '🎫 Willkommen bei Quantix Tickets!' : '🎫 Welcome to Quantix Tickets!')
      .setDescription(description)
      .setColor(trialActive ? 0xf093fb : 0x00ff88)
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: COPYRIGHT })
      .setTimestamp();

    // Create button row with dashboard and support server links
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL(dashboardUrl)
        .setStyle(ButtonStyle.Link)
        .setLabel(isGerman ? '🚀 Zum Dashboard' : '🚀 Open Dashboard')
        .setEmoji('🎫'),
      new ButtonBuilder()
        .setURL('https://discord.com/invite/mnYbnpyyBS')
        .setStyle(ButtonStyle.Link)
        .setLabel(isGerman ? '💬 Support Server' : '💬 Support Server')
        .setEmoji('🛟')
    );

    await targetChannel.send({
      embeds: [welcomeEmbed],
      components: [buttonRow]
    });

    console.log(`✅ Welcome message sent to ${guild.name} in channel #${targetChannel.name}`);
  } catch (err) {
    console.error(`❌ Error sending welcome message to ${guild.name}:`, err);
  }
}

client.on(Events.GuildCreate, async (guild) => {
  console.log(`🆕 Bot joined new guild: ${guild.name} (${guild.id})`);

  // Check if server is blacklisted
  try {
    const BLACKLIST_FILE = './server-blacklist.json';
    if (fs.existsSync(BLACKLIST_FILE)) {
      const blacklist = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));

      // Support both old (array) and new (object) format
      const isBlacklisted = Array.isArray(blacklist.guilds)
        ? blacklist.guilds.includes(guild.id)
        : blacklist.guilds && blacklist.guilds.hasOwnProperty(guild.id);

      if (isBlacklisted) {
        console.log(`🚫 Server ${guild.name} (${guild.id}) is blacklisted - leaving immediately`);
        await guild.leave();
        return;
      }
    }
  } catch (err) {
    console.error('❌ Error checking blacklist:', err);
  }

  // Activate 14-day auto-trial for new servers
  try {
    const trialResult = activateAutoTrial(guild.id);

    if (trialResult.success) {
      console.log(`🎁 Auto-Trial aktiviert für ${guild.name} (${guild.id}) - 14 Tage Premium Pro`);
    } else if (trialResult.alreadyHadTrial) {
      console.log(`ℹ️ ${guild.name} (${guild.id}) hatte bereits Trial`);
    }
  } catch (err) {
    console.error('❌ Error activating auto-trial:', err);
  }

  try {
    // Deploy commands
    loadCommands();
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const commands = Array.from(commandsCollection.values()).map(cmd => cmd.data.toJSON());
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands }
    );
    console.log(`✅ Commands deployed to ${guild.name}`);
  } catch (err) {
    console.error(`❌ Error deploying commands to ${guild.name}:`, err);
  }

  // Send welcome message with setup instructions
  await sendWelcomeMessage(guild);
});

function buildTicketEmbed(cfg, i, topic, nr){
  const t = cfg.ticketEmbed || {};
  const rep = s => (s||'')
    .replace(/\{ticketNumber\}/g, nr)
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id);
  const e = new EmbedBuilder().setTitle(rep(t.title) || '🎫 Ticket').setDescription(rep(t.description) || `<@${i.user.id}>`);
  if(t.color && /^#?[0-9a-fA-F]{6}$/.test(t.color)) e.setColor(parseInt(t.color.replace('#',''),16));
  if(t.footer) e.setFooter({ text: rep(t.footer) });

  // Add custom avatar if configured
  if(cfg.customAvatarUrl) {
    const avatarUrl = cfg.customAvatarUrl.startsWith('/')
      ? `${process.env.BASE_URL || 'https://quantixtickets.theredstonee.de'}${cfg.customAvatarUrl}`
      : cfg.customAvatarUrl;
    e.setAuthor({ name: i.guild.name, iconURL: avatarUrl });
  }

  return e;
}

function buildChannelName(ticketNumber, priorityIndex, isVIP = false, isClaimed = false){
  const num = ticketNumber.toString().padStart(5,'0');
  const st  = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  const vipPrefix = isVIP ? '✨vip-' : '';
  const claimedPrefix = isClaimed ? '🔒' : '';
  return `${PREFIX}${vipPrefix}${claimedPrefix}${st.dot}ticket-${num}`;
}
const renameQueue = new Map();
const RENAME_MIN_INTERVAL_MS = 3000;
const RENAME_MAX_DELAY_MS    = 8000;
function scheduleChannelRename(channel, desired){
  const entry = renameQueue.get(channel.id) || { desiredName: channel.name, timer:null, lastApplied:0 };
  entry.desiredName = desired;
  const now = Date.now();
  const apply = async () => {
    const e = renameQueue.get(channel.id); if(!e) return; const need = e.desiredName;
    if(channel.name === need){ e.lastApplied = Date.now(); clearTimeout(e.timer); e.timer=null; return; }
    if(Date.now() - e.lastApplied < RENAME_MIN_INTERVAL_MS){ e.timer = setTimeout(apply, RENAME_MIN_INTERVAL_MS); return; }
    try { await channel.setName(need); e.lastApplied = Date.now(); }
    catch { e.timer = setTimeout(apply, 4000); return; }
    if(e.desiredName === need){ clearTimeout(e.timer); e.timer=null; }
  };
  if(now - entry.lastApplied > RENAME_MAX_DELAY_MS && !entry.timer){ entry.timer = setTimeout(apply, 250); }
  else { if(entry.timer) clearTimeout(entry.timer); entry.timer = setTimeout(apply, 500); }
  renameQueue.set(channel.id, entry);
}
function renameChannelIfNeeded(channel, ticket){
  const isClaimed = ticket.claimedBy ? true : false;
  const desired = buildChannelName(ticket.id, ticket.priority||0, ticket.isVIP||false, isClaimed);
  if(channel.name === desired) return;
  scheduleChannelRename(channel, desired);
}

async function logEvent(guild, text){
  const cfg = readCfg(guild.id);
  const logChannelIds = Array.isArray(cfg.logChannelId) ? cfg.logChannelId : (cfg.logChannelId ? [cfg.logChannelId] : []);
  if(logChannelIds.length === 0) return;

  const now = new Date();
  const berlinTime = now.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  const embed = new EmbedBuilder()
    .setDescription(text)
    .setColor(0x00ff00)
    .setTimestamp()
    .setFooter({ text: COPYRIGHT });

  // Send to all configured log channels
  for(const channelId of logChannelIds){
    try {
      const ch = await guild.channels.fetch(channelId);
      if(ch) await ch.send({ embeds: [embed] });
    } catch(err) {
      console.error(`Log-Channel ${channelId} nicht gefunden:`, err.message);
    }
  }
}

async function createTranscript(channel, ticket, opts = {}) {
  const { AttachmentBuilder } = require('discord.js');
  const resolveMentions = !!opts.resolveMentions;
  const guildId = channel.guild?.id;

  let messages = [];
  let lastId;
  while (messages.length < 1000) {
    const fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(()=>null);
    if (!fetched || fetched.size === 0) break;
    messages.push(...fetched.values());
    lastId = fetched.last().id;
  }
  messages.sort((a,b)=> a.createdTimestamp - b.createdTimestamp);

  const rolesCache   = channel.guild.roles.cache;
  const chansCache   = channel.guild.channels.cache;
  const membersCache = channel.guild.members.cache;

  const mentionToName = (text='')=>{
    if (!resolveMentions || !text) return text;

    return text
      .replace(/<@!?(\d{17,20})>/g, (_, id) => {
        const m = membersCache.get(id);
        const tag  = sanitizeUsername(m?.user?.tag || m?.user?.username || id);
        const name = sanitizeUsername(m?.displayName || tag);
        return `@${name}`;
      })
      .replace(/<@&(\d{17,20})>/g, (_, id) => {
        const r = rolesCache.get(id);
        return `@${(r && r.name) || `Rolle:${id}`}`;
      })
      .replace(/<#(\d{17,20})>/g, (_, id) => {
        const c = chansCache.get(id);
        return `#${(c && c.name) || id}`;
      });
  };

  const lines = [
    `# Transcript Ticket ${ticket.id}`,
    `Channel: ${channel.name}`,
    `Erstellt: ${new Date(ticket.timestamp).toISOString()}`,
    ''
  ];

  for (const m of messages) {
    const time   = new Date(m.createdTimestamp).toISOString();
    const author = sanitizeUsername(m.author ? (m.author.tag || m.author.username || m.author.id) : 'Unbekannt');
    const content = mentionToName(m.content || '').replace(/\n/g, '\\n');
    lines.push(`[${time}] ${author}: ${content}`);
    if (m.attachments.size) {
      m.attachments.forEach(a => lines.push(`  [Anhang] ${a.name} -> ${a.url}`));
    }
    if (m.embeds.length) {
      m.embeds.forEach(embed => {
        lines.push(`  [Embed]`);
        if(embed.title) lines.push(`    Titel: ${embed.title}`);
        if(embed.description) lines.push(`    Beschreibung: ${mentionToName(embed.description).replace(/\n/g, '\\n')}`);
        if(embed.fields && embed.fields.length > 0){
          embed.fields.forEach(field => {
            lines.push(`    ${field.name}: ${mentionToName(field.value).replace(/\n/g, '\\n')}`);
          });
        }
        if(embed.footer && embed.footer.text) lines.push(`    Footer: ${embed.footer.text}`);
      });
    }
  }
  const txt = lines.join('\n');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcript - Ticket #${ticket.id}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
      color: #dcddde;
      line-height: 1.6;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: #36393f;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #00ff88 0%, #00b894 100%);
      padding: 2.5rem;
      color: white;
      border-bottom: 4px solid #00dd77;
    }
    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .header .ticket-badge {
      background: rgba(255, 255, 255, 0.2);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 1.2rem;
      font-weight: 600;
    }
    .meta {
      background: #2f3136;
      padding: 1.5rem 2.5rem;
      border-bottom: 1px solid #202225;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .meta-label {
      color: #b9bbbe;
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .meta-value {
      color: #fff;
      font-size: 1rem;
      font-weight: 500;
    }
    .messages {
      padding: 2rem 2.5rem;
      max-height: 80vh;
      overflow-y: auto;
    }
    .message {
      display: flex;
      gap: 1rem;
      padding: 0.75rem 0;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .message:hover {
      background: #32353b;
      padding-left: 0.5rem;
      margin-left: -0.5rem;
      padding-right: 0.5rem;
      margin-right: -0.5rem;
    }
    .avatar {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00ff88, #00b894);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      font-size: 1.1rem;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 255, 136, 0.3);
      object-fit: cover;
    }
    .avatar-fallback {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00ff88, #00b894);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      font-size: 1.1rem;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 255, 136, 0.3);
    }
    .message-content {
      flex: 1;
      min-width: 0;
    }
    .message-header {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      margin-bottom: 0.25rem;
    }
    .author {
      color: #00ff88;
      font-weight: 600;
      font-size: 1rem;
    }
    .timestamp {
      color: #72767d;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .message-text {
      color: #dcddde;
      word-wrap: break-word;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .attachments {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .attachment {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #2f3136;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      border-left: 3px solid #00ff88;
      text-decoration: none;
      color: #00b8ff;
      font-weight: 500;
      transition: all 0.2s;
      max-width: fit-content;
    }
    .attachment:hover {
      background: #292b2f;
      transform: translateX(4px);
    }
    .attachment-icon {
      font-size: 1.2rem;
    }
    .embed {
      margin-top: 0.5rem;
      background: #2f3136;
      border-left: 4px solid #5865F2;
      border-radius: 4px;
      padding: 0.75rem 1rem;
      max-width: 500px;
    }
    .embed-author {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
    }
    .embed-title {
      color: #00b0f4;
      font-weight: 600;
      font-size: 1rem;
      margin-bottom: 0.5rem;
    }
    .embed-description {
      color: #dcddde;
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 0.5rem;
    }
    .embed-fields {
      display: grid;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .embed-field {
      font-size: 0.875rem;
    }
    .embed-field-name {
      color: #fff;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .embed-field-value {
      color: #dcddde;
    }
    .embed-footer {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #b9bbbe;
    }
    .footer {
      background: #2f3136;
      padding: 1.5rem 2.5rem;
      border-top: 1px solid #202225;
      text-align: center;
      color: #72767d;
      font-size: 0.875rem;
    }
    .footer a {
      color: #00ff88;
      text-decoration: none;
      font-weight: 600;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    ::-webkit-scrollbar {
      width: 12px;
    }
    ::-webkit-scrollbar-track {
      background: #2f3136;
    }
    ::-webkit-scrollbar-thumb {
      background: #202225;
      border-radius: 6px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #00ff88;
    }
    @media (max-width: 768px) {
      body {
        padding: 1rem;
      }
      .header, .meta, .messages, .footer {
        padding-left: 1.5rem;
        padding-right: 1.5rem;
      }
      .header h1 {
        font-size: 1.75rem;
      }
      .meta {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      class="ticket-badge">#${ticket.id.toString().padStart(5, '0')}</span></h1>
      <p style="opacity: 0.95; font-size: 1.1rem; margin-top: 0.5rem;">Ticket Transcript</p>
    </div>

    <div class="meta">
      <div class="meta-item">
        <span class="meta-label">📝 Channel</span>
        <span class="meta-value">${channel.name}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">📅 Erstellt</span>
        <span class="meta-value">${new Date(ticket.timestamp).toLocaleString('de-DE', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">💬 Nachrichten</span>
        <span class="meta-value">${messages.length}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">📊 Status</span>
        <span class="meta-value">${ticket.status || 'Geschlossen'}</span>
      </div>
    </div>

    <div class="messages">
      ${messages.map(m => {
        const author = sanitizeUsername(m.author ? (m.author.tag || m.author.username || m.author.id) : 'Unbekannt');
        const authorInitial = author.charAt(0).toUpperCase();
        const authorId = m.author?.id;
        const authorAvatar = m.author?.avatar;
        const time = new Date(m.createdTimestamp).toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const text = mentionToName(m.content || '')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');

        // Avatar HTML erstellen
        let avatarHTML = '';
        if(authorId && authorAvatar){
          const avatarUrl = `https://cdn.discordapp.com/avatars/${authorId}/${authorAvatar}.png?size=128`;
          avatarHTML = `<img src="${avatarUrl}" alt="${author}" class="avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="avatar-fallback" style="display: none;">${authorInitial}</div>`;
        } else {
          avatarHTML = `<div class="avatar-fallback">${authorInitial}</div>`;
        }

        const attachments = m.attachments.size
          ? `<div class="attachments">${[...m.attachments.values()]
              .map(a => `<a href="${a.url}" class="attachment" target="_blank">
                <span class="attachment-icon">📎</span>
                <span>${a.name}</span>
              </a>`).join('')}</div>`
          : '';

        const embeds = m.embeds.length
          ? m.embeds.map(embed => {
              const embedColor = embed.color ? `#${embed.color.toString(16).padStart(6, '0')}` : '#5865F2';
              let embedHTML = `<div class="embed" style="border-left-color: ${embedColor};">`;

              if(embed.author && embed.author.name){
                embedHTML += `<div class="embed-author">${embed.author.name}</div>`;
              }

              if(embed.title){
                const embedTitle = embed.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                embedHTML += `<div class="embed-title">${embedTitle}</div>`;
              }

              if(embed.description){
                const embedDesc = mentionToName(embed.description)
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/\n/g, '<br>');
                embedHTML += `<div class="embed-description">${embedDesc}</div>`;
              }

              if(embed.fields && embed.fields.length > 0){
                embedHTML += `<div class="embed-fields">`;
                embed.fields.forEach(field => {
                  const fieldName = field.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                  const fieldValue = mentionToName(field.value)
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\n/g, '<br>');
                  embedHTML += `<div class="embed-field">
                    <div class="embed-field-name">${fieldName}</div>
                    <div class="embed-field-value">${fieldValue}</div>
                  </div>`;
                });
                embedHTML += `</div>`;
              }

              if(embed.footer && embed.footer.text){
                const footerText = embed.footer.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                embedHTML += `<div class="embed-footer">${footerText}</div>`;
              }

              embedHTML += `</div>`;
              return embedHTML;
            }).join('')
          : '';

        return `<div class="message">
          ${avatarHTML}
          <div class="message-content">
            <div class="message-header">
              <span class="author">${author}</span>
              <span class="timestamp">${time}</span>
            </div>
            <div class="message-text">${text || '<em style="color: #72767d;">Keine Nachricht</em>'}</div>
            ${attachments}
            ${embeds}
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="footer">
      <p>Erstellt mit <strong>Quantix Tickets Bot</strong> • <a href="https://github.com/TheRedstoneE/TRS-Tickets-Bot" target="_blank">GitHub</a></p>
      <p style="margin-top: 0.5rem; font-size: 0.75rem;">© ${new Date().getFullYear()} Quantix Tickets • Alle Rechte vorbehalten</p>
    </div>
  </div>
</body>
</html>`;

  // Create transcripts directory structure: transcripts/[guildId]/
  const transcriptsDir = path.join(__dirname, 'transcripts');
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }

  const guildTranscriptsDir = path.join(transcriptsDir, guildId || 'unknown');
  if (!fs.existsSync(guildTranscriptsDir)) {
    fs.mkdirSync(guildTranscriptsDir, { recursive: true });
  }

  const tTxt  = path.join(guildTranscriptsDir, `transcript_${ticket.id}.txt`);
  const tHtml = path.join(guildTranscriptsDir, `transcript_${ticket.id}.html`);
  fs.writeFileSync(tTxt,  txt);
  fs.writeFileSync(tHtml, html);

  return { txt: new AttachmentBuilder(tTxt), html: new AttachmentBuilder(tHtml) };
}

// Live Transcript: Fügt eine einzelne Nachricht zu den Transcript-Dateien hinzu
async function appendToLiveTranscript(message, ticket, guildId) {
  try {
    const transcriptsDir = path.join(__dirname, 'transcripts');
    const guildTranscriptsDir = path.join(transcriptsDir, guildId);

    if (!fs.existsSync(guildTranscriptsDir)) {
      fs.mkdirSync(guildTranscriptsDir, { recursive: true });
    }

    const tTxt  = path.join(guildTranscriptsDir, `transcript_${ticket.id}.txt`);
    const tHtml = path.join(guildTranscriptsDir, `transcript_${ticket.id}.html`);

    // Initialize files if they don't exist
    if (!fs.existsSync(tTxt)) {
      const header = [
        `# Transcript Ticket ${ticket.id}`,
        `Channel: ${message.channel.name}`,
        `Erstellt: ${new Date(ticket.timestamp).toISOString()}`,
        ''
      ].join('\n');
      fs.writeFileSync(tTxt, header + '\n');
    }

    if (!fs.existsSync(tHtml)) {
      const htmlHeader = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transcript - Ticket #${ticket.id}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%); color: #dcddde; line-height: 1.6; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; background: #36393f; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); overflow: hidden; }
    .header { background: linear-gradient(135deg, #00ff88 0%, #00b894 100%); padding: 2.5rem; color: white; border-bottom: 4px solid #00dd77; }
    .header h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.75rem; }
    .messages { padding: 2rem 2.5rem; }
    .message { display: flex; gap: 1rem; padding: 0.75rem 0; border-radius: 8px; transition: background 0.15s; }
    .message:hover { background: #32353b; padding-left: 0.5rem; margin-left: -0.5rem; padding-right: 0.5rem; margin-right: -0.5rem; }
    .avatar-fallback { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #00ff88, #00b894); display: flex; align-items: center; justify-content: center; font-weight: 700; color: white; font-size: 1.1rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0, 255, 136, 0.3); }
    .message-content { flex: 1; min-width: 0; }
    .message-header { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem; }
    .author { color: #00ff88; font-weight: 600; font-size: 1rem; }
    .timestamp { color: #72767d; font-size: 0.75rem; font-weight: 500; }
    .message-text { color: #dcddde; word-wrap: break-word; white-space: pre-wrap; line-height: 1.5; }
    .attachments { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .attachment { display: inline-flex; align-items: center; gap: 0.5rem; background: #2f3136; padding: 0.75rem 1rem; border-radius: 6px; border-left: 3px solid #00ff88; text-decoration: none; color: #00b8ff; font-weight: 500; transition: all 0.2s; max-width: fit-content; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      class="ticket-badge">#${ticket.id.toString().padStart(5, '0')}</span></h1>
      <p style="opacity: 0.95; font-size: 1.1rem; margin-top: 0.5rem;">Live Transcript</p>
    </div>
    <div class="messages" id="messages">
`;
      fs.writeFileSync(tHtml, htmlHeader);
    }

    const rolesCache = message.guild.roles.cache;
    const chansCache = message.guild.channels.cache;
    const membersCache = message.guild.members.cache;

    const mentionToName = (text = '') => {
      if (!text) return text;
      return text
        .replace(/<@!?(\d{17,20})>/g, (_, id) => {
          const m = membersCache.get(id);
          const tag = sanitizeUsername(m?.user?.tag || m?.user?.username || id);
          const name = sanitizeUsername(m?.displayName || tag);
          return `@${name}`;
        })
        .replace(/<@&(\d{17,20})>/g, (_, id) => {
          const r = rolesCache.get(id);
          return `@${(r && r.name) || `Rolle:${id}`}`;
        })
        .replace(/<#(\d{17,20})>/g, (_, id) => {
          const c = chansCache.get(id);
          return `#${(c && c.name) || id}`;
        });
    };

    // TXT Format
    const time = new Date(message.createdTimestamp).toISOString();
    const author = sanitizeUsername(message.author ? (message.author.tag || message.author.username || message.author.id) : 'Unbekannt');
    const content = mentionToName(message.content || '').replace(/\n/g, '\\n');

    let txtLine = `[${time}] ${author}: ${content}\n`;

    if (message.attachments.size) {
      message.attachments.forEach(a => {
        txtLine += `  [Anhang] ${a.name} -> ${a.url}\n`;
      });
    }

    fs.appendFileSync(tTxt, txtLine);

    // HTML Format
    const escapedContent = mentionToName(message.content || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    const authorInitial = author.charAt(0).toUpperCase();
    const timeFormatted = new Date(message.createdTimestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let htmlMessage = `
      <div class="message">
        <div class="avatar-fallback">${authorInitial}</div>
        <div class="message-content">
          <div class="message-header">
            <span class="author">${author}</span>
            <span class="timestamp">${timeFormatted}</span>
          </div>
          <div class="message-text">${escapedContent}</div>`;

    if (message.attachments.size) {
      htmlMessage += '<div class="attachments">';
      message.attachments.forEach(a => {
        htmlMessage += `<a href="${a.url}" class="attachment" target="_blank">📎 ${a.name}</a>`;
      });
      htmlMessage += '</div>';
    }

    htmlMessage += `
        </div>
      </div>`;

    // Read HTML file, insert before closing tags
    let htmlContent = fs.readFileSync(tHtml, 'utf8');

    // If closing tags exist, insert before them, otherwise append
    if (htmlContent.includes('</div></div></body>')) {
      htmlContent = htmlContent.replace('</div></div></body>', htmlMessage + '</div></div></body>');
    } else if (htmlContent.includes('id="messages"')) {
      // Insert after messages div opening
      htmlContent = htmlContent.replace('id="messages">', `id="messages">${htmlMessage}`);
    } else {
      htmlContent += htmlMessage;
    }

    fs.writeFileSync(tHtml, htmlContent);

  } catch (err) {
    console.error('Fehler beim Schreiben des Live-Transcripts:', err);
  }
}


function getFormFieldsForTopic(cfg, topicValue){
  const all = Array.isArray(cfg.formFields)? cfg.formFields : [];
  return all.filter(f => {
    if(!f) return false;
    if(!f.topic) return true;
    if(Array.isArray(f.topic)) return f.topic.includes(topicValue);
    return f.topic === topicValue;
  }).slice(0,5);
}
function normalizeField(field, index){
  return {
    label: (field.label||`Feld ${index+1}`).substring(0,45),
    id: (field.id||`f${index}`),
    required: field.required? true:false,
    style: field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short,
    placeholder: field.placeholder || '',
    isNumber: field.style === 'number'
  };
}

client.on(Events.InteractionCreate, async i => {
  try {
    // Maintenance Mode Check
    const maintenanceFile = path.join(__dirname, 'maintenance.json');
    let maintenanceState = { enabled: false };
    if (fs.existsSync(maintenanceFile)) {
      try {
        maintenanceState = JSON.parse(fs.readFileSync(maintenanceFile, 'utf8'));
      } catch (err) {
        console.error('Error reading maintenance state:', err);
      }
    }

    // Block all interactions except on whitelisted server during maintenance
    const WHITELISTED_SERVER_ID = '1403053662825222388';
    const FOUNDER_IDS = ['1048900200497954868', '1159182333316968530'];

    if (maintenanceState.enabled && i.guild && i.guild.id !== WHITELISTED_SERVER_ID) {
      // Allow founders to use maintenance command on any server
      const isFounder = FOUNDER_IDS.includes(i.user.id);
      const isMaintenanceCommand = i.isChatInputCommand() && i.commandName === 'maintenance';

      if (!isFounder || !isMaintenanceCommand) {
        const maintenanceEmbed = new EmbedBuilder()
          .setColor(0xff9500)
          .setTitle('🔧 Wartungsmodus aktiv')
          .setDescription(
            '**Der Bot befindet sich derzeit im Wartungsmodus.**\n\n' +
            'Alle Funktionen sind vorübergehend deaktiviert.\n' +
            'Bitte versuche es später erneut.'
          )
          .addFields(
            {
              name: '📝 Grund',
              value: maintenanceState.reason || 'Wartungsarbeiten',
              inline: false
            },
            {
              name: '⏰ Seit',
              value: `<t:${Math.floor(maintenanceState.enabledAt / 1000)}:R>`,
              inline: true
            }
          )
          .setFooter({ text: 'Quantix Tickets • Maintenance Mode' })
          .setTimestamp();

        if (i.isCommand() || i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) {
          if (i.deferred || i.replied) {
            return i.editReply({ embeds: [maintenanceEmbed] }).catch(() => {});
          } else {
            return i.reply({ embeds: [maintenanceEmbed], ephemeral: true }).catch(() => {});
          }
        }
        return;
      }
    }

    const cfg = readCfg(i.guild?.id) || {};

    if(i.isChatInputCommand()){
      if(i.commandName === 'setlanguage'){
        const guildId = i.guild?.id;
        if(!guildId) return i.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });

        if(!i.member.permissions.has(PermissionsBitField.Flags.Administrator)){
          return i.reply({ content: t(guildId, 'language.only_admin'), ephemeral: true });
        }

        const selectedLang = i.options.getString('language');
        setGuildLanguage(guildId, selectedLang);
        const langName = getLanguageName(selectedLang);

        return i.reply({
          content: t(guildId, 'language.updated', { language: langName }),
          ephemeral: false
        });
      }

      const command = commandsCollection.get(i.commandName);
      if(command){
        if(i.commandName === 'reload'){
          try {
            await command.execute(i);
            loadCommands();
            await deployCommands();
          } catch(err){
            console.error('Reload Error:', err);
          }
          return;
        }
        try {
          await command.execute(i);
        } catch(err){
          console.error('Command Error:', err);
          const reply = { content: '❌ Fehler beim Ausführen des Commands', ephemeral: true };
          if(i.deferred || i.replied) await i.editReply(reply);
          else await i.reply(reply);
        }
        return;
      }
    }

    // Maintenance Enable Modal Handler
    if(i.isModalSubmit() && i.customId === 'maintenance_enable_modal') {
      try {
        const maintenanceCommand = require('./commands/maintenance.js');

        // Check if user is Founder
        if (!maintenanceCommand.FOUNDER_IDS.includes(i.user.id)) {
          return i.reply({ content: '❌ Keine Berechtigung', ephemeral: true });
        }

        const reason = i.fields.getTextInputValue('maintenance_reason') || 'Wartungsarbeiten';

        const newState = {
          enabled: true,
          enabledAt: Date.now(),
          enabledBy: i.user.id,
          reason: reason
        };

        maintenanceCommand.writeMaintenanceState(newState);

        // Update bot status
        try {
          await i.client.user.setPresence({
            activities: [{ name: '🔧 Wartungsmodus | Under Maintenance', type: 4 }],
            status: 'dnd'
          });
        } catch (err) {
          console.error('Error setting bot status:', err);
        }

        const enableEmbed = new EmbedBuilder()
          .setColor(0xff9500)
          .setTitle('🔧 Wartungsmodus aktiviert')
          .setDescription(
            '**Der Bot wurde in den Wartungsmodus versetzt.**\n\n' +
            'Der Bot funktioniert nur noch auf dem whitelisted Server.'
          )
          .addFields(
            {
              name: '💡 Status',
              value: '🔴 Nicht stören (DND)',
              inline: true
            },
            {
              name: '📝 Grund',
              value: reason,
              inline: true
            },
            {
              name: '✅ Whitelisted Server',
              value: `\`${maintenanceCommand.WHITELISTED_SERVER_ID}\``,
              inline: false
            }
          )
          .setFooter({ text: 'Quantix Tickets • Maintenance Mode' })
          .setTimestamp();

        await i.reply({ embeds: [enableEmbed] });

        console.log(`🔧 Maintenance Mode ENABLED by ${i.user.tag} (${i.user.id})`);

        // Send logs to all servers
        await maintenanceCommand.sendMaintenanceLog(i.client, true, reason, i.user.id);

      } catch (error) {
        console.error('Error in maintenance modal handler:', error);
        if (!i.replied && !i.deferred) {
          await i.reply({
            content: '❌ Ein Fehler ist aufgetreten.',
            ephemeral: true
          });
        }
      }
      return;
    }

    if(i.isStringSelectMenu() && i.customId==='topic'){
      if(i.values[0] === 'none') return i.reply({content:'⚠️ Keine Topics konfiguriert. Bitte konfiguriere zuerst Topics im Panel.',ephemeral:true});
      const topic = cfg.topics?.find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema',ephemeral:true});

      // Check for FAQ/Auto-Responses (Free Feature)
      if(cfg.autoResponses && cfg.autoResponses.enabled && cfg.autoResponses.responses && cfg.autoResponses.responses.length > 0) {
        const relevantFAQs = cfg.autoResponses.responses.filter(faq => {
          // Match by topic value/label
          const topicMatch = faq.keywords.some(keyword =>
            topic.value.toLowerCase().includes(keyword) ||
            topic.label.toLowerCase().includes(keyword)
          );
          return topicMatch;
        });

        if(relevantFAQs.length > 0) {
          // Show FAQ before creating ticket
          const faqEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('💡 Häufig gestellte Fragen')
            .setDescription(
              `Bevor du ein Ticket erstellst, schau dir diese häufig gestellten Fragen an:\n\n` +
              `**Thema:** ${topic.label}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            );

          relevantFAQs.slice(0, 5).forEach((faq, index) => {
            faqEmbed.addFields({
              name: `${index + 1}. ${faq.question}`,
              value: faq.answer.substring(0, 1024),
              inline: false
            });
          });

          faqEmbed.setFooter({
            text: 'Quantix Tickets • FAQ System',
            iconURL: i.guild.iconURL({ size: 64 })
          });

          const faqButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`faq_solved:${topic.value}`)
              .setLabel('Problem gelöst')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
            new ButtonBuilder()
              .setCustomId(`faq_create:${topic.value}`)
              .setLabel('Trotzdem Ticket erstellen')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🎫')
          );

          return i.reply({
            embeds: [faqEmbed],
            components: [faqButtons],
            ephemeral: true
          });
        }
      }

      const formFields = getFormFieldsForTopic(cfg, topic.value);

      const resetPanelMessage = async () => {
        try {
          const row = buildPanelSelect(cfg);
          let panelEmbed = undefined;
          if(cfg.panelEmbed && (cfg.panelEmbed.title || cfg.panelEmbed.description)){
            panelEmbed = new EmbedBuilder();
            if(cfg.panelEmbed.title) panelEmbed.setTitle(cfg.panelEmbed.title);
            if(cfg.panelEmbed.description) panelEmbed.setDescription(cfg.panelEmbed.description);
            if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) panelEmbed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
            if(cfg.panelEmbed.footer) panelEmbed.setFooter({ text: cfg.panelEmbed.footer });
          }
          await i.message.edit({ embeds: panelEmbed ? [panelEmbed] : i.message.embeds, components: [row] });
        } catch(e) {
          console.error('Fehler beim Zurücksetzen der Panel-Nachricht:', e);
        }
      };

      if(formFields.length){
        await resetPanelMessage();

        const modal = new ModalBuilder().setCustomId(`modal_newticket:${topic.value}`).setTitle(`Ticket: ${topic.label}`.substring(0,45));
        formFields.forEach((f,idx)=>{
          const nf = normalizeField(f,idx);
          const inputBuilder = new TextInputBuilder()
            .setCustomId(nf.id)
            .setLabel(nf.label)
            .setRequired(nf.required)
            .setStyle(nf.style);

          // Add placeholder with number hint if applicable
          let placeholder = nf.placeholder;
          if (nf.isNumber) {
            placeholder = placeholder ? `${placeholder} (Nur Zahlen)` : 'Nur Zahlen erlaubt';
          }
          if (placeholder) {
            inputBuilder.setPlaceholder(placeholder.substring(0, 100));
          }

          modal.addComponents(new ActionRowBuilder().addComponents(inputBuilder));
        });
        return i.showModal(modal);
      }

      await resetPanelMessage();
      await i.deferReply({ ephemeral: true });
      try {
        return await createTicketChannel(i, topic, {}, cfg);
      } catch (createErr) {
        console.error('❌ Error creating ticket channel:', createErr);
        await i.editReply({
          content: '❌ Fehler beim Erstellen des Tickets. Bitte versuche es erneut.'
        });
      }
      return;
    }

    // Tag System Menu Handlers
    if(i.isStringSelectMenu() && i.customId === 'tag_add_select') {
      return await handleTagAdd(i);
    }

    if(i.isStringSelectMenu() && i.customId === 'tag_remove_select') {
      return await handleTagRemove(i);
    }

    // Template System Menu Handler
    if(i.isStringSelectMenu() && i.customId === 'template_use_select') {
      return await handleTemplateUse(i);
    }

    // Department System Menu Handler
    if(i.isStringSelectMenu() && i.customId === 'department_forward_select') {
      return await handleDepartmentForward(i);
    }

    // Ticket Open-As Menu Handler
    if(i.isStringSelectMenu() && i.customId.startsWith('ticket_openas_')) {
      try {
        // Parse customId: ticket_openas_{userId}_{executorId}
        const parts = i.customId.split('_');
        const targetUserId = parts[2];
        const executorId = parts[3];
        const topicValue = i.values[0];

        // Find topic
        const topic = cfg.topics?.find(t => t.value === topicValue);
        if (!topic) {
          return i.reply({ content: '❌ Ungültiges Ticket-Thema', ephemeral: true });
        }

        // Get reason from original message embed
        const originalEmbed = i.message.embeds[0];
        let reason = 'Vom Team eröffnet';
        if (originalEmbed && originalEmbed.description) {
          const reasonMatch = originalEmbed.description.match(/\*\*Grund:\*\* (.+)/);
          if (reasonMatch) reason = reasonMatch[1].split('\n')[0];
        }

        // Check for form fields
        const formFields = getFormFieldsForTopic(cfg, topicValue);

        if (formFields.length > 0) {
          // Show modal with form fields
          const modal = new ModalBuilder()
            .setCustomId(`modal_openas:${targetUserId}:${executorId}:${topicValue}:${reason}`)
            .setTitle(`Ticket: ${topic.label}`.substring(0, 45));

          formFields.forEach((f, idx) => {
            const nf = normalizeField(f, idx);
            const inputBuilder = new TextInputBuilder()
              .setCustomId(nf.id)
              .setLabel(nf.label)
              .setRequired(nf.required)
              .setStyle(nf.style);

            // Add placeholder with number hint if applicable
            let placeholder = nf.placeholder;
            if (nf.isNumber) {
              placeholder = placeholder ? `${placeholder} (Nur Zahlen)` : 'Nur Zahlen erlaubt';
            }
            if (placeholder) {
              inputBuilder.setPlaceholder(placeholder.substring(0, 100));
            }

            modal.addComponents(new ActionRowBuilder().addComponents(inputBuilder));
          });

          return i.showModal(modal);
        }

        // No form fields - create ticket directly
        await i.deferUpdate();

        // Get users
        const targetUser = await client.users.fetch(targetUserId);
        const executor = await client.users.fetch(executorId);

        // Load ticket-open-as command module
        const ticketOpenAsCmd = require('./commands/ticket-open-as.js');

        // Create ticket without form fields
        const result = await ticketOpenAsCmd.createTicketAs(
          i.guild,
          targetUser,
          executor,
          topicValue,
          reason,
          {}
        );

        if (result.success) {
          await i.editReply({
            content: `✅ Ticket #${result.ticketNumber} wurde erfolgreich für ${targetUser} erstellt und dir zugewiesen!\n🎫 ${result.channel}`,
            embeds: [],
            components: []
          });
        } else {
          await i.editReply({
            content: `❌ Fehler beim Erstellen des Tickets: ${result.error}`,
            embeds: [],
            components: []
          });
        }
      } catch (err) {
        console.error('Ticket open-as handler error:', err);
        try {
          await i.editReply({
            content: '❌ Fehler beim Erstellen des Tickets. Bitte prüfe die Bot-Berechtigungen.',
            embeds: [],
            components: []
          });
        } catch {}
      }
      return;
    }

    if(i.isModalSubmit() && i.customId.startsWith('modal_newticket:')){
      const topicValue = i.customId.split(':')[1];
      const topic = cfg.topics?.find(t=>t.value===topicValue);

      if(!topic) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Ungültiges Thema')
          .setDescription(
            '**Das gewählte Ticket-Thema ist nicht mehr verfügbar.**\n\n' +
            'Möglicherweise wurde es vom Administrator entfernt. Bitte wähle ein anderes Thema aus dem Ticket-Panel.'
          )
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();
        return i.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Blacklist-Check
      if (cfg.ticketBlacklist && Array.isArray(cfg.ticketBlacklist)) {
        const now = new Date();
        const blacklist = cfg.ticketBlacklist.find(b => b.userId === i.user.id);

        if (blacklist) {
          // Check if temporary blacklist has expired
          if (!blacklist.isPermanent && new Date(blacklist.expiresAt) <= now) {
            // Remove expired blacklist
            cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== i.user.id);
            writeCfg(guildId, cfg);
          } else {
            // User is blacklisted
            const expiryText = blacklist.isPermanent
              ? t(guildId, 'ticketBlacklist.permanent')
              : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`;

            const blacklistEmbed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.user_blacklisted'))
              .setDescription(t(guildId, 'ticketBlacklist.blocked_error', {
                reason: blacklist.reason,
                expires: expiryText
              }))
              .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
              .setTimestamp();

            return i.reply({ embeds: [blacklistEmbed], ephemeral: true });
          }
        }
      }
      const formFields = getFormFieldsForTopic(cfg, topic.value).map(normalizeField);
      const answers = {};
      formFields.forEach(f=>{ answers[f.id] = i.fields.getTextInputValue(f.id); });

      // Validate number fields
      for (const field of formFields) {
        if (field.isNumber && answers[field.id]) {
          const value = answers[field.id].trim();
          if (value && !/^\d+([.,]\d+)?$/.test(value)) {
            return i.reply({
              ephemeral: true,
              content: `❌ **${field.label}** muss eine Zahl sein! (z.B. 123 oder 45.67)`
            });
          }
        }
      }

      try {
        await createTicketChannel(i, topic, answers, cfg);
      } catch (createErr) {
        console.error('❌ Error creating ticket channel:', createErr);
        if (!i.replied && !i.deferred) {
          await i.reply({
            content: '❌ Fehler beim Erstellen des Tickets. Bitte versuche es erneut.',
            ephemeral: true
          });
        }
      }
      return;
    }

    // Multi-System Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('modal_multisystem:')){
      try {
        const parts = i.customId.split(':');
        const systemId = parts[1];
        const topicValue = parts[2];

        const { getTicketSystem } = require('./ticket-systems');
        const system = getTicketSystem(guildId, systemId);

        if(!system || !system.enabled){
          return i.reply({
            ephemeral:true,
            content:'❌ Dieses Ticket-System ist nicht mehr verfügbar.'
          });
        }

        const topic = system.topics?.find(t => t.value === topicValue);
        if(!topic){
          return i.reply({
            ephemeral:true,
            content:'❌ Ungültiges Ticket-Thema.'
          });
        }

        // Blacklist-Check
        if (cfg.ticketBlacklist && Array.isArray(cfg.ticketBlacklist)) {
          const now = new Date();
          const blacklist = cfg.ticketBlacklist.find(b => b.userId === i.user.id);

          if (blacklist) {
            if (!blacklist.isPermanent && new Date(blacklist.expiresAt) <= now) {
              cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== i.user.id);
              writeCfg(guildId, cfg);
            } else {
              const expiryText = blacklist.isPermanent
                ? t(guildId, 'ticketBlacklist.permanent')
                : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`;

              const blacklistEmbed = new EmbedBuilder()
                .setColor(0xff4444)
                .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.user_blacklisted'))
                .setDescription(t(guildId, 'ticketBlacklist.blocked_error', {
                  reason: blacklist.reason,
                  expires: expiryText
                }))
                .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
                .setTimestamp();

              return i.reply({ embeds: [blacklistEmbed], ephemeral: true });
            }
          }
        }

        const formFields = getFormFieldsForTopic(system, topic.value).map(normalizeField);
        const answers = {};
        formFields.forEach(f=>{ answers[f.id] = i.fields.getTextInputValue(f.id); });

        // Validate number fields
        for (const field of formFields) {
          if (field.isNumber && answers[field.id]) {
            const value = answers[field.id].trim();
            if (value && !/^\d+([.,]\d+)?$/.test(value)) {
              return i.reply({
                ephemeral: true,
                content: `❌ **${field.label}** muss eine Zahl sein! (z.B. 123 oder 45.67)`
              });
            }
          }
        }

        await createTicketChannelMultiSystem(i, system, topic, answers, cfg);
      } catch (createErr) {
        console.error('❌ Error creating multi-system ticket channel:', createErr);
        if (!i.replied && !i.deferred) {
          await i.reply({
            content: '❌ Fehler beim Erstellen des Tickets. Bitte versuche es erneut.',
            ephemeral: true
          });
        }
      }
      return;
    }

    // Application Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('modal_application:')){
      const guildId = i.customId.split(':')[1];
      if(guildId !== i.guild.id) return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});

      const cfg = readCfg(guildId);
      if(!cfg || !cfg.applicationSystem || !cfg.applicationSystem.enabled){
        return i.reply({
          ephemeral:true,
          content:'❌ Das Bewerbungssystem ist nicht aktiviert.'
        });
      }

      const formFields = cfg.applicationSystem.formFields || [];
      const answers = {};
      formFields.forEach(f=>{
        try{
          answers[f.id] = i.fields.getTextInputValue(f.id);
        } catch(e) {
          answers[f.id] = '';
        }
      });

      // Validate number fields
      for (const field of formFields) {
        if (field.style === 'number' && answers[field.id]) {
          const value = answers[field.id].trim();
          if (value && !/^\d+([.,]\d+)?$/.test(value)) {
            return i.reply({
              ephemeral: true,
              content: `❌ **${field.label}** muss eine Zahl sein! (z.B. 123 oder 45.67)`
            });
          }
        }
      }

      try {
        await i.deferReply({ ephemeral: true });

        // Create application ticket channel
        const tickets = loadTickets(guildId);
        const counter = nextTicket(guildId);

        const categoryId = cfg.applicationSystem.categoryId;
        if(!categoryId){
          return i.editReply({
            content: '❌ Keine Bewerbungs-Kategorie konfiguriert. Bitte kontaktiere einen Administrator.'
          });
        }

        // Channel name format: bewerbung-{ticketNumber}-{username}
        const sanitizedUsername = i.user.username.replace(/[^a-zA-Z0-9]/g, '').substring(0,15).toLowerCase() || 'user';
        const channelName = `${PREFIX}bewerbung-${counter}-${sanitizedUsername}`;

        const channel = await i.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId,
          topic: `Bewerbung #${counter} von ${i.user.tag}`,
          permissionOverwrites: [
            {
              id: i.guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: i.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
              ]
            },
            {
              id: i.client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ReadMessageHistory
              ]
            }
          ]
        });

        // Add team role permissions
        if(cfg.applicationSystem.teamRoleId){
          await channel.permissionOverwrites.create(cfg.applicationSystem.teamRoleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            ManageMessages: true
          });
        }

        // Build ticket embed with placeholders replaced
        const ticketColor = cfg.applicationSystem.ticketColor || '#10b981';
        const ticketColorInt = parseInt(ticketColor.replace('#', ''), 16);

        let ticketTitle = cfg.applicationSystem.ticketTitle || '📝 Bewerbung von {username}';
        let ticketDescription = cfg.applicationSystem.ticketDescription || 'Willkommen {username}! Vielen Dank für deine Bewerbung.';

        // Replace placeholders
        ticketTitle = ticketTitle.replace(/\{username\}/g, i.user.username)
                                 .replace(/\{userId\}/g, i.user.id)
                                 .replace(/\{userTag\}/g, i.user.tag);

        ticketDescription = ticketDescription.replace(/\{username\}/g, i.user.username)
                                             .replace(/\{userId\}/g, i.user.id)
                                             .replace(/\{userTag\}/g, i.user.tag);

        const ticketEmbed = new EmbedBuilder()
          .setColor(ticketColorInt)
          .setTitle(ticketTitle)
          .setDescription(ticketDescription)
          .setThumbnail(i.user.displayAvatarURL({ size: 128 }))
          .setFooter({
            text: `Bewerbung #${counter} • ${i.guild.name}`,
            iconURL: i.guild.iconURL({ size: 64 })
          })
          .setTimestamp();

        // Add form field answers to embed
        formFields.forEach(field => {
          const answer = answers[field.id] || 'Nicht beantwortet';
          ticketEmbed.addFields({
            name: field.label,
            value: answer.substring(0, 1024),
            inline: false
          });
        });

        // Send embed with accept and reject buttons
        const acceptButton = new ButtonBuilder()
          .setCustomId(`accept_application_${guildId}`)
          .setLabel('Annehmen')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅');

        const rejectButton = new ButtonBuilder()
          .setCustomId(`reject_application_${guildId}`)
          .setLabel('Ablehnen')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌');

        const buttonRow = new ActionRowBuilder().addComponents(acceptButton, rejectButton);

        const ticketMessage = await channel.send({
          content: `<@${i.user.id}>`,
          embeds: [ticketEmbed],
          components: [buttonRow]
        });

        // Save ticket to database
        const newTicket = {
          id: counter,
          userId: i.user.id,
          username: i.user.username,
          channelId: channel.id,
          messageId: ticketMessage.id,
          status: 'open',
          createdAt: new Date().toISOString(),
          closedAt: null,
          claimer: null,
          addedUsers: [],
          isApplication: true,
          applicationAnswers: answers
        };

        tickets.push(newTicket);
        saveTickets(guildId, tickets);

        // Initialize live transcript
        const transcriptDir = path.join(__dirname, 'transcripts', guildId);
        if (!fs.existsSync(transcriptDir)) {
          fs.mkdirSync(transcriptDir, { recursive: true });
        }

        const txtPath = path.join(transcriptDir, `transcript_${counter}.txt`);
        const htmlPath = path.join(transcriptDir, `transcript_${counter}.html`);

        const transcriptHeader = `Bewerbung #${counter} - ${i.user.tag}\nErstellt am: ${new Date().toLocaleString('de-DE')}\n\n`;
        fs.writeFileSync(txtPath, transcriptHeader, 'utf8');

        const htmlHeader = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bewerbung #${counter}</title><style>body{background:#1e1e1e;color:#fff;font-family:Arial,sans-serif;padding:20px;}.msg{margin:10px 0;padding:10px;background:#2e2e2e;border-radius:8px;}</style></head><body><h1>Bewerbung #${counter}</h1><p>Erstellt von: ${i.user.tag}</p><p>Datum: ${new Date().toLocaleString('de-DE')}</p><hr>`;
        fs.writeFileSync(htmlPath, htmlHeader, 'utf8');

        await i.editReply({
          content: `✅ Deine Bewerbung wurde erfolgreich eingereicht!\n🎫 Bewerbungs-Ticket: <#${channel.id}>`
        });

        // Log event
        await logEvent(i.guild, `📝 Bewerbung #${counter} wurde von <@${i.user.id}> eingereicht.`, i.user);

      } catch(error) {
        console.error('Application ticket creation error:', error);
        if (!i.replied && !i.deferred) {
          await i.reply({
            content: '❌ Fehler beim Erstellen der Bewerbung. Bitte versuche es erneut.',
            ephemeral: true
          });
        } else {
          await i.editReply({
            content: '❌ Fehler beim Erstellen der Bewerbung. Bitte versuche es erneut.'
          });
        }
      }
      return;
    }

    // Application Accept Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('modal_accept_application:')){
      try {
        const parts = i.customId.split(':');
        const guildId = parts[1];
        const ticketId = parseInt(parts[2]);

        if(guildId !== i.guild.id){
          return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});
        }

        const cfg = readCfg(guildId);
        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.id === ticketId && t.isApplication === true);

        if(!ticket){
          return i.reply({ephemeral:true,content:'❌ Bewerbung nicht gefunden.'});
        }

        await i.deferReply({ephemeral:true});

        // Get inputs
        const roleName = i.fields.getTextInputValue('role_name');
        const reason = i.fields.getTextInputValue('reason') || 'Keine Angabe';

        // Find role by name (case insensitive)
        const roles = await i.guild.roles.fetch();
        const targetRole = roles.find(r => r.name.toLowerCase() === roleName.toLowerCase());

        if(!targetRole){
          return i.editReply({
            content: `❌ Rolle "${roleName}" nicht gefunden. Bitte überprüfe den Namen.`
          });
        }

        // Get applicant
        const applicant = await i.guild.members.fetch(ticket.userId).catch(() => null);
        if(!applicant){
          return i.editReply({
            content: '❌ Bewerber nicht mehr auf dem Server.'
          });
        }

        // Give role
        try {
          await applicant.roles.add(targetRole);
        } catch(roleErr){
          console.error('Error assigning role:', roleErr);
          return i.editReply({
            content: `❌ Fehler beim Zuweisen der Rolle. Bot-Rolle muss über "${targetRole.name}" stehen.`
          });
        }

        // Update ticket
        ticket.status = 'accepted';
        ticket.acceptedBy = i.user.id;
        ticket.acceptedAt = new Date().toISOString();
        ticket.acceptReason = reason;
        ticket.assignedRole = targetRole.id;
        saveTickets(guildId, tickets);

        // Send acceptance message in channel
        const acceptEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Bewerbung angenommen')
          .setDescription(
            `**Bewerber:** <@${ticket.userId}>\n` +
            `**Angenommen von:** <@${i.user.id}>\n` +
            `**Zugewiesene Rolle:** <@&${targetRole.id}>\n\n` +
            `**Grund:** ${reason}`
          )
          .addFields(
            { name: '🎫 Bewerbung', value: `#${ticket.id}`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
          )
          .setFooter({ text: 'Quantix Tickets • Bewerbungssystem' })
          .setTimestamp();

        await i.channel.send({ embeds: [acceptEmbed] });

        // Send DM to applicant
        try {
          const user = await client.users.fetch(ticket.userId);
          const dmEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('🎉 Glückwunsch! Deine Bewerbung wurde angenommen!')
            .setDescription(
              `**Server:** ${i.guild.name}\n` +
              `**Bewerbung:** #${String(ticket.id).padStart(5, '0')}\n` +
              `**Zugewiesene Rolle:** ${targetRole.name}\n\n` +
              `**Nachricht vom Team:**\n${reason}`
            )
            .setFooter({ text: `Quantix Tickets • ${i.guild.name}` })
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch(dmErr){
          console.error('DM notification error:', dmErr);
        }

        // Log event
        await logEvent(i.guild, `✅ Bewerbung **#${ticket.id}** von <@${ticket.userId}> wurde angenommen von <@${i.user.id}>`);

        await i.editReply({
          content: `✅ Bewerbung angenommen! <@${ticket.userId}> hat die Rolle <@&${targetRole.id}> erhalten.`
        });

        // Delete ticket channel after 10 seconds
        setTimeout(async () => {
          try {
            const channel = await i.guild.channels.fetch(ticket.channelId);
            if(channel){
              await channel.delete('Bewerbung angenommen');
            }
          } catch(delErr){
            console.error('Error deleting application channel:', delErr);
          }
        }, 10000);

      } catch(error){
        console.error('Application accept error:', error);
        if(!i.replied && !i.deferred){
          await i.reply({
            ephemeral:true,
            content:'❌ Fehler beim Annehmen der Bewerbung.'
          });
        } else {
          await i.editReply({
            content:'❌ Fehler beim Annehmen der Bewerbung.'
          });
        }
      }
      return;
    }

    // Application Reject Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('modal_reject_application:')){
      try {
        const parts = i.customId.split(':');
        const guildId = parts[1];
        const ticketId = parseInt(parts[2]);

        if(guildId !== i.guild.id){
          return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});
        }

        const cfg = readCfg(guildId);
        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.id === ticketId && t.isApplication === true);

        if(!ticket){
          return i.reply({ephemeral:true,content:'❌ Bewerbung nicht gefunden.'});
        }

        await i.deferReply({ephemeral:true});

        // Get inputs
        const reason = i.fields.getTextInputValue('reason') || 'Keine Angabe';

        // Update ticket
        ticket.status = 'rejected';
        ticket.rejectedBy = i.user.id;
        ticket.rejectedAt = new Date().toISOString();
        ticket.rejectReason = reason;
        saveTickets(guildId, tickets);

        // Send rejection message in channel
        const rejectEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Bewerbung abgelehnt')
          .setDescription(
            `**Bewerber:** <@${ticket.userId}>\n` +
            `**Abgelehnt von:** <@${i.user.id}>\n\n` +
            `**Grund:** ${reason}`
          )
          .addFields(
            { name: '🎫 Bewerbung', value: `#${ticket.id}`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
          )
          .setFooter({ text: 'Quantix Tickets • Bewerbungssystem' })
          .setTimestamp();

        await i.channel.send({ embeds: [rejectEmbed] });

        // Send DM to applicant
        try {
          const user = await client.users.fetch(ticket.userId);
          const dmEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('📄 Update zu deiner Bewerbung')
            .setDescription(
              `**Server:** ${i.guild.name}\n` +
              `**Bewerbung:** #${String(ticket.id).padStart(5, '0')}\n\n` +
              `Leider müssen wir dir mitteilen, dass deine Bewerbung abgelehnt wurde.\n\n` +
              `**Nachricht vom Team:**\n${reason}`
            )
            .setFooter({ text: `Quantix Tickets • ${i.guild.name}` })
            .setTimestamp();

          await user.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch(dmErr){
          console.error('DM notification error:', dmErr);
        }

        // Log event
        await logEvent(i.guild, `❌ Bewerbung **#${ticket.id}** von <@${ticket.userId}> wurde abgelehnt von <@${i.user.id}>`);

        await i.editReply({
          content: `✅ Bewerbung abgelehnt. <@${ticket.userId}> wurde benachrichtigt.`
        });

        // Delete ticket channel after 10 seconds
        setTimeout(async () => {
          try {
            const channel = await i.guild.channels.fetch(ticket.channelId);
            if(channel){
              await channel.delete('Bewerbung abgelehnt');
            }
          } catch(delErr){
            console.error('Error deleting application channel:', delErr);
          }
        }, 10000);

      } catch(error){
        console.error('Application reject error:', error);
        if(!i.replied && !i.deferred){
          await i.reply({
            ephemeral:true,
            content:'❌ Fehler beim Ablehnen der Bewerbung.'
          });
        } else {
          await i.editReply({
            content:'❌ Fehler beim Ablehnen der Bewerbung.'
          });
        }
      }
      return;
    }

    // Ticket Open-As Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('modal_openas:')){
      try {
        // Parse customId: modal_openas:{targetUserId}:{executorId}:{topicValue}:{reason}
        const parts = i.customId.split(':');
        const targetUserId = parts[1];
        const executorId = parts[2];
        const topicValue = parts[3];
        const reason = parts.slice(4).join(':'); // Rejoin in case reason contains colons

        // Find topic
        const topic = cfg.topics?.find(t => t.value === topicValue);
        if (!topic) {
          return i.reply({
            content: '❌ Ungültiges Ticket-Thema',
            ephemeral: true
          });
        }

        // Get form fields and extract answers
        const formFields = getFormFieldsForTopic(cfg, topicValue).map(normalizeField);
        const answers = {};
        formFields.forEach(f => {
          answers[f.id] = i.fields.getTextInputValue(f.id);
        });

        // Validate number fields
        for (const field of formFields) {
          if (field.isNumber && answers[field.id]) {
            const value = answers[field.id].trim();
            if (value && !/^\d+([.,]\d+)?$/.test(value)) {
              return i.reply({
                ephemeral: true,
                content: `❌ **${field.label}** muss eine Zahl sein! (z.B. 123 oder 45.67)`
              });
            }
          }
        }

        await i.deferReply({ ephemeral: true });

        // Get users
        const targetUser = await client.users.fetch(targetUserId);
        const executor = await client.users.fetch(executorId);

        // Load ticket-open-as command module
        const ticketOpenAsCmd = require('./commands/ticket-open-as.js');

        // Create ticket with form field answers
        const result = await ticketOpenAsCmd.createTicketAs(
          i.guild,
          targetUser,
          executor,
          topicValue,
          reason,
          answers
        );

        if (result.success) {
          await i.editReply({
            content: `✅ Ticket #${result.ticketNumber} wurde erfolgreich für ${targetUser} erstellt und dir zugewiesen!\n🎫 ${result.channel}`
          });
        } else {
          await i.editReply({
            content: `❌ Fehler beim Erstellen des Tickets: ${result.error}`
          });
        }
      } catch (err) {
        console.error('Ticket open-as modal submit error:', err);
        if (!i.replied && !i.deferred) {
          await i.reply({
            content: '❌ Fehler beim Erstellen des Tickets. Bitte versuche es erneut.',
            ephemeral: true
          });
        }
      }
      return;
    }

    if(i.isButton()){
      // AntiSpam Button Protection (ausgenommen bestimmte Buttons)
      const exemptButtons = ['faq_solved:', 'faq_create:', 'cancel-deletion-'];
      const isExempt = exemptButtons.some(prefix => i.customId.startsWith(prefix));

      if (!isExempt) {
        const guildId = i.guild?.id;
        const cfg = guildId ? readCfg(guildId) : {};

        if (cfg.antiSpam && cfg.antiSpam.enabled) {
          const buttonRateLimit = checkButtonRateLimit(i.user.id, i.customId);

          if (!buttonRateLimit.allowed) {
            const spamEmbed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle('🛑 Zu viele Klicks!')
              .setDescription(
                '**Langsam, langsam!**\n\n' +
                'Du klickst zu schnell auf die Buttons. Bitte warte einen Moment.'
              )
              .addFields({
                name: '⏱️ Warte noch',
                value: `**${buttonRateLimit.waitSeconds} Sekunde(n)**`,
                inline: true
              })
              .setFooter({ text: 'Quantix Tickets • AntiSpam System' })
              .setTimestamp();

            return i.reply({ embeds: [spamEmbed], ephemeral: true });
          }

          logButtonClick(i.user.id, i.customId);
        }
      }

      // FAQ Button Handlers
      if(i.customId.startsWith('faq_solved:')){
        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Problem gelöst')
          .setDescription(
            'Großartig! Wir freuen uns, dass wir dir helfen konnten.\n\n' +
            'Falls du später noch Hilfe benötigst, kannst du jederzeit ein Ticket erstellen.'
          )
          .setFooter({ text: 'Quantix Tickets • FAQ System' })
          .setTimestamp();

        await i.update({ embeds: [successEmbed], components: [] });
        return;
      }

      // Multi-Ticket-System: Button Handler for ticket_create:systemId:topicValue
      if(i.customId.startsWith('ticket_create:')){
        try {
          const parts = i.customId.split(':');
          const systemId = parts[1];
          const topicValue = parts[2];

          const { getTicketSystem } = require('./ticket-systems');
          const system = getTicketSystem(guildId, systemId);

          if(!system || !system.enabled){
            return i.reply({
              ephemeral:true,
              content:'❌ Dieses Ticket-System ist nicht verfügbar.'
            });
          }

          const topic = system.topics?.find(t => t.value === topicValue);
          if(!topic){
            return i.reply({
              ephemeral:true,
              content:'❌ Ungültiges Ticket-Thema.'
            });
          }

          // Check blacklist
          if (cfg.ticketBlacklist && Array.isArray(cfg.ticketBlacklist)) {
            const now = new Date();
            const blacklist = cfg.ticketBlacklist.find(b => b.userId === i.user.id);

            if (blacklist) {
              if (!blacklist.isPermanent && new Date(blacklist.expiresAt) <= now) {
                cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== i.user.id);
                writeCfg(guildId, cfg);
              } else {
                const expiryText = blacklist.isPermanent
                  ? t(guildId, 'ticketBlacklist.permanent')
                  : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`;

                const blacklistEmbed = new EmbedBuilder()
                  .setColor(0xff4444)
                  .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.user_blacklisted'))
                  .setDescription(t(guildId, 'ticketBlacklist.blocked_error', {
                    reason: blacklist.reason,
                    expires: expiryText
                  }))
                  .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
                  .setTimestamp();

                return i.reply({ embeds: [blacklistEmbed], ephemeral: true });
              }
            }
          }

          // Check for form fields
          const formFields = getFormFieldsForTopic(system, topic.value);

          if(formFields.length){
            // Show modal with form fields
            const modal = new ModalBuilder()
              .setCustomId(`modal_multisystem:${systemId}:${topic.value}`)
              .setTitle(`Ticket: ${topic.label}`.substring(0,45));

            formFields.forEach((f,idx)=>{
              const nf = normalizeField(f,idx);
              const inputBuilder = new TextInputBuilder()
                .setCustomId(nf.id)
                .setLabel(nf.label)
                .setRequired(nf.required)
                .setStyle(nf.style);

              let placeholder = nf.placeholder;
              if (nf.isNumber) {
                placeholder = placeholder ? `${placeholder} (Nur Zahlen)` : 'Nur Zahlen erlaubt';
              }
              if (placeholder) {
                inputBuilder.setPlaceholder(placeholder.substring(0, 100));
              }

              modal.addComponents(new ActionRowBuilder().addComponents(inputBuilder));
            });

            return i.showModal(modal);
          }

          // No form fields, create ticket directly
          await i.deferReply({ ephemeral: true });
          try {
            return await createTicketChannelMultiSystem(i, system, topic, {}, cfg);
          } catch (createErr) {
            console.error('❌ Error creating multi-system ticket channel:', createErr);
            await i.editReply({
              content: '❌ Fehler beim Erstellen des Tickets. Bitte versuche es erneut.'
            });
          }
        } catch(error){
          console.error('Error in ticket_create handler:', error);
          if(!i.replied && !i.deferred){
            return i.reply({ephemeral:true,content:'❌ Fehler beim Verarbeiten des Buttons.'});
          }
        }
        return;
      }

      if(i.customId.startsWith('faq_create:')){
        const topicValue = i.customId.split(':')[1];
        const topic = cfg.topics?.find(t=>t.value===topicValue);

        if(!topic) {
          return i.update({
            content: '❌ Ungültiges Thema. Bitte wähle ein Thema aus dem Panel.',
            embeds: [],
            components: []
          });
        }

        const formFields = getFormFieldsForTopic(cfg, topic.value);

        if(formFields.length){
          // Show modal with form fields
          const modal = new ModalBuilder()
            .setCustomId(`modal_newticket:${topic.value}`)
            .setTitle(`Ticket: ${topic.label}`.substring(0,45));

          formFields.forEach((f,idx)=>{
            const nf = normalizeField(f,idx);
            const inputBuilder = new TextInputBuilder()
              .setCustomId(nf.id)
              .setLabel(nf.label)
              .setRequired(nf.required)
              .setStyle(nf.style);

            let placeholder = nf.placeholder;
            if (nf.isNumber) {
              placeholder = placeholder ? `${placeholder} (Nur Zahlen)` : 'Nur Zahlen erlaubt';
            }
            if (placeholder) {
              inputBuilder.setPlaceholder(placeholder.substring(0, 100));
            }

            modal.addComponents(new ActionRowBuilder().addComponents(inputBuilder));
          });

          return i.showModal(modal);
        }

        // No form fields, create ticket directly
        await i.deferUpdate();
        await i.editReply({ content: '🎫 Ticket wird erstellt...', embeds: [], components: [] });
        try {
          return await createTicketChannel(i, topic, {}, cfg);
        } catch (createErr) {
          console.error('❌ Error creating ticket channel:', createErr);
          await i.editReply({
            content: '❌ Fehler beim Erstellen des Tickets. Bitte versuche es erneut.',
            embeds: [],
            components: []
          });
        }
        return;
      }

      // Application System Button Handler
      if(i.customId.startsWith('application_start_')){
        const guildId = i.customId.replace('application_start_', '');
        if(guildId !== i.guild.id) return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});

        const cfg = readCfg(guildId);
        if(!cfg || !cfg.applicationSystem || !cfg.applicationSystem.enabled){
          return i.reply({
            ephemeral:true,
            content:'❌ Das Bewerbungssystem ist nicht aktiviert.'
          });
        }

        // Check if user has applicationSystem feature (Basic+)
        if(!hasFeature(guildId, 'applicationSystem')){
          const upgradeEmbed = new EmbedBuilder()
            .setColor(0xf59e0b)
            .setTitle('⭐ Premium Basic+ erforderlich')
            .setDescription(
              '**Das Bewerbungssystem ist ein Premium Basic+ Feature!**\n\n' +
              'Upgrade jetzt, um professionelle Bewerbungen zu verwalten:\n' +
              '• Separates Bewerbungs-Panel\n' +
              '• Anpassbare Formularfelder\n' +
              '• Dedizierte Bewerbungs-Tickets\n' +
              '• Team-spezifische Berechtigungen'
            )
            .setFooter({ text: 'Quantix Tickets • Premium Feature' })
            .setTimestamp();

          return i.reply({embeds:[upgradeEmbed],ephemeral:true});
        }

        // Check blacklist
        if (cfg.ticketBlacklist && Array.isArray(cfg.ticketBlacklist)) {
          const now = new Date();
          const blacklist = cfg.ticketBlacklist.find(b => b.userId === i.user.id);

          if (blacklist) {
            if (!blacklist.isPermanent && new Date(blacklist.expiresAt) <= now) {
              cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== i.user.id);
              writeCfg(guildId, cfg);
            } else {
              const expiryText = blacklist.isPermanent
                ? t(guildId, 'ticketBlacklist.permanent')
                : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`;

              const blacklistEmbed = new EmbedBuilder()
                .setColor(0xff4444)
                .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.user_blacklisted'))
                .setDescription(t(guildId, 'ticketBlacklist.blocked_error', {
                  reason: blacklist.reason,
                  expires: expiryText
                }))
                .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
                .setTimestamp();

              return i.reply({ embeds: [blacklistEmbed], ephemeral: true });
            }
          }
        }

        // Check if user already has 2 or more open application tickets
        const tickets = loadTickets(guildId);
        const openApplications = tickets.filter(t =>
          t.userId === i.user.id &&
          t.status === 'open' &&
          t.isApplication === true
        );

        if(openApplications.length >= 2){
          const channels = openApplications.map(t => `<#${t.channelId}>`).join(', ');
          return i.reply({
            ephemeral:true,
            content:`❌ Du kannst maximal 2 Bewerbungen gleichzeitig offen haben.\n\n**Deine offenen Bewerbungen:**\n${channels}`
          });
        }

        // Build modal with configured fields
        const formFields = cfg.applicationSystem.formFields || [];
        if(formFields.length === 0){
          return i.reply({
            ephemeral:true,
            content:'❌ Keine Formularfelder konfiguriert. Bitte kontaktiere einen Administrator.'
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_application:${guildId}`)
          .setTitle('Bewerbung'.substring(0,45));

        // Add fields (max 5 per modal)
        const fieldsToAdd = formFields.slice(0, 5);
        fieldsToAdd.forEach((field, idx) => {
          const inputStyle = field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short;
          const placeholder = field.style === 'number' ? '(Nur Zahlen)' : '';

          const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label.substring(0,45))
            .setStyle(inputStyle)
            .setRequired(field.required !== false)
            .setMaxLength(field.style === 'paragraph' ? 1024 : 256);

          if(placeholder) input.setPlaceholder(placeholder);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });

        await i.showModal(modal);
        return;
      }

      if(i.customId.startsWith('github_toggle:')){
        const guildId = i.customId.split(':')[1];
        if(guildId !== i.guild.id) return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});

        const cfg = readCfg(guildId);
        const currentStatus = cfg.githubCommitsEnabled !== false;
        const newStatus = !currentStatus;

        cfg.githubCommitsEnabled = newStatus;
        writeCfg(guildId, cfg);

        const embed = new EmbedBuilder()
          .setTitle('⚙️ GitHub Commit Logs')
          .setDescription(
            `**New Status:** ${newStatus ? '✅ Enabled' : '❌ Disabled'}\n\n` +
            `GitHub commit notifications will ${newStatus ? 'now' : 'no longer'} be logged to this server.\n\n` +
            `${cfg.githubWebhookChannelId ? `**Log Channel:** <#${cfg.githubWebhookChannelId}>` : '⚠️ **No log channel set!** Please configure a channel in the panel.'}`
          )
          .setColor(newStatus ? 0x00ff88 : 0xff4444)
          .setFooter({ text: 'Quantix Tickets ©️' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`github_toggle:${guildId}`)
            .setLabel(newStatus ? 'Disable Logging' : 'Enable Logging')
            .setEmoji(newStatus ? '❌' : '✅')
            .setStyle(newStatus ? ButtonStyle.Danger : ButtonStyle.Success)
        );

        await i.update({ embeds: [embed], components: [row] });

        await logEvent(i.guild, `⚙️ GitHub Commit Logs ${newStatus ? 'enabled' : 'disabled'} by <@${i.user.id}>`);
        return;
      }

      if(i.customId.startsWith('cancel-deletion-')){
        const guildId = i.customId.split('-')[2];
        if(guildId !== i.guild.id) return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});

        try {
          const pendingFile = './pending-deletions.json';
          if(!fs.existsSync(pendingFile)){
            return i.reply({ephemeral:true,content:'❌ Keine ausstehenden Löschungen gefunden'});
          }

          let pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
          const deletion = pending.find(p => p.guildId === guildId);

          if(!deletion){
            return i.reply({ephemeral:true,content:'❌ Keine ausstehende Löschung für diesen Server gefunden'});
          }

          pending = pending.filter(p => p.guildId !== guildId);
          fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));

          const embed = new EmbedBuilder()
            .setTitle('✅ LÖSCHUNG ABGEBROCHEN')
            .setDescription(
              `Die geplante Daten-Löschung wurde erfolgreich abgebrochen.\n\n` +
              `**Alle Daten bleiben erhalten:**\n` +
              `• Konfigurationsdateien\n` +
              `• Tickets und deren Daten\n` +
              `• Ticket-Transkripte\n\n` +
              `Der Bot bleibt auf diesem Server.\n\n` +
              `**Abgebrochen von:** <@${i.user.id}>`
            )
            .setColor(0x00ff88)
            .setFooter({ text: COPYRIGHT })
            .setTimestamp();

          await i.update({ content: '@everyone', embeds: [embed], components: [] });

          console.log(`✅ Deletion cancelled for ${guildId} by user ${i.user.id}`);

          await logEvent(i.guild, `✅ Geplante Daten-Löschung abgebrochen von <@${i.user.id}>`);
        } catch(err){
          console.error('Error cancelling deletion:', err);
          return i.reply({ephemeral:true,content:'❌ Fehler beim Abbrechen der Löschung'});
        }
        return;
      }

      // Application System: Accept Button Handler
      if(i.customId.startsWith('accept_application_')){
        const guildId = i.customId.replace('accept_application_', '');
        const cfg = readCfg(guildId);

        // Find application ticket
        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.channelId === i.channel.id && t.isApplication === true);

        if(!ticket){
          return i.reply({ephemeral:true,content:'❌ Dieses Ticket wurde nicht gefunden.'});
        }

        // Check if user has team role
        const hasTeamRole = hasAnyTeamRole(i.member, guildId);
        if(!hasTeamRole){
          return i.reply({
            ephemeral:true,
            content:'❌ Nur Team-Mitglieder können Bewerbungen annehmen.'
          });
        }

        // Get all server roles for dropdown
        await i.guild.roles.fetch();
        const botMember = await i.guild.members.fetchMe().catch(() => null);
        const botHighestPosition = botMember?.roles?.highest?.position || 0;

        const roleOptions = Array.from(i.guild.roles.cache.values())
          .filter(role => role.id !== i.guild.id && !role.managed && role.position < botHighestPosition)
          .sort((a,b) => b.position - a.position)
          .slice(0, 25) // Max 25 options
          .map(role => ({
            label: role.name.substring(0, 100),
            value: role.id
          }));

        if(roleOptions.length === 0){
          return i.reply({
            ephemeral:true,
            content:'❌ Keine Rollen verfügbar zum Zuweisen.'
          });
        }

        // Show modal with role selection
        const modal = new ModalBuilder()
          .setCustomId(`modal_accept_application:${guildId}:${ticket.id}`)
          .setTitle('Bewerbung annehmen');

        const roleInput = new TextInputBuilder()
          .setCustomId('role_name')
          .setLabel('Rollenname (welche Rolle vergeben?)')
          .setPlaceholder('z.B. Team-Mitglied')
          .setRequired(true)
          .setStyle(TextInputStyle.Short);

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Grund (optional)')
          .setPlaceholder('z.B. Sehr gute Bewerbung, passende Qualifikationen')
          .setRequired(false)
          .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(
          new ActionRowBuilder().addComponents(roleInput),
          new ActionRowBuilder().addComponents(reasonInput)
        );

        return i.showModal(modal);
      }

      // Application System: Reject Button Handler
      if(i.customId.startsWith('reject_application_')){
        const guildId = i.customId.replace('reject_application_', '');
        const cfg = readCfg(guildId);

        // Find application ticket
        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.channelId === i.channel.id && t.isApplication === true);

        if(!ticket){
          return i.reply({ephemeral:true,content:'❌ Dieses Ticket wurde nicht gefunden.'});
        }

        // Check if user has team role
        const hasTeamRole = hasAnyTeamRole(i.member, guildId);
        if(!hasTeamRole){
          return i.reply({
            ephemeral:true,
            content:'❌ Nur Team-Mitglieder können Bewerbungen ablehnen.'
          });
        }

        // Show modal with reason
        const modal = new ModalBuilder()
          .setCustomId(`modal_reject_application:${guildId}:${ticket.id}`)
          .setTitle('Bewerbung ablehnen');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Ablehnungsgrund (optional)')
          .setPlaceholder('z.B. Bewerbung entspricht nicht unseren Anforderungen')
          .setRequired(false)
          .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(
          new ActionRowBuilder().addComponents(reasonInput)
        );

        return i.showModal(modal);
      }

      // Rating System: Handle star ratings
      if(i.customId.startsWith('rate_')){
        const [_, rating, ticketId] = i.customId.split(/[_:]/);
        const stars = parseInt(rating);

        // Find ticket across all guilds
        let foundGuildId = null;
        let foundTicket = null;

        for (const guild of client.guilds.cache.values()) {
          const guildTickets = loadTickets(guild.id);
          const ticket = guildTickets.find(t => t.id === parseInt(ticketId) && t.userId === i.user.id);
          if (ticket) {
            foundGuildId = guild.id;
            foundTicket = ticket;
            break;
          }
        }

        if (!foundTicket) {
          return i.reply({
            content: '❌ Ticket nicht gefunden oder du bist nicht der Ersteller dieses Tickets.',
            ephemeral: true
          });
        }

        // Check if already rated
        if (foundTicket.rating) {
          return i.reply({
            content: '⚠️ Du hast dieses Ticket bereits bewertet!',
            ephemeral: true
          });
        }

        const cfg = readCfg(foundGuildId);

        // Show feedback modal if enabled
        if (cfg.ticketRating && cfg.ticketRating.requireFeedback) {
          const modal = new ModalBuilder()
            .setCustomId(`rating_feedback:${ticketId}:${stars}`)
            .setTitle(`Bewertung: ${stars} ⭐`);

          const feedbackInput = new TextInputBuilder()
            .setCustomId('feedback_text')
            .setLabel('Was können wir besser machen?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Dein Feedback hilft uns, besser zu werden...')
            .setRequired(true)
            .setMaxLength(1000);

          const row = new ActionRowBuilder().addComponents(feedbackInput);
          modal.addComponents(row);

          return i.showModal(modal);
        } else {
          // Save rating without feedback
          const guildTickets = loadTickets(foundGuildId);
          const ticketIndex = guildTickets.findIndex(t => t.id === parseInt(ticketId));

          if (ticketIndex !== -1) {
            guildTickets[ticketIndex].rating = {
              stars: stars,
              feedback: null,
              ratedAt: Date.now(),
              ratedBy: i.user.id
            };
            saveTickets(foundGuildId, guildTickets);

            const thankYouEmbed = new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('✅ Vielen Dank für deine Bewertung!')
              .setDescription(
                `Du hast **${stars} ${'⭐'.repeat(stars)}** vergeben.\n\n` +
                `Dein Feedback hilft uns, unseren Service zu verbessern!`
              )
              .addFields(
                { name: '🎫 Ticket', value: `#${ticketId}`, inline: true },
                { name: '⭐ Bewertung', value: `${stars}/5 Sterne`, inline: true }
              )
              .setFooter({ text: 'Quantix Tickets • Danke für dein Feedback!' })
              .setTimestamp();

            await i.update({ embeds: [thankYouEmbed], components: [] });

            // Notify team in log channel
            try {
              const guild = client.guilds.cache.get(foundGuildId);
              if (guild) {
                await logEvent(guild, `⭐ Ticket #${ticketId} wurde mit ${stars}/5 Sternen bewertet`);
              }
            } catch (err) {
              console.error('Fehler beim Loggen der Bewertung:', err);
            }
          }
        }
        return;
      }

      // Survey System Response Handler
      if(i.customId.startsWith('survey:')){
        const parts = i.customId.split(':');
        const ticketId = parts[1];
        const questionIndex = parseInt(parts[2]);
        const answer = parts[3];

        // Find ticket across all guilds
        let foundGuildId = null;
        let foundTicket = null;

        for (const guild of client.guilds.cache.values()) {
          const guildTickets = loadTickets(guild.id);
          const ticket = guildTickets.find(t => t.id === parseInt(ticketId) && t.userId === i.user.id);
          if (ticket) {
            foundGuildId = guild.id;
            foundTicket = ticket;
            break;
          }
        }

        if (!foundTicket) {
          return i.reply({
            content: t(null, 'surveys.not_found'),
            ephemeral: true
          });
        }

        // Check if already submitted
        if (foundTicket.survey && foundTicket.survey.completed) {
          return i.reply({
            content: t(foundGuildId, 'surveys.already_submitted'),
            ephemeral: true
          });
        }

        const cfg = readCfg(foundGuildId);
        const { getSurveyQuestions, createQuestionComponents } = require('./survey-system');
        const questions = getSurveyQuestions(cfg, foundTicket.topic);

        if (questionIndex >= questions.length) {
          return i.reply({ content: '❌ Ungültige Frage', ephemeral: true });
        }

        const currentQuestion = questions[questionIndex];
        const lang = cfg.language || 'de';

        // Initialize survey if not exists
        if (!foundTicket.survey) {
          foundTicket.survey = {
            responses: [],
            startedAt: Date.now(),
            completed: false
          };
        }

        // Save response
        foundTicket.survey.responses.push({
          questionId: currentQuestion.id,
          questionText: currentQuestion.text[lang] || currentQuestion.text.de,
          type: currentQuestion.type,
          value: answer === 'yes' ? true : answer === 'no' ? false : (isNaN(answer) ? answer : parseInt(answer)),
          answeredAt: Date.now()
        });

        const guildTickets = loadTickets(foundGuildId);
        const ticketIndex = guildTickets.findIndex(t => t.id === parseInt(ticketId));
        if (ticketIndex !== -1) {
          guildTickets[ticketIndex] = foundTicket;
          saveTickets(foundGuildId, guildTickets);
        }

        // Check if more questions
        const nextQuestionIndex = questionIndex + 1;

        if (nextQuestionIndex < questions.length) {
          // Send next question
          const nextQuestion = questions[nextQuestionIndex];
          const nextEmbed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle(t(foundGuildId, 'surveys.dm_title'))
            .setDescription(t(foundGuildId, 'surveys.dm_description', { ticketId: String(foundTicket.id).padStart(5, '0') }))
            .addFields({
              name: `📋 ${nextQuestion.text[lang] || nextQuestion.text.de}`,
              value: getQuestionScaleText(nextQuestion.type, lang, foundGuildId),
              inline: false
            })
            .setFooter({ text: `Quantix Tickets • Frage ${nextQuestionIndex + 1} von ${questions.length}` })
            .setTimestamp();

          const nextComponents = createQuestionComponents(nextQuestion, ticketId, nextQuestionIndex, foundGuildId);

          await i.update({ embeds: [nextEmbed], components: nextComponents });
        } else {
          // Survey complete!
          foundTicket.survey.completed = true;
          foundTicket.survey.completedAt = Date.now();

          const updatedTickets = loadTickets(foundGuildId);
          const idx = updatedTickets.findIndex(t => t.id === parseInt(ticketId));
          if (idx !== -1) {
            updatedTickets[idx] = foundTicket;
            saveTickets(foundGuildId, updatedTickets);
          }

          const thankYouEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle(t(foundGuildId, 'surveys.thank_you'))
            .setDescription(t(foundGuildId, 'surveys.thank_you_description'))
            .addFields(
              { name: '🎫 Ticket', value: `#${String(ticketId).padStart(5, '0')}`, inline: true },
              { name: '📊 Antworten', value: `${foundTicket.survey.responses.length}`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Danke für dein Feedback!' })
            .setTimestamp();

          await i.update({ embeds: [thankYouEmbed], components: [] });

          // Notify team in log channel
          try {
            const guild = client.guilds.cache.get(foundGuildId);
            if (guild) {
              const ratingResponse = foundTicket.survey.responses.find(r => r.type === 'rating');
              const npsResponse = foundTicket.survey.responses.find(r => r.type === 'nps');

              let logMsg = `📋 Survey für Ticket #${ticketId} ausgefüllt`;
              if (ratingResponse) logMsg += ` | ⭐ ${ratingResponse.value}/5`;
              if (npsResponse) logMsg += ` | NPS: ${npsResponse.value}/10`;

              await logEvent(guild, logMsg);
            }
          } catch (err) {
            console.error('Fehler beim Loggen der Survey:', err);
          }
        }

        // Helper function (imported from survey-system)
        function getQuestionScaleText(type, lang, guildId) {
          const { getQuestionScaleText: getScale } = require('./survey-system');
          return getScale(type, lang, guildId);
        }

        return;
      }

      // Survey Text Input Handler
      if(i.customId.startsWith('survey_text:')){
        const parts = i.customId.split(':');
        const ticketId = parts[1];
        const questionIndex = parseInt(parts[2]);

        // Find ticket
        let foundGuildId = null;
        let foundTicket = null;

        for (const guild of client.guilds.cache.values()) {
          const guildTickets = loadTickets(guild.id);
          const ticket = guildTickets.find(t => t.id === parseInt(ticketId) && t.userId === i.user.id);
          if (ticket) {
            foundGuildId = guild.id;
            foundTicket = ticket;
            break;
          }
        }

        if (!foundTicket) {
          return i.reply({ content: t(null, 'surveys.not_found'), ephemeral: true });
        }

        const cfg = readCfg(foundGuildId);
        const { getSurveyQuestions } = require('./survey-system');
        const questions = getSurveyQuestions(cfg, foundTicket.topic);
        const currentQuestion = questions[questionIndex];
        const lang = cfg.language || 'de';

        // Show text input modal
        const modal = new ModalBuilder()
            .setCustomId(`survey_text_submit:${ticketId}:${questionIndex}`)
            .setTitle('Feedback');

        const textInput = new TextInputBuilder()
            .setCustomId('feedback_text')
            .setLabel(currentQuestion.text[lang] || currentQuestion.text.de)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(t(foundGuildId, 'surveys.feedback_placeholder'))
            .setRequired(currentQuestion.required || false)
            .setMaxLength(currentQuestion.maxLength || 1000);

        const row = new ActionRowBuilder().addComponents(textInput);
        modal.addComponents(row);

        return i.showModal(modal);
      }

      const guildId = i.guild.id;
      const log = loadTickets(guildId);
      const ticket = log.find(t=>t.channelId===i.channel.id);

      if(!ticket) {
        const noTicketEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Kein Ticket gefunden')
          .setDescription(
            '**Für diesen Channel wurde kein Ticket-Datensatz gefunden.**\n\n' +
            'Dieser Channel scheint kein gültiges Ticket zu sein.'
          )
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();
        return i.reply({ embeds: [noTicketEmbed], ephemeral: true });
      }

      const TEAM_ROLE = getTeamRole(guildId);
      const isTeam = hasAnyTeamRole(i.member, guildId);
      const isCreator = ticket.userId === i.user.id;
      const isClaimer = ticket.claimer === i.user.id;

      if(i.customId==='request_close'){
        // Bestimme wer die Anfrage stellt
        const requesterType = isCreator || (ticket.addedUsers && ticket.addedUsers.includes(i.user.id)) ? 'user' : 'team';

        // Speichere Schließungsanfrage im Ticket
        if (!ticket.closeRequest) ticket.closeRequest = {};
        ticket.closeRequest = {
          requestedBy: i.user.id,
          requesterType: requesterType,
          requestedAt: Date.now(),
          status: 'pending'
        };
        saveTickets(guildId, log);

        const requestEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('📩 Schließungsanfrage')
          .setDescription(
            requesterType === 'user'
              ? `<@${i.user.id}> möchte dieses Ticket schließen lassen.\n\n**Ein Team-Mitglied oder Claimer muss bestätigen.**`
              : `<@${i.user.id}> (Team) möchte dieses Ticket schließen.\n\n**Der Ticket-Ersteller muss bestätigen.**`
          )
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👤 Angefordert von', value: `<@${i.user.id}>`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Schließungsanfrage' })
          .setTimestamp();

        const closeButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('approve_close_request')
            .setEmoji('✅')
            .setLabel('Bestätigen')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('deny_close_request')
            .setEmoji('❌')
            .setLabel('Ablehnen')
            .setStyle(ButtonStyle.Danger)
        );

        const requestMessage = await i.channel.send({ embeds: [requestEmbed], components: [closeButtons] });
        ticket.closeRequest.messageId = requestMessage.id; // Speichere Message-ID
        saveTickets(guildId, log);
        logEvent(i.guild, t(guildId, 'logs.close_requested', { id: ticket.id, user: `<@${i.user.id}>` }));

        const confirmEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setDescription(
            requesterType === 'user'
              ? '✅ **Schließungsanfrage erfolgreich gesendet!**\n\nEin Team-Mitglied wird deine Anfrage prüfen.'
              : '✅ **Schließungsanfrage erfolgreich gesendet!**\n\nDer Ticket-Ersteller muss zustimmen.'
          )
          .setFooter({ text: 'Quantix Tickets' })
          .setTimestamp();

        return i.reply({ embeds: [confirmEmbed], ephemeral: true });
      }

      // Voice-Support Button Handler
      if (i.customId === 'request_voice') {
        if (!hasFeature(guildId, 'voiceSupport')) {
          const premiumEmbed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('⭐ Premium Feature')
            .setDescription(t(guildId, 'voiceSupport.feature_locked'))
            .setFooter({ text: 'Quantix Tickets • Premium' })
            .setTimestamp();
          return i.reply({ embeds: [premiumEmbed], ephemeral: true });
        }

        // Nur Team kann Voice-Channels erstellen
        if (!isTeam) {
          const noPermEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚫 Zugriff verweigert')
            .setDescription(
              '**Das hier darf nur das Team machen!**\n\n' +
              'Nur Team-Mitglieder können Voice-Channels erstellen.'
            )
            .addFields(
              {
                name: '🏷️ Benötigte Berechtigung',
                value: 'Team-Rolle',
                inline: true
              },
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
            .setTimestamp();
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        if (hasVoiceChannel(ticket)) {
          return i.reply({
            content: t(guildId, 'voiceSupport.already_exists'),
            ephemeral: true
          });
        }

        try {
          await i.deferReply({ ephemeral: true });
          const voiceChannel = await createVoiceChannel(i, ticket, guildId);

          const successEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('🎤 ' + t(guildId, 'voiceSupport.channel_created'))
            .setDescription(t(guildId, 'voiceSupport.channel_description', { channel: `<#${voiceChannel.id}>` }))
            .setFooter({ text: 'Quantix Tickets • Voice Support' })
            .setTimestamp();

          await i.editReply({ embeds: [successEmbed] });

          // Lade Ticket neu, damit voiceChannelId aktualisiert ist
          const updatedTickets = loadTickets(guildId);
          const updatedTicket = updatedTickets.find(t => t.id === ticket.id);

          console.log(`🔍 Voice created - Ticket #${ticket.id} voiceChannelId:`, updatedTicket?.voiceChannelId);

          // Aktualisiere Ticket-Embed mit neuen Buttons (zeigt jetzt "Voice beenden")
          if (updatedTicket) {
            const ticketEmbed = i.message.embeds[0];
            await i.message.edit({
              embeds: [ticketEmbed],
              components: buttonRows(updatedTicket.claimedBy ? true : false, guildId, updatedTicket)
            });
            console.log(`✅ Buttons updated for ticket #${ticket.id}`);
          } else {
            console.error(`❌ Could not find updated ticket #${ticket.id}`);
          }

          // Sende Log-Nachricht über Voice-Channel-Erstellung
          const voiceLogEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setDescription(`🎤 **Voice-Support erstellt** von ${i.user}`)
            .addFields(
              { name: '🔊 Channel', value: `<#${voiceChannel.id}>`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Voice Support' })
            .setTimestamp();

          await i.channel.send({ embeds: [voiceLogEmbed] });
        } catch (err) {
          console.error('Error creating voice channel:', err);
          await i.editReply({
            content: t(guildId, 'voiceSupport.create_failed'),
            ephemeral: true
          }).catch(() => {});
        }
        return;
      }

      // Voice-Support beenden
      if (i.customId === 'end_voice') {
        if (!hasFeature(guildId, 'voiceSupport')) {
          const premiumEmbed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('⭐ Premium Feature')
            .setDescription(t(guildId, 'voiceSupport.feature_locked'))
            .setFooter({ text: 'Quantix Tickets • Premium' })
            .setTimestamp();
          return i.reply({ embeds: [premiumEmbed], ephemeral: true });
        }

        // Nur Team kann Voice-Channels beenden
        if (!isTeam) {
          const noPermEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚫 Zugriff verweigert')
            .setDescription(
              '**Das hier darf nur das Team machen!**\n\n' +
              'Nur Team-Mitglieder können Voice-Channels beenden.'
            )
            .addFields(
              {
                name: '🏷️ Benötigte Berechtigung',
                value: 'Team-Rolle',
                inline: true
              },
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
            .setTimestamp();
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        if (!ticket.voiceChannelId) {
          return i.reply({
            content: '❌ Kein Voice-Channel vorhanden!',
            ephemeral: true
          });
        }

        try {
          await i.deferReply({ ephemeral: true });

          // Lösche Voice-Channel
          await deleteVoiceChannel(i.guild, ticket.voiceChannelId, guildId);

          const successEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🔇 ' + t(guildId, 'voiceSupport.ended'))
            .setDescription(t(guildId, 'voiceSupport.ended_description'))
            .setFooter({ text: 'Quantix Tickets • Voice Support' })
            .setTimestamp();

          await i.editReply({ embeds: [successEmbed] });

          // Lade Ticket neu, damit voiceChannelId auf null gesetzt ist
          const updatedTickets = loadTickets(guildId);
          const updatedTicket = updatedTickets.find(t => t.id === ticket.id);

          // Aktualisiere Ticket-Embed mit neuen Buttons (zeigt jetzt wieder "Voice-Support")
          const ticketEmbed = i.message.embeds[0];
          await i.message.edit({
            embeds: [ticketEmbed],
            components: buttonRows(updatedTicket.claimedBy ? true : false, guildId, updatedTicket)
          });

          // Sende Log-Nachricht über Voice-Channel-Schließung
          const voiceLogEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setDescription(`🔇 **Voice-Support beendet** von ${i.user}`)
            .setFooter({ text: 'Quantix Tickets • Voice Support' })
            .setTimestamp();

          await i.channel.send({ embeds: [voiceLogEmbed] });
        } catch (err) {
          console.error('Error ending voice channel:', err);
          await i.editReply({
            content: '❌ Voice-Channel konnte nicht gelöscht werden.',
            ephemeral: true
          }).catch(() => {});
        }
        return;
      }

      // Schließungsanfrage bestätigen
      if (i.customId === 'approve_close_request') {
        if (!ticket.closeRequest || ticket.closeRequest.status !== 'pending') {
          return i.reply({ content: '❌ Keine aktive Schließungsanfrage vorhanden.', ephemeral: true });
        }

        const requesterType = ticket.closeRequest.requesterType;
        const canApprove = (requesterType === 'user' && (isTeam || isClaimer)) ||
                          (requesterType === 'team' && isCreator);

        if (!canApprove) {
          const errorMsg = requesterType === 'user'
            ? 'Nur Team-Mitglieder oder der Claimer können diese Anfrage bestätigen.'
            : 'Nur der Ticket-Ersteller kann diese Anfrage bestätigen.';
          return i.reply({ content: `❌ ${errorMsg}`, ephemeral: true });
        }

        // Schließungsanfrage genehmigt - Ticket schließen
        ticket.closeRequest.status = 'approved';
        ticket.closeRequest.approvedBy = i.user.id;
        ticket.closeRequest.approvedAt = Date.now();
        ticket.status = 'geschlossen';
        ticket.closedAt = Date.now();
        if (!ticket.statusHistory) ticket.statusHistory = [];
        ticket.statusHistory.push({
          status: 'geschlossen',
          timestamp: Date.now(),
          userId: i.user.id,
          approvedCloseRequest: true
        });
        saveTickets(guildId, log);

        // DM Benachrichtigung an Ersteller
        if (cfg.notifyUserOnStatusChange !== false) {
          try {
            const creator = await client.users.fetch(ticket.userId).catch(() => null);
            if (creator) {
              const dmEmbed = new EmbedBuilder()
                .setColor(0xff4444)
                .setTitle('🔐 Ticket geschlossen')
                .setDescription(
                  `Dein Ticket wurde geschlossen.\n\n` +
                  `**Server:** ${i.guild.name}\n` +
                  `**Ticket:** #${String(ticket.id).padStart(5, '0')}\n` +
                  `**Thema:** ${ticket.topic}\n` +
                  `**Geschlossen durch Zustimmung von:** ${i.user.tag}`
                )
                .setFooter({ text: `Quantix Tickets • ${i.guild.name}` })
                .setTimestamp();

              await creator.send({ embeds: [dmEmbed] }).catch(() => {});
            }
          } catch (dmErr) {
            console.error('DM notification error on ticket close:', dmErr);
          }
        }

        const closer = await i.guild.members.fetch(i.user.id).catch(() => null);
        const closerTag = sanitizeUsername(closer?.user?.tag || i.user.tag || i.user.username || i.user.id);
        const closerName = sanitizeUsername(closer?.displayName || closerTag);
        const roleObj = TEAM_ROLE ? await i.guild.roles.fetch(TEAM_ROLE).catch(() => null) : null;
        const teamLabel = roleObj ? `@${roleObj.name}` : '@Team';

        await i.reply({ ephemeral: true, content: '🔐 Ticket wird geschlossen…' });

        // Deaktiviere die Buttons der ursprünglichen Schließungsanfrage
        if (ticket.closeRequest.messageId) {
          try {
            const requestMsg = await i.channel.messages.fetch(ticket.closeRequest.messageId);
            const disabledButtons = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('approve_close_request_disabled')
                .setEmoji('✅')
                .setLabel('Bestätigt')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('deny_close_request_disabled')
                .setEmoji('❌')
                .setLabel('Ablehnen')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            );
            await requestMsg.edit({ components: [disabledButtons] });
          } catch (err) {
            console.error('Error disabling close request buttons:', err);
          }
        }

        const closeEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Schließungsanfrage genehmigt')
          .setDescription(
            `Die Schließungsanfrage wurde von **${closerName}** genehmigt.\n\n` +
            `Ticket wird geschlossen.\n\n` +
            `**Angefordert von:** <@${ticket.closeRequest.requestedBy}>\n` +
            `**Genehmigt von:** <@${i.user.id}>`
          )
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
          )
          .setFooter({ text: 'Quantix Tickets • Ticket geschlossen' })
          .setTimestamp();

        await i.channel.send({ embeds: [closeEmbed] });

        let files = null;
        try {
          files = await createTranscript(i.channel, ticket, { resolveMentions: true });
        } catch {}

        // Transcripts senden
        const transcriptChannelIds = Array.isArray(cfg.transcriptChannelId) && cfg.transcriptChannelId.length > 0
          ? cfg.transcriptChannelId
          : (cfg.transcriptChannelId ? [cfg.transcriptChannelId] : (Array.isArray(cfg.logChannelId) ? cfg.logChannelId : (cfg.logChannelId ? [cfg.logChannelId] : [])));

        if (transcriptChannelIds.length > 0 && files) {
          const transcriptUrl = PANEL_FIXED_URL.replace('/panel', `/transcript/${ticket.id}`);
          const transcriptButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setURL(transcriptUrl)
              .setStyle(ButtonStyle.Link)
              .setLabel('📄 Transcript ansehen')
          );

          for (const channelId of transcriptChannelIds) {
            try {
              const tc = await i.guild.channels.fetch(channelId);
              if (tc) {
                await tc.send({
                  content: `📁 Transcript Ticket #${ticket.id}`,
                  files: [files.txt, files.html],
                  components: [transcriptButton]
                });
              }
            } catch (err) {
              console.error(`Transcript-Channel ${channelId} nicht gefunden:`, err.message);
            }
          }
        }

        logEvent(i.guild, `🔐 Ticket **#${ticket.id}** geschlossen durch Zustimmung von ${closerTag}`);

        // Send rating/survey request DM
        try {
          const user = await client.users.fetch(ticket.userId).catch(() => null);
          if (user) {
            // Check if new Survey System is enabled (replaces old rating system)
            if (cfg.surveySystem && cfg.surveySystem.enabled && cfg.surveySystem.sendOnClose) {
              // Use new Survey System
              const { sendSurveyDM } = require('./survey-system');
              await sendSurveyDM(user, ticket, guildId, cfg);
              console.log(`✅ Survey DM sent to ${user.tag} for ticket #${ticket.id}`);
            } else if (!cfg.ticketRating || cfg.ticketRating.enabled !== false) {
              // Use old Rating System (backwards compatibility)
              const ratingEmbed = new EmbedBuilder()
                .setColor(0x3b82f6)
                .setTitle('⭐ Wie war deine Support-Erfahrung?')
                .setDescription(
                  `Dein Ticket **#${ticket.id}** wurde geschlossen.\n\n` +
                  `Bitte bewerte deinen Support, damit wir uns verbessern können!`
                )
                .addFields(
                  { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
                  { name: '📋 Thema', value: ticket.topic || 'Unbekannt', inline: true }
                )
                .setFooter({ text: 'Quantix Tickets • Deine Meinung zählt!' })
                .setTimestamp();

              const ratingButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`rate_1:${ticket.id}`)
                  .setLabel('⭐')
                  .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                  .setCustomId(`rate_2:${ticket.id}`)
                  .setLabel('⭐⭐')
                  .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                  .setCustomId(`rate_3:${ticket.id}`)
                  .setLabel('⭐⭐⭐')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`rate_4:${ticket.id}`)
                  .setLabel('⭐⭐⭐⭐')
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`rate_5:${ticket.id}`)
                  .setLabel('⭐⭐⭐⭐⭐')
                  .setStyle(ButtonStyle.Success)
              );

              await user.send({ embeds: [ratingEmbed], components: [ratingButtons] });
              console.log(`✅ Bewertungs-DM gesendet an User ${user.tag} für Ticket #${ticket.id}`);
            }
          }
        } catch (dmErr) {
          console.log('Konnte Rating/Survey-DM nicht senden:', dmErr.message);
        }

        // Lösche Voice-Channel falls vorhanden
        if (ticket.voiceChannelId) {
          try {
            await deleteVoiceChannel(i.guild, ticket.voiceChannelId, guildId);
          } catch (voiceErr) {
            console.error('Error deleting voice channel on ticket close:', voiceErr);
          }
        }

        // Archiv oder Löschen
        setTimeout(async () => {
          if (cfg.archiveEnabled && cfg.archiveCategoryId) {
            try {
              // Setze Berechtigungen so, dass nur Team Zugriff hat (nicht Creator oder addedUsers)
              const archivePermissions = [
                {
                  id: i.guild.id,
                  deny: [PermissionsBitField.Flags.ViewChannel]
                }
              ];

              // Team-Rolle: Lesen erlauben, Schreiben verbieten
              const TEAM_ROLE = getTeamRole(guildId);
              if (TEAM_ROLE && TEAM_ROLE.trim()) {
                try {
                  await i.guild.roles.fetch(TEAM_ROLE);
                  archivePermissions.push({
                    id: TEAM_ROLE,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                    deny: [PermissionsBitField.Flags.SendMessages]
                  });
                } catch {
                  console.error('Team-Rolle nicht gefunden:', TEAM_ROLE);
                }
              }

              // Priority-Rollen: Auch Zugriff erlauben (nur lesen)
              const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, ticket.priority || 0);
              for (const roleId of hierarchicalRoles) {
                if (roleId && roleId.trim()) {
                  try {
                    await i.guild.roles.fetch(roleId);
                    archivePermissions.push({
                      id: roleId,
                      allow: [PermissionsBitField.Flags.ViewChannel],
                      deny: [PermissionsBitField.Flags.SendMessages]
                    });
                  } catch {
                    console.error('Priority-Rolle nicht gefunden:', roleId);
                  }
                }
              }

              // Entferne Zugriff für Creator und addedUsers
              await i.channel.permissionOverwrites.set(archivePermissions);

              // Verschiebe Channel in Archiv-Kategorie
              await i.channel.setParent(cfg.archiveCategoryId, {
                lockPermissions: false
              });

              // Benenne Channel um zu "closed-ticket-####"
              const newName = `closed-${i.channel.name}`;
              await i.channel.setName(newName);

              console.log(`✅ Ticket #${ticket.id} in Archiv verschoben (nur Team-Zugriff)`);
            } catch (err) {
              console.error('Fehler beim Archivieren:', err);
              // Fallback: Lösche Channel
              await i.channel.delete().catch(() => {});
            }
          } else {
            // Kein Archiv aktiv: Lösche Channel
            await i.channel.delete().catch(() => {});
          }
        }, 2500);
        return;
      }

      // Schließungsanfrage ablehnen
      if (i.customId === 'deny_close_request') {
        if (!ticket.closeRequest || ticket.closeRequest.status !== 'pending') {
          return i.reply({ content: '❌ Keine aktive Schließungsanfrage vorhanden.', ephemeral: true });
        }

        const requesterType = ticket.closeRequest.requesterType;
        const canDeny = (requesterType === 'user' && (isTeam || isClaimer)) ||
                       (requesterType === 'team' && isCreator);

        if (!canDeny) {
          const errorMsg = requesterType === 'user'
            ? 'Nur Team-Mitglieder oder der Claimer können diese Anfrage ablehnen.'
            : 'Nur der Ticket-Ersteller kann diese Anfrage ablehnen.';
          return i.reply({ content: `❌ ${errorMsg}`, ephemeral: true });
        }

        // Modal für optionalen Ablehnungsgrund
        const modal = new ModalBuilder()
          .setCustomId('deny_close_reason_modal')
          .setTitle('Schließungsanfrage ablehnen');

        const reasonInput = new TextInputBuilder()
          .setCustomId('deny_reason')
          .setLabel('Grund für die Ablehnung (optional)')
          .setPlaceholder('Warum wird die Schließungsanfrage abgelehnt?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);

        await i.showModal(modal);
        return;
      }

      if(i.customId==='unclaim'){
        if(!isClaimer) {
          const errorEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚫 Keine Berechtigung')
            .setDescription('**Du kannst dieses Ticket nicht freigeben.**\n\nNur der Team-Mitarbeiter, der das Ticket übernommen hat, kann es wieder freigeben.')
            .addFields(
              { name: '👤 Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht gesetzt', inline: true },
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
            .setTimestamp();
          return i.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
          const permissions = [
            { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ];

          if(ticket.addedUsers && Array.isArray(ticket.addedUsers)){
            ticket.addedUsers.forEach(uid => {
              permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
            });
          }

          // Team-Rolle wiederherstellen
          const TEAM_ROLE_UNCLAIM = getTeamRole(guildId);
          if(TEAM_ROLE_UNCLAIM && TEAM_ROLE_UNCLAIM.trim()){
            try {
              await i.guild.roles.fetch(TEAM_ROLE_UNCLAIM);
              permissions.push({ id: TEAM_ROLE_UNCLAIM, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
            } catch {}
          }

          // Priority-Rollen wiederherstellen (mit Schreibrechten)
          const currentPriority = ticket.priority || 0;
          const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, currentPriority);
          for(const roleId of hierarchicalRoles){
            if(roleId && roleId.trim() && roleId !== TEAM_ROLE_UNCLAIM){
              try {
                await i.guild.roles.fetch(roleId);
                permissions.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
              } catch {
                console.error('Priority-Rolle nicht gefunden:', roleId);
              }
            }
          }

          await i.channel.permissionOverwrites.set(permissions);

          const unclaimEmbed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('↩️ Ticket freigegeben')
            .setDescription(`<@${i.user.id}> hat das Ticket freigegeben.\n\nDas Ticket ist jetzt wieder für alle Team-Mitglieder verfügbar.`)
            .addFields(
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
              { name: '👤 Freigegeben von', value: `<@${i.user.id}>`, inline: true },
              { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Ticket freigegeben' })
            .setTimestamp();

          await i.channel.send({ embeds: [unclaimEmbed] });
        } catch(err) {
          console.error('Fehler beim Zurücksetzen der Berechtigungen:', err);
        }

        delete ticket.claimer; saveTickets(guildId, log);

        // Lade Ticket neu, um aktuelle voiceChannelId zu haben
        const updatedUnclaimLog = loadTickets(guildId);
        const updatedUnclaimTicket = updatedUnclaimLog.find(t => t.id === ticket.id);

        console.log(`🔍 Unclaim - Ticket #${ticket.id} voiceChannelId:`, updatedUnclaimTicket?.voiceChannelId);

        await i.update({ components: buttonRows(false, guildId, updatedUnclaimTicket) });
        logEvent(i.guild, t(guildId, 'logs.ticket_unclaimed', { id: ticket.id, user: `<@${i.user.id}>` }));
        return;
      }

      // Claim Button Handler - Ticket übernehmen
      if(i.customId === 'claim') {
        // Nur Team kann Tickets claimen
        if(!isTeam) {
          const noPermEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚫 Zugriff verweigert')
            .setDescription(
              '**Das hier darf nur das Team machen!**\n\n' +
              'Nur Team-Mitglieder können Tickets übernehmen.'
            )
            .addFields(
              {
                name: '🏷️ Benötigte Berechtigung',
                value: 'Team-Rolle',
                inline: true
              },
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
            .setTimestamp();
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        // Prüfe ob Ticket bereits geclaimed ist
        if(ticket.claimer) {
          const alreadyClaimedEmbed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('⚠️ Bereits übernommen')
            .setDescription(`**Dieses Ticket wurde bereits von <@${ticket.claimer}> übernommen.**`)
            .addFields(
              { name: '👤 Aktueller Claimer', value: `<@${ticket.claimer}>`, inline: true },
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets' })
            .setTimestamp();
          return i.reply({ embeds: [alreadyClaimedEmbed], ephemeral: true });
        }

        try {
          // Set permissions: Remove team role, only claimer + creator + added users
          const permissions = [
            { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] }
          ];

          // Add permissions for added users
          if(ticket.addedUsers && Array.isArray(ticket.addedUsers)){
            ticket.addedUsers.forEach(uid => {
              permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
            });
          }

          // Priority roles get VIEW permission only (no write)
          const currentPriority = ticket.priority || 0;
          const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, currentPriority);
          for(const roleId of hierarchicalRoles){
            if(roleId && roleId.trim()){
              try {
                await i.guild.roles.fetch(roleId);
                permissions.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] });
              } catch {
                console.error('Priority-Rolle nicht gefunden:', roleId);
              }
            }
          }

          await i.channel.permissionOverwrites.set(permissions);

          // Update ticket
          ticket.claimer = i.user.id;
          saveTickets(guildId, log);

          // Send claim notification WITH PING outside embed
          const claimEmbed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('✨ Ticket übernommen')
            .setDescription(`hat dieses Ticket übernommen und wird sich um dein Anliegen kümmern.`)
            .addFields(
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
              { name: '👤 Übernommen von', value: `<@${i.user.id}>`, inline: true },
              { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Claim' })
            .setTimestamp();

          await i.channel.send({
            content: `<@${i.user.id}>`,
            embeds: [claimEmbed]
          });

          // Update channel name with 🔒 emoji
          renameChannelIfNeeded(i.channel, ticket);

          // Reload ticket to get current voiceChannelId
          const updatedClaimLog = loadTickets(guildId);
          const updatedClaimTicket = updatedClaimLog.find(t => t.id === ticket.id);

          // Update buttons to show claimed state
          await i.update({ components: buttonRows(true, guildId, updatedClaimTicket) });
          logEvent(i.guild, t(guildId, 'logs.ticket_claimed', { id: ticket.id, user: `<@${i.user.id}>` }));
        } catch(err) {
          console.error('Error claiming ticket:', err);
          return i.reply({
            content: '❌ Fehler beim Übernehmen des Tickets.',
            ephemeral: true
          });
        }
        return;
      }

      if(!isTeam) {
        const cfg = readCfg(guildId);
        const teamRoleId = getTeamRole(guildId);
        const teamRole = teamRoleId ? await i.guild.roles.fetch(teamRoleId).catch(() => null) : null;

        const noPermEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Zugriff verweigert')
          .setDescription(
            '**Das hier darf nur das Team machen!**\n\n' +
            'Diese Aktion ist nur für Team-Mitglieder verfügbar.'
          )
          .addFields(
            {
              name: '🏷️ Benötigte Rolle',
              value: teamRole ? `<@&${teamRoleId}>` : 'Team-Rolle nicht konfiguriert',
              inline: true
            },
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return i.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      switch(i.customId){
        case 'claim':
          ticket.claimer = i.user.id; saveTickets(guildId, log);

          // Lade Ticket neu, um aktuelle voiceChannelId zu haben
          const updatedLog = loadTickets(guildId);
          const updatedTicket = updatedLog.find(t => t.id === ticket.id);

          console.log(`🔍 Claim - Ticket #${ticket.id} voiceChannelId:`, updatedTicket?.voiceChannelId);

          try {
            const permissions = [
              { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
              { id: updatedTicket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
              { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ];

            if(updatedTicket.addedUsers && Array.isArray(updatedTicket.addedUsers)){
              updatedTicket.addedUsers.forEach(uid => {
                permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
              });
            }

            // Priority-Rollen: Sehen aber nicht schreiben
            const currentPriority = updatedTicket.priority || 0;
            const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, currentPriority);
            for(const roleId of hierarchicalRoles){
              if(roleId && roleId.trim()){
                try {
                  await i.guild.roles.fetch(roleId);
                  permissions.push({
                    id: roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                    deny: [PermissionsBitField.Flags.SendMessages]
                  });
                } catch {
                  console.error('Priority-Rolle nicht gefunden:', roleId);
                }
              }
            }

            await i.channel.permissionOverwrites.set(permissions);

            const claimEmbed = new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('✨ Ticket übernommen')
              .setDescription(`<@${i.user.id}> hat das Ticket übernommen und wird sich um dein Anliegen kümmern.`)
              .addFields(
                { name: '🎫 Ticket', value: `#${updatedTicket.id}`, inline: true },
                { name: '👤 Übernommen von', value: `<@${i.user.id}>`, inline: true },
                { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
              )
              .setFooter({ text: 'Quantix Tickets • Ticket übernommen' })
              .setTimestamp();

            await i.channel.send({ embeds: [claimEmbed] });
          } catch(err) {
            console.error('Fehler beim Setzen der Berechtigungen:', err);
          }

          await i.update({ components: buttonRows(true, guildId, updatedTicket) });
          logEvent(i.guild, t(guildId, 'logs.ticket_claimed', { id: updatedTicket.id, user: `<@${i.user.id}>` }));
          break;
        case 'priority_up': {
          ticket.priority = Math.min(2, (ticket.priority||0)+1);
          await updatePriority(i, ticket, log, 'hoch', guildId);
          break;
        }
        case 'priority_down': {
          ticket.priority = Math.max(0, (ticket.priority||0)-1);
          await updatePriority(i, ticket, log, 'herab', guildId);
          break;
        }
        case 'add_user': {
          const modal = new ModalBuilder().setCustomId('modal_add_user').setTitle('Nutzer hinzufügen');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('user').setLabel('User @ oder ID').setRequired(true).setStyle(TextInputStyle.Short)
          ));
          return i.showModal(modal);
        }
        case 'close': {
          await i.deferReply({ ephemeral: true });

          ticket.status = 'geschlossen';
          ticket.closedAt = Date.now();
          ticket.closedBy = i.user.id;
          saveTickets(guildId, log);

          const closeEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🔐 Ticket wird geschlossen')
            .setDescription(`Dieses Ticket wird in wenigen Sekunden geschlossen und archiviert.`)
            .addFields(
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
              { name: '👤 Geschlossen von', value: `<@${i.user.id}>`, inline: true },
              { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Ticket geschlossen' })
            .setTimestamp();

          await i.channel.send({ embeds: [closeEmbed] });

          // Generate transcript
          await createTranscript(i.channel, ticket, { guildId });

          // Send rating/survey request DM (immer nach jedem Ticket)
          try {
            const cfg = readCfg(guildId);
            const user = await client.users.fetch(ticket.userId).catch(() => null);
            if (user) {
              // Check if new Survey System is enabled (replaces old rating system)
              if (cfg.surveySystem && cfg.surveySystem.enabled && cfg.surveySystem.sendOnClose) {
                // Use new Survey System
                const { sendSurveyDM } = require('./survey-system');
                await sendSurveyDM(user, ticket, guildId, cfg);
                console.log(`✅ Survey DM sent to ${user.tag} for ticket #${ticket.id}`);
              } else if (!cfg.ticketRating || cfg.ticketRating.enabled !== false) {
                // Use old Rating System (backwards compatibility)
                const ratingEmbed = new EmbedBuilder()
                  .setColor(0x3b82f6)
                  .setTitle('⭐ Wie war deine Support-Erfahrung?')
                  .setDescription(
                    `Dein Ticket **#${ticket.id}** wurde geschlossen.\n\n` +
                    `Bitte bewerte deinen Support, damit wir uns verbessern können!`
                  )
                  .addFields(
                    { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
                    { name: '📋 Thema', value: ticket.topic || 'Unbekannt', inline: true }
                  )
                  .setFooter({ text: 'Quantix Tickets • Deine Meinung zählt!' })
                  .setTimestamp();

                const ratingButtons = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`rate_1:${ticket.id}`)
                    .setLabel('⭐')
                    .setStyle(ButtonStyle.Danger),
                  new ButtonBuilder()
                    .setCustomId(`rate_2:${ticket.id}`)
                    .setLabel('⭐⭐')
                    .setStyle(ButtonStyle.Danger),
                  new ButtonBuilder()
                    .setCustomId(`rate_3:${ticket.id}`)
                    .setLabel('⭐⭐⭐')
                    .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                    .setCustomId(`rate_4:${ticket.id}`)
                    .setLabel('⭐⭐⭐⭐')
                    .setStyle(ButtonStyle.Success),
                  new ButtonBuilder()
                    .setCustomId(`rate_5:${ticket.id}`)
                    .setLabel('⭐⭐⭐⭐⭐')
                    .setStyle(ButtonStyle.Success)
                );

                await user.send({ embeds: [ratingEmbed], components: [ratingButtons] });
                console.log(`✅ Bewertungs-DM gesendet an User ${user.tag} für Ticket #${ticket.id}`);
              }
            }
          } catch (dmErr) {
            console.log('Konnte Bewertungs-DM nicht senden:', dmErr.message);
          }

          // Lösche Voice-Channel falls vorhanden
          if (ticket.voiceChannelId) {
            try {
              await deleteVoiceChannel(i.guild, ticket.voiceChannelId, guildId);
            } catch (voiceErr) {
              console.error('Error deleting voice channel on ticket close:', voiceErr);
            }
          }

          // Archiv oder Löschen
          setTimeout(async () => {
            if (cfg.archiveEnabled && cfg.archiveCategoryId) {
              try {
                // Setze Berechtigungen so, dass nur Team Zugriff hat (nicht Creator oder addedUsers)
                const archivePermissions = [
                  {
                    id: i.guild.id,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                  }
                ];

                // Team-Rolle: Lesen erlauben, Schreiben verbieten
                const TEAM_ROLE = getTeamRole(guildId);
                if (TEAM_ROLE && TEAM_ROLE.trim()) {
                  try {
                    await i.guild.roles.fetch(TEAM_ROLE);
                    archivePermissions.push({
                      id: TEAM_ROLE,
                      allow: [PermissionsBitField.Flags.ViewChannel],
                      deny: [PermissionsBitField.Flags.SendMessages]
                    });
                  } catch {
                    console.error('Team-Rolle nicht gefunden:', TEAM_ROLE);
                  }
                }

                // Priority-Rollen: Auch Zugriff erlauben (nur lesen)
                const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, ticket.priority || 0);
                for (const roleId of hierarchicalRoles) {
                  if (roleId && roleId.trim()) {
                    try {
                      await i.guild.roles.fetch(roleId);
                      archivePermissions.push({
                        id: roleId,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                        deny: [PermissionsBitField.Flags.SendMessages]
                      });
                    } catch {
                      console.error('Priority-Rolle nicht gefunden:', roleId);
                    }
                  }
                }

                // Entferne Zugriff für Creator und addedUsers
                await i.channel.permissionOverwrites.set(archivePermissions);

                // Verschiebe Channel in Archiv-Kategorie
                await i.channel.setParent(cfg.archiveCategoryId, {
                  lockPermissions: false
                });

                // Benenne Channel um zu "closed-ticket-####"
                const newName = `closed-${i.channel.name}`;
                await i.channel.setName(newName);

                console.log(`✅ Ticket #${ticket.id} in Archiv verschoben (nur Team-Zugriff)`);
              } catch (err) {
                console.error('Fehler beim Archivieren:', err);
                // Fallback: Lösche Channel
                await i.channel.delete().catch(() => {});
              }
            } else {
              // Kein Archiv aktiv: Lösche Channel
              try {
                await i.channel.delete();
              } catch (err) {
                console.error('Fehler beim Löschen des Channels:', err);
              }
            }
          }, 5000);

          await i.editReply({ content: '✅ Ticket wird geschlossen...', ephemeral: true });
          logEvent(i.guild, t(guildId, 'logs.ticket_closed', { id: ticket.id, user: `<@${i.user.id}>` }));
          break;
        }
      }
    }

    // Modal-Submit für Schließungsanfrage-Ablehnung
    if(i.isModalSubmit() && i.customId === 'deny_close_reason_modal') {
      const guildId = i.guild.id;
      const log = loadTickets(guildId);
      const ticket = log.find(t => t.channelId === i.channel.id);

      if (!ticket) {
        return i.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
      }

      const reason = i.fields.getTextInputValue('deny_reason') || 'Kein Grund angegeben';

      // Update ticket
      ticket.closeRequest.status = 'denied';
      ticket.closeRequest.deniedBy = i.user.id;
      ticket.closeRequest.deniedAt = Date.now();
      ticket.closeRequest.denyReason = reason;
      saveTickets(guildId, log);

      await i.reply({ content: '✅ Schließungsanfrage wurde abgelehnt.', ephemeral: true });

      // Disable buttons
      if (ticket.closeRequest.messageId) {
        try {
          const requestMsg = await i.channel.messages.fetch(ticket.closeRequest.messageId);

          const disabledApproveBtn = new ButtonBuilder()
            .setCustomId('approve_close_request_disabled')
            .setLabel('Genehmigen')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true);

          const disabledDenyBtn = new ButtonBuilder()
            .setCustomId('deny_close_request_disabled')
            .setLabel('Ablehnen')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true);

          const disabledRow = new ActionRowBuilder().addComponents(disabledApproveBtn, disabledDenyBtn);
          await requestMsg.edit({ components: [disabledRow] });
        } catch (err) {
          console.error('Fehler beim Deaktivieren der Buttons:', err);
        }
      }

      // Send denial message
      const denyEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Schließungsanfrage abgelehnt')
        .setDescription(`<@${i.user.id}> hat die Schließungsanfrage abgelehnt.`)
        .addFields(
          { name: '📝 Grund', value: reason, inline: false },
          { name: '⏰ Abgelehnt am', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Quantix Tickets • Schließungsanfrage abgelehnt' })
        .setTimestamp();

      await i.channel.send({ embeds: [denyEmbed] });

      // Notify requester
      const requesterEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Deine Schließungsanfrage wurde abgelehnt')
        .setDescription(`Deine Anfrage, Ticket #${ticket.id} zu schließen, wurde von einem Team-Mitglied abgelehnt.`)
        .addFields(
          { name: '📝 Grund', value: reason, inline: false },
          { name: '🎫 Ticket', value: `<#${i.channel.id}>`, inline: true }
        )
        .setFooter({ text: 'Quantix Tickets' })
        .setTimestamp();

      try {
        const requester = await i.guild.members.fetch(ticket.closeRequest.requestedBy);
        await requester.send({ embeds: [requesterEmbed] });
      } catch (err) {
        console.log('Konnte DM nicht senden an Requester:', err.message);
      }

      logEvent(i.guild, `🚫 Schließungsanfrage für Ticket #${ticket.id} wurde von <@${i.user.id}> abgelehnt. Grund: ${reason}`);
    }

    // Modal-Submit für Rating-Feedback
    if(i.isModalSubmit() && i.customId.startsWith('rating_feedback:')){
      const [_, ticketId, stars] = i.customId.split(':');
      const feedback = i.fields.getTextInputValue('feedback_text');

      // Find ticket across all guilds
      let foundGuildId = null;
      let foundTicket = null;

      for (const guild of client.guilds.cache.values()) {
        const guildTickets = loadTickets(guild.id);
        const ticket = guildTickets.find(t => t.id === parseInt(ticketId) && t.userId === i.user.id);
        if (ticket) {
          foundGuildId = guild.id;
          foundTicket = ticket;
          break;
        }
      }

      if (!foundTicket) {
        return i.reply({
          content: '❌ Ticket nicht gefunden.',
          ephemeral: true
        });
      }

      // Save rating with feedback
      const guildTickets = loadTickets(foundGuildId);
      const ticketIndex = guildTickets.findIndex(t => t.id === parseInt(ticketId));

      if (ticketIndex !== -1) {
        guildTickets[ticketIndex].rating = {
          stars: parseInt(stars),
          feedback: feedback,
          ratedAt: Date.now(),
          ratedBy: i.user.id
        };
        saveTickets(foundGuildId, guildTickets);

        const thankYouEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Vielen Dank für deine Bewertung!')
          .setDescription(
            `Du hast **${stars} ${'⭐'.repeat(parseInt(stars))}** vergeben.\n\n` +
            `Dein Feedback hilft uns, unseren Service zu verbessern!`
          )
          .addFields(
            { name: '🎫 Ticket', value: `#${ticketId}`, inline: true },
            { name: '⭐ Bewertung', value: `${stars}/5 Sterne`, inline: true },
            { name: '💬 Feedback', value: feedback.substring(0, 200) + (feedback.length > 200 ? '...' : ''), inline: false }
          )
          .setFooter({ text: 'Quantix Tickets • Danke für dein Feedback!' })
          .setTimestamp();

        await i.reply({ embeds: [thankYouEmbed], ephemeral: true });

        // Notify team in log channel
        try {
          const guild = client.guilds.cache.get(foundGuildId);
          if (guild) {
            const logEmbed = new EmbedBuilder()
              .setColor(0x3b82f6)
              .setTitle('⭐ Neue Ticket-Bewertung')
              .setDescription(`Ticket #${ticketId} wurde bewertet`)
              .addFields(
                { name: '⭐ Bewertung', value: `${stars}/5 Sterne`, inline: true },
                { name: '👤 Bewertet von', value: `<@${i.user.id}>`, inline: true },
                { name: '💬 Feedback', value: feedback.substring(0, 1000), inline: false }
              )
              .setTimestamp();

            await logEvent(guild, null, logEmbed);
          }
        } catch (err) {
          console.error('Fehler beim Loggen der Bewertung:', err);
        }
      }
    }

    // Modal-Submit für Survey Text Feedback
    if(i.isModalSubmit() && i.customId.startsWith('survey_text_submit:')){
      const [_, ticketId, questionIndex] = i.customId.split(':');
      const feedback = i.fields.getTextInputValue('feedback_text');

      // Find ticket across all guilds
      let foundGuildId = null;
      let foundTicket = null;

      for (const guild of client.guilds.cache.values()) {
        const guildTickets = loadTickets(guild.id);
        const ticket = guildTickets.find(t => t.id === parseInt(ticketId) && t.userId === i.user.id);
        if (ticket) {
          foundGuildId = guild.id;
          foundTicket = ticket;
          break;
        }
      }

      if (!foundTicket) {
        return i.reply({
          content: t(null, 'surveys.not_found'),
          ephemeral: true
        });
      }

      const cfg = readCfg(foundGuildId);
      const { getSurveyQuestions, createQuestionComponents } = require('./survey-system');
      const questions = getSurveyQuestions(cfg, foundTicket.topic);
      const currentQuestion = questions[parseInt(questionIndex)];
      const lang = cfg.language || 'de';

      // Initialize survey if not exists
      if (!foundTicket.survey) {
        foundTicket.survey = {
          responses: [],
          startedAt: Date.now(),
          completed: false
        };
      }

      // Save text response
      foundTicket.survey.responses.push({
        questionId: currentQuestion.id,
        questionText: currentQuestion.text[lang] || currentQuestion.text.de,
        type: currentQuestion.type,
        value: feedback,
        answeredAt: Date.now()
      });

      const guildTickets = loadTickets(foundGuildId);
      const ticketIndex = guildTickets.findIndex(t => t.id === parseInt(ticketId));
      if (ticketIndex !== -1) {
        guildTickets[ticketIndex] = foundTicket;
        saveTickets(foundGuildId, guildTickets);
      }

      // Check if more questions
      const nextQuestionIndex = parseInt(questionIndex) + 1;

      if (nextQuestionIndex < questions.length) {
        // Send next question
        const nextQuestion = questions[nextQuestionIndex];
        const nextEmbed = new EmbedBuilder()
          .setColor(0x3b82f6)
          .setTitle(t(foundGuildId, 'surveys.dm_title'))
          .setDescription(t(foundGuildId, 'surveys.dm_description', { ticketId: String(foundTicket.id).padStart(5, '0') }))
          .addFields({
            name: `📋 ${nextQuestion.text[lang] || nextQuestion.text.de}`,
            value: getQuestionScaleText(nextQuestion.type, lang, foundGuildId),
            inline: false
          })
          .setFooter({ text: `Quantix Tickets • Frage ${nextQuestionIndex + 1} von ${questions.length}` })
          .setTimestamp();

        const nextComponents = createQuestionComponents(nextQuestion, ticketId, nextQuestionIndex, foundGuildId);

        await i.reply({ embeds: [nextEmbed], components: nextComponents, ephemeral: false });
      } else {
        // Survey complete!
        foundTicket.survey.completed = true;
        foundTicket.survey.completedAt = Date.now();

        const updatedTickets = loadTickets(foundGuildId);
        const idx = updatedTickets.findIndex(t => t.id === parseInt(ticketId));
        if (idx !== -1) {
          updatedTickets[idx] = foundTicket;
          saveTickets(foundGuildId, updatedTickets);
        }

        const thankYouEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle(t(foundGuildId, 'surveys.thank_you'))
          .setDescription(t(foundGuildId, 'surveys.thank_you_description'))
          .addFields(
            { name: '🎫 Ticket', value: `#${String(ticketId).padStart(5, '0')}`, inline: true },
            { name: '📊 Antworten', value: `${foundTicket.survey.responses.length}`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Danke für dein Feedback!' })
          .setTimestamp();

        await i.reply({ embeds: [thankYouEmbed], ephemeral: false });

        // Notify team in log channel
        try {
          const guild = client.guilds.cache.get(foundGuildId);
          if (guild) {
            const ratingResponse = foundTicket.survey.responses.find(r => r.type === 'rating');
            const npsResponse = foundTicket.survey.responses.find(r => r.type === 'nps');

            let logMsg = `📋 Survey für Ticket #${ticketId} ausgefüllt`;
            if (ratingResponse) logMsg += ` | ⭐ ${ratingResponse.value}/5`;
            if (npsResponse) logMsg += ` | NPS: ${npsResponse.value}/10`;

            await logEvent(guild, logMsg);
          }
        } catch (err) {
          console.error('Fehler beim Loggen der Survey:', err);
        }
      }

      // Helper function
      function getQuestionScaleText(type, lang, guildId) {
        const { getQuestionScaleText: getScale } = require('./survey-system');
        return getScale(type, lang, guildId);
      }
    }

    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      const TEAM_ROLE = getTeamRole(i.guild.id);
      const isTeam = hasAnyTeamRole(i.member, i.guild.id);

      if(!isTeam) {
        const teamRole = TEAM_ROLE ? await i.guild.roles.fetch(TEAM_ROLE).catch(() => null) : null;
        const noPermEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Zugriff verweigert')
          .setDescription('**Das hier darf nur das Team machen!**\n\nNur Team-Mitglieder können Benutzer zu Tickets hinzufügen.')
          .addFields({
            name: '🏷️ Benötigte Rolle',
            value: teamRole ? `<@&${TEAM_ROLE}>` : 'Team-Rolle nicht konfiguriert',
            inline: true
          })
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();
        return i.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      const raw = i.fields.getTextInputValue('user').trim();
      const id = (raw.replace(/<@!?|>/g,'').match(/\d{17,20}/)||[])[0];

      if(!id) {
        const invalidEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Ungültige Eingabe')
          .setDescription(
            '**Die eingegebene User-ID oder Mention ist ungültig.**\n\n' +
            'Bitte gib eine gültige Discord User-ID oder @Mention ein.'
          )
          .addFields({
            name: '📝 Beispiele',
            value: '`•` @Username\n`•` 123456789012345678',
            inline: false
          })
          .setFooter({ text: 'Quantix Tickets • Ungültige Eingabe' })
          .setTimestamp();
        return i.reply({ embeds: [invalidEmbed], ephemeral: true });
      }

      try {
        await i.guild.members.fetch(id);

        const guildId = i.guild.id;
        const log = loadTickets(guildId);
        const ticket = log.find(t=>t.channelId===i.channel.id);

        if(!ticket) {
          const noTicketEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('❌ Kein Ticket gefunden')
            .setDescription('**Für diesen Channel wurde kein Ticket-Datensatz gefunden.**')
            .setFooter({ text: 'Quantix Tickets • Fehler' })
            .setTimestamp();
          return i.reply({ embeds: [noTicketEmbed], ephemeral: true });
        }

        if(!ticket.addedUsers) ticket.addedUsers = [];

        if(ticket.addedUsers.includes(id) || ticket.userId === id || ticket.claimer === id) {
          const alreadyAccessEmbed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('ℹ️ Bereits vorhanden')
            .setDescription(`**<@${id}> hat bereits Zugriff auf dieses Ticket.**`)
            .addFields(
              { name: '👤 User', value: `<@${id}>`, inline: true },
              { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
            )
            .setFooter({ text: 'Quantix Tickets • Zugriff bereits vorhanden' })
            .setTimestamp();
          return i.reply({ embeds: [alreadyAccessEmbed], ephemeral: true });
        }

        ticket.addedUsers.push(id);
        saveTickets(guildId, log);

        await i.channel.permissionOverwrites.edit(id,{ ViewChannel:true, SendMessages:true });

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Benutzer hinzugefügt')
          .setDescription(`**<@${id}> wurde erfolgreich zum Ticket hinzugefügt.**`)
          .addFields(
            { name: '👤 Hinzugefügt', value: `<@${id}>`, inline: true },
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👥 Von', value: `<@${i.user.id}>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Benutzer hinzugefügt' })
          .setTimestamp();
        await i.reply({ embeds: [successEmbed], ephemeral: true });

        const publicEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('👥 Neuer Benutzer hinzugefügt')
          .setDescription(`<@${id}> wurde von <@${i.user.id}> zum Ticket hinzugefügt und kann nun hier schreiben.`)
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets' })
          .setTimestamp();
        await i.channel.send({ embeds: [publicEmbed] });

        logEvent(i.guild, t(guildId, 'logs.user_added', { user: `<@${id}>`, id: ticket.id }));
      } catch(err) {
        console.error('Fehler beim Hinzufügen:', err);

        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Fehler beim Hinzufügen')
          .setDescription(
            '**Der Benutzer konnte nicht hinzugefügt werden.**\n\n' +
            'Mögliche Gründe:\n' +
            '`•` Benutzer ist nicht auf diesem Server\n' +
            '`•` Ungültige User-ID\n' +
            '`•` Bot hat keine Berechtigung'
          )
          .addFields({
            name: '🐛 Fehlermeldung',
            value: `\`\`\`${err.message || 'Unbekannter Fehler'}\`\`\``,
            inline: false
          })
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();
        return i.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  } catch(err) {
    console.error(err);

    if(!i.replied && !i.deferred) {
      const generalErrorEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Ein Fehler ist aufgetreten')
        .setDescription(
          '**Bei der Verarbeitung deiner Anfrage ist ein unerwarteter Fehler aufgetreten.**\n\n' +
          'Bitte versuche es erneut oder kontaktiere den Support.'
        )
        .addFields({
          name: '💬 Support',
          value: '[Support Server](https://discord.com/invite/mnYbnpyyBS)',
          inline: false
        })
        .setFooter({ text: 'Quantix Tickets • Fehler' })
        .setTimestamp();

      i.reply({ embeds: [generalErrorEmbed], ephemeral: true }).catch(() => {});
    }
  }
});

function getUserOpenTickets(guildId, userId){
  const ticketsPath = getTicketsPath(guildId);
  if(!fs.existsSync(ticketsPath)) return [];
  const allTickets = safeRead(ticketsPath, []);
  return allTickets.filter(t => t.userId === userId && t.status === 'offen');
}

function canUserCreateTicket(guildId, userId){
  const cfg = readCfg(guildId);
  const maxTickets = cfg.maxTicketsPerUser || 0;
  if(maxTickets === 0) return { allowed: true };

  const openTickets = getUserOpenTickets(guildId, userId);
  if(openTickets.length >= maxTickets){
    return {
      allowed: false,
      current: openTickets.length,
      max: maxTickets
    };
  }
  return { allowed: true, current: openTickets.length, max: maxTickets };
}

/**
 * Creates ticket channel for Multi-Ticket-System
 * Wrapper that integrates system-specific config with global config
 */
async function createTicketChannelMultiSystem(interaction, system, topic, formData, globalCfg){
  // Create merged config with system-specific settings
  const mergedCfg = {
    ...globalCfg,
    topics: system.topics,
    teamRoleId: system.teamRoleId,
    priorityRoles: system.priorityRoles,
    categoryId: system.categoryId,
    logChannelId: system.logChannelId,
    transcriptChannelId: system.transcriptChannelId,
    embedTitle: system.embedTitle,
    embedDescription: system.embedDescription,
    embedColor: system.embedColor,
    notifyUserOnStatusChange: system.notifyUserOnStatusChange,
    autoClose: system.autoClose,
    sla: system.sla,
    autoAssignment: system.autoAssignment,
    ticketEmbed: {
      title: system.embedTitle || '🎫 Ticket #{ticketNumber}',
      description: system.embedDescription || 'Hallo {userMention}\n**Thema:** {topicLabel}',
      color: system.embedColor || '#2b90d9',
      footer: COPYRIGHT
    }
  };

  // Call standard createTicketChannel with merged config
  return await createTicketChannel(interaction, topic, formData, mergedCfg);
}

async function createTicketChannel(interaction, topic, formData, cfg){
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  // Check VIP status (only for VIP Server 1403053662825222388)
  const VIP_SERVER_ID = '1403053662825222388';
  const isVIP = guildId === VIP_SERVER_ID && cfg.vipUsers && cfg.vipUsers.includes(userId);

  // Check AntiSpam Rate Limit
  const rateLimitCheck = checkTicketRateLimit(userId, guildId);
  if (!rateLimitCheck.allowed) {
    const spamEmbed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle('🚫 Rate-Limit erreicht')
      .setDescription(
        '**Du erstellst zu viele Tickets!**\n\n' +
        `Du hast bereits **${rateLimitCheck.count} von ${rateLimitCheck.max}** Tickets in den letzten ${cfg.antiSpam.timeWindowMinutes} Minuten erstellt.`
      )
      .addFields(
        {
          name: '⏱️ Warte noch',
          value: `**${rateLimitCheck.waitMinutes} Minute(n)**`,
          inline: true
        },
        {
          name: '📊 Limit',
          value: `${rateLimitCheck.max} Tickets / ${cfg.antiSpam.timeWindowMinutes} Minuten`,
          inline: true
        }
      )
      .setFooter({ text: 'Quantix Tickets • AntiSpam System' })
      .setTimestamp();

    // Use editReply if already deferred/replied, otherwise use reply
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [spamEmbed] });
    } else {
      await interaction.reply({ embeds: [spamEmbed], ephemeral: true });
    }
    return;
  }

  // Check ticket limit
  const limitCheck = canUserCreateTicket(guildId, userId);
  if(!limitCheck.allowed){
    const lang = getGuildLanguage(guildId);
    const errorMsg = t(guildId, 'ticket.limit_reached', {
      current: limitCheck.current,
      max: limitCheck.max
    });

    // Use editReply if already deferred/replied, otherwise use reply
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: errorMsg });
    } else {
      await interaction.reply({ content: errorMsg, ephemeral: true });
    }
    return;
  }

  const nr = nextTicket(guildId);

  let parentId = null;

  // VIP users get their own category if configured
  if(isVIP && cfg.vipCategoryId){
    try {
      const vipCategory = await interaction.guild.channels.fetch(cfg.vipCategoryId.trim());
      if(vipCategory && vipCategory.type === ChannelType.GuildCategory){
        parentId = vipCategory.id;
      }
    } catch {
      console.error('VIP-Kategorie nicht gefunden:', cfg.vipCategoryId);
    }
  }

  // Fallback to normal category
  if(!parentId){
    const categoryIds = Array.isArray(cfg.ticketCategoryId) ? cfg.ticketCategoryId : (cfg.ticketCategoryId ? [cfg.ticketCategoryId] : []);
    if(categoryIds.length > 0 && categoryIds[0]){
      try {
        const category = await interaction.guild.channels.fetch(categoryIds[0].trim());
        if(category && category.type === ChannelType.GuildCategory){
          parentId = category.id;
        }
      } catch {
        console.error('Kategorie nicht gefunden:', categoryIds[0]);
      }
    }
  }

  const permOverwrites = [
    { id:interaction.guild.id, deny: PermissionsBitField.Flags.ViewChannel },
    { id:interaction.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
  ];

  const TEAM_ROLE = getTeamRole(guildId);
  if(TEAM_ROLE && TEAM_ROLE.trim()){
    try {
      await interaction.guild.roles.fetch(TEAM_ROLE);
      permOverwrites.push({ id:TEAM_ROLE, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
    } catch {
      console.error('Team-Rolle nicht gefunden:', TEAM_ROLE);
    }
  }

  const priorityRoles = getPriorityRoles(guildId, 0);
  for(const roleId of priorityRoles){
    if(roleId && roleId.trim() && roleId !== TEAM_ROLE){
      try {
        await interaction.guild.roles.fetch(roleId);
        permOverwrites.push({ id:roleId, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      } catch {
        console.error('Priority-Rolle nicht gefunden:', roleId);
      }
    }
  }

  const ch = await interaction.guild.channels.create({
    name: buildChannelName(nr, 0, isVIP),
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites: permOverwrites
  });
  const embed = buildTicketEmbed(cfg, interaction, topic, nr);
  const formKeys = Object.keys(formData||{});
  if(formKeys.length){
    const formFields = getFormFieldsForTopic(cfg, topic.value).map(normalizeField);
    const fields = formKeys.slice(0,25).map(k=>{
      const field = formFields.find(f=>f.id===k);
      const label = field ? field.label : k;
      return { name: label, value: formData[k] ? (formData[k].substring(0,1024) || '—') : '—', inline:false };
    });
    embed.addFields(fields);
  }

  // SLA Field hinzufügen (nur für Pro mit SLA enabled)
  const tempSlaDeadline = calculateSLADeadline(guildId, 0, Date.now());
  if(tempSlaDeadline && hasFeature(guildId, 'slaSystem')){
    const slaDate = new Date(tempSlaDeadline);
    const slaText = `<t:${Math.floor(tempSlaDeadline / 1000)}:R>`;
    embed.addFields({
      name: '⏱️ SLA-Deadline',
      value: slaText,
      inline: true
    });
  }

  let ticketMessage;
  try {
    ticketMessage = await ch.send({ embeds:[embed], components: buttonRows(false, interaction.guild?.id, null) });
  } catch (err) {
    console.error('❌ Fehler beim Senden der Willkommens-Nachricht:', err.message || err);
    if (err.stack) console.error(err.stack);
    throw err;
  }

  const mentions = [];
  const greenRoles = getPriorityRoles(guildId, 0);
  for(const roleId of greenRoles){
    if(roleId && roleId.trim() && roleId !== TEAM_ROLE){
      mentions.push(`<@&${roleId}>`);
    }
  }

  if(mentions.length > 0){
    await ch.send({ content: `${mentions.join(' ')} ${t(guildId, 'ticket.created')}` });
  }

  // Use editReply if already deferred/replied, otherwise use reply
  if(interaction.deferred || interaction.replied){
    await interaction.editReply({ content:`Ticket erstellt: ${ch}` });
  } else {
    await interaction.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });
  }
  const ticketsPath = getTicketsPath(guildId);
  if(!fs.existsSync(ticketsPath)) safeWrite(ticketsPath, []);
  const log = safeRead(ticketsPath, []);

  const createdAt = Date.now();
  const slaDeadline = calculateSLADeadline(guildId, 0, createdAt);

  log.push({
    id:nr,
    channelId:ch.id,
    messageId: ticketMessage.id,  // Store ticket message ID for later updates
    userId:interaction.user.id,
    topic:topic.value,
    status:'offen',
    priority:0,
    timestamp:createdAt,
    formData,
    addedUsers:[],
    notes: [],
    isVIP: isVIP || false,
    slaDeadline: slaDeadline,
    slaWarned: false,
    statusHistory: [{
      status: 'offen',
      timestamp: createdAt,
      userId: interaction.user.id
    }]
  });
  safeWrite(ticketsPath, log);

  // Auto-Assignment System (Basic+ Feature)
  console.log(`🔍 Auto-Assignment Check for Ticket #${nr}:`, {
    hasConfig: !!cfg.autoAssignment,
    enabled: cfg.autoAssignment?.enabled,
    assignOnCreate: cfg.autoAssignment?.assignOnCreate,
    strategy: cfg.autoAssignment?.strategy
  });

  if (cfg.autoAssignment && cfg.autoAssignment.enabled && cfg.autoAssignment.assignOnCreate) {
    try {
      console.log(`🎯 Starting auto-assignment for ticket #${nr}`);
      const { autoAssignTicket } = require('./auto-assignment');
      const allTickets = safeRead(ticketsPath, []);
      const currentTicket = allTickets.find(t => t.id === nr);

      if (currentTicket) {
        console.log(`📋 Found ticket #${nr}, calling autoAssignTicket...`);
        const assignedMember = await autoAssignTicket(interaction.guild, cfg, currentTicket, allTickets);

        if (assignedMember) {
          // Update ticket with assigned member
          currentTicket.claimer = assignedMember;
          currentTicket.status = 'offen';

          // Set channel permissions like manual claim (remove team role, only claimer + creator + added users)
          try {
            const permissions = [
              { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
              { id: currentTicket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
              { id: assignedMember, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks] }
            ];

            // Add permissions for added users
            if (currentTicket.addedUsers && Array.isArray(currentTicket.addedUsers)) {
              currentTicket.addedUsers.forEach(uid => {
                permissions.push({
                  id: uid,
                  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                });
              });
            }

            // Priority roles get VIEW permission only (no write)
            const currentPriority = currentTicket.priority || 0;
            const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, currentPriority);
            for (const roleId of hierarchicalRoles) {
              if (roleId && roleId.trim()) {
                try {
                  await interaction.guild.roles.fetch(roleId);
                  permissions.push({
                    id: roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                    deny: [PermissionsBitField.Flags.SendMessages]
                  });
                } catch {
                  console.error('Priority-Rolle nicht gefunden:', roleId);
                }
              }
            }

            await ch.permissionOverwrites.set(permissions);
            console.log(`✅ Set claim permissions for ticket #${nr} (removed team role, only claimer + creator + added)`);

            // Update channel name with 🔒 emoji
            const newName = buildChannelName(nr, currentTicket.priority || 0, currentTicket.isVIP || false, true);
            await scheduleChannelRename(ch, newName);
          } catch (permErr) {
            console.error('Auto-Assignment permission error:', permErr);
          }

          // Save updated config (with assignment stats)
          writeCfg(guildId, cfg);

          // Save updated ticket
          safeWrite(ticketsPath, allTickets);

          // Update ticket embed and buttons to show claimed status
          try {
            // Use stored messageId to find the correct ticket message
            if (!currentTicket.messageId) {
              console.warn(`⚠️ Ticket #${nr} has no messageId, cannot update buttons`);
            } else {
              const ticketMessageObj = await ch.messages.fetch(currentTicket.messageId);
              if (ticketMessageObj && ticketMessageObj.embeds.length > 0) {
                const updatedEmbed = EmbedBuilder.from(ticketMessageObj.embeds[0]);

                // Add claimer field if not exists
                const existingFields = updatedEmbed.data.fields || [];
                const claimerFieldIndex = existingFields.findIndex(f => f.name && f.name.includes('Bearbeiter'));

                if (claimerFieldIndex === -1) {
                  updatedEmbed.addFields({
                    name: '👤 Bearbeiter',
                    value: `<@${assignedMember}>`,
                    inline: true
                  });
                }

                // Update buttons to show claimed state
                const updatedButtons = buttonRows(true, guildId, currentTicket);

                await ticketMessageObj.edit({
                  embeds: [updatedEmbed],
                  components: updatedButtons
                });

                console.log(`✅ Updated ticket embed and buttons to show claimed status (messageId: ${currentTicket.messageId})`);
              }
            }
          } catch (embedErr) {
            console.error('Error updating ticket embed:', embedErr);
          }

          // Send claim notification in channel WITH PING outside embed
          try {
            const claimEmbed = new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('✨ Automatisch zugewiesen')
              .setDescription(`wurde diesem Ticket automatisch zugewiesen und wird sich um dein Anliegen kümmern.`)
              .addFields(
                { name: '🎫 Ticket', value: `#${nr}`, inline: true },
                { name: '👤 Zugewiesen an', value: `<@${assignedMember}>`, inline: true },
                { name: '⚙️ Strategie', value: cfg.autoAssignment.strategy || 'workload', inline: true }
              )
              .setFooter({ text: 'Quantix Tickets • Auto-Assignment' })
              .setTimestamp();

            // Send with content to ping the assigned member
            await ch.send({
              content: `<@${assignedMember}>`,
              embeds: [claimEmbed]
            });
          } catch (channelMsgErr) {
            console.error('Error sending claim message to channel:', channelMsgErr);
          }

          // Send notification DM to assigned member (if enabled)
          if (cfg.autoAssignment.notifyAssignee) {
            try {
              const member = await interaction.guild.members.fetch(assignedMember);
              const user = member.user;

              const priorityEmojis = ['🟢', '🟠', '🔴'];
              const priorityEmoji = priorityEmojis[currentTicket.priority || 0];

              const notificationEmbed = new EmbedBuilder()
                .setColor(0x3b82f6)
                .setTitle(t(guildId, 'autoAssignment.notification_title'))
                .setDescription(t(guildId, 'autoAssignment.notification_description', {
                  ticketId: nr,
                  channel: `<#${ch.id}>`
                }))
                .addFields(
                  { name: t(guildId, 'autoAssignment.notification_topic'), value: topic.label, inline: true },
                  { name: t(guildId, 'autoAssignment.notification_priority'), value: priorityEmoji, inline: true },
                  { name: t(guildId, 'autoAssignment.notification_creator'), value: `<@${interaction.user.id}>`, inline: true }
                )
                .setFooter({ text: 'Quantix Tickets • Auto-Assignment' })
                .setTimestamp();

              await user.send({ embeds: [notificationEmbed] }).catch(dmErr => {
                console.log(`Konnte Auto-Assignment DM nicht an ${user.tag} senden:`, dmErr.message);
              });
            } catch (memberErr) {
              console.error('Konnte Team-Mitglied nicht fetchen:', memberErr);
            }
          }

          // Log assignment
          const strategyNames = {
            'round_robin': 'Round-Robin',
            'workload': 'Workload-basiert',
            'random': 'Zufällig',
            'priority_queue': 'Priority Queue'
          };
          const strategyName = strategyNames[cfg.autoAssignment.strategy] || cfg.autoAssignment.strategy;

          await logEvent(interaction.guild, `🎯 Ticket #${nr} automatisch zugewiesen an <@${assignedMember}> (${strategyName})`);
        } else {
          console.log(`⚠️ No member assigned to ticket #${nr} - check eligibility and team roles`);
        }
      } else {
        console.log(`❌ Ticket #${nr} not found after creation`);
      }
    } catch (autoAssignErr) {
      console.error('❌ Auto-Assignment error:', autoAssignErr);
      console.error('Stack:', autoAssignErr.stack);
      // Fehler wird ignoriert, Ticket-Erstellung wird nicht blockiert
    }
  } else {
    console.log(`⏭️ Auto-Assignment skipped for ticket #${nr}`);
  }

  // Log für AntiSpam Rate-Limiting
  logTicketCreation(interaction.user.id, guildId);

  logEvent(interaction.guild, t(guildId, 'logs.ticket_created', { id: nr, user: `<@${interaction.user.id}>`, topic: topic.label }));

  // Email-Benachrichtigung senden (nur für Pro)
  try {
    const emailAddress = getGuildEmail(guildId);
    if (emailAddress) {
      const ticketInfo = {
        id: nr,
        topic: topic.label,
        user: sanitizeUsername(interaction.user.tag || interaction.user.username || interaction.user.id),
        timestamp: Date.now(),
        formData: formData || {}
      };
      await sendTicketNotification(guildId, ticketInfo, emailAddress);
    }
  } catch (emailErr) {
    console.error('Email notification error:', emailErr);
    // Fehler wird ignoriert, Ticket-Erstellung wird nicht blockiert
  }

  // Discord DM-Benachrichtigungen senden (nur für Pro)
  try {
    const ticketInfo = {
      id: nr,
      topic: topic.label,
      user: sanitizeUsername(interaction.user.tag || interaction.user.username || interaction.user.id),
      guildName: sanitizeString(interaction.guild.name, 100),
      timestamp: Date.now(),
      formData: formData || {}
    };
    await sendDMNotification(client, guildId, ticketInfo);
  } catch (dmErr) {
    console.error('DM notification error:', dmErr);
    // Fehler wird ignoriert, Ticket-Erstellung wird nicht blockiert
  }

  try {
    if(cfg.panelMessageId && cfg.panelChannelId){
      const panelChannel = await interaction.guild.channels.fetch(cfg.panelChannelId).catch(()=>null);
      if(panelChannel){
        const panelMsg = await panelChannel.messages.fetch(cfg.panelMessageId).catch(()=>null);
        if(panelMsg){
          const row = buildPanelSelect(cfg);
          let panelEmbed = undefined;
          if(cfg.panelEmbed && (cfg.panelEmbed.title || cfg.panelEmbed.description)){
            panelEmbed = new EmbedBuilder();
            if(cfg.panelEmbed.title) panelEmbed.setTitle(cfg.panelEmbed.title);
            if(cfg.panelEmbed.description) panelEmbed.setDescription(cfg.panelEmbed.description);
            if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) panelEmbed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
            if(cfg.panelEmbed.footer) panelEmbed.setFooter({ text: cfg.panelEmbed.footer });
          }
          await panelMsg.edit({ embeds: panelEmbed? [panelEmbed]: panelMsg.embeds, components:[row] });
        }
      }
    }
  } catch(e){ }
}

async function updatePriority(interaction, ticket, log, dir, guildId){
  renameChannelIfNeeded(interaction.channel, ticket);

  // SLA-Deadline neu berechnen bei Prioritätsänderung
  const cfg = readCfg(guildId);
  if (cfg.sla && cfg.sla.enabled && hasFeature(guildId, 'slaSystem')) {
    const createdAt = ticket.timestamp || Date.now();
    const newDeadline = calculateSLADeadline(guildId, ticket.priority, createdAt);
    if (newDeadline) {
      ticket.slaDeadline = newDeadline;
      ticket.slaWarned = false; // Reset Warning-Status
      ticket.slaEscalated = false; // Reset Escalation-Status
    }
  }

  const msg = await interaction.channel.messages.fetch({limit:10}).then(c=>c.find(m=>m.embeds.length)).catch(()=>null);
  const state = PRIORITY_STATES[ticket.priority||0];

  if(msg){
    const e = EmbedBuilder.from(msg.embeds[0]);
    e.setColor(state.embedColor);

    // SLA-Deadline im Embed aktualisieren
    if (ticket.slaDeadline && hasFeature(guildId, 'slaSystem')) {
      const fields = e.data.fields || [];
      const slaFieldIndex = fields.findIndex(f => f.name === '⏱️ SLA-Deadline');
      const slaText = `<t:${Math.floor(ticket.slaDeadline / 1000)}:R>`;

      if (slaFieldIndex !== -1) {
        // Update existierendes SLA-Feld
        fields[slaFieldIndex].value = slaText;
        e.setFields(fields);
      } else {
        // Füge SLA-Feld hinzu
        e.addFields({
          name: '⏱️ SLA-Deadline',
          value: slaText,
          inline: true
        });
      }
    }

    await msg.edit({embeds:[e]});
  }

  saveTickets(guildId, log);

  try {
    const currentPriority = ticket.priority || 0;
    const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, currentPriority);
    const allPriorityRoles = getAllTeamRoles(guildId);

    const permissions = [
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ];

    if(ticket.claimer){
      permissions.push({ id: ticket.claimer, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
    }

    if(ticket.addedUsers && Array.isArray(ticket.addedUsers)){
      ticket.addedUsers.forEach(uid => {
        permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      });
    }

    const TEAM_ROLE = getTeamRole(guildId);

    // Bei geclaimten Tickets: Team-Rolle NICHT hinzufügen, Priority-Rollen nur lesen
    // Bei nicht geclaimten Tickets: Team-Rolle + Priority-Rollen voller Zugriff
    const isClaimed = !!ticket.claimer;

    if(!isClaimed && TEAM_ROLE && TEAM_ROLE.trim()){
      try {
        await interaction.guild.roles.fetch(TEAM_ROLE);
        permissions.push({ id: TEAM_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      } catch {}
    }

    for(const roleId of hierarchicalRoles){
      if(roleId && roleId.trim() && roleId !== TEAM_ROLE){
        try {
          await interaction.guild.roles.fetch(roleId);
          if(isClaimed){
            // Geclaimed: Nur lesen, nicht schreiben
            permissions.push({
              id: roleId,
              allow: [PermissionsBitField.Flags.ViewChannel],
              deny: [PermissionsBitField.Flags.SendMessages]
            });
          } else {
            // Nicht geclaimed: Vollen Zugriff
            permissions.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
          }
        } catch {
          console.error('Priority-Rolle nicht gefunden:', roleId);
        }
      }
    }

    for(const roleId of allPriorityRoles){
      if(roleId && roleId.trim() && !hierarchicalRoles.includes(roleId) && roleId !== TEAM_ROLE){
        try {
          await interaction.guild.roles.fetch(roleId);
          permissions.push({ id: roleId, deny: [PermissionsBitField.Flags.ViewChannel] });
        } catch {}
      }
    }

    await interaction.channel.permissionOverwrites.set(permissions);
  } catch(err) {
    console.error('Fehler beim Aktualisieren der Priority-Rollen-Berechtigungen:', err);
  }

  const mentions = [];
  const TEAM_ROLE = getTeamRole(guildId);

  const currentPriorityRoles = getPriorityRoles(guildId, ticket.priority || 0);
  for(const roleId of currentPriorityRoles){
    if(roleId && roleId.trim() && roleId !== TEAM_ROLE){
      mentions.push(`<@&${roleId}>`);
    }
  }

  // Public priority change notification
  const priorityEmbed = new EmbedBuilder()
    .setColor(state.embedColor)
    .setTitle('🎯 Priorität geändert')
    .setDescription(`Die Ticket-Priorität wurde auf **${state.label}** ${dir === 'hoch' ? '**erhöht**' : '**gesenkt**'}.`)
    .addFields(
      { name: '🔻 Neue Priorität', value: `${state.emoji} ${state.label}`, inline: true },
      { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
      { name: '👤 Geändert von', value: `<@${interaction.user.id}>`, inline: true }
    )
    .setFooter({ text: 'Quantix Tickets • Priorität geändert' })
    .setTimestamp();

  if(mentions.length > 0){
    await interaction.channel.send({
      content: mentions.join(' '),
      embeds: [priorityEmbed]
    });
  } else {
    await interaction.channel.send({ embeds: [priorityEmbed] });
  }

  logEvent(interaction.guild, t(guildId, 'logs.priority_changed', { id: ticket.id, direction: dir, priority: state.label }));

  // Ephemeral confirmation for user who changed priority
  const confirmEmbed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setTitle('✅ Priorität aktualisiert')
    .setDescription(`**Die Ticket-Priorität wurde erfolgreich aktualisiert.**`)
    .addFields(
      { name: '🎯 Neue Priorität', value: `${state.emoji} ${state.label}`, inline: true },
      { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
    )
    .setFooter({ text: 'Quantix Tickets' })
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
}

client.on(Events.MessageCreate, async (message) => {
  if(message.author.bot) return;

  // Live Transcript: Schreibe Nachrichten in Ticket-Channels live
  if (message.channel.name && message.channel.name.startsWith(PREFIX) && message.guild) {
    const guildId = message.guild.id;
    const ticketsPath = getTicketsPath(guildId);

    if (fs.existsSync(ticketsPath)) {
      const tickets = safeRead(ticketsPath, []);
      const ticket = tickets.find(t => t.channelId === message.channel.id && t.status === 'offen');

      if (ticket) {
        await appendToLiveTranscript(message, ticket, guildId);
      }
    }
  }

  // Handle !commands message command
  if (message.content.toLowerCase() === '!commands' || message.content.toLowerCase() === '!command') {
    try {
      // Import helper functions from commands.js
      const commandsModule = require('./commands/commands.js');
      const { getCommandsList, buildCommandEmbed, buildButtonRow } = commandsModule;

      const userId = message.author.id;
      const member = message.member;
      const guildId = message.guild?.id;

      // Get commands list and build embed using shared functions
      const commands = getCommandsList(userId, member, guildId);
      const embed = buildCommandEmbed(commands, message.author.username);
      const buttonRow = buildButtonRow();

      await message.reply({ embeds: [embed], components: [buttonRow] });
      return;
    } catch (err) {
      console.error('Error in !commands message command:', err);
      await message.reply('❌ Ein Fehler ist aufgetreten beim Laden der Command-Liste.').catch(() => {});
      return;
    }
  }

  if(!message.channel.name || !message.channel.name.startsWith(PREFIX)) return;

  try {
    const guildId = message.guild?.id;
    if(!guildId) return;
    const log = loadTickets(guildId);
    const ticket = log.find(t => t.channelId === message.channel.id);
    if(!ticket) return;

    if(!ticket.claimer) return;

    const authorId = message.author.id;
    const isCreator = ticket.userId === authorId;
    const isClaimer = ticket.claimer === authorId;
    const isAdded = ticket.addedUsers && ticket.addedUsers.includes(authorId);

    if(!isCreator && !isClaimer && !isAdded){
      const messageContent = sanitizeString(message.content || '[Keine Nachricht]', 500);
      const messageAuthor = sanitizeUsername(message.author.tag || message.author.username || message.author.id);

      await message.delete().catch(()=>{});

      try {
        await message.author.send(`❌ Du hast keine Berechtigung in Ticket #${ticket.id} zu schreiben. Dieses Ticket wurde geclaimed und ist nur für Ersteller, Claimer und hinzugefügte Nutzer zugänglich.`);
      } catch {
      }

      await logEvent(message.guild, `🚫 Nachricht gelöscht in Ticket #${ticket.id}\n**Nutzer:** ${messageAuthor} (<@${authorId}>)\n**Nachricht:** ${messageContent.substring(0, 200)}`);
    }

    // File Upload Validation (Basic+ Feature)
    if (message.attachments.size > 0 && message.channel.name && message.channel.name.startsWith(PREFIX)) {
      const guildId = message.guild.id;
      const cfg = readCfg(guildId);

      // Check if file upload is enabled and user has Basic+ or higher
      if (!cfg.fileUpload || !cfg.fileUpload.enabled) {
        // File upload disabled
        return;
      }

      if (!hasFeature(guildId, 'fileUpload')) {
        // Not Basic+ or higher - delete attachments
        try {
          await message.delete();
          const warningEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('📎 Datei-Upload nicht verfügbar')
            .setDescription(
              '**Datei-Uploads sind nur mit Premium Basic+ oder höher verfügbar!**\n\n' +
              '**Upgrade auf Basic+ für:**\n' +
              '✅ Datei-Uploads (bis 10MB)\n' +
              '✅ 7 Ticket-Kategorien\n' +
              '✅ Custom Avatar\n' +
              '✅ Statistiken\n\n' +
              '💎 **Jetzt upgraden für nur €2.99/Monat!**'
            )
            .setFooter({ text: 'Quantix Tickets • Premium Feature' })
            .setTimestamp();

          await message.channel.send({ embeds: [warningEmbed] });
        } catch (err) {
          console.error('Fehler beim Löschen der Nachricht mit Attachment:', err);
        }
        return;
      }

      // Validate attachments
      const maxSizeMB = cfg.fileUpload.maxSizeMB || 10;
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      const allowedFormats = cfg.fileUpload.allowedFormats || ['png', 'jpg', 'jpeg', 'pdf', 'txt', 'log'];

      for (const [id, attachment] of message.attachments) {
        // Check file size
        if (attachment.size > maxSizeBytes) {
          try {
            await message.delete();
            const warningEmbed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle('📎 Datei zu groß')
              .setDescription(
                `**Die hochgeladene Datei ist zu groß!**\n\n` +
                `📊 **Maximale Größe:** ${maxSizeMB} MB\n` +
                `📁 **Deine Datei:** ${(attachment.size / (1024 * 1024)).toFixed(2)} MB\n\n` +
                `Bitte komprimiere die Datei oder teile sie in kleinere Teile auf.`
              )
              .setFooter({ text: 'Quantix Tickets • File Upload' })
              .setTimestamp();

            await message.channel.send({ embeds: [warningEmbed] });
          } catch (err) {
            console.error('Fehler beim Löschen der zu großen Datei:', err);
          }
          return;
        }

        // Check file format
        const fileExtension = attachment.name.split('.').pop().toLowerCase();
        if (!allowedFormats.includes(fileExtension)) {
          try {
            await message.delete();
            const warningEmbed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle('📎 Dateiformat nicht erlaubt')
              .setDescription(
                `**Dieses Dateiformat ist nicht erlaubt!**\n\n` +
                `✅ **Erlaubte Formate:** ${allowedFormats.join(', ')}\n` +
                `❌ **Dein Format:** ${fileExtension}\n\n` +
                `Bitte verwende ein erlaubtes Dateiformat.`
              )
              .setFooter({ text: 'Quantix Tickets • File Upload' })
              .setTimestamp();

            await message.channel.send({ embeds: [warningEmbed] });
          } catch (err) {
            console.error('Fehler beim Löschen der ungültigen Datei:', err);
          }
          return;
        }
      }
    }

  } catch(err) {
    console.error('Fehler beim Message-Delete-Check:', err);
  }
});

client.login(TOKEN);
