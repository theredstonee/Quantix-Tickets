/**
 * Custom Bot Manager
 * Verwaltet Custom Discord Bots für Premium-Server mit Whitelabel
 */

const { Client, GatewayIntentBits, Partials, PresenceUpdateStatus, REST, Routes, Collection } = require('discord.js');
const { readCfg } = require('./premium.js');
const fs = require('fs');
const path = require('path');

// Commands Collection für Custom Bots
const customBotCommands = new Collection();

/**
 * Lädt alle Commands aus dem commands/ Verzeichnis
 */
function loadCommands() {
  customBotCommands.clear();
  const commandsPath = path.join(__dirname, 'commands');

  if (!fs.existsSync(commandsPath)) {
    console.log('[Custom Bot Manager] No commands directory found');
    return;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    delete require.cache[require.resolve(filePath)];
    try {
      const cmd = require(filePath);
      if (cmd.data && cmd.execute) {
        customBotCommands.set(cmd.data.name, cmd);
      }
    } catch (err) {
      console.error(`[Custom Bot Manager] Fehler beim Laden von ${file}:`, err);
    }
  }
  console.log(`[Custom Bot Manager] 📦 ${customBotCommands.size} Commands geladen`);
}

/**
 * Registriert Commands für einen Custom Bot auf einer Guild
 */
async function deployCommandsForBot(client, guildId) {
  try {
    loadCommands();
    const rest = new REST({ version: '10' }).setToken(client.token);
    const commands = Array.from(customBotCommands.values()).map(cmd => cmd.data.toJSON());

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands }
    );

    console.log(`[Custom Bot Manager] ✅ ${commands.length} Commands registriert für Guild ${guildId}`);
    return true;
  } catch (err) {
    console.error(`[Custom Bot Manager] ❌ Commands Registrierung fehlgeschlagen:`, err);
    return false;
  }
}

class CustomBotManager {
  constructor() {
    this.bots = new Map(); // guildId -> Discord.Client
    this.botStatus = new Map(); // guildId -> { status: 'online'|'offline'|'error', error: string }
  }

  /**
   * Startet einen Custom Bot für einen Server
   * @param {string} guildId - Guild ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startBot(guildId) {
    try {
      console.log(`[Custom Bot Manager] Starting custom bot for guild ${guildId}...`);

      // Check if bot already running
      if (this.bots.has(guildId)) {
        console.log(`[Custom Bot Manager] Bot for guild ${guildId} already running`);
        return { success: true };
      }

      // Load config
      const config = readCfg(guildId);

      // Check if whitelabel enabled and token exists
      if (!config.whitelabel || !config.whitelabel.enabled || !config.whitelabel.botToken) {
        console.log(`[Custom Bot Manager] Whitelabel not configured for guild ${guildId}`);
        return { success: false, error: 'Whitelabel not configured' };
      }

      const token = config.whitelabel.botToken;

      // Create Discord client
      const client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.GuildVoiceStates
        ],
        partials: [Partials.Channel, Partials.Message]
      });

      // Store guild ID in client for later reference
      client.customGuildId = guildId;

      // Setup event handlers
      client.once('ready', async () => {
        console.log(`[Custom Bot Manager] ✅ Custom bot ready for guild ${guildId}: ${client.user.tag}`);

        // Apply custom settings
        await this.applyCustomSettings(client, config.whitelabel);

        // Register commands for this guild
        await deployCommandsForBot(client, guildId);

        // Update status
        this.botStatus.set(guildId, { status: 'online', error: null });
      });

      // Setup interactionCreate handler
      client.on('interactionCreate', async (interaction) => {
        await this.handleInteraction(interaction, guildId);
      });

      // Setup messageCreate handler
      client.on('messageCreate', async (message) => {
        await this.handleMessage(message, guildId);
      });

      client.on('error', (error) => {
        console.error(`[Custom Bot Manager] ❌ Error in custom bot for guild ${guildId}:`, error);
        this.botStatus.set(guildId, { status: 'error', error: error.message });
      });

      // Store client
      this.bots.set(guildId, client);

      // Login
      await client.login(token);

      return { success: true };

    } catch (error) {
      console.error(`[Custom Bot Manager] ❌ Failed to start bot for guild ${guildId}:`, error.message);
      this.botStatus.set(guildId, { status: 'error', error: error.message });

      // Cleanup on failure
      if (this.bots.has(guildId)) {
        const client = this.bots.get(guildId);
        client.destroy().catch(() => {});
        this.bots.delete(guildId);
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Stoppt einen Custom Bot
   * @param {string} guildId - Guild ID
   * @returns {Promise<{success: boolean}>}
   */
  async stopBot(guildId) {
    try {
      console.log(`[Custom Bot Manager] Stopping custom bot for guild ${guildId}...`);

      if (!this.bots.has(guildId)) {
        console.log(`[Custom Bot Manager] No bot running for guild ${guildId}`);
        return { success: true };
      }

      const client = this.bots.get(guildId);
      await client.destroy();

      this.bots.delete(guildId);
      this.botStatus.set(guildId, { status: 'offline', error: null });

      console.log(`[Custom Bot Manager] ✅ Custom bot stopped for guild ${guildId}`);
      return { success: true };

    } catch (error) {
      console.error(`[Custom Bot Manager] ❌ Error stopping bot for guild ${guildId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Neustart eines Custom Bots
   * @param {string} guildId - Guild ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async restartBot(guildId) {
    console.log(`[Custom Bot Manager] Restarting custom bot for guild ${guildId}...`);
    await this.stopBot(guildId);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    return await this.startBot(guildId);
  }

  /**
   * Wendet Custom-Einstellungen auf den Bot an
   * @param {Client} client - Discord Client
   * @param {object} whitelabel - Whitelabel Config
   */
  async applyCustomSettings(client, whitelabel) {
    try {
      // Set custom username if configured
      if (whitelabel.botName && whitelabel.botName !== client.user.username) {
        await client.user.setUsername(whitelabel.botName).catch(err => {
          console.error('[Custom Bot Manager] Failed to set username:', err.message);
        });
      }

      // Set custom avatar if configured
      if (whitelabel.botAvatar) {
        try {
          let avatarData = whitelabel.botAvatar;

          // If it's a local file path, read and convert to base64
          if (avatarData.startsWith('/avatars/')) {
            const avatarPath = path.join(__dirname, 'public', avatarData);
            if (fs.existsSync(avatarPath)) {
              const fileBuffer = fs.readFileSync(avatarPath);
              const ext = path.extname(avatarPath).toLowerCase();
              const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
              avatarData = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
            } else {
              console.log('[Custom Bot Manager] Avatar file not found:', avatarPath);
              avatarData = null;
            }
          }

          if (avatarData) {
            await client.user.setAvatar(avatarData);
            console.log('[Custom Bot Manager] Avatar set successfully');
          }
        } catch (err) {
          console.error('[Custom Bot Manager] Failed to set avatar:', err.message);
        }
      }

      // Set custom status
      const statusType = whitelabel.botStatus?.type || 'online';
      const statusText = whitelabel.botStatus?.text || '';

      const statusMap = {
        'online': PresenceUpdateStatus.Online,
        'idle': PresenceUpdateStatus.Idle,
        'dnd': PresenceUpdateStatus.DoNotDisturb,
        'invisible': PresenceUpdateStatus.Invisible
      };

      await client.user.setPresence({
        status: statusMap[statusType] || PresenceUpdateStatus.Online,
        activities: statusText ? [{
          name: statusText,
          type: 0 // Playing
        }] : []
      });

      console.log(`[Custom Bot Manager] ✅ Applied custom settings for ${client.user.tag}`);

    } catch (error) {
      console.error('[Custom Bot Manager] Error applying custom settings:', error);
    }
  }

  /**
   * Lädt alle Custom Bots für konfigurierte Server
   * @returns {Promise<void>}
   */
  async loadAllBots() {
    console.log('[Custom Bot Manager] Loading all custom bots...');

    const configDir = path.join(__dirname, 'configs');
    if (!fs.existsSync(configDir)) {
      console.log('[Custom Bot Manager] No configs directory found');
      return;
    }

    const files = fs.readdirSync(configDir);
    const guildConfigFiles = files.filter(f => f.endsWith('.json') && !f.includes('_'));

    let loaded = 0;
    let failed = 0;

    for (const file of guildConfigFiles) {
      const guildId = file.replace('.json', '');

      try {
        const config = readCfg(guildId);

        // Check if whitelabel is enabled and has token
        if (config.whitelabel && config.whitelabel.enabled && config.whitelabel.botToken) {
          const result = await this.startBot(guildId);
          if (result.success) {
            loaded++;
          } else {
            failed++;
          }

          // Wait a bit between bot starts to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`[Custom Bot Manager] Error loading bot for ${guildId}:`, error);
        failed++;
      }
    }

    console.log(`[Custom Bot Manager] ✅ Loaded ${loaded} custom bots, ${failed} failed`);
  }

  /**
   * Gibt den Client für einen Server zurück
   * @param {string} guildId - Guild ID
   * @returns {Client|null}
   */
  getBot(guildId) {
    return this.bots.get(guildId) || null;
  }

  /**
   * Gibt den aktiven Client für einen Server zurück (Custom Bot oder Haupt-Bot)
   * @param {string} guildId - Guild ID
   * @param {Client} mainClient - Der Haupt-Bot Client als Fallback
   * @returns {Client} - Custom Bot wenn aktiv, sonst Haupt-Bot
   */
  getActiveClient(guildId, mainClient) {
    const customBot = this.bots.get(guildId);

    // Prüfe ob Custom Bot aktiv und bereit ist
    if (customBot && customBot.isReady()) {
      const status = this.botStatus.get(guildId);
      if (status && status.status === 'online') {
        console.log(`[Custom Bot Manager] Using custom bot for guild ${guildId}: ${customBot.user?.tag}`);
        return customBot;
      }
    }

    // Fallback auf Haupt-Bot
    return mainClient;
  }

  /**
   * Prüft ob ein Custom Bot für einen Server aktiv ist
   * @param {string} guildId - Guild ID
   * @returns {boolean}
   */
  isCustomBotActive(guildId) {
    const customBot = this.bots.get(guildId);
    if (!customBot || !customBot.isReady()) return false;

    const status = this.botStatus.get(guildId);
    return status && status.status === 'online';
  }

  /**
   * Gibt den Status eines Bots zurück
   * @param {string} guildId - Guild ID
   * @returns {object}
   */
  getBotStatus(guildId) {
    return this.botStatus.get(guildId) || { status: 'offline', error: null };
  }

  /**
   * Gibt alle laufenden Bots zurück
   * @returns {Array}
   */
  getAllBots() {
    return Array.from(this.bots.entries()).map(([guildId, client]) => ({
      guildId,
      username: client.user?.username,
      tag: client.user?.tag,
      status: this.botStatus.get(guildId)
    }));
  }

  /**
   * Verarbeitet Interaktionen für Custom Bots
   * @param {Interaction} interaction - Discord Interaction
   * @param {string} guildId - Guild ID
   */
  async handleInteraction(interaction, guildId) {
    try {
      // Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = customBotCommands.get(interaction.commandName);
        if (command) {
          try {
            await command.execute(interaction);
          } catch (err) {
            console.error(`[Custom Bot Manager] Command error (${interaction.commandName}):`, err);
            const errorMsg = { content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
              await interaction.followUp(errorMsg);
            } else {
              await interaction.reply(errorMsg);
            }
          }
        }
        return;
      }

      // Button Interactions - Weiterleitung an Hauptbot-Handler
      if (interaction.isButton()) {
        // Die Button-Handler sind im index.js - wir müssen sie hier importieren
        // Für jetzt: Lade den interactionHandler dynamisch
        try {
          const mainBotHandlers = require('./interaction-handlers.js');
          if (mainBotHandlers && mainBotHandlers.handleButton) {
            await mainBotHandlers.handleButton(interaction, guildId);
          }
        } catch (err) {
          // Fallback: Wenn kein Handler existiert, ignoriere
          console.log(`[Custom Bot Manager] Button ${interaction.customId} - kein Handler gefunden`);
        }
        return;
      }

      // String Select Menu
      if (interaction.isStringSelectMenu()) {
        try {
          const mainBotHandlers = require('./interaction-handlers.js');
          if (mainBotHandlers && mainBotHandlers.handleSelectMenu) {
            await mainBotHandlers.handleSelectMenu(interaction, guildId);
          }
        } catch (err) {
          console.log(`[Custom Bot Manager] SelectMenu ${interaction.customId} - kein Handler gefunden`);
        }
        return;
      }

      // Modal Submit
      if (interaction.isModalSubmit()) {
        try {
          const mainBotHandlers = require('./interaction-handlers.js');
          if (mainBotHandlers && mainBotHandlers.handleModal) {
            await mainBotHandlers.handleModal(interaction, guildId);
          }
        } catch (err) {
          console.log(`[Custom Bot Manager] Modal ${interaction.customId} - kein Handler gefunden`);
        }
        return;
      }

    } catch (err) {
      console.error(`[Custom Bot Manager] Interaction error:`, err);
    }
  }

  /**
   * Verarbeitet Nachrichten für Custom Bots (Live Transcript, Force Claim, etc.)
   * @param {Message} message - Discord Message
   * @param {string} guildId - Guild ID
   */
  async handleMessage(message, guildId) {
    // Ignore bot messages
    if (message.author.bot) return;

    try {
      // Lade die Message Handler dynamisch
      try {
        const mainBotHandlers = require('./interaction-handlers.js');
        if (mainBotHandlers && mainBotHandlers.handleMessage) {
          await mainBotHandlers.handleMessage(message, guildId);
        }
      } catch (err) {
        // Fallback: Basis-Funktionalität
        console.log(`[Custom Bot Manager] Message handler not found, using basic handling`);

        // Basis: Live Transcript
        const { loadTickets } = require('./premium.js');
        const tickets = loadTickets(guildId);
        const ticket = tickets.find(t => t.channelId === message.channel.id && t.status === 'offen');

        if (ticket) {
          // Update lastMessageAt für Auto-Close
          const ticketsPath = path.join(__dirname, 'configs', `${guildId}_tickets.json`);
          const ticketIndex = tickets.findIndex(t => t.id === ticket.id);
          if (ticketIndex !== -1) {
            tickets[ticketIndex].lastMessageAt = Date.now();
            if (tickets[ticketIndex].autoCloseWarningSent) {
              tickets[ticketIndex].autoCloseWarningSent = false;
              tickets[ticketIndex].autoCloseWarningAt = null;
            }
            fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));
          }
        }
      }
    } catch (err) {
      console.error(`[Custom Bot Manager] Message handling error:`, err);
    }
  }

  /**
   * Stoppt alle Custom Bots
   */
  async stopAllBots() {
    console.log('[Custom Bot Manager] Stopping all custom bots...');

    const stopPromises = Array.from(this.bots.keys()).map(guildId => this.stopBot(guildId));
    await Promise.all(stopPromises);

    console.log('[Custom Bot Manager] ✅ All custom bots stopped');
  }
}

// Singleton instance
const customBotManager = new CustomBotManager();

module.exports = customBotManager;
