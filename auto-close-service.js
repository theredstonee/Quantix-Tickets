const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { hasFeature } = require('./premium');
const { getGuildLanguage, t } = require('./translations');

const CONFIG_DIR = path.join(__dirname, 'configs');

function readCfg(guildId) {
  try {
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data || {};
  } catch {
    return {};
  }
}

function getTicketsPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

function loadTickets(guildId) {
  try {
    const ticketsPath = getTicketsPath(guildId);
    if (!fs.existsSync(ticketsPath)) return [];
    const data = fs.readFileSync(ticketsPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  try {
    const ticketsPath = getTicketsPath(guildId);
    fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving tickets:', err);
  }
}

function getLastActivity(ticket) {
  // Get the most recent activity timestamp
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
      // Check if guild has Pro and auto-close enabled
      if (!hasFeature(guildId, 'autoClose')) {
        continue;
      }

      const cfg = readCfg(guildId);
      if (!cfg.autoClose || !cfg.autoClose.enabled) {
        continue;
      }

      const inactiveDays = cfg.autoClose.inactiveDays || 7;
      const warningDays = cfg.autoClose.warningDays || 2;
      const excludePriority = cfg.autoClose.excludePriority || [];

      const inactiveMs = inactiveDays * 24 * 60 * 60 * 1000;
      const warningMs = warningDays * 24 * 60 * 60 * 1000;

      const tickets = loadTickets(guildId);
      const openTickets = tickets.filter(t => t.status === 'offen');

      for (const ticket of openTickets) {
        // Skip if priority is excluded
        if (excludePriority.includes(ticket.priority)) {
          continue;
        }

        const lastActivity = getLastActivity(ticket);
        const timeSinceActivity = now - lastActivity;

        // Check if ticket should be closed
        if (timeSinceActivity >= inactiveMs) {
          await closeInactiveTicket(client, guild, ticket, cfg, guildId);
        }
        // Check if warning should be sent
        else if (timeSinceActivity >= (inactiveMs - warningMs) && !ticket.autoCloseWarningSent) {
          await sendAutoCloseWarning(client, guild, ticket, cfg, guildId, warningDays);
        }
      }
    } catch (err) {
      console.error(`[Auto-Close] Error checking guild ${guildId}:`, err);
    }
  }

  console.log('[Auto-Close] Check completed');
}

async function sendAutoCloseWarning(client, guild, ticket, cfg, guildId, warningDays) {
  try {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) return;

    const lang = getGuildLanguage(guildId);
    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('⚠️ ' + t(guildId, 'autoClose.warning_title'))
      .setDescription(
        t(guildId, 'autoClose.warning_description', { days: warningDays })
      )
      .addFields(
        {
          name: t(guildId, 'autoClose.prevent_title'),
          value: t(guildId, 'autoClose.prevent_description'),
          inline: false
        }
      )
      .setFooter({ text: 'Quantix Tickets • Auto-Close Warnung' })
      .setTimestamp();

    await channel.send({
      content: `<@${ticket.userId}>`,
      embeds: [embed]
    });

    // Mark warning as sent
    ticket.autoCloseWarningSent = true;
    ticket.autoCloseWarningAt = Date.now();

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

async function closeInactiveTicket(client, guild, ticket, cfg, guildId) {
  try {
    const channel = await guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      // Channel doesn't exist, just mark as closed
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

    const lang = getGuildLanguage(guildId);
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
          name: '📅 Grund',
          value: t(guildId, 'autoClose.reason_inactivity'),
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
            .setTitle('🔐 Ticket automatisch geschlossen')
            .setDescription(
              `Dein Ticket wurde wegen Inaktivität automatisch geschlossen.\n\n` +
              `**Server:** ${guild.name}\n` +
              `**Ticket:** #${String(ticket.id).padStart(5, '0')}\n` +
              `**Thema:** ${ticket.topic}\n` +
              `**Grund:** Keine Aktivität seit ${cfg.autoClose.inactiveDays} Tagen`
            )
            .setFooter({ text: `Quantix Tickets • ${guild.name}` })
            .setTimestamp();

          await creator.send({ embeds: [dmEmbed] }).catch(() => {});
        }
      } catch (dmErr) {
        console.error('DM notification error on auto-close:', dmErr);
      }
    }

    // Delete channel after delay
    setTimeout(() => {
      channel.delete().catch(() => {});
    }, 5000);

    console.log(`[Auto-Close] Closed ticket #${ticket.id} in guild ${guildId} due to inactivity`);
  } catch (err) {
    console.error(`[Auto-Close] Error closing ticket ${ticket.id}:`, err);
  }
}

function startAutoCloseService(client) {
  console.log('[Auto-Close] Service started');

  // Check every hour
  const checkInterval = 60 * 60 * 1000; // 1 hour

  setInterval(() => {
    checkAutoClose(client);
  }, checkInterval);

  // Initial check after 5 minutes
  setTimeout(() => {
    checkAutoClose(client);
  }, 5 * 60 * 1000);
}

module.exports = {
  startAutoCloseService,
  checkAutoClose
};
