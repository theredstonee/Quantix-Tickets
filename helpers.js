// helpers.js - Central export point for helper functions
// Now uses SQLite database for reliable storage

const path = require('path');

// Import database functions
const db = require('./database');

// ===== Config Functions (delegated to database.js) =====
const readCfg = db.readCfg;
const writeCfg = db.writeCfg;
const getDefaultConfig = db.getDefaultConfig;

// ===== Ticket Functions (delegated to database.js) =====
const loadTickets = db.loadTickets;
const saveTickets = db.saveTickets;

function getTicketsPath(guildId) {
  // Legacy function for compatibility - returns dummy path
  const CONFIG_DIR = path.join(__dirname, 'configs');
  if (!guildId) return path.join(__dirname, 'tickets.json');
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

// ===== Components V2 Support Check =====
let componentsV2Available = false;
let ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, MediaGalleryBuilder, ThumbnailBuilder;

try {
  const discordComponents = require('discord.js');
  if (discordComponents.ContainerBuilder && discordComponents.TextDisplayBuilder) {
    ContainerBuilder = discordComponents.ContainerBuilder;
    TextDisplayBuilder = discordComponents.TextDisplayBuilder;
    SectionBuilder = discordComponents.SectionBuilder;
    SeparatorBuilder = discordComponents.SeparatorBuilder;
    MediaGalleryBuilder = discordComponents.MediaGalleryBuilder;
    ThumbnailBuilder = discordComponents.ThumbnailBuilder;
    componentsV2Available = true;
    console.log('[Helpers] Components V2 available');
  }
} catch (e) {
  console.log('[Helpers] Components V2 not available, using classic embeds');
}

/**
 * Creates a styled message in Components V2 format
 * @param {Object} options - Message options
 * @param {string} options.emoji - Emoji for the title
 * @param {string} options.title - Title text
 * @param {string} [options.description] - Description text
 * @param {Array} [options.fields] - Array of { name, value, inline } objects
 * @param {string} [options.color] - Hex color (default: #5865F2)
 * @param {string} [options.footer] - Footer text
 * @param {string} [options.thumbnail] - Thumbnail URL
 * @param {string} [options.image] - Image URL
 * @returns {Object} Components V2 message payload
 */
function createComponentsV2Message(options) {
  const { MessageFlags } = require('discord.js');

  if (!componentsV2Available) {
    // Fallback to embed
    return { embeds: [createStyledEmbed(options)] };
  }

  const now = new Date();
  const berlinTime = now.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Convert hex color to integer
  const colorHex = (options.color || '#5865F2').replace('#', '');
  const colorInt = parseInt(colorHex, 16);

  const components = [];

  // Title with emoji
  const titleText = `${options.emoji || ''} » **${options.title}** «`.trim();
  components.push(new TextDisplayBuilder().setContent(titleText));

  // Separator after title
  components.push(new SeparatorBuilder().setSpacing(1));

  // Description
  if (options.description) {
    components.push(new TextDisplayBuilder().setContent(`*${options.description}*`));
  }

  // Fields
  if (options.fields && Array.isArray(options.fields)) {
    components.push(new SeparatorBuilder().setSpacing(1));

    for (const field of options.fields) {
      if (field.name && field.value) {
        const fieldText = `**» ${field.name} «**\n${field.value}`;
        components.push(new TextDisplayBuilder().setContent(fieldText));
      }
    }
  }

  // Footer
  components.push(new SeparatorBuilder().setSpacing(1));
  components.push(new TextDisplayBuilder().setContent(`-# ${options.footer || 'Quantix Tickets'} • ${berlinTime}`));

  // Build container
  const container = new ContainerBuilder()
    .setAccentColor(colorInt)
    .addComponents(...components);

  // Add thumbnail if provided
  if (options.thumbnail) {
    try {
      const thumbnailComponent = new ThumbnailBuilder().setURL(options.thumbnail);
      // Thumbnail would need to be added via Section, keeping simple for now
    } catch (e) { /* ignore */ }
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

/**
 * Creates a styled message - automatically chooses between Components V2 and classic embeds
 * @param {string} guildId - Guild ID to check config
 * @param {Object} options - Message options (same as createStyledEmbed)
 * @returns {Object} Message payload with either components or embeds
 */
function createStyledMessage(guildId, options) {
  const cfg = readCfg(guildId);

  if (cfg.useComponentsV2 && componentsV2Available) {
    return createComponentsV2Message(options);
  }

  return { embeds: [createStyledEmbed(options)] };
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

  // Set title with emoji and –» « wrapper
  if (options.title) {
    const emoji = options.emoji || '';
    embed.setTitle(`${emoji} –» ${options.title} «`.trim());
  }

  // Set description in italics
  if (options.description) {
    embed.setDescription(`*${options.description}*`);
  }

  // Set fields with –» « wrapper for names
  if (options.fields && Array.isArray(options.fields)) {
    for (const field of options.fields) {
      if (field.name && field.value) {
        embed.addFields({
          name: `–» ${field.name} «`,
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
  // Config functions
  readCfg,
  writeCfg,
  getDefaultConfig,
  // Ticket functions
  loadTickets,
  saveTickets,
  getTicketsPath,
  // Counter functions
  getNextTicketNumber: db.getNextTicketNumber,
  getCurrentCounter: db.getCurrentCounter,
  // Language functions
  getGuildLanguage: db.getGuildLanguage,
  setGuildLanguage: db.setGuildLanguage,
  // Embed functions
  logEvent,
  createStyledEmbed,
  createQuickEmbed,
  createStyledMessage,
  createComponentsV2Message,
  componentsV2Available,
  // Database reference
  db: db.db,
  usingSQLite: db.usingSQLite
};
