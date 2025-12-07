const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { t } = require('../translations');
const { hasFeature, isPremium } = require('../premium');
const { createStyledEmbed, createQuickEmbed } = require('../helpers');

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
        .setDescription('List all departments (Premium)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('pause')
        .setDescription('Pause the auto-close timer for this ticket/application'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('resume')
        .setDescription('Resume the auto-close timer for this ticket/application'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('block')
        .setDescription('Block the ticket - nobody can write messages'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('unblock')
        .setDescription('Unblock the ticket - restore write permissions')),

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

        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Benutzer zu Tickets hinzufügen.',
          fields: [
            { name: 'Benötigte Rolle', value: teamRole ? `<@&${TEAM_ROLE}>` : 'Nicht konfiguriert', inline: true }
          ],
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      // Check if target user is a member of the guild
      if (!targetMember) {
        const notMemberEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Benutzer nicht gefunden',
          description: 'Dieser Benutzer ist nicht auf diesem Server.',
          fields: [
            { name: 'User', value: `${targetUser.tag}`, inline: true }
          ],
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [notMemberEmbed], ephemeral: true });
      }

      // Load tickets and find current ticket
      const log = loadTickets(guildId);
      const ticket = log.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Für diesen Channel wurde kein Ticket-Datensatz gefunden.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noTicketEmbed], ephemeral: true });
      }

      // Initialize addedUsers array if not exists
      if (!ticket.addedUsers) ticket.addedUsers = [];

      // Check if user already has access
      if (ticket.addedUsers.includes(targetUser.id) || ticket.userId === targetUser.id || ticket.claimer === targetUser.id) {
        const alreadyAccessEmbed = createStyledEmbed({
          emoji: 'ℹ️',
          title: 'Bereits vorhanden',
          description: `<@${targetUser.id}> hat bereits Zugriff auf dieses Ticket.`,
          fields: [
            { name: 'User', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true }
          ],
          color: '#FEE75C'
        });

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
        const successEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Benutzer hinzugefügt',
          description: `<@${targetUser.id}> wurde erfolgreich zum Ticket hinzugefügt.`,
          fields: [
            { name: 'Hinzugefügt', value: `<@${targetUser.id}>`, inline: true },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Von', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: '#57F287'
        });

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

        // Send public announcement in ticket channel
        const publicEmbed = createStyledEmbed({
          emoji: '👥',
          title: 'Neuer Benutzer hinzugefügt',
          description: `<@${targetUser.id}> wurde von <@${interaction.user.id}> zum Ticket hinzugefügt und kann nun hier schreiben.`,
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#57F287'
        });

        await interaction.channel.send({ embeds: [publicEmbed] });

        // Log event
        logEvent(interaction.guild, t(guildId, 'logs.user_added', { user: `<@${targetUser.id}>`, id: ticket.id }));

      } catch (err) {
        console.error('Fehler beim Hinzufügen:', err);

        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Hinzufügen',
          description: 'Der Benutzer konnte nicht hinzugefügt werden.',
          fields: [
            { name: 'Fehlerdetails', value: `\`\`\`${err.message}\`\`\``, inline: false }
          ],
          color: '#ED4245'
        });

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
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Für diesen Channel wurde kein Ticket-Datensatz gefunden.',
          color: '#ED4245'
        });

        return interaction.editReply({ embeds: [noTicketEmbed] });
      }

      // Check if user is the claimer
      if (ticket.claimer !== interaction.user.id) {
        const notClaimerEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur der Claimer kann dieses Ticket verstecken!',
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
          ],
          color: '#ED4245'
        });

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

        const successEmbed = createStyledEmbed({
          emoji: '🔒',
          title: 'Ticket versteckt',
          description: 'Dieses Ticket ist jetzt für alle Team-Mitglieder unsichtbar.',
          fields: [
            { name: 'Sichtbar für', value: 'Ersteller, Claimer und hinzugefügte Benutzer', inline: false },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Versteckt von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#FEE75C'
        });

        await interaction.editReply({ embeds: [successEmbed] });

        // Log event
        logEvent(interaction.guild, `🔒 **Ticket versteckt:** <@${interaction.user.id}> hat Ticket #${ticket.id} versteckt`);

      } catch (err) {
        console.error('Fehler beim Verstecken:', err);

        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Verstecken',
          description: 'Das Ticket konnte nicht versteckt werden.',
          fields: [
            { name: 'Fehlerdetails', value: `\`\`\`${err.message}\`\`\``, inline: false }
          ],
          color: '#ED4245'
        });

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
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Für diesen Channel wurde kein Ticket-Datensatz gefunden.',
          color: '#ED4245'
        });

        return interaction.editReply({ embeds: [noTicketEmbed] });
      }

      // Check if user is the claimer
      if (ticket.claimer !== interaction.user.id) {
        const notClaimerEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur der Claimer kann dieses Ticket einblenden!',
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
          ],
          color: '#ED4245'
        });

        return interaction.editReply({ embeds: [notClaimerEmbed] });
      }

      try {
        // Check if ticket is actually hidden
        if (!ticket.hidden) {
          const notHiddenEmbed = createStyledEmbed({
            emoji: 'ℹ️',
            title: 'Ticket bereits sichtbar',
            description: 'Dieses Ticket ist bereits für alle Team-Mitglieder sichtbar.',
            fields: [
              { name: 'Ticket', value: `#${ticket.id}`, inline: true }
            ],
            color: '#FEE75C'
          });

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

        const successEmbed = createStyledEmbed({
          emoji: '👁️',
          title: 'Ticket wieder sichtbar',
          description: 'Dieses Ticket ist jetzt wieder für alle Team-Mitglieder sichtbar.',
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Eingeblendet von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#57F287'
        });

        await interaction.editReply({ embeds: [successEmbed] });

        // Log event
        logEvent(interaction.guild, `👁️ **Ticket eingeblendet:** <@${interaction.user.id}> hat Ticket #${ticket.id} wieder sichtbar gemacht`);

      } catch (err) {
        console.error('Fehler beim Einblenden:', err);

        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Einblenden',
          description: 'Das Ticket konnte nicht eingeblendet werden.',
          fields: [{ name: 'Fehlerdetails', value: `\`\`\`${err.message}\`\`\``, inline: false }],
          color: '#ED4245'
        });

        return interaction.editReply({ embeds: [errorEmbed] });
      }
    }

    // ===== SUBCOMMAND: SPLIT =====
    if (subcommand === 'split') {
      const reason = interaction.options.getString('reason');

      // Check if user is team member
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Tickets splitten!',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      // Load tickets and find current ticket
      const log = loadTickets(guildId);
      const ticket = log.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Für diesen Channel wurde kein Ticket-Datensatz gefunden.',
          color: '#ED4245'
        });

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
        const newTicketEmbed = createStyledEmbed({
          emoji: '🔀',
          title: `Ticket #${newTicketNumber} (Split)`,
          description: `Dieses Ticket wurde aus Ticket #${ticket.id} abgespalten.\n\nGrund: ${reason}\n\nUrsprüngliches Ticket: <#${ticket.channelId}>\nErsteller: <@${ticket.userId}>`,
          fields: [
            { name: 'Split von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Erstellt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#5865F2',
          footer: 'Quantix Tickets • Ticket Split'
        });

        await newChannel.send({ content: `<@${ticket.userId}>`, embeds: [newTicketEmbed] });

        // Notify in original ticket
        const splitNotifyEmbed = createStyledEmbed({
          emoji: '🔀',
          title: 'Ticket wurde gesplittet',
          description: `Ein neues Ticket wurde aus diesem Ticket erstellt.\n\nNeues Ticket: <#${newChannel.id}> (#${newTicketNumber})\nGrund: ${reason}`,
          fields: [
            { name: 'Gesplittet von', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: '#5865F2',
          footer: 'Quantix Tickets • Ticket Split'
        });

        await interaction.editReply({ embeds: [splitNotifyEmbed] });

        // Log event
        logEvent(interaction.guild, `🔀 **Ticket gesplittet:** <@${interaction.user.id}> hat Ticket #${ticket.id} in #${newTicketNumber} aufgeteilt (Grund: ${reason})`);

      } catch (err) {
        console.error('Fehler beim Splitten:', err);

        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Splitten',
          description: 'Das Ticket konnte nicht gesplittet werden.',
          fields: [{ name: 'Fehlerdetails', value: `\`\`\`${err.message}\`\`\``, inline: false }],
          color: '#ED4245'
        });

        return interaction.editReply({ embeds: [errorEmbed] });
      }
    }

    // ===== SUBCOMMAND: OPEN-AS =====
    if (subcommand === 'open-as') {
      // Check if user is team member
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Tickets für andere Nutzer erstellen!',
          color: '#ED4245'
        });

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
        const successEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Ticket erstellt',
          description: `Ticket #${ticketNumber} wurde erfolgreich für <@${targetUser.id}> erstellt.\n\nChannel: ${newChannel}\nThema: ${topicString}`,
          color: '#57F287',
          footer: 'Quantix Tickets • Erfolgreich erstellt'
        });

        await interaction.editReply({ embeds: [successEmbed] });

        // Log event
        logEvent(
          interaction.guild,
          `🎫 **Ticket für Nutzer erstellt:** <@${interaction.user.id}> hat Ticket #${ticketNumber} für <@${targetUser.id}> erstellt (Thema: ${topicString})`
        );

      } catch (err) {
        console.error('Fehler beim Erstellen des Tickets:', err);

        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Erstellen',
          description: 'Das Ticket konnte nicht erstellt werden.',
          fields: [{ name: 'Fehlerdetails', value: `\`\`\`${err.message}\`\`\``, inline: false }],
          color: '#ED4245'
        });

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

      const embed = createStyledEmbed({
        emoji: '🚫',
        title: 'User zur Blacklist hinzugefügt',
        description: `${user} wurde zur Ticket-Blacklist hinzugefügt.`,
        fields: [
          { name: 'User', value: `${user} (${user.id})`, inline: true },
          { name: 'Grund', value: reason, inline: true },
          { name: 'Dauer', value: isPermanent ? '♾️ Permanent' : `${days} Tage`, inline: true },
          { name: 'Von', value: `<@${interaction.user.id}>`, inline: true }
        ],
        color: '#ED4245'
      });

      await interaction.reply({ embeds: [embed] });

      // Try to send DM
      try {
        const dmEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Ticket-Blacklist',
          description: `Du wurdest auf ${interaction.guild.name} zur Ticket-Blacklist hinzugefügt.`,
          fields: [
            { name: 'Grund', value: reason, inline: false },
            { name: 'Dauer', value: isPermanent ? '♾️ Permanent' : `${days} Tage`, inline: false }
          ],
          color: '#ED4245'
        });

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

      const embed = createStyledEmbed({
        emoji: '✅',
        title: 'User von Blacklist entfernt',
        description: `${user} wurde von der Ticket-Blacklist entfernt.`,
        fields: [
          { name: 'User', value: `${user} (${user.id})`, inline: true },
          { name: 'Von', value: `<@${interaction.user.id}>`, inline: true }
        ],
        color: '#57F287'
      });

      await interaction.reply({ embeds: [embed] });

      // Try to send DM
      try {
        const dmEmbed = createStyledEmbed({
          emoji: '✅',
          title: 'Blacklist aufgehoben',
          description: `Du wurdest auf ${interaction.guild.name} von der Ticket-Blacklist entfernt.`,
          color: '#57F287'
        });

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

      const fields = activeBlacklists.slice(0, 25).map((bl, index) => {
        const expiryText = bl.isPermanent
          ? '♾️ Permanent'
          : `<t:${Math.floor(new Date(bl.expiresAt).getTime() / 1000)}:R>`;

        return {
          name: `${index + 1}. ${bl.username}`,
          value: `ID: ${bl.userId}\nGrund: ${bl.reason}\nLäuft ab: ${expiryText}`,
          inline: false
        };
      });

      const embed = createStyledEmbed({
        emoji: '🚫',
        title: 'Ticket-Blacklist',
        description: `${activeBlacklists.length} User auf der Blacklist:`,
        fields: fields,
        color: '#ED4245',
        footer: activeBlacklists.length > 25 ? `Zeige erste 25 von ${activeBlacklists.length} Einträgen` : undefined
      });

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

      const embed = createStyledEmbed({
        emoji: '🚫',
        title: 'User ist auf der Blacklist',
        description: `${user} ist auf der Ticket-Blacklist.`,
        fields: [
          { name: 'User', value: `${user} (${user.id})`, inline: true },
          { name: 'Grund', value: blacklist.reason, inline: true },
          { name: 'Dauer', value: blacklist.isPermanent ? '♾️ Permanent' : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`, inline: true },
          { name: 'Hinzugefügt von', value: `<@${blacklist.blacklistedBy}>`, inline: true },
          { name: 'Hinzugefügt am', value: `<t:${Math.floor(new Date(blacklist.blacklistedAt).getTime() / 1000)}:F>`, inline: true }
        ],
        color: '#ED4245'
      });

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
        .setMinLength(3)
        .setMaxLength(500);

      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    }

    // ===== SUBCOMMAND: NOTE-ADD =====
    if (subcommand === 'note-add') {
      const member = interaction.member;

      if (!hasAnyTeamRole(member, guildId)) {
        const embed = createStyledEmbed({
          emoji: '❌',
          title: 'Keine Berechtigung',
          description: 'Nur Team-Mitglieder können interne Notizen hinzufügen.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const embed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket-Channel',
          description: 'Dieser Befehl kann nur in einem Ticket-Channel verwendet werden.',
          color: '#ED4245'
        });

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

      const embed = createStyledEmbed({
        emoji: '📝',
        title: 'Interne Notiz hinzugefügt',
        description: `Notiz:\n${noteContent}`,
        fields: [
          { name: 'Autor', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Ticket', value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
          { name: 'Notizen gesamt', value: `${ticket.notes.length}`, inline: true }
        ],
        color: '#57F287',
        footer: 'Quantix Tickets • Nur für Team sichtbar'
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ===== SUBCOMMAND: NOTE-LIST =====
    if (subcommand === 'note-list') {
      const member = interaction.member;

      if (!hasAnyTeamRole(member, guildId)) {
        const embed = createStyledEmbed({
          emoji: '❌',
          title: 'Keine Berechtigung',
          description: 'Nur Team-Mitglieder können interne Notizen einsehen.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const embed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket-Channel',
          description: 'Dieser Befehl kann nur in einem Ticket-Channel verwendet werden.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!ticket.notes || ticket.notes.length === 0) {
        const embed = createStyledEmbed({
          emoji: '📝',
          title: 'Interne Notizen',
          description: `Ticket #${String(ticket.id).padStart(5, '0')}\n\nKeine internen Notizen vorhanden.`,
          color: '#F59E0B',
          footer: 'Quantix Tickets • Nur für Team sichtbar'
        });

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const notesText = ticket.notes
        .map((note, index) => {
          const timestamp = `<t:${Math.floor(note.timestamp / 1000)}:R>`;
          const author = `<@${note.authorId}>`;
          const content = note.content.length > 200 ? note.content.substring(0, 200) + '...' : note.content;
          return `${index + 1}. ${author} • ${timestamp}\n> ${content}\n`;
        })
        .join('\n');

      const embed = createStyledEmbed({
        emoji: '📝',
        title: 'Interne Notizen',
        description: `Ticket #${String(ticket.id).padStart(5, '0')}\nTopic: ${ticket.topic}\nErsteller: <@${ticket.userId}>\n\n${notesText}`,
        fields: [{ name: 'Statistik', value: `Gesamt: ${ticket.notes.length} Notizen`, inline: false }],
        color: '#57F287',
        footer: 'Quantix Tickets • Nur für Team sichtbar'
      });

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
        const embed = createStyledEmbed({
          emoji: '📋',
          title: 'Available Tags',
          description: customTags.map(tag => `${tag.emoji || '🏷️'} ${tag.label}`).join('\n') || 'Keine Tags verfügbar',
          color: '#57F287',
          footer: 'Verwende /ticket tag-add um einen Tag hinzuzufügen'
        });

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
        const embed = createStyledEmbed({
          emoji: '🏢',
          title: 'Abteilungen',
          description: departments.map((dept, index) =>
            `${index + 1}. ${dept.emoji || '📁'} ${dept.name}\n${dept.description || 'Keine Beschreibung'}\n${dept.teamRole ? `Team: <@&${dept.teamRole}>` : '❌ Kein Team'}`
          ).join('\n\n') || 'Keine Abteilungen verfügbar',
          color: '#57F287'
        });

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

    // ===== SUBCOMMAND: PAUSE =====
    if (subcommand === 'pause') {
      // Check if user is team member or ticket creator
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Für diesen Channel wurde kein Ticket/Bewerbung gefunden.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noTicketEmbed], ephemeral: true });
      }

      // Only team or ticket creator can pause
      if (!isTeam && ticket.userId !== interaction.user.id) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder oder der Ticket-Ersteller können den Auto-Close Timer pausieren!',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      // Check if already paused
      if (ticket.autoClosePaused) {
        const alreadyPausedEmbed = createStyledEmbed({
          emoji: '⏸️',
          title: 'Bereits pausiert',
          description: 'Der Auto-Close Timer ist bereits pausiert.',
          fields: [
            { name: 'Pausiert seit', value: ticket.autoClosePausedAt ? `<t:${Math.floor(ticket.autoClosePausedAt / 1000)}:R>` : 'Unbekannt', inline: true },
            { name: 'Pausiert von', value: ticket.autoClosePausedBy ? `<@${ticket.autoClosePausedBy}>` : 'Unbekannt', inline: true }
          ],
          color: '#F59E0B'
        });

        return interaction.reply({ embeds: [alreadyPausedEmbed], ephemeral: true });
      }

      // Pause the auto-close timer
      const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);
      tickets[ticketIndex].autoClosePaused = true;
      tickets[ticketIndex].autoClosePausedAt = Date.now();
      tickets[ticketIndex].autoClosePausedBy = interaction.user.id;
      // Store remaining time if warning was sent
      if (ticket.autoCloseWarningSent && ticket.autoCloseWarningAt) {
        const cfg = readCfg(guildId);
        const inactiveHours = cfg.autoClose?.inactiveHours || 72;
        const inactiveMs = inactiveHours * 60 * 60 * 1000;
        const warningMs = 24 * 60 * 60 * 1000;
        const lastActivity = ticket.autoCloseResetAt || ticket.lastMessageAt || ticket.timestamp;
        const closeTime = lastActivity + inactiveMs;
        tickets[ticketIndex].autoCloseRemainingMs = Math.max(0, closeTime - Date.now());
      }
      saveTickets(guildId, tickets);

      const ticketType = ticket.isApplication ? 'Bewerbung' : 'Ticket';
      const successEmbed = createStyledEmbed({
        emoji: '⏸️',
        title: 'Auto-Close pausiert',
        description: `Der Auto-Close Timer für dieses ${ticketType} wurde pausiert.\n\nDas ${ticketType} wird nicht mehr automatisch geschlossen, bis der Timer wieder fortgesetzt wird.`,
        fields: [
          { name: ticketType, value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
          { name: 'Pausiert von', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        ],
        color: '#57F287',
        footer: 'Quantix Tickets • Auto-Close pausiert'
      });

      await interaction.reply({ embeds: [successEmbed] });

      // Log event
      logEvent(interaction.guild, `⏸️ **Auto-Close pausiert:** <@${interaction.user.id}> hat den Auto-Close Timer für ${ticketType} #${ticket.id} pausiert`);
    }

    // ===== SUBCOMMAND: RESUME =====
    if (subcommand === 'resume') {
      // Check if user is team member or ticket creator
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Für diesen Channel wurde kein Ticket/Bewerbung gefunden.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noTicketEmbed], ephemeral: true });
      }

      // Only team or ticket creator can resume
      if (!isTeam && ticket.userId !== interaction.user.id) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder oder der Ticket-Ersteller können den Auto-Close Timer fortsetzen!',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      // Check if actually paused
      if (!ticket.autoClosePaused) {
        const notPausedEmbed = createStyledEmbed({
          emoji: '▶️',
          title: 'Nicht pausiert',
          description: 'Der Auto-Close Timer ist nicht pausiert.',
          color: '#F59E0B'
        });

        return interaction.reply({ embeds: [notPausedEmbed], ephemeral: true });
      }

      // Resume the auto-close timer
      const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);
      const pauseDuration = Date.now() - (ticket.autoClosePausedAt || Date.now());

      // Reset timer by updating lastMessageAt to now (giving full time again)
      tickets[ticketIndex].autoClosePaused = false;
      tickets[ticketIndex].autoCloseResumedAt = Date.now();
      tickets[ticketIndex].autoCloseResumedBy = interaction.user.id;
      tickets[ticketIndex].autoCloseResetAt = Date.now(); // Reset timer to now
      tickets[ticketIndex].autoCloseWarningSent = false; // Reset warning
      tickets[ticketIndex].autoCloseWarningAt = null;
      delete tickets[ticketIndex].autoCloseRemainingMs;
      saveTickets(guildId, tickets);

      const cfg = readCfg(guildId);
      const inactiveHours = cfg.autoClose?.inactiveHours || 72;

      const ticketType = ticket.isApplication ? 'Bewerbung' : 'Ticket';
      const successEmbed = createStyledEmbed({
        emoji: '▶️',
        title: 'Auto-Close fortgesetzt',
        description: `Der Auto-Close Timer für dieses ${ticketType} wurde fortgesetzt.\n\nDer Timer wurde zurückgesetzt. Das ${ticketType} wird in ${inactiveHours} Stunden automatisch geschlossen, wenn keine Aktivität stattfindet.`,
        fields: [
          { name: ticketType, value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
          { name: 'Fortgesetzt von', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Pause-Dauer', value: `${Math.round(pauseDuration / 1000 / 60)} Minuten`, inline: true },
          { name: 'Nächste Schließung', value: `<t:${Math.floor((Date.now() + inactiveHours * 60 * 60 * 1000) / 1000)}:R>`, inline: true }
        ],
        color: '#57F287',
        footer: 'Quantix Tickets • Auto-Close fortgesetzt'
      });

      await interaction.reply({ embeds: [successEmbed] });

      // Log event
      logEvent(interaction.guild, `▶️ **Auto-Close fortgesetzt:** <@${interaction.user.id}> hat den Auto-Close Timer für ${ticketType} #${ticket.id} fortgesetzt`);
    }

    // ===== SUBCOMMAND: BLOCK =====
    if (subcommand === 'block') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Dieser Channel ist kein Ticket.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noTicketEmbed], ephemeral: true });
      }

      // Nur Team oder Claimer darf blocken
      const isClaimer = ticket.claimer === interaction.user.id;
      if (!isTeam && !isClaimer) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Keine Berechtigung',
          description: 'Nur Team-Mitglieder oder der Claimer können das Ticket sperren.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      // Check if already blocked
      if (ticket.blocked) {
        const alreadyBlockedEmbed = createStyledEmbed({
          emoji: '🔒',
          title: 'Bereits gesperrt',
          description: 'Dieses Ticket ist bereits gesperrt.',
          fields: [
            { name: 'Gesperrt von', value: ticket.blockedBy ? `<@${ticket.blockedBy}>` : 'Unbekannt', inline: true },
            { name: 'Gesperrt seit', value: ticket.blockedAt ? `<t:${Math.floor(ticket.blockedAt / 1000)}:R>` : 'Unbekannt', inline: true }
          ],
          color: '#F59E0B'
        });

        return interaction.reply({ embeds: [alreadyBlockedEmbed], ephemeral: true });
      }

      // SOFORT antworten
      await interaction.reply({ content: '🔒 Ticket wird gesperrt...', ephemeral: true });

      try {
        // Alle Schreibrechte entfernen
        const permissionOverwrites = interaction.channel.permissionOverwrites.cache;
        for (const [id, overwrite] of permissionOverwrites) {
          if (id !== interaction.guild.id) {
            await interaction.channel.permissionOverwrites.edit(id, {
              SendMessages: false
            }).catch(() => {});
          }
        }

        // Ticket als blocked markieren
        const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);
        tickets[ticketIndex].blocked = true;
        tickets[ticketIndex].blockedAt = Date.now();
        tickets[ticketIndex].blockedBy = interaction.user.id;
        saveTickets(guildId, tickets);

        // Öffentliche Nachricht im Ticket
        const blockEmbed = createStyledEmbed({
          emoji: '🔒',
          title: 'Ticket gesperrt',
          description: 'Dieses Ticket wurde gesperrt.\n\nNiemand kann mehr Nachrichten in diesem Ticket schreiben, bis es entsperrt wird.',
          fields: [
            { name: 'Ticket', value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
            { name: 'Gesperrt von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#ED4245',
          footer: 'Quantix Tickets • Ticket gesperrt'
        });

        await interaction.channel.send({ embeds: [blockEmbed] });

        // Log event
        logEvent(interaction.guild, `🔒 **Ticket gesperrt:** <@${interaction.user.id}> hat Ticket #${ticket.id} gesperrt`);

        await interaction.editReply({ content: '✅ Ticket wurde gesperrt!' });
      } catch (err) {
        console.error('Error blocking ticket:', err);
        await interaction.editReply({ content: '❌ Fehler beim Sperren des Tickets.' });
      }
    }

    // ===== SUBCOMMAND: UNBLOCK =====
    if (subcommand === 'unblock') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        const noTicketEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Ticket gefunden',
          description: 'Dieser Channel ist kein Ticket.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noTicketEmbed], ephemeral: true });
      }

      // Nur Team oder Claimer darf unblocken
      const isClaimer = ticket.claimer === interaction.user.id;
      if (!isTeam && !isClaimer) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Keine Berechtigung',
          description: 'Nur Team-Mitglieder oder der Claimer können das Ticket entsperren.',
          color: '#ED4245'
        });

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      // Check if not blocked
      if (!ticket.blocked) {
        const notBlockedEmbed = createStyledEmbed({
          emoji: '🔓',
          title: 'Nicht gesperrt',
          description: 'Dieses Ticket ist nicht gesperrt.',
          color: '#F59E0B'
        });

        return interaction.reply({ embeds: [notBlockedEmbed], ephemeral: true });
      }

      // SOFORT antworten
      await interaction.reply({ content: '🔓 Ticket wird entsperrt...', ephemeral: true });

      try {
        const cfg = readCfg(guildId);

        // Berechtigungen wiederherstellen basierend auf Ticket-Status
        const permissions = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        // Added Users
        if (ticket.addedUsers && Array.isArray(ticket.addedUsers)) {
          ticket.addedUsers.forEach(uid => {
            permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
          });
        }

        // Claimer
        if (ticket.claimer) {
          permissions.push({ id: ticket.claimer, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        }

        // Team-Rolle (nur wenn nicht geclaimed)
        if (!ticket.claimer) {
          const teamRoleId = cfg.teamRoleId;
          const teamRoleIds = Array.isArray(teamRoleId) ? teamRoleId : [teamRoleId];
          for (const roleId of teamRoleIds) {
            if (roleId && roleId.trim()) {
              permissions.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
            }
          }
        }

        await interaction.channel.permissionOverwrites.set(permissions);

        // Ticket als unblocked markieren
        const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);
        tickets[ticketIndex].blocked = false;
        tickets[ticketIndex].unblockedAt = Date.now();
        tickets[ticketIndex].unblockedBy = interaction.user.id;
        saveTickets(guildId, tickets);

        // Öffentliche Nachricht im Ticket
        const unblockEmbed = createStyledEmbed({
          emoji: '🔓',
          title: 'Ticket entsperrt',
          description: 'Dieses Ticket wurde entsperrt.\n\nNachrichten können wieder gesendet werden.',
          fields: [
            { name: 'Ticket', value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
            { name: 'Entsperrt von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#57F287',
          footer: 'Quantix Tickets • Ticket entsperrt'
        });

        await interaction.channel.send({ embeds: [unblockEmbed] });

        // Log event
        logEvent(interaction.guild, `🔓 **Ticket entsperrt:** <@${interaction.user.id}> hat Ticket #${ticket.id} entsperrt`);

        await interaction.editReply({ content: '✅ Ticket wurde entsperrt!' });
      } catch (err) {
        console.error('Error unblocking ticket:', err);
        await interaction.editReply({ content: '❌ Fehler beim Entsperren des Tickets.' });
      }
    }
  },
};
