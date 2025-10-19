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

// ===== Log Event Function =====
async function logEvent(guild, text) {
  const { EmbedBuilder } = require('discord.js');
  const cfg = readCfg(guild.id);
  const logChannelIds = Array.isArray(cfg.logChannelId) ? cfg.logChannelId : (cfg.logChannelId ? [cfg.logChannelId] : []);
  if (logChannelIds.length === 0) return;

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
    .setFooter({ text: `Quantix Tickets • ${berlinTime}` });

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
  logEvent
};
