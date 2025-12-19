/**
 * SQLite Database Module for Quantix Tickets Bot
 * Replaces JSON file-based storage with SQLite for reliability
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'quantix.db');
const CONFIG_DIR = path.join(__dirname, 'configs');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Better performance and reliability

console.log('[Database] SQLite database initialized at:', DB_PATH);

// ===== Create Tables =====
function initTables() {
  // Guild Configs
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Tickets
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      ticket_id INTEGER NOT NULL,
      channel_id TEXT,
      user_id TEXT NOT NULL,
      topic TEXT,
      topic_label TEXT,
      status TEXT DEFAULT 'offen',
      priority INTEGER DEFAULT 0,
      claimed_by TEXT,
      data TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, ticket_id)
    )
  `);

  // Ticket Counter
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_counters (
      guild_id TEXT PRIMARY KEY,
      counter INTEGER DEFAULT 0
    )
  `);

  // Guild Language
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_languages (
      guild_id TEXT PRIMARY KEY,
      language TEXT DEFAULT 'de'
    )
  `);

  // Create indexes for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(guild_id, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
  `);

  console.log('[Database] Tables initialized');
}

// Initialize tables on load
initTables();

// ===== Prepared Statements =====
const statements = {
  // Config
  getConfig: db.prepare('SELECT config FROM guild_configs WHERE guild_id = ?'),
  setConfig: db.prepare(`
    INSERT INTO guild_configs (guild_id, config, updated_at)
    VALUES (?, ?, strftime('%s', 'now'))
    ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config, updated_at = strftime('%s', 'now')
  `),

  // Tickets
  getTickets: db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY ticket_id DESC'),
  getTicketById: db.prepare('SELECT * FROM tickets WHERE guild_id = ? AND ticket_id = ?'),
  getTicketByChannel: db.prepare('SELECT * FROM tickets WHERE channel_id = ?'),
  getOpenTickets: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'offen'"),
  getUserOpenTickets: db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'offen'"),

  insertTicket: db.prepare(`
    INSERT INTO tickets (guild_id, ticket_id, channel_id, user_id, topic, topic_label, status, priority, claimed_by, data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  updateTicket: db.prepare(`
    UPDATE tickets SET
      channel_id = ?,
      status = ?,
      priority = ?,
      claimed_by = ?,
      data = ?,
      updated_at = strftime('%s', 'now')
    WHERE guild_id = ? AND ticket_id = ?
  `),

  deleteTicket: db.prepare('DELETE FROM tickets WHERE guild_id = ? AND ticket_id = ?'),

  // Counter
  getCounter: db.prepare('SELECT counter FROM ticket_counters WHERE guild_id = ?'),
  incrementCounter: db.prepare(`
    INSERT INTO ticket_counters (guild_id, counter)
    VALUES (?, 1)
    ON CONFLICT(guild_id) DO UPDATE SET counter = counter + 1
    RETURNING counter
  `),

  // Language
  getLanguage: db.prepare('SELECT language FROM guild_languages WHERE guild_id = ?'),
  setLanguage: db.prepare(`
    INSERT INTO guild_languages (guild_id, language)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET language = excluded.language
  `)
};

// ===== Config Functions =====
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

function readCfg(guildId) {
  if (!guildId) return getDefaultConfig();

  try {
    const row = statements.getConfig.get(guildId);
    if (row && row.config) {
      return JSON.parse(row.config);
    }
  } catch (err) {
    console.error('[Database] Error reading config:', err.message);
  }

  return getDefaultConfig();
}

function writeCfg(guildId, data) {
  if (!guildId) return;

  try {
    statements.setConfig.run(guildId, JSON.stringify(data));
  } catch (err) {
    console.error('[Database] Error writing config:', err.message);
    throw err;
  }
}

// ===== Ticket Functions =====
function loadTickets(guildId) {
  if (!guildId) return [];

  try {
    const rows = statements.getTickets.all(guildId);
    return rows.map(row => {
      const ticket = row.data ? JSON.parse(row.data) : {};
      return {
        id: row.ticket_id,
        channelId: row.channel_id,
        userId: row.user_id,
        topic: row.topic,
        topicLabel: row.topic_label,
        status: row.status,
        priority: row.priority,
        claimedBy: row.claimed_by,
        timestamp: row.created_at * 1000,
        ...ticket
      };
    });
  } catch (err) {
    console.error('[Database] Error loading tickets:', err.message);
    return [];
  }
}

function saveTickets(guildId, tickets) {
  if (!guildId || !Array.isArray(tickets)) return;

  const saveTransaction = db.transaction((guildId, tickets) => {
    for (const ticket of tickets) {
      const existingTicket = statements.getTicketById.get(guildId, ticket.id);

      // Extract main fields, rest goes to data JSON
      const { id, channelId, userId, topic, topicLabel, status, priority, claimedBy, timestamp, ...extraData } = ticket;
      const dataJson = JSON.stringify(extraData);

      if (existingTicket) {
        statements.updateTicket.run(
          channelId || null,
          status || 'offen',
          priority || 0,
          claimedBy || null,
          dataJson,
          guildId,
          id
        );
      } else {
        statements.insertTicket.run(
          guildId,
          id,
          channelId || null,
          userId,
          topic || null,
          topicLabel || null,
          status || 'offen',
          priority || 0,
          claimedBy || null,
          dataJson,
          timestamp ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000)
        );
      }
    }
  });

  try {
    saveTransaction(guildId, tickets);
  } catch (err) {
    console.error('[Database] Error saving tickets:', err.message);
    throw err;
  }
}

function getTicketByChannel(channelId) {
  try {
    const row = statements.getTicketByChannel.get(channelId);
    if (!row) return null;

    const ticket = row.data ? JSON.parse(row.data) : {};
    return {
      id: row.ticket_id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      userId: row.user_id,
      topic: row.topic,
      topicLabel: row.topic_label,
      status: row.status,
      priority: row.priority,
      claimedBy: row.claimed_by,
      timestamp: row.created_at * 1000,
      ...ticket
    };
  } catch (err) {
    console.error('[Database] Error getting ticket by channel:', err.message);
    return null;
  }
}

function updateTicket(guildId, ticketId, updates) {
  try {
    const existing = statements.getTicketById.get(guildId, ticketId);
    if (!existing) return false;

    const currentData = existing.data ? JSON.parse(existing.data) : {};
    const mergedData = { ...currentData, ...updates };

    // Extract standard fields
    const channelId = updates.channelId !== undefined ? updates.channelId : existing.channel_id;
    const status = updates.status !== undefined ? updates.status : existing.status;
    const priority = updates.priority !== undefined ? updates.priority : existing.priority;
    const claimedBy = updates.claimedBy !== undefined ? updates.claimedBy : existing.claimed_by;

    // Remove standard fields from data JSON
    delete mergedData.id;
    delete mergedData.channelId;
    delete mergedData.userId;
    delete mergedData.topic;
    delete mergedData.topicLabel;
    delete mergedData.status;
    delete mergedData.priority;
    delete mergedData.claimedBy;
    delete mergedData.timestamp;

    statements.updateTicket.run(
      channelId,
      status,
      priority,
      claimedBy,
      JSON.stringify(mergedData),
      guildId,
      ticketId
    );

    return true;
  } catch (err) {
    console.error('[Database] Error updating ticket:', err.message);
    return false;
  }
}

// ===== Counter Functions =====
function getNextTicketNumber(guildId) {
  try {
    const result = statements.incrementCounter.get(guildId);
    return result.counter;
  } catch (err) {
    console.error('[Database] Error getting next ticket number:', err.message);
    return 1;
  }
}

function getCurrentCounter(guildId) {
  try {
    const row = statements.getCounter.get(guildId);
    return row ? row.counter : 0;
  } catch (err) {
    console.error('[Database] Error getting counter:', err.message);
    return 0;
  }
}

// ===== Language Functions =====
function getGuildLanguage(guildId) {
  try {
    const row = statements.getLanguage.get(guildId);
    return row ? row.language : 'de';
  } catch (err) {
    console.error('[Database] Error getting language:', err.message);
    return 'de';
  }
}

function setGuildLanguage(guildId, language) {
  try {
    statements.setLanguage.run(guildId, language);
    return true;
  } catch (err) {
    console.error('[Database] Error setting language:', err.message);
    return false;
  }
}

// ===== Migration Function =====
function migrateFromJSON() {
  console.log('[Database] Starting migration from JSON files...');

  if (!fs.existsSync(CONFIG_DIR)) {
    console.log('[Database] No configs directory found, skipping migration');
    return;
  }

  const files = fs.readdirSync(CONFIG_DIR);
  let migratedConfigs = 0;
  let migratedTickets = 0;
  let migratedCounters = 0;
  let migratedLanguages = 0;

  for (const file of files) {
    try {
      const filePath = path.join(CONFIG_DIR, file);

      // Guild config files: {guildId}.json
      if (file.match(/^\d+\.json$/)) {
        const guildId = file.replace('.json', '');
        const existing = statements.getConfig.get(guildId);

        if (!existing) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          writeCfg(guildId, data);
          migratedConfigs++;
          console.log(`[Database] Migrated config for guild ${guildId}`);
        }
      }

      // Ticket files: {guildId}_tickets.json
      if (file.match(/^\d+_tickets\.json$/)) {
        const guildId = file.replace('_tickets.json', '');
        const existingTickets = statements.getTickets.all(guildId);

        if (existingTickets.length === 0) {
          const tickets = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (Array.isArray(tickets) && tickets.length > 0) {
            saveTickets(guildId, tickets);
            migratedTickets += tickets.length;
            console.log(`[Database] Migrated ${tickets.length} tickets for guild ${guildId}`);
          }
        }
      }

      // Counter files: {guildId}_counter.json
      if (file.match(/^\d+_counter\.json$/)) {
        const guildId = file.replace('_counter.json', '');
        const existing = statements.getCounter.get(guildId);

        if (!existing) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const counter = data.counter || data || 0;
          db.prepare('INSERT OR IGNORE INTO ticket_counters (guild_id, counter) VALUES (?, ?)').run(guildId, counter);
          migratedCounters++;
          console.log(`[Database] Migrated counter for guild ${guildId}: ${counter}`);
        }
      }

      // Language files: {guildId}_language.json
      if (file.match(/^\d+_language\.json$/)) {
        const guildId = file.replace('_language.json', '');
        const existing = statements.getLanguage.get(guildId);

        if (!existing) {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const language = data.language || data || 'de';
          setGuildLanguage(guildId, language);
          migratedLanguages++;
          console.log(`[Database] Migrated language for guild ${guildId}: ${language}`);
        }
      }
    } catch (err) {
      console.error(`[Database] Error migrating file ${file}:`, err.message);
    }
  }

  console.log(`[Database] Migration complete:`);
  console.log(`  - Configs: ${migratedConfigs}`);
  console.log(`  - Tickets: ${migratedTickets}`);
  console.log(`  - Counters: ${migratedCounters}`);
  console.log(`  - Languages: ${migratedLanguages}`);
}

// Run migration on startup
migrateFromJSON();

// ===== Close database on exit =====
process.on('exit', () => {
  db.close();
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

// ===== Exports =====
module.exports = {
  db,
  readCfg,
  writeCfg,
  getDefaultConfig,
  loadTickets,
  saveTickets,
  getTicketByChannel,
  updateTicket,
  getNextTicketNumber,
  getCurrentCounter,
  getGuildLanguage,
  setGuildLanguage,
  migrateFromJSON
};
