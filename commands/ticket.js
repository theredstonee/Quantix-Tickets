const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { t } = require('../translations');
const { hasFeature, isPremium } = require('../premium');

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

function getCounterPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_counter.json`);
}

function nextTicket(guildId) {
  const counterPath = getCounterPath(guildId);
  if (!fs.existsSync(counterPath)) {
    fs.writeFileSync(counterPath, JSON.stringify({ last: 0 }, null, 2), 'utf8');
  }
  const counter = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
  counter.last++;
  fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2), 'utf8');
  return counter.last;
}

function getPriorityRoles(guildId, priority) {
  const cfg = readCfg(guildId);
  if (!cfg.priorityRoles) return [];
  const roles = cfg.priorityRoles[priority.toString()];
  return Array.isArray(roles) ? roles : [];
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
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('hide')
        .setDescription('Hide the ticket from all team members (claimer only)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unhide')
        .setDescription('Unhide the ticket and restore team access (claimer only)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('split')
        .setDescription('Split ticket into a new ticket')
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason/topic for the new ticket')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('open-as')
        .setDescription('Open a ticket on behalf of another user (Team only)')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The user who will be the ticket creator')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('topic')
            .setDescription('Ticket topic/reason')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('blacklist-add')
        .setDescription('Add a user to the ticket blacklist')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to blacklist')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for blacklisting')
            .setRequired(true))
        .addBooleanOption(option =>
          option
            .setName('permanent')
            .setDescription('Permanent blacklist (default: true)')
            .setRequired(false))
        .addIntegerOption(option =>
          option
            .setName('days')
            .setDescription('Days to blacklist (if not permanent)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('blacklist-remove')
        .setDescription('Remove a user from the ticket blacklist')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to unblacklist')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('blacklist-list')
        .setDescription('List all blacklisted users'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('blacklist-check')
        .setDescription('Check if a user is blacklisted')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to check')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('forward')
        .setDescription('Forward ticket to another team member or role')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to forward the ticket to')
            .setRequired(false))
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to forward the ticket to')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('note-add')
        .setDescription('Add an internal note to this ticket (team only)')
        .addStringOption(option =>
          option
            .setName('note')
            .setDescription('The note content')
            .setRequired(true)
            .setMaxLength(1000)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('note-list')
        .setDescription('List all internal notes for this ticket (team only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('tag-add')
        .setDescription('Add a tag to this ticket (Premium)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('tag-remove')
        .setDescription('Remove a tag from this ticket (Premium)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('tag-list')
        .setDescription('List all available tags (Premium)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('department-forward')
        .setDescription('Forward ticket to another department (Premium)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('department-list')
        .setDescription('List all departments (Premium)')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ===== SUBCOMMAND: ADD =====
    if (subcommand === 'add') {
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

    // ===== SUBCOMMAND: HIDE =====
    if (subcommand === 'hide') {
      // Defer reply immediately to prevent timeout
      await interaction.deferReply();

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

        return interaction.editReply({ embeds: [noTicketEmbed] });
      }

      // Check if user is the claimer
      if (ticket.claimer !== interaction.user.id) {
        const notClaimerEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Zugriff verweigert')
          .setDescription('**Nur der Claimer kann dieses Ticket verstecken!**')
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👤 Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return interaction.editReply({ embeds: [notClaimerEmbed] });
      }

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

        await interaction.editReply({ embeds: [successEmbed] });

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

        return interaction.editReply({ embeds: [errorEmbed] });
      }
    }

    // ===== SUBCOMMAND: UNHIDE =====
    if (subcommand === 'unhide') {
      // Defer reply immediately to prevent timeout
      await interaction.deferReply();

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

        return interaction.editReply({ embeds: [noTicketEmbed] });
      }

      // Check if user is the claimer
      if (ticket.claimer !== interaction.user.id) {
        const notClaimerEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Zugriff verweigert')
          .setDescription('**Nur der Claimer kann dieses Ticket einblenden!**')
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👤 Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return interaction.editReply({ embeds: [notClaimerEmbed] });
      }

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

          return interaction.editReply({ embeds: [notHiddenEmbed] });
        }

        // Get all team roles and priority-based roles
        const cfg = readCfg(guildId);
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

        await interaction.editReply({ embeds: [successEmbed] });

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

        return interaction.editReply({ embeds: [errorEmbed] });
      }
    }

    // ===== SUBCOMMAND: SPLIT =====
    if (subcommand === 'split') {
      const reason = interaction.options.getString('reason');

      // Check if user is team member
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Zugriff verweigert')
          .setDescription('**Nur Team-Mitglieder können Tickets splitten!**')
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
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

      await interaction.deferReply();

      try {
        const cfg = readCfg(guildId);

        // Load counter
        const counterPath = path.join(CONFIG_DIR, `${guildId}_counter.json`);
        let counter = { count: 0 };
        if (fs.existsSync(counterPath)) {
          counter = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
        }
        counter.count++;
        fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2));

        const newTicketNumber = counter.count;
        const channelName = `ticket-${newTicketNumber}`;

        // Create new channel
        const newChannel = await interaction.guild.channels.create({
          name: channelName,
          type: 0, // Text channel
          parent: interaction.channel.parentId,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: ['ViewChannel']
            },
            {
              id: ticket.userId,
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
            },
            {
              id: interaction.user.id,
              allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
            }
          ]
        });

        // Add team roles permissions
        const teamRoles = getAllTeamRoles(guildId);
        for (const roleId of teamRoles) {
          await newChannel.permissionOverwrites.edit(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }).catch(() => {});
        }

        // Create new ticket record
        const newTicket = {
          id: newTicketNumber,
          channelId: newChannel.id,
          userId: ticket.userId,
          topic: reason,
          status: 'open',
          claimed: true,
          claimer: interaction.user.id,
          priority: ticket.priority || 0,
          createdAt: new Date().toISOString(),
          splitFrom: ticket.id,
          addedUsers: ticket.addedUsers || []
        };

        // Link back in original ticket
        if (!ticket.splitTo) ticket.splitTo = [];
        ticket.splitTo.push(newTicketNumber);

        log.push(newTicket);
        saveTickets(guildId, log);

        // Send embed in new channel
        const newTicketEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🔀 Ticket #${newTicketNumber} (Split)`)
          .setDescription(
            `Dieses Ticket wurde aus **Ticket #${ticket.id}** abgespalten.\n\n` +
            `**Grund:** ${reason}\n\n` +
            `**Ursprüngliches Ticket:** <#${ticket.channelId}>\n` +
            `**Ersteller:** <@${ticket.userId}>`
          )
          .addFields(
            { name: '👤 Split von', value: `<@${interaction.user.id}>`, inline: true },
            { name: '⏰ Erstellt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Ticket Split' })
          .setTimestamp();

        await newChannel.send({ content: `<@${ticket.userId}>`, embeds: [newTicketEmbed] });

        // Notify in original ticket
        const splitNotifyEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🔀 Ticket wurde gesplittet')
          .setDescription(
            `Ein neues Ticket wurde aus diesem Ticket erstellt.\n\n` +
            `**Neues Ticket:** <#${newChannel.id}> (#${newTicketNumber})\n` +
            `**Grund:** ${reason}`
          )
          .addFields(
            { name: '👤 Gesplittet von', value: `<@${interaction.user.id}>`, inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Ticket Split' })
          .setTimestamp();

        await interaction.editReply({ embeds: [splitNotifyEmbed] });

        // Log event
        logEvent(interaction.guild, `🔀 **Ticket gesplittet:** <@${interaction.user.id}> hat Ticket #${ticket.id} in #${newTicketNumber} aufgeteilt (Grund: ${reason})`);

      } catch (err) {
        console.error('Fehler beim Splitten:', err);

        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Fehler beim Splitten')
          .setDescription('**Das Ticket konnte nicht gesplittet werden.**')
          .addFields({
            name: '❗ Fehlerdetails',
            value: `\`\`\`${err.message}\`\`\``,
            inline: false
          })
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
      }
    }

    // ===== SUBCOMMAND: OPEN-AS =====
    if (subcommand === 'open-as') {
      // Check if user is team member
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Zugriff verweigert')
          .setDescription('**Nur Team-Mitglieder können Tickets für andere Nutzer erstellen!**')
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      const targetUser = interaction.options.getUser('user');
      const topicString = interaction.options.getString('topic');
      const cfg = readCfg(guildId);

      await interaction.deferReply({ ephemeral: true });

      try {
        // Generate ticket number
        const ticketNumber = nextTicket(guildId);

        // Determine category
        let parentId = null;
        const categoryIds = Array.isArray(cfg.ticketCategoryId)
          ? cfg.ticketCategoryId
          : (cfg.ticketCategoryId ? [cfg.ticketCategoryId] : []);

        if (categoryIds.length > 0 && categoryIds[0]) {
          try {
            const category = await interaction.guild.channels.fetch(categoryIds[0].trim());
            if (category && category.type === ChannelType.GuildCategory) {
              parentId = category.id;
            }
          } catch {
            console.error('Kategorie nicht gefunden:', categoryIds[0]);
          }
        }

        // Set up permissions
        const permOverwrites = [
          { id: interaction.guild.id, deny: PermissionsBitField.Flags.ViewChannel },
          { id: targetUser.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        // Add team roles
        const TEAM_ROLE = getTeamRole(guildId);
        if (TEAM_ROLE && TEAM_ROLE.trim()) {
          try {
            await interaction.guild.roles.fetch(TEAM_ROLE);
            permOverwrites.push({
              id: TEAM_ROLE,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            });
          } catch {
            console.error('Team-Rolle nicht gefunden:', TEAM_ROLE);
          }
        }

        // Add priority 0 roles
        const priorityRoles = getPriorityRoles(guildId, 0);
        for (const roleId of priorityRoles) {
          if (roleId && roleId.trim() && roleId !== TEAM_ROLE) {
            try {
              await interaction.guild.roles.fetch(roleId);
              permOverwrites.push({
                id: roleId,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
              });
            } catch {
              console.error('Priority-Rolle nicht gefunden:', roleId);
            }
          }
        }

        // Create channel
        const channelName = `ticket-${ticketNumber}`;
        const newChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parentId,
          permissionOverwrites: permOverwrites
        });

        // Create ticket embed (same format as normal tickets)
        const ticketEmbedConfig = cfg.ticketEmbed || {};
        const title = ticketEmbedConfig.title
          ? ticketEmbedConfig.title.replace(/\{ticketNumber\}/g, ticketNumber)
          : `🎫 Ticket #${ticketNumber}`;

        const description = ticketEmbedConfig.description
          ? ticketEmbedConfig.description
              .replace(/\{ticketNumber\}/g, ticketNumber)
              .replace(/\{userMention\}/g, `<@${targetUser.id}>`)
              .replace(/\{userId\}/g, targetUser.id)
              .replace(/\{topicLabel\}/g, topicString)
              .replace(/\{topicValue\}/g, topicString)
          : `<@${targetUser.id}>`;

        const ticketEmbed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description);

        // Set color from config
        if (ticketEmbedConfig.color && /^#?[0-9a-fA-F]{6}$/.test(ticketEmbedConfig.color)) {
          ticketEmbed.setColor(parseInt(ticketEmbedConfig.color.replace('#', ''), 16));
        }

        // Set footer from config
        if (ticketEmbedConfig.footer) {
          ticketEmbed.setFooter({ text: ticketEmbedConfig.footer.replace(/\{ticketNumber\}/g, ticketNumber) });
        }

        // Add custom avatar if configured
        if (cfg.customAvatarUrl) {
          const avatarUrl = cfg.customAvatarUrl.startsWith('/')
            ? `${process.env.BASE_URL || 'https://tickets.quantix-bot.de'}${cfg.customAvatarUrl}`
            : cfg.customAvatarUrl;
          ticketEmbed.setAuthor({ name: interaction.guild.name, iconURL: avatarUrl });
        }

        // Create button rows (same as normal ticket)
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('request_close')
            .setEmoji('📩')
            .setLabel('Schließen anfordern')
            .setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close')
            .setEmoji('🔐')
            .setLabel('Schließen')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('priority_down')
            .setEmoji('⬇️')
            .setLabel('Priorität ↓')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('priority_up')
            .setEmoji('⬆️')
            .setLabel('Priorität ↑')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('claim')
            .setEmoji('✨')
            .setLabel('Übernehmen')
            .setStyle(ButtonStyle.Success)
        );

        const row3 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('add_user')
            .setEmoji('👥')
            .setLabel('Benutzer hinzufügen')
            .setStyle(ButtonStyle.Secondary)
        );

        await newChannel.send({
          content: `<@${targetUser.id}>`,
          embeds: [ticketEmbed],
          components: [row1, row2, row3]
        });

        // Save ticket data
        const tickets = loadTickets(guildId);
        tickets.push({
          id: ticketNumber,
          channelId: newChannel.id,
          userId: targetUser.id,
          topic: topicString,
          status: 'offen',
          priority: 0,
          timestamp: Date.now(),
          formData: {},
          addedUsers: [interaction.user.id], // Add command executor as added user
          notes: [],
          openedBy: interaction.user.id // Track who opened it on behalf
        });
        saveTickets(guildId, tickets);

        // Reply to command executor
        const successEmbed = new EmbedBuilder()
          .setColor(0x10b981)
          .setTitle('✅ Ticket erstellt')
          .setDescription(
            `**Ticket #${ticketNumber}** wurde erfolgreich für <@${targetUser.id}> erstellt.\n\n` +
            `**Channel:** ${newChannel}\n` +
            `**Thema:** ${topicString}`
          )
          .setFooter({ text: 'Quantix Tickets • Erfolgreich erstellt' })
          .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });

        // Log event
        logEvent(
          interaction.guild,
          `🎫 **Ticket für Nutzer erstellt:** <@${interaction.user.id}> hat Ticket #${ticketNumber} für <@${targetUser.id}> erstellt (Thema: ${topicString})`
        );

      } catch (err) {
        console.error('Fehler beim Erstellen des Tickets:', err);

        const errorEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Fehler beim Erstellen')
          .setDescription('**Das Ticket konnte nicht erstellt werden.**')
          .addFields({
            name: '❗ Fehlerdetails',
            value: `\`\`\`${err.message}\`\`\``,
            inline: false
          })
          .setFooter({ text: 'Quantix Tickets • Fehler' })
          .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
      }
    }

    // ===== SUBCOMMAND: BLACKLIST-ADD =====
    if (subcommand === 'blacklist-add') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const isPermanent = interaction.options.getBoolean('permanent') !== false;
      const days = interaction.options.getInteger('days') || null;

      const cfg = readCfg(guildId);
      if (!cfg.ticketBlacklist) {
        cfg.ticketBlacklist = [];
      }

      if (cfg.ticketBlacklist.find(b => b.userId === user.id)) {
        return interaction.reply({
          content: `❌ ${user.tag} ist bereits auf der Blacklist.`,
          ephemeral: true
        });
      }

      const blacklistEntry = {
        userId: user.id,
        username: user.tag,
        reason: reason,
        isPermanent: isPermanent,
        blacklistedAt: new Date().toISOString(),
        blacklistedBy: interaction.user.id,
        expiresAt: isPermanent ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      };

      cfg.ticketBlacklist.push(blacklistEntry);

      // Save config
      const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');

      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('🚫 User zur Blacklist hinzugefügt')
        .setDescription(`${user} wurde zur Ticket-Blacklist hinzugefügt.`)
        .addFields(
          { name: '👤 User', value: `${user} (${user.id})`, inline: true },
          { name: '📝 Grund', value: reason, inline: true },
          {
            name: '⏰ Dauer',
            value: isPermanent ? '♾️ Permanent' : `${days} Tage`,
            inline: true
          },
          { name: '👮 Von', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Try to send DM
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('🚫 Ticket-Blacklist')
          .setDescription(`Du wurdest auf **${interaction.guild.name}** zur Ticket-Blacklist hinzugefügt.`)
          .addFields(
            { name: '📝 Grund', value: reason, inline: false },
            {
              name: '⏰ Dauer',
              value: isPermanent ? '♾️ Permanent' : `${days} Tage`,
              inline: false
            }
          )
          .setTimestamp();

        await user.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (err) {}
    }

    // ===== SUBCOMMAND: BLACKLIST-REMOVE =====
    if (subcommand === 'blacklist-remove') {
      const user = interaction.options.getUser('user');

      const cfg = readCfg(guildId);
      if (!cfg.ticketBlacklist) {
        cfg.ticketBlacklist = [];
      }

      const index = cfg.ticketBlacklist.findIndex(b => b.userId === user.id);
      if (index === -1) {
        return interaction.reply({
          content: `❌ ${user.tag} ist nicht auf der Blacklist.`,
          ephemeral: true
        });
      }

      cfg.ticketBlacklist.splice(index, 1);

      // Save config
      const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('✅ User von Blacklist entfernt')
        .setDescription(`${user} wurde von der Ticket-Blacklist entfernt.`)
        .addFields(
          { name: '👤 User', value: `${user} (${user.id})`, inline: true },
          { name: '👮 Von', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Try to send DM
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Blacklist aufgehoben')
          .setDescription(`Du wurdest auf **${interaction.guild.name}** von der Ticket-Blacklist entfernt.`)
          .setTimestamp();

        await user.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (err) {}
    }

    // ===== SUBCOMMAND: BLACKLIST-LIST =====
    if (subcommand === 'blacklist-list') {
      const cfg = readCfg(guildId);
      if (!cfg.ticketBlacklist) {
        cfg.ticketBlacklist = [];
      }

      if (cfg.ticketBlacklist.length === 0) {
        return interaction.reply({
          content: '✅ Die Ticket-Blacklist ist leer.',
          ephemeral: true
        });
      }

      const now = new Date();
      const activeBlacklists = cfg.ticketBlacklist.filter(b => {
        if (b.isPermanent) return true;
        return new Date(b.expiresAt) > now;
      });

      if (activeBlacklists.length === 0) {
        return interaction.reply({
          content: '✅ Die Ticket-Blacklist ist leer (abgelaufene Einträge wurden bereinigt).',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('🚫 Ticket-Blacklist')
        .setDescription(`**${activeBlacklists.length}** User auf der Blacklist:`)
        .setTimestamp();

      const fields = activeBlacklists.slice(0, 25).map((bl, index) => {
        const expiryText = bl.isPermanent
          ? '♾️ Permanent'
          : `<t:${Math.floor(new Date(bl.expiresAt).getTime() / 1000)}:R>`;

        return {
          name: `${index + 1}. ${bl.username}`,
          value: `**ID:** ${bl.userId}\n**Grund:** ${bl.reason}\n**Läuft ab:** ${expiryText}`,
          inline: false
        };
      });

      embed.addFields(fields);

      if (activeBlacklists.length > 25) {
        embed.setFooter({ text: `Zeige erste 25 von ${activeBlacklists.length} Einträgen` });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ===== SUBCOMMAND: BLACKLIST-CHECK =====
    if (subcommand === 'blacklist-check') {
      const user = interaction.options.getUser('user');

      const cfg = readCfg(guildId);
      if (!cfg.ticketBlacklist) {
        cfg.ticketBlacklist = [];
      }

      const blacklist = cfg.ticketBlacklist.find(b => b.userId === user.id);

      if (!blacklist) {
        return interaction.reply({
          content: `✅ ${user.tag} ist nicht auf der Blacklist.`,
          ephemeral: true
        });
      }

      if (!blacklist.isPermanent && new Date(blacklist.expiresAt) <= new Date()) {
        cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== user.id);

        // Save config
        const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');

        return interaction.reply({
          content: `✅ ${user.tag} war auf der Blacklist, aber der Eintrag ist abgelaufen und wurde entfernt.`,
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('🚫 User ist auf der Blacklist')
        .setDescription(`${user} ist auf der Ticket-Blacklist.`)
        .addFields(
          { name: '👤 User', value: `${user} (${user.id})`, inline: true },
          { name: '📝 Grund', value: blacklist.reason, inline: true },
          {
            name: '⏰ Dauer',
            value: blacklist.isPermanent
              ? '♾️ Permanent'
              : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`,
            inline: true
          },
          { name: '👮 Hinzugefügt von', value: `<@${blacklist.blacklistedBy}>`, inline: true },
          { name: '📅 Hinzugefügt am', value: `<t:${Math.floor(new Date(blacklist.blacklistedAt).getTime() / 1000)}:F>`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ===== SUBCOMMAND: FORWARD =====
    if (subcommand === 'forward') {
      const targetUser = interaction.options.getUser('user');
      const targetRole = interaction.options.getRole('role');

      if (!targetUser && !targetRole) {
        return interaction.reply({
          content: '❌ Du musst entweder einen Benutzer oder eine Rolle angeben.',
          ephemeral: true
        });
      }

      const premiumInfo = isPremium(guildId, 'pro');
      if (!premiumInfo) {
        return interaction.reply({
          content: '⚠️ **Premium Feature**\n\nDie Ticket-Weiterleitung ist ein Pro-Feature. Upgrade auf Pro, um diese Funktion zu nutzen!\n\nhttps://tickets.quantix-bot.de/premium',
          ephemeral: true
        });
      }

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        return interaction.reply({
          content: '❌ Dieser Channel ist kein aktives Ticket.',
          ephemeral: true
        });
      }

      if (ticket.closed) {
        return interaction.reply({
          content: '❌ Dieses Ticket ist bereits geschlossen.',
          ephemeral: true
        });
      }

      if (!ticket.claimer || ticket.claimer === '') {
        return interaction.reply({
          content: '❌ Dieses Ticket muss zuerst geclaimed werden.',
          ephemeral: true
        });
      }

      if (String(ticket.claimer) !== String(interaction.user.id)) {
        return interaction.reply({
          content: `❌ Nur der aktuelle Claimer kann dieses Ticket weiterleiten.\n\nAktueller Claimer: <@${ticket.claimer}>`,
          ephemeral: true
        });
      }

      if (targetUser) {
        if (targetUser.id === interaction.user.id) {
          return interaction.reply({
            content: '❌ Du kannst das Ticket nicht an dich selbst weiterleiten.',
            ephemeral: true
          });
        }

        if (targetUser.id === ticket.userId) {
          return interaction.reply({
            content: '❌ Du kannst das Ticket nicht an den Ticket-Ersteller weiterleiten.',
            ephemeral: true
          });
        }

        if (targetUser.bot) {
          return interaction.reply({
            content: '❌ Du kannst das Ticket nicht an einen Bot weiterleiten.',
            ephemeral: true
          });
        }
      }

      const targetId = targetUser ? targetUser.id : targetRole.id;
      const targetType = targetUser ? 'user' : 'role';

      const modal = new ModalBuilder()
        .setCustomId(`forward_modal_${targetType}_${targetId}`)
        .setTitle('Ticket weiterleiten');

      const reasonInput = new TextInputBuilder()
        .setCustomId('forward_reason')
        .setLabel('Grund für die Weiterleitung')
        .setPlaceholder('Bitte gib den Grund für die Weiterleitung ein...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(500);

      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    // ===== SUBCOMMAND: NOTE-ADD =====
    if (subcommand === 'note-add') {
      const member = interaction.member;

      if (!hasAnyTeamRole(member, guildId)) {
        const embed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Keine Berechtigung')
          .setDescription('Nur Team-Mitglieder können interne Notizen hinzufügen.')
          .setFooter({ text: 'Quantix Tickets • Fehlende Berechtigung' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const embed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Kein Ticket-Channel')
          .setDescription('Dieser Befehl kann nur in einem Ticket-Channel verwendet werden.')
          .setFooter({ text: 'Quantix Tickets • Ungültiger Channel' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const noteContent = interaction.options.getString('note');

      if (!ticket.notes) {
        ticket.notes = [];
      }

      const note = {
        content: noteContent,
        authorId: interaction.user.id,
        authorTag: interaction.user.tag,
        timestamp: Date.now()
      };

      ticket.notes.push(note);
      saveTickets(guildId, tickets);

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('📝 Interne Notiz hinzugefügt')
        .setDescription(`**Notiz:**\n${noteContent}`)
        .addFields(
          {
            name: '👤 Autor',
            value: `<@${interaction.user.id}>`,
            inline: true
          },
          {
            name: '🎫 Ticket',
            value: `#${String(ticket.id).padStart(5, '0')}`,
            inline: true
          },
          {
            name: '📊 Notizen gesamt',
            value: `${ticket.notes.length}`,
            inline: true
          }
        )
        .setFooter({
          text: `Quantix Tickets • Nur für Team sichtbar`,
          iconURL: interaction.guild.iconURL({ size: 64 })
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ===== SUBCOMMAND: NOTE-LIST =====
    if (subcommand === 'note-list') {
      const member = interaction.member;

      if (!hasAnyTeamRole(member, guildId)) {
        const embed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Keine Berechtigung')
          .setDescription('Nur Team-Mitglieder können interne Notizen einsehen.')
          .setFooter({ text: 'Quantix Tickets • Fehlende Berechtigung' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const embed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Kein Ticket-Channel')
          .setDescription('Dieser Befehl kann nur in einem Ticket-Channel verwendet werden.')
          .setFooter({ text: 'Quantix Tickets • Ungültiger Channel' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!ticket.notes || ticket.notes.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle('📝 Interne Notizen')
          .setDescription(`**Ticket #${String(ticket.id).padStart(5, '0')}**\n\nKeine internen Notizen vorhanden.`)
          .setFooter({
            text: `Quantix Tickets • Nur für Team sichtbar`,
            iconURL: interaction.guild.iconURL({ size: 64 })
          })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const notesText = ticket.notes
        .map((note, index) => {
          const timestamp = `<t:${Math.floor(note.timestamp / 1000)}:R>`;
          const author = `<@${note.authorId}>`;
          const content = note.content.length > 200 ? note.content.substring(0, 200) + '...' : note.content;
          return `**${index + 1}.** ${author} • ${timestamp}\n> ${content}\n`;
        })
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('📝 Interne Notizen')
        .setDescription(
          `**Ticket #${String(ticket.id).padStart(5, '0')}**\n` +
          `**Topic:** ${ticket.topic}\n` +
          `**Ersteller:** <@${ticket.userId}>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          notesText
        )
        .addFields({
          name: '📊 Statistik',
          value: `Gesamt: **${ticket.notes.length}** Notizen`,
          inline: false
        })
        .setFooter({
          text: `Quantix Tickets • Nur für Team sichtbar`,
          iconURL: interaction.guild.iconURL({ size: 64 })
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ===== SUBCOMMAND: TAG-ADD, TAG-REMOVE, TAG-LIST =====
    if (subcommand === 'tag-add' || subcommand === 'tag-remove' || subcommand === 'tag-list') {
      if (!hasFeature(guildId, 'customTags')) {
        return interaction.reply({
          content: '❌ **Premium Basic+** Feature! Tags sind nur mit Premium Basic+ oder höher verfügbar.\n🔗 Upgrade: https://tickets.quantix-bot.de/premium',
          ephemeral: true
        });
      }

      const cfg = readCfg(guildId);
      const customTags = cfg.customTags || [];

      if (customTags.length === 0) {
        return interaction.reply({
          content: '❌ Keine Tags konfiguriert! Ein Admin muss zuerst Tags im Panel erstellen.',
          ephemeral: true
        });
      }

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket && subcommand !== 'tag-list') {
        return interaction.reply({
          content: '❌ Dieser Command kann nur in einem Ticket-Channel verwendet werden.',
          ephemeral: true
        });
      }

      if (subcommand === 'tag-list') {
        const embed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('📋 Available Tags')
          .setDescription(customTags.map(tag =>
            `${tag.emoji || '🏷️'} **${tag.label}**`
          ).join('\n') || 'Keine Tags verfügbar')
          .setFooter({ text: 'Verwende /ticket tag-add um einen Tag hinzuzufügen' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (subcommand === 'tag-add') {
        if (!ticket.tags) ticket.tags = [];

        const availableTags = customTags.filter(tag => !ticket.tags.includes(tag.id));

        if (availableTags.length === 0) {
          return interaction.reply({
            content: '✅ Alle Tags sind bereits zu diesem Ticket hinzugefügt!',
            ephemeral: true
          });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('tag_add_select')
          .setPlaceholder('Wähle einen Tag zum Hinzufügen')
          .addOptions(
            availableTags.slice(0, 25).map(tag => ({
              label: tag.label,
              value: tag.id,
              emoji: tag.emoji || '🏷️',
              description: `"${tag.label}" Tag hinzufügen`
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          content: '📋 **Wähle einen Tag zum Hinzufügen:**',
          components: [row],
          ephemeral: true
        });
      }

      if (subcommand === 'tag-remove') {
        if (!ticket.tags || ticket.tags.length === 0) {
          return interaction.reply({
            content: '❌ Keine Tags auf diesem Ticket!',
            ephemeral: true
          });
        }

        const currentTags = customTags.filter(tag => ticket.tags.includes(tag.id));

        if (currentTags.length === 0) {
          return interaction.reply({
            content: '❌ Keine Tags auf diesem Ticket!',
            ephemeral: true
          });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('tag_remove_select')
          .setPlaceholder('Wähle einen Tag zum Entfernen')
          .addOptions(
            currentTags.slice(0, 25).map(tag => ({
              label: tag.label,
              value: tag.id,
              emoji: tag.emoji || '🏷️',
              description: `"${tag.label}" Tag entfernen`
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          content: '📋 **Wähle einen Tag zum Entfernen:**',
          components: [row],
          ephemeral: true
        });
      }
    }

    // ===== SUBCOMMAND: DEPARTMENT-FORWARD, DEPARTMENT-LIST =====
    if (subcommand === 'department-forward' || subcommand === 'department-list') {
      if (!hasFeature(guildId, 'multiDepartment')) {
        return interaction.reply({
          content: '❌ **Premium Basic+** Feature! Multi-Department Support ist nur mit Premium Basic+ oder höher verfügbar.\n🔗 Upgrade: https://tickets.quantix-bot.de/premium',
          ephemeral: true
        });
      }

      const cfg = readCfg(guildId);
      const departments = cfg.departments || [];

      if (departments.length === 0) {
        return interaction.reply({
          content: '❌ Keine Abteilungen konfiguriert! Ein Admin muss zuerst Abteilungen im Panel erstellen.',
          ephemeral: true
        });
      }

      if (subcommand === 'department-list') {
        const embed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('🏢 Abteilungen')
          .setDescription(departments.map((dept, index) =>
            `**${index + 1}.** ${dept.emoji || '📁'} **${dept.name}**\n${dept.description || '_Keine Beschreibung_'}\n${dept.teamRole ? `👥 Team: <@&${dept.teamRole}>` : '❌ Kein Team'}`
          ).join('\n\n') || 'Keine Abteilungen verfügbar')
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (subcommand === 'department-forward') {
        const tickets = loadTickets(guildId);
        const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);

        if (ticketIndex === -1) {
          return interaction.reply({
            content: '❌ Dieser Command kann nur in einem Ticket-Channel verwendet werden.',
            ephemeral: true
          });
        }

        const ticket = tickets[ticketIndex];
        const currentDept = ticket.department || 'none';

        const availableDepts = departments.filter(d => d.id !== currentDept);

        if (availableDepts.length === 0) {
          return interaction.reply({
            content: '❌ Keine anderen Abteilungen verfügbar.',
            ephemeral: true
          });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('department_forward_select')
          .setPlaceholder('Wähle eine Abteilung')
          .addOptions(
            availableDepts.slice(0, 25).map(dept => ({
              label: dept.name,
              value: dept.id,
              emoji: dept.emoji || '📁',
              description: dept.description ? dept.description.substring(0, 100) : 'An diese Abteilung weiterleiten'
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          content: '🔄 **Ticket weiterleiten**\nWähle die Ziel-Abteilung:',
          components: [row],
          ephemeral: true
        });
      }
    }
  },
};
