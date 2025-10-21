/**
 * Discord Logger - Sendet alle Console-Logs zu einem Discord-Channel
 * Quantix Tickets Bot
 */

const LOG_CHANNEL_ID = '1429128434042277939';
const MAX_MESSAGE_LENGTH = 1900; // Discord limit is 2000, leave some buffer

let client = null;
let logChannel = null;
let messageQueue = [];
let isProcessing = false;

// Original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

/**
 * Initialize Discord Logger
 * @param {Client} discordClient - Discord.js client instance
 */
function initializeLogger(discordClient) {
  client = discordClient;

  // Wait for client to be ready
  if (client.isReady()) {
    setupLogChannel();
  } else {
    client.once('ready', () => {
      setupLogChannel();
    });
  }

  // Override console methods
  console.log = (...args) => {
    originalConsole.log(...args);
    sendToDiscord('📝 LOG', args);
  };

  console.error = (...args) => {
    originalConsole.error(...args);
    sendToDiscord('🔴 ERROR', args, '#e74c3c');
  };

  console.warn = (...args) => {
    originalConsole.warn(...args);
    sendToDiscord('⚠️ WARN', args, '#f39c12');
  };

  console.info = (...args) => {
    originalConsole.info(...args);
    sendToDiscord('ℹ️ INFO', args, '#3498db');
  };

  originalConsole.log('✅ Discord Logger initialisiert - Logs werden zu Discord gesendet');
}

/**
 * Setup log channel
 */
async function setupLogChannel() {
  try {
    logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (logChannel) {
      originalConsole.log(`✅ Log Channel gefunden: ${logChannel.name}`);
      await sendInitMessage();
    } else {
      originalConsole.error(`❌ Log Channel ${LOG_CHANNEL_ID} nicht gefunden`);
    }
  } catch (err) {
    originalConsole.error('❌ Fehler beim Setup des Log Channels:', err);
  }
}

/**
 * Send initialization message with banner
 */
async function sendInitMessage() {
  if (!logChannel) return;

  try {
    const { VERSION } = require('./version.config');
    const { version: nodeVersion } = require('process');
    const { version: discordVersion } = require('discord.js');
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    // Send banner as code block
    const bannerText = `
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║     ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗██╗  ██╗                ║
║    ██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝██║╚██╗██╔╝                ║
║    ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ██║ ╚███╔╝                 ║
║    ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ██║ ██╔██╗                 ║
║    ╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██║██╔╝ ██╗                ║
║     ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═╝                ║
║                                                                            ║
║                        Quantix Tickets Bot                                 ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
`;

    await logChannel.send({
      content: '```' + bannerText + '```',
      embeds: [{
        color: 0x00ff88,
        title: '🚀 Bot erfolgreich gestartet',
        fields: [
          { name: '🎫 Quantix Tickets Bot', value: `v${VERSION}`, inline: true },
          { name: '🤖 Discord Bot System', value: '$Release v{VERSION}', inline: true },
          { name: '📅 Startzeit', value: timestamp, inline: false },
          { name: '⚡ Node.js Version', value: nodeVersion, inline: true },
          { name: '🔷 Discord.js Version', value: discordVersion, inline: true }
        ],
        timestamp: new Date(),
        footer: { text: 'Quantix Tickets Logger' }
      }]
    });

    originalConsole.log('✅ Startup-Banner zu Discord gesendet');
  } catch (err) {
    originalConsole.error('Fehler beim Senden der Init-Message:', err);
  }
}

/**
 * Send log to Discord
 * @param {string} type - Log type (LOG, ERROR, WARN, INFO)
 * @param {Array} args - Console arguments
 * @param {string} color - Embed color (hex)
 */
function sendToDiscord(type, args, color = '#00ff88') {
  if (!logChannel) return;

  // Format message
  let message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  // Truncate if too long
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.substring(0, MAX_MESSAGE_LENGTH) + '... (gekürzt)';
  }

  // Add to queue
  messageQueue.push({
    type,
    message,
    color,
    timestamp: new Date()
  });

  // Process queue
  processQueue();
}

/**
 * Process message queue
 */
async function processQueue() {
  if (isProcessing || messageQueue.length === 0) return;
  if (!logChannel) return;

  isProcessing = true;

  while (messageQueue.length > 0) {
    const log = messageQueue.shift();

    try {
      // Skip empty messages
      if (!log.message.trim()) continue;

      // Send to Discord
      await logChannel.send({
        embeds: [{
          color: parseInt(log.color.replace('#', ''), 16),
          description: `**${log.type}**\n\`\`\`\n${log.message}\n\`\`\``,
          timestamp: log.timestamp,
          footer: { text: 'Quantix Tickets' }
        }]
      });

      // Rate limiting: Wait 500ms between messages
      if (messageQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      originalConsole.error('Fehler beim Senden zu Discord:', err);
      // Wait longer on error
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  isProcessing = false;
}

/**
 * Restore original console methods
 */
function disableLogger() {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  originalConsole.log('Discord Logger deaktiviert');
}

module.exports = {
  initializeLogger,
  disableLogger,
  originalConsole
};
