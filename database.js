/**
 * Database Module for Quantix Tickets Bot
 * Uses SQLite if available, otherwise falls back to JSON files
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'quantix.db');
const CONFIG_DIR = path.join(__dirname, 'configs');

// Ensure directories exist
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Try to load SQLite
let db = null;
let statements = null;
let usingSQLite = false;

try {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_configs (
      guild_id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_counters (
      guild_id TEXT PRIMARY KEY,
      counter INTEGER DEFAULT 0
    )
  `);

  // Prepare statements
  statements = {
    getConfig: db.prepare('SELECT config FROM guild_configs WHERE guild_id = ?'),
    setConfig: db.prepare(`
      INSERT INTO guild_configs (guild_id, config, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config, updated_at = strftime('%s', 'now')
    `),
    getCounter: db.prepare('SELECT counter FROM ticket_counters WHERE guild_id = ?'),
    incrementCounter: db.prepare(`
      INSERT INTO ticket_counters (guild_id, counter) VALUES (?, 1)
      ON CONFLICT(guild_id) DO UPDATE SET counter = counter + 1
      RETURNING counter
    `)
  };

  usingSQLite = true;
  console.log('[Database] SQLite initialized');
} catch (err) {
  console.log('[Database] SQLite not available, using JSON:', err.message);
}

// ===== Helper Functions for JSON =====
function safeReadJSON(filePath, defaultValue = {}) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const data = fs.readFileSync(filePath, 'utf8');
    return data ? JSON.parse(data) : defaultValue;
  } catch (err) {
    console.error('[Database] JSON read error:', err.message);
    return defaultValue;
  }
}

function safeWriteJSON(filePath, data) {
  try {
    const tempFile = filePath + '.tmp';
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempFile, jsonData, 'utf8');
    fs.renameSync(tempFile, filePath);
    return true;
  } catch (err) {
    console.error('[Database] JSON write error:', err.message);
    return false;
  }
}

// ===== Default Config =====
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
    language: 'de'
  };
}

// ===== Config Functions =====
function readCfg(guildId) {
  if (!guildId) return getDefaultConfig();

  if (usingSQLite) {
    // Step 1: Try to read from SQLite
    try {
      const row = statements.getConfig.get(guildId);
      if (row && row.config) {
        const config = JSON.parse(row.config);
        return config;
      }
    } catch (err) {
      console.error('[Database] SQLite read error:', err.message);
    }

    // Step 2: No SQLite entry - check for JSON file to migrate
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    if (fs.existsSync(configPath)) {
      const config = safeReadJSON(configPath, null);
      if (config) {
        console.log(`[Database] Migrating config from JSON to SQLite for ${guildId}`);
        try {
          const jsonData = JSON.stringify(config);
          statements.setConfig.run(guildId, jsonData);
          console.log(`[Database] Migration successful for ${guildId}`);

          // Rename JSON file to backup
          const migratedPath = configPath + '.migrated';
          try {
            fs.renameSync(configPath, migratedPath);
          } catch (renameErr) {
            console.error(`[Database] Could not rename JSON file: ${renameErr.message}`);
          }

          return config;
        } catch (writeErr) {
          console.error('[Database] Migration write error:', writeErr.message);
          return config;
        }
      }
    }

    // Step 3: Check for .migrated backup file and recover
    const migratedPath = path.join(CONFIG_DIR, `${guildId}.json.migrated`);
    if (fs.existsSync(migratedPath)) {
      const config = safeReadJSON(migratedPath, null);
      if (config) {
        console.log(`[Database] Recovering config from backup for ${guildId}`);
        try {
          const jsonData = JSON.stringify(config);
          statements.setConfig.run(guildId, jsonData);
          console.log(`[Database] Recovery to SQLite successful for ${guildId}`);
        } catch (writeErr) {
          console.error('[Database] Recovery write error:', writeErr.message);
        }
        return config;
      }
    }

    // Step 4: No data found anywhere - only NOW return defaults
    console.log(`[Database] No config found for ${guildId}, using defaults`);
    return getDefaultConfig();
  }

  // JSON fallback (when SQLite not available)
  const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
  let config = safeReadJSON(configPath, null);
  if (config) {
    return config;
  }

  // Check .migrated backup
  const migratedPath = configPath + '.migrated';
  config = safeReadJSON(migratedPath, null);
  if (config) {
    console.log(`[Database] Recovering config from backup for ${guildId}`);
    // Restore the original file
    try {
      fs.renameSync(migratedPath, configPath);
    } catch (e) {}
    return config;
  }

  console.log(`[Database] No config found for ${guildId}, using defaults`);
  return getDefaultConfig();
}

function writeCfg(guildId, data) {
  if (!guildId) {
    console.error('[Database] writeCfg called with no guildId!');
    return false;
  }

  console.log(`[Database] Writing config for guild ${guildId}`);
  console.log(`[Database] Data keys: ${Object.keys(data).join(', ')}`);

  // Log specific settings for debugging
  if (data.ticketCreationRestricted !== undefined) {
    console.log(`[Database] ticketCreationRestricted = ${data.ticketCreationRestricted}`);
  }
  if (data.allowedTicketRoles !== undefined) {
    console.log(`[Database] allowedTicketRoles = ${JSON.stringify(data.allowedTicketRoles)}`);
  }

  if (usingSQLite) {
    try {
      const jsonData = JSON.stringify(data);
      console.log(`[Database] JSON data length: ${jsonData.length} bytes`);
      statements.setConfig.run(guildId, jsonData);
      console.log(`[Database] SQLite write successful for ${guildId}`);
      return true;
    } catch (err) {
      console.error('[Database] SQLite write error:', err.message);
      console.error('[Database] SQLite error stack:', err.stack);
    }
  }

  // JSON fallback (always write to JSON as backup)
  const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
  console.log(`[Database] Writing to JSON fallback: ${configPath}`);
  const success = safeWriteJSON(configPath, data);
  console.log(`[Database] JSON write ${success ? 'successful' : 'failed'} for ${guildId}`);
  return success;
}

// ===== Ticket Functions =====
function getTicketsPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

function loadTickets(guildId) {
  if (!guildId) return [];

  const ticketsPath = getTicketsPath(guildId);
  let tickets = safeReadJSON(ticketsPath, null);

  // Check .migrated backup if no original
  if (!tickets || !Array.isArray(tickets)) {
    const migratedPath = ticketsPath + '.migrated';
    if (fs.existsSync(migratedPath)) {
      tickets = safeReadJSON(migratedPath, []);
      if (tickets && Array.isArray(tickets) && tickets.length > 0) {
        console.log(`[Database] Recovered ${tickets.length} tickets from backup for ${guildId}`);
        // Save to original path
        safeWriteJSON(ticketsPath, tickets);
      }
    }
  }

  return tickets || [];
}

function saveTickets(guildId, tickets) {
  if (!guildId) return false;
  return safeWriteJSON(getTicketsPath(guildId), tickets);
}

// ===== Counter Functions =====
function getCounterPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_counter.json`);
}

function getNextTicketNumber(guildId) {
  if (!guildId) {
    console.error('[Database] getNextTicketNumber called without guildId!');
    return 1;
  }

  if (usingSQLite) {
    try {
      // Check if counter exists in SQLite
      const existing = statements.getCounter.get(guildId);

      // If no counter in SQLite, check JSON file for migration
      if (!existing) {
        const counterPath = getCounterPath(guildId);
        let lastCounter = 0;

        // Check original JSON file
        if (fs.existsSync(counterPath)) {
          const jsonData = safeReadJSON(counterPath, { last: 0 });
          lastCounter = jsonData.last || 0;
        }

        // Check .migrated backup if no original
        if (lastCounter === 0) {
          const migratedPath = counterPath + '.migrated';
          if (fs.existsSync(migratedPath)) {
            const jsonData = safeReadJSON(migratedPath, { last: 0 });
            lastCounter = jsonData.last || 0;
            console.log(`[Database] Recovered counter from backup for ${guildId}: ${lastCounter}`);
          }
        }

        if (lastCounter > 0) {
          // Migrate: Set SQLite counter to JSON value, then increment
          console.log(`[Database] Migrating counter for ${guildId}: ${lastCounter} -> ${lastCounter + 1}`);
          db.prepare('INSERT OR REPLACE INTO ticket_counters (guild_id, counter) VALUES (?, ?)').run(guildId, lastCounter + 1);
          return lastCounter + 1;
        }
      }

      // Normal increment
      const result = statements.incrementCounter.get(guildId);
      return result.counter;
    } catch (err) {
      console.error('[Database] Counter error:', err.message);
    }
  }

  // JSON fallback
  const counterPath = getCounterPath(guildId);
  let data = safeReadJSON(counterPath, null);

  // Check .migrated backup if no original
  if (!data) {
    const migratedPath = counterPath + '.migrated';
    data = safeReadJSON(migratedPath, { last: 0 });
  }

  if (!data) data = { last: 0 };
  data.last = (data.last || 0) + 1;
  safeWriteJSON(counterPath, data);
  return data.last;
}

function getCurrentCounter(guildId) {
  if (!guildId) return 0;

  if (usingSQLite) {
    try {
      const row = statements.getCounter.get(guildId);
      if (row) {
        return row.counter;
      }
      // Check JSON fallback for existing counter
      const counterPath = getCounterPath(guildId);
      let jsonData = safeReadJSON(counterPath, null);

      // Check .migrated backup
      if (!jsonData) {
        const migratedPath = counterPath + '.migrated';
        jsonData = safeReadJSON(migratedPath, { last: 0 });
      }

      return jsonData?.last || 0;
    } catch (err) {
      console.error('[Database] Counter read error:', err.message);
    }
  }

  const counterPath = getCounterPath(guildId);
  let data = safeReadJSON(counterPath, null);

  // Check .migrated backup
  if (!data) {
    const migratedPath = counterPath + '.migrated';
    data = safeReadJSON(migratedPath, { last: 0 });
  }

  return data?.last || 0;
}

// ===== Language Functions =====
function getLanguagePath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_language.json`);
}

function getGuildLanguage(guildId) {
  if (!guildId) return 'de';
  const data = safeReadJSON(getLanguagePath(guildId), { language: 'de' });
  return data.language || 'de';
}

function setGuildLanguage(guildId, language) {
  if (!guildId) return false;
  return safeWriteJSON(getLanguagePath(guildId), { language });
}

// ===== Exports =====
module.exports = {
  db,
  usingSQLite,
  readCfg,
  writeCfg,
  getDefaultConfig,
  loadTickets,
  saveTickets,
  getNextTicketNumber,
  getCurrentCounter,
  getGuildLanguage,
  setGuildLanguage
};
