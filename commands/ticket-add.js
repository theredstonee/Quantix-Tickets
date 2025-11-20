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

function getTeamRole(guildId) {
  const cfg = readCfg(guildId);
  if (Array.isArray(cfg.teamRoleId)) {
    return cfg.teamRoleId.length > 0 ? cfg.teamRoleId[0] : null;
  }
  return cfg.teamRoleId || null;
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

function hasAnyTeamRole(member, guildId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const teamRoles = getAllTeamRoles(guildId);
  return teamRoles.some(roleId => member.roles.cache.has(roleId));
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
        .setName('add')
        .setDescription('Add a user to the current ticket')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user to add to the ticket')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      const guildId = interaction.guild.id;
      const targetUser = interaction.options.getUser('user');
      const targetMember = interaction.options.getMember('user');

      // Check if user is team member
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const TEAM_ROLE = getTeamRole(guildId);
        const teamRole = TEAM_ROLE ? await interaction.guild.roles.fetch(TEAM_ROLE).catch(() => null) : null;

        const noPermEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Zugriff verweigert')
          .setDescription('**Das hier darf nur das Team machen!**\n\nNur Team-Mitglieder können Benutzer zu Tickets hinzufügen.')
          .addFields({
            name: '🏷️ Benötigte Rolle',
            value: teamRole ? `<@&${TEAM_ROLE}>` : 'Team-Rolle nicht konfiguriert',
            inline: true
          })
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      // Check if target user is a member of the guild
      if (!targetMember) {
        const notMemberEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Benutzer nicht gefunden')
          .setDescription('**Dieser Benutzer ist nicht auf diesem Server.**')
          .addFields({
            name: '👤 User',
            value: `${targetUser.tag}`,
            inline: true
          })
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();

        return interaction.reply({ embeds: [notMemberEmbed], ephemeral: true });
      }

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

      // Initialize addedUsers array if not exists
      if (!ticket.addedUsers) ticket.addedUsers = [];

      // Check if user already has access
      if (ticket.addedUsers.includes(targetUser.id) || ticket.userId === targetUser.id || ticket.claimer === targetUser.id) {
        const alreadyAccessEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('ℹ️ Bereits vorhanden')
          .setDescription(`**<@${targetUser.id}> hat bereits Zugriff auf dieses Ticket.**`)
          .addFields(
            { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Zugriff bereits vorhanden' })
          .setTimestamp();

        return interaction.reply({ embeds: [alreadyAccessEmbed], ephemeral: true });
      }

      try {
        // Add user to ticket
        ticket.addedUsers.push(targetUser.id);
        saveTickets(guildId, log);

        // Update channel permissions
        await interaction.channel.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true,
          SendMessages: true
        });

        // Send ephemeral success message to team member
        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Benutzer hinzugefügt')
          .setDescription(`**<@${targetUser.id}> wurde erfolgreich zum Ticket hinzugefügt.**`)
          .addFields(
            { name: '👤 Hinzugefügt', value: `<@${targetUser.id}>`, inline: true },
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👥 Von', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Benutzer hinzugefügt' })
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

        // Send public announcement in ticket channel
        const publicEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('👥 Neuer Benutzer hinzugefügt')
          .setDescription(`<@${targetUser.id}> wurde von <@${interaction.user.id}> zum Ticket hinzugefügt und kann nun hier schreiben.`)
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '⏰ Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets' })
          .setTimestamp();

        await interaction.channel.send({ embeds: [publicEmbed] });

        // Log event
        logEvent(interaction.guild, t(guildId, 'logs.user_added', { user: `<@${targetUser.id}>`, id: ticket.id }));

      } catch (err) {
        console.error('Fehler beim Hinzufügen:', err);

        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Fehler beim Hinzufügen')
          .setDescription(
            '**Der Benutzer konnte nicht hinzugefügt werden.**\n\n' +
            'Mögliche Gründe:\n' +
            '`•` Bot hat keine Berechtigung, Channel-Permissions zu ändern\n' +
            '`•` Technischer Fehler beim Speichern'
          )
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
