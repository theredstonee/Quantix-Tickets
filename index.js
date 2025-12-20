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
  PermissionsBitField, PermissionFlagsBits, ChannelType, Events, AttachmentBuilder,
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
const { handleVoiceJoin, handleVoiceLeave } = require('./voice-waiting-room');
const { handleTemplateUse } = require('./template-handler');
const { handleDepartmentForward } = require('./department-handler');
const { hasFeature, isPremium, getPremiumInfo, getExpiringTrials, wasWarningSent, markTrialWarningSent, getTrialInfo, isTrialActive, activateAutoTrial, checkExpiredCancellations, activatePartner, deactivatePartner, listPartnerServers } = require('./premium');
const { createStyledEmbed, createQuickEmbed, createStyledMessage, componentsV2Available } = require('./helpers');
const { readCfg, writeCfg, loadTickets, saveTickets, getNextTicketNumber } = require('./database');

const PREFIX    = '🎫│';
const PRIORITY_STATES = [
  { dot: '🟢', embedColor: 0x2bd94a, label: 'Grün'   },
  { dot: '🟠', embedColor: 0xff9900, label: 'Orange' },
  { dot: '🔴', embedColor: 0xd92b2b, label: 'Rot'    }
];

function buildBlockquoteMessage(title, descriptionLines = [], infoLines = []) {
  const lines = [];

  const pushLine = (line) => {
    if (line === '') {
      lines.push('>');
      return;
    }

    line.toString().split('\n').forEach(part => {
      lines.push(`> ${part}`);
    });
  };

  if (title) pushLine(`**${title}**`);
  descriptionLines.forEach(pushLine);

  if (infoLines.length > 0) {
    if (lines.length > 0) lines.push('>');
    infoLines.forEach(pushLine);
  }

  return lines.join('\n');
}

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

// Atomare Schreiboperation - schreibt erst in temp-Datei, dann umbenennen
function safeWrite(file, data){
  const tempFile = file + '.tmp';
  const backupFile = file + '.bak';
  try {
    const jsonData = JSON.stringify(data, null, 2);
    // Validiere JSON vor dem Schreiben
    JSON.parse(jsonData);
    // Schreibe in temporäre Datei
    fs.writeFileSync(tempFile, jsonData, 'utf8');
    // Backup der alten Datei erstellen (falls vorhanden)
    if (fs.existsSync(file)) {
      try { fs.copyFileSync(file, backupFile); } catch (e) { /* Backup optional */ }
    }
    // Atomares Umbenennen (ersetzt Zieldatei)
    fs.renameSync(tempFile, file);
  } catch (err) {
    console.error(`[safeWrite] Error writing ${file}:`, err.message);
    // Aufräumen bei Fehler
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
    // Versuche Backup wiederherzustellen
    if (fs.existsSync(backupFile) && !fs.existsSync(file)) {
      try { fs.copyFileSync(backupFile, file); } catch (e) { /* ignore */ }
    }
    throw err;
  }
}

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

// readCfg, writeCfg, loadTickets, saveTickets are now imported from database.js

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
    GatewayIntentBits.GuildPresences,  // Für Online-Status-Erkennung
    GatewayIntentBits.GuildVoiceStates // Für Voice-Support System
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
const PANEL_FIXED_URL = 'https://tickets.quantix-bot.de/panel';

// nextTicket now uses database.js
function nextTicket(guildId){
  return getNextTicketNumber(guildId);
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

  // Row 4: Merge-Button (nur wenn claimed - Team-only)
  const rows = [row1, row2, row3];

  if (claimed && ticket) {
    const row4 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('merge_ticket')
        .setEmoji('🔗')
        .setLabel(t(guildId, 'buttons.merge') || 'Zusammenführen')
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(row4);
  }

  return rows;
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
          const dashboardUrl = (process.env.PUBLIC_BASE_URL || 'https://tickets.quantix-bot.de').replace(/\/+$/, '');

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

          const warningEmbed = createStyledEmbed({
            emoji: '⚠️',
            title: title.replace('⚠️ ', ''),
            description: description.replace(/\*\*/g, ''),
            color: '#ED4245',
            thumbnail: client.user.displayAvatarURL({ size: 256 })
          });

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

              const warningEmbed = createStyledEmbed({
                emoji: '⚠️',
                title: 'SLA-Warnung',
                description: `Dieses Ticket nähert sich der SLA-Deadline!`,
                fields: [
                  { name: 'Verbleibende Zeit', value: `${hours}h ${minutes}m`, inline: true },
                  { name: 'SLA-Fortschritt', value: `${Math.round(progress)}%`, inline: true }
                ],
                color: '#FEE75C'
              });

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

              const escalationEmbed = createStyledEmbed({
                emoji: '🚨',
                title: 'SLA ÜBERSCHRITTEN',
                description: 'Dieses Ticket hat die SLA-Deadline überschritten! Sofortige Bearbeitung erforderlich!',
                fields: [
                  { name: 'Überfällig seit', value: `${hours}h ${minutes}m`, inline: true }
                ],
                color: '#ED4245'
              });

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
      { name: `!help für Hilfe`, type: ActivityType.Playing },
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

client.once('ready', async () => {
  await deployCommands(); // Commands werden beim Start für alle Server geladen
  await cleanupOldServerData();
  initEmailService(); // Email-Benachrichtigungen initialisieren
  console.log(`🤖 ${client.user.tag} bereit`);

  // ====== VOICE SUPPORT SYSTEM STARTUP VERIFICATION ======
  console.log('\n' + '='.repeat(60));
  console.log('🎤 VOICE SUPPORT SYSTEM - STARTUP CHECK');
  console.log('='.repeat(60));

  // 1. Check GuildVoiceStates Intent
  const hasVoiceIntent = client.options.intents.has(GatewayIntentBits.GuildVoiceStates);
  console.log(`\n1️⃣ GuildVoiceStates Intent: ${hasVoiceIntent ? '✅ AKTIVIERT' : '❌ FEHLT'}`);
  if (!hasVoiceIntent) {
    console.log('   ⚠️  WARNUNG: GuildVoiceStates Intent fehlt!');
    console.log('   ➜  Bot kann keine Voice-Events empfangen!');
    console.log('   ➜  Aktiviere das Intent im Discord Developer Portal:');
    console.log('   ➜  https://discord.com/developers/applications');
  }

  // 2. Check Music File
  const musicPath = path.join(__dirname, 'audio', 'waiting-music.mp3');
  const musicExists = fs.existsSync(musicPath);
  console.log(`\n2️⃣ Wartemusik-Datei: ${musicExists ? '✅ VORHANDEN' : '❌ FEHLT'}`);
  if (musicExists) {
    const stats = fs.statSync(musicPath);
    const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   📊 Größe: ${sizeInMB} MB`);
    if (stats.size === 0) {
      console.log('   ⚠️  WARNUNG: Datei ist leer!');
    }
  } else {
    console.log('   ⚠️  WARNUNG: audio/waiting-music.mp3 fehlt!');
    console.log('   ➜  Siehe audio/README.md für Download-Links');
  }

  // 3. Check Voice Module
  const voiceModulePath = path.join(__dirname, 'voice-waiting-room.js');
  const voiceModuleExists = fs.existsSync(voiceModulePath);
  console.log(`\n3️⃣ Voice-Modul: ${voiceModuleExists ? '✅ GELADEN' : '❌ FEHLT'}`);

  // 4. Check Event Listeners
  const voiceEventCount = client.listeners(Events.VoiceStateUpdate).length;
  console.log(`\n4️⃣ VoiceStateUpdate Event: ${voiceEventCount > 0 ? '✅ REGISTRIERT' : '❌ NICHT REGISTRIERT'}`);
  console.log(`   📊 Anzahl Listener: ${voiceEventCount}`);

  // 5. Check NPM Packages
  try {
    require('@discordjs/voice');
    console.log(`\n5️⃣ @discordjs/voice: ✅ INSTALLIERT`);
  } catch (err) {
    console.log(`\n5️⃣ @discordjs/voice: ❌ FEHLT`);
    console.log('   ➜  Installiere mit: npm install @discordjs/voice');
  }

  try {
    require('@discordjs/opus');
    console.log(`6️⃣ @discordjs/opus: ✅ INSTALLIERT`);
  } catch (err) {
    console.log(`6️⃣ @discordjs/opus: ❌ FEHLT`);
    console.log('   ➜  Installiere mit: npm install @discordjs/opus');
  }

  // 7. Summary
  console.log('\n' + '='.repeat(60));
  const allChecks = hasVoiceIntent && musicExists && voiceModuleExists && voiceEventCount > 0;
  if (allChecks) {
    console.log('✅ VOICE SUPPORT SYSTEM BEREIT');
    console.log('   Alle Checks bestanden! System ist einsatzbereit.');
  } else {
    console.log('❌ VOICE SUPPORT SYSTEM NICHT BEREIT');
    console.log('   Bitte behebe die oben genannten Fehler!');
    console.log('\n📝 NÄCHSTE SCHRITTE:');
    if (!hasVoiceIntent) {
      console.log('   1. Aktiviere GuildVoiceStates Intent im Discord Developer Portal');
      console.log('   2. Starte den Bot neu: pm2 restart quantix-tickets');
    }
    if (!musicExists) {
      console.log('   3. Lade eine Musik-Datei herunter (siehe audio/README.md)');
      console.log('   4. Speichere sie als: audio/waiting-music.mp3');
    }
  }
  console.log('='.repeat(60) + '\n');
  // ====== END VOICE SUPPORT VERIFICATION ======

  // Check if maintenance mode is active on startup
  const maintenanceFile = path.join(__dirname, 'maintenance.json');
  if (fs.existsSync(maintenanceFile)) {
    try {
      const maintenanceState = JSON.parse(fs.readFileSync(maintenanceFile, 'utf8'));
      if (maintenanceState.enabled) {
        console.log('🔧 Maintenance Mode ist aktiv - Setze Bot auf DND Status');

        const presenceData = {
          activities: [{
            name: 'Custom Status',
            type: 4,
            state: '🔧 Wartungsmodus | Under Maintenance'
          }],
          status: 'dnd'
        };

        await client.user.setPresence(presenceData);
        console.log('✅ Bot Status: DND (Wartungsmodus aktiv seit ' + new Date(maintenanceState.enabledAt).toLocaleString('de-DE') + ')');
        console.log('📊 Presence Data:', JSON.stringify(presenceData, null, 2));

        // Force update after startup
        setTimeout(async () => {
          await client.user.setPresence(presenceData);
          console.log('✅ Maintenance Status erneut gesetzt (Startup Force Update)');
        }, 5000);
      }
    } catch (err) {
      console.error('Error checking maintenance state on startup:', err);
    }
  }

  // Status-Rotation starten (wird übersprungen wenn Maintenance aktiv)
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

  // Application Interview Reminders & Auto-Expire - läuft alle 5 Minuten
  startApplicationServices();

  // Send startup notification to all guilds
  await sendStartupNotifications();
});

// Application Services (Interview Reminders & Auto-Expire)
function startApplicationServices() {
  setInterval(async () => {
    try {
      const configsDir = path.join(__dirname, 'configs');
      if (!fs.existsSync(configsDir)) return;

      const configFiles = fs.readdirSync(configsDir).filter(f => f.match(/^\d+\.json$/));

      for (const file of configFiles) {
        const guildId = file.replace('.json', '');
        const cfg = readCfg(guildId);
        if (!cfg?.applicationSystem?.enabled) continue;

        const tickets = loadTickets(guildId);
        let needsSave = false;

        for (const ticket of tickets) {
          if (!ticket.isApplication || ticket.status !== 'open') continue;

          // Interview Reminder
          if (ticket.interview && !ticket.interview.reminderSent) {
            const interviewTime = new Date(ticket.interview.scheduledAt);
            const reminderMinutes = cfg.applicationSystem?.interviewReminderMinutes || 30;
            const reminderTime = new Date(interviewTime.getTime() - reminderMinutes * 60 * 1000);
            const now = new Date();

            // Debug log
            console.log(`📅 Interview Check - Ticket #${ticket.id}: Interview at ${interviewTime.toISOString()}, Reminder at ${reminderTime.toISOString()}, Now: ${now.toISOString()}`);

            if (now >= reminderTime && now < interviewTime) {
              console.log(`⏰ Sending interview reminder for Ticket #${ticket.id}`);
              // Send reminder
              try {
                // Verwende Custom Bot wenn aktiv
                const customBotManager = require('./custom-bot-manager.js');
                const activeClient = customBotManager.getActiveClient(guildId, client);

                const applicant = await activeClient.users.fetch(ticket.userId).catch(() => null);
                const scheduler = await activeClient.users.fetch(ticket.interview.scheduledBy).catch(() => null);

                const reminderEmbed = createStyledEmbed({
                  emoji: '⏰',
                  title: 'Interview-Erinnerung!',
                  description: `Dein Interview beginnt in **${reminderMinutes} Minuten**!`,
                  fields: [
                    { name: 'Datum', value: `${interviewTime.toLocaleDateString('de-DE')} um ${interviewTime.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})} Uhr`, inline: false },
                    ...(ticket.interview.note ? [{ name: 'Notiz', value: ticket.interview.note, inline: false }] : [])
                  ],
                  color: '#FEE75C'
                });

                // DM an Bewerber
                if (applicant) {
                  await applicant.send({ embeds: [reminderEmbed] }).catch(e => console.log('DM to applicant failed:', e.message));
                  console.log(`✅ DM sent to applicant ${applicant.tag}`);
                }

                // DM an Scheduler
                if (scheduler) {
                  await scheduler.send({ embeds: [reminderEmbed] }).catch(e => console.log('DM to scheduler failed:', e.message));
                  console.log(`✅ DM sent to scheduler ${scheduler.tag}`);
                }

                // Ping im Ticket-Channel
                const ticketChannel = await activeClient.channels.fetch(ticket.channelId).catch(() => null);
                if (ticketChannel) {
                  await ticketChannel.send({
                    content: `<@${ticket.userId}> ⏰ **Dein Interview beginnt in ${reminderMinutes} Minuten!**`,
                    embeds: [reminderEmbed]
                  });
                  console.log(`✅ Channel ping sent to #${ticketChannel.name}`);
                }

                ticket.interview.reminderSent = true;
                needsSave = true;
                console.log(`✅ Interview reminder completed for Ticket #${ticket.id}`);
              } catch (e) { console.error('Interview reminder error:', e); }
            }
          }

          // Auto-Expire
          const autoExpireDays = cfg.applicationSystem.autoExpireDays || 0;
          if (autoExpireDays > 0) {
            const createdAt = new Date(ticket.createdAt);
            const expireAt = new Date(createdAt.getTime() + autoExpireDays * 24 * 60 * 60 * 1000);

            if (new Date() >= expireAt) {
              ticket.status = 'expired';
              ticket.expiredAt = new Date().toISOString();
              needsSave = true;

              // Close channel
              try {
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                  const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
                  if (channel) {
                    const expireEmbed = createStyledEmbed({
                      emoji: '⏰',
                      title: 'Bewerbung abgelaufen',
                      description: `Diese Bewerbung wurde automatisch geschlossen (${autoExpireDays} Tage ohne Antwort).`,
                      color: '#808080'
                    });
                    await channel.send({ embeds: [expireEmbed] });
                    setTimeout(() => channel.delete('Auto-Expire').catch(() => {}), 10000);
                  }
                }
              } catch (e) { console.error('Auto-expire error:', e); }
            }
          }
        }

        if (needsSave) saveTickets(guildId, tickets);
      }
    } catch (e) { console.error('Application services error:', e); }
  }, 5 * 60 * 1000); // Every 5 minutes
  console.log('📅 Application Services gestartet (Interview Reminders & Auto-Expire)');
}

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

    const dashboardUrl = (process.env.PUBLIC_BASE_URL || 'https://tickets.quantix-bot.de').replace(/\/+$/, '');

    // Build description
    let description = isGerman
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
    const welcomeEmbed = createStyledEmbed({
      emoji: '🎫',
      title: isGerman ? 'Willkommen bei Quantix Tickets!' : 'Welcome to Quantix Tickets!',
      description: description.replace(/\*/g, ''),
      color: '#57F287',
      thumbnail: client.user.displayAvatarURL({ size: 256 })
    });

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

function buildTicketEmbed(cfg, i, topic, nr, priority = 0){
  const guildId = i.guild?.id || i.guildId;
  const ticketCfg = cfg.ticketEmbed || {};
  const paddedNr = String(nr).padStart(5, '0');

  const rep = s => (s||'')
    .replace(/\{ticketNumber\}/g, paddedNr)
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id);

  // Berlin Zeit
  const now = new Date();
  const berlinTime = now.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Priority data
  const priorityEmojis = ['🟢', '🟠', '🔴'];
  const priorityNames = ['Niedrig', 'Mittel', 'Hoch'];
  const priorityColors = ['#57F287', '#FEE75C', '#ED4245'];

  const embedColor = ticketCfg.color && /^#?[0-9a-fA-F]{6}$/.test(ticketCfg.color)
    ? ticketCfg.color
    : priorityColors[priority] || '#5865F2';

  // Build styled embed with new design
  const e = new EmbedBuilder()
    .setTitle(`🎫 » Ticket #${paddedNr} «`)
    .setDescription(`*${rep(ticketCfg.description) || `Hallo <@${i.user.id}>`}*`)
    .setColor(parseInt(embedColor.replace('#', ''), 16))
    .addFields(
      { name: '» Thema «', value: topic.label || topic.value, inline: true },
      { name: '» Erstellt von «', value: `<@${i.user.id}>`, inline: true },
      { name: '» Status «', value: '🟢 Offen', inline: true },
      { name: '» Priorität «', value: `${priorityEmojis[priority]} ${priorityNames[priority]}`, inline: true }
    )
    .setFooter({ text: `${ticketCfg.footer || 'Quantix Tickets ©'} • ${berlinTime}` })
    .setTimestamp();

  // Add custom avatar/thumbnail if configured
  if(cfg.customAvatarUrl) {
    const avatarUrl = cfg.customAvatarUrl.startsWith('/')
      ? `${process.env.BASE_URL || 'https://tickets.quantix-bot.de'}${cfg.customAvatarUrl}`
      : cfg.customAvatarUrl;
    e.setThumbnail(avatarUrl);
  } else if(i.user.displayAvatarURL) {
    e.setThumbnail(i.user.displayAvatarURL({ size: 128 }));
  }

  return e;
}

function buildChannelName(ticketNumber, priorityIndex, isVIP = false, isClaimed = false, customChannelName = null){
  const num = ticketNumber.toString().padStart(5,'0');
  const st  = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  const vipPrefix = isVIP ? '✨vip-' : '';
  const claimedPrefix = isClaimed ? '🔒' : '';
  // Wenn customChannelName gesetzt, verwende es statt 'ticket'
  const baseName = customChannelName
    ? customChannelName.toLowerCase().replace(/[^a-z0-9äöüß\-]/gi, '-').replace(/-+/g, '-').substring(0, 20)
    : 'ticket';
  return `${PREFIX}${vipPrefix}${claimedPrefix}${st.dot}${baseName}-${num}`;
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
  // Verwende channelName wenn gesetzt, sonst topicLabel für Abwärtskompatibilität
  const customName = ticket.channelName || ticket.topicLabel || null;
  const desired = buildChannelName(ticket.id, ticket.priority||0, ticket.isVIP||false, isClaimed, customName);
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

  const embed = createStyledEmbed({
    emoji: '📋',
    title: 'Log',
    description: text,
    color: '#57F287'
  });

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

// Hilfsfunktion: Nachrichtenstatistiken für Ticket berechnen
async function getTicketMessageStats(channel) {
  try {
    let messages = [];
    let lastId;
    while (messages.length < 1000) {
      const fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
      if (!fetched || fetched.size === 0) break;
      messages.push(...fetched.values());
      lastId = fetched.last().id;
    }

    // Zähle Nachrichten pro User (nur echte Nachrichten, keine Bots)
    const userStats = new Map();
    let totalMessages = 0;

    for (const msg of messages) {
      // Skip Bot-Nachrichten und System-Nachrichten
      if (msg.author.bot) continue;

      totalMessages++;
      const userId = msg.author.id;
      const userName = msg.author.username || msg.author.tag || userId;

      if (userStats.has(userId)) {
        userStats.get(userId).count++;
      } else {
        userStats.set(userId, { userId, userName, count: 1 });
      }
    }

    // Sortiere nach Anzahl (höchste zuerst)
    const sortedStats = Array.from(userStats.values())
      .sort((a, b) => b.count - a.count);

    return {
      totalMessages,
      userStats: sortedStats
    };
  } catch (err) {
    console.error('Error getting message stats:', err);
    return { totalMessages: 0, userStats: [] };
  }
}

// Hilfsfunktion: Ticket-Namen für Transcript basierend auf Topic-Einstellung ermitteln
function getTicketDisplayName(channelName, ticket, cfg) {
  try {
    // Wenn kein Topic oder keine Topics-Config, Channel-Namen verwenden
    if (!ticket.topic || !cfg.topics || !Array.isArray(cfg.topics)) {
      return channelName;
    }

    // Topic in Config finden
    const topicConfig = cfg.topics.find(t => t.value === ticket.topic);
    if (!topicConfig) {
      return channelName;
    }

    // Prüfe ticketNameDisplay-Einstellung
    if (topicConfig.ticketNameDisplay === 'topic') {
      return topicConfig.label || channelName;
    }

    return channelName;
  } catch (err) {
    console.error('Error getting ticket display name:', err);
    return channelName;
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
    .avatar-container { width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 255, 136, 0.3); }
    .avatar-img { width: 100%; height: 100%; object-fit: cover; }
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

    // Discord Avatar URL abrufen
    const avatarUrl = message.author?.displayAvatarURL({ size: 128, extension: 'png' }) || null;
    const avatarHTML = avatarUrl
      ? `<div class="avatar-container"><img src="${avatarUrl}" alt="${author}" class="avatar-img" onerror="this.parentElement.outerHTML='<div class=\\'avatar-fallback\\'>${authorInitial}</div>'"></div>`
      : `<div class="avatar-fallback">${authorInitial}</div>`;

    let htmlMessage = `
      <div class="message">
        ${avatarHTML}
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

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const member = newState.member || oldState.member;
    console.log(`🎤 VoiceStateUpdate: ${member.user.tag} | Old: ${oldState.channelId} | New: ${newState.channelId}`);

    if (oldState.channelId !== newState.channelId) {
      if (newState.channelId) {
        console.log(`✅ User joined channel: ${newState.channel?.name}`);
        await handleVoiceJoin(oldState, newState);
      }
      if (oldState.channelId) {
        console.log(`❌ User left channel: ${oldState.channel?.name}`);
        await handleVoiceLeave(oldState, newState);
      }
    }
  } catch (err) {
    console.error('❌ Error in VoiceStateUpdate event:', err);
    console.error('Stack:', err.stack);
  }
});

client.on(Events.InteractionCreate, async i => {
  try {
    // Custom Bot Check - Wenn ein Custom Bot für diese Guild aktiv ist,
    // soll der Haupt-Bot die Interaction ignorieren (Custom Bot übernimmt)
    if (i.guild) {
      try {
        const customBotManager = require('./custom-bot-manager.js');
        if (customBotManager.isCustomBotActive(i.guild.id)) {
          // Custom Bot ist aktiv - Haupt-Bot ignoriert diese Interaction
          // Der Custom Bot hat seinen eigenen Handler
          return;
        }
      } catch (err) {
        // Fehler beim Laden des Custom Bot Managers - Haupt-Bot übernimmt
        console.error('[Main Bot] Custom Bot Manager error, taking over:', err.message);
      }
    }

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
        const maintenanceEmbed = createStyledEmbed({
          emoji: '🔧',
          title: 'Wartungsmodus aktiv',
          description: 'Der Bot befindet sich derzeit im Wartungsmodus. Alle Funktionen sind vorübergehend deaktiviert.',
          fields: [
            { name: 'Grund', value: maintenanceState.reason || 'Wartungsarbeiten', inline: false },
            { name: 'Seit', value: `<t:${Math.floor(maintenanceState.enabledAt / 1000)}:R>`, inline: true }
          ],
          color: '#FEE75C'
        });

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

        // Update bot status - CRITICAL: Set DND status
        try {
          const presenceData = {
            activities: [{
              name: 'Custom Status',
              type: 4,
              state: '🔧 Wartungsmodus | Under Maintenance'
            }],
            status: 'dnd'
          };

          await i.client.user.setPresence(presenceData);
          console.log('✅ Bot Status gesetzt: DND mit Wartungsmodus-Activity');
          console.log('📊 Presence Data:', JSON.stringify(presenceData, null, 2));

          // Force status update multiple times to ensure it's applied
          setTimeout(async () => {
            try {
              await i.client.user.setPresence(presenceData);
              console.log('✅ Bot Status erneut gesetzt (Force Update 1/3 - 2s)');
            } catch (retryErr) {
              console.error('❌ Error in retry setting bot status:', retryErr);
            }
          }, 2000);

          setTimeout(async () => {
            try {
              await i.client.user.setPresence(presenceData);
              console.log('✅ Bot Status erneut gesetzt (Force Update 2/3 - 5s)');
            } catch (retryErr) {
              console.error('❌ Error in retry setting bot status:', retryErr);
            }
          }, 5000);

          setTimeout(async () => {
            try {
              await i.client.user.setPresence(presenceData);
              console.log('✅ Bot Status erneut gesetzt (Force Update 3/3 - 10s)');
              console.log('📊 Final Bot Status:', i.client.user.presence?.status || 'unknown');
            } catch (retryErr) {
              console.error('❌ Error in retry setting bot status:', retryErr);
            }
          }, 10000);
        } catch (err) {
          console.error('❌ Error setting bot status:', err);
          console.error('Error Details:', err.stack);
        }

        const enableEmbed = createStyledEmbed({
          emoji: '🔧',
          title: 'Wartungsmodus aktiviert',
          description: 'Der Bot wurde in den Wartungsmodus versetzt. Der Bot funktioniert nur noch auf dem whitelisted Server.',
          fields: [
            { name: 'Status', value: '🔴 Nicht stören (DND)', inline: true },
            { name: 'Grund', value: reason, inline: true },
            { name: 'Whitelisted Server', value: `\`${maintenanceCommand.WHITELISTED_SERVER_ID}\``, inline: false }
          ],
          color: '#FEE75C'
        });

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
      const guildId = i.guild.id;
      if(i.values[0] === 'none') return i.reply({content:'⚠️ Keine Topics konfiguriert. Bitte konfiguriere zuerst Topics im Panel.',ephemeral:true});
      const topic = cfg.topics?.find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema',ephemeral:true});

      // Rollen-Berechtigung prüfen
      if (cfg.ticketCreationRestricted && cfg.allowedTicketRoles && cfg.allowedTicketRoles.length > 0) {
        const member = i.member;
        const hasAllowedRole = cfg.allowedTicketRoles.some(roleId => member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
          const roleMentions = cfg.allowedTicketRoles.map(roleId => `<@&${roleId}>`).join('\n');
          const noPermEmbed = createStyledEmbed({
            emoji: '🔒',
            title: 'Keine Berechtigung',
            description: 'Du hast nicht die erforderliche Rolle, um ein Ticket zu erstellen.',
            fields: [
              { name: 'Erforderliche Rollen', value: roleMentions || 'Keine konfiguriert', inline: false }
            ],
            color: '#ED4245',
            footer: 'Quantix Tickets • Zugriff verweigert'
          });
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }
      }

      // Blacklist-Check
      if (cfg.ticketBlacklist && Array.isArray(cfg.ticketBlacklist)) {
        const now = new Date();
        const blacklist = cfg.ticketBlacklist.find(b => b.userId === i.user.id);

        if (blacklist) {
          if (!blacklist.isPermanent && new Date(blacklist.expiresAt) <= now) {
            // Abgelaufen - entfernen
            cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== i.user.id);
            writeCfg(guildId, cfg);
          } else {
            // User ist auf Blacklist
            const expiryText = blacklist.isPermanent
              ? t(guildId, 'ticketBlacklist.permanent') || '♾️ Permanent'
              : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`;

            const blacklistEmbed = createStyledEmbed({
              emoji: '🚫',
              title: t(guildId, 'ticketBlacklist.user_blacklisted') || 'Auf der Blacklist',
              description: t(guildId, 'ticketBlacklist.blocked_error', {
                reason: blacklist.reason,
                duration: expiryText
              }) || `Du bist auf der Ticket-Blacklist.\n\nGrund: ${blacklist.reason}\nDauer: ${expiryText}`,
              color: '#ED4245',
              footer: 'Quantix Tickets • Zugriff verweigert'
            });

            return i.reply({ embeds: [blacklistEmbed], ephemeral: true });
          }
        }
      }

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
          const faqFields = relevantFAQs.slice(0, 5).map((faq, index) => ({
            name: `${index + 1}. ${faq.question}`,
            value: faq.answer.substring(0, 1024),
            inline: false
          }));

          const faqEmbed = createStyledEmbed({
            emoji: '💡',
            title: 'Häufig gestellte Fragen',
            description: `Bevor du ein Ticket erstellst, schau dir diese häufig gestellten Fragen an.\n\nThema: ${topic.label}`,
            fields: faqFields,
            color: '#57F287',
            footer: 'Quantix Tickets • FAQ System'
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

    // Ticket Merge Select Menu Handler
    if(i.isStringSelectMenu() && i.customId.startsWith('merge_ticket_select:')){
      const guildId = i.guild.id;
      const targetTicketId = parseInt(i.customId.split(':')[1]);
      const sourceTicketId = parseInt(i.values[0]);

      await i.deferUpdate();

      try {
        const cfg = readCfg(guildId);
        const tickets = loadTickets(guildId);

        const targetTicket = tickets.find(t => t.id === targetTicketId);
        const sourceTicket = tickets.find(t => t.id === sourceTicketId);

        if (!targetTicket || !sourceTicket) {
          return i.followUp({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
        }

        if (sourceTicket.status === 'merged' || sourceTicket.status !== 'offen') {
          return i.followUp({ content: '❌ Das Quell-Ticket kann nicht zusammengeführt werden.', ephemeral: true });
        }

        // 1. Übernehme Added Users
        const newAddedUsers = [...new Set([
          ...(targetTicket.addedUsers || []),
          ...(sourceTicket.addedUsers || []),
          sourceTicket.userId
        ])].filter(uid => uid !== targetTicket.userId);

        targetTicket.addedUsers = newAddedUsers;

        // 2. Übernehme Notizen
        if (sourceTicket.notes && sourceTicket.notes.length > 0) {
          if (!targetTicket.notes) targetTicket.notes = [];
          for (const note of sourceTicket.notes) {
            targetTicket.notes.push({
              ...note,
              content: `[Aus Ticket #${sourceTicketId}] ${note.content}`
            });
          }
        }

        // 3. Übernehme FormData als Notiz
        if (sourceTicket.formData && Object.keys(sourceTicket.formData).length > 0) {
          if (!targetTicket.notes) targetTicket.notes = [];
          const formSummary = Object.entries(sourceTicket.formData)
            .map(([k, v]) => `**${k}:** ${v}`)
            .join('\n');
          targetTicket.notes.push({
            userId: i.user.id,
            content: `[Formular aus Ticket #${sourceTicketId}]\n${formSummary}`,
            timestamp: Date.now()
          });
        }

        // 4. Speichere Merge-Verlinkung
        if (!targetTicket.mergedFrom) targetTicket.mergedFrom = [];
        targetTicket.mergedFrom.push(sourceTicketId);

        sourceTicket.mergedTo = targetTicketId;
        sourceTicket.mergedAt = Date.now();
        sourceTicket.mergedBy = i.user.id;
        sourceTicket.status = 'merged';

        // 5. Hole Nachrichten-Log aus Quell-Ticket
        let messageLog = '';
        try {
          const sourceChannel = await i.guild.channels.fetch(sourceTicket.channelId).catch(() => null);
          if (sourceChannel) {
            const messages = await sourceChannel.messages.fetch({ limit: 50 });
            const sortedMessages = [...messages.values()].reverse();
            messageLog = sortedMessages
              .filter(m => !m.author.bot)
              .slice(0, 20)
              .map(m => `**${m.author.username}** (${new Date(m.createdTimestamp).toLocaleString('de-DE')}): ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`)
              .join('\n');
          }
        } catch (e) {
          console.error('Fehler beim Laden der Nachrichten:', e);
        }

        saveTickets(guildId, tickets);

        // 6. Sende Merge-Embed ins Ziel-Ticket
        const mergeCompleteEmbed = createStyledEmbed({
          emoji: '🔗',
          title: t(guildId, 'merge.complete_title') || 'Ticket zusammengeführt',
          description: t(guildId, 'merge.complete_description', {
            sourceId: sourceTicketId,
            userId: sourceTicket.userId
          }) || `Ticket **#${sourceTicketId}** von <@${sourceTicket.userId}> wurde in dieses Ticket zusammengeführt.`,
          fields: [
            { name: 'Quell-Ticket', value: `#${sourceTicketId}`, inline: true },
            { name: 'Ersteller', value: `<@${sourceTicket.userId}>`, inline: true },
            { name: 'Zusammengeführt von', value: `<@${i.user.id}>`, inline: true }
          ]
        });

        // Füge Nachrichten-Log hinzu wenn vorhanden
        if (messageLog && messageLog.length > 0) {
          const truncatedLog = messageLog.length > 1000 ? messageLog.substring(0, 1000) + '...' : messageLog;
          mergeCompleteEmbed.addFields({ name: '💬 Letzte Nachrichten', value: truncatedLog, inline: false });
        }

        await i.channel.send({ embeds: [mergeCompleteEmbed] });

        // 7. Füge Berechtigungen für neue User hinzu
        for (const uid of newAddedUsers) {
          try {
            await i.channel.permissionOverwrites.create(uid, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true
            });
          } catch (e) {
            console.error(`Fehler beim Setzen der Berechtigung für ${uid}:`, e);
          }
        }

        // 8. Archiviere Quell-Ticket (sperren + Nachricht)
        try {
          const sourceChannel = await i.guild.channels.fetch(sourceTicket.channelId).catch(() => null);
          if (sourceChannel) {
            const archiveEmbed = createStyledEmbed({
              emoji: '📦',
              title: t(guildId, 'merge.archived_title') || 'Ticket archiviert',
              description: t(guildId, 'merge.archived_description', { targetId: targetTicketId }) || `Dieses Ticket wurde in **Ticket #${targetTicketId}** zusammengeführt. Der Channel ist jetzt gesperrt.`,
              fields: [
                { name: 'Ziel-Ticket', value: `<#${targetTicket.channelId}>`, inline: true },
                { name: 'Zusammengeführt von', value: `<@${i.user.id}>`, inline: true }
              ],
              color: '#808080'
            });

            await sourceChannel.send({ embeds: [archiveEmbed] });

            // Sperre den Channel (niemand kann mehr schreiben)
            await sourceChannel.permissionOverwrites.edit(i.guild.id, {
              SendMessages: false
            });

            // Rename Channel um Status zu zeigen
            const newName = sourceChannel.name.replace(/^(🟢|🟠|🔴)?/, '📦-merged-');
            await sourceChannel.setName(newName.substring(0, 100)).catch(() => {});
          }
        } catch (e) {
          console.error('Fehler beim Archivieren des Quell-Tickets:', e);
        }

        // Log Event
        logEvent(i.guild, t(guildId, 'logs.ticket_merged', {
          sourceId: sourceTicketId,
          targetId: targetTicketId,
          user: `<@${i.user.id}>`
        }) || `🔗 Ticket #${sourceTicketId} wurde in #${targetTicketId} zusammengeführt von <@${i.user.id}>`);

        await i.followUp({
          content: t(guildId, 'merge.success') || `✅ Ticket #${sourceTicketId} wurde erfolgreich zusammengeführt!`,
          ephemeral: true
        });

      } catch (err) {
        console.error('Merge Fehler:', err);
        await i.followUp({ content: '❌ Fehler beim Zusammenführen der Tickets.', ephemeral: true });
      }
      return;
    }

    // Application Category Select Menu Handler
    if(i.isStringSelectMenu() && i.customId.startsWith('application_category_select:')){
      const guildId = i.customId.split(':')[1];
      if(guildId !== i.guild.id) return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});

      const cfg = readCfg(guildId);
      const categories = cfg.applicationSystem?.categories || [];
      const selectedIndex = parseInt(i.values[0]);
      const selectedCategory = categories[selectedIndex];

      if(!selectedCategory){
        return i.reply({ephemeral:true, content:'❌ Ungültige Kategorie ausgewählt.'});
      }

      // Check if category is closed
      if(selectedCategory.status === 'closed'){
        return i.reply({
          ephemeral:true,
          content:`❌ **${selectedCategory.emoji || '📋'} ${selectedCategory.name}** ist derzeit geschlossen und nimmt keine Bewerbungen an.`
        });
      }

      const formFields = selectedCategory.formFields || [];
      if(formFields.length === 0){
        return i.reply({
          ephemeral:true,
          content:`❌ Keine Fragen für die Kategorie "${selectedCategory.name}" konfiguriert.`
        });
      }

      // Multi-modal support: page 0 = first 5 questions
      const totalPages = Math.ceil(formFields.length / 5);
      const currentPage = 0;
      const pageFields = formFields.slice(currentPage * 5, (currentPage + 1) * 5);

      const modal = new ModalBuilder()
        .setCustomId(`modal_application_cat:${guildId}:${selectedIndex}:${currentPage}:${totalPages}`)
        .setTitle(`${selectedCategory.emoji || '📝'} ${selectedCategory.name}${totalPages > 1 ? ` (${currentPage + 1}/${totalPages})` : ''}`.substring(0,45));

      pageFields.forEach((field) => {
        let inputStyle = TextInputStyle.Short;
        let placeholder = '';
        let maxLength = 256;

        if (field.style === 'paragraph') {
          inputStyle = TextInputStyle.Paragraph;
          maxLength = 1024;
        } else if (field.style === 'number') {
          inputStyle = TextInputStyle.Short;
          placeholder = 'Nur Zahlen erlaubt (z.B. 123 oder 45.67)';
          maxLength = 50;
        }

        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label.substring(0,45))
          .setStyle(inputStyle)
          .setRequired(field.required !== false)
          .setMaxLength(maxLength)
          .setMinLength(field.style === 'number' && field.required !== false ? 1 : 0);

        if(placeholder) input.setPlaceholder(placeholder);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
      });

      await i.showModal(modal);
      return;
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

    // Forward Modal Handler
    if(i.isModalSubmit() && i.customId.startsWith('forward_modal_')){
      const parts = i.customId.replace('forward_modal_', '').split('_');
      const targetType = parts[0]; // 'user' or 'role'
      const targetId = parts[1];
      const reason = i.fields.getTextInputValue('forward_reason');
      const guildId = i.guild.id;

      await i.deferReply();

      try {
        const tickets = loadTickets(guildId);
        const ticketIndex = tickets.findIndex(t => t.channelId === i.channel.id);

        if(ticketIndex === -1){
          return i.editReply({ content: '❌ Ticket nicht gefunden.' });
        }

        const ticket = tickets[ticketIndex];
        const oldClaimer = ticket.claimer;

        if(targetType === 'user'){
          // Forward to specific user
          ticket.claimer = targetId;

          // Update channel permissions
          await i.channel.permissionOverwrites.edit(oldClaimer, {
            ViewChannel: true,
            SendMessages: false
          }).catch(() => {});

          await i.channel.permissionOverwrites.edit(targetId, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            EmbedLinks: true
          });

          // Add forward history
          if(!ticket.forwardHistory) ticket.forwardHistory = [];
          ticket.forwardHistory.push({
            from: oldClaimer,
            to: targetId,
            type: 'user',
            reason: reason,
            timestamp: Date.now()
          });

          tickets[ticketIndex] = ticket;
          saveTickets(guildId, tickets);

          const forwardEmbed = createStyledEmbed({
            emoji: '🔄',
            title: 'Ticket weitergeleitet',
            description: `Dieses Ticket wurde an <@${targetId}> weitergeleitet.`,
            fields: [
              { name: 'Von', value: `<@${oldClaimer}>`, inline: true },
              { name: 'An', value: `<@${targetId}>`, inline: true },
              { name: 'Grund', value: reason, inline: false }
            ]
          });

          await i.editReply({ embeds: [forwardEmbed] });

          // Ping new claimer
          await i.channel.send({ content: `<@${targetId}> Du hast ein weitergeleitetes Ticket erhalten!` });

        } else if(targetType === 'role'){
          // Forward to role - unclaim and notify role
          ticket.claimer = null;

          // Reset channel permissions for role
          await i.channel.permissionOverwrites.edit(oldClaimer, {
            ViewChannel: true,
            SendMessages: false
          }).catch(() => {});

          await i.channel.permissionOverwrites.edit(targetId, {
            ViewChannel: true,
            SendMessages: true
          });

          // Add forward history
          if(!ticket.forwardHistory) ticket.forwardHistory = [];
          ticket.forwardHistory.push({
            from: oldClaimer,
            to: targetId,
            type: 'role',
            reason: reason,
            timestamp: Date.now()
          });

          tickets[ticketIndex] = ticket;
          saveTickets(guildId, tickets);

          const forwardEmbed = createStyledEmbed({
            emoji: '🔄',
            title: 'Ticket weitergeleitet',
            description: `Dieses Ticket wurde an <@&${targetId}> weitergeleitet.`,
            fields: [
              { name: 'Von', value: `<@${oldClaimer}>`, inline: true },
              { name: 'An Rolle', value: `<@&${targetId}>`, inline: true },
              { name: 'Grund', value: reason, inline: false }
            ]
          });

          await i.editReply({ embeds: [forwardEmbed] });

          // Ping role
          await i.channel.send({ content: `<@&${targetId}> Dieses Ticket wartet auf Übernahme!` });
        }

        // Log event
        await logEvent(i.guild, `🔄 **Ticket weitergeleitet:** <@${oldClaimer}> hat Ticket #${ticket.id} an ${targetType === 'user' ? `<@${targetId}>` : `<@&${targetId}>`} weitergeleitet. Grund: ${reason}`);

      } catch(err){
        console.error('Forward modal error:', err);
        await i.editReply({ content: '❌ Fehler beim Weiterleiten des Tickets.' });
      }
      return;
    }

    if(i.isModalSubmit() && i.customId.startsWith('modal_newticket:')){
      const guildId = i.guild.id;
      const topicValue = i.customId.split(':')[1];
      const topic = cfg.topics?.find(t=>t.value===topicValue);

      if(!topic) {
        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Ungültiges Thema',
          description: 'Das gewählte Ticket-Thema ist nicht mehr verfügbar. Bitte wähle ein anderes Thema aus dem Ticket-Panel.',
          color: '#ED4245'
        });
        return i.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // Rollen-Berechtigung prüfen
      if (cfg.ticketCreationRestricted && cfg.allowedTicketRoles && cfg.allowedTicketRoles.length > 0) {
        const member = i.member;
        const hasAllowedRole = cfg.allowedTicketRoles.some(roleId => member.roles.cache.has(roleId));
        if (!hasAllowedRole) {
          const roleMentions = cfg.allowedTicketRoles.map(roleId => `<@&${roleId}>`).join('\n');
          const noPermEmbed = createStyledEmbed({
            emoji: '🔒',
            title: 'Keine Berechtigung',
            description: 'Du hast nicht die erforderliche Rolle, um ein Ticket zu erstellen.',
            fields: [
              { name: 'Erforderliche Rollen', value: roleMentions || 'Keine konfiguriert', inline: false }
            ],
            color: '#ED4245',
            footer: 'Quantix Tickets • Zugriff verweigert'
          });
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }
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

            const blacklistEmbed = createStyledEmbed({
              emoji: '🚫',
              title: t(guildId, 'ticketBlacklist.user_blacklisted'),
              description: t(guildId, 'ticketBlacklist.blocked_error', {
                reason: blacklist.reason,
                duration: expiryText
              }),
              color: '#ED4245'
            });

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

      // Defer reply to show progress messages
      await i.deferReply({ ephemeral: true });

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
      const guildId = i.guild.id;
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

        // Rollen-Berechtigung prüfen
        if (cfg.ticketCreationRestricted && cfg.allowedTicketRoles && cfg.allowedTicketRoles.length > 0) {
          const member = i.member;
          const hasAllowedRole = cfg.allowedTicketRoles.some(roleId => member.roles.cache.has(roleId));
          if (!hasAllowedRole) {
            const roleMentions = cfg.allowedTicketRoles.map(roleId => `<@&${roleId}>`).join('\n');
            const noPermEmbed = createStyledEmbed({
              emoji: '🔒',
              title: 'Keine Berechtigung',
              description: 'Du hast nicht die erforderliche Rolle, um ein Ticket zu erstellen.',
              fields: [
                { name: 'Erforderliche Rollen', value: roleMentions || 'Keine konfiguriert', inline: false }
              ],
              color: '#ED4245',
              footer: 'Quantix Tickets • Zugriff verweigert'
            });
            return i.reply({ embeds: [noPermEmbed], ephemeral: true });
          }
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

              const blacklistEmbed = createStyledEmbed({
                emoji: '🚫',
                title: t(guildId, 'ticketBlacklist.user_blacklisted'),
                description: t(guildId, 'ticketBlacklist.blocked_error', {
                  reason: blacklist.reason,
                  duration: expiryText
                }),
                color: '#ED4245',
                footer: 'Quantix Tickets • Zugriff verweigert'
              });

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

        // Defer reply to show progress messages
        await i.deferReply({ ephemeral: true });

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
        if (field.style === 'number') {
          const value = answers[field.id] ? answers[field.id].trim() : '';

          // Check if required and empty
          if (field.required !== false && !value) {
            return i.reply({
              ephemeral: true,
              content: `❌ **${field.label}** ist ein Pflichtfeld und muss ausgefüllt werden!`
            });
          }

          // Check if value is a valid number (allow integers and decimals)
          if (value && !/^-?\d+([.,]\d+)?$/.test(value)) {
            return i.reply({
              ephemeral: true,
              content: `❌ **${field.label}** darf nur Zahlen enthalten!\n\n✅ Erlaubt: 123, 45.67, 12,5, -10\n❌ Nicht erlaubt: abc, 12a, #123`
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

        const formFieldsData = formFields.map(field => ({
          name: field.label,
          value: (answers[field.id] || 'Nicht beantwortet').substring(0, 1024),
          inline: false
        }));

        const ticketEmbed = createStyledEmbed({
          emoji: '📝',
          title: ticketTitle.replace(/^📝\s*/, ''),
          description: ticketDescription,
          fields: formFieldsData,
          color: ticketColor,
          footer: `Bewerbung #${counter} • ${i.guild.name}`,
          thumbnail: i.user.displayAvatarURL({ size: 128 })
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

    // Application Modal Submit Handler (Category-based with multi-page support)
    if(i.isModalSubmit() && i.customId.startsWith('modal_application_cat:')){
      const parts = i.customId.split(':');
      const guildId = parts[1];
      const categoryIndex = parseInt(parts[2]);
      const currentPage = parseInt(parts[3]) || 0;
      const totalPages = parseInt(parts[4]) || 1;

      if(guildId !== i.guild.id) return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});

      const cfg = readCfg(guildId);
      if(!cfg || !cfg.applicationSystem || !cfg.applicationSystem.enabled){
        return i.reply({ephemeral:true, content:'❌ Das Bewerbungssystem ist nicht aktiviert.'});
      }

      const categories = cfg.applicationSystem.categories || [];
      const selectedCategory = categories[categoryIndex];

      if(!selectedCategory){
        return i.reply({ephemeral:true, content:'❌ Ungültige Bewerbungskategorie.'});
      }

      const formFields = selectedCategory.formFields || [];

      // Get answers from current page fields only
      const pageFields = formFields.slice(currentPage * 5, (currentPage + 1) * 5);
      const pageAnswers = {};
      pageFields.forEach(f => {
        try {
          pageAnswers[f.id] = i.fields.getTextInputValue(f.id);
        } catch(e) {
          pageAnswers[f.id] = '';
        }
      });

      // Validate number fields for current page
      for (const field of pageFields) {
        if (field.style === 'number') {
          const value = pageAnswers[field.id] ? pageAnswers[field.id].trim() : '';
          if (field.required !== false && !value) {
            return i.reply({ephemeral: true, content: `❌ **${field.label}** ist ein Pflichtfeld!`});
          }
          if (value && !/^-?\d+([.,]\d+)?$/.test(value)) {
            return i.reply({ephemeral: true, content: `❌ **${field.label}** darf nur Zahlen enthalten!`});
          }
        }
      }

      // Get previous answers from temp storage (if multi-page)
      const tempKey = `app_answers_${i.user.id}_${guildId}_${categoryIndex}`;
      let allAnswers = {};
      if (global.tempAppAnswers && global.tempAppAnswers[tempKey]) {
        allAnswers = { ...global.tempAppAnswers[tempKey] };
      }

      // Merge current page answers
      Object.assign(allAnswers, pageAnswers);

      // Check if more pages remaining
      if (currentPage + 1 < totalPages) {
        // Store answers temporarily
        if (!global.tempAppAnswers) global.tempAppAnswers = {};
        global.tempAppAnswers[tempKey] = allAnswers;

        // Show next modal
        const nextPage = currentPage + 1;
        const nextPageFields = formFields.slice(nextPage * 5, (nextPage + 1) * 5);

        const modal = new ModalBuilder()
          .setCustomId(`modal_application_cat:${guildId}:${categoryIndex}:${nextPage}:${totalPages}`)
          .setTitle(`${selectedCategory.emoji || '📝'} ${selectedCategory.name} (${nextPage + 1}/${totalPages})`.substring(0,45));

        nextPageFields.forEach((field) => {
          let inputStyle = TextInputStyle.Short;
          let placeholder = '';
          let maxLength = 256;

          if (field.style === 'paragraph') {
            inputStyle = TextInputStyle.Paragraph;
            maxLength = 1024;
          } else if (field.style === 'number') {
            inputStyle = TextInputStyle.Short;
            placeholder = 'Nur Zahlen erlaubt (z.B. 123 oder 45.67)';
            maxLength = 50;
          }

          const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label.substring(0,45))
            .setStyle(inputStyle)
            .setRequired(field.required !== false)
            .setMaxLength(maxLength)
            .setMinLength(field.style === 'number' && field.required !== false ? 1 : 0);

          if(placeholder) input.setPlaceholder(placeholder);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
        });

        await i.showModal(modal);
        return;
      }

      // Final page - clean up temp storage
      if (global.tempAppAnswers && global.tempAppAnswers[tempKey]) {
        delete global.tempAppAnswers[tempKey];
      }

      // Use allAnswers for ticket creation
      const answers = allAnswers;

      try {
        await i.deferReply({ ephemeral: true });

        const tickets = loadTickets(guildId);
        const counter = nextTicket(guildId);

        const categoryId = cfg.applicationSystem.categoryId;
        if(!categoryId){
          return i.editReply({content: '❌ Keine Bewerbungs-Kategorie konfiguriert.'});
        }

        // Channel name with category
        const sanitizedUsername = i.user.username.replace(/[^a-zA-Z0-9]/g, '').substring(0,12).toLowerCase() || 'user';
        const sanitizedCatName = selectedCategory.name.replace(/[^a-zA-Z0-9]/g, '').substring(0,8).toLowerCase() || 'app';
        const channelName = `${PREFIX}${sanitizedCatName}-${counter}-${sanitizedUsername}`;

        const channel = await i.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId,
          topic: `${selectedCategory.emoji || '📝'} ${selectedCategory.name} Bewerbung #${counter} von ${i.user.tag}`,
          permissionOverwrites: [
            {id: i.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel]},
            {id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles]},
            {id: i.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory]}
          ]
        });

        // Add team role permissions (category-specific or fallback)
        const teamRoleId = selectedCategory.teamRoleId || cfg.applicationSystem.teamRoleId;
        if(teamRoleId){
          await channel.permissionOverwrites.create(teamRoleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            ManageMessages: true
          });
        }

        // Build ticket embed
        const ticketColor = cfg.applicationSystem.ticketColor || '#10b981';
        const ticketColorInt = parseInt(ticketColor.replace('#', ''), 16);

        let ticketTitle = cfg.applicationSystem.ticketTitle || '📝 Bewerbung von {username}';
        let ticketDescription = cfg.applicationSystem.ticketDescription || 'Willkommen {username}! Vielen Dank für deine Bewerbung.';

        ticketTitle = ticketTitle.replace(/\{username\}/g, i.user.username).replace(/\{userId\}/g, i.user.id).replace(/\{userTag\}/g, i.user.tag);
        ticketDescription = ticketDescription.replace(/\{username\}/g, i.user.username).replace(/\{userId\}/g, i.user.id).replace(/\{userTag\}/g, i.user.tag);

        const categoryFormFields = formFields.map(field => ({
          name: field.label,
          value: (answers[field.id] || 'Nicht beantwortet').substring(0, 1024),
          inline: false
        }));

        const ticketEmbed = createStyledEmbed({
          emoji: selectedCategory.emoji || '📝',
          title: ticketTitle,
          description: `Kategorie: ${selectedCategory.name}\n\n${ticketDescription}`,
          fields: categoryFormFields,
          color: ticketColor,
          footer: `${selectedCategory.name} Bewerbung #${counter} • ${i.guild.name}`,
          thumbnail: i.user.displayAvatarURL({ size: 128 })
        });

        const acceptButton = new ButtonBuilder().setCustomId(`accept_application_${guildId}`).setLabel('Annehmen').setStyle(ButtonStyle.Success).setEmoji('✅');
        const rejectButton = new ButtonBuilder().setCustomId(`reject_application_${guildId}`).setLabel('Ablehnen').setStyle(ButtonStyle.Danger).setEmoji('❌');
        const noteButton = new ButtonBuilder().setCustomId(`app_note_${guildId}:${counter}`).setLabel('Notiz').setStyle(ButtonStyle.Secondary).setEmoji('📝');
        const viewNotesButton = new ButtonBuilder().setCustomId(`app_notes_view_${guildId}:${counter}`).setLabel('Notizen').setStyle(ButtonStyle.Secondary).setEmoji('📋');
        const buttonRow = new ActionRowBuilder().addComponents(acceptButton, rejectButton, noteButton, viewNotesButton);

        // Second row with interview button (if enabled)
        const components = [buttonRow];
        if (cfg.applicationSystem.interviewEnabled) {
          const interviewButton = new ButtonBuilder().setCustomId(`app_interview_${guildId}:${counter}`).setLabel('Interview planen').setStyle(ButtonStyle.Primary).setEmoji('📅');
          const secondRow = new ActionRowBuilder().addComponents(interviewButton);
          components.push(secondRow);
        }

        const ticketMessage = await channel.send({content: `<@${i.user.id}>`, embeds: [ticketEmbed], components});

        // Save ticket
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
          applicationCategory: selectedCategory.name,
          applicationCategoryIndex: categoryIndex,
          applicationAnswers: answers,
          votes: { up: [], down: [] },
          notes: []
        };

        tickets.push(newTicket);
        saveTickets(guildId, tickets);

        // Post to voting channel (if enabled)
        if (cfg.applicationSystem.votingEnabled && cfg.applicationSystem.votingChannelId) {
          try {
            const votingChannel = await i.guild.channels.fetch(cfg.applicationSystem.votingChannelId);
            if (votingChannel) {
              const voteEmbed = createStyledEmbed({
                emoji: '🗳️',
                title: `Abstimmung: ${selectedCategory.emoji || '📝'} ${selectedCategory.name}`,
                description: `Bewerber: <@${i.user.id}> (${i.user.tag})\nTicket: <#${channel.id}>\nBewerbung: #${counter}\n\nBitte stimmt über diese Bewerbung ab!`,
                fields: [
                  { name: '👍 Dafür', value: '0', inline: true },
                  { name: '👎 Dagegen', value: '0', inline: true }
                ],
                color: '#6366F1',
                footer: `Bewerbung #${counter} • Abstimmung`,
                thumbnail: i.user.displayAvatarURL({ size: 128 })
              });

              const voteUpButton = new ButtonBuilder().setCustomId(`app_vote_up_${guildId}:${counter}`).setLabel('Dafür').setStyle(ButtonStyle.Success).setEmoji('👍');
              const voteDownButton = new ButtonBuilder().setCustomId(`app_vote_down_${guildId}:${counter}`).setLabel('Dagegen').setStyle(ButtonStyle.Danger).setEmoji('👎');
              const voteRow = new ActionRowBuilder().addComponents(voteUpButton, voteDownButton);

              const voteMessage = await votingChannel.send({ embeds: [voteEmbed], components: [voteRow] });

              // Save voting message ID
              newTicket.votingMessageId = voteMessage.id;
              newTicket.votingChannelId = votingChannel.id;
              saveTickets(guildId, tickets);
            }
          } catch (voteErr) {
            console.error('Error posting to voting channel:', voteErr);
          }
        }

        // Initialize transcript
        const transcriptDir = path.join(__dirname, 'transcripts', guildId);
        if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });
        const txtPath = path.join(transcriptDir, `transcript_${counter}.txt`);
        const htmlPath = path.join(transcriptDir, `transcript_${counter}.html`);
        fs.writeFileSync(txtPath, `${selectedCategory.name} Bewerbung #${counter} - ${i.user.tag}\nErstellt am: ${new Date().toLocaleString('de-DE')}\n\n`, 'utf8');
        fs.writeFileSync(htmlPath, `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${selectedCategory.name} Bewerbung #${counter}</title><style>body{background:#1e1e1e;color:#fff;font-family:Arial,sans-serif;padding:20px;}.msg{margin:10px 0;padding:10px;background:#2e2e2e;border-radius:8px;}</style></head><body><h1>${selectedCategory.name} Bewerbung #${counter}</h1><p>Erstellt von: ${i.user.tag}</p><p>Datum: ${new Date().toLocaleString('de-DE')}</p><hr>`, 'utf8');

        await i.editReply({content: `✅ Deine **${selectedCategory.name}** Bewerbung wurde eingereicht!\n🎫 Ticket: <#${channel.id}>`});
        await logEvent(i.guild, `📝 ${selectedCategory.name} Bewerbung #${counter} von <@${i.user.id}> eingereicht.`, i.user);

      } catch(error) {
        console.error('Category application ticket error:', error);
        if (!i.replied && !i.deferred) {
          await i.reply({content: '❌ Fehler beim Erstellen der Bewerbung.', ephemeral: true});
        } else {
          await i.editReply({content: '❌ Fehler beim Erstellen der Bewerbung.'});
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
        const acceptEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Bewerbung angenommen',
          description: `Bewerber: <@${ticket.userId}>\nAngenommen von: <@${i.user.id}>\nZugewiesene Rolle: <@&${targetRole.id}>\n\nGrund: ${reason}`,
          fields: [
            { name: 'Bewerbung', value: `#${ticket.id}`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          ],
          color: '#57F287'
        });

        await i.channel.send({ embeds: [acceptEmbed] });

        // DM wird später mit dem schönen Transcript-Embed gesendet (unten)

        // Log event
        await logEvent(i.guild, `✅ Bewerbung **#${ticket.id}** von <@${ticket.userId}> wurde angenommen von <@${i.user.id}>`);

        await i.editReply({
          content: `✅ Bewerbung angenommen! <@${ticket.userId}> hat die Rolle <@&${targetRole.id}> erhalten.`
        });

        // Transcript erstellen BEVOR Channel gelöscht wird
        const appChannel = await i.guild.channels.fetch(ticket.channelId).catch(() => null);
        let appFiles = null;
        let appMessageStats = null;
        const appChannelName = appChannel?.name || `bewerbung-${ticket.id}`;

        if (appChannel) {
          try {
            appMessageStats = await getTicketMessageStats(appChannel);
            appFiles = await createTranscript(appChannel, ticket, { resolveMentions: true });
            console.log(`✅ Bewerbungs-Transcript erstellt für #${ticket.id}`);
          } catch (transcriptErr) {
            console.error('Bewerbungs-Transcript Fehler:', transcriptErr);
          }
        }

        // Baue User-Statistiken-String
        let appUserStats = 'Keine Nachrichten';
        if (appMessageStats && appMessageStats.userStats.length > 0) {
          appUserStats = appMessageStats.userStats
            .map(u => `**${u.count}** - <@${u.userId}>`)
            .join('\n');
        }

        // Voting-Ergebnis
        const votesUp = ticket.votes?.up?.length || 0;
        const votesDown = ticket.votes?.down?.length || 0;
        const votingResult = `👍 ${votesUp} | 👎 ${votesDown}`;

        // Interview-Status
        let interviewStatus = '❌ Kein Interview';
        if (ticket.interview) {
          if (ticket.interview.completed) {
            interviewStatus = '✅ Abgeschlossen';
          } else if (ticket.interview.scheduledAt) {
            interviewStatus = `📅 Geplant: <t:${Math.floor(new Date(ticket.interview.scheduledAt).getTime() / 1000)}:f>`;
          }
        }

        // Notizen-Anzahl
        const notesCount = ticket.notes?.length || 0;

        // Neues Bewerbungs-Transcript Embed
        const appTranscriptEmbed = createStyledEmbed({
          emoji: '🎉',
          title: 'Glückwunsch! Bewerbung angenommen',
          description: `Das Transcript deiner Bewerbung kannst du oberhalb dieser Nachricht herunterladen.\n\n📝 Nachricht vom Team:\n${reason}`,
          fields: [
            { name: 'Server', value: i.guild.name, inline: true },
            { name: 'Bewerbung', value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
            { name: 'Zugewiesene Rolle', value: targetRole.name, inline: true },
            { name: 'Kategorie', value: ticket.applicationCategory || 'Unbekannt', inline: true },
            { name: 'Status', value: '✅ Angenommen', inline: true },
            { name: 'Bearbeitet von', value: `<@${i.user.id}>`, inline: true },
            { name: 'Datum', value: `<t:${Math.floor((ticket.timestamp || Date.now()) / 1000)}:f>`, inline: true },
            { name: 'Voting', value: votingResult, inline: true },
            { name: 'Nachrichten', value: `${appMessageStats?.totalMessages || 0}`, inline: true }
          ],
          color: '#57F287',
          footer: i.guild.name
        });

        // Sende Transcript an Bewerber per DM
        if (appFiles) {
          try {
            const applicantUser = await client.users.fetch(ticket.userId).catch(() => null);
            if (applicantUser) {
              await applicantUser.send({
                embeds: [appTranscriptEmbed],
                files: [appFiles.txt, appFiles.html]
              });
              console.log(`✅ Bewerbungs-Transcript DM gesendet an ${applicantUser.tag}`);
            }
          } catch (dmErr) {
            console.log('Konnte Bewerbungs-Transcript DM nicht senden:', dmErr.message);
          }
        }

        // Archive to channel (if configured) - mit Transcript
        if (cfg.applicationSystem?.archiveChannelId) {
          try {
            const archiveChannel = await i.guild.channels.fetch(cfg.applicationSystem.archiveChannelId);
            if (archiveChannel) {
              const filesToSend = appFiles ? [appFiles.txt, appFiles.html] : [];
              await archiveChannel.send({
                embeds: [appTranscriptEmbed],
                files: filesToSend
              });
            }
          } catch (archiveErr) {
            console.error('Archive error:', archiveErr);
          }
        }

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
        const rejectEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Bewerbung abgelehnt',
          description: `Bewerber: <@${ticket.userId}>\nAbgelehnt von: <@${i.user.id}>\n\nGrund: ${reason}`,
          fields: [
            { name: 'Bewerbung', value: `#${ticket.id}`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          ],
          color: '#ED4245'
        });

        await i.channel.send({ embeds: [rejectEmbed] });

        // DM wird später mit dem schönen Transcript-Embed gesendet (unten)

        // Log event
        await logEvent(i.guild, `❌ Bewerbung **#${ticket.id}** von <@${ticket.userId}> wurde abgelehnt von <@${i.user.id}>`);

        await i.editReply({
          content: `✅ Bewerbung abgelehnt. <@${ticket.userId}> wurde benachrichtigt.`
        });

        // Transcript erstellen BEVOR Channel gelöscht wird
        const appChannel = await i.guild.channels.fetch(ticket.channelId).catch(() => null);
        let appFiles = null;
        let appMessageStats = null;
        const appChannelName = appChannel?.name || `bewerbung-${ticket.id}`;

        if (appChannel) {
          try {
            appMessageStats = await getTicketMessageStats(appChannel);
            appFiles = await createTranscript(appChannel, ticket, { resolveMentions: true });
            console.log(`✅ Bewerbungs-Transcript erstellt für #${ticket.id}`);
          } catch (transcriptErr) {
            console.error('Bewerbungs-Transcript Fehler:', transcriptErr);
          }
        }

        // Baue User-Statistiken-String
        let appUserStats = 'Keine Nachrichten';
        if (appMessageStats && appMessageStats.userStats.length > 0) {
          appUserStats = appMessageStats.userStats
            .map(u => `**${u.count}** - <@${u.userId}>`)
            .join('\n');
        }

        // Voting-Ergebnis
        const votesUp = ticket.votes?.up?.length || 0;
        const votesDown = ticket.votes?.down?.length || 0;
        const votingResult = `👍 ${votesUp} | 👎 ${votesDown}`;

        // Interview-Status
        let interviewStatus = '❌ Kein Interview';
        if (ticket.interview) {
          if (ticket.interview.completed) {
            interviewStatus = '✅ Abgeschlossen';
          } else if (ticket.interview.scheduledAt) {
            interviewStatus = `📅 Geplant: <t:${Math.floor(new Date(ticket.interview.scheduledAt).getTime() / 1000)}:f>`;
          }
        }

        // Notizen-Anzahl
        const notesCount = ticket.notes?.length || 0;

        // Neues Bewerbungs-Transcript Embed
        const appTranscriptEmbed = createStyledEmbed({
          emoji: '📄',
          title: 'Update zu deiner Bewerbung',
          description: `Das Transcript deiner Bewerbung kannst du oberhalb dieser Nachricht herunterladen.\n\nLeider müssen wir dir mitteilen, dass deine Bewerbung abgelehnt wurde.\n\n📝 Nachricht vom Team:\n${reason}`,
          fields: [
            { name: 'Server', value: i.guild.name, inline: true },
            { name: 'Bewerbung', value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
            { name: 'Kategorie', value: ticket.applicationCategory || 'Unbekannt', inline: true },
            { name: 'Status', value: '❌ Abgelehnt', inline: true },
            { name: 'Bearbeitet von', value: `<@${i.user.id}>`, inline: true },
            { name: 'Datum', value: `<t:${Math.floor((ticket.timestamp || Date.now()) / 1000)}:f>`, inline: true },
            { name: 'Voting', value: votingResult, inline: true },
            { name: 'Nachrichten', value: `${appMessageStats?.totalMessages || 0}`, inline: true }
          ],
          color: '#ED4245',
          footer: i.guild.name
        });

        // Sende Transcript an Bewerber per DM
        if (appFiles) {
          try {
            const applicantUser = await client.users.fetch(ticket.userId).catch(() => null);
            if (applicantUser) {
              await applicantUser.send({
                embeds: [appTranscriptEmbed],
                files: [appFiles.txt, appFiles.html]
              });
              console.log(`✅ Bewerbungs-Transcript DM gesendet an ${applicantUser.tag}`);
            }
          } catch (dmErr) {
            console.log('Konnte Bewerbungs-Transcript DM nicht senden:', dmErr.message);
          }
        }

        // Archive to channel (if configured) - mit Transcript
        if (cfg.applicationSystem?.archiveChannelId) {
          try {
            const archiveChannel = await i.guild.channels.fetch(cfg.applicationSystem.archiveChannelId);
            if (archiveChannel) {
              const filesToSend = appFiles ? [appFiles.txt, appFiles.html] : [];
              await archiveChannel.send({
                embeds: [appTranscriptEmbed],
                files: filesToSend
              });
            }
          } catch (archiveErr) {
            console.error('Archive error:', archiveErr);
          }
        }

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

    // Interview Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('modal_app_interview:')){
      try {
        const parts = i.customId.split(':');
        const guildId = parts[1];
        const ticketId = parseInt(parts[2]);

        if(guildId !== i.guild.id){
          return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});
        }

        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.id === ticketId && t.isApplication === true);

        if(!ticket){
          return i.reply({ephemeral:true,content:'❌ Bewerbung nicht gefunden.'});
        }

        const dateStr = i.fields.getTextInputValue('interview_date');
        const timeStr = i.fields.getTextInputValue('interview_time');
        const note = i.fields.getTextInputValue('interview_note') || '';

        // Parse date (DD.MM.YYYY)
        const dateMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (!dateMatch) {
          return i.reply({ephemeral:true, content:'❌ Ungültiges Datum! Format: TT.MM.JJJJ'});
        }

        // Parse time (HH:MM)
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (!timeMatch) {
          return i.reply({ephemeral:true, content:'❌ Ungültige Uhrzeit! Format: HH:MM'});
        }

        const [, day, month, year] = dateMatch;
        const [, hours, minutes] = timeMatch;
        const interviewDate = new Date(year, month - 1, day, hours, minutes);

        if (interviewDate <= new Date()) {
          return i.reply({ephemeral:true, content:'❌ Das Interview muss in der Zukunft liegen!'});
        }

        // Save interview
        ticket.interview = {
          scheduledAt: interviewDate.toISOString(),
          scheduledBy: i.user.id,
          note: note,
          reminderSent: false
        };
        saveTickets(guildId, tickets);

        // Notify applicant via DM
        try {
          const applicant = await client.users.fetch(ticket.userId);
          const dmEmbed = createStyledEmbed({
            emoji: '📅',
            title: 'Interview geplant!',
            description: `Dein Interview wurde geplant für:\n📅 ${interviewDate.toLocaleDateString('de-DE')} um ${interviewDate.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})} Uhr`,
            fields: [
              { name: 'Server', value: i.guild.name, inline: true },
              { name: 'Bewerbung', value: `#${ticket.id}`, inline: true },
              ...(note ? [{ name: 'Hinweis', value: note, inline: false }] : [])
            ]
          });

          await applicant.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch(dmErr) {
          console.error('Interview DM error:', dmErr);
        }

        // Ping applicant in ticket channel
        const interviewPingEmbed = createStyledEmbed({
          emoji: '📅',
          title: 'Interview geplant!',
          description: `<@${ticket.userId}>, dein Interview wurde geplant!`,
          fields: [
            { name: 'Datum', value: interviewDate.toLocaleDateString('de-DE'), inline: true },
            { name: 'Uhrzeit', value: `${interviewDate.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})} Uhr`, inline: true },
            ...(note ? [{ name: 'Hinweis', value: note, inline: false }] : [])
          ]
        });

        await i.channel.send({
          content: `<@${ticket.userId}>`,
          embeds: [interviewPingEmbed]
        }).catch(() => {});

        // Send confirmation in channel
        const confirmEmbed = createStyledEmbed({
          emoji: '📅',
          title: 'Interview geplant',
          description: `Interview wurde erfolgreich geplant.`,
          fields: [
            { name: 'Bewerber', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Termin', value: `<t:${Math.floor(interviewDate.getTime() / 1000)}:F>`, inline: true },
            { name: 'Geplant von', value: `<@${i.user.id}>`, inline: true },
            ...(note ? [{ name: 'Hinweis', value: note, inline: false }] : [])
          ]
        });

        await i.reply({ embeds: [confirmEmbed] });

      } catch(error){
        console.error('Interview schedule error:', error);
        if(!i.replied){
          await i.reply({ephemeral:true, content:'❌ Fehler beim Planen des Interviews.'});
        }
      }
      return;
    }

    // Application Note Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('modal_app_note:')){
      try {
        const parts = i.customId.split(':');
        const guildId = parts[1];
        const ticketId = parseInt(parts[2]);

        if(guildId !== i.guild.id){
          return i.reply({ephemeral:true,content:'❌ Ungültige Guild ID'});
        }

        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.id === ticketId && t.isApplication === true);

        if(!ticket){
          return i.reply({ephemeral:true,content:'❌ Bewerbung nicht gefunden.'});
        }

        const noteText = i.fields.getTextInputValue('note_text');

        // Initialize notes array if not exists
        if (!ticket.notes) ticket.notes = [];

        // Add note
        ticket.notes.push({
          text: noteText,
          userId: i.user.id,
          username: i.user.username,
          createdAt: new Date().toISOString()
        });

        saveTickets(guildId, tickets);

        await i.reply({
          content: `✅ Notiz hinzugefügt! (${ticket.notes.length} Notizen gesamt)`,
          ephemeral: true
        });

      } catch(error){
        console.error('Application note error:', error);
        if(!i.replied){
          await i.reply({ephemeral:true, content:'❌ Fehler beim Hinzufügen der Notiz.'});
        }
      }
      return;
    }

    // Voice Comment Modal Submit Handler
    if(i.isModalSubmit() && i.customId.startsWith('voice_comment_modal_')){
      try {
        const caseId = parseInt(i.customId.replace('voice_comment_modal_', ''));
        const guildId = i.guild.id;
        const { loadVoiceCases, saveVoiceCases } = require('./voice-waiting-room');

        const commentText = i.fields.getTextInputValue('comment_text');

        const cases = loadVoiceCases(guildId);
        const caseIndex = cases.findIndex(c => c.id === caseId);

        if(caseIndex === -1){
          return i.reply({ content: '❌ Fall nicht gefunden.', ephemeral: true });
        }

        const voiceCase = cases[caseIndex];

        if(!voiceCase.comments){
          voiceCase.comments = [];
        }

        voiceCase.comments.push({
          userId: i.user.id,
          username: i.user.tag,
          text: commentText,
          timestamp: new Date().toISOString()
        });

        cases[caseIndex] = voiceCase;
        saveVoiceCases(guildId, cases);

        // ========== UPDATE EMBED MIT KOMMENTAR ==========
        const cfg = readCfg(guildId);
        const supportChannelId = cfg.voiceSupport?.supportChannelId || cfg.logChannelId;

        if(supportChannelId && voiceCase.messageId){
          try {
            const supportChannel = await i.guild.channels.fetch(supportChannelId).catch(() => null);
            if(supportChannel){
              const caseMessage = await supportChannel.messages.fetch(voiceCase.messageId).catch(() => null);
              if(caseMessage){
                const updatedEmbed = EmbedBuilder.from(caseMessage.embeds[0]);

                // Entferne alte Kommentar-Fields
                const fieldsWithoutComments = updatedEmbed.data.fields?.filter(f => !f.name.startsWith('💬')) || [];
                updatedEmbed.data.fields = fieldsWithoutComments;

                // Füge alle Kommentare als Fields hinzu (max 3 neueste)
                const recentComments = voiceCase.comments.slice(-3);
                recentComments.forEach((comment, index) => {
                  const timeAgo = `<t:${Math.floor(new Date(comment.timestamp).getTime() / 1000)}:R>`;
                  updatedEmbed.addFields({
                    name: `💬 Kommentar von ${comment.username}`,
                    value: `${comment.text}\n*${timeAgo}*`,
                    inline: false
                  });
                });

                await caseMessage.edit({ embeds: [updatedEmbed] });
                console.log(`✅ Updated embed with comment for case #${caseId}`);
              }
            }
          } catch(err){
            console.error('Error updating embed with comment:', err);
          }
        }

        await i.reply({
          content: `✅ Kommentar wurde zu Fall #${String(caseId).padStart(5, '0')} hinzugefügt und im Embed angezeigt.`,
          ephemeral: true
        });

        console.log(`💬 Comment added to voice case #${caseId} by ${i.user.tag}`);

      } catch(err){
        console.error('Error in voice_comment_modal:', err);
        await i.reply({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true });
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
            const spamEmbed = createStyledEmbed({
              emoji: '🛑',
              title: 'Zu viele Klicks!',
              description: 'Du klickst zu schnell auf die Buttons. Bitte warte einen Moment.',
              fields: [
                { name: 'Warte noch', value: `${buttonRateLimit.waitSeconds} Sekunde(n)`, inline: true }
              ],
              color: '#ED4245'
            });

            return i.reply({ embeds: [spamEmbed], ephemeral: true });
          }

          logButtonClick(i.user.id, i.customId);
        }
      }

      // FAQ Button Handlers
      if(i.customId.startsWith('faq_solved:')){
        const successEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Problem gelöst',
          description: 'Großartig! Wir freuen uns, dass wir dir helfen konnten. Falls du später noch Hilfe benötigst, kannst du jederzeit ein Ticket erstellen.',
          color: '#57F287'
        });

        await i.update({ embeds: [successEmbed], components: [] });
        return;
      }

      // Voice Support Button Handlers
      if(i.customId.startsWith('voice_claim_')){
        try {
          const caseId = parseInt(i.customId.replace('voice_claim_', ''));
          const guildId = i.guild.id;
          const { loadVoiceCases, saveVoiceCases } = require('./voice-waiting-room');

          const cases = loadVoiceCases(guildId);
          const caseIndex = cases.findIndex(c => c.id === caseId);

          if(caseIndex === -1){
            return i.reply({ content: '❌ Fall nicht gefunden.', ephemeral: true });
          }

          const voiceCase = cases[caseIndex];

          if(voiceCase.status !== 'open'){
            return i.reply({ content: '❌ Dieser Fall wurde bereits geschlossen.', ephemeral: true });
          }

          if(voiceCase.claimedBy){
            return i.reply({ content: `❌ Dieser Fall wurde bereits von <@${voiceCase.claimedBy}> übernommen.`, ephemeral: true });
          }

          // ========== CHECK: Team-Member muss in Voice sein ==========
          const teamMember = await i.guild.members.fetch(i.user.id);
          const teamVoiceState = teamMember.voice;

          if(!teamVoiceState || !teamVoiceState.channelId){
            return i.reply({
              content: '❌ Du musst in einem Voice-Channel sein, um diesen Fall zu übernehmen!',
              ephemeral: true
            });
          }

          console.log(`🔊 Team member ${i.user.tag} is in voice channel: ${teamVoiceState.channel.name}`);

          // ========== UPDATE CASE SOFORT (VOR DEM MOVEN!) ==========
          // KRITISCH: Case MUSS als claimed markiert werden BEVOR User gemoved werden
          // Sonst triggert das Leave-Event die Close-Logik
          voiceCase.claimedBy = i.user.id;
          voiceCase.claimedAt = new Date().toISOString();
          voiceCase.claimerPreviousChannelId = teamVoiceState.channelId; // Speichere vorherigen Channel
          cases[caseIndex] = voiceCase;
          saveVoiceCases(guildId, cases);
          console.log(`✅ Case #${caseId} marked as claimed by ${i.user.tag} BEFORE moving users`);

          // ========== ERSTELLE NEUEN SUPPORT-VOICE-CHANNEL ==========
          const cfg = readCfg(guildId);
          const waitingRoomChannel = await i.guild.channels.fetch(cfg.voiceSupport?.waitingRoomChannelId).catch(() => null);

          // Hole User vom Case
          const caseUser = await i.guild.members.fetch(voiceCase.userId).catch(() => null);
          if(!caseUser){
            return i.reply({ content: '❌ User nicht mehr auf dem Server gefunden.', ephemeral: true });
          }

          // Erstelle Channel-Name
          const channelName = `🎧・Support - ${caseUser.user.username}`;

          // Bestimme Kategorie (entweder vom Wartezimmer oder aus Config)
          let categoryId = null;
          if(waitingRoomChannel && waitingRoomChannel.parentId){
            categoryId = waitingRoomChannel.parentId;
          } else if(cfg.voiceSupport?.voiceCategoryId){
            categoryId = cfg.voiceSupport.voiceCategoryId;
          }

          console.log(`📁 Creating support voice channel in category: ${categoryId || 'keine'}`);

          // Erstelle neuen Voice-Channel
          const supportChannel = await i.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: categoryId,
            permissionOverwrites: [
              {
                id: i.guild.id,
                deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
              },
              {
                id: i.user.id, // Team-Member
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
              },
              {
                id: voiceCase.userId, // User
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
              },
              {
                id: i.client.user.id, // Bot
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
              }
            ]
          });

          console.log(`✅ Created support voice channel: ${supportChannel.name} (${supportChannel.id})`);

          // Speichere Support-Channel-ID im Case
          voiceCase.supportChannelId = supportChannel.id;
          cases[caseIndex] = voiceCase;
          saveVoiceCases(guildId, cases);

          // ========== MOVE BEIDE USER IN DEN NEUEN CHANNEL ==========

          // Move Team-Member
          try {
            await teamMember.voice.setChannel(supportChannel.id);
            console.log(`✅ Moved team member ${i.user.tag} to support channel`);
          } catch(err){
            console.error(`❌ Error moving team member:`, err);
          }

          // Move User (falls noch im Wartezimmer)
          const userVoiceState = caseUser.voice;
          if(userVoiceState && userVoiceState.channelId){
            try {
              await caseUser.voice.setChannel(supportChannel.id);
              console.log(`✅ Moved user ${caseUser.user.tag} to support channel`);
            } catch(err){
              console.error(`❌ Error moving user:`, err);
            }
          } else {
            console.log(`⚠️ User ${caseUser.user.tag} is not in any voice channel`);
          }

          // ========== BOT DISCONNECTEN ==========
          // Bot verlässt den Support-Channel nachdem User gemoved wurden
          try {
            const botMember = await i.guild.members.fetch(i.client.user.id);
            if(botMember.voice.channelId === supportChannel.id){
              await botMember.voice.disconnect();
              console.log(`🤖 Bot left support channel ${supportChannel.name}`);
            }
          } catch(err){
            console.error(`❌ Error disconnecting bot:`, err);
          }

          const updatedEmbed = EmbedBuilder.from(i.message.embeds[0])
            .setColor('#00ff88')
            .addFields({ name: t(guildId, 'voiceWaitingRoom.caseEmbed.claimedBy'), value: `<@${i.user.id}>`, inline: true });

          // Nach Claim: Übertragen, Kommentar, Schließen (kein Freigeben mehr)
          const claimedButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`voice_transfer_${caseId}`)
                .setLabel(t(guildId, 'voiceWaitingRoom.buttons.transfer'))
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId(`voice_comment_${caseId}`)
                .setLabel(t(guildId, 'voiceWaitingRoom.buttons.comment'))
                .setEmoji('💬')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId(`voice_close_${caseId}`)
                .setLabel(t(guildId, 'voiceWaitingRoom.buttons.close'))
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger)
            );

          await i.update({ embeds: [updatedEmbed], components: [claimedButtons] });

          // cfg ist bereits oben deklariert (Zeile 3665)
          const logChannelId = cfg.logChannelId;
          if(logChannelId){
            const logChannel = await i.guild.channels.fetch(logChannelId).catch(() => null);
            if(logChannel){
              // Check permissions
              const permissions = logChannel.permissionsFor(i.guild.members.me);
              if(permissions && permissions.has('SendMessages') && permissions.has('ViewChannel')){
                const logEmbed = createStyledEmbed({
                  emoji: '✅',
                  title: 'Voice Support',
                  description: `${t(guildId, 'voiceWaitingRoom.actions.claimedDescription', { claimer: `<@${i.user.id}>` })} (Fall #${caseId})`,
                  color: '#57F287'
                });
                await logChannel.send({ embeds: [logEmbed] }).catch(err => {
                  console.error('Error sending log message:', err);
                });
              }
            }
          }

          console.log(`✅ Voice case #${caseId} claimed by ${i.user.tag}`);

        } catch(err){
          console.error('Error in voice_claim button:', err);
          await i.reply({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true });
        }
        return;
      }

      if(i.customId.startsWith('voice_unclaim_')){
        try {
          const caseId = parseInt(i.customId.replace('voice_unclaim_', ''));
          const guildId = i.guild.id;
          const { loadVoiceCases, saveVoiceCases } = require('./voice-waiting-room');

          const cases = loadVoiceCases(guildId);
          const caseIndex = cases.findIndex(c => c.id === caseId);

          if(caseIndex === -1){
            return i.reply({ content: '❌ Fall nicht gefunden.', ephemeral: true });
          }

          const voiceCase = cases[caseIndex];

          if(voiceCase.claimedBy !== i.user.id){
            return i.reply({ content: '❌ Du kannst nur deine eigenen Claims freigeben.', ephemeral: true });
          }

          voiceCase.claimedBy = null;
          voiceCase.claimedAt = null;
          cases[caseIndex] = voiceCase;
          saveVoiceCases(guildId, cases);

          const updatedEmbed = EmbedBuilder.from(i.message.embeds[0])
            .setColor('#3b82f6')
            .setFields(i.message.embeds[0].fields.filter(f => f.name !== t(guildId, 'voiceWaitingRoom.caseEmbed.claimedBy')));

          // Nach Unclaim: Zurück zum initialen State (nur Übernehmen + Kommentar)
          const claimButton = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`voice_claim_${caseId}`)
                .setLabel(t(guildId, 'voiceWaitingRoom.buttons.claim'))
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`voice_comment_${caseId}`)
                .setLabel(t(guildId, 'voiceWaitingRoom.buttons.comment'))
                .setEmoji('💬')
                .setStyle(ButtonStyle.Secondary)
            );

          await i.update({ embeds: [updatedEmbed], components: [claimButton] });

          console.log(`🔓 Voice case #${caseId} unclaimed by ${i.user.tag}`);

        } catch(err){
          console.error('Error in voice_unclaim button:', err);
          await i.reply({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true });
        }
        return;
      }

      if(i.customId.startsWith('voice_transfer_')){
        try {
          const caseId = parseInt(i.customId.replace('voice_transfer_', ''));
          const guildId = i.guild.id;
          const { loadVoiceCases, saveVoiceCases } = require('./voice-waiting-room');

          const cases = loadVoiceCases(guildId);
          const caseIndex = cases.findIndex(c => c.id === caseId);

          if(caseIndex === -1){
            return i.reply({ content: '❌ Fall nicht gefunden.', ephemeral: true });
          }

          const voiceCase = cases[caseIndex];

          if(!voiceCase.claimedBy){
            return i.reply({ content: '❌ Dieser Fall wurde noch nicht übernommen.', ephemeral: true });
          }

          if(voiceCase.claimedBy !== i.user.id){
            return i.reply({ content: '❌ Du kannst nur deine eigenen Fälle übertragen.', ephemeral: true });
          }

          // ========== HOLE ALLE VOICE-USER IM SUPPORT-CHANNEL ==========
          if(!voiceCase.supportChannelId){
            return i.reply({ content: '❌ Kein Support-Channel gefunden.', ephemeral: true });
          }

          const supportChannel = await i.guild.channels.fetch(voiceCase.supportChannelId).catch(() => null);
          if(!supportChannel){
            return i.reply({ content: '❌ Support-Channel wurde gelöscht.', ephemeral: true });
          }

          // Alle User im Channel (außer Bot, aktueller Supporter, Ersteller)
          const voiceMembers = supportChannel.members
            .filter(m =>
              !m.user.bot &&
              m.id !== voiceCase.claimedBy &&
              m.id !== voiceCase.userId
            );

          if(voiceMembers.size === 0){
            return i.reply({
              content: '❌ Keine anderen Team-Members im Voice-Channel gefunden.',
              ephemeral: true
            });
          }

          // Erstelle Select-Menü mit allen verfügbaren Team-Members
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`voice_transfer_select_${caseId}`)
            .setPlaceholder('Wähle einen Team-Member aus')
            .addOptions(
              voiceMembers.map(member => ({
                label: member.user.username,
                description: `Übertrage zu ${member.user.tag}`,
                value: member.id,
                emoji: '👤'
              }))
            );

          const row = new ActionRowBuilder().addComponents(selectMenu);

          await i.reply({
            content: '🔄 **Fall übertragen**\n\nWähle den Team-Member aus, an den du diesen Fall übertragen möchtest:',
            components: [row],
            ephemeral: true
          });

          console.log(`🔄 Transfer menu shown for voice case #${caseId} by ${i.user.tag}`);

        } catch(err){
          console.error('Error in voice_transfer button:', err);
          await i.reply({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true });
        }
        return;
      }

      // Voice Transfer Select Menu Handler
      if(i.isStringSelectMenu() && i.customId.startsWith('voice_transfer_select_')){
        try {
          const caseId = parseInt(i.customId.replace('voice_transfer_select_', ''));
          const guildId = i.guild.id;
          const newSupporterId = i.values[0];
          const { loadVoiceCases, saveVoiceCases } = require('./voice-waiting-room');

          const cases = loadVoiceCases(guildId);
          const caseIndex = cases.findIndex(c => c.id === caseId);

          if(caseIndex === -1){
            return i.update({ content: '❌ Fall nicht gefunden.', components: [] });
          }

          const voiceCase = cases[caseIndex];

          // Hole neuen Supporter
          const newSupporter = await i.guild.members.fetch(newSupporterId).catch(() => null);
          if(!newSupporter){
            return i.update({ content: '❌ Ausgewählter User nicht gefunden.', components: [] });
          }

          const oldSupporterId = voiceCase.claimedBy;

          // Update Case
          voiceCase.claimedBy = newSupporterId;
          voiceCase.transfers = voiceCase.transfers || [];
          voiceCase.transfers.push({
            from: oldSupporterId,
            to: newSupporterId,
            timestamp: new Date().toISOString()
          });
          cases[caseIndex] = voiceCase;
          saveVoiceCases(guildId, cases);

          // Update Embed
          const cfg = readCfg(guildId);
          const supportChannelId = cfg.voiceSupport?.supportChannelId || cfg.logChannelId;

          if(supportChannelId && voiceCase.messageId){
            try {
              const supportChannel = await i.guild.channels.fetch(supportChannelId).catch(() => null);
              if(supportChannel){
                const caseMessage = await supportChannel.messages.fetch(voiceCase.messageId).catch(() => null);
                if(caseMessage){
                  const updatedEmbed = EmbedBuilder.from(caseMessage.embeds[0]);

                  // Update "Übernommen von" Field
                  const fieldsWithoutClaimed = updatedEmbed.data.fields?.filter(f => f.name !== t(guildId, 'voiceWaitingRoom.caseEmbed.claimedBy')) || [];
                  updatedEmbed.data.fields = fieldsWithoutClaimed;
                  updatedEmbed.addFields({
                    name: t(guildId, 'voiceWaitingRoom.caseEmbed.claimedBy'),
                    value: `<@${newSupporterId}>`,
                    inline: true
                  });

                  await caseMessage.edit({ embeds: [updatedEmbed] });
                }
              }
            } catch(err){
              console.error('Error updating embed after transfer:', err);
            }
          }

          await i.update({
            content: `✅ Fall #${String(caseId).padStart(5, '0')} wurde erfolgreich an <@${newSupporterId}> übertragen.`,
            components: []
          });

          console.log(`🔄 Voice case #${caseId} transferred from ${oldSupporterId} to ${newSupporterId}`);

        } catch(err){
          console.error('Error in voice_transfer_select:', err);
          await i.update({ content: '❌ Ein Fehler ist aufgetreten.', components: [] });
        }
        return;
      }

      if(i.customId.startsWith('voice_close_')){
        try {
          const caseId = parseInt(i.customId.replace('voice_close_', ''));
          const guildId = i.guild.id;
          const { loadVoiceCases, saveVoiceCases } = require('./voice-waiting-room');

          const cases = loadVoiceCases(guildId);
          const caseIndex = cases.findIndex(c => c.id === caseId);

          if(caseIndex === -1){
            return i.reply({ content: '❌ Fall nicht gefunden.', ephemeral: true });
          }

          const voiceCase = cases[caseIndex];

          if(voiceCase.status !== 'open'){
            return i.reply({ content: '❌ Dieser Fall wurde bereits geschlossen.', ephemeral: true });
          }

          voiceCase.status = 'closed';
          voiceCase.closedAt = new Date().toISOString();
          voiceCase.closedBy = i.user.id;
          voiceCase.closeReason = `Closed by ${i.user.tag}`;

          // ========== MOVE USER ZURÜCK ==========
          // 1. Supporter zurück in vorherigen Channel moven
          if(voiceCase.claimedBy && voiceCase.claimerPreviousChannelId){
            try {
              const claimer = await i.guild.members.fetch(voiceCase.claimedBy).catch(() => null);
              if(claimer && claimer.voice.channelId === voiceCase.supportChannelId){
                const previousChannel = await i.guild.channels.fetch(voiceCase.claimerPreviousChannelId).catch(() => null);
                if(previousChannel){
                  await claimer.voice.setChannel(previousChannel.id);
                  console.log(`↩️ Moved supporter ${claimer.user.tag} back to ${previousChannel.name}`);
                } else {
                  console.log(`⚠️ Previous channel ${voiceCase.claimerPreviousChannelId} not found, disconnecting supporter`);
                  await claimer.voice.setChannel(null);
                }
              }
            } catch(err){
              console.error(`❌ Error moving supporter back:`, err);
            }
          }

          // 2. User disconnecten
          if(voiceCase.userId){
            try {
              const caseUser = await i.guild.members.fetch(voiceCase.userId).catch(() => null);
              if(caseUser && caseUser.voice.channelId === voiceCase.supportChannelId){
                await caseUser.voice.setChannel(null);
                console.log(`🔌 Disconnected user ${caseUser.user.tag} from voice`);
              }
            } catch(err){
              console.error(`❌ Error disconnecting user:`, err);
            }
          }

          // ========== LÖSCHE SUPPORT-VOICE-CHANNEL ==========
          if(voiceCase.supportChannelId){
            try {
              const supportChannel = await i.guild.channels.fetch(voiceCase.supportChannelId).catch(() => null);
              if(supportChannel){
                await supportChannel.delete('Voice Support Fall geschlossen');
                console.log(`🗑️ Deleted support voice channel: ${supportChannel.name}`);
              } else {
                console.log(`⚠️ Support channel ${voiceCase.supportChannelId} not found (already deleted?)`);
              }
            } catch(err){
              console.error(`❌ Error deleting support voice channel:`, err);
            }
          }

          cases[caseIndex] = voiceCase;
          saveVoiceCases(guildId, cases);

          const updatedEmbed = EmbedBuilder.from(i.message.embeds[0])
            .setColor('#95a5a6')
            .setTitle(t(guildId, 'voiceWaitingRoom.actions.closed'))
            .setDescription(t(guildId, 'voiceWaitingRoom.actions.closedDescription', { closer: `<@${i.user.id}>` }));

          if(voiceCase.claimedBy){
            updatedEmbed.addFields({ name: t(guildId, 'voiceWaitingRoom.caseEmbed.claimedBy'), value: `<@${voiceCase.claimedBy}>`, inline: true });
          }

          const duration = Math.floor((new Date(voiceCase.closedAt) - new Date(voiceCase.createdAt)) / 1000);
          const minutes = Math.floor(duration / 60);
          const seconds = duration % 60;
          updatedEmbed.addFields({ name: t(guildId, 'voiceWaitingRoom.caseEmbed.duration'), value: `${minutes}m ${seconds}s`, inline: true });

          await i.update({ embeds: [updatedEmbed], components: [] });

          console.log(`🔒 Voice case #${caseId} closed by ${i.user.tag}`);

        } catch(err){
          console.error('Error in voice_close button:', err);
          await i.reply({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true });
        }
        return;
      }

      if(i.customId.startsWith('voice_comment_')){
        try {
          const caseId = parseInt(i.customId.replace('voice_comment_', ''));

          const modal = new ModalBuilder()
            .setCustomId(`voice_comment_modal_${caseId}`)
            .setTitle('Kommentar hinzufügen');

          const commentInput = new TextInputBuilder()
            .setCustomId('comment_text')
            .setLabel('Kommentar')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Schreibe einen Kommentar zu diesem Fall...')
            .setRequired(true)
            .setMaxLength(1000);

          const actionRow = new ActionRowBuilder().addComponents(commentInput);
          modal.addComponents(actionRow);

          await i.showModal(modal);

        } catch(err){
          console.error('Error in voice_comment button:', err);
          await i.reply({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true });
        }
        return;
      }

      // Multi-Ticket-System: Button Handler for ticket_create:systemId:topicValue
      if(i.customId.startsWith('ticket_create:')){
        const guildId = i.guild.id;
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

          // Rollen-Berechtigung prüfen
          if (cfg.ticketCreationRestricted && cfg.allowedTicketRoles && cfg.allowedTicketRoles.length > 0) {
            const member = i.member;
            const hasAllowedRole = cfg.allowedTicketRoles.some(roleId => member.roles.cache.has(roleId));
            if (!hasAllowedRole) {
              const roleNames = cfg.allowedTicketRoles
                .map(roleId => i.guild.roles.cache.get(roleId)?.name || roleId)
                .join(', ');
              const noPermEmbed = createStyledEmbed({
                emoji: '🔒',
                title: t(guildId, 'ticket.no_permission') || 'Keine Berechtigung',
                description: t(guildId, 'ticket.role_required') || `Du benötigst eine der folgenden Rollen um Tickets zu erstellen:\n${roleNames}`,
                color: '#ED4245',
                footer: 'Quantix Tickets • Zugriff verweigert'
              });
              return i.reply({ embeds: [noPermEmbed], ephemeral: true });
            }
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

                const blacklistEmbed = createStyledEmbed({
                  emoji: '🚫',
                  title: t(guildId, 'ticketBlacklist.user_blacklisted'),
                  description: t(guildId, 'ticketBlacklist.blocked_error', {
                    reason: blacklist.reason,
                    duration: expiryText
                  }),
                  color: '#ED4245',
                  footer: 'Quantix Tickets • Zugriff verweigert'
                });

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
          const upgradeEmbed = createStyledEmbed({
            emoji: '⭐',
            title: 'Premium Basic+ erforderlich',
            description: 'Das Bewerbungssystem ist ein Premium Basic+ Feature!\n\nUpgrade jetzt, um professionelle Bewerbungen zu verwalten:\n• Separates Bewerbungs-Panel\n• Anpassbare Formularfelder\n• Dedizierte Bewerbungs-Tickets\n• Team-spezifische Berechtigungen',
            color: '#F59E0B',
            footer: 'Quantix Tickets • Premium Feature'
          });

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

              const blacklistEmbed = createStyledEmbed({
                emoji: '🚫',
                title: t(guildId, 'ticketBlacklist.user_blacklisted'),
                description: t(guildId, 'ticketBlacklist.blocked_error', {
                  reason: blacklist.reason,
                  duration: expiryText
                }),
                color: '#ED4245',
                footer: 'Quantix Tickets • Zugriff verweigert'
              });

              return i.reply({ embeds: [blacklistEmbed], ephemeral: true });
            }
          }
        }

        // Application-specific Blacklist
        const appBlacklist = cfg.applicationSystem.blacklist || [];
        if (appBlacklist.includes(i.user.id)) {
          return i.reply({
            ephemeral: true,
            content: '❌ Du bist vom Bewerbungssystem ausgeschlossen.'
          });
        }

        // Check Account Age
        const minAccountAgeDays = cfg.applicationSystem.minAccountAgeDays || 0;
        if (minAccountAgeDays > 0) {
          const accountAge = (Date.now() - i.user.createdTimestamp) / (1000 * 60 * 60 * 24);
          if (accountAge < minAccountAgeDays) {
            return i.reply({
              ephemeral: true,
              content: `❌ Dein Account muss mindestens **${minAccountAgeDays} Tage** alt sein.\n` +
                `📅 Dein Account ist ${Math.floor(accountAge)} Tage alt.`
            });
          }
        }

        // Check Server Join Date
        const minServerJoinDays = cfg.applicationSystem.minServerJoinDays || 0;
        if (minServerJoinDays > 0) {
          const member = i.member;
          const joinedDays = (Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24);
          if (joinedDays < minServerJoinDays) {
            return i.reply({
              ephemeral: true,
              content: `❌ Du musst mindestens **${minServerJoinDays} Tage** auf dem Server sein.\n` +
                `📅 Du bist seit ${Math.floor(joinedDays)} Tagen hier.`
            });
          }
        }

        // Check Cooldown
        const cooldownDays = cfg.applicationSystem.cooldownDays || 0;
        if (cooldownDays > 0) {
          const tickets = loadTickets(guildId);
          const lastApplication = tickets
            .filter(t => t.userId === i.user.id && t.isApplication === true)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

          if (lastApplication) {
            const daysSinceLastApp = (Date.now() - new Date(lastApplication.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastApp < cooldownDays) {
              const remainingDays = Math.ceil(cooldownDays - daysSinceLastApp);
              return i.reply({
                ephemeral: true,
                content: `❌ Du kannst dich erst in **${remainingDays} Tagen** wieder bewerben.\n` +
                  `⏰ Cooldown: ${cooldownDays} Tage zwischen Bewerbungen.`
              });
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

        // Check if categories are configured (new system)
        const categories = cfg.applicationSystem.categories || [];
        const legacyFormFields = cfg.applicationSystem.formFields || [];

        console.log(`📋 Application System: ${categories.length} Kategorien, ${legacyFormFields.length} Legacy-Felder`);

        // If categories exist, show Select Menu
        if (categories.length > 0) {
          const selectOptions = categories.map((cat, idx) => ({
            label: cat.name.substring(0, 100),
            value: `${idx}`,
            description: (cat.description || '').substring(0, 100) || undefined,
            emoji: cat.emoji || undefined
          }));

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`application_category_select:${guildId}`)
            .setPlaceholder('📂 Wähle eine Bewerbungskategorie...')
            .addOptions(selectOptions.slice(0, 25)); // Discord limit

          const selectRow = new ActionRowBuilder().addComponents(selectMenu);

          const selectEmbed = createStyledEmbed({
            emoji: '📂',
            title: 'Bewerbungskategorie wählen',
            description: 'Bitte wähle die Kategorie, für die du dich bewerben möchtest.',
            color: cfg.applicationSystem.panelColor || '#3b82f6',
            footer: 'Quantix Tickets • Bewerbungssystem'
          });

          return i.reply({
            embeds: [selectEmbed],
            components: [selectRow],
            ephemeral: true
          });
        }

        // Fallback: Legacy system without categories
        if(legacyFormFields.length === 0){
          return i.reply({
            ephemeral:true,
            content:'❌ **Keine Bewerbungskategorien konfiguriert!**\n\nBitte erstelle im Panel unter "Bewerbungssystem" mindestens eine Kategorie mit Fragen.\n\n*Hinweis: Nach dem Speichern im Panel den Bot neu starten (`/restart`).*'
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_application:${guildId}`)
          .setTitle('Bewerbung'.substring(0,45));

        // Add fields (max 5 per modal)
        const fieldsToAdd = legacyFormFields.slice(0, 5);
        fieldsToAdd.forEach((field, idx) => {
          let inputStyle = TextInputStyle.Short;
          let placeholder = '';
          let maxLength = 256;

          if (field.style === 'paragraph') {
            inputStyle = TextInputStyle.Paragraph;
            maxLength = 1024;
          } else if (field.style === 'number') {
            inputStyle = TextInputStyle.Short;
            placeholder = 'Nur Zahlen erlaubt (z.B. 123 oder 45.67)';
            maxLength = 50;
          }

          const input = new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label.substring(0,45))
            .setStyle(inputStyle)
            .setRequired(field.required !== false)
            .setMaxLength(maxLength)
            .setMinLength(field.style === 'number' && field.required !== false ? 1 : 0);

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

        const embed = createStyledEmbed({
          emoji: '⚙️',
          title: 'GitHub Commit Logs',
          description: `New Status: ${newStatus ? '✅ Enabled' : '❌ Disabled'}\n\nGitHub commit notifications will ${newStatus ? 'now' : 'no longer'} be logged to this server.\n\n${cfg.githubWebhookChannelId ? `Log Channel: <#${cfg.githubWebhookChannelId}>` : '⚠️ No log channel set! Please configure a channel in the panel.'}`,
          color: newStatus ? '#57F287' : '#ED4245'
        });

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

          const embed = createStyledEmbed({
            emoji: '✅',
            title: 'LÖSCHUNG ABGEBROCHEN',
            description: `Die geplante Daten-Löschung wurde erfolgreich abgebrochen.\n\nAlle Daten bleiben erhalten:\n• Konfigurationsdateien\n• Tickets und deren Daten\n• Ticket-Transkripte\n\nDer Bot bleibt auf diesem Server.\n\nAbgebrochen von: <@${i.user.id}>`,
            color: '#57F287'
          });

          await i.update({ content: '@everyone', embeds: [embed], components: [] });

          console.log(`✅ Deletion cancelled for ${guildId} by user ${i.user.id}`);

          await logEvent(i.guild, `✅ Geplante Daten-Löschung abgebrochen von <@${i.user.id}>`);
        } catch(err){
          console.error('Error cancelling deletion:', err);
          return i.reply({ephemeral:true,content:'❌ Fehler beim Abbrechen der Löschung'});
        }
        return;
      }

      // Auto-Close Cancel Button Handler
      if(i.customId.startsWith('cancel_auto_close_')){
        const ticketId = i.customId.replace('cancel_auto_close_', '');
        const guildId = i.guild.id;
        const cfg = readCfg(guildId);

        // Lade Ticket
        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.id === parseInt(ticketId) || t.id === ticketId);

        if(!ticket){
          return i.reply({ephemeral:true,content:'❌ Ticket nicht gefunden.'});
        }

        // Prüfe Berechtigung: Ersteller, Team oder hinzugefügte User
        const isCreator = ticket.userId === i.user.id;
        const isTeam = hasAnyTeamRole(i.member, guildId);
        const isAddedUser = ticket.addedUsers && ticket.addedUsers.includes(i.user.id);

        if(!isCreator && !isTeam && !isAddedUser){
          return i.reply({
            ephemeral:true,
            content:'❌ Du bist nicht berechtigt, den Auto-Close Timer abzubrechen.'
          });
        }

        // Cancel Auto-Close (Timer zurücksetzen)
        const { cancelAutoClose } = require('./auto-close-service');
        const result = await cancelAutoClose(guildId, ticketId, i.user.id);

        if(!result.success){
          return i.reply({ephemeral:true,content:'❌ Fehler: ' + result.error});
        }

        // Bestätigungs-Embed vorbereiten
        const embed = createStyledEmbed({
          emoji: '✅',
          title: t(guildId, 'autoClose.cancelled_title') || 'Timer abgebrochen',
          description: t(guildId, 'autoClose.cancelled_description', { user: i.user.tag }) || `Der Auto-Close Timer wurde von ${i.user.tag} zurückgesetzt.\n\nDas Ticket bleibt offen.`,
          fields: [
            {
              name: t(guildId, 'autoClose.timer_reset') || 'Timer zurückgesetzt',
              value: t(guildId, 'autoClose.timer_reset_desc') || 'Der Inaktivitäts-Timer wurde zurückgesetzt.',
              inline: false
            }
          ],
          color: '#57F287',
          footer: 'Quantix Tickets • Auto-Close'
        });

        // Interaction bestätigen & alte Auto-Close Nachricht entfernen
        await i.deferUpdate().catch(() => {});

        if (i.message && i.message.deletable) {
          await i.message.delete().catch(() => {});
        }

        // Auto-Close Warnungs-Message-ID zurücksetzen
        const ticketIndex = tickets.findIndex(t => t.id === ticket.id || t.id === parseInt(ticketId));
        if(ticketIndex !== -1){
          tickets[ticketIndex].autoCloseWarningMessageId = null;
          saveTickets(guildId, tickets);
        }

        await i.channel.send({ embeds: [embed] });

        // Log event
        await logEvent(i.guild, `⏰ Auto-Close abgebrochen für Ticket #${String(ticket.id).padStart(5, '0')} von <@${i.user.id}>`);
        return;
      }

      // Auto-Close Pause Button Handler
      if(i.customId.startsWith('pause_auto_close_')){
        const ticketId = i.customId.replace('pause_auto_close_', '');
        const guildId = i.guild.id;
        const cfg = readCfg(guildId);

        // Lade Ticket
        const tickets = loadTickets(guildId);
        const ticketIndex = tickets.findIndex(t => t.id === parseInt(ticketId) || t.id === ticketId);

        if(ticketIndex === -1){
          return i.reply({ephemeral:true,content:'❌ Ticket nicht gefunden.'});
        }

        const ticket = tickets[ticketIndex];

        // Prüfe Berechtigung: Ersteller, Team oder hinzugefügte User
        const isCreator = ticket.userId === i.user.id;
        const isTeam = hasAnyTeamRole(i.member, guildId);
        const isAddedUser = ticket.addedUsers && ticket.addedUsers.includes(i.user.id);

        if(!isCreator && !isTeam && !isAddedUser){
          return i.reply({
            ephemeral:true,
            content:'❌ Du bist nicht berechtigt, den Auto-Close Timer zu pausieren.'
          });
        }

        // Check if already paused
        if(ticket.autoClosePaused){
          return i.reply({
            ephemeral:true,
            content:'⏸️ Der Auto-Close Timer ist bereits pausiert.'
          });
        }

        // Pause Auto-Close Timer
        tickets[ticketIndex].autoClosePaused = true;
        tickets[ticketIndex].autoClosePausedAt = Date.now();
        tickets[ticketIndex].autoClosePausedBy = i.user.id;
        tickets[ticketIndex].autoCloseWarningSent = false;
        saveTickets(guildId, tickets);

        const ticketType = ticket.isApplication ? 'Bewerbung' : 'Ticket';

        // Update die Warn-Nachricht
        const embed = createStyledEmbed({
          emoji: '⏸️',
          title: 'Auto-Close pausiert',
          description: `Der Auto-Close Timer wurde von ${i.user.tag} pausiert.\n\nDiese ${ticketType} wird nicht mehr automatisch geschlossen, bis der Timer mit \`/ticket resume\` fortgesetzt wird.`,
          fields: [
            { name: 'Pausiert von', value: `<@${i.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#5865F2',
          footer: 'Quantix Tickets • Auto-Close pausiert'
        });

        await i.update({ embeds: [embed], components: [] });

        // Log event
        await logEvent(i.guild, `⏸️ Auto-Close pausiert für ${ticketType} #${String(ticket.id).padStart(5, '0')} von <@${i.user.id}>`);
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

      // Application Voting: Up/Down buttons
      if(i.customId.startsWith('app_vote_up_') || i.customId.startsWith('app_vote_down_')){
        const isUp = i.customId.startsWith('app_vote_up_');
        const parts = i.customId.replace('app_vote_up_', '').replace('app_vote_down_', '').split(':');
        const guildId = parts[0];
        const ticketId = parseInt(parts[1]);

        // Check team role
        if (!hasAnyTeamRole(i.member, guildId)) {
          return i.reply({ ephemeral: true, content: '❌ Nur Team-Mitglieder können abstimmen.' });
        }

        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.id === ticketId && t.isApplication === true);
        if (!ticket) return i.reply({ ephemeral: true, content: '❌ Bewerbung nicht gefunden.' });

        // Initialize votes if not exists
        if (!ticket.votes) ticket.votes = { up: [], down: [] };

        // Check if user already voted same way
        const alreadyVotedUp = ticket.votes.up.includes(i.user.id);
        const alreadyVotedDown = ticket.votes.down.includes(i.user.id);

        // Remove existing vote
        ticket.votes.up = ticket.votes.up.filter(v => v !== i.user.id);
        ticket.votes.down = ticket.votes.down.filter(v => v !== i.user.id);

        // Toggle vote (if same button clicked again, just remove vote)
        if ((isUp && !alreadyVotedUp) || (!isUp && !alreadyVotedDown)) {
          if (isUp) ticket.votes.up.push(i.user.id);
          else ticket.votes.down.push(i.user.id);
        }

        saveTickets(guildId, tickets);

        // Update embed with vote counts
        const message = await i.message.fetch();
        const embed = EmbedBuilder.from(message.embeds[0]);

        // Update vote fields
        embed.spliceFields(0, 2,
          { name: '👍 Dafür', value: `${ticket.votes.up.length}`, inline: true },
          { name: '👎 Dagegen', value: `${ticket.votes.down.length}`, inline: true }
        );

        await i.update({ embeds: [embed] });
        return;
      }

      // Application Note Button
      if(i.customId.startsWith('app_note_') && !i.customId.startsWith('app_notes_view_')){
        const parts = i.customId.replace('app_note_', '').split(':');
        const guildId = parts[0];
        const ticketId = parseInt(parts[1]);

        // Check team role
        if (!hasAnyTeamRole(i.member, guildId)) {
          return i.reply({ ephemeral: true, content: '❌ Nur Team-Mitglieder können Notizen hinzufügen.' });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_app_note:${guildId}:${ticketId}`)
          .setTitle('📝 Notiz hinzufügen');

        const noteInput = new TextInputBuilder()
          .setCustomId('note_text')
          .setLabel('Notiz (nur für Team sichtbar)')
          .setPlaceholder('z.B. Hat gute Erfahrung, Interview vereinbaren...')
          .setRequired(true)
          .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
        return i.showModal(modal);
      }

      // Interview Button
      if(i.customId.startsWith('app_interview_')){
        const parts = i.customId.replace('app_interview_', '').split(':');
        const guildId = parts[0];
        const ticketId = parseInt(parts[1]);

        // Check team role
        if (!hasAnyTeamRole(i.member, guildId)) {
          return i.reply({ ephemeral: true, content: '❌ Nur Team-Mitglieder können Interviews planen.' });
        }

        const modal = new ModalBuilder()
          .setCustomId(`modal_app_interview:${guildId}:${ticketId}`)
          .setTitle('📅 Interview planen');

        const dateInput = new TextInputBuilder()
          .setCustomId('interview_date')
          .setLabel('Datum (TT.MM.JJJJ)')
          .setPlaceholder('z.B. 25.12.2025')
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10);

        const timeInput = new TextInputBuilder()
          .setCustomId('interview_time')
          .setLabel('Uhrzeit (HH:MM)')
          .setPlaceholder('z.B. 18:00')
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(5);

        const noteInput = new TextInputBuilder()
          .setCustomId('interview_note')
          .setLabel('Hinweise für den Bewerber (optional)')
          .setPlaceholder('z.B. Bitte im Voice-Channel erscheinen')
          .setRequired(false)
          .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(
          new ActionRowBuilder().addComponents(dateInput),
          new ActionRowBuilder().addComponents(timeInput),
          new ActionRowBuilder().addComponents(noteInput)
        );

        return i.showModal(modal);
      }

      // View Notes Button
      if(i.customId.startsWith('app_notes_view_')){
        const parts = i.customId.replace('app_notes_view_', '').split(':');
        const guildId = parts[0];
        const ticketId = parseInt(parts[1]);

        // Check team role
        if (!hasAnyTeamRole(i.member, guildId)) {
          return i.reply({ ephemeral: true, content: '❌ Nur Team-Mitglieder können Notizen sehen.' });
        }

        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.id === ticketId && t.isApplication === true);
        if (!ticket) return i.reply({ ephemeral: true, content: '❌ Bewerbung nicht gefunden.' });

        const notes = ticket.notes || [];

        if (notes.length === 0) {
          return i.reply({ ephemeral: true, content: '📋 Noch keine Notizen vorhanden.' });
        }

        const notesEmbed = createStyledEmbed({
          emoji: '📋',
          title: `Notizen für Bewerbung #${ticketId}`,
          description: notes.map((n, idx) =>
            `**${idx + 1}.** ${n.text}\n└ <@${n.userId}> • <t:${Math.floor(new Date(n.createdAt).getTime() / 1000)}:R>`
          ).join('\n\n'),
          footer: `${notes.length} Notiz${notes.length !== 1 ? 'en' : ''} • Nur für Team sichtbar`
        });

        return i.reply({ embeds: [notesEmbed], ephemeral: true });
      }

      // Reopen archived ticket from log channel
      if(i.customId.startsWith('reopen_ticket:')){
        const parts = i.customId.split(':');
        const reopenGuildId = parts[1];
        const ticketId = parseInt(parts[2]);

        // Check permissions
        const cfg = readCfg(reopenGuildId);
        const isTeamMember = hasAnyTeamRole(i.member, reopenGuildId);
        if (!isTeamMember) {
          return i.reply({
            content: '❌ Nur Team-Mitglieder können Tickets wiedereröffnen.',
            ephemeral: true
          });
        }

        const allTickets = loadTickets(reopenGuildId);
        const ticket = allTickets.find(t => t.id === ticketId);

        if (!ticket) {
          return i.reply({
            content: '❌ Ticket nicht gefunden.',
            ephemeral: true
          });
        }

        if (!ticket.archived) {
          return i.reply({
            content: '⚠️ Dieses Ticket ist nicht archiviert.',
            ephemeral: true
          });
        }

        // Check if channel still exists
        let archivedChannel = null;
        try {
          archivedChannel = await i.guild.channels.fetch(ticket.channelId);
        } catch (err) {
          return i.reply({
            content: '❌ Der archivierte Kanal existiert nicht mehr.',
            ephemeral: true
          });
        }

        await i.deferReply({ ephemeral: true });

        try {
          // Get original category
          const categoryIds = Array.isArray(cfg.ticketCategoryId) ? cfg.ticketCategoryId : (cfg.ticketCategoryId ? [cfg.ticketCategoryId] : []);
          let targetCategoryId = categoryIds.length > 0 ? categoryIds[0] : null;

          // Restore permissions
          const reopenPermissions = [
            { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ];

          // Team role
          const TEAM_ROLE = getTeamRole(reopenGuildId);
          if (TEAM_ROLE && TEAM_ROLE.trim()) {
            reopenPermissions.push({
              id: TEAM_ROLE,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            });
          }

          // Added users
          if (ticket.addedUsers && Array.isArray(ticket.addedUsers)) {
            ticket.addedUsers.forEach(uid => {
              reopenPermissions.push({
                id: uid,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
              });
            });
          }

          await archivedChannel.permissionOverwrites.set(reopenPermissions);

          // Move back to ticket category
          if (targetCategoryId) {
            await archivedChannel.setParent(targetCategoryId, { lockPermissions: false });
          }

          // Rename channel (remove "closed-" prefix)
          let newName = archivedChannel.name.replace(/^closed-/, '');
          await archivedChannel.setName(newName);

          // Update ticket status
          ticket.archived = false;
          ticket.status = 'offen';
          ticket.reopenedAt = Date.now();
          ticket.reopenedBy = i.user.id;
          delete ticket.archivedAt;
          saveTickets(reopenGuildId, allTickets);

          // Send message in channel
          const reopenEmbed = createStyledEmbed({
            emoji: '🔓',
            title: 'Ticket wiedereröffnet',
            description: `Dieses Ticket wurde von <@${i.user.id}> wiedereröffnet.`,
            fields: [
              { name: 'Ticket', value: `#${ticket.id}`, inline: true },
              { name: 'Status', value: '🟢 Offen', inline: true }
            ],
            color: '#57F287'
          });
          await archivedChannel.send({ embeds: [reopenEmbed] });

          // Disable the reopen button
          try {
            const originalMessage = i.message;
            const updatedComponents = originalMessage.components.map(row => {
              const newRow = new ActionRowBuilder();
              row.components.forEach(comp => {
                if (comp.customId && comp.customId.startsWith('reopen_ticket:')) {
                  newRow.addComponents(
                    ButtonBuilder.from(comp).setDisabled(true).setLabel('✅ Wiedereröffnet')
                  );
                } else {
                  newRow.addComponents(ButtonBuilder.from(comp));
                }
              });
              return newRow;
            });
            await i.message.edit({ components: updatedComponents });
          } catch (err) {
            console.error('Could not disable reopen button:', err.message);
          }

          await i.editReply({
            content: `✅ Ticket #${ticket.id} wurde wiedereröffnet! ${archivedChannel}`
          });

          logEvent(i.guild, `🔓 Ticket **#${ticket.id}** wurde von <@${i.user.id}> wiedereröffnet`);
        } catch (err) {
          console.error('Reopen ticket error:', err);
          await i.editReply({
            content: '❌ Fehler beim Wiedereröffnen des Tickets.'
          });
        }
        return;
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

            const thankYouEmbed = createStyledEmbed({
              emoji: '✅',
              title: 'Vielen Dank für deine Bewertung!',
              description: `Du hast **${stars} ${'⭐'.repeat(stars)}** vergeben. Dein Feedback hilft uns, unseren Service zu verbessern!`,
              fields: [
                { name: 'Ticket', value: `#${ticketId}`, inline: true },
                { name: 'Bewertung', value: `${stars}/5 Sterne`, inline: true }
              ],
              color: '#57F287'
            });

            await i.update({ embeds: [thankYouEmbed], components: [] });

            // Send transcript to user
            try {
              const transcriptDir = path.join(__dirname, 'transcripts', foundGuildId);
              const htmlPath = path.join(transcriptDir, `transcript_${ticketId}.html`);
              const txtPath = path.join(transcriptDir, `transcript_${ticketId}.txt`);

              const files = [];
              if (fs.existsSync(htmlPath)) files.push(htmlPath);
              if (fs.existsSync(txtPath)) files.push(txtPath);

              if (files.length > 0) {
                const transcriptEmbed = createStyledEmbed({
                  emoji: '📄',
                  title: 'Dein Ticket-Verlauf',
                  description: `Hier ist der Verlauf von Ticket #${ticketId} für deine Unterlagen.`
                });

                await i.user.send({ embeds: [transcriptEmbed], files: files }).catch(() => {});
              }
            } catch (transcriptErr) {
              console.log('Could not send transcript with rating:', transcriptErr.message);
            }

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
          const nextEmbed = createStyledEmbed({
            emoji: '📋',
            title: t(foundGuildId, 'surveys.dm_title'),
            description: t(foundGuildId, 'surveys.dm_description', { ticketId: String(foundTicket.id).padStart(5, '0') }),
            fields: [
              { name: nextQuestion.text[lang] || nextQuestion.text.de, value: getQuestionScaleText(nextQuestion.type, lang, foundGuildId), inline: false }
            ],
            footer: `Frage ${nextQuestionIndex + 1} von ${questions.length}`
          });

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

          const thankYouEmbed = createStyledEmbed({
            emoji: '✅',
            title: t(foundGuildId, 'surveys.thank_you'),
            description: t(foundGuildId, 'surveys.thank_you_description'),
            fields: [
              { name: 'Ticket', value: `#${String(ticketId).padStart(5, '0')}`, inline: true },
              { name: 'Antworten', value: `${foundTicket.survey.responses.length}`, inline: true }
            ],
            color: '#57F287'
          });

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
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Für diesen Channel wurde kein Ticket-Datensatz gefunden.',
          color: '#ED4245'
        });
        return i.reply({ embeds: [noTicketEmbed], ephemeral: true });
      }

      const TEAM_ROLE = getTeamRole(guildId);
      const isTeam = hasAnyTeamRole(i.member, guildId);
      const isCreator = ticket.userId === i.user.id;
      const isClaimer = ticket.claimer === i.user.id;

      if(i.customId==='request_close'){
        // Check if ticket is archived
        if (ticket.archived) {
          const archivedEmbed = createStyledEmbed({
            emoji: '📦',
            title: 'Ticket archiviert',
            description: 'Dieses Ticket ist bereits archiviert und kann nicht mehr geschlossen werden.',
            color: '#FFA500'
          });
          return i.reply({ embeds: [archivedEmbed], ephemeral: true });
        }

        // Bestimme wer die Anfrage stellt
        const requesterType = isCreator || (ticket.addedUsers && ticket.addedUsers.includes(i.user.id)) ? 'user' : 'team';

        // SOFORT antworten um Timeout zu vermeiden
        const confirmEmbed = createStyledEmbed({
          emoji: '📩',
          title: 'Schließungsanfrage gesendet',
          description: requesterType === 'user'
            ? 'Ein Team-Mitglied oder Claimer prüft deine Anfrage.'
            : 'Der Ticket-Ersteller muss zustimmen.',
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Angefragt von', value: `<@${i.user.id}>`, inline: true }
          ],
          color: '#57F287'
        });

        await i.reply({ embeds: [confirmEmbed], ephemeral: true });

        // Speichere Schließungsanfrage im Ticket
        if (!ticket.closeRequest) ticket.closeRequest = {};
        ticket.closeRequest = {
          requestedBy: i.user.id,
          requesterType: requesterType,
          requestedAt: Date.now(),
          status: 'pending'
        };
        saveTickets(guildId, log);

        // Build ping mentions based on requester type
        let pingMentions = '';
        if (requesterType === 'user') {
          // User requests close -> ping claimer (if claimed) or all team roles
          if (ticket.claimer) {
            pingMentions = `<@${ticket.claimer}>`;
          } else {
            const teamRoles = getAllTeamRoles(guildId);
            if (teamRoles.length > 0) {
              pingMentions = teamRoles.map(roleId => `<@&${roleId}>`).join(' ');
            }
          }
        } else {
          // Team requests close -> ping creator and all added users
          const mentions = [`<@${ticket.userId}>`];
          if (ticket.addedUsers && Array.isArray(ticket.addedUsers)) {
            mentions.push(...ticket.addedUsers.map(uid => `<@${uid}>`));
          }
          pingMentions = mentions.join(' ');
        }

        const requestEmbed = createStyledEmbed({
          emoji: '📩',
          title: 'Schließungsanfrage',
          description: requesterType === 'user'
            ? `<@${i.user.id}> möchte dieses Ticket schließen lassen.`
            : `<@${i.user.id}> (Team) möchte dieses Ticket schließen.`,
          fields: [
            { name: 'Bestätigung', value: requesterType === 'user' ? 'Ein Team-Mitglied oder Claimer muss bestätigen.' : 'Der Ticket-Ersteller muss bestätigen.', inline: false },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Angefordert von', value: `<@${i.user.id}>`, inline: true }
          ],
          color: '#FEE75C'
        });

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

        // Send ping mentions first (if any), then embed
        let requestMessage;
        if (pingMentions) {
          await i.channel.send({ content: pingMentions }).catch(() => {});
          requestMessage = await i.channel.send({ embeds: [requestEmbed], components: [closeButtons] }).catch(() => null);
        } else {
          requestMessage = await i.channel.send({ embeds: [requestEmbed], components: [closeButtons] }).catch(() => null);
        }
        if (requestMessage) {
          ticket.closeRequest.messageId = requestMessage.id;
          saveTickets(guildId, log);
        }
        logEvent(i.guild, t(guildId, 'logs.close_requested', { id: ticket.id, user: `<@${i.user.id}>` }));
        return;
      }

      // Voice-Support Button Handler
      if (i.customId === 'request_voice') {
        if (!hasFeature(guildId, 'voiceSupport')) {
          const premiumEmbed = createStyledEmbed({
            emoji: '⭐',
            title: 'Premium Feature',
            description: t(guildId, 'voiceSupport.feature_locked'),
            color: '#FEE75C'
          });
          return i.reply({ embeds: [premiumEmbed], ephemeral: true });
        }

        // Nur Team kann Voice-Channels erstellen
        if (!isTeam) {
          const noPermEmbed = createStyledEmbed({
            emoji: '🚫',
            title: 'Zugriff verweigert',
            description: 'Nur Team-Mitglieder können Voice-Channels erstellen.',
            fields: [
              { name: 'Benötigte Berechtigung', value: 'Team-Rolle', inline: true },
              { name: 'Ticket', value: `#${ticket.id}`, inline: true }
            ],
            color: '#ED4245'
          });
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        if (hasVoiceChannel(ticket)) {
          const alreadyExistsEmbed = createStyledEmbed({
            emoji: '⚠️',
            title: 'Voice-Channel existiert bereits',
            description: t(guildId, 'voiceSupport.already_exists'),
            color: '#FEE75C'
          });
          return i.reply({ embeds: [alreadyExistsEmbed], ephemeral: true });
        }

        try {
          await i.deferReply({ ephemeral: true });
          const voiceChannel = await createVoiceChannel(i, ticket, guildId);

          const successEmbed = createStyledEmbed({
            emoji: '🎤',
            title: t(guildId, 'voiceSupport.channel_created'),
            description: t(guildId, 'voiceSupport.channel_description', { channel: `<#${voiceChannel.id}>` }),
            color: '#57F287'
          });

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
          const voiceLogEmbed = createStyledEmbed({
            emoji: '🎤',
            title: 'Voice-Support erstellt',
            description: `Voice-Channel wurde von ${i.user} erstellt.`,
            fields: [
              { name: 'Channel', value: `<#${voiceChannel.id}>`, inline: true }
            ],
            color: '#57F287'
          });

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
          const premiumEmbed = createStyledEmbed({
            emoji: '⭐',
            title: 'Premium Feature',
            description: t(guildId, 'voiceSupport.feature_locked'),
            color: '#FEE75C'
          });
          return i.reply({ embeds: [premiumEmbed], ephemeral: true });
        }

        // Nur Team kann Voice-Channels beenden
        if (!isTeam) {
          const noPermEmbed = createStyledEmbed({
            emoji: '🚫',
            title: 'Zugriff verweigert',
            description: 'Nur Team-Mitglieder können Voice-Channels beenden.',
            fields: [
              { name: 'Benötigte Berechtigung', value: 'Team-Rolle', inline: true },
              { name: 'Ticket', value: `#${ticket.id}`, inline: true }
            ],
            color: '#ED4245'
          });
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        if (!ticket.voiceChannelId) {
          const noVoiceEmbed = createStyledEmbed({
            emoji: '❌',
            title: 'Kein Voice-Channel',
            description: 'Es ist kein Voice-Channel für dieses Ticket vorhanden.',
            color: '#ED4245'
          });
          return i.reply({ embeds: [noVoiceEmbed], ephemeral: true });
        }

        try {
          await i.deferReply({ ephemeral: true });

          // Lösche Voice-Channel
          await deleteVoiceChannel(i.guild, ticket.voiceChannelId, guildId);

          const successEmbed = createStyledEmbed({
            emoji: '🔇',
            title: t(guildId, 'voiceSupport.ended'),
            description: t(guildId, 'voiceSupport.ended_description'),
            color: '#ED4245'
          });

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
          const voiceLogEmbed = createStyledEmbed({
            emoji: '🔇',
            title: 'Voice-Support beendet',
            description: `Voice-Channel wurde von ${i.user} beendet.`,
            color: '#ED4245'
          });

          await i.channel.send({ embeds: [voiceLogEmbed] });
        } catch (err) {
          console.error('Error ending voice channel:', err);
          const errorEmbed = createStyledEmbed({
            emoji: '❌',
            title: 'Fehler',
            description: 'Voice-Channel konnte nicht gelöscht werden.',
            color: '#ED4245'
          });
          await i.editReply({ embeds: [errorEmbed] }).catch(() => {});
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

        // DM mit Transcript wird weiter unten gesendet (einheitliches Format mit Statistiken)

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

        const closeEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Schließungsanfrage genehmigt',
          description: `Die Schließungsanfrage wurde von **${closerName}** genehmigt.`,
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Angefordert von', value: `<@${ticket.closeRequest.requestedBy}>`, inline: true },
            { name: 'Genehmigt von', value: `<@${i.user.id}>`, inline: true }
          ],
          color: '#57F287'
        });

        await i.channel.send({ embeds: [closeEmbed] });

        let files = null;
        let messageStats = null;
        const channelName = i.channel.name; // Speichere Channel-Namen bevor er gelöscht wird
        const ticketDisplayName = getTicketDisplayName(channelName, ticket, cfg); // Ticket-Name basierend auf Einstellung
        try {
          // Nachrichtenstatistiken berechnen BEVOR der Kanal gelöscht wird
          messageStats = await getTicketMessageStats(i.channel);
          files = await createTranscript(i.channel, ticket, { resolveMentions: true });
          console.log(`✅ Transcript erstellt für Ticket #${ticket.id}:`, files ? 'OK' : 'LEER');
        } catch (err) {
          console.error(`❌ Fehler beim Erstellen des Transcripts für Ticket #${ticket.id}:`, err.message);
        }

        // Transcripts senden
        console.log(`📁 Transcript-Config: channelIds=${JSON.stringify(cfg.transcriptChannelId)}, sendToCreator=${cfg.sendTranscriptToCreator}`);
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

          const userStatsText = messageStats && messageStats.userStats.length > 0
            ? messageStats.userStats.map((u, idx) => `${idx + 1} - <@${u.userId}>`).join('\n')
            : 'Keine Nutzer';

          // Erstelle das Transcript-Embed mit Statistiken
          const transcriptEmbed = createStyledEmbed({
            emoji: '📧',
            title: 'Ticket geschlossen',
            description: 'Das Transcript deines Tickets kannst du oberhalb dieser Nachricht herunterladen.',
            fields: [
              { name: 'Nachrichten', value: `${messageStats?.totalMessages || 0} Nachrichten`, inline: true },
              { name: 'Ticket Name', value: `| 📁 | 💎 |${ticketDisplayName}`, inline: true },
              { name: 'Erstellt von', value: `<@${ticket.userId}>`, inline: true },
              { name: 'Datum', value: `<t:${Math.floor((ticket.timestamp || Date.now()) / 1000)}:f>`, inline: true },
              { name: 'Ticket User', value: userStatsText, inline: false }
            ],
            footer: i.guild.name
          });

          // Add reopen button if archive is enabled
          const transcriptComponents = [transcriptButton];
          if (cfg.archiveEnabled && cfg.archiveCategoryId) {
            const reopenButton = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`reopen_ticket:${guildId}:${ticket.id}`)
                .setStyle(ButtonStyle.Success)
                .setLabel('🔓 Ticket wiedereröffnen')
                .setEmoji('🔄')
            );
            transcriptComponents.push(reopenButton);
          }

          for (const channelId of transcriptChannelIds) {
            try {
              const tc = await i.guild.channels.fetch(channelId);
              if (tc) {
                await tc.send({
                  embeds: [transcriptEmbed],
                  files: [files.txt, files.html],
                  components: transcriptComponents
                });
              }
            } catch (err) {
              console.error(`Transcript-Channel ${channelId} nicht gefunden:`, err.message);
            }
          }
        }

        logEvent(i.guild, `🔐 Ticket **#${ticket.id}** geschlossen durch Zustimmung von ${closerTag}`);

        // IMMER Transcript an Creator senden via DM (mit Statistiken)
        if (files) {
          try {
            const creator = await client.users.fetch(ticket.userId).catch(() => null);
            if (creator) {
              const userStatsDMText = messageStats && messageStats.userStats.length > 0
                ? messageStats.userStats.map((u, idx) => `${idx + 1} - <@${u.userId}>`).join('\n')
                : 'Keine Nutzer';

              const transcriptDMEmbed = createStyledEmbed({
                emoji: '📧',
                title: 'Ticket geschlossen',
                description: 'Das Transcript deines Tickets kannst du oberhalb dieser Nachricht herunterladen.',
                fields: [
                  { name: 'Nachrichten', value: `${messageStats?.totalMessages || 0} Nachrichten`, inline: true },
                  { name: 'Ticket Name', value: `| 📁 | 💎 |${ticketDisplayName}`, inline: true },
                  { name: 'Erstellt von', value: `<@${ticket.userId}>`, inline: true },
                  { name: 'Datum', value: `<t:${Math.floor((ticket.timestamp || Date.now()) / 1000)}:f>`, inline: true },
                  { name: 'Ticket User', value: userStatsDMText, inline: false }
                ],
                footer: i.guild.name
              });

              await creator.send({
                embeds: [transcriptDMEmbed],
                files: [files.txt, files.html]
              });
              console.log(`✅ Transcript-DM gesendet an User ${creator.tag} für Ticket #${ticket.id}`);
            }
          } catch (dmErr) {
            console.log('Konnte Transcript-DM nicht senden:', dmErr.message);
          }
        }

        // Optional: Rating/Survey separat senden (ohne Transcript, das wurde bereits oben gesendet)
        try {
          const user = await client.users.fetch(ticket.userId).catch(() => null);
          if (user) {
            // Check if new Survey System is enabled
            if (cfg.surveySystem && cfg.surveySystem.enabled && cfg.surveySystem.sendOnClose) {
              const { sendSurveyDM } = require('./survey-system');
              await sendSurveyDM(user, ticket, guildId, cfg);
              console.log(`✅ Survey DM sent to ${user.tag} for ticket #${ticket.id}`);
            } else if (cfg.ticketRating && cfg.ticketRating.enabled === true) {
              // Use old Rating System
              const ratingEmbed = createStyledEmbed({
                emoji: '⭐',
                title: 'Wie war deine Support-Erfahrung?',
                description: 'Dein Ticket wurde geschlossen. Bitte bewerte deinen Support, damit wir uns verbessern können!',
                fields: [
                  { name: 'Ticket', value: `#${ticket.id}`, inline: true },
                  { name: 'Thema', value: ticket.topic || 'Unbekannt', inline: true }
                ]
              });

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

              // Mark ticket as archived
              ticket.archived = true;
              ticket.archivedAt = Date.now();
              saveTickets(guildId, log);

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
          const errorEmbed = createStyledEmbed({
            emoji: '🚫',
            title: 'Keine Berechtigung',
            description: 'Du kannst dieses Ticket nicht freigeben. Nur der Team-Mitarbeiter, der das Ticket übernommen hat, kann es wieder freigeben.',
            fields: [
              { name: 'Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht gesetzt', inline: true },
              { name: 'Ticket', value: `#${ticket.id}`, inline: true }
            ],
            color: '#ED4245'
          });
          return i.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        try {
          // SOFORT Buttons aktualisieren um Timeout zu vermeiden
          delete ticket.claimer;
          saveTickets(guildId, log);
          await i.update({ components: buttonRows(false, guildId, ticket) });

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

          await i.channel.permissionOverwrites.set(permissions).catch(err => console.error('Permission error:', err));

            const unclaimEmbed = createStyledEmbed({
              emoji: '↩️',
              title: 'Ticket freigegeben',
              description: 'Das Ticket ist jetzt wieder für alle Team-Mitglieder verfügbar.',
              fields: [
                { name: 'Ticket', value: `#${ticket.id}`, inline: true },
                { name: 'Freigegeben von', value: `<@${i.user.id}>`, inline: true },
                { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
              ]
            });

          await i.channel.send({ embeds: [unclaimEmbed] }).catch(err => console.error('Unclaim message error:', err));
          renameChannelIfNeeded(i.channel, ticket);
          logEvent(i.guild, t(guildId, 'logs.ticket_unclaimed', { id: ticket.id, user: `<@${i.user.id}>` }));
        } catch(err) {
          console.error('Fehler beim Unclaim:', err);
        }
        return;
      }

      // Claim Button Handler - Ticket übernehmen
      if(i.customId === 'claim') {
        // Nur Team kann Tickets claimen
        if(!isTeam) {
          const noPermEmbed = createStyledEmbed({
            emoji: '🚫',
            title: 'Zugriff verweigert',
            description: 'Nur Team-Mitglieder können Tickets übernehmen.',
            fields: [
              { name: 'Benötigte Rolle', value: 'Team-Rolle', inline: true },
              { name: 'Ticket', value: `#${ticket.id}`, inline: true }
            ],
            color: '#ED4245'
          });
          return i.reply({ embeds: [noPermEmbed], ephemeral: true });
        }

        // Prüfe ob Ticket bereits geclaimed ist
        if(ticket.claimer) {
          const alreadyClaimedEmbed = createStyledEmbed({
            emoji: '⚠️',
            title: 'Bereits übernommen',
            description: `Dieses Ticket wurde bereits von <@${ticket.claimer}> übernommen.`,
            fields: [
              { name: 'Ticket', value: `#${ticket.id}`, inline: true },
              { name: 'Aktueller Claimer', value: `<@${ticket.claimer}>`, inline: true }
            ],
            color: '#FEE75C'
          });
          return i.reply({ embeds: [alreadyClaimedEmbed], ephemeral: true });
        }

        try {
          // SOFORT Buttons aktualisieren um Timeout zu vermeiden
          ticket.claimer = i.user.id;
          saveTickets(guildId, log);
          await i.update({ components: buttonRows(true, guildId, ticket) });

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

          await i.channel.permissionOverwrites.set(permissions).catch(err => console.error('Permission error:', err));

          // Send claim notification WITH PING outside embed
          const claimEmbed = createStyledEmbed({
            emoji: '✨',
            title: 'Ticket übernommen',
            description: `<@${i.user.id}> hat dieses Ticket übernommen und kümmert sich um dein Anliegen.`,
            fields: [
              { name: 'Ticket', value: `#${ticket.id}`, inline: true },
              { name: 'Claimer', value: `<@${i.user.id}>`, inline: true },
              { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            ],
            color: '#57F287'
          });

          await i.channel.send({
            content: `<@${i.user.id}>`,
            embeds: [claimEmbed]
          }).catch(err => console.error('Claim message error:', err));

          // Update channel name with 🔒 emoji
          renameChannelIfNeeded(i.channel, ticket);

          logEvent(i.guild, t(guildId, 'logs.ticket_claimed', { id: ticket.id, user: `<@${i.user.id}>` }));
        } catch(err) {
          console.error('Error claiming ticket:', err);
          if(!i.replied && !i.deferred) {
            return i.reply({
              content: '❌ Fehler beim Übernehmen des Tickets.',
              ephemeral: true
            });
          }
        }
        return;
      }

      if(!isTeam) {
        const cfg = readCfg(guildId);
        const teamRoleId = getTeamRole(guildId);
        const teamRole = teamRoleId ? await i.guild.roles.fetch(teamRoleId).catch(() => null) : null;

        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Diese Aktion ist nur für Team-Mitglieder verfügbar.',
          fields: [
            { name: 'Benötigte Rolle', value: teamRole ? `<@&${teamRoleId}>` : 'Nicht konfiguriert', inline: true },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true }
          ],
          color: '#ED4245'
        });

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

            const claimEmbed = createStyledEmbed({
              emoji: '✨',
              title: 'Ticket übernommen',
              description: `<@${i.user.id}> hat das Ticket übernommen und wird sich um dein Anliegen kümmern.`,
              fields: [
                { name: 'Ticket', value: `#${updatedTicket.id}`, inline: true },
                { name: 'Übernommen von', value: `<@${i.user.id}>`, inline: true },
                { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
              ],
              color: '#57F287'
            });

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
        case 'merge_ticket': {
          // Nur Team-Mitglieder dürfen mergen
          const mergeConfig = readCfg(guildId);
          const teamRoleIds = Array.isArray(mergeConfig.teamRoleId) ? mergeConfig.teamRoleId : [mergeConfig.teamRoleId];
          const hasTeamRole = teamRoleIds.some(roleId => roleId && i.member.roles.cache.has(roleId));

          if (!hasTeamRole && !i.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return i.reply({ content: t(guildId, 'messages.only_team'), ephemeral: true });
          }

          // Finde andere offene Tickets die merged werden können
          const allTickets = loadTickets(guildId);
          const openTickets = allTickets.filter(t =>
            t.status === 'offen' &&
            t.id !== ticket.id &&
            !t.isApplication &&
            t.status !== 'merged'
          );

          if (openTickets.length === 0) {
            return i.reply({
              content: t(guildId, 'merge.no_tickets') || '❌ Keine anderen offenen Tickets zum Zusammenführen gefunden.',
              ephemeral: true
            });
          }

          // Max 25 Optionen für Select Menu
          const ticketOptions = openTickets.slice(0, 25).map(t => ({
            label: `Ticket #${t.id}`,
            description: `${t.topic || 'Kein Thema'} - ${t.username || 'Unbekannt'}`.substring(0, 100),
            value: `${t.id}`
          }));

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`merge_ticket_select:${ticket.id}`)
            .setPlaceholder(t(guildId, 'merge.select_ticket') || 'Wähle ein Ticket zum Zusammenführen...')
            .addOptions(ticketOptions);

          const selectRow = new ActionRowBuilder().addComponents(selectMenu);

          const mergeEmbed = createStyledEmbed({
            emoji: '🔗',
            title: t(guildId, 'merge.title') || 'Tickets zusammenführen',
            description: t(guildId, 'merge.description') || 'Wähle das Ticket, das in dieses Ticket zusammengeführt werden soll. Das ausgewählte Ticket wird archiviert und alle Benutzer, Notizen und ein Nachrichten-Log werden übernommen.',
            footer: `Ziel-Ticket: #${ticket.id}`
          });

          return i.reply({ embeds: [mergeEmbed], components: [selectRow], ephemeral: true });
        }
        case 'close': {
          await i.deferReply({ ephemeral: true });

          ticket.status = 'geschlossen';
          ticket.closedAt = Date.now();
          ticket.closedBy = i.user.id;
          saveTickets(guildId, log);

          // Config laden für Reopen-Button und Ticket-Display-Name
          const cfg = readCfg(guildId);

          const closeEmbed = createStyledEmbed({
            emoji: '🔐',
            title: 'Ticket wird geschlossen',
            description: 'Dieses Ticket wird in wenigen Sekunden geschlossen und archiviert.',
            fields: [
              { name: 'Ticket', value: `#${ticket.id}`, inline: true },
              { name: 'Geschlossen von', value: `<@${i.user.id}>`, inline: true },
              { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            ],
            color: '#ED4245'
          });

          // Add reopen button if archive is enabled
          const closeComponents = [];
          if (cfg.archiveEnabled && cfg.archiveCategoryId) {
            const reopenRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`reopen_ticket:${guildId}:${ticket.id}`)
                .setStyle(ButtonStyle.Success)
                .setLabel('Ticket wiedereröffnen')
                .setEmoji('🔓')
            );
            closeComponents.push(reopenRow);
          }

          await i.channel.send({ embeds: [closeEmbed], components: closeComponents.length > 0 ? closeComponents : undefined });

          // Channel-Namen speichern BEVOR er gelöscht wird
          const channelName = i.channel.name;
          const ticketDisplayName = getTicketDisplayName(channelName, ticket, cfg);

          // Nachrichtenstatistiken berechnen BEVOR Transcript erstellt wird
          let messageStats = null;
          try {
            messageStats = await getTicketMessageStats(i.channel);
          } catch (err) {
            console.error('Fehler beim Berechnen der Nachrichtenstatistiken:', err.message);
          }

          // Generate transcript
          let files = null;
          try {
            files = await createTranscript(i.channel, ticket, { guildId });
            console.log(`✅ Transcript erstellt für Ticket #${ticket.id}:`, files ? 'OK' : 'LEER');
          } catch (err) {
            console.error(`❌ Fehler beim Erstellen des Transcripts für Ticket #${ticket.id}:`, err.message);
          }

          // Send transcript to channel
          const transcriptChannelIds = Array.isArray(cfg.transcriptChannelId) && cfg.transcriptChannelId.length > 0
            ? cfg.transcriptChannelId
            : (cfg.transcriptChannelId ? [cfg.transcriptChannelId] : []);

          if (transcriptChannelIds.length > 0 && files) {
            // Baue User-Statistiken-String
            let userStatsString = '';
            if (messageStats && messageStats.userStats.length > 0) {
              userStatsString = messageStats.userStats
                .map(u => `**${u.count}** - <@${u.userId}>`)
                .join('\n');
            } else {
              userStatsString = 'Keine Nachrichten';
            }

            // Erstelle das Transcript-Embed mit Statistiken
            const transcriptChannelEmbed = createStyledEmbed({
              emoji: '📧',
              title: 'Ticket geschlossen',
              description: 'Das Transcript deines Tickets kannst du oberhalb dieser Nachricht herunterladen.',
              fields: [
                { name: 'Nachrichten', value: `${messageStats?.totalMessages || 0} Nachrichten`, inline: true },
                { name: 'Ticket Name', value: `| 📋 | ${ticketDisplayName}`, inline: true },
                { name: 'Erstellt von', value: `<@${ticket.userId}>`, inline: true },
                { name: 'Datum', value: `<t:${Math.floor((ticket.timestamp || Date.now()) / 1000)}:f>`, inline: true },
                { name: 'Ticket User', value: userStatsString || 'Keine Nutzer', inline: false }
              ],
              footer: i.guild.name
            });

            // Add reopen button if archive is enabled
            const confirmCloseComponents = [];
            if (cfg.archiveEnabled && cfg.archiveCategoryId) {
              const reopenButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`reopen_ticket:${guildId}:${ticket.id}`)
                  .setStyle(ButtonStyle.Success)
                  .setLabel('🔓 Ticket wiedereröffnen')
                  .setEmoji('🔄')
              );
              confirmCloseComponents.push(reopenButton);
            }

            for (const channelId of transcriptChannelIds) {
              try {
                const tc = await i.guild.channels.fetch(channelId);
                if (tc) {
                  await tc.send({
                    embeds: [transcriptChannelEmbed],
                    files: [files.txt, files.html],
                    components: confirmCloseComponents.length > 0 ? confirmCloseComponents : undefined
                  });
                  console.log(`✅ Transcript an Channel ${channelId} gesendet`);
                }
              } catch (err) {
                console.error(`❌ Transcript-Channel ${channelId} nicht gefunden:`, err.message);
              }
            }
          }

          // IMMER Transcript an Creator senden via DM (mit Statistiken)
          if (files) {
            try {
              const creator = await client.users.fetch(ticket.userId).catch(() => null);
              if (creator) {
                // Baue User-Statistiken-String für DM (mit Mentions)
                let userStatsStringDM = '';
                if (messageStats && messageStats.userStats.length > 0) {
                  userStatsStringDM = messageStats.userStats
                    .map(u => `**${u.count}** - <@${u.userId}>`)
                    .join('\n');
                } else {
                  userStatsStringDM = 'Keine Nachrichten';
                }

                const transcriptDMEmbed = createStyledEmbed({
                  emoji: '📧',
                  title: 'Ticket geschlossen',
                  description: 'Das Transcript deines Tickets kannst du oberhalb dieser Nachricht herunterladen.',
                  fields: [
                    { name: 'Nachrichten', value: `${messageStats?.totalMessages || 0} Nachrichten`, inline: true },
                    { name: 'Ticket Name', value: `| 📋 | ${ticketDisplayName}`, inline: true },
                    { name: 'Erstellt von', value: `<@${ticket.userId}>`, inline: true },
                    { name: 'Datum', value: `<t:${Math.floor((ticket.timestamp || Date.now()) / 1000)}:f>`, inline: true },
                    { name: 'Ticket User', value: userStatsStringDM || 'Keine Nutzer', inline: false }
                  ],
                  footer: i.guild.name
                });

                await creator.send({
                  embeds: [transcriptDMEmbed],
                  files: [files.txt, files.html]
                });
                console.log(`✅ Transcript-DM gesendet an User ${creator.tag} für Ticket #${ticket.id}`);
              }
            } catch (dmErr) {
              console.log('Konnte Transcript-DM nicht senden:', dmErr.message);
            }
          }

          // Optional: Rating/Survey separat senden (ohne Transcript, das wurde bereits oben gesendet)
          try {
            const user = await client.users.fetch(ticket.userId).catch(() => null);
            if (user) {
              // Check if new Survey System is enabled
              if (cfg.surveySystem && cfg.surveySystem.enabled && cfg.surveySystem.sendOnClose) {
                const { sendSurveyDM } = require('./survey-system');
                await sendSurveyDM(user, ticket, guildId, cfg);
                console.log(`✅ Survey DM sent to ${user.tag} for ticket #${ticket.id}`);
              } else if (cfg.ticketRating && cfg.ticketRating.enabled === true) {
                // Use old Rating System
                const ratingEmbed = createStyledEmbed({
                  emoji: '⭐',
                  title: 'Wie war deine Support-Erfahrung?',
                  description: `Dein Ticket **#${ticket.id}** wurde geschlossen. Bitte bewerte deinen Support, damit wir uns verbessern können!`,
                  fields: [
                    { name: 'Ticket', value: `#${ticket.id}`, inline: true },
                    { name: 'Thema', value: ticket.topic || 'Unbekannt', inline: true }
                  ]
                });

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

                // Mark ticket as archived
                ticket.archived = true;
                ticket.archivedAt = Date.now();
                const allTickets = loadTickets(guildId);
                const ticketIndex = allTickets.findIndex(t => t.id === ticket.id);
                if (ticketIndex !== -1) {
                  allTickets[ticketIndex] = ticket;
                  saveTickets(guildId, allTickets);
                }

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
      const denyEmbed = createStyledEmbed({
        emoji: '❌',
        title: 'Schließungsanfrage abgelehnt',
        description: `<@${i.user.id}> hat die Schließungsanfrage abgelehnt.`,
        fields: [
          { name: 'Grund', value: reason, inline: false },
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Abgelehnt am', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        ],
        color: '#ED4245'
      });

      await i.channel.send({ embeds: [denyEmbed] });

      const requesterEmbed = createStyledEmbed({
        emoji: '❌',
        title: 'Deine Schließungsanfrage wurde abgelehnt',
        description: `Ticket #${ticket.id} wird nicht geschlossen.`,
        fields: [
          { name: 'Grund', value: reason, inline: false },
          { name: 'Ticket', value: `<#${i.channel.id}>`, inline: true },
          { name: 'Abgelehnt am', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        ],
        color: '#ED4245'
      });

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
        const notFoundEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Ticket nicht gefunden',
          description: 'Das Ticket konnte nicht gefunden werden.',
          color: '#ED4245'
        });
        return i.reply({ embeds: [notFoundEmbed], ephemeral: true });
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

        const thankYouEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Vielen Dank für deine Bewertung!',
          description: `Du hast **${stars} ${'⭐'.repeat(parseInt(stars))}** vergeben. Dein Feedback hilft uns, unseren Service zu verbessern!`,
          fields: [
            { name: 'Ticket', value: `#${ticketId}`, inline: true },
            { name: 'Bewertung', value: `${stars}/5 Sterne`, inline: true },
            { name: 'Feedback', value: feedback.substring(0, 200) + (feedback.length > 200 ? '...' : ''), inline: false }
          ],
          color: '#57F287'
        });

        await i.reply({ embeds: [thankYouEmbed], ephemeral: true });

        // Send transcript to user
        try {
          const transcriptDir = path.join(__dirname, 'transcripts', foundGuildId);
          const htmlPath = path.join(transcriptDir, `transcript_${ticketId}.html`);
          const txtPath = path.join(transcriptDir, `transcript_${ticketId}.txt`);

          const files = [];
          if (fs.existsSync(htmlPath)) files.push(htmlPath);
          if (fs.existsSync(txtPath)) files.push(txtPath);

          if (files.length > 0) {
            const transcriptEmbed = createStyledEmbed({
              emoji: '📄',
              title: 'Dein Ticket-Verlauf',
              description: `Hier ist der Verlauf von Ticket #${ticketId} für deine Unterlagen.`,
              color: '#3B82F6'
            });

            await i.user.send({ embeds: [transcriptEmbed], files: files }).catch(() => {});
          }
        } catch (transcriptErr) {
          console.log('Could not send transcript with rating:', transcriptErr.message);
        }

        // Notify team in log channel
        try {
          const guild = client.guilds.cache.get(foundGuildId);
          if (guild) {
            const logEmbed = createStyledEmbed({
              emoji: '⭐',
              title: 'Neue Ticket-Bewertung',
              description: `Ticket #${ticketId} wurde bewertet`,
              fields: [
                { name: 'Bewertung', value: `${stars}/5 Sterne`, inline: true },
                { name: 'Bewertet von', value: `<@${i.user.id}>`, inline: true },
                { name: 'Feedback', value: feedback.substring(0, 1000), inline: false }
              ],
              color: '#3B82F6'
            });

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
        const nextEmbed = createStyledEmbed({
          emoji: '📋',
          title: t(foundGuildId, 'surveys.dm_title') || 'Umfrage',
          description: t(foundGuildId, 'surveys.dm_description', { ticketId: String(foundTicket.id).padStart(5, '0') }),
          fields: [
            {
              name: nextQuestion.text[lang] || nextQuestion.text.de,
              value: getQuestionScaleText(nextQuestion.type, lang, foundGuildId),
              inline: false
            }
          ],
          color: '#3B82F6',
          footer: `Quantix Tickets • Frage ${nextQuestionIndex + 1} von ${questions.length}`
        });

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

        const thankYouEmbed = createStyledEmbed({
          emoji: '✅',
          title: t(foundGuildId, 'surveys.thank_you') || 'Vielen Dank!',
          description: t(foundGuildId, 'surveys.thank_you_description') || 'Vielen Dank für dein Feedback!',
          fields: [
            { name: 'Ticket', value: `#${String(ticketId).padStart(5, '0')}`, inline: true },
            { name: 'Antworten', value: `${foundTicket.survey.responses.length}`, inline: true }
          ],
          color: '#57F287',
          footer: 'Quantix Tickets • Danke für dein Feedback!'
        });

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
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Benutzer zu Tickets hinzufügen.',
          fields: [
            { name: 'Benötigte Rolle', value: teamRole ? `<@&${TEAM_ROLE}>` : 'Nicht konfiguriert', inline: true }
          ],
          color: '#ED4245'
        });
        return i.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      const raw = i.fields.getTextInputValue('user').trim();
      const id = (raw.replace(/<@!?|>/g,'').match(/\d{17,20}/)||[])[0];

      if(!id) {
        const invalidEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Ungültige Eingabe',
          description: 'Die eingegebene User-ID oder Mention ist ungültig.',
          fields: [
            { name: 'Beispiele', value: '@Username oder 123456789012345678', inline: false }
          ],
          color: '#ED4245'
        });
        return i.reply({ embeds: [invalidEmbed], ephemeral: true });
      }

      try {
        await i.guild.members.fetch(id);

        const guildId = i.guild.id;
        const log = loadTickets(guildId);
        const ticket = log.find(t=>t.channelId===i.channel.id);

        if(!ticket) {
          const noTicketEmbed = createStyledEmbed({
            emoji: '❌',
            title: 'Kein Ticket gefunden',
            description: 'Für diesen Channel wurde kein Ticket-Datensatz gefunden.',
            color: '#ED4245'
          });
          return i.reply({ embeds: [noTicketEmbed], ephemeral: true });
        }

        if(!ticket.addedUsers) ticket.addedUsers = [];

        if(ticket.addedUsers.includes(id) || ticket.userId === id || ticket.claimer === id) {
          const alreadyAccessEmbed = createStyledEmbed({
            emoji: 'ℹ️',
            title: 'Bereits vorhanden',
            description: `<@${id}> hat bereits Zugriff auf dieses Ticket.`,
            fields: [
              { name: 'User', value: `<@${id}>`, inline: true },
              { name: 'Ticket', value: `#${ticket.id}`, inline: true }
            ],
            color: '#FEE75C'
          });
          return i.reply({ embeds: [alreadyAccessEmbed], ephemeral: true });
        }

        ticket.addedUsers.push(id);
        saveTickets(guildId, log);

        await i.channel.permissionOverwrites.edit(id,{ ViewChannel:true, SendMessages:true });

        const successEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Benutzer hinzugefügt',
          description: `<@${id}> wurde erfolgreich zum Ticket hinzugefügt.`,
          fields: [
            { name: 'Hinzugefügt', value: `<@${id}>`, inline: true },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Von', value: `<@${i.user.id}>`, inline: true }
          ],
          color: '#57F287'
        });
        await i.reply({ embeds: [successEmbed], ephemeral: true });

        const publicEmbed = createStyledEmbed({
          emoji: '👥',
          title: 'Neuer Benutzer hinzugefügt',
          description: `<@${id}> wurde von <@${i.user.id}> zum Ticket hinzugefügt.`,
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#57F287'
        });
        await i.channel.send({ embeds: [publicEmbed] });

        logEvent(i.guild, t(guildId, 'logs.user_added', { user: `<@${id}>`, id: ticket.id }));
      } catch(err) {
        console.error('Fehler beim Hinzufügen:', err);

        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Hinzufügen',
          description: 'Der Benutzer konnte nicht hinzugefügt werden.',
          fields: [
            { name: 'Fehlermeldung', value: `\`\`\`${err.message || 'Unbekannter Fehler'}\`\`\``, inline: false }
          ],
          color: '#ED4245'
        });
        return i.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  } catch(err) {
    console.error(err);

    if(!i.replied && !i.deferred) {
      const generalErrorEmbed = createStyledEmbed({
        emoji: '❌',
        title: 'Ein Fehler ist aufgetreten',
        description: 'Bei der Verarbeitung deiner Anfrage ist ein Fehler aufgetreten.',
        fields: [
          { name: 'Support', value: '[Support Server](https://discord.com/invite/mnYbnpyyBS)', inline: false }
        ],
        color: '#ED4245'
      });

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

  // Step 1: Show "Verifying" message
  const verifyEmbed = createStyledEmbed({
    emoji: '⏳',
    title: 'Überprüfe...',
    description: 'Berechtigung wird geprüft...',
    color: '#5865F2'
  });

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [verifyEmbed] });
  }

  // Delay for visual feedback
  await new Promise(resolve => setTimeout(resolve, 600));

  // Safety check: Role restriction (in case it wasn't checked before)
  if (cfg.ticketCreationRestricted && cfg.allowedTicketRoles && cfg.allowedTicketRoles.length > 0) {
    const member = interaction.member || await interaction.guild.members.fetch(userId);
    const hasAllowedRole = cfg.allowedTicketRoles.some(roleId => member.roles.cache.has(roleId));
    if (!hasAllowedRole) {
      const roleMentions = cfg.allowedTicketRoles.map(roleId => `<@&${roleId}>`).join('\n');
      const noPermEmbed = createStyledEmbed({
        emoji: '🔒',
        title: 'Keine Berechtigung',
        description: 'Du hast nicht die erforderliche Rolle, um ein Ticket zu erstellen.',
        fields: [
          { name: 'Erforderliche Rollen', value: roleMentions || 'Keine konfiguriert', inline: false }
        ],
        color: '#ED4245',
        footer: 'Quantix Tickets • Zugriff verweigert'
      });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [noPermEmbed] });
      } else {
        await interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }
      return;
    }
  }

  // Safety check: Blacklist
  if (cfg.ticketBlacklist && Array.isArray(cfg.ticketBlacklist)) {
    const now = new Date();
    const blacklistEntry = cfg.ticketBlacklist.find(b => b.userId === userId);
    if (blacklistEntry) {
      if (!blacklistEntry.isPermanent && new Date(blacklistEntry.expiresAt) <= now) {
        cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== userId);
        writeCfg(guildId, cfg);
      } else {
        const expiryText = blacklistEntry.isPermanent
          ? '♾️ Permanent'
          : `<t:${Math.floor(new Date(blacklistEntry.expiresAt).getTime() / 1000)}:R>`;
        const blacklistEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Auf der Blacklist',
          description: `Du bist auf der Ticket-Blacklist.\n\n**Grund:** ${blacklistEntry.reason}\n**Dauer:** ${expiryText}`,
          color: '#ED4245',
          footer: 'Quantix Tickets • Zugriff verweigert'
        });
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [blacklistEmbed] });
        } else {
          await interaction.reply({ embeds: [blacklistEmbed], ephemeral: true });
        }
        return;
      }
    }
  }

  // Check VIP status (only for VIP Server 1403053662825222388)
  const VIP_SERVER_ID = '1403053662825222388';
  const isVIP = guildId === VIP_SERVER_ID && cfg.vipUsers && cfg.vipUsers.includes(userId);

  // Check AntiSpam Rate Limit
  const rateLimitCheck = checkTicketRateLimit(userId, guildId);
  if (!rateLimitCheck.allowed) {
    const spamEmbed = createStyledEmbed({
      emoji: '🚫',
      title: 'Rate-Limit erreicht',
      description: `Du erstellst zu viele Tickets! Du hast bereits ${rateLimitCheck.count} von ${rateLimitCheck.max} Tickets in den letzten ${cfg.antiSpam.timeWindowMinutes} Minuten erstellt.`,
      fields: [
        { name: 'Warte noch', value: `${rateLimitCheck.waitMinutes} Minute(n)`, inline: true },
        { name: 'Limit', value: `${rateLimitCheck.max} Tickets / ${cfg.antiSpam.timeWindowMinutes} Minuten`, inline: true }
      ],
      color: '#ED4245'
    });

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

  // Step 2: Show "Creating" message
  const createEmbed = createStyledEmbed({
    emoji: '🔄',
    title: 'Erstelle Ticket...',
    description: 'Dein Ticket wird erstellt...',
    color: '#5865F2'
  });

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [createEmbed] });
  }

  const nr = nextTicket(guildId);
  console.log(`[Ticket] Creating ticket #${nr} for guild ${guildId}`);

  // Auto-Priority System: Check if user has auto-priority role (per-role config)
  let ticketPriority = 0;
  let autoPriorityRoleName = null;

  if (cfg.autoPriorityConfig && cfg.autoPriorityConfig.length > 0) {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      console.log(`Auto-Priority Check: User ${interaction.user.tag}, Config:`, JSON.stringify(cfg.autoPriorityConfig));
      console.log(`User roles:`, member.roles.cache.map(r => `${r.name}(${r.id})`).join(', '));

      // Find highest priority role the user has
      let highestPriority = -1;
      for (const config of cfg.autoPriorityConfig) {
        const level = parseInt(config.level, 10) || 0;
        console.log(`Checking role ${config.roleId} with level ${level}, user has role: ${member.roles.cache.has(config.roleId)}`);
        if (member.roles.cache.has(config.roleId)) {
          if (level > highestPriority) {
            highestPriority = level;
            ticketPriority = level;
            const role = member.roles.cache.get(config.roleId);
            autoPriorityRoleName = role ? role.name : null;
            console.log(`Found matching role: ${autoPriorityRoleName}, setting priority to ${ticketPriority}`);
          }
        }
      }
      if (highestPriority >= 0) {
        console.log(`Auto-Priority FINAL: User ${interaction.user.tag} -> Priority ${ticketPriority} (Role: ${autoPriorityRoleName})`);
      }
    } catch (err) {
      console.error('Error checking auto-priority roles:', err);
    }
  }

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

  const priorityRoles = getPriorityRoles(guildId, ticketPriority);
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

  // Channel-Name bestimmen: Priorität: 1. topic.channelName, 2. ticketNameDisplay=topic -> label, 3. "ticket"
  let customChannelName = null;
  if (topic.channelName && topic.channelName.trim()) {
    customChannelName = topic.channelName.trim();
  } else if (topic.ticketNameDisplay === 'topic') {
    customChannelName = topic.label;
  }

  const ch = await interaction.guild.channels.create({
    name: buildChannelName(nr, ticketPriority, isVIP, false, customChannelName),
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites: permOverwrites
  });
  const embed = buildTicketEmbed(cfg, interaction, topic, nr, ticketPriority);

  // Create second embed for form answers if there are any
  let questionsEmbed = null;
  const formKeys = Object.keys(formData||{});
  if(formKeys.length){
    const formFields = getFormFieldsForTopic(cfg, topic.value).map(normalizeField);
    const paddedNr = String(nr).padStart(5, '0');

    // Build description with questions and answers
    let questionsDescription = '';
    formKeys.slice(0, 25).forEach((k, index) => {
      const field = formFields.find(f => f.id === k);
      const label = field ? field.label : k;
      const answer = formData[k] ? formData[k].substring(0, 500) : '—';
      questionsDescription += `**${index + 1}. ${label}**\n${answer}\n\n`;
    });

    questionsEmbed = new EmbedBuilder()
      .setTitle(`📋 Ticket Fragen #${paddedNr}`)
      .setDescription(questionsDescription.trim())
      .setColor(0x5865F2)
      .setFooter({ text: `${formKeys.length} Frage(n) beantwortet` });
  }

  // SLA Field hinzufügen (nur für Pro mit SLA enabled)
  const tempSlaDeadline = calculateSLADeadline(guildId, ticketPriority, Date.now());
  if(tempSlaDeadline && hasFeature(guildId, 'slaSystem')){
    const slaText = `<t:${Math.floor(tempSlaDeadline / 1000)}:R>`;
    embed.addFields({
      name: '» ⏱️ SLA-Deadline «',
      value: slaText,
      inline: true
    });
  }

  // Auto-Priority Field hinzufügen (wenn gesetzt)
  if(autoPriorityRoleName && ticketPriority > 0){
    const priorityEmojis = ['🟢', '🟠', '🔴'];
    const priorityNames = ['Niedrig', 'Mittel', 'Hoch'];
    embed.addFields({
      name: '» ⚡ Auto-Priorität «',
      value: `${priorityEmojis[ticketPriority]} ${priorityNames[ticketPriority]} (Rolle: ${autoPriorityRoleName})`,
      inline: true
    });
  }

  let ticketMessage;
  try {
    // Build embeds array - include questions embed if form data exists
    const embeds = questionsEmbed ? [embed, questionsEmbed] : [embed];
    ticketMessage = await ch.send({ embeds, components: buttonRows(false, interaction.guild?.id, null) });
  } catch (err) {
    console.error('❌ Fehler beim Senden der Willkommens-Nachricht:', err.message || err);
    if (err.stack) console.error(err.stack);
    throw err;
  }

  const mentions = [];
  const ticketRoles = getPriorityRoles(guildId, ticketPriority);
  for(const roleId of ticketRoles){
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
  const slaDeadline = calculateSLADeadline(guildId, ticketPriority, createdAt);

  log.push({
    id:nr,
    channelId:ch.id,
    messageId: ticketMessage.id,  // Store ticket message ID for later updates
    userId:interaction.user.id,
    topic:topic.value,
    topicLabel: topic.label,  // Speichere Topic-Label
    channelName: customChannelName || null,  // Speichere benutzerdefinierten Channel-Namen für Renames
    status:'offen',
    priority: ticketPriority,
    timestamp:createdAt,
    formData,
    addedUsers:[],
    notes: [],
    isVIP: isVIP || false,
    autoPriorityRole: autoPriorityRoleName,
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
            const newName = buildChannelName(nr, currentTicket.priority || 0, currentTicket.isVIP || false, true, customChannelName);
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
            const claimEmbed = createStyledEmbed({
              emoji: '✨',
              title: 'Automatisch zugewiesen',
              description: 'wurde diesem Ticket automatisch zugewiesen und wird sich um dein Anliegen kümmern.',
              fields: [
                { name: 'Ticket', value: `#${nr}`, inline: true },
                { name: 'Zugewiesen an', value: `<@${assignedMember}>`, inline: true },
                { name: 'Strategie', value: cfg.autoAssignment.strategy || 'workload', inline: true }
              ],
              color: '#57F287',
              footer: 'Quantix Tickets • Auto-Assignment'
            });

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

              const notificationEmbed = createStyledEmbed({
                emoji: '🎯',
                title: t(guildId, 'autoAssignment.notification_title') || 'Ticket zugewiesen',
                description: t(guildId, 'autoAssignment.notification_description', {
                  ticketId: nr,
                  channel: `<#${ch.id}>`
                }),
                fields: [
                  { name: t(guildId, 'autoAssignment.notification_topic') || 'Thema', value: topic.label, inline: true },
                  { name: t(guildId, 'autoAssignment.notification_priority') || 'Priorität', value: priorityEmoji, inline: true },
                  { name: t(guildId, 'autoAssignment.notification_creator') || 'Ersteller', value: `<@${interaction.user.id}>`, inline: true }
                ],
                color: '#3B82F6',
                footer: 'Quantix Tickets • Auto-Assignment'
              });

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

  // Step 3: Show success message
  const successEmbed = createStyledEmbed({
    emoji: '✅',
    title: 'Ticket erstellt',
    description: `Dein Ticket wurde erfolgreich erstellt!`,
    fields: [
      { name: 'Kanal', value: `<#${ch.id}>`, inline: true },
      { name: 'Ticket-Nr.', value: `#${nr}`, inline: true }
    ],
    color: '#57F287'
  });

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [successEmbed] }).catch(() => {});
  }
}

async function updatePriority(interaction, ticket, log, dir, guildId){
  const state = PRIORITY_STATES[ticket.priority||0];

  // SOFORT antworten um Timeout zu vermeiden
  const confirmEmbed = createStyledEmbed({
    emoji: '✅',
    title: 'Priorität aktualisiert',
    description: 'Die Ticket-Priorität wurde erfolgreich aktualisiert.',
    fields: [
      { name: 'Neue Priorität', value: `${state.emoji} ${state.label}`, inline: true },
      { name: 'Ticket', value: `#${ticket.id}`, inline: true }
    ],
    color: '#57F287'
  });

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

  // Restliche Operationen im Hintergrund
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
  const priorityEmbed = createStyledEmbed({
    emoji: '🎯',
    title: 'Priorität geändert',
    description: `Die Ticket-Priorität wurde auf **${state.label}** ${dir === 'hoch' ? '**erhöht**' : '**gesenkt**'}.`,
    fields: [
      { name: 'Neue Priorität', value: `${state.dot} ${state.label}`, inline: true },
      { name: 'Ticket', value: `#${ticket.id}`, inline: true },
      { name: 'Geändert von', value: `<@${interaction.user.id}>`, inline: true }
    ],
    color: state.embedColor
  });

  if(mentions.length > 0){
    await interaction.channel.send({
      content: mentions.join(' '),
      embeds: [priorityEmbed]
    });
  } else {
    await interaction.channel.send({ embeds: [priorityEmbed] });
  }

  logEvent(interaction.guild, t(guildId, 'logs.priority_changed', { id: ticket.id, direction: dir, priority: state.label }));
}

client.on(Events.MessageCreate, async (message) => {
  if(message.author.bot) return;

  // Custom Bot Check - Wenn ein Custom Bot für diese Guild aktiv ist, ignoriere
  if (message.guild) {
    try {
      const customBotManager = require('./custom-bot-manager.js');
      if (customBotManager.isCustomBotActive(message.guild.id)) {
        return; // Custom Bot übernimmt
      }
    } catch (err) {
      // Fehler - Haupt-Bot übernimmt
    }
  }

  // Live Transcript: Schreibe Nachrichten in Ticket-Channels live
  if (message.channel.name && message.channel.name.startsWith(PREFIX) && message.guild) {
    const guildId = message.guild.id;
    const ticketsPath = getTicketsPath(guildId);

    if (fs.existsSync(ticketsPath)) {
      const tickets = safeRead(ticketsPath, []);
      const ticket = tickets.find(t => t.channelId === message.channel.id && t.status === 'offen');

      if (ticket) {
        await appendToLiveTranscript(message, ticket, guildId);

        // Update lastMessageAt für Auto-Close Timer
        const ticketIndex = tickets.findIndex(t => t.id === ticket.id);
        if (ticketIndex !== -1) {
          tickets[ticketIndex].lastMessageAt = Date.now();
          // Wenn Warnung gesendet wurde, setze sie zurück (Aktivität erkannt)
          if (tickets[ticketIndex].autoCloseWarningSent) {
            const warningMessageId = tickets[ticketIndex].autoCloseWarningMessageId;
            if (warningMessageId) {
              try {
                const warningMessage = await message.channel.messages.fetch(warningMessageId);
                await warningMessage.delete().catch(() => {});
              } catch {}
            }
            tickets[ticketIndex].autoCloseWarningSent = false;
            tickets[ticketIndex].autoCloseWarningAt = null;
            tickets[ticketIndex].autoCloseWarningMessageId = null;
          }
          safeWrite(ticketsPath, tickets);
        }
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

  // Handle !help message command
  if (message.content.toLowerCase() === '!help') {
    try {
      const helpCommand = require('./commands/help.js');

      // Create a fake interaction object for the help command
      const fakeInteraction = {
        guild: message.guild,
        user: message.author,
        client: message.client,
        reply: async (options) => {
          return await message.reply(options);
        }
      };

      await helpCommand.execute(fakeInteraction);
      return;
    } catch (err) {
      console.error('Error in !help message command:', err);
      await message.reply('❌ Ein Fehler ist aufgetreten beim Laden der Hilfe.').catch(() => {});
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

    // Check if Force Claim is enabled
    const cfg = readCfg(guildId);
    if (cfg.forceClaimEnabled === false) return;

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
          const warningEmbed = createStyledEmbed({
            emoji: '📎',
            title: 'Datei-Upload nicht verfügbar',
            description: 'Datei-Uploads sind nur mit Premium Basic+ oder höher verfügbar!\n\nUpgrade auf Basic+ für:\n✅ Datei-Uploads (bis 10MB)\n✅ 7 Ticket-Kategorien\n✅ Custom Avatar\n✅ Statistiken\n\n💎 Jetzt upgraden für nur €2.99/Monat!',
            color: '#ED4245',
            footer: 'Quantix Tickets • Premium Feature'
          });

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
            const warningEmbed = createStyledEmbed({
              emoji: '📎',
              title: 'Datei zu groß',
              description: `Die hochgeladene Datei ist zu groß!\n\nMaximale Größe: ${maxSizeMB} MB\nDeine Datei: ${(attachment.size / (1024 * 1024)).toFixed(2)} MB\n\nBitte komprimiere die Datei oder teile sie in kleinere Teile auf.`,
              color: '#ED4245',
              footer: 'Quantix Tickets • File Upload'
            });

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
            const warningEmbed = createStyledEmbed({
              emoji: '📎',
              title: 'Dateiformat nicht erlaubt',
              description: `Dieses Dateiformat ist nicht erlaubt!\n\nErlaubte Formate: ${allowedFormats.join(', ')}\nDein Format: ${fileExtension}\n\nBitte verwende ein erlaubtes Dateiformat.`,
              color: '#ED4245',
              footer: 'Quantix Tickets • File Upload'
            });

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

// Force Claim: Auto-delete messages from non-team members in claimed tickets
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process messages in guilds
  if (!message.guild) return;

  // Custom Bot Check - Wenn ein Custom Bot für diese Guild aktiv ist, ignoriere
  try {
    const customBotManager = require('./custom-bot-manager.js');
    if (customBotManager.isCustomBotActive(message.guild.id)) {
      return; // Custom Bot übernimmt
    }
  } catch (err) {
    // Fehler - Haupt-Bot übernimmt
  }

  try {
    const guildId = message.guild.id;
    const cfg = readCfg(guildId);

    // Check if Force Claim is enabled (default: true)
    if (cfg.forceClaimEnabled === false) return;

    // Find ticket for this channel
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === message.channel.id);

    // Only process if this is a ticket channel and it's claimed
    if (!ticket || !ticket.claimer) return;

    // Allow messages from: creator, claimer, added users, and team members
    const allowedUsers = [ticket.userId, ticket.claimer];
    if (ticket.addedUsers && Array.isArray(ticket.addedUsers)) {
      allowedUsers.push(...ticket.addedUsers);
    }

    // Check if user is in allowed list
    if (allowedUsers.includes(message.author.id)) return;

    // Check if user is team member
    const member = message.member;
    if (!member) return;

    const isTeam = hasAnyTeamRole(member, guildId);
    if (isTeam) return;

    // User is not allowed -> delete message
    await message.delete().catch(err => {
      console.error(`Failed to delete message in ticket #${ticket.id}:`, err);
    });

    console.log(`🗑️ Auto-deleted message from ${message.author.tag} in claimed ticket #${ticket.id} (Force Claim enabled)`);

  } catch(err) {
    console.error('Fehler beim Force Claim Auto-Delete:', err);
  }
});

// Login main bot
client.login(TOKEN).then(async () => {
  console.log('[Main Bot] ✅ Logged in successfully');

  // Load custom bots for premium servers with whitelabel
  try {
    const customBotManager = require('./custom-bot-manager.js');
    console.log('[Main Bot] Loading custom bots...');
    await customBotManager.loadAllBots();
    console.log('[Main Bot] ✅ Custom bots loaded');
  } catch (error) {
    console.error('[Main Bot] ❌ Error loading custom bots:', error);
  }
}).catch(error => {
  console.error('[Main Bot] ❌ Login failed:', error);
  process.exit(1);
});
