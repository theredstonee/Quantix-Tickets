const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { t } = require('../translations');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

function loadTickets(guildId) {
  const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
  if (!fs.existsSync(ticketsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
  fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2), 'utf8');
}

function readCfg(guildId) {
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  if (!fs.existsSync(cfgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function getAllTeamRoles(guildId) {
  const cfg = readCfg(guildId);
  const roles = new Set();

  // Legacy teamRoleId
  if (Array.isArray(cfg.teamRoleId)) {
    cfg.teamRoleId.forEach(r => r && roles.add(r));
  } else if (cfg.teamRoleId) {
    roles.add(cfg.teamRoleId);
  }

  // Priority roles
  if (cfg.priorityRoles) {
    Object.values(cfg.priorityRoles).forEach(roleList => {
      if (Array.isArray(roleList)) {
        roleList.forEach(r => r && roles.add(r));
      }
    });
  }

  return Array.from(roles);
}

function logEvent(guild, message) {
  const cfg = readCfg(guild.id);
  if (!cfg.logChannelId) return;

  const logChannel = guild.channels.cache.get(cfg.logChannelId);
  if (logChannel && logChannel.isTextBased()) {
    logChannel.send(message).catch(console.error);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('hide')
        .setDescription('Hide the ticket from all team members (claimer only)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unhide')
        .setDescription('Unhide the ticket and restore team access (claimer only)')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // Load tickets and find current ticket
    const log = loadTickets(guildId);
    const ticket = log.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      const noTicketEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Kein Ticket gefunden')
        .setDescription('**Für diesen Channel wurde kein Ticket-Datensatz gefunden.**')
        .setFooter({ text: 'Quantix Tickets • Fehler' })
        .setTimestamp();

      return interaction.reply({ embeds: [noTicketEmbed], ephemeral: true });
    }

    // Check if user is the claimer
    if (ticket.claimer !== interaction.user.id) {
      const notClaimerEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('🚫 Zugriff verweigert')
        .setDescription('**Nur der Claimer kann dieses Ticket verstecken/einblenden!**')
        .addFields(
          { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
          { name: '👤 Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
        )
        .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
        .setTimestamp();

      return interaction.reply({ embeds: [notClaimerEmbed], ephemeral: true });
    }

    if (subcommand === 'hide') {
      try {
        // Get all team roles
        const teamRoles = getAllTeamRoles(guildId);

        // Store hidden state in ticket
        ticket.hidden = true;
        ticket.hiddenAt = Date.now();
        ticket.hiddenBy = interaction.user.id;
        saveTickets(guildId, log);

        // Hide channel from all team roles
        for (const roleId of teamRoles) {
          await interaction.channel.permissionOverwrites.edit(roleId, {
            ViewChannel: false
          }).catch(err => console.error(`Failed to hide from role ${roleId}:`, err));
        }

        // Ensure creator, claimer, and added users can still see
        const allowedUsers = [ticket.userId, ticket.claimer];
        if (ticket.addedUsers) {
          allowedUsers.push(...ticket.addedUsers);
        }

        for (const userId of allowedUsers) {
          if (userId) {
            await interaction.channel.permissionOverwrites.edit(userId, {
              ViewChannel: true,
              SendMessages: true
            }).catch(err => console.error(`Failed to show for user ${userId}:`, err));
          }
        }

        const successEmbed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('🔒 Ticket versteckt')
          .setDescription('**Dieses Ticket ist jetzt für alle Team-Mitglieder unsichtbar.**')
          .addFields(
            { name: '👁️ Sichtbar für', value: 'Ersteller, Claimer und hinzugefügte Benutzer', inline: false },
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👤 Versteckt von', value: `<@${interaction.user.id}>`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Ticket versteckt' })
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

        // Log event
        logEvent(interaction.guild, `🔒 **Ticket versteckt:** <@${interaction.user.id}> hat Ticket #${ticket.id} versteckt`);

      } catch (err) {
        console.error('Fehler beim Verstecken:', err);

        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Fehler beim Verstecken')
          .setDescription('**Das Ticket konnte nicht versteckt werden.**')
          .addFields({
            name: '❗ Fehlerdetails',
            value: `\`\`\`${err.message}\`\`\``,
            inline: false
          })
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();

        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }

    if (subcommand === 'unhide') {
      try {
        // Check if ticket is actually hidden
        if (!ticket.hidden) {
          const notHiddenEmbed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle('ℹ️ Ticket bereits sichtbar')
            .setDescription('**Dieses Ticket ist bereits für alle Team-Mitglieder sichtbar.**')
            .addFields({
              name: '🎫 Ticket',
              value: `#${ticket.id}`,
              inline: true
            })
            .setFooter({ text: 'Quantix Tickets • Bereits sichtbar' })
            .setTimestamp();

          return interaction.reply({ embeds: [notHiddenEmbed], ephemeral: true });
        }

        // Get all team roles and priority-based roles
        const cfg = readCfg(guildId);
        const teamRoles = getAllTeamRoles(guildId);
        const priority = ticket.priority || 0;
        const priorityRoles = cfg.priorityRoles?.[priority.toString()] || [];

        // Remove hidden state from ticket
        ticket.hidden = false;
        ticket.unhiddenAt = Date.now();
        ticket.unhiddenBy = interaction.user.id;
        saveTickets(guildId, log);

        // Restore team role access based on priority
        const rolesToRestore = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
        if (priorityRoles.length > 0) {
          rolesToRestore.push(...priorityRoles);
        }

        for (const roleId of rolesToRestore) {
          if (roleId) {
            await interaction.channel.permissionOverwrites.edit(roleId, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true
            }).catch(err => console.error(`Failed to unhide for role ${roleId}:`, err));
          }
        }

        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('👁️ Ticket wieder sichtbar')
          .setDescription('**Dieses Ticket ist jetzt wieder für alle Team-Mitglieder sichtbar.**')
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👤 Eingeblendet von', value: `<@${interaction.user.id}>`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Ticket sichtbar' })
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed] });

        // Log event
        logEvent(interaction.guild, `👁️ **Ticket eingeblendet:** <@${interaction.user.id}> hat Ticket #${ticket.id} wieder sichtbar gemacht`);

      } catch (err) {
        console.error('Fehler beim Einblenden:', err);

        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Fehler beim Einblenden')
          .setDescription('**Das Ticket konnte nicht eingeblendet werden.**')
          .addFields({
            name: '❗ Fehlerdetails',
            value: `\`\`\`${err.message}\`\`\``,
            inline: false
          })
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();

        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
