// helpers.js - Central export point for helper functions

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'configs');

// ===== Config Functions =====
function readCfg(guildId) {
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return raw ? JSON.parse(raw) : getDefaultConfig();
  } catch {
    const def = getDefaultConfig();
    writeCfg(guildId, def);
    return def;
  }
}

function writeCfg(guildId, data) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2), 'utf8');
}

function getDefaultConfig() {
  return {
    teamRoleId: '',
    logChannelId: [],
    topics: [],
    formFields: [],
    priorityRoles: { 0: [], 1: [], 2: [] },
    panelChannelId: '',
    panelMessageId: '',
    panelTitle: 'Ticket erstellen',
    panelDescription: 'Klicke auf den Button um ein Ticket zu erstellen.',
    panelColor: '0x00ff88',
    panelFooter: 'Quantix Tickets',
    categoryId: '',
    transcriptChannelId: '',
    closeMessageChannelIds: [],
    closeConfirmation: true,
    transcriptFormat: 'both',
    notificationEmail: '',
    dmNotificationUsers: [],
    autoClose: 0,
    githubCommitsEnabled: false,
    githubWebhookChannelId: '',
    startupNotificationsEnabled: false,
    language: 'de'
  };
}

// ===== Ticket Functions =====
function getTicketsPath(guildId) {
  if (!guildId) return path.join(__dirname, 'tickets.json');
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

function loadTickets(guildId) {
  const ticketsPath = getTicketsPath(guildId);
  try {
    const raw = fs.readFileSync(ticketsPath, 'utf8');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const ticketsPath = getTicketsPath(guildId);
  fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2), 'utf8');
}

// ===== Styled Embed Function =====
/**
 * Creates a styled embed with the unified format
 * @param {Object} options - Embed options
 * @param {string} options.emoji - Emoji for the title (e.g., '📧', '✅', '❌')
 * @param {string} options.title - Title text (will be wrapped in » «)
 * @param {string} [options.description] - Description text (will be italicized)
 * @param {Array} [options.fields] - Array of { name, value, inline } objects (names will be wrapped in » «)
 * @param {string} [options.color] - Hex color (default: #5865F2)
 * @param {string} [options.footer] - Custom footer text (default: Quantix Tickets)
 * @param {string} [options.thumbnail] - Thumbnail URL
 * @param {string} [options.image] - Image URL
 * @returns {EmbedBuilder}
 */
function createStyledEmbed(options) {
  const { EmbedBuilder } = require('discord.js');

  const now = new Date();
  const berlinTime = now.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const embed = new EmbedBuilder()
    .setColor(options.color || '#5865F2')
    .setTimestamp()
    .setFooter({ text: `${options.footer || 'Quantix Tickets'} • ${berlinTime}` });

  // Set title with emoji and » « wrapper
  if (options.title) {
    const emoji = options.emoji || '';
    embed.setTitle(`${emoji} » ${options.title} «`.trim());
  }

  // Set description in italics
  if (options.description) {
    embed.setDescription(`*${options.description}*`);
  }

  // Set fields with » « wrapper for names
  if (options.fields && Array.isArray(options.fields)) {
    for (const field of options.fields) {
      if (field.name && field.value) {
        embed.addFields({
          name: `» ${field.name} «`,
          value: field.value,
          inline: field.inline !== undefined ? field.inline : false
        });
      }
    }
  }

  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }

  if (options.image) {
    embed.setImage(options.image);
  }

  return embed;
}

/**
 * Creates a simple styled reply embed for quick responses
 * @param {string} emoji - Emoji (✅, ❌, ⚠️, ℹ️)
 * @param {string} title - Title text
 * @param {string} [description] - Optional description
 * @returns {EmbedBuilder}
 */
function createQuickEmbed(emoji, title, description = null) {
  return createStyledEmbed({
    emoji,
    title,
    description,
    color: emoji === '✅' ? '#57F287' : emoji === '❌' ? '#ED4245' : emoji === '⚠️' ? '#FEE75C' : '#5865F2'
  });
}

// ===== Log Event Function =====
async function logEvent(guild, text) {
  const { EmbedBuilder } = require('discord.js');
  const cfg = readCfg(guild.id);
  const logChannelIds = Array.isArray(cfg.logChannelId) ? cfg.logChannelId : (cfg.logChannelId ? [cfg.logChannelId] : []);
  if (logChannelIds.length === 0) return;

  const embed = createStyledEmbed({
    emoji: '📋',
    title: 'Log Event',
    description: text,
    color: '#57F287'
  });

  for (const channelId of logChannelIds) {
    try {
      const ch = await guild.channels.fetch(channelId);
      if (ch && ch.isTextBased()) {
        await ch.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error(`❌ Log-Event Fehler für Channel ${channelId}:`, err.message);
    }
  }
}

// ===== Exports =====
module.exports = {
  readCfg,
  writeCfg,
  getDefaultConfig,
  loadTickets,
  saveTickets,
  getTicketsPath,
  logEvent,
  createStyledEmbed,
  createQuickEmbed
};
