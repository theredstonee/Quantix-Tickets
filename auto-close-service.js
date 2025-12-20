const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { getGuildLanguage, t } = require('./translations');
const { readCfg, loadTickets, saveTickets } = require('./database');


function getLastActivity(ticket) {
  // Prüfe ob Auto-Close Timer manuell zurückgesetzt wurde
  if (ticket.autoCloseResetAt) {
    return ticket.autoCloseResetAt;
  }

  // Prüfe lastMessageAt für letzte Nachricht
  if (ticket.lastMessageAt) {
    return ticket.lastMessageAt;
  }

  // Check statusHistory first, then fall back to timestamp
  if (ticket.statusHistory && ticket.statusHistory.length > 0) {
    const lastStatus = ticket.statusHistory[ticket.statusHistory.length - 1];
    return lastStatus.timestamp || ticket.timestamp;
  }
  return ticket.timestamp || Date.now();
}

async function checkAutoClose(client) {
  console.log('[Auto-Close] Starting check...');

  const guilds = client.guilds.cache;
  const now = Date.now();

  for (const [guildId, guild] of guilds) {
    try {
      const cfg = readCfg(guildId);
      if (!cfg.autoClose || !cfg.autoClose.enabled) {
        continue;
      }

      // Zeit in Stunden (Standard: 72h = 3 Tage)
      const inactiveHours = cfg.autoClose.inactiveHours || 72;
      const excludePriority = cfg.autoClose.excludePriority || [];

      // Konvertiere zu Millisekunden
      const inactiveMs = inactiveHours * 60 * 60 * 1000;
      const warningMs = 24 * 60 * 60 * 1000; // Warnung immer 24h vorher

      const tickets = loadTickets(guildId);
      // Prüfe beide Status: 'offen' für Tickets und 'open' für Bewerbungen
      const openTickets = tickets.filter(t => t.status === 'offen' || t.status === 'open');

      for (const ticket of openTickets) {
        // Skip wenn Auto-Close für dieses Ticket deaktiviert wurde
        if (ticket.autoCloseDisabled) {
          continue;
        }

        // Skip wenn Auto-Close pausiert ist
        if (ticket.autoClosePaused) {
          continue;
        }

        // Skip wenn Priority ausgeschlossen
        if (excludePriority.includes(ticket.priority)) {
          continue;
        }

        const lastActivity = getLastActivity(ticket);
        const timeSinceActivity = now - lastActivity;

        // Check ob Ticket geschlossen werden soll
        if (timeSinceActivity >= inactiveMs) {
          await closeInactiveTicket(client, guild, ticket, cfg, guildId, inactiveHours);
        }
        // Check ob Warnung gesendet werden soll (24h vor Schließung)
        else if (timeSinceActivity >= (inactiveMs - warningMs) && !ticket.autoCloseWarningSent) {
          await sendAutoCloseWarning(client, guild, ticket, cfg, guildId, inactiveHours);
        }
      }
    } catch (err) {
      console.error(`[Auto-Close] Error checking guild ${guildId}:`, err);
    }
  }

  console.log('[Auto-Close] Check completed');
}

async function sendAutoCloseWarning(client, guild, ticket, cfg, guildId, inactiveHours) {
  try {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) return;

    // Berechne verbleibende Zeit (24h)
    const hoursRemaining = 24;
    const ticketType = ticket.isApplication ? 'Bewerbung' : 'Ticket';
    const ticketTypeEmoji = ticket.isApplication ? '📋' : '🎫';

    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('⚠️ ' + t(guildId, 'autoClose.warning_title'))
      .setDescription(
        t(guildId, 'autoClose.warning_description_hours', { hours: hoursRemaining }) ||
        `Diese ${ticketType} wird in **${hoursRemaining} Stunden** automatisch geschlossen, wenn keine weitere Aktivität stattfindet.`
      )
      .addFields(
        {
          name: t(guildId, 'autoClose.prevent_title'),
          value: t(guildId, 'autoClose.prevent_description') + '\n\nOder verwende `/ticket pause` um den Timer zu pausieren.',
          inline: false
        },
        {
          name: '⏰ ' + (t(guildId, 'autoClose.time_remaining') || 'Verbleibende Zeit'),
          value: `${hoursRemaining} ${t(guildId, 'autoClose.hours') || 'Stunden'}`,
          inline: true
        },
        {
          name: '📊 ' + (t(guildId, 'autoClose.inactivity_limit') || 'Inaktivitäts-Limit'),
          value: `${inactiveHours} ${t(guildId, 'autoClose.hours') || 'Stunden'}`,
          inline: true
        },
        {
          name: ticketTypeEmoji + ' Typ',
          value: ticketType,
          inline: true
        }
      )
      .setFooter({ text: 'Quantix Tickets • Auto-Close' })
      .setTimestamp();

    // Abbrechen-Button + Pause-Button
    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_auto_close_${ticket.id}`)
      .setLabel(t(guildId, 'autoClose.cancel_button') || 'Auto-Close abbrechen')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger);

    const pauseButton = new ButtonBuilder()
      .setCustomId(`pause_auto_close_${ticket.id}`)
      .setLabel('Timer pausieren')
      .setEmoji('⏸️')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(cancelButton, pauseButton);

    const warningMessage = await channel.send({
      content: `<@${ticket.userId}>`,
      embeds: [embed],
      components: [row]
    });

    // Mark warning as sent und speichere Message-ID
    ticket.autoCloseWarningSent = true;
    ticket.autoCloseWarningAt = Date.now();
    ticket.autoCloseWarningMessageId = warningMessage.id;

    const tickets = loadTickets(guildId);
    const index = tickets.findIndex(t => t.id === ticket.id);
    if (index !== -1) {
      tickets[index] = ticket;
      saveTickets(guildId, tickets);
    }

    console.log(`[Auto-Close] Warning sent for ticket #${ticket.id} in guild ${guildId}`);
  } catch (err) {
    console.error(`[Auto-Close] Error sending warning for ticket ${ticket.id}:`, err);
  }
}

async function closeInactiveTicket(client, guild, ticket, cfg, guildId, inactiveHours) {
  try {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      // Channel existiert nicht, nur als geschlossen markieren
      ticket.status = 'geschlossen';
      ticket.closedAt = Date.now();
      ticket.closedBy = 'auto-close';
      if (!ticket.statusHistory) ticket.statusHistory = [];
      ticket.statusHistory.push({
        status: 'geschlossen',
        timestamp: Date.now(),
        userId: 'auto-close',
        reason: 'inactivity'
      });

      const tickets = loadTickets(guildId);
      const index = tickets.findIndex(t => t.id === ticket.id);
      if (index !== -1) {
        tickets[index] = ticket;
        saveTickets(guildId, tickets);
      }
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4444)
      .setTitle('🔐 ' + t(guildId, 'autoClose.closed_title'))
      .setDescription(t(guildId, 'autoClose.closed_description'))
      .addFields(
        {
          name: '🎫 Ticket',
          value: `#${String(ticket.id).padStart(5, '0')}`,
          inline: true
        },
        {
          name: '📅 ' + (t(guildId, 'autoClose.reason') || 'Grund'),
          value: t(guildId, 'autoClose.reason_inactivity'),
          inline: true
        },
        {
          name: '⏰ ' + (t(guildId, 'autoClose.inactive_for') || 'Inaktiv seit'),
          value: `${inactiveHours} ${t(guildId, 'autoClose.hours') || 'Stunden'}`,
          inline: true
        }
      )
      .setFooter({ text: 'Quantix Tickets • Auto-Close' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Update ticket status
    ticket.status = 'geschlossen';
    ticket.closedAt = Date.now();
    ticket.closedBy = 'auto-close';
    if (!ticket.statusHistory) ticket.statusHistory = [];
    ticket.statusHistory.push({
      status: 'geschlossen',
      timestamp: Date.now(),
      userId: 'auto-close',
      reason: 'inactivity'
    });

    const tickets = loadTickets(guildId);
    const index = tickets.findIndex(t => t.id === ticket.id);
    if (index !== -1) {
      tickets[index] = ticket;
      saveTickets(guildId, tickets);
    }

    // Send DM to creator if enabled
    if (cfg.notifyUserOnStatusChange !== false) {
      try {
        const creator = await client.users.fetch(ticket.userId).catch(() => null);
        if (creator) {
          const dmEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🔐 ' + (t(guildId, 'autoClose.dm_title') || 'Ticket automatisch geschlossen'))
            .setDescription(
              (t(guildId, 'autoClose.dm_description', {
                server: guild.name,
                ticketId: String(ticket.id).padStart(5, '0'),
                topic: ticket.topic,
                hours: inactiveHours
              }) ||
              `Dein Ticket wurde wegen Inaktivität automatisch geschlossen.\n\n` +
              `**Server:** ${guild.name}\n` +
              `**Ticket:** #${String(ticket.id).padStart(5, '0')}\n` +
              `**Thema:** ${ticket.topic}\n` +
              `**Grund:** Keine Aktivität seit ${inactiveHours} Stunden`)
            )
            .setFooter({ text: `Quantix Tickets • ${guild.name}` })
            .setTimestamp();

          await creator.send({ embeds: [dmEmbed] }).catch(() => {});
        }
      } catch (dmErr) {
        console.error('DM notification error on auto-close:', dmErr);
      }
    }

    // Archive or Delete channel after delay
    setTimeout(async () => {
      if (cfg.archiveEnabled && cfg.archiveCategoryId) {
        try {
          await channel.setParent(cfg.archiveCategoryId, {
            lockPermissions: false
          });

          const newName = `closed-${channel.name}`;
          await channel.setName(newName);

          console.log(`[Auto-Close] Ticket #${ticket.id} archived`);
        } catch (err) {
          console.error('Error archiving (Auto-Close):', err);
          await channel.delete().catch(() => {});
        }
      } else {
        await channel.delete().catch(() => {});
      }
    }, 5000);

    console.log(`[Auto-Close] Closed ticket #${ticket.id} in guild ${guildId} due to inactivity`);
  } catch (err) {
    console.error(`[Auto-Close] Error closing ticket ${ticket.id}:`, err);
  }
}

// Funktion zum Abbrechen/Zurücksetzen des Auto-Close Timers
async function cancelAutoClose(guildId, ticketId, userId) {
  try {
    const tickets = loadTickets(guildId);
    const index = tickets.findIndex(t => t.id === ticketId || t.id === parseInt(ticketId));

    if (index === -1) {
      return { success: false, error: 'Ticket nicht gefunden' };
    }

    const ticket = tickets[index];

    // Reset Auto-Close Timer
    ticket.autoCloseWarningSent = false;
    ticket.autoCloseWarningAt = null;
    ticket.autoCloseWarningMessageId = null;
    ticket.autoCloseResetAt = Date.now();
    ticket.autoCloseResetBy = userId;

    // Speichere in Status-History
    if (!ticket.statusHistory) ticket.statusHistory = [];
    ticket.statusHistory.push({
      action: 'auto_close_cancelled',
      timestamp: Date.now(),
      userId: userId
    });

    tickets[index] = ticket;
    saveTickets(guildId, tickets);

    return { success: true, ticket };
  } catch (err) {
    console.error('[Auto-Close] Error cancelling:', err);
    return { success: false, error: err.message };
  }
}

function startAutoCloseService(client) {
  console.log('[Auto-Close] Service started');

  // Check every 30 minutes (for better accuracy with hours)
  const checkInterval = 30 * 60 * 1000; // 30 minutes

  setInterval(() => {
    checkAutoClose(client);
  }, checkInterval);

  // Initial check after 2 minutes
  setTimeout(() => {
    checkAutoClose(client);
  }, 2 * 60 * 1000);
}

module.exports = {
  startAutoCloseService,
  checkAutoClose,
  cancelAutoClose,
  loadTickets,
  saveTickets
};
