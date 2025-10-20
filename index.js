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
const { handleTemplateUse } = require('./template-handler');
const { handleDepartmentForward } = require('./department-handler');

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

  if(cfg.priorityRoles){
    Object.values(cfg.priorityRoles).forEach(roleList => {
      if(Array.isArray(roleList)) roleList.forEach(r => roles.add(r));
    });
  }

  // Legacy support: teamRoleId can be string or array
  if(cfg.teamRoleId){
    if(Array.isArray(cfg.teamRoleId)){
      cfg.teamRoleId.forEach(r => roles.add(r));
    } else {
      roles.add(cfg.teamRoleId);
    }
  }

  return Array.from(roles).filter(r => r && r.trim());
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

const app = express();
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended:true }));
app.use(express.static('public'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Initialize Discord Logger to send all console logs to Discord channel
const { initializeLogger } = require('./discord-logger');
initializeLogger(client);

app.set('trust proxy', 1);
app.use('/', require('./panel')(client));
app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));

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

function buttonRows(claimed, guildId = null){
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
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('add_user')
      .setEmoji('👥')
      .setLabel(t(guildId, 'buttons.add_user'))
      .setStyle(ButtonStyle.Secondary)
  );
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

// Trial Expiry Warning Checker
function startTrialExpiryWarningChecker() {
  const checkTrialWarnings = async () => {
    try {
      const { getExpiringTrials, wasWarningSent, markTrialWarningSent, getTrialInfo } = require('./premium');
      const { getGuildLanguage, t } = require('./translations');
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

client.once('ready', async () => {
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

  // Trial Expiry Warning Checker - läuft alle 6 Stunden
  startTrialExpiryWarningChecker();

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
    const { isTrialActive, getTrialInfo } = require('./premium');
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
    const { activateAutoTrial } = require('./premium');
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
  return e;
}

function buildChannelName(ticketNumber, priorityIndex, isVIP = false){
  const num = ticketNumber.toString().padStart(5,'0');
  const st  = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  const vipPrefix = isVIP ? '✨vip-' : '';
  return `${PREFIX}${vipPrefix}${st.dot}ticket-${num}`;
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
function renameChannelIfNeeded(channel, ticket){ const desired = buildChannelName(ticket.id, ticket.priority||0); if(channel.name === desired) return; scheduleChannelRename(channel, desired); }

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
      <h1>
        🎫 <span class="ticket-badge">#${ticket.id.toString().padStart(5, '0')}</span>
      </h1>
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
      return await createTicketChannel(i, topic, {}, cfg);
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

      await createTicketChannel(i, topic, answers, cfg);
      return;
    }

    if(i.isButton()){
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
        return await createTicketChannel(i, topic, {}, cfg);
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
      const isTeam = TEAM_ROLE ? i.member.roles.cache.has(TEAM_ROLE) : false;
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

        // Archiv oder Löschen
        setTimeout(async () => {
          if (cfg.archiveEnabled && cfg.archiveCategoryId) {
            try {
              // Verschiebe Channel in Archiv-Kategorie
              await i.channel.setParent(cfg.archiveCategoryId, {
                lockPermissions: false
              });

              // Benenne Channel um zu "closed-ticket-####"
              const newName = `closed-${i.channel.name}`;
              await i.channel.setName(newName);

              console.log(`✅ Ticket #${ticket.id} in Archiv verschoben`);
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

      // Modal-Submit für Ablehnung
      if (i.customId === 'deny_close_reason_modal') {
        const reason = i.fields.getTextInputValue('deny_reason') || 'Kein Grund angegeben';

        ticket.closeRequest.status = 'denied';
        ticket.closeRequest.deniedBy = i.user.id;
        ticket.closeRequest.deniedAt = Date.now();
        ticket.closeRequest.denyReason = reason;
        saveTickets(guildId, log);

        await i.reply({ ephemeral: true, content: '✅ Schließungsanfrage wurde abgelehnt.' });

        // Deaktiviere die Buttons der ursprünglichen Schließungsanfrage
        if (ticket.closeRequest.messageId) {
          try {
            const requestMsg = await i.channel.messages.fetch(ticket.closeRequest.messageId);
            const disabledButtons = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('approve_close_request_disabled')
                .setEmoji('✅')
                .setLabel('Bestätigen')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId('deny_close_request_disabled')
                .setEmoji('❌')
                .setLabel('Abgelehnt')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            );
            await requestMsg.edit({ components: [disabledButtons] });
          } catch (err) {
            console.error('Error disabling close request buttons:', err);
          }
        }

        const denyEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Schließungsanfrage abgelehnt')
          .setDescription(
            `Die Schließungsanfrage wurde abgelehnt.\n\n` +
            `**Angefordert von:** <@${ticket.closeRequest.requestedBy}>\n` +
            `**Abgelehnt von:** <@${i.user.id}>\n\n` +
            `**Grund:**\n> ${reason}`
          )
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Anfrage abgelehnt' })
          .setTimestamp();

        await i.channel.send({ embeds: [denyEmbed] });

        logEvent(i.guild, `❌ Schließungsanfrage für Ticket **#${ticket.id}** von <@${i.user.id}> abgelehnt. Grund: ${reason}`);

        // Lösche die Schließungsanfrage nach 5 Sekunden
        setTimeout(() => {
          if (ticket.closeRequest) {
            delete ticket.closeRequest;
            saveTickets(guildId, log);
          }
        }, 5000);

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
        await i.update({ components: buttonRows(false, guildId) });
        logEvent(i.guild, t(guildId, 'logs.ticket_unclaimed', { id: ticket.id, user: `<@${i.user.id}>` }));
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

          try {
            const permissions = [
              { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
              { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
              { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ];

            if(ticket.addedUsers && Array.isArray(ticket.addedUsers)){
              ticket.addedUsers.forEach(uid => {
                permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
              });
            }

            // Priority-Rollen: Sehen aber nicht schreiben
            const currentPriority = ticket.priority || 0;
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
                { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
                { name: '👤 Übernommen von', value: `<@${i.user.id}>`, inline: true },
                { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
              )
              .setFooter({ text: 'Quantix Tickets • Ticket übernommen' })
              .setTimestamp();

            await i.channel.send({ embeds: [claimEmbed] });
          } catch(err) {
            console.error('Fehler beim Setzen der Berechtigungen:', err);
          }

          await i.update({ components: buttonRows(true, guildId) });
          logEvent(i.guild, t(guildId, 'logs.ticket_claimed', { id: ticket.id, user: `<@${i.user.id}>` }));
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
      }
    }

    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      const TEAM_ROLE = getTeamRole(i.guild.id);
      const isTeam = TEAM_ROLE ? i.member.roles.cache.has(TEAM_ROLE) : false;

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

async function createTicketChannel(interaction, topic, formData, cfg){
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  // Check VIP status (only for VIP Server 1403053662825222388)
  const VIP_SERVER_ID = '1403053662825222388';
  const isVIP = guildId === VIP_SERVER_ID && cfg.vipUsers && cfg.vipUsers.includes(userId);

  // Check ticket limit
  const limitCheck = canUserCreateTicket(guildId, userId);
  if(!limitCheck.allowed){
    const lang = getGuildLanguage(guildId);
    const errorMsg = t(guildId, 'ticket.limit_reached', {
      current: limitCheck.current,
      max: limitCheck.max
    });
    await interaction.reply({ content: errorMsg, ephemeral: true });
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
  await ch.send({ embeds:[embed], components: buttonRows(false, interaction.guild?.id) });

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

  if(interaction.deferred){
    await interaction.editReply({ content:`Ticket erstellt: ${ch}` });
  } else if(interaction.isModalSubmit()){
    await interaction.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });
  } else {
    await interaction.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });
  }
  const ticketsPath = getTicketsPath(guildId);
  if(!fs.existsSync(ticketsPath)) safeWrite(ticketsPath, []);
  const log = safeRead(ticketsPath, []);
  log.push({
    id:nr,
    channelId:ch.id,
    userId:interaction.user.id,
    topic:topic.value,
    status:'offen',
    priority:0,
    timestamp:Date.now(),
    formData,
    addedUsers:[],
    notes: [],
    isVIP: isVIP || false,
    statusHistory: [{
      status: 'offen',
      timestamp: Date.now(),
      userId: interaction.user.id
    }]
  });
  safeWrite(ticketsPath, log);
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
  const msg = await interaction.channel.messages.fetch({limit:10}).then(c=>c.find(m=>m.embeds.length)).catch(()=>null);
  const state = PRIORITY_STATES[ticket.priority||0];
  if(msg){ const e = EmbedBuilder.from(msg.embeds[0]); e.setColor(state.embedColor); await msg.edit({embeds:[e]}); }
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

  // Handle !commands message command
  if (message.content.toLowerCase() === '!commands' || message.content.toLowerCase() === '!command') {
    try {
      const { EmbedBuilder } = require('discord.js');

      const userId = message.author.id;
      const member = message.member;
      const isAdmin = member && member.permissions.has('Administrator');
      const OWNER_IDS = ['928901974106202113', '1159182333316968530', '1415387837359984740', '1048900200497954868'];
      const FOUNDER_IDS = ['1048900200497954868', '1159182333316968530'];
      const isOwner = OWNER_IDS.includes(userId);
      const isFounder = FOUNDER_IDS.includes(userId);

      // Define all commands with their info
      const commands = [
        {
          category: '📋 Allgemeine Commands',
          items: [
            {
              name: '/dashboard',
              description: 'Öffnet das Web-Dashboard',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/version',
              description: 'Zeigt die Bot-Version und Changelog',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/commands',
              description: 'Zeigt diese Command-Liste',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/forward',
              description: 'Leitet ein Ticket an ein anderes Team-Mitglied weiter (Pro Feature)',
              permission: 'Claimer',
              canUse: true
            },
            {
              name: '/tag',
              description: 'Verwaltet Tags für Tickets (Basic+ Feature)',
              permission: 'Team',
              canUse: true
            },
            {
              name: '/template',
              description: 'Verwendet vordefinierte Antwort-Vorlagen (Basic+ Feature)',
              permission: 'Team',
              canUse: true
            },
            {
              name: '/department',
              description: 'Verwaltet Abteilungen und leitet Tickets weiter (Basic+ Feature)',
              permission: 'Team',
              canUse: true
            },
            {
              name: '/vip',
              description: 'Verwaltet VIP-User (Nur auf bestimmten Servern)',
              permission: 'Administrator',
              canUse: isAdmin
            }
          ]
        },
        {
          category: '⚙️ Server-Einstellungen',
          items: [
            {
              name: '/language',
              description: 'Ändert die Server-Sprache',
              permission: 'Administrator',
              canUse: isAdmin
            },
            {
              name: '/userlanguage',
              description: 'Ändert deine persönliche Sprache',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/github-commits',
              description: 'Toggle GitHub Commit-Benachrichtigungen',
              permission: 'Administrator',
              canUse: isAdmin
            },
            {
              name: '/togglemessage',
              description: 'Toggle Startup-Benachrichtigungen',
              permission: 'Administrator',
              canUse: isAdmin
            }
          ]
        },
        {
          category: '🔧 System-Commands',
          items: [
            {
              name: '/reload',
              description: 'Lädt Commands neu',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/restart',
              description: 'Startet den Bot neu',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/update',
              description: 'Updated den Bot von GitHub',
              permission: 'Owner',
              canUse: isOwner
            }
          ]
        },
        {
          category: '👑 Owner-Commands',
          items: [
            {
              name: '/broadcast',
              description: 'Sendet eine Nachricht an alle Server',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/lifetime-premium',
              description: 'Verwaltet Lifetime Premium',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/betatester',
              description: 'Verwaltet Betatester-Status',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/premium-role',
              description: 'Verwaltet Premium-Rollen',
              permission: 'Owner',
              canUse: isOwner
            }
          ]
        }
      ];

      // Add Founder category if user is founder
      if (isFounder) {
        commands.push({
          category: '⭐ Founder-Commands',
          items: [
            {
              name: 'Founder Panel',
              description: 'Zugriff auf /founder Web-Panel',
              permission: 'Founder',
              canUse: isFounder
            }
          ]
        });
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('📚 Quantix Tickets - Command Übersicht')
        .setDescription(
          '**Alle verfügbaren Bot-Commands im Überblick**\n\n' +
          '**Legende:**\n' +
          '✅ Du hast Zugriff auf diesen Command\n' +
          '❌ Du hast keine Berechtigung für diesen Command\n\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        )
        .setThumbnail(client.user.displayAvatarURL({ size: 128 }))
        .setFooter({
          text: `Quantix Tickets © ${new Date().getFullYear()} • Angefordert von ${message.author.tag}`,
          iconURL: message.author.displayAvatarURL({ size: 32 })
        })
        .setTimestamp();

      // Add fields for each category
      for (const category of commands) {
        let fieldValue = '';

        for (const cmd of category.items) {
          const statusIcon = cmd.canUse ? '✅' : '❌';
          const permIcon = cmd.permission === 'Alle' ? '🌐' :
                          cmd.permission === 'Administrator' ? '⚙️' :
                          cmd.permission === 'Owner' ? '👑' :
                          cmd.permission === 'Founder' ? '⭐' :
                          cmd.permission === 'Claimer' ? '🎫' :
                          cmd.permission === 'Team' ? '👥' : '🔒';

          fieldValue += `${statusIcon} **${cmd.name}**\n`;
          fieldValue += `   └ 📝 ${cmd.description}\n`;
          fieldValue += `   └ ${permIcon} *${cmd.permission}*\n\n`;
        }

        embed.addFields({
          name: `${category.category}`,
          value: fieldValue || 'Keine Commands',
          inline: false
        });
      }

      // Add usage info with enhanced formatting
      embed.addFields({
        name: '💡 Hilfreiche Tipps',
        value:
          '• Nutze `/commands` für die Slash-Command Version\n' +
          '• Besuche `/dashboard` für erweiterte Einstellungen\n' +
          '• Premium-Features mit `/premium` freischalten\n' +
          '• Bei Fragen: [Support Server](https://discord.com/invite/mnYbnpyyBS)',
        inline: false
      });

      // Create button row with useful links
      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setURL(`${PANEL_FIXED_URL}`)
          .setStyle(ButtonStyle.Link)
          .setLabel('🎫 Dashboard')
          .setEmoji('🚀'),
        new ButtonBuilder()
          .setURL('https://discord.com/invite/mnYbnpyyBS')
          .setStyle(ButtonStyle.Link)
          .setLabel('Support')
          .setEmoji('💬')
      );

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
  } catch(err) {
    console.error('Fehler beim Message-Delete-Check:', err);
  }
});

client.login(TOKEN);
