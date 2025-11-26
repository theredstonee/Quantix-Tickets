/**
 * Interaction Handlers für Custom Bots (Whitelabel)
 * Enthält Handler für Buttons, Select Menus und Modals
 */

const {
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { t, getGuildLanguage } = require('./translations');
const { sanitizeUsername, validateDiscordId, sanitizeString } = require('./xss-protection');

const CONFIG_DIR = path.join(__dirname, 'configs');

// Utility functions
function readCfg(guildId) {
  try {
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data || {};
  } catch {
    return {};
  }
}

function writeCfg(guildId, data) {
  try {
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('writeCfg error:', err);
  }
}

function getTicketsPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

function getCounterPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_counter.json`);
}

function loadTickets(guildId) {
  try {
    const data = fs.readFileSync(getTicketsPath(guildId), 'utf8');
    return JSON.parse(data) || [];
  } catch {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  fs.writeFileSync(getTicketsPath(guildId), JSON.stringify(tickets, null, 2));
}

function loadCounter(guildId) {
  try {
    const data = fs.readFileSync(getCounterPath(guildId), 'utf8');
    return JSON.parse(data).count || 0;
  } catch {
    return 0;
  }
}

function saveCounter(guildId, count) {
  fs.writeFileSync(getCounterPath(guildId), JSON.stringify({ count }));
}

function hasTeamRole(member, cfg) {
  if (!member || !cfg.teamRoleId) return false;
  const teamRoleIds = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
  return teamRoleIds.some(roleId => member.roles.cache.has(roleId));
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

  for (let level = priority; level >= 0; level--) {
    const levelRoles = cfg.priorityRoles[level.toString()] || [];
    if (Array.isArray(levelRoles)) {
      levelRoles.forEach(r => roles.add(r));
    }
  }

  return Array.from(roles).filter(r => r && r.trim());
}

// Button rows generator
function buttonRows(claimed, guildId, ticket = null) {
  const cfg = readCfg(guildId);
  const lang = getGuildLanguage(guildId);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_request')
      .setLabel(t(guildId, 'button.close_request') || 'Schließen anfragen')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📩')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close')
      .setLabel(t(guildId, 'button.close') || 'Schließen')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('priority_up')
      .setLabel(t(guildId, 'button.priority_up') || 'Priorität ↑')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔺'),
    new ButtonBuilder()
      .setCustomId('priority_down')
      .setLabel(t(guildId, 'button.priority_down') || 'Priorität ↓')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔻'),
    new ButtonBuilder()
      .setCustomId(claimed ? 'unclaim' : 'claim')
      .setLabel(claimed ? (t(guildId, 'button.unclaim') || 'Freigeben') : (t(guildId, 'button.claim') || 'Übernehmen'))
      .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(claimed ? '📤' : '📥')
  );

  const row3Components = [
    new ButtonBuilder()
      .setCustomId('add_user')
      .setLabel(t(guildId, 'button.add_user') || 'User hinzufügen')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('👤')
  ];

  // Voice support button
  if (cfg.voiceEnabled && cfg.voiceCategory) {
    const hasVoice = ticket && ticket.voiceChannelId;
    row3Components.push(
      new ButtonBuilder()
        .setCustomId(hasVoice ? 'end_voice' : 'request_voice')
        .setLabel(hasVoice ? 'Voice beenden' : 'Voice Support')
        .setStyle(hasVoice ? ButtonStyle.Danger : ButtonStyle.Primary)
        .setEmoji(hasVoice ? '🔇' : '🔊')
    );
  }

  // Hide/Unhide button (only if claimed)
  if (claimed && ticket) {
    const isHidden = ticket.hidden === true;
    row3Components.push(
      new ButtonBuilder()
        .setCustomId(isHidden ? 'unhide_ticket' : 'hide_ticket')
        .setLabel(isHidden ? 'Einblenden' : 'Verstecken')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(isHidden ? '👁️' : '🔒')
    );
  }

  const row3 = new ActionRowBuilder().addComponents(row3Components);

  return [row1, row2, row3];
}

// Topic select menu
function topicRow(guildId) {
  const cfg = readCfg(guildId);
  const topics = cfg.topics || [];

  if (topics.length === 0) {
    return null;
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder(t(guildId, 'select.topic_placeholder') || 'Wähle dein Thema …')
      .addOptions(topics.map(tp => ({
        label: tp.label,
        value: tp.value,
        emoji: tp.emoji || undefined
      })))
  );
}

/**
 * Handle Button interactions
 */
async function handleButton(interaction, guildId) {
  const customId = interaction.customId;
  const cfg = readCfg(guildId);

  // Claim button
  if (customId === 'claim') {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    if (ticket.claimed) {
      return interaction.reply({ content: '❌ Ticket ist bereits übernommen.', ephemeral: true });
    }

    // Check team role
    if (!hasTeamRole(interaction.member, cfg)) {
      return interaction.reply({ content: '❌ Du hast keine Berechtigung.', ephemeral: true });
    }

    ticket.claimed = true;
    ticket.claimedBy = interaction.user.id;
    ticket.claimedAt = Date.now();
    saveTickets(guildId, tickets);

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setDescription(`📥 **Ticket übernommen von** ${interaction.user}`)
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    await interaction.update({ components: buttonRows(true, guildId, ticket) });

    // Update channel name
    try {
      const newName = `🟢-ticket-${ticket.number}`;
      await interaction.channel.setName(newName);
    } catch (err) {
      console.error('Channel rename error:', err);
    }
  }

  // Unclaim button
  if (customId === 'unclaim') {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    if (!ticket.claimed) {
      return interaction.reply({ content: '❌ Ticket ist nicht übernommen.', ephemeral: true });
    }

    // Only claimer or admin can unclaim
    if (ticket.claimedBy !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ Nur der Bearbeiter kann das Ticket freigeben.', ephemeral: true });
    }

    ticket.claimed = false;
    ticket.claimedBy = null;
    ticket.hidden = false;
    saveTickets(guildId, tickets);

    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setDescription(`📤 **Ticket freigegeben von** ${interaction.user}`)
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    await interaction.update({ components: buttonRows(false, guildId, ticket) });

    // Update channel name
    try {
      const newName = `🟡-ticket-${ticket.number}`;
      await interaction.channel.setName(newName);
    } catch (err) {
      console.error('Channel rename error:', err);
    }
  }

  // Close request button
  if (customId === 'close_request') {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    const isTeam = hasTeamRole(interaction.member, cfg);
    const isCreator = ticket.userId === interaction.user.id;

    // Determine who to ping
    let pingMessage = '';
    if (isTeam) {
      // Team requests close -> ping creator and added users
      pingMessage = `<@${ticket.userId}>`;
      if (ticket.addedUsers && ticket.addedUsers.length > 0) {
        pingMessage += ' ' + ticket.addedUsers.map(id => `<@${id}>`).join(' ');
      }
    } else if (isCreator) {
      // User requests close -> ping claimer or team
      if (ticket.claimed && ticket.claimedBy) {
        pingMessage = `<@${ticket.claimedBy}>`;
      } else {
        const teamRoleIds = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
        pingMessage = teamRoleIds.filter(r => r).map(r => `<@&${r}>`).join(' ');
      }
    }

    if (pingMessage) {
      await interaction.channel.send({ content: pingMessage });
    }

    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle('📩 ' + (t(guildId, 'ticket.close_request_title') || 'Schließungsanfrage'))
      .setDescription(`${interaction.user} ${t(guildId, 'ticket.close_request_desc') || 'möchte das Ticket schließen.'}`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('approve_close_request')
        .setLabel(t(guildId, 'button.approve') || 'Annehmen')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId('deny_close_request')
        .setLabel(t(guildId, 'button.deny') || 'Ablehnen')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  }

  // Approve close request
  if (customId === 'approve_close_request') {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff88)
          .setDescription(`✅ ${t(guildId, 'ticket.close_approved') || 'Schließung genehmigt von'} ${interaction.user}`)
      ],
      components: []
    });

    // Close ticket after delay
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
        ticket.closedAt = Date.now();
        ticket.closedBy = interaction.user.id;
        saveTickets(guildId, tickets);
      } catch (err) {
        console.error('Channel delete error:', err);
      }
    }, 3000);
  }

  // Deny close request
  if (customId === 'deny_close_request') {
    // Show modal for reason
    const modal = new ModalBuilder()
      .setCustomId('deny_close_reason_modal')
      .setTitle(t(guildId, 'modal.deny_reason_title') || 'Grund für Ablehnung');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel(t(guildId, 'modal.reason_label') || 'Grund')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder(t(guildId, 'modal.reason_placeholder') || 'Optional: Grund für die Ablehnung...')
      )
    );

    await interaction.showModal(modal);
  }

  // Close button (direct close)
  if (customId === 'close') {
    const isTeam = hasTeamRole(interaction.member, cfg);
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    if (!isTeam && ticket.userId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Du hast keine Berechtigung.', ephemeral: true });
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff5555)
          .setDescription(`🔒 ${t(guildId, 'ticket.closing') || 'Ticket wird geschlossen...'}`)
      ]
    });

    ticket.closedAt = Date.now();
    ticket.closedBy = interaction.user.id;
    saveTickets(guildId, tickets);

    setTimeout(async () => {
      try {
        await interaction.channel.delete();
      } catch (err) {
        console.error('Channel delete error:', err);
      }
    }, 3000);
  }

  // Priority up
  if (customId === 'priority_up') {
    const isTeam = hasTeamRole(interaction.member, cfg);
    if (!isTeam) {
      return interaction.reply({ content: '❌ Du hast keine Berechtigung.', ephemeral: true });
    }

    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    const currentPriority = ticket.priority || 0;
    if (currentPriority >= 2) {
      return interaction.reply({ content: '❌ Maximale Priorität erreicht.', ephemeral: true });
    }

    ticket.priority = currentPriority + 1;
    saveTickets(guildId, tickets);

    const priorityColors = { 0: 0x00ff88, 1: 0xffaa00, 2: 0xff5555 };
    const priorityNames = { 0: '🟢 Normal', 1: '🟠 Mittel', 2: '🔴 Hoch' };

    const embed = new EmbedBuilder()
      .setColor(priorityColors[ticket.priority])
      .setDescription(`🔺 **Priorität erhöht auf:** ${priorityNames[ticket.priority]}`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Update channel name
    const priorityEmojis = { 0: '🟢', 1: '🟠', 2: '🔴' };
    try {
      await interaction.channel.setName(`${priorityEmojis[ticket.priority]}-ticket-${ticket.number}`);
    } catch (err) {
      console.error('Channel rename error:', err);
    }
  }

  // Priority down
  if (customId === 'priority_down') {
    const isTeam = hasTeamRole(interaction.member, cfg);
    if (!isTeam) {
      return interaction.reply({ content: '❌ Du hast keine Berechtigung.', ephemeral: true });
    }

    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    const currentPriority = ticket.priority || 0;
    if (currentPriority <= 0) {
      return interaction.reply({ content: '❌ Minimale Priorität erreicht.', ephemeral: true });
    }

    ticket.priority = currentPriority - 1;
    saveTickets(guildId, tickets);

    const priorityColors = { 0: 0x00ff88, 1: 0xffaa00, 2: 0xff5555 };
    const priorityNames = { 0: '🟢 Normal', 1: '🟠 Mittel', 2: '🔴 Hoch' };

    const embed = new EmbedBuilder()
      .setColor(priorityColors[ticket.priority])
      .setDescription(`🔻 **Priorität gesenkt auf:** ${priorityNames[ticket.priority]}`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    const priorityEmojis = { 0: '🟢', 1: '🟠', 2: '🔴' };
    try {
      await interaction.channel.setName(`${priorityEmojis[ticket.priority]}-ticket-${ticket.number}`);
    } catch (err) {
      console.error('Channel rename error:', err);
    }
  }

  // Hide ticket
  if (customId === 'hide_ticket') {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    if (!ticket.claimed || ticket.claimedBy !== interaction.user.id) {
      return interaction.reply({ content: '❌ Nur der Bearbeiter kann das Ticket verstecken.', ephemeral: true });
    }

    // Hide from team roles
    const teamRoleIds = getHierarchicalPriorityRoles(guildId, ticket.priority || 0);
    for (const roleId of teamRoleIds) {
      try {
        await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: false });
      } catch (err) {
        console.error('Permission edit error:', err);
      }
    }

    ticket.hidden = true;
    saveTickets(guildId, tickets);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(`🔒 **Ticket versteckt von** ${interaction.user}`)
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    await interaction.update({ components: buttonRows(true, guildId, ticket) });
  }

  // Unhide ticket
  if (customId === 'unhide_ticket') {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    if (!ticket.claimed || ticket.claimedBy !== interaction.user.id) {
      return interaction.reply({ content: '❌ Nur der Bearbeiter kann das Ticket einblenden.', ephemeral: true });
    }

    // Show to team roles
    const teamRoleIds = getHierarchicalPriorityRoles(guildId, ticket.priority || 0);
    for (const roleId of teamRoleIds) {
      try {
        await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: true });
      } catch (err) {
        console.error('Permission edit error:', err);
      }
    }

    ticket.hidden = false;
    saveTickets(guildId, tickets);

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setDescription(`👁️ **Ticket eingeblendet von** ${interaction.user}`)
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    await interaction.update({ components: buttonRows(true, guildId, ticket) });
  }

  // Add user button
  if (customId === 'add_user') {
    const modal = new ModalBuilder()
      .setCustomId('add_user_modal')
      .setTitle(t(guildId, 'modal.add_user_title') || 'Benutzer hinzufügen');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel(t(guildId, 'modal.user_id_label') || 'User-ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('123456789012345678')
          .setMinLength(17)
          .setMaxLength(20)
      )
    );

    await interaction.showModal(modal);
  }
}

/**
 * Handle Select Menu interactions
 */
async function handleSelectMenu(interaction, guildId) {
  const customId = interaction.customId;
  const cfg = readCfg(guildId);

  // Topic selection
  if (customId === 'topic') {
    const selectedTopic = interaction.values[0];
    const topic = cfg.topics?.find(t => t.value === selectedTopic);

    if (!topic) {
      return interaction.reply({ content: '❌ Thema nicht gefunden.', ephemeral: true });
    }

    // Check if user has open ticket limit
    const tickets = loadTickets(guildId);
    const userTickets = tickets.filter(t => t.userId === interaction.user.id && !t.closedAt);
    const maxTickets = cfg.maxTicketsPerUser || 3;

    if (userTickets.length >= maxTickets) {
      return interaction.reply({
        content: `❌ Du hast bereits ${maxTickets} offene Tickets.`,
        ephemeral: true
      });
    }

    // Get form fields for this topic
    const formFields = (cfg.formFields || []).filter(f => {
      if (!f.topic) return true;
      if (Array.isArray(f.topic)) return f.topic.includes(selectedTopic);
      return f.topic === selectedTopic;
    });

    if (formFields.length > 0) {
      // Show form modal
      const modal = new ModalBuilder()
        .setCustomId(`ticket_form_${selectedTopic}`)
        .setTitle(topic.label || 'Ticket erstellen');

      const components = formFields.slice(0, 5).map(field => {
        const style = field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short;
        return new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label)
            .setStyle(style)
            .setRequired(field.required !== false)
            .setPlaceholder(field.placeholder || '')
        );
      });

      modal.addComponents(components);
      await interaction.showModal(modal);
    } else {
      // Create ticket directly
      await createTicket(interaction, guildId, topic, {});
    }
  }
}

/**
 * Handle Modal submissions
 */
async function handleModal(interaction, guildId) {
  const customId = interaction.customId;
  const cfg = readCfg(guildId);

  // Ticket form modal
  if (customId.startsWith('ticket_form_')) {
    const topicValue = customId.replace('ticket_form_', '');
    const topic = cfg.topics?.find(t => t.value === topicValue);

    if (!topic) {
      return interaction.reply({ content: '❌ Thema nicht gefunden.', ephemeral: true });
    }

    // Collect form data
    const formData = {};
    const formFields = cfg.formFields || [];

    for (const field of formFields) {
      try {
        const value = interaction.fields.getTextInputValue(field.id);
        if (value) formData[field.id] = value;
      } catch {
        // Field not in this modal
      }
    }

    await createTicket(interaction, guildId, topic, formData);
  }

  // Add user modal
  if (customId === 'add_user_modal') {
    const userId = interaction.fields.getTextInputValue('user_id').trim();

    if (!validateDiscordId(userId)) {
      return interaction.reply({ content: '❌ Ungültige User-ID.', ephemeral: true });
    }

    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      return interaction.reply({ content: '❌ Ticket nicht gefunden.', ephemeral: true });
    }

    // Add user to channel
    try {
      await interaction.channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      if (!ticket.addedUsers) ticket.addedUsers = [];
      if (!ticket.addedUsers.includes(userId)) {
        ticket.addedUsers.push(userId);
        saveTickets(guildId, tickets);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setDescription(`👤 <@${userId}> wurde zum Ticket hinzugefügt.`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('Add user error:', err);
      await interaction.reply({ content: '❌ Benutzer konnte nicht hinzugefügt werden.', ephemeral: true });
    }
  }

  // Deny close reason modal
  if (customId === 'deny_close_reason_modal') {
    const reason = interaction.fields.getTextInputValue('reason') || 'Kein Grund angegeben';

    const embed = new EmbedBuilder()
      .setColor(0xff5555)
      .setDescription(`❌ **Schließung abgelehnt von** ${interaction.user}\n**Grund:** ${sanitizeString(reason)}`)
      .setTimestamp();

    // Update the original close request message
    try {
      await interaction.message.edit({
        embeds: [embed],
        components: []
      });
    } catch {
      // Message might be deleted
    }

    await interaction.reply({ content: '✅ Schließung abgelehnt.', ephemeral: true });
  }
}

/**
 * Create a new ticket
 */
async function createTicket(interaction, guildId, topic, formData) {
  const cfg = readCfg(guildId);

  await interaction.deferReply({ ephemeral: true });

  // Get next ticket number
  let ticketNumber = loadCounter(guildId) + 1;
  saveCounter(guildId, ticketNumber);

  // Get category
  const categoryId = topic.categoryId || cfg.ticketCategory || null;

  // Create channel
  const channelName = `🟡-ticket-${ticketNumber}`;

  try {
    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles
        ]
      }
    ];

    // Add team roles
    const teamRoleIds = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId];
    for (const roleId of teamRoleIds.filter(r => r)) {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages
        ]
      });
    }

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites
    });

    // Create ticket data
    const ticket = {
      id: `${guildId}-${ticketNumber}`,
      number: ticketNumber,
      channelId: channel.id,
      userId: interaction.user.id,
      topic: topic.value,
      topicLabel: topic.label,
      formData: formData,
      priority: 0,
      claimed: false,
      claimedBy: null,
      addedUsers: [],
      createdAt: Date.now()
    };

    // Save ticket
    const tickets = loadTickets(guildId);
    tickets.push(ticket);
    saveTickets(guildId, tickets);

    // Build ticket embed
    const ticketEmbed = cfg.ticketEmbed || {};
    let description = (ticketEmbed.description || 'Hallo {userMention}\n**Thema:** {topicLabel}')
      .replace(/{ticketNumber}/g, ticketNumber)
      .replace(/{userMention}/g, `<@${interaction.user.id}>`)
      .replace(/{userId}/g, interaction.user.id)
      .replace(/{topicLabel}/g, topic.label)
      .replace(/{topicValue}/g, topic.value);

    // Add form fields to description
    if (Object.keys(formData).length > 0) {
      description += '\n\n**Angaben:**';
      const formFields = cfg.formFields || [];
      for (const [fieldId, value] of Object.entries(formData)) {
        const field = formFields.find(f => f.id === fieldId);
        const label = field?.label || fieldId;
        description += `\n**${label}:** ${sanitizeString(value)}`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle((ticketEmbed.title || '🎫 Ticket #{ticketNumber}').replace(/{ticketNumber}/g, ticketNumber))
      .setDescription(description)
      .setColor(ticketEmbed.color ? parseInt(ticketEmbed.color.replace('#', ''), 16) : 0xffaa00)
      .setTimestamp();

    if (ticketEmbed.footer) {
      embed.setFooter({ text: ticketEmbed.footer });
    }

    // Send ticket message
    await channel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [embed],
      components: buttonRows(false, guildId, ticket)
    });

    // Ping team roles if configured
    if (cfg.pingTeamOnCreate !== false) {
      const teamPings = teamRoleIds.filter(r => r).map(r => `<@&${r}>`).join(' ');
      if (teamPings) {
        const pingMsg = await channel.send({ content: teamPings });
        setTimeout(() => pingMsg.delete().catch(() => {}), 3000);
      }
    }

    // Reply to user
    await interaction.editReply({
      content: `✅ Dein Ticket wurde erstellt: ${channel}`,
      ephemeral: true
    });

  } catch (err) {
    console.error('Create ticket error:', err);
    await interaction.editReply({
      content: '❌ Ticket konnte nicht erstellt werden.',
      ephemeral: true
    });
  }
}

module.exports = {
  handleButton,
  handleSelectMenu,
  handleModal,
  createTicket,
  buttonRows,
  topicRow,
  loadTickets,
  saveTickets,
  readCfg,
  writeCfg,
  hasTeamRole
};
