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

  // ===== ORDER SYSTEM TABLES =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      order_number INTEGER NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      user_id TEXT NOT NULL,
      username TEXT,
      status TEXT DEFAULT 'new',
      form_responses TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      closed_at INTEGER,
      closed_by TEXT,
      product_file TEXT,
      added_users TEXT DEFAULT '[]',
      status_history TEXT DEFAULT '[]',
      UNIQUE(guild_id, order_number)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS order_counters (
      guild_id TEXT PRIMARY KEY,
      counter INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_guild ON orders(guild_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(guild_id, status)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(guild_id, user_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel_id)
  `);

  // Prepare statements
  statements = {
    // Config statements
    getConfig: db.prepare('SELECT config FROM guild_configs WHERE guild_id = ?'),
    setConfig: db.prepare(`
      INSERT INTO guild_configs (guild_id, config, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config, updated_at = strftime('%s', 'now')
    `),
    
    // Ticket counter statements
    getCounter: db.prepare('SELECT counter FROM ticket_counters WHERE guild_id = ?'),
    setCounter: db.prepare('INSERT OR REPLACE INTO ticket_counters (guild_id, counter) VALUES (?, ?)'),

    // Order counter statements
    getOrderCounter: db.prepare('SELECT counter FROM order_counters WHERE guild_id = ?'),
    setOrderCounter: db.prepare('INSERT OR REPLACE INTO order_counters (guild_id, counter) VALUES (?, ?)'),

    // Order statements
    getOrderById: db.prepare('SELECT * FROM orders WHERE guild_id = ? AND order_number = ?'),
    getOrderByChannel: db.prepare('SELECT * FROM orders WHERE channel_id = ?'),
    getOrdersByGuild: db.prepare('SELECT * FROM orders WHERE guild_id = ? ORDER BY created_at DESC'),
    getOrdersByStatus: db.prepare('SELECT * FROM orders WHERE guild_id = ? AND status = ? ORDER BY created_at DESC'),
    getOrdersByUser: db.prepare('SELECT * FROM orders WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC'),
    getOpenOrderByUser: db.prepare(`SELECT * FROM orders WHERE guild_id = ? AND user_id = ? AND status NOT IN ('completed', 'cancelled', 'refunded') LIMIT 1`),
    
    insertOrder: db.prepare(`
      INSERT INTO orders (guild_id, order_number, channel_id, message_id, user_id, username, status, form_responses, added_users, status_history, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `),
    
    updateOrder: db.prepare(`
      UPDATE orders SET 
        channel_id = ?,
        message_id = ?,
        status = ?,
        form_responses = ?,
        added_users = ?,
        status_history = ?,
        product_file = ?,
        closed_at = ?,
        closed_by = ?,
        updated_at = strftime('%s', 'now')
      WHERE guild_id = ? AND order_number = ?
    `),
    
    deleteOrder: db.prepare('DELETE FROM orders WHERE guild_id = ? AND order_number = ?'),
    
    countOrdersByStatus: db.prepare('SELECT status, COUNT(*) as count FROM orders WHERE guild_id = ? GROUP BY status')
  };

  usingSQLite = true;
  console.log('[Database] SQLite initialized with Order System tables');
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
    language: 'de',
    // Order System defaults
    orderSystem: {
      categoryId: '',
      logChannelId: '',
      transcriptChannelId: '',
      teamRoleId: '',
      archiveCategoryId: '',
      paused: false,
      formFields: [
        { id: 'order_description', label: 'Was möchtest du bestellen?', style: 'paragraph', required: true, placeholder: 'Beschreibe deine Bestellung...', maxLength: 1000 }
      ],
      panelEmbed: {
        title: '🛒 Bestellsystem',
        description: 'Klicke auf den Button um eine Bestellung aufzugeben.',
        color: '#5865F2'
      },
      panelChannelId: '',
      panelMessageId: ''
    }
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
        const config = JSON.parse(row.config);
        // Ensure orderSystem exists
        if (!config.orderSystem) {
          config.orderSystem = getDefaultConfig().orderSystem;
        }
        return config;
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
        if (!config.orderSystem) {
          config.orderSystem = getDefaultConfig().orderSystem;
        }
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
        if (!config.orderSystem) {
          config.orderSystem = getDefaultConfig().orderSystem;
        }
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
        if (!config.orderSystem) {
          config.orderSystem = getDefaultConfig().orderSystem;
        }
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
        if (!config.orderSystem) {
          config.orderSystem = getDefaultConfig().orderSystem;
        }
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

// ============================================================
// ORDER SYSTEM DATABASE FUNCTIONS
// ============================================================

/**
 * Get next order number for a guild
 */
function getNextOrderNumber(guildId) {
  if (!guildId) {
    console.error('[Database] getNextOrderNumber called without guildId!');
    return 1;
  }

  if (usingSQLite) {
    try {
      let currentCounter = 0;
      const existing = statements.getOrderCounter.get(guildId);

      if (existing) {
        currentCounter = existing.counter || 0;
      }

      const newCounter = currentCounter + 1;
      statements.setOrderCounter.run(guildId, newCounter);
      console.log(`[Database] Order counter for ${guildId}: ${currentCounter} -> ${newCounter}`);
      return newCounter;
    } catch (err) {
      console.error('[Database] Order counter error:', err.message);
      return 1;
    }
  }

  return 1;
}

/**
 * Get current order counter (without incrementing)
 */
function getCurrentOrderCounter(guildId) {
  if (!guildId) return 0;

  if (usingSQLite) {
    try {
      const row = statements.getOrderCounter.get(guildId);
      return row?.counter || 0;
    } catch (err) {
      console.error('[Database] Order counter read error:', err.message);
    }
  }

  return 0;
}

/**
 * Parse order row from database
 */
function parseOrderRow(row) {
  if (!row) return null;
  return {
    id: row.order_number,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    userId: row.user_id,
    username: row.username,
    status: row.status,
    formResponses: row.form_responses ? JSON.parse(row.form_responses) : {},
    createdAt: row.created_at * 1000,
    updatedAt: row.updated_at * 1000,
    closedAt: row.closed_at ? row.closed_at * 1000 : null,
    closedBy: row.closed_by,
    productFile: row.product_file,
    addedUsers: row.added_users ? JSON.parse(row.added_users) : [],
    statusHistory: row.status_history ? JSON.parse(row.status_history) : []
  };
}

/**
 * Get order by order number
 */
function getOrder(guildId, orderNumber) {
  if (!guildId || !orderNumber) return null;

  if (usingSQLite) {
    try {
      const row = statements.getOrderById.get(guildId, orderNumber);
      return parseOrderRow(row);
    } catch (err) {
      console.error('[Database] getOrder error:', err.message);
    }
  }

  return null;
}

/**
 * Get order by channel ID
 */
function getOrderByChannel(channelId) {
  if (!channelId) return null;

  if (usingSQLite) {
    try {
      const row = statements.getOrderByChannel.get(channelId);
      return parseOrderRow(row);
    } catch (err) {
      console.error('[Database] getOrderByChannel error:', err.message);
    }
  }

  return null;
}

/**
 * Get all orders for a guild
 */
function getOrders(guildId, status = null) {
  if (!guildId) return [];

  if (usingSQLite) {
    try {
      let rows;
      if (status) {
        rows = statements.getOrdersByStatus.all(guildId, status);
      } else {
        rows = statements.getOrdersByGuild.all(guildId);
      }
      return rows.map(parseOrderRow).filter(Boolean);
    } catch (err) {
      console.error('[Database] getOrders error:', err.message);
    }
  }

  return [];
}

/**
 * Get orders by user
 */
function getOrdersByUser(guildId, userId) {
  if (!guildId || !userId) return [];

  if (usingSQLite) {
    try {
      const rows = statements.getOrdersByUser.all(guildId, userId);
      return rows.map(parseOrderRow).filter(Boolean);
    } catch (err) {
      console.error('[Database] getOrdersByUser error:', err.message);
    }
  }

  return [];
}

/**
 * Get open order by user (only one allowed)
 */
function getOpenOrderByUser(guildId, userId) {
  if (!guildId || !userId) return null;

  if (usingSQLite) {
    try {
      const row = statements.getOpenOrderByUser.get(guildId, userId);
      return parseOrderRow(row);
    } catch (err) {
      console.error('[Database] getOpenOrderByUser error:', err.message);
    }
  }

  return null;
}

/**
 * Create a new order
 */
function createOrder(guildId, orderData) {
  if (!guildId || !orderData) return null;

  if (usingSQLite) {
    try {
      const orderNumber = getNextOrderNumber(guildId);
      
      statements.insertOrder.run(
        guildId,
        orderNumber,
        orderData.channelId || null,
        orderData.messageId || null,
        orderData.userId,
        orderData.username || '',
        orderData.status || 'new',
        JSON.stringify(orderData.formResponses || {}),
        JSON.stringify(orderData.addedUsers || []),
        JSON.stringify(orderData.statusHistory || [{ status: 'new', changedBy: orderData.userId, changedAt: Date.now() }])
      );

      console.log(`[Database] Created order #${orderNumber} for guild ${guildId}`);
      return getOrder(guildId, orderNumber);
    } catch (err) {
      console.error('[Database] createOrder error:', err.message);
    }
  }

  return null;
}

/**
 * Update an existing order
 */
function updateOrder(guildId, orderNumber, updates) {
  if (!guildId || !orderNumber) return false;

  if (usingSQLite) {
    try {
      const existing = getOrder(guildId, orderNumber);
      if (!existing) return false;

      const merged = { ...existing, ...updates };

      statements.updateOrder.run(
        merged.channelId || null,
        merged.messageId || null,
        merged.status,
        JSON.stringify(merged.formResponses || {}),
        JSON.stringify(merged.addedUsers || []),
        JSON.stringify(merged.statusHistory || []),
        merged.productFile || null,
        merged.closedAt ? Math.floor(merged.closedAt / 1000) : null,
        merged.closedBy || null,
        guildId,
        orderNumber
      );

      console.log(`[Database] Updated order #${orderNumber} for guild ${guildId}`);
      return true;
    } catch (err) {
      console.error('[Database] updateOrder error:', err.message);
    }
  }

  return false;
}

/**
 * Delete an order
 */
function deleteOrder(guildId, orderNumber) {
  if (!guildId || !orderNumber) return false;

  if (usingSQLite) {
    try {
      statements.deleteOrder.run(guildId, orderNumber);
      console.log(`[Database] Deleted order #${orderNumber} for guild ${guildId}`);
      return true;
    } catch (err) {
      console.error('[Database] deleteOrder error:', err.message);
    }
  }

  return false;
}

/**
 * Get order statistics for a guild
 */
function getOrderStats(guildId) {
  if (!guildId) return {};

  if (usingSQLite) {
    try {
      const rows = statements.countOrdersByStatus.all(guildId);
      const stats = { total: 0 };
      for (const row of rows) {
        stats[row.status] = row.count;
        stats.total += row.count;
      }
      return stats;
    } catch (err) {
      console.error('[Database] getOrderStats error:', err.message);
    }
  }

  return {};
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
  setGuildLanguage,
  
  // Order System exports
  getNextOrderNumber,
  getCurrentOrderCounter,
  getOrder,
  getOrderByChannel,
  getOrders,
  getOrdersByUser,
  getOpenOrderByUser,
  createOrder,
  updateOrder,
  deleteOrder,
  getOrderStats
};