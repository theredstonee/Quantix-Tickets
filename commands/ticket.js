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
    ),

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
          .setDescription('**Nur der Claimer kann dieses Ticket verstecken!**')
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👤 Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return interaction.reply({ embeds: [notClaimerEmbed], ephemeral: true });
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

    // ===== SUBCOMMAND: UNHIDE =====
    if (subcommand === 'unhide') {
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
          .setDescription('**Nur der Claimer kann dieses Ticket einblenden!**')
          .addFields(
            { name: '🎫 Ticket', value: `#${ticket.id}`, inline: true },
            { name: '👤 Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
          )
          .setFooter({ text: 'Quantix Tickets • Zugriff verweigert' })
          .setTimestamp();

        return interaction.reply({ embeds: [notClaimerEmbed], ephemeral: true });
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

          return interaction.reply({ embeds: [notHiddenEmbed], ephemeral: true });
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
  },
};
