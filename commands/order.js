/**
 * Order System Command for Quantix Tickets Bot
 * Full SQLite integration with all features
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  PermissionsBitField,
  ChannelType,
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const {
  readCfg,
  writeCfg,
  getNextOrderNumber,
  getOrder,
  getOrderByChannel,
  getOrders,
  getOrdersByUser,
  getOpenOrderByUser,
  createOrder,
  updateOrder,
  deleteOrder,
  getOrderStats
} = require('../database');

const { createStyledEmbed } = require('../helpers');

// ============================================================
// CONSTANTS
// ============================================================

const ORDER_STATUS = {
  NEW: { key: 'new', emoji: '🆕', label: 'Neu', color: '#5865F2' },
  PROCESSING: { key: 'processing', emoji: '⚙️', label: 'In Bearbeitung', color: '#FEE75C' },
  SHIPPED: { key: 'shipped', emoji: '📦', label: 'Versandt', color: '#57F287' },
  COMPLETED: { key: 'completed', emoji: '✅', label: 'Abgeschlossen', color: '#57F287' },
  CANCELLED: { key: 'cancelled', emoji: '❌', label: 'Storniert', color: '#ED4245' },
  REFUNDED: { key: 'refunded', emoji: '💸', label: 'Erstattet', color: '#EB459E' }
};

const TRANSCRIPTS_DIR = path.join(__dirname, '..', 'transcripts');

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get order config from guild config
 */
function getOrderConfig(guildId) {
  const cfg = readCfg(guildId);
  return cfg.orderSystem || {
    categoryId: '',
    logChannelId: '',
    transcriptChannelId: '',
    teamRoleId: '',
    archiveCategoryId: '',
    paused: false,
    formFields: [{ id: 'order_description', label: 'Was möchtest du bestellen?', style: 'paragraph', required: true }],
    panelEmbed: { title: '🛒 Bestellsystem', description: 'Klicke auf den Button um eine Bestellung aufzugeben.', color: '#5865F2' }
  };
}

/**
 * Save order config to guild config
 */
function saveOrderConfig(guildId, orderConfig) {
  const cfg = readCfg(guildId);
  cfg.orderSystem = orderConfig;
  return writeCfg(guildId, cfg);
}

/**
 * Get team roles for orders
 */
function getOrderTeamRoles(guildId) {
  const orderCfg = getOrderConfig(guildId);
  const ticketCfg = readCfg(guildId);
  
  // Use order-specific role, or fall back to ticket team role
  const teamRoleId = orderCfg.teamRoleId || ticketCfg.teamRoleId;
  
  if (Array.isArray(teamRoleId)) {
    return teamRoleId.filter(r => r && r.trim());
  }
  return teamRoleId ? [teamRoleId] : [];
}

/**
 * Check if member has order team role
 */
function hasOrderTeamRole(member, guildId) {
  if (!member) return false;
  
  // Check admin permission
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  
  const teamRoles = getOrderTeamRoles(guildId);
  if (!teamRoles.length) return false;
  
  return teamRoles.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Get status info by key
 */
function getStatusInfo(statusKey) {
  return Object.values(ORDER_STATUS).find(s => s.key === statusKey) || ORDER_STATUS.NEW;
}

/**
 * Log order event to log channel
 */
async function logOrderEvent(guild, message, embed = null) {
  try {
    const orderCfg = getOrderConfig(guild.id);
    const ticketCfg = readCfg(guild.id);
    
    const logChannelId = orderCfg.logChannelId || (Array.isArray(ticketCfg.logChannelId) ? ticketCfg.logChannelId[0] : ticketCfg.logChannelId);
    if (!logChannelId) return;
    
    const channel = guild.channels.cache.get(logChannelId);
    if (!channel) return;
    
    const payload = { content: message };
    if (embed) payload.embeds = [embed];
    
    await channel.send(payload).catch(() => {});
  } catch (err) {
    console.error('[Order] Log event error:', err.message);
  }
}

/**
 * Send DM to user about order status
 */
async function sendOrderDM(client, userId, guildName, orderNumber, status, additionalInfo = null) {
  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;
    
    const statusInfo = getStatusInfo(status);
    
    const embed = createStyledEmbed({
      emoji: statusInfo.emoji,
      title: `Bestellung #${orderNumber}`,
      description: `Der Status deiner Bestellung wurde aktualisiert.`,
      fields: [
        { name: 'Neuer Status', value: `${statusInfo.emoji} ${statusInfo.label}`, inline: true },
        { name: 'Server', value: guildName, inline: true }
      ],
      color: statusInfo.color,
      footer: 'Quantix Tickets • Bestellsystem'
    });
    
    if (additionalInfo) {
      embed.addFields({ name: 'Info', value: additionalInfo, inline: false });
    }
    
    await user.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    console.error('[Order] DM send error:', err.message);
  }
}

/**
 * Create order panel message content
 */
function createOrderPanel(guildId) {
  const orderCfg = getOrderConfig(guildId);
  const panelEmbed = orderCfg.panelEmbed || {};
  
  const embed = new EmbedBuilder()
    .setTitle(panelEmbed.title || '🛒 Bestellsystem')
    .setDescription(panelEmbed.description || 'Klicke auf den Button um eine Bestellung aufzugeben.')
    .setFooter({ text: 'Quantix Tickets • Bestellsystem' });
  
  const color = panelEmbed.color || '#5865F2';
  if (/^#?[0-9a-fA-F]{6}$/.test(color)) {
    embed.setColor(parseInt(color.replace('#', ''), 16));
  } else {
    embed.setColor(0x5865F2);
  }
  
  if (orderCfg.paused) {
    embed.addFields({ name: '⏸️ Status', value: 'Bestellungen sind derzeit pausiert.', inline: false });
  }
  
  const button = new ButtonBuilder()
    .setCustomId('order_create')
    .setLabel('Jetzt bestellen')
    .setStyle(orderCfg.paused ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setEmoji('🛒')
    .setDisabled(orderCfg.paused);
  
  const row = new ActionRowBuilder().addComponents(button);
  
  return { embeds: [embed], components: [row] };
}

/**
 * Create order channel embed and buttons
 */
function createOrderEmbed(order) {
  const statusInfo = getStatusInfo(order.status);
  
  const fields = [
    { name: 'Status', value: `${statusInfo.emoji} ${statusInfo.label}`, inline: true },
    { name: 'Erstellt', value: `<t:${Math.floor(order.createdAt / 1000)}:R>`, inline: true },
    { name: 'Benutzer', value: `<@${order.userId}>`, inline: true }
  ];
  
  // Add form responses
  if (order.formResponses && Object.keys(order.formResponses).length > 0) {
    for (const [key, value] of Object.entries(order.formResponses)) {
      if (value) {
        fields.push({ name: key, value: String(value).substring(0, 1024), inline: false });
      }
    }
  }
  
  const embed = createStyledEmbed({
    emoji: '🛒',
    title: `Bestellung #${order.id}`,
    description: `Neue Bestellung von <@${order.userId}>`,
    fields,
    color: statusInfo.color
  });
  
  // Status buttons
  const statusRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('order_status_processing').setLabel('In Bearbeitung').setStyle(ButtonStyle.Primary).setEmoji('⚙️'),
    new ButtonBuilder().setCustomId('order_status_shipped').setLabel('Versandt').setStyle(ButtonStyle.Success).setEmoji('📦'),
    new ButtonBuilder().setCustomId('order_status_completed').setLabel('Abgeschlossen').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('order_status_cancelled').setLabel('Stornieren').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );
  
  // Action buttons
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('order_finish').setLabel('Mit Datei abschließen').setStyle(ButtonStyle.Success).setEmoji('📄'),
    new ButtonBuilder().setCustomId('order_add_user').setLabel('User hinzufügen').setStyle(ButtonStyle.Secondary).setEmoji('👥')
  );
  
  return { embeds: [embed], components: [statusRow, actionRow] };
}

/**
 * Update order status
 */
async function handleStatusUpdate(guild, order, newStatus, changedBy, client) {
  const statusHistory = order.statusHistory || [];
  statusHistory.push({
    status: newStatus,
    changedBy: changedBy.id,
    changedAt: Date.now()
  });
  
  updateOrder(guild.id, order.id, {
    status: newStatus,
    statusHistory,
    updatedAt: Date.now()
  });
  
  // Update channel name if closed
  if (['completed', 'cancelled', 'refunded'].includes(newStatus)) {
    try {
      const channel = guild.channels.cache.get(order.channelId);
      if (channel) {
        await channel.setName(`geschlossen-${order.id}`).catch(() => {});
      }
    } catch (err) {}
  }
  
  // Send DM
  await sendOrderDM(client, order.userId, guild.name, order.id, newStatus);
  
  // Log
  const statusInfo = getStatusInfo(newStatus);
  await logOrderEvent(guild, `${statusInfo.emoji} Bestellung **#${order.id}** → ${statusInfo.label} (von <@${changedBy.id}>)`);
  
  // Update order message
  try {
    const channel = guild.channels.cache.get(order.channelId);
    if (channel) {
      const msg = await channel.messages.fetch(order.messageId).catch(() => null);
      if (msg) {
        const updatedOrder = getOrder(guild.id, order.id);
        await msg.edit(createOrderEmbed(updatedOrder));
      }
    }
  } catch (err) {}
  
  return getOrder(guild.id, order.id);
}

/**
 * Generate order transcript
 */
async function generateOrderTranscript(guild, order, productFile = null) {
  const orderCfg = getOrderConfig(guild.id);
  const ticketCfg = readCfg(guild.id);
  
  const transcriptChannelId = orderCfg.transcriptChannelId || ticketCfg.transcriptChannelId;
  if (!transcriptChannelId) return null;
  
  const transcriptChannel = guild.channels.cache.get(transcriptChannelId);
  if (!transcriptChannel) return null;
  
  const channel = guild.channels.cache.get(order.channelId);
  if (!channel) return null;
  
  // Ensure transcripts directory exists
  const guildTranscriptDir = path.join(TRANSCRIPTS_DIR, guild.id);
  if (!fs.existsSync(guildTranscriptDir)) {
    fs.mkdirSync(guildTranscriptDir, { recursive: true });
  }
  
  // Fetch messages
  const messages = [];
  let lastId = null;
  
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    
    const fetched = await channel.messages.fetch(options).catch(() => null);
    if (!fetched || fetched.size === 0) break;
    
    messages.push(...fetched.values());
    lastId = fetched.last().id;
    
    if (fetched.size < 100) break;
  }
  
  messages.reverse();
  
  // Create TXT transcript
  let txtContent = `═══════════════════════════════════════════════════════════════\n`;
  txtContent += `                    BESTELLUNG #${order.id}\n`;
  txtContent += `═══════════════════════════════════════════════════════════════\n\n`;
  txtContent += `Server: ${guild.name}\n`;
  txtContent += `Benutzer: ${order.username} (${order.userId})\n`;
  txtContent += `Status: ${getStatusInfo(order.status).label}\n`;
  txtContent += `Erstellt: ${new Date(order.createdAt).toLocaleString('de-DE')}\n`;
  txtContent += `Geschlossen: ${new Date().toLocaleString('de-DE')}\n\n`;
  
  if (order.formResponses && Object.keys(order.formResponses).length > 0) {
    txtContent += `── Bestelldetails ──────────────────────────────────────────────\n`;
    for (const [key, value] of Object.entries(order.formResponses)) {
      txtContent += `${key}: ${value}\n`;
    }
    txtContent += `\n`;
  }
  
  txtContent += `── Nachrichten ─────────────────────────────────────────────────\n\n`;
  
  for (const msg of messages) {
    const timestamp = new Date(msg.createdTimestamp).toLocaleString('de-DE');
    txtContent += `[${timestamp}] ${msg.author.tag}:\n`;
    if (msg.content) txtContent += `${msg.content}\n`;
    if (msg.attachments.size > 0) {
      txtContent += `[Anhänge: ${msg.attachments.map(a => a.name).join(', ')}]\n`;
    }
    txtContent += `\n`;
  }
  
  // Create HTML transcript
  let htmlContent = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bestellung #${order.id} - ${guild.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #36393f; color: #dcddde; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #5865f2, #3b41c5); padding: 30px; border-radius: 12px; margin-bottom: 20px; text-align: center; }
    .header h1 { color: white; margin-bottom: 10px; }
    .header .meta { color: rgba(255,255,255,0.8); font-size: 14px; }
    .info-card { background: #2f3136; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .info-card h2 { color: #5865f2; margin-bottom: 15px; font-size: 18px; }
    .info-row { display: flex; margin-bottom: 10px; }
    .info-label { color: #72767d; width: 150px; }
    .info-value { color: #dcddde; }
    .messages { background: #2f3136; border-radius: 8px; padding: 20px; }
    .messages h2 { color: #5865f2; margin-bottom: 15px; font-size: 18px; }
    .message { padding: 12px 0; border-bottom: 1px solid #40444b; }
    .message:last-child { border-bottom: none; }
    .message-header { display: flex; align-items: center; margin-bottom: 5px; }
    .message-author { color: #ffffff; font-weight: 600; margin-right: 10px; }
    .message-time { color: #72767d; font-size: 12px; }
    .message-content { color: #dcddde; white-space: pre-wrap; word-wrap: break-word; }
    .attachment { color: #00b0f4; font-size: 13px; margin-top: 5px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .status-new { background: #5865f2; color: white; }
    .status-processing { background: #fee75c; color: #000; }
    .status-shipped { background: #57f287; color: #000; }
    .status-completed { background: #57f287; color: #000; }
    .status-cancelled { background: #ed4245; color: white; }
    .status-refunded { background: #eb459e; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛒 Bestellung #${order.id}</h1>
      <div class="meta">${guild.name} • Erstellt am ${new Date(order.createdAt).toLocaleString('de-DE')}</div>
    </div>
    
    <div class="info-card">
      <h2>📋 Bestellinformationen</h2>
      <div class="info-row"><span class="info-label">Benutzer:</span><span class="info-value">${order.username}</span></div>
      <div class="info-row"><span class="info-label">User ID:</span><span class="info-value">${order.userId}</span></div>
      <div class="info-row"><span class="info-label">Status:</span><span class="info-value"><span class="status-badge status-${order.status}">${getStatusInfo(order.status).emoji} ${getStatusInfo(order.status).label}</span></span></div>
      <div class="info-row"><span class="info-label">Erstellt:</span><span class="info-value">${new Date(order.createdAt).toLocaleString('de-DE')}</span></div>
      <div class="info-row"><span class="info-label">Geschlossen:</span><span class="info-value">${new Date().toLocaleString('de-DE')}</span></div>
    </div>`;
  
  if (order.formResponses && Object.keys(order.formResponses).length > 0) {
    htmlContent += `
    <div class="info-card">
      <h2>📝 Bestelldetails</h2>`;
    for (const [key, value] of Object.entries(order.formResponses)) {
      htmlContent += `
      <div class="info-row"><span class="info-label">${key}:</span><span class="info-value">${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>`;
    }
    htmlContent += `
    </div>`;
  }
  
  htmlContent += `
    <div class="messages">
      <h2>💬 Nachrichten (${messages.length})</h2>`;
  
  for (const msg of messages) {
    const timestamp = new Date(msg.createdTimestamp).toLocaleString('de-DE');
    const content = msg.content ? msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
    
    htmlContent += `
      <div class="message">
        <div class="message-header">
          <span class="message-author">${msg.author.tag}</span>
          <span class="message-time">${timestamp}</span>
        </div>
        ${content ? `<div class="message-content">${content}</div>` : ''}
        ${msg.attachments.size > 0 ? `<div class="attachment">📎 ${msg.attachments.map(a => a.name).join(', ')}</div>` : ''}
      </div>`;
  }
  
  htmlContent += `
    </div>
  </div>
</body>
</html>`;
  
  // Save files
  const txtPath = path.join(guildTranscriptDir, `order_${order.id}.txt`);
  const htmlPath = path.join(guildTranscriptDir, `order_${order.id}.html`);
  
  fs.writeFileSync(txtPath, txtContent, 'utf8');
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  
  // Send to transcript channel
  const files = [
    new AttachmentBuilder(txtPath, { name: `bestellung_${order.id}.txt` }),
    new AttachmentBuilder(htmlPath, { name: `bestellung_${order.id}.html` })
  ];
  
  if (productFile) {
    files.push(productFile);
  }
  
  const statusInfo = getStatusInfo(order.status);
  
  const transcriptEmbed = createStyledEmbed({
    emoji: '📄',
    title: `Bestellung #${order.id} abgeschlossen`,
    fields: [
      { name: 'Benutzer', value: `<@${order.userId}>`, inline: true },
      { name: 'Status', value: `${statusInfo.emoji} ${statusInfo.label}`, inline: true },
      { name: 'Erstellt', value: `<t:${Math.floor(order.createdAt / 1000)}:f>`, inline: true },
      { name: 'Geschlossen', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      { name: 'Nachrichten', value: String(messages.length), inline: true }
    ],
    color: '#5865F2',
    footer: 'Quantix Tickets • Bestellsystem'
  });
  
  await transcriptChannel.send({ embeds: [transcriptEmbed], files });
  
  return { txtPath, htmlPath };
}

// ============================================================
// COMMAND
// ============================================================

module.exports = {
  // Export constants and functions for use in index.js
  ORDER_STATUS,
  getOrderConfig,
  saveOrderConfig,
  getOrderTeamRoles,
  hasOrderTeamRole,
  getStatusInfo,
  logOrderEvent,
  sendOrderDM,
  createOrderPanel,
  createOrderEmbed,
  handleStatusUpdate,
  generateOrderTranscript,
  
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Bestellsystem verwalten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand(sub => sub
      .setName('panel')
      .setDescription('Bestell-Panel senden')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel für das Panel')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
    )
    .addSubcommand(sub => sub
      .setName('stop')
      .setDescription('Bestellungen pausieren')
    )
    .addSubcommand(sub => sub
      .setName('resume')
      .setDescription('Bestellungen fortsetzen')
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Alle Bestellungen anzeigen')
      .addStringOption(opt => opt
        .setName('status')
        .setDescription('Nach Status filtern')
        .addChoices(
          { name: '🆕 Neu', value: 'new' },
          { name: '⚙️ In Bearbeitung', value: 'processing' },
          { name: '📦 Versandt', value: 'shipped' },
          { name: '✅ Abgeschlossen', value: 'completed' },
          { name: '❌ Storniert', value: 'cancelled' },
          { name: '💸 Erstattet', value: 'refunded' }
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Status einer Bestellung ändern')
      .addIntegerOption(opt => opt
        .setName('nummer')
        .setDescription('Bestellnummer')
        .setRequired(true)
      )
      .addStringOption(opt => opt
        .setName('neuer_status')
        .setDescription('Neuer Status')
        .setRequired(true)
        .addChoices(
          { name: '🆕 Neu', value: 'new' },
          { name: '⚙️ In Bearbeitung', value: 'processing' },
          { name: '📦 Versandt', value: 'shipped' },
          { name: '✅ Abgeschlossen', value: 'completed' },
          { name: '❌ Storniert', value: 'cancelled' },
          { name: '💸 Erstattet', value: 'refunded' }
        )
      )
    )
    .addSubcommand(sub => sub
      .setName('finish')
      .setDescription('Bestellung mit Produktdatei abschließen')
      .addIntegerOption(opt => opt
        .setName('nummer')
        .setDescription('Bestellnummer (leer = aktuelle)')
      )
      .addAttachmentOption(opt => opt
        .setName('datei')
        .setDescription('Produktdatei zum Senden')
      )
    )
    .addSubcommand(sub => sub
      .setName('info')
      .setDescription('Bestelldetails anzeigen')
      .addIntegerOption(opt => opt
        .setName('nummer')
        .setDescription('Bestellnummer')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('Bestellstatistiken anzeigen')
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    // Permission check
    if (!hasOrderTeamRole(interaction.member, guildId)) {
      return interaction.reply({
        embeds: [createStyledEmbed({ emoji: '🚫', title: 'Keine Berechtigung', description: 'Du hast keine Berechtigung für das Bestellsystem.', color: '#ED4245' })],
        ephemeral: true
      });
    }

    // ===== PANEL =====
    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      
      const orderCfg = getOrderConfig(guildId);
      
      try {
        const panelMsg = await channel.send(createOrderPanel(guildId));
        
        orderCfg.panelChannelId = channel.id;
        orderCfg.panelMessageId = panelMsg.id;
        saveOrderConfig(guildId, orderCfg);
        
        await interaction.reply({
          embeds: [createStyledEmbed({ emoji: '✅', title: 'Panel gesendet', description: `Bestell-Panel wurde in ${channel} gesendet.`, color: '#57F287' })],
          ephemeral: true
        });
        
        await logOrderEvent(interaction.guild, `📋 Bestell-Panel gesendet in ${channel} von <@${interaction.user.id}>`);
      } catch (err) {
        console.error('[Order] Panel send error:', err);
        await interaction.reply({
          embeds: [createStyledEmbed({ emoji: '❌', title: 'Fehler', description: 'Panel konnte nicht gesendet werden.', color: '#ED4245' })],
          ephemeral: true
        });
      }
      return;
    }

    // ===== STOP =====
    if (subcommand === 'stop') {
      const orderCfg = getOrderConfig(guildId);
      orderCfg.paused = true;
      saveOrderConfig(guildId, orderCfg);
      
      // Update panel if exists
      if (orderCfg.panelChannelId && orderCfg.panelMessageId) {
        try {
          const channel = interaction.guild.channels.cache.get(orderCfg.panelChannelId);
          const msg = await channel?.messages.fetch(orderCfg.panelMessageId).catch(() => null);
          if (msg) await msg.edit(createOrderPanel(guildId));
        } catch (e) {}
      }
      
      await interaction.reply({
        embeds: [createStyledEmbed({ emoji: '⏸️', title: 'Bestellungen pausiert', description: 'Neue Bestellungen sind nun deaktiviert.', color: '#FEE75C' })],
        ephemeral: true
      });
      
      await logOrderEvent(interaction.guild, `⏸️ Bestellungen pausiert von <@${interaction.user.id}>`);
      return;
    }

    // ===== RESUME =====
    if (subcommand === 'resume') {
      const orderCfg = getOrderConfig(guildId);
      orderCfg.paused = false;
      saveOrderConfig(guildId, orderCfg);
      
      // Update panel if exists
      if (orderCfg.panelChannelId && orderCfg.panelMessageId) {
        try {
          const channel = interaction.guild.channels.cache.get(orderCfg.panelChannelId);
          const msg = await channel?.messages.fetch(orderCfg.panelMessageId).catch(() => null);
          if (msg) await msg.edit(createOrderPanel(guildId));
        } catch (e) {}
      }
      
      await interaction.reply({
        embeds: [createStyledEmbed({ emoji: '▶️', title: 'Bestellungen fortgesetzt', description: 'Neue Bestellungen sind wieder möglich.', color: '#57F287' })],
        ephemeral: true
      });
      
      await logOrderEvent(interaction.guild, `▶️ Bestellungen fortgesetzt von <@${interaction.user.id}>`);
      return;
    }

    // ===== LIST =====
    if (subcommand === 'list') {
      const statusFilter = interaction.options.getString('status');
      const orders = getOrders(guildId, statusFilter);
      
      if (orders.length === 0) {
        return interaction.reply({
          embeds: [createStyledEmbed({ emoji: 'ℹ️', title: 'Keine Bestellungen', description: statusFilter ? `Keine Bestellungen mit Status "${getStatusInfo(statusFilter).label}".` : 'Noch keine Bestellungen vorhanden.', color: '#5865F2' })],
          ephemeral: true
        });
      }
      
      const orderList = orders.slice(0, 25).map(o => {
        const status = getStatusInfo(o.status);
        return `${status.emoji} **#${o.id}** - <@${o.userId}> - <t:${Math.floor(o.createdAt / 1000)}:R>`;
      }).join('\n');
      
      await interaction.reply({
        embeds: [createStyledEmbed({
          emoji: '📋',
          title: `Bestellungen${statusFilter ? ` (${getStatusInfo(statusFilter).label})` : ''}`,
          description: orderList + (orders.length > 25 ? `\n\n... und ${orders.length - 25} weitere` : ''),
          fields: [{ name: 'Gesamt', value: String(orders.length), inline: true }],
          color: '#5865F2'
        })],
        ephemeral: true
      });
      return;
    }

    // ===== STATUS =====
    if (subcommand === 'status') {
      const orderNumber = interaction.options.getInteger('nummer');
      const newStatus = interaction.options.getString('neuer_status');
      
      const order = getOrder(guildId, orderNumber);
      if (!order) {
        return interaction.reply({
          embeds: [createStyledEmbed({ emoji: '❌', title: 'Nicht gefunden', description: `Bestellung #${orderNumber} wurde nicht gefunden.`, color: '#ED4245' })],
          ephemeral: true
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      await handleStatusUpdate(interaction.guild, order, newStatus, interaction.user, interaction.client);
      
      const statusInfo = getStatusInfo(newStatus);
      await interaction.editReply({
        embeds: [createStyledEmbed({ emoji: '✅', title: 'Status geändert', description: `Bestellung **#${orderNumber}** ist jetzt ${statusInfo.emoji} ${statusInfo.label}`, color: statusInfo.color })]
      });
      return;
    }

    // ===== FINISH =====
    if (subcommand === 'finish') {
      let orderNumber = interaction.options.getInteger('nummer');
      const productAttachment = interaction.options.getAttachment('datei');
      
      // If no order number, try to get from current channel
      let order;
      if (!orderNumber) {
        order = getOrderByChannel(interaction.channel.id);
        if (!order) {
          return interaction.reply({
            embeds: [createStyledEmbed({ emoji: '❌', title: 'Keine Bestellung', description: 'Bitte gib eine Bestellnummer an oder führe den Befehl im Bestell-Channel aus.', color: '#ED4245' })],
            ephemeral: true
          });
        }
        orderNumber = order.id;
      } else {
        order = getOrder(guildId, orderNumber);
        if (!order) {
          return interaction.reply({
            embeds: [createStyledEmbed({ emoji: '❌', title: 'Nicht gefunden', description: `Bestellung #${orderNumber} wurde nicht gefunden.`, color: '#ED4245' })],
            ephemeral: true
          });
        }
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      // Update status to completed
      await handleStatusUpdate(interaction.guild, order, 'completed', interaction.user, interaction.client);
      
      // Generate transcript
      let productFile = null;
      if (productAttachment) {
        const response = await fetch(productAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        productFile = new AttachmentBuilder(buffer, { name: productAttachment.name });
        
        // Update order with product file info
        updateOrder(guildId, orderNumber, { productFile: productAttachment.name });
      }
      
      await generateOrderTranscript(interaction.guild, getOrder(guildId, orderNumber), productFile);
      
      // Send product file to user
      if (productAttachment) {
        try {
          const user = await interaction.client.users.fetch(order.userId).catch(() => null);
          if (user) {
            const response2 = await fetch(productAttachment.url);
            const buffer2 = Buffer.from(await response2.arrayBuffer());
            const userFile = new AttachmentBuilder(buffer2, { name: productAttachment.name });
            
            await user.send({
              embeds: [createStyledEmbed({
                emoji: '📦',
                title: `Bestellung #${orderNumber} - Produkt`,
                description: 'Hier ist dein bestelltes Produkt!',
                color: '#57F287',
                footer: `${interaction.guild.name} • Quantix Tickets`
              })],
              files: [userFile]
            }).catch(() => {});
          }
        } catch (err) {
          console.error('[Order] User DM error:', err);
        }
      }
      
      await interaction.editReply({
        embeds: [createStyledEmbed({
          emoji: '✅',
          title: 'Bestellung abgeschlossen',
          description: `Bestellung **#${orderNumber}** wurde abgeschlossen.\nTranscript wurde erstellt${productAttachment ? ' und Produkt gesendet' : ''}.`,
          color: '#57F287'
        })]
      });
      
      // Archive or delete channel after delay
      const orderCfg = getOrderConfig(guildId);
      const channel = interaction.guild.channels.cache.get(order.channelId);
      
      if (channel) {
        setTimeout(async () => {
          try {
            if (orderCfg.archiveCategoryId) {
              await channel.setParent(orderCfg.archiveCategoryId, { lockPermissions: false });
              await channel.permissionOverwrites.set([
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }
              ]);
            } else {
              await channel.delete('Bestellung abgeschlossen');
            }
          } catch (err) {
            console.error('[Order] Channel archive/delete error:', err);
          }
        }, 10000);
      }
      
      return;
    }

    // ===== INFO =====
    if (subcommand === 'info') {
      const orderNumber = interaction.options.getInteger('nummer');
      const order = getOrder(guildId, orderNumber);
      
      if (!order) {
        return interaction.reply({
          embeds: [createStyledEmbed({ emoji: '❌', title: 'Nicht gefunden', description: `Bestellung #${orderNumber} wurde nicht gefunden.`, color: '#ED4245' })],
          ephemeral: true
        });
      }
      
      const statusInfo = getStatusInfo(order.status);
      const fields = [
        { name: 'Status', value: `${statusInfo.emoji} ${statusInfo.label}`, inline: true },
        { name: 'Benutzer', value: `<@${order.userId}>`, inline: true },
        { name: 'Channel', value: order.channelId ? `<#${order.channelId}>` : 'Gelöscht', inline: true },
        { name: 'Erstellt', value: `<t:${Math.floor(order.createdAt / 1000)}:f>`, inline: true },
        { name: 'Aktualisiert', value: `<t:${Math.floor(order.updatedAt / 1000)}:R>`, inline: true }
      ];
      
      if (order.closedAt) {
        fields.push({ name: 'Geschlossen', value: `<t:${Math.floor(order.closedAt / 1000)}:f>`, inline: true });
      }
      
      if (order.productFile) {
        fields.push({ name: 'Produktdatei', value: order.productFile, inline: true });
      }
      
      if (order.addedUsers && order.addedUsers.length > 0) {
        fields.push({ name: 'Hinzugefügte User', value: order.addedUsers.map(u => `<@${u}>`).join(', '), inline: false });
      }
      
      if (order.formResponses && Object.keys(order.formResponses).length > 0) {
        for (const [key, value] of Object.entries(order.formResponses)) {
          if (value) {
            fields.push({ name: key, value: String(value).substring(0, 1024), inline: false });
          }
        }
      }
      
      await interaction.reply({
        embeds: [createStyledEmbed({
          emoji: '🛒',
          title: `Bestellung #${orderNumber}`,
          fields,
          color: statusInfo.color
        })],
        ephemeral: true
      });
      return;
    }

    // ===== STATS =====
    if (subcommand === 'stats') {
      const stats = getOrderStats(guildId);
      
      const fields = [];
      for (const [status, info] of Object.entries(ORDER_STATUS)) {
        const count = stats[info.key] || 0;
        fields.push({ name: `${info.emoji} ${info.label}`, value: String(count), inline: true });
      }
      
      await interaction.reply({
        embeds: [createStyledEmbed({
          emoji: '📊',
          title: 'Bestellstatistiken',
          description: `**Gesamt:** ${stats.total || 0} Bestellungen`,
          fields,
          color: '#5865F2'
        })],
        ephemeral: true
      });
      return;
    }
  }
};