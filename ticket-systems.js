const { readCfg, writeCfg } = require('./database');

/**
 * Migriert alte Config-Struktur zu Multi-Ticket-System-Struktur
 * @param {string} guildId - Guild ID
 * @returns {object} Migrierte Config
 */
function migrateToTicketSystems(guildId) {
  const cfg = readCfg(guildId);

  // Bereits migriert?
  if (cfg.ticketSystems && Array.isArray(cfg.ticketSystems)) {
    return cfg;
  }

  console.log(`🔄 Migriere Config für Guild ${guildId} zu Multi-Ticket-System-Struktur...`);

  // Erstelle default-System aus bestehender Config
  const defaultSystem = {
    id: 'default',
    name: 'Support Tickets',
    enabled: true,

    // Panel-Info
    panelMessageId: cfg.panelMessageId || null,
    panelChannelId: cfg.panelChannelId || null,

    // System-spezifische Einstellungen
    topics: cfg.topics || [],
    teamRoleId: cfg.teamRoleId || null,
    priorityRoles: cfg.priorityRoles || {},
    categoryId: cfg.categoryId || null,
    logChannelId: cfg.logChannelId || [],
    transcriptChannelId: cfg.transcriptChannelId || [],

    // Panel-Design
    embedTitle: cfg.embedTitle || 'Support Tickets',
    embedDescription: cfg.embedDescription || 'Wähle ein Thema aus, um ein Ticket zu erstellen.',
    embedColor: cfg.embedColor || '#00ff88',

    // Weitere Einstellungen
    notifyUserOnStatusChange: cfg.notifyUserOnStatusChange !== false,
    autoClose: cfg.autoClose || null,
    sla: cfg.sla || null,
    autoAssignment: cfg.autoAssignment || null
  };

  // Erstelle neue Struktur
  cfg.ticketSystems = [defaultSystem];

  // Entferne alte Felder (optional, für Sauberkeit)
  delete cfg.topics;
  delete cfg.teamRoleId;
  delete cfg.priorityRoles;
  delete cfg.categoryId;
  delete cfg.panelMessageId;
  delete cfg.panelChannelId;
  delete cfg.embedTitle;
  delete cfg.embedDescription;
  delete cfg.embedColor;

  writeCfg(guildId, cfg);
  console.log(`✅ Config migriert für Guild ${guildId}`);

  return cfg;
}

/**
 * Gibt ein Ticket-System anhand der ID zurück
 * @param {string} guildId - Guild ID
 * @param {string} systemId - System ID
 * @returns {object|null} Ticket-System oder null
 */
function getTicketSystem(guildId, systemId) {
  const cfg = migrateToTicketSystems(guildId);

  if (!cfg.ticketSystems || !Array.isArray(cfg.ticketSystems)) {
    return null;
  }

  return cfg.ticketSystems.find(sys => sys.id === systemId) || null;
}

/**
 * Gibt alle Ticket-Systeme eines Servers zurück
 * @param {string} guildId - Guild ID
 * @returns {array} Array von Ticket-Systemen
 */
function getAllTicketSystems(guildId) {
  const cfg = migrateToTicketSystems(guildId);
  return cfg.ticketSystems || [];
}

/**
 * Gibt das Standard-Ticket-System zurück (für Backwards-Compatibility)
 * @param {string} guildId - Guild ID
 * @returns {object|null} Default Ticket-System
 */
function getDefaultTicketSystem(guildId) {
  return getTicketSystem(guildId, 'default');
}

/**
 * Erstellt ein neues Ticket-System
 * @param {string} guildId - Guild ID
 * @param {object} systemData - System-Daten
 * @returns {object} Erstelltes System
 */
function createTicketSystem(guildId, systemData) {
  const cfg = migrateToTicketSystems(guildId);

  const newSystem = {
    id: systemData.id || `system_${Date.now()}`,
    name: systemData.name || 'Neues Ticket-System',
    enabled: true,
    panelMessageId: null,
    panelChannelId: null,
    topics: [],
    teamRoleId: null,
    priorityRoles: {},
    categoryId: null,
    logChannelId: [],
    transcriptChannelId: [],
    embedTitle: systemData.name || 'Tickets',
    embedDescription: 'Wähle ein Thema aus.',
    embedColor: '#00ff88',
    notifyUserOnStatusChange: true,
    autoClose: null,
    sla: null,
    autoAssignment: null
  };

  cfg.ticketSystems.push(newSystem);
  writeCfg(guildId, cfg);

  console.log(`✅ Neues Ticket-System erstellt: ${newSystem.id} (${newSystem.name})`);
  return newSystem;
}

/**
 * Aktualisiert ein Ticket-System
 * @param {string} guildId - Guild ID
 * @param {string} systemId - System ID
 * @param {object} updates - Zu aktualisierende Felder
 * @returns {boolean} Erfolg
 */
function updateTicketSystem(guildId, systemId, updates) {
  const cfg = migrateToTicketSystems(guildId);
  const systemIndex = cfg.ticketSystems.findIndex(sys => sys.id === systemId);

  if (systemIndex === -1) {
    return false;
  }

  cfg.ticketSystems[systemIndex] = {
    ...cfg.ticketSystems[systemIndex],
    ...updates
  };

  writeCfg(guildId, cfg);
  console.log(`✅ Ticket-System aktualisiert: ${systemId}`);
  return true;
}

/**
 * Löscht ein Ticket-System
 * @param {string} guildId - Guild ID
 * @param {string} systemId - System ID
 * @returns {boolean} Erfolg
 */
function deleteTicketSystem(guildId, systemId) {
  // Default-System kann nicht gelöscht werden
  if (systemId === 'default') {
    return false;
  }

  const cfg = migrateToTicketSystems(guildId);
  const initialLength = cfg.ticketSystems.length;

  cfg.ticketSystems = cfg.ticketSystems.filter(sys => sys.id !== systemId);

  if (cfg.ticketSystems.length < initialLength) {
    writeCfg(guildId, cfg);
    console.log(`✅ Ticket-System gelöscht: ${systemId}`);
    return true;
  }

  return false;
}

/**
 * Findet Ticket-System anhand Panel-Message-ID
 * @param {string} guildId - Guild ID
 * @param {string} messageId - Panel Message ID
 * @returns {object|null} Ticket-System oder null
 */
function getSystemByPanelMessage(guildId, messageId) {
  const cfg = migrateToTicketSystems(guildId);
  return cfg.ticketSystems.find(sys => sys.panelMessageId === messageId) || null;
}

module.exports = {
  migrateToTicketSystems,
  getTicketSystem,
  getAllTicketSystems,
  getDefaultTicketSystem,
  createTicketSystem,
  updateTicketSystem,
  deleteTicketSystem,
  getSystemByPanelMessage
};
