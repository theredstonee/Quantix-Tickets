const { hasFeature } = require('./premium');
const { readCfg, writeCfg } = require('./database');

/**
 * Sendet Discord DM-Benachrichtigungen an konfigurierte Team-Mitglieder
 * @param {object} client - Discord.js Client
 * @param {string} guildId - Guild ID
 * @param {object} ticketInfo - Ticket-Informationen
 * @returns {Promise<object>}
 */
async function sendDMNotification(client, guildId, ticketInfo) {
  try {
    // Prüfe ob Guild das DM-Feature hat (nur Pro)
    if (!hasFeature(guildId, 'dmNotifications')) {
      return { success: false, reason: 'not_pro' };
    }

    // Lese Konfiguration
    const cfg = readCfg(guildId);
    const dmRecipients = cfg.dmNotificationUsers || [];

    if (dmRecipients.length === 0) {
      return { success: false, reason: 'no_recipients_configured' };
    }

    // Erstelle DM-Nachricht
    const embed = {
      color: 0x667eea,
      title: '🎫 Neues Ticket erstellt',
      description: `Ein neues Ticket wurde auf **${ticketInfo.guildName}** erstellt.`,
      fields: [
        {
          name: '📋 Ticket-ID',
          value: `#${ticketInfo.id}`,
          inline: true
        },
        {
          name: '📁 Kategorie',
          value: ticketInfo.topic || 'Keine',
          inline: true
        },
        {
          name: '👤 Erstellt von',
          value: ticketInfo.user || 'Unbekannt',
          inline: false
        }
      ],
      footer: {
        text: 'Quantix Tickets Bot | Premium Pro Feature'
      },
      timestamp: new Date()
    };

    // Füge Custom Fields hinzu falls vorhanden
    if (ticketInfo.formData && Object.keys(ticketInfo.formData).length > 0) {
      const formFields = Object.entries(ticketInfo.formData)
        .map(([key, value]) => `**${key}:** ${value}`)
        .join('\n');
      embed.fields.push({
        name: '📝 Zusätzliche Informationen',
        value: formFields || 'Keine',
        inline: false
      });
    }

    // Sende DM an alle konfigurierten User
    let sentCount = 0;
    let failedCount = 0;

    for (const userId of dmRecipients) {
      try {
        const user = await client.users.fetch(userId);
        await user.send({ embeds: [embed] });
        sentCount++;
        console.log(`✅ DM-Benachrichtigung gesendet an ${user.tag} (${userId})`);
      } catch (err) {
        failedCount++;
        console.error(`❌ DM-Benachrichtigung fehlgeschlagen für User ${userId}:`, err.message);
      }
    }

    return {
      success: true,
      sentCount: sentCount,
      failedCount: failedCount,
      totalRecipients: dmRecipients.length
    };

  } catch (err) {
    console.error('DM-Notification Error:', err);
    return { success: false, reason: 'error', error: err.message };
  }
}

/**
 * Gibt die Liste der konfigurierten DM-Empfänger zurück
 * @param {string} guildId - Guild ID
 * @returns {Array<string>}
 */
function getDMRecipients(guildId) {
  const cfg = readCfg(guildId);
  return cfg.dmNotificationUsers || [];
}

/**
 * Setzt die Liste der DM-Empfänger
 * @param {string} guildId - Guild ID
 * @param {Array<string>} userIds - Array von User IDs
 */
function setDMRecipients(guildId, userIds) {
  const cfg = readCfg(guildId);
  cfg.dmNotificationUsers = userIds;
  writeCfg(guildId, cfg);
}

/**
 * Fügt einen DM-Empfänger hinzu
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 */
function addDMRecipient(guildId, userId) {
  const cfg = readCfg(guildId);
  if (!cfg.dmNotificationUsers) {
    cfg.dmNotificationUsers = [];
  }
  if (!cfg.dmNotificationUsers.includes(userId)) {
    cfg.dmNotificationUsers.push(userId);
    writeCfg(guildId, cfg);
    return true;
  }
  return false;
}

/**
 * Entfernt einen DM-Empfänger
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 */
function removeDMRecipient(guildId, userId) {
  const cfg = readCfg(guildId);
  if (!cfg.dmNotificationUsers) {
    return false;
  }
  const index = cfg.dmNotificationUsers.indexOf(userId);
  if (index > -1) {
    cfg.dmNotificationUsers.splice(index, 1);
    writeCfg(guildId, cfg);
    return true;
  }
  return false;
}

module.exports = {
  sendDMNotification,
  getDMRecipients,
  setDMRecipients,
  addDMRecipient,
  removeDMRecipient
};
