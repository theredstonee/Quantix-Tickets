const path = require('path');
const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { t } = require('../translations');
const { createStyledEmbed, createQuickEmbed } = require('../helpers');
const { readCfg, writeCfg, loadTickets, saveTickets } = require('../database');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');
const PREFIX = '🎫│';

const PRIORITY_STATES = [
  { dot: '🟢', embedColor: 0x2bd94a, label: 'Grün' },
  { dot: '🟠', embedColor: 0xff9900, label: 'Orange' },
  { dot: '🔴', embedColor: 0xd92b2b, label: 'Rot' }
];

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

function getHierarchicalPriorityRoles(guildId, priority = 0) {
  const cfg = readCfg(guildId);
  const roles = new Set();

  if (!cfg.priorityRoles) {
    if (Array.isArray(cfg.teamRoleId)) {
      return cfg.teamRoleId.filter(r => r && r.trim());
    }
    return cfg.teamRoleId ? [cfg.teamRoleId] : [];
  }

  // Hierarchisch: Rot (2) sieht 2+1+0, Orange (1) sieht 1+0, Grün (0) sieht nur 0
  for (let level = priority; level >= 0; level--) {
    const levelRoles = cfg.priorityRoles[level.toString()] || [];
    if (Array.isArray(levelRoles)) {
      levelRoles.forEach(r => roles.add(r));
    }
  }

  return Array.from(roles).filter(r => r && r.trim());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands')
    // ===== EXISTING SUBCOMMANDS =====
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
        .setDescription('Unblock the ticket - restore write permissions'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('rename')
        .setDescription('Rename this ticket channel')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('New channel name')
            .setRequired(true)
            .setMaxLength(100)))
    // ===== NEW SUBCOMMANDS =====
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Claim this ticket (Team only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('unclaim')
        .setDescription('Release this ticket so other team members can claim it'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close this ticket immediately (Team only)')
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for closing the ticket')
            .setRequired(false)
            .setMaxLength(500)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('request-close')
        .setDescription('Request to close this ticket (requires approval)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('elevate')
        .setDescription('Increase ticket priority (Team only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('lower')
        .setDescription('Decrease ticket priority (Team only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('merge')
        .setDescription('Merge another ticket into this one (Team only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('voice-start')
        .setDescription('Create a voice channel for this ticket (Team only)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('voice-end')
        .setDescription('Delete the voice channel for this ticket (Team only)')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ===== SUBCOMMAND: CLAIM =====
    if (subcommand === 'claim') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Tickets übernehmen.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

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

      if (ticket.claimer) {
        const alreadyClaimedEmbed = createStyledEmbed({
          emoji: '⚠️',
          title: 'Bereits übernommen',
          description: `Dieses Ticket wurde bereits von <@${ticket.claimer}> übernommen.`,
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Claimer', value: `<@${ticket.claimer}>`, inline: true }
          ],
          color: '#FEE75C'
        });
        return interaction.reply({ embeds: [alreadyClaimedEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        ticket.claimer = interaction.user.id;
        ticket.claimedAt = Date.now();
        saveTickets(guildId, tickets);

        // Update channel permissions
        const permissions = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        if (ticket.addedUsers && Array.isArray(ticket.addedUsers)) {
          ticket.addedUsers.forEach(uid => {
            permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
          });
        }

        // Priority roles: Can see but not write
        const currentPriority = ticket.priority || 0;
        const hierarchicalRoles = getHierarchicalPriorityRoles(guildId, currentPriority);
        for (const roleId of hierarchicalRoles) {
          if (roleId && roleId.trim()) {
            try {
              await interaction.guild.roles.fetch(roleId);
              permissions.push({
                id: roleId,
                allow: [PermissionsBitField.Flags.ViewChannel],
                deny: [PermissionsBitField.Flags.SendMessages]
              });
            } catch {
              console.error('Priority-Rolle nicht gefunden:', roleId);
            }
          }
        }

        await interaction.channel.permissionOverwrites.set(permissions);

        // Public message in channel
        const claimEmbed = createStyledEmbed({
          emoji: '✨',
          title: 'Ticket übernommen',
          description: `<@${interaction.user.id}> hat das Ticket übernommen und wird sich um dein Anliegen kümmern.`,
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Übernommen von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#57F287'
        });

        await interaction.channel.send({ embeds: [claimEmbed] });
        await interaction.editReply({ content: '✅ Ticket erfolgreich übernommen!' });

        logEvent(interaction.guild, t(guildId, 'logs.ticket_claimed', { id: ticket.id, user: `<@${interaction.user.id}>` }) || `✨ Ticket #${ticket.id} wurde von <@${interaction.user.id}> übernommen`);
      } catch (err) {
        console.error('Error claiming ticket:', err);
        await interaction.editReply({ content: '❌ Fehler beim Übernehmen des Tickets.' });
      }
    }

    // ===== SUBCOMMAND: UNCLAIM =====
    if (subcommand === 'unclaim') {
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

      if (!ticket.claimer) {
        const notClaimedEmbed = createStyledEmbed({
          emoji: 'ℹ️',
          title: 'Nicht übernommen',
          description: 'Dieses Ticket wurde noch nicht übernommen.',
          color: '#FEE75C'
        });
        return interaction.reply({ embeds: [notClaimedEmbed], ephemeral: true });
      }

      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      const isClaimer = ticket.claimer === interaction.user.id;

      if (!isTeam && !isClaimer) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur der Claimer oder Team-Mitglieder können das Ticket freigeben.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const previousClaimer = ticket.claimer;
        ticket.claimer = null;
        ticket.unclaimedAt = Date.now();
        ticket.unclaimedBy = interaction.user.id;
        saveTickets(guildId, tickets);

        // Restore team permissions
        const cfg = readCfg(guildId);
        const permissions = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        // Team roles
        const teamRoles = getAllTeamRoles(guildId);
        for (const roleId of teamRoles) {
          if (roleId && roleId.trim()) {
            permissions.push({
              id: roleId,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            });
          }
        }

        // Added users
        if (ticket.addedUsers && Array.isArray(ticket.addedUsers)) {
          ticket.addedUsers.forEach(uid => {
            permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
          });
        }

        await interaction.channel.permissionOverwrites.set(permissions);

        // Public message
        const unclaimEmbed = createStyledEmbed({
          emoji: '🔓',
          title: 'Ticket freigegeben',
          description: `Das Ticket wurde von <@${interaction.user.id}> freigegeben und kann nun von anderen Team-Mitgliedern übernommen werden.`,
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Vorheriger Claimer', value: `<@${previousClaimer}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#5865F2'
        });

        await interaction.channel.send({ embeds: [unclaimEmbed] });
        await interaction.editReply({ content: '✅ Ticket erfolgreich freigegeben!' });

        logEvent(interaction.guild, `🔓 Ticket #${ticket.id} wurde von <@${interaction.user.id}> freigegeben`);
      } catch (err) {
        console.error('Error unclaiming ticket:', err);
        await interaction.editReply({ content: '❌ Fehler beim Freigeben des Tickets.' });
      }
    }

    // ===== SUBCOMMAND: CLOSE =====
    if (subcommand === 'close') {
      const reason = interaction.options.getString('reason') || 'Kein Grund angegeben';
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

      const isClaimer = ticket.claimer === interaction.user.id;

      if (!isTeam && !isClaimer) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder oder der Claimer können das Ticket direkt schließen.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      if (ticket.archived) {
        const archivedEmbed = createStyledEmbed({
          emoji: '📦',
          title: 'Ticket archiviert',
          description: 'Dieses Ticket ist bereits archiviert.',
          color: '#FFA500'
        });
        return interaction.reply({ embeds: [archivedEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        ticket.status = 'geschlossen';
        ticket.closedAt = Date.now();
        ticket.closedBy = interaction.user.id;
        ticket.closeReason = reason;
        saveTickets(guildId, tickets);

        const cfg = readCfg(guildId);

        // Close embed with reason
        const closeEmbed = createStyledEmbed({
          emoji: '🔐',
          title: 'Ticket geschlossen',
          description: `Dieses Ticket wurde von <@${interaction.user.id}> geschlossen.`,
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Geschlossen von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
            { name: 'Grund', value: reason, inline: false }
          ],
          color: '#ED4245',
          footer: 'Quantix Tickets • Ticket geschlossen'
        });

        await interaction.channel.send({ embeds: [closeEmbed] });

        // Try to create transcript
        try {
          const transcriptDir = path.join(__dirname, '..', 'transcripts', guildId);
          if (!fs.existsSync(transcriptDir)) {
            fs.mkdirSync(transcriptDir, { recursive: true });
          }

          const txtPath = path.join(transcriptDir, `transcript_${ticket.id}.txt`);
          
          // Append close reason to transcript
          const closeEntry = `\n\n=== TICKET GESCHLOSSEN ===\nGeschlossen von: ${interaction.user.tag} (${interaction.user.id})\nZeitpunkt: ${new Date().toLocaleString('de-DE')}\nGrund: ${reason}\n`;
          fs.appendFileSync(txtPath, closeEntry, 'utf8');

          // Also append to HTML if exists
          const htmlPath = path.join(transcriptDir, `transcript_${ticket.id}.html`);
          if (fs.existsSync(htmlPath)) {
            const htmlCloseEntry = `<div class="msg" style="background:#d92b2b;margin-top:20px;"><strong>🔐 Ticket geschlossen</strong><br>Geschlossen von: ${interaction.user.tag}<br>Zeitpunkt: ${new Date().toLocaleString('de-DE')}<br>Grund: ${reason}</div>`;
            fs.appendFileSync(htmlPath, htmlCloseEntry, 'utf8');
          }
        } catch (transcriptErr) {
          console.error('Error updating transcript with close reason:', transcriptErr);
        }

        // Send DM to creator with close reason
        try {
          const creator = await interaction.client.users.fetch(ticket.userId).catch(() => null);
          if (creator) {
            const dmEmbed = createStyledEmbed({
              emoji: '🔐',
              title: 'Dein Ticket wurde geschlossen',
              description: `Dein Ticket **#${ticket.id}** auf **${interaction.guild.name}** wurde geschlossen.`,
              fields: [
                { name: 'Geschlossen von', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Grund', value: reason, inline: false }
              ],
              color: '#ED4245',
              footer: interaction.guild.name
            });

            await creator.send({ embeds: [dmEmbed] }).catch(() => {});
          }
        } catch (dmErr) {
          console.log('Could not send close DM:', dmErr.message);
        }

        await interaction.editReply({ content: '✅ Ticket wird geschlossen...' });

        logEvent(interaction.guild, `🔐 Ticket #${ticket.id} wurde von <@${interaction.user.id}> geschlossen | Grund: ${reason}`);

        // Archive or delete after delay
        setTimeout(async () => {
          if (cfg.archiveEnabled && cfg.archiveCategoryId) {
            try {
              const archivePermissions = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }
              ];

              const teamRoles = getAllTeamRoles(guildId);
              for (const roleId of teamRoles) {
                if (roleId && roleId.trim()) {
                  archivePermissions.push({
                    id: roleId,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                    deny: [PermissionsBitField.Flags.SendMessages]
                  });
                }
              }

              await interaction.channel.permissionOverwrites.set(archivePermissions);
              await interaction.channel.setParent(cfg.archiveCategoryId, { lockPermissions: false });

              const newName = `closed-${interaction.channel.name}`;
              await interaction.channel.setName(newName);

              ticket.archived = true;
              ticket.archivedAt = Date.now();
              saveTickets(guildId, tickets);
            } catch (archiveErr) {
              console.error('Archive error:', archiveErr);
              await interaction.channel.delete().catch(() => {});
            }
          } else {
            await interaction.channel.delete().catch(() => {});
          }
        }, 5000);

      } catch (err) {
        console.error('Error closing ticket:', err);
        await interaction.editReply({ content: '❌ Fehler beim Schließen des Tickets.' });
      }
    }

    // ===== SUBCOMMAND: REQUEST-CLOSE =====
    if (subcommand === 'request-close') {
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

      if (ticket.archived) {
        const archivedEmbed = createStyledEmbed({
          emoji: '📦',
          title: 'Ticket archiviert',
          description: 'Dieses Ticket ist bereits archiviert.',
          color: '#FFA500'
        });
        return interaction.reply({ embeds: [archivedEmbed], ephemeral: true });
      }

      const isCreator = ticket.userId === interaction.user.id;
      const isAddedUser = ticket.addedUsers && ticket.addedUsers.includes(interaction.user.id);
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      const isClaimer = ticket.claimer === interaction.user.id;

      const requesterType = (isCreator || isAddedUser) ? 'user' : 'team';

      // Save close request
      ticket.closeRequest = {
        requestedBy: interaction.user.id,
        requesterType: requesterType,
        requestedAt: Date.now(),
        status: 'pending'
      };
      saveTickets(guildId, tickets);

      // Build ping mentions
      let pingMentions = '';
      if (requesterType === 'user') {
        if (ticket.claimer) {
          pingMentions = `<@${ticket.claimer}>`;
        } else {
          const teamRoles = getAllTeamRoles(guildId);
          pingMentions = teamRoles.map(roleId => `<@&${roleId}>`).join(' ');
        }
      } else {
        pingMentions = `<@${ticket.userId}>`;
      }

      // Create request embed
      const requestEmbed = createStyledEmbed({
        emoji: '📩',
        title: 'Schließungsanfrage',
        description: `<@${interaction.user.id}> möchte dieses Ticket schließen.`,
        fields: [
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Angefragt von', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Genehmigung erforderlich von', value: requesterType === 'user' ? 'Team/Claimer' : 'Ticket-Ersteller', inline: true }
        ],
        color: '#FEE75C'
      });

      const approveButton = new ButtonBuilder()
        .setCustomId('approve_close_request')
        .setLabel('Genehmigen')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

      const denyButton = new ButtonBuilder()
        .setCustomId('deny_close_request')
        .setLabel('Ablehnen')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌');

      const buttonRow = new ActionRowBuilder().addComponents(approveButton, denyButton);

      const requestMessage = await interaction.channel.send({
        content: pingMentions,
        embeds: [requestEmbed],
        components: [buttonRow]
      });

      // Store message ID
      ticket.closeRequest.messageId = requestMessage.id;
      saveTickets(guildId, tickets);

      const confirmEmbed = createStyledEmbed({
        emoji: '📩',
        title: 'Schließungsanfrage gesendet',
        description: requesterType === 'user'
          ? 'Ein Team-Mitglied oder Claimer muss die Anfrage genehmigen.'
          : 'Der Ticket-Ersteller muss die Anfrage genehmigen.',
        color: '#57F287'
      });

      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

      logEvent(interaction.guild, `📩 Schließungsanfrage für Ticket #${ticket.id} von <@${interaction.user.id}>`);
    }

    // ===== SUBCOMMAND: ELEVATE =====
    if (subcommand === 'elevate') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können die Priorität ändern.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

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

      const currentPriority = ticket.priority || 0;

      if (currentPriority >= 2) {
        const maxPriorityEmbed = createStyledEmbed({
          emoji: '🔴',
          title: 'Maximale Priorität erreicht',
          description: 'Dieses Ticket hat bereits die höchste Priorität (Rot).',
          fields: [
            { name: 'Aktuelle Priorität', value: `${PRIORITY_STATES[currentPriority].dot} ${PRIORITY_STATES[currentPriority].label}`, inline: true }
          ],
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [maxPriorityEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const newPriority = currentPriority + 1;
        ticket.priority = newPriority;
        saveTickets(guildId, tickets);

        // Update channel name with priority indicator
        const oldName = interaction.channel.name;
        let newName = oldName.replace(/^(🟢|🟠|🔴)/, '').trim();
        newName = `${PRIORITY_STATES[newPriority].dot}${newName}`;
        await interaction.channel.setName(newName).catch(() => {});

        // Update permissions for new priority roles
        const newRoles = getHierarchicalPriorityRoles(guildId, newPriority);
        for (const roleId of newRoles) {
          if (roleId && roleId.trim()) {
            await interaction.channel.permissionOverwrites.edit(roleId, {
              ViewChannel: true,
              SendMessages: ticket.claimer ? false : true
            }).catch(() => {});
          }
        }

        const priorityEmbed = createStyledEmbed({
          emoji: '⬆️',
          title: 'Priorität erhöht',
          description: `Die Priorität wurde von <@${interaction.user.id}> erhöht.`,
          fields: [
            { name: 'Vorher', value: `${PRIORITY_STATES[currentPriority].dot} ${PRIORITY_STATES[currentPriority].label}`, inline: true },
            { name: 'Jetzt', value: `${PRIORITY_STATES[newPriority].dot} ${PRIORITY_STATES[newPriority].label}`, inline: true },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true }
          ],
          color: PRIORITY_STATES[newPriority].embedColor
        });

        await interaction.channel.send({ embeds: [priorityEmbed] });
        await interaction.editReply({ content: `✅ Priorität auf ${PRIORITY_STATES[newPriority].label} erhöht!` });

        logEvent(interaction.guild, `⬆️ Ticket #${ticket.id} Priorität erhöht auf ${PRIORITY_STATES[newPriority].label} von <@${interaction.user.id}>`);
      } catch (err) {
        console.error('Error elevating priority:', err);
        await interaction.editReply({ content: '❌ Fehler beim Erhöhen der Priorität.' });
      }
    }

    // ===== SUBCOMMAND: LOWER =====
    if (subcommand === 'lower') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können die Priorität ändern.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

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

      const currentPriority = ticket.priority || 0;

      if (currentPriority <= 0) {
        const minPriorityEmbed = createStyledEmbed({
          emoji: '🟢',
          title: 'Minimale Priorität erreicht',
          description: 'Dieses Ticket hat bereits die niedrigste Priorität (Grün).',
          fields: [
            { name: 'Aktuelle Priorität', value: `${PRIORITY_STATES[currentPriority].dot} ${PRIORITY_STATES[currentPriority].label}`, inline: true }
          ],
          color: '#57F287'
        });
        return interaction.reply({ embeds: [minPriorityEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const newPriority = currentPriority - 1;
        ticket.priority = newPriority;
        saveTickets(guildId, tickets);

        // Update channel name with priority indicator
        const oldName = interaction.channel.name;
        let newName = oldName.replace(/^(🟢|🟠|🔴)/, '').trim();
        newName = `${PRIORITY_STATES[newPriority].dot}${newName}`;
        await interaction.channel.setName(newName).catch(() => {});

        const priorityEmbed = createStyledEmbed({
          emoji: '⬇️',
          title: 'Priorität gesenkt',
          description: `Die Priorität wurde von <@${interaction.user.id}> gesenkt.`,
          fields: [
            { name: 'Vorher', value: `${PRIORITY_STATES[currentPriority].dot} ${PRIORITY_STATES[currentPriority].label}`, inline: true },
            { name: 'Jetzt', value: `${PRIORITY_STATES[newPriority].dot} ${PRIORITY_STATES[newPriority].label}`, inline: true },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true }
          ],
          color: PRIORITY_STATES[newPriority].embedColor
        });

        await interaction.channel.send({ embeds: [priorityEmbed] });
        await interaction.editReply({ content: `✅ Priorität auf ${PRIORITY_STATES[newPriority].label} gesenkt!` });

        logEvent(interaction.guild, `⬇️ Ticket #${ticket.id} Priorität gesenkt auf ${PRIORITY_STATES[newPriority].label} von <@${interaction.user.id}>`);
      } catch (err) {
        console.error('Error lowering priority:', err);
        await interaction.editReply({ content: '❌ Fehler beim Senken der Priorität.' });
      }
    }

    // ===== SUBCOMMAND: MERGE =====
    if (subcommand === 'merge') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Tickets zusammenführen.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

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

      // Find other open tickets
      const openTickets = tickets.filter(t =>
        t.status === 'offen' &&
        t.id !== ticket.id &&
        !t.isApplication &&
        t.status !== 'merged'
      );

      if (openTickets.length === 0) {
        const noTicketsEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Keine Tickets verfügbar',
          description: 'Es gibt keine anderen offenen Tickets zum Zusammenführen.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noTicketsEmbed], ephemeral: true });
      }

      // Create select menu
      const ticketOptions = openTickets.slice(0, 25).map(t => ({
        label: `Ticket #${t.id}`,
        description: `${t.topic || 'Kein Thema'} - ${t.username || 'Unbekannt'}`.substring(0, 100),
        value: `${t.id}`
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`merge_ticket_select:${ticket.id}`)
        .setPlaceholder('Wähle ein Ticket zum Zusammenführen...')
        .addOptions(ticketOptions);

      const selectRow = new ActionRowBuilder().addComponents(selectMenu);

      const mergeEmbed = createStyledEmbed({
        emoji: '🔗',
        title: 'Tickets zusammenführen',
        description: 'Wähle das Ticket, das in dieses Ticket zusammengeführt werden soll.\n\nDas ausgewählte Ticket wird archiviert und alle Benutzer, Notizen und ein Nachrichten-Log werden übernommen.',
        fields: [
          { name: 'Ziel-Ticket', value: `#${ticket.id}`, inline: true }
        ],
        color: '#5865F2'
      });

      await interaction.reply({ embeds: [mergeEmbed], components: [selectRow], ephemeral: true });
    }

    // ===== SUBCOMMAND: VOICE-START =====
    if (subcommand === 'voice-start') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Voice-Channels erstellen.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

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

      if (ticket.voiceChannelId) {
        const existsEmbed = createStyledEmbed({
          emoji: 'ℹ️',
          title: 'Voice-Channel existiert bereits',
          description: `Für dieses Ticket existiert bereits ein Voice-Channel: <#${ticket.voiceChannelId}>`,
          color: '#FEE75C'
        });
        return interaction.reply({ embeds: [existsEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const { createVoiceChannel } = require('../voice-support');
        const voiceChannel = await createVoiceChannel(interaction.guild, ticket, guildId);

        if (!voiceChannel) {
          throw new Error('Voice channel creation failed');
        }

        // Update ticket
        const ticketIndex = tickets.findIndex(t => t.id === ticket.id);
        tickets[ticketIndex].voiceChannelId = voiceChannel.id;
        saveTickets(guildId, tickets);

        const successEmbed = createStyledEmbed({
          emoji: '🎤',
          title: 'Voice-Support erstellt',
          description: `Voice-Channel wurde erfolgreich erstellt!`,
          fields: [
            { name: 'Channel', value: `<#${voiceChannel.id}>`, inline: true },
            { name: 'Ticket', value: `#${ticket.id}`, inline: true }
          ],
          color: '#57F287'
        });

        await interaction.channel.send({ embeds: [successEmbed] });
        await interaction.editReply({ content: `✅ Voice-Channel erstellt: <#${voiceChannel.id}>` });

        logEvent(interaction.guild, `🎤 Voice-Channel für Ticket #${ticket.id} erstellt von <@${interaction.user.id}>`);
      } catch (err) {
        console.error('Error creating voice channel:', err);
        await interaction.editReply({ content: '❌ Fehler beim Erstellen des Voice-Channels.' });
      }
    }

    // ===== SUBCOMMAND: VOICE-END =====
    if (subcommand === 'voice-end') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);

      if (!isTeam) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur Team-Mitglieder können Voice-Channels beenden.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

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

      if (!ticket.voiceChannelId) {
        const noVoiceEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Kein Voice-Channel',
          description: 'Für dieses Ticket existiert kein Voice-Channel.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noVoiceEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const { deleteVoiceChannel } = require('../voice-support');
        await deleteVoiceChannel(interaction.guild, ticket.voiceChannelId, guildId);

        const successEmbed = createStyledEmbed({
          emoji: '🔇',
          title: 'Voice-Support beendet',
          description: 'Der Voice-Channel wurde gelöscht.',
          fields: [
            { name: 'Ticket', value: `#${ticket.id}`, inline: true },
            { name: 'Beendet von', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: '#ED4245'
        });

        await interaction.channel.send({ embeds: [successEmbed] });
        await interaction.editReply({ content: '✅ Voice-Channel beendet!' });

        logEvent(interaction.guild, `🔇 Voice-Channel für Ticket #${ticket.id} beendet von <@${interaction.user.id}>`);
      } catch (err) {
        console.error('Error ending voice channel:', err);
        await interaction.editReply({ content: '❌ Fehler beim Beenden des Voice-Channels.' });
      }
    }

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
      await interaction.deferReply();

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

      if (ticket.claimer !== interaction.user.id) {
        const notClaimerEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Zugriff verweigert',
          description: 'Nur der Claimer kann dieses Ticket einblenden!',
          color: '#ED4245'
        });
        return interaction.editReply({ embeds: [notClaimerEmbed] });
      }

      if (!ticket.hidden) {
        const notHiddenEmbed = createStyledEmbed({
          emoji: 'ℹ️',
          title: 'Ticket bereits sichtbar',
          description: 'Dieses Ticket ist bereits für alle Team-Mitglieder sichtbar.',
          color: '#FEE75C'
        });
        return interaction.editReply({ embeds: [notHiddenEmbed] });
      }

      try {
        const cfg = readCfg(guildId);
        const priority = ticket.priority || 0;
        const priorityRoles = cfg.priorityRoles?.[priority.toString()] || [];

        ticket.hidden = false;
        ticket.unhiddenAt = Date.now();
        ticket.unhiddenBy = interaction.user.id;
        saveTickets(guildId, log);

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
            { name: 'Eingeblendet von', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: '#57F287'
        });

        await interaction.editReply({ embeds: [successEmbed] });
        logEvent(interaction.guild, `👁️ Ticket #${ticket.id} von <@${interaction.user.id}> wieder sichtbar gemacht`);
      } catch (err) {
        console.error('Fehler beim Einblenden:', err);
        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Einblenden',
          description: err.message,
          color: '#ED4245'
        });
        return interaction.editReply({ embeds: [errorEmbed] });
      }
    }

    // ===== SUBCOMMAND: SPLIT =====
    if (subcommand === 'split') {
      const reason = interaction.options.getString('reason');
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
        const counterPath = path.join(CONFIG_DIR, `${guildId}_counter.json`);
        let counter = { count: 0 };
        if (fs.existsSync(counterPath)) {
          counter = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
        }
        counter.count++;
        fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2));

        const newTicketNumber = counter.count;
        const channelName = `ticket-${newTicketNumber}`;

        const newChannel = await interaction.guild.channels.create({
          name: channelName,
          type: 0,
          parent: interaction.channel.parentId,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: ['ViewChannel'] },
            { id: ticket.userId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
            { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
          ]
        });

        const teamRoles = getAllTeamRoles(guildId);
        for (const roleId of teamRoles) {
          await newChannel.permissionOverwrites.edit(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }).catch(() => {});
        }

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

        if (!ticket.splitTo) ticket.splitTo = [];
        ticket.splitTo.push(newTicketNumber);

        log.push(newTicket);
        saveTickets(guildId, log);

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

        const splitNotifyEmbed = createStyledEmbed({
          emoji: '🔀',
          title: 'Ticket wurde gesplittet',
          description: `Ein neues Ticket wurde aus diesem Ticket erstellt.\n\nNeues Ticket: <#${newChannel.id}> (#${newTicketNumber})\nGrund: ${reason}`,
          fields: [
            { name: 'Gesplittet von', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: '#5865F2'
        });

        await interaction.editReply({ embeds: [splitNotifyEmbed] });
        logEvent(interaction.guild, `🔀 Ticket #${ticket.id} in #${newTicketNumber} gesplittet von <@${interaction.user.id}> (Grund: ${reason})`);
      } catch (err) {
        console.error('Fehler beim Splitten:', err);
        const errorEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Fehler beim Splitten',
          description: err.message,
          color: '#ED4245'
        });
        return interaction.editReply({ embeds: [errorEmbed] });
      }
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

      if (ticket.blocked) {
        const alreadyBlockedEmbed = createStyledEmbed({
          emoji: '🔒',
          title: 'Bereits gesperrt',
          description: 'Dieses Ticket ist bereits gesperrt.',
          color: '#FEE75C'
        });
        return interaction.reply({ embeds: [alreadyBlockedEmbed], ephemeral: true });
      }

      await interaction.reply({ content: '🔒 Ticket wird gesperrt...', ephemeral: true });

      try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });

        const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);
        tickets[ticketIndex].blocked = true;
        tickets[ticketIndex].blockedAt = Date.now();
        tickets[ticketIndex].blockedBy = interaction.user.id;
        saveTickets(guildId, tickets);

        const blockEmbed = createStyledEmbed({
          emoji: '🔒',
          title: 'Ticket gesperrt',
          description: 'Dieses Ticket wurde gesperrt.\n\nEs können keine Nachrichten mehr gesendet werden.',
          fields: [
            { name: 'Ticket', value: `#${String(ticket.id).padStart(5, '0')}`, inline: true },
            { name: 'Gesperrt von', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
          ],
          color: '#ED4245',
          footer: 'Quantix Tickets • Ticket gesperrt'
        });

        await interaction.channel.send({ embeds: [blockEmbed] });
        logEvent(interaction.guild, `🔒 Ticket #${ticket.id} wurde von <@${interaction.user.id}> gesperrt`);
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

      if (!ticket.blocked) {
        const notBlockedEmbed = createStyledEmbed({
          emoji: '🔓',
          title: 'Nicht gesperrt',
          description: 'Dieses Ticket ist nicht gesperrt.',
          color: '#F59E0B'
        });
        return interaction.reply({ embeds: [notBlockedEmbed], ephemeral: true });
      }

      await interaction.reply({ content: '🔓 Ticket wird entsperrt...', ephemeral: true });

      try {
        const cfg = readCfg(guildId);
        const permissions = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        if (ticket.addedUsers && Array.isArray(ticket.addedUsers)) {
          ticket.addedUsers.forEach(uid => {
            permissions.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
          });
        }

        if (ticket.claimer) {
          permissions.push({ id: ticket.claimer, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        }

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

        const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);
        tickets[ticketIndex].blocked = false;
        tickets[ticketIndex].unblockedAt = Date.now();
        tickets[ticketIndex].unblockedBy = interaction.user.id;
        saveTickets(guildId, tickets);

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
        logEvent(interaction.guild, `🔓 Ticket #${ticket.id} wurde von <@${interaction.user.id}> entsperrt`);
        await interaction.editReply({ content: '✅ Ticket wurde entsperrt!' });
      } catch (err) {
        console.error('Error unblocking ticket:', err);
        await interaction.editReply({ content: '❌ Fehler beim Entsperren des Tickets.' });
      }
    }

    // ===== SUBCOMMAND: RENAME =====
    if (subcommand === 'rename') {
      const newName = interaction.options.getString('name');
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

      const isClaimer = ticket.claimer === interaction.user.id;
      const isCreator = ticket.userId === interaction.user.id;
      if (!isTeam && !isClaimer && !isCreator) {
        const noPermEmbed = createStyledEmbed({
          emoji: '🚫',
          title: 'Keine Berechtigung',
          description: 'Nur Team-Mitglieder, der Claimer oder der Ticket-Ersteller können das Ticket umbenennen.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      const sanitizedName = newName
        .toLowerCase()
        .replace(/[^a-z0-9äöüß\-_]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 100);

      if (!sanitizedName || sanitizedName.length < 1) {
        const invalidNameEmbed = createStyledEmbed({
          emoji: '❌',
          title: 'Ungültiger Name',
          description: 'Der Channel-Name enthält keine gültigen Zeichen.',
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [invalidNameEmbed], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const oldName = interaction.channel.name;
        await interaction.channel.setName(sanitizedName);

        const ticketIndex = tickets.findIndex(t => t.channelId === interaction.channel.id);
        tickets[ticketIndex].renamedAt = Date.now();
        tickets[ticketIndex].renamedBy = interaction.user.id;
        tickets[ticketIndex].previousName = oldName;
        saveTickets(guildId, tickets);

        const renameEmbed = createStyledEmbed({
          emoji: '✏️',
          title: 'Ticket umbenannt',
          description: `Der Channel wurde umbenannt.`,
          fields: [
            { name: 'Alter Name', value: `\`${oldName}\``, inline: true },
            { name: 'Neuer Name', value: `\`${sanitizedName}\``, inline: true },
            { name: 'Umbenannt von', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: '#5865F2',
          footer: 'Quantix Tickets'
        });

        await interaction.channel.send({ embeds: [renameEmbed] });
        logEvent(interaction.guild, `✏️ Ticket #${ticket.id} von \`${oldName}\` zu \`${sanitizedName}\` umbenannt von <@${interaction.user.id}>`);
        await interaction.editReply({ content: `✅ Channel wurde zu \`${sanitizedName}\` umbenannt!` });
      } catch (err) {
        console.error('Error renaming ticket:', err);
        await interaction.editReply({ content: '❌ Fehler beim Umbenennen des Tickets. Möglicherweise Rate-Limit erreicht.' });
      }
    }

    // Forward other subcommands to existing handlers or implement as needed
    // (blacklist-*, forward, note-*, tag-*, department-*, pause, resume, open-as)
    // These would follow the same pattern as above
  },
};
