/**
 * Database Module for Quantix Tickets Bot
 * Uses SQLite - migrates from JSON once then never reads JSON again
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

// Load SQLite
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
    setCounter: db.prepare('INSERT OR REPLACE INTO ticket_counters (guild_id, counter) VALUES (?, ?)')
  };

  usingSQLite = true;
  console.log('[Database] SQLite initialized');
} catch (err) {
  console.error('[Database] SQLite failed to load:', err.message);
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
    // Step 1: Try SQLite first
    try {
      const row = statements.getConfig.get(guildId);
      if (row && row.config) {
        return JSON.parse(row.config);
      }
    } catch (err) {
      console.error('[Database] SQLite read error:', err.message);
    }

    // Step 2: No SQLite data - check for .json to migrate
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    if (fs.existsSync(configPath)) {
      const config = safeReadJSON(configPath, null);
      if (config) {
        console.log(`[Database] Migrating config from .json to SQLite for ${guildId}`);
        try {
          statements.setConfig.run(guildId, JSON.stringify(config));
          fs.renameSync(configPath, configPath + '.migrated');
          console.log(`[Database] Migration complete, renamed to .migrated`);
        } catch (e) {
          console.error('[Database] Migration error:', e.message);
        }
        return config;
      }
    }

    // Step 3: No .json - check for .migrated to migrate
    const migratedPath = path.join(CONFIG_DIR, `${guildId}.json.migrated`);
    if (fs.existsSync(migratedPath)) {
      const config = safeReadJSON(migratedPath, null);
      if (config) {
        console.log(`[Database] Migrating config from .migrated to SQLite for ${guildId}`);
        try {
          statements.setConfig.run(guildId, JSON.stringify(config));
          fs.renameSync(migratedPath, path.join(CONFIG_DIR, `${guildId}.json.back`));
          console.log(`[Database] Migration complete, renamed to .back`);
        } catch (e) {
          console.error('[Database] Migration error:', e.message);
        }
        return config;
      }
    }

    // Step 4: No .migrated - check for .back to migrate
    const backPath = path.join(CONFIG_DIR, `${guildId}.json.back`);
    if (fs.existsSync(backPath)) {
      const config = safeReadJSON(backPath, null);
      if (config) {
        console.log(`[Database] Migrating config from .back to SQLite for ${guildId}`);
        try {
          statements.setConfig.run(guildId, JSON.stringify(config));
          fs.renameSync(backPath, path.join(CONFIG_DIR, `${guildId}.json.old`));
          console.log(`[Database] Migration complete, renamed to .old`);
        } catch (e) {
          console.error('[Database] Migration error:', e.message);
        }
        return config;
      }
    }

    // Step 5: No .back - check for .old to migrate
    const oldPath = path.join(CONFIG_DIR, `${guildId}.json.old`);
    if (fs.existsSync(oldPath)) {
      const config = safeReadJSON(oldPath, null);
      if (config) {
        console.log(`[Database] Migrating config from .old to SQLite for ${guildId}`);
        try {
          statements.setConfig.run(guildId, JSON.stringify(config));
          fs.renameSync(oldPath, path.join(CONFIG_DIR, `${guildId}.json.archived`));
          console.log(`[Database] Migration complete, renamed to .archived`);
        } catch (e) {
          console.error('[Database] Migration error:', e.message);
        }
        return config;
      }
    }

    // Step 6: No migration files - return defaults for new guilds
    return getDefaultConfig();
  }

  // No SQLite available - return defaults
  return getDefaultConfig();
}

function writeCfg(guildId, data) {
  if (!guildId) {
    console.error('[Database] writeCfg called with no guildId!');
    return false;
  }

  if (usingSQLite) {
    try {
      statements.setConfig.run(guildId, JSON.stringify(data));
      console.log(`[Database] Config saved for ${guildId}`);
      return true;
    } catch (err) {
      console.error('[Database] SQLite write error:', err.message);
      return false;
    }
  }

  console.error('[Database] No SQLite available');
  return false;
}

// ===== Ticket Functions (JSON files) =====
function getTicketsPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

function loadTickets(guildId) {
  if (!guildId) return [];
  const ticketsPath = getTicketsPath(guildId);
  const tickets = safeReadJSON(ticketsPath, []);
  return Array.isArray(tickets) ? tickets : [];
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
      // Step 1: Try SQLite first
      let currentCounter = 0;
      const existing = statements.getCounter.get(guildId);

      if (existing) {
        currentCounter = existing.counter || 0;
      } else {
        // Step 2: No SQLite data - check for .json to migrate
        const counterPath = getCounterPath(guildId);
        if (fs.existsSync(counterPath)) {
          const jsonData = safeReadJSON(counterPath, { last: 0 });
          currentCounter = jsonData.last || 0;
          console.log(`[Database] Migrating counter from .json for ${guildId}: ${currentCounter}`);
          try {
            fs.renameSync(counterPath, counterPath + '.migrated');
          } catch (e) {}
        } else {
          // Step 3: No .json - check for .migrated to migrate
          const migratedPath = counterPath + '.migrated';
          if (fs.existsSync(migratedPath)) {
            const jsonData = safeReadJSON(migratedPath, { last: 0 });
            currentCounter = jsonData.last || 0;
            console.log(`[Database] Migrating counter from .migrated for ${guildId}: ${currentCounter}`);
            try {
              fs.renameSync(migratedPath, counterPath + '.back');
            } catch (e) {}
          } else {
            // Step 4: No .migrated - check for .back to migrate
            const backPath = counterPath + '.back';
            if (fs.existsSync(backPath)) {
              const jsonData = safeReadJSON(backPath, { last: 0 });
              currentCounter = jsonData.last || 0;
              console.log(`[Database] Migrating counter from .back for ${guildId}: ${currentCounter}`);
              try {
                fs.renameSync(backPath, counterPath + '.old');
              } catch (e) {}
            } else {
              // Step 5: No .back - check for .old to migrate
              const oldPath = counterPath + '.old';
              if (fs.existsSync(oldPath)) {
                const jsonData = safeReadJSON(oldPath, { last: 0 });
                currentCounter = jsonData.last || 0;
                console.log(`[Database] Migrating counter from .old for ${guildId}: ${currentCounter}`);
                try {
                  fs.renameSync(oldPath, counterPath + '.archived');
                } catch (e) {}
              }
            }
          }
        }
      }

      // Step 6: Increment and save
      const newCounter = currentCounter + 1;
      statements.setCounter.run(guildId, newCounter);
      console.log(`[Database] Counter for ${guildId}: ${currentCounter} -> ${newCounter}`);
      return newCounter;
    } catch (err) {
      console.error('[Database] Counter error:', err.message);
      return 1;
    }
  }

  return 1;
}

function getCurrentCounter(guildId) {
  if (!guildId) return 0;

  if (usingSQLite) {
    try {
      const row = statements.getCounter.get(guildId);
      return row?.counter || 0;
    } catch (err) {
      console.error('[Database] Counter read error:', err.message);
    }
  }

  return 0;
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
