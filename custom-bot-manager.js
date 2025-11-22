/**
 * Custom Bot Manager
 * Verwaltet Custom Discord Bots für Premium-Server mit Whitelabel
 */

const { Client, GatewayIntentBits, Partials, PresenceUpdateStatus } = require('discord.js');
const { readCfg } = require('./premium.js');
const fs = require('fs');
const path = require('path');

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

        // Update status
        this.botStatus.set(guildId, { status: 'online', error: null });
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
        await client.user.setAvatar(whitelabel.botAvatar).catch(err => {
          console.error('[Custom Bot Manager] Failed to set avatar:', err.message);
        });
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
