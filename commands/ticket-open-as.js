const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

function readCfg(guildId) {
  const cfgPath = path.join(__dirname, '..', 'configs', `${guildId}.json`);
  if (!fs.existsSync(cfgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeCfg(guildId, data) {
  const cfgPath = path.join(__dirname, '..', 'configs', `${guildId}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2));
}

function loadTickets(guildId) {
  const ticketsPath = path.join(__dirname, '..', 'configs', `${guildId}_tickets.json`);
  if (!fs.existsSync(ticketsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  const ticketsPath = path.join(__dirname, '..', 'configs', `${guildId}_tickets.json`);
  fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));
}

function getNextTicketNumber(guildId) {
  const counterPath = path.join(__dirname, '..', 'configs', `${guildId}_counter.json`);
  let counter = 1;

  if (fs.existsSync(counterPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
      counter = data.counter || 1;
    } catch {}
  }

  const nextCounter = counter + 1;
  fs.writeFileSync(counterPath, JSON.stringify({ counter: nextCounter }, null, 2));

  return counter;
}

function hasAnyTeamRole(member, guildId) {
  const cfg = readCfg(guildId);
  if (!cfg) return false;

  const teamRoles = [];

  // Legacy teamRoleId
  if (cfg.teamRoleId) {
    const ids = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
    teamRoles.push(...ids);
  }

  // Priority roles
  if (cfg.priorityRoles) {
    Object.values(cfg.priorityRoles).forEach(roles => {
      if (Array.isArray(roles)) {
        teamRoles.push(...roles);
      } else if (typeof roles === 'string') {
        teamRoles.push(roles);
      }
    });
  }

  return teamRoles.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands')
    .setDescriptionLocalizations({
      de: 'Ticket-Verwaltungsbefehle'
    })
    .addSubcommand(sub => sub
      .setName('open-as')
      .setDescription('Open a ticket as another user (Admin/Team only)')
      .setDescriptionLocalizations({
        de: 'Öffne ein Ticket als anderer User (nur Admin/Team)'
      })
      .addUserOption(option => option
        .setName('user')
        .setDescription('The user to open the ticket for')
        .setDescriptionLocalizations({
          de: 'Der User für den das Ticket geöffnet werden soll'
        })
        .setRequired(true)
      )
      .addStringOption(option => option
        .setName('reason')
        .setDescription('Reason for opening the ticket')
        .setDescriptionLocalizations({
          de: 'Grund für die Ticket-Eröffnung'
        })
        .setRequired(false)
      )
    )
    .setDMPermission(false),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'open-as') {
      await this.handleOpenAs(interaction);
    }
  },

  async handleOpenAs(interaction) {
    const guildId = interaction.guild.id;
    const cfg = readCfg(guildId);

    if (!cfg) {
      return interaction.reply({
        content: '⚠️ Bot ist nicht konfiguriert. Nutze `/setup` zuerst.',
        ephemeral: true
      });
    }

    // Permission check: Admin or Team role
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const isTeam = hasAnyTeamRole(interaction.member, guildId);

    if (!isAdmin && !isTeam) {
      return interaction.reply({
        content: '❌ Du benötigst Administrator-Rechte oder eine Team-Rolle um diesen Command zu nutzen.',
        ephemeral: true
      });
    }

    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'Vom Team eröffnet';

    // Check if target user is bot
    if (targetUser.bot) {
      return interaction.reply({
        content: '❌ Du kannst kein Ticket für einen Bot öffnen.',
        ephemeral: true
      });
    }

    // Check if topics exist
    if (!cfg.topics || cfg.topics.length === 0) {
      return interaction.reply({
        content: '❌ Keine Ticket-Themen konfiguriert. Nutze das Dashboard.',
        ephemeral: true
      });
    }

    // Build select menu with topics
    const topicOptions = cfg.topics
      .filter(t => t.label && t.value)
      .slice(0, 25) // Discord limit
      .map(topic => ({
        label: topic.label,
        value: topic.value,
        description: topic.description ? topic.description.substring(0, 100) : undefined,
        emoji: topic.emoji || '🎫'
      }));

    if (topicOptions.length === 0) {
      return interaction.reply({
        content: '❌ Keine gültigen Ticket-Themen gefunden.',
        ephemeral: true
      });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`ticket_openas_${targetUser.id}_${interaction.user.id}`)
      .setPlaceholder('Wähle ein Ticket-Thema aus')
      .addOptions(topicOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket öffnen als anderer User')
      .setDescription(
        `**Für User:** ${targetUser}\n` +
        `**Grund:** ${reason}\n\n` +
        `Wähle unten ein Ticket-Thema aus:`
      )
      .setColor(0x00ff88)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });

    // Store reason in message for select menu handler
    // Will be picked up by index.js when select menu is used
  },

  // Function to create the ticket (called from select menu handler in index.js)
  async createTicketAs(guild, targetUser, executor, topicValue, reason) {
    const guildId = guild.id;
    const cfg = readCfg(guildId);

    if (!cfg) throw new Error('Bot nicht konfiguriert');

    // Find topic config
    const topic = cfg.topics?.find(t => t.value === topicValue);
    if (!topic) throw new Error('Ungültiges Ticket-Thema');

    try {
      const ticketNumber = getNextTicketNumber(guildId);
      const channelName = `ticket-${ticketNumber}`;

      // Get category
      let categoryId = topic.categoryId || cfg.categoryId;
      let category = null;
      if (categoryId) {
        try {
          category = await guild.channels.fetch(categoryId);
        } catch (err) {
          console.error('Category fetch error:', err);
        }
      }

      // Create channel
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category?.id || null,
        topic: `Ticket #${ticketNumber} - ${topic.label} - Erstellt für: ${targetUser.tag}`,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: targetUser.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          {
            id: executor.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ]
          }
        ]
      });

      // Add team roles permissions
      const teamRoles = [];
      if (cfg.teamRoleId) {
        const ids = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
        teamRoles.push(...ids);
      }
      if (cfg.priorityRoles) {
        Object.values(cfg.priorityRoles).forEach(roles => {
          if (Array.isArray(roles)) {
            teamRoles.push(...roles);
          } else if (typeof roles === 'string') {
            teamRoles.push(roles);
          }
        });
      }

      for (const roleId of teamRoles) {
        try {
          await channel.permissionOverwrites.create(roleId, {
            ViewChannel: false // Team can't see claimed tickets
          });
        } catch (err) {
          console.error('Permission error for role:', roleId, err);
        }
      }

      // Create ticket embed
      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 Ticket #${ticketNumber}`)
        .setDescription(
          `**Thema:** ${topic.label}\n` +
          `**Erstellt für:** ${targetUser}\n` +
          `**Eröffnet von:** ${executor}\n` +
          `**Grund:** ${reason}\n\n` +
          `Ein Team-Mitglied wird sich zeitnah um dein Anliegen kümmern.`
        )
        .setColor(topic.embedColor || cfg.embedColor || 0x00ff88)
        .setTimestamp()
        .setFooter({ text: `Ticket #${ticketNumber}` });

      // Buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('🔒 Schließen')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket_unclaim')
          .setLabel('🔓 Freigeben')
          .setStyle(ButtonStyle.Secondary)
      );

      const ticketMessage = await channel.send({
        content: `${targetUser} | Dein Ticket wurde vom Team eröffnet.`,
        embeds: [ticketEmbed],
        components: [buttons]
      });

      // Save ticket
      const tickets = loadTickets(guildId);
      const newTicket = {
        id: ticketNumber,
        channelId: channel.id,
        createdBy: targetUser.id,
        createdAt: Date.now(),
        topic: topicValue,
        topicLabel: topic.label,
        status: 'open',
        claimer: executor.id,
        claimedAt: Date.now(),
        openedByTeam: true,
        teamOpener: executor.id,
        openReason: reason,
        messageId: ticketMessage.id,
        addedUsers: []
      };

      tickets.push(newTicket);
      saveTickets(guildId, tickets);

      // Log event
      if (cfg.logChannelId) {
        try {
          const logChannel = await guild.channels.fetch(cfg.logChannelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setDescription(
                `📋 **Ticket als anderer User eröffnet**\n\n` +
                `**Ticket:** #${ticketNumber}\n` +
                `**Für User:** ${targetUser}\n` +
                `**Eröffnet von:** ${executor}\n` +
                `**Thema:** ${topic.label}\n` +
                `**Grund:** ${reason}\n` +
                `**Status:** Automatisch claimed`
              )
              .setColor(0x00ff88)
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });
          }
        } catch (err) {
          console.error('Log channel error:', err);
        }
      }

      // Return success data
      return {
        success: true,
        ticketNumber,
        channel,
        ticket: newTicket
      };

    } catch (err) {
      console.error('Ticket open-as error:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }
};
