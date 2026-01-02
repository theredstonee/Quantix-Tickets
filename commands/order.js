const path = require('path');
const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { createStyledEmbed } = require('../helpers');
const { readCfg, writeCfg } = require('../database');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');
const TRANSCRIPTS_DIR = path.join(__dirname, '..', 'transcripts');

// ===== ORDER STATUS =====
const ORDER_STATUS = {
  NEW: { key: 'new', label: 'Neu', emoji: '🆕', color: '#5865F2' },
  PROCESSING: { key: 'processing', label: 'In Bearbeitung', emoji: '⚙️', color: '#FEE75C' },
  SHIPPED: { key: 'shipped', label: 'Versandt', emoji: '📦', color: '#57F287' },
  COMPLETED: { key: 'completed', label: 'Abgeschlossen', emoji: '✅', color: '#57F287' },
  CANCELLED: { key: 'cancelled', label: 'Storniert', emoji: '❌', color: '#ED4245' },
  REFUNDED: { key: 'refunded', label: 'Erstattet', emoji: '💸', color: '#EB459E' }
};

// ===== HELPER FUNCTIONS =====
function loadOrders(guildId) {
  const ordersPath = path.join(CONFIG_DIR, `${guildId}_orders.json`);
  if (!fs.existsSync(ordersPath)) {
    fs.writeFileSync(ordersPath, JSON.stringify([], null, 2), 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveOrders(guildId, orders) {
  const ordersPath = path.join(CONFIG_DIR, `${guildId}_orders.json`);
  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2), 'utf8');
}

function getOrderConfig(guildId) {
  const cfg = readCfg(guildId);
  return cfg.orderSystem || {
    enabled: true,
    paused: false,
    teamRoleId: cfg.teamRoleId,
    categoryId: null,
    logChannelId: null,
    transcriptChannelId: null,
    formFields: [],
    panelEmbed: { title: '🛒 Bestellsystem', description: 'Klicke auf den Button um eine Bestellung aufzugeben.', color: '#5865F2' }
  };
}

function saveOrderConfig(guildId, orderConfig) {
  const cfg = readCfg(guildId);
  cfg.orderSystem = orderConfig;
  writeCfg(guildId, cfg);
}

function getOrderTeamRoles(guildId) {
  const cfg = readCfg(guildId);
  const orderCfg = cfg.orderSystem || {};
  let roles = orderCfg.teamRoleId || cfg.teamRoleId;
  if (Array.isArray(roles)) return roles.filter(r => r?.trim());
  return roles ? [roles] : [];
}

function hasOrderTeamRole(member, guildId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return getOrderTeamRoles(guildId).some(roleId => member.roles.cache.has(roleId));
}

function logOrderEvent(guild, message) {
  const orderCfg = getOrderConfig(guild.id);
  const cfg = readCfg(guild.id);
  const logChannelId = orderCfg.logChannelId || cfg.logChannelId;
  if (!logChannelId) return;
  const ch = guild.channels.cache.get(logChannelId);
  if (ch?.isTextBased()) ch.send(message).catch(console.error);
}

function nextOrderNumber(guildId) {
  const counterPath = path.join(CONFIG_DIR, `${guildId}_order_counter.json`);
  if (!fs.existsSync(counterPath)) fs.writeFileSync(counterPath, JSON.stringify({ last: 0 }, null, 2), 'utf8');
  const counter = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
  counter.last++;
  fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2), 'utf8');
  return counter.last;
}

function createOrderPanel(guildId) {
  const orderCfg = getOrderConfig(guildId);
  const p = orderCfg.panelEmbed || {};

  const embed = new EmbedBuilder()
    .setTitle(p.title || '🛒 Bestellsystem')
    .setDescription(p.description || 'Klicke auf den Button um eine Bestellung aufzugeben.')
    .setColor(p.color || '#5865F2')
    .setFooter({ text: 'Quantix Orders' })
    .setTimestamp();

  if (p.image) embed.setImage(p.image);
  if (p.thumbnail) embed.setThumbnail(p.thumbnail);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('order_create')
      .setLabel(orderCfg.paused ? '⏸️ Bestellungen pausiert' : '🛒 Jetzt bestellen')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(orderCfg.paused)
  );

  return { embeds: [embed], components: [row] };
}

async function updateOrderStatus(guild, order, newStatus, changedBy, guildId) {
  const statusInfo = Object.values(ORDER_STATUS).find(s => s.key === newStatus) || ORDER_STATUS.NEW;
  const orders = loadOrders(guildId);
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx === -1) return null;

  orders[idx].status = statusInfo.key;
  orders[idx].updatedAt = Date.now();
  if (!orders[idx].statusHistory) orders[idx].statusHistory = [];
  orders[idx].statusHistory.push({ status: statusInfo.key, changedBy: changedBy.id, changedAt: Date.now() });
  saveOrders(guildId, orders);

  const channel = guild.channels.cache.get(order.channelId);
  if (channel) {
    const closed = ['completed', 'cancelled', 'refunded'].includes(statusInfo.key);
    await channel.setName(closed ? `geschlossen-${order.id}` : `bestellung-${order.id}`).catch(() => {});
    await channel.send({
      embeds: [createStyledEmbed({
        emoji: statusInfo.emoji,
        title: 'Status aktualisiert',
        description: `Status: **${statusInfo.emoji} ${statusInfo.label}**\nVon: <@${changedBy.id}>`,
        color: statusInfo.color
      })]
    });
  }

  // DM
  try {
    const user = await guild.client.users.fetch(order.userId).catch(() => null);
    if (user) {
      await user.send({
        embeds: [createStyledEmbed({
          emoji: statusInfo.emoji,
          title: 'Bestellstatus aktualisiert',
          description: `Bestellung **#${order.id}**: ${statusInfo.emoji} ${statusInfo.label}`,
          color: statusInfo.color,
          footer: guild.name
        })]
      }).catch(() => {});
    }
  } catch (e) {}

  logOrderEvent(guild, `${statusInfo.emoji} Bestellung #${order.id} → ${statusInfo.label} (von <@${changedBy.id}>)`);
  return orders[idx];
}

async function generateOrderTranscript(guild, order, guildId) {
  const channel = guild.channels.cache.get(order.channelId);
  if (!channel) return null;

  const transcriptDir = path.join(TRANSCRIPTS_DIR, guildId);
  if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });

  let messages = [];
  let lastId;
  while (true) {
    const fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!fetched || fetched.size === 0) break;
    messages = messages.concat([...fetched.values()]);
    lastId = fetched.last().id;
    if (fetched.size < 100) break;
  }
  messages = messages.reverse();

  // TXT
  let txt = `=== BESTELLUNG #${order.id} ===\nUser: ${order.username}\nErstellt: ${new Date(order.createdAt).toLocaleString('de-DE')}\n\n`;
  for (const [k, v] of Object.entries(order.formResponses || {})) txt += `${k}: ${v}\n`;
  txt += `\n=== NACHRICHTEN ===\n`;
  for (const m of messages) txt += `[${new Date(m.createdTimestamp).toLocaleString('de-DE')}] ${m.author.tag}: ${m.content || '[Embed]'}\n`;

  const txtPath = path.join(transcriptDir, `order_${order.id}.txt`);
  fs.writeFileSync(txtPath, txt, 'utf8');

  // HTML
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bestellung #${order.id}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#1a1a2e;color:#eee;padding:20px}
.container{max-width:900px;margin:0 auto}.header{background:linear-gradient(135deg,#5865F2,#57F287);padding:30px;border-radius:12px;margin-bottom:20px}
.header h1{font-size:24px}.section{background:#16213e;border-radius:12px;padding:20px;margin-bottom:20px}
.section h2{color:#57F287;margin-bottom:15px}.msg{padding:12px;border-radius:8px;margin-bottom:8px}
.msg:hover{background:#1a1a2e}.msg .author{font-weight:600}.msg .time{color:#888;font-size:12px;margin-left:8px}
.msg .text{margin-top:4px;color:#ddd}</style></head><body><div class="container">
<div class="header"><h1>🛒 Bestellung #${order.id}</h1><p>Kunde: ${order.username}</p><p>Erstellt: ${new Date(order.createdAt).toLocaleString('de-DE')}</p></div>
<div class="section"><h2>📋 Details</h2>${Object.entries(order.formResponses || {}).map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`).join('')}</div>
<div class="section"><h2>💬 Nachrichten</h2>${messages.map(m => `<div class="msg"><span class="author">${m.author.tag}</span><span class="time">${new Date(m.createdTimestamp).toLocaleString('de-DE')}</span><div class="text">${m.content || '[Embed]'}</div></div>`).join('')}</div>
</div></body></html>`;

  const htmlPath = path.join(transcriptDir, `order_${order.id}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  return { txtPath, htmlPath };
}

module.exports = {
  // Export für index.js
  ORDER_STATUS,
  loadOrders,
  saveOrders,
  getOrderConfig,
  saveOrderConfig,
  getOrderTeamRoles,
  hasOrderTeamRole,
  logOrderEvent,
  nextOrderNumber,
  createOrderPanel,
  updateOrderStatus,
  generateOrderTranscript,

  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Bestellsystem verwalten')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('panel').setDescription('Bestell-Panel senden')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('stop').setDescription('Bestellungen pausieren'))
    .addSubcommand(s => s.setName('resume').setDescription('Bestellungen fortsetzen'))
    .addSubcommand(s => s.setName('list').setDescription('Bestellungen anzeigen')
      .addStringOption(o => o.setName('status').setDescription('Filter').addChoices(
        { name: '🆕 Neu', value: 'new' }, { name: '⚙️ In Bearbeitung', value: 'processing' },
        { name: '📦 Versandt', value: 'shipped' }, { name: '✅ Abgeschlossen', value: 'completed' },
        { name: '❌ Storniert', value: 'cancelled' }, { name: '💸 Erstattet', value: 'refunded' })))
    .addSubcommand(s => s.setName('status').setDescription('Status ändern')
      .addIntegerOption(o => o.setName('nummer').setDescription('Bestellnummer').setRequired(true))
      .addStringOption(o => o.setName('neuer-status').setDescription('Status').setRequired(true).addChoices(
        { name: '🆕 Neu', value: 'new' }, { name: '⚙️ In Bearbeitung', value: 'processing' },
        { name: '📦 Versandt', value: 'shipped' }, { name: '✅ Abgeschlossen', value: 'completed' },
        { name: '❌ Storniert', value: 'cancelled' }, { name: '💸 Erstattet', value: 'refunded' })))
    .addSubcommand(s => s.setName('finish').setDescription('Bestellung abschließen mit Datei')
      .addIntegerOption(o => o.setName('nummer').setDescription('Bestellnummer (0 = aktueller Channel)'))
      .addAttachmentOption(o => o.setName('datei').setDescription('Produkt-Datei')))
    .addSubcommand(s => s.setName('info').setDescription('Bestelldetails')
      .addIntegerOption(o => o.setName('nummer').setDescription('Bestellnummer').setRequired(true))),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (!hasOrderTeamRole(interaction.member, guildId)) {
      return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Keine Berechtigung', color: '#ED4245' })], ephemeral: true });
    }

    // ===== PANEL =====
    if (sub === 'panel') {
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      await interaction.deferReply({ ephemeral: true });
      try {
        const msg = await channel.send(createOrderPanel(guildId));
        const orderCfg = getOrderConfig(guildId);
        orderCfg.panelChannelId = channel.id;
        orderCfg.panelMessageId = msg.id;
        saveOrderConfig(guildId, orderCfg);
        await interaction.editReply({ embeds: [createStyledEmbed({ emoji: '✅', title: 'Panel gesendet', description: `In <#${channel.id}>`, color: '#57F287' })] });
        logOrderEvent(interaction.guild, `📋 Bestell-Panel in <#${channel.id}> von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STOP =====
    if (sub === 'stop') {
      const orderCfg = getOrderConfig(guildId);
      if (orderCfg.paused) return interaction.reply({ content: '⏸️ Bereits pausiert.', ephemeral: true });
      orderCfg.paused = true;
      saveOrderConfig(guildId, orderCfg);
      
      // Update panel
      if (orderCfg.panelChannelId && orderCfg.panelMessageId) {
        try {
          const ch = interaction.guild.channels.cache.get(orderCfg.panelChannelId);
          const msg = await ch?.messages.fetch(orderCfg.panelMessageId).catch(() => null);
          if (msg) await msg.edit(createOrderPanel(guildId));
        } catch (e) {}
      }
      
      await interaction.reply({ embeds: [createStyledEmbed({ emoji: '⏸️', title: 'Bestellungen pausiert', color: '#FEE75C' })] });
      logOrderEvent(interaction.guild, `⏸️ Bestellungen pausiert von <@${interaction.user.id}>`);
    }

    // ===== RESUME =====
    if (sub === 'resume') {
      const orderCfg = getOrderConfig(guildId);
      if (!orderCfg.paused) return interaction.reply({ content: '▶️ Nicht pausiert.', ephemeral: true });
      orderCfg.paused = false;
      saveOrderConfig(guildId, orderCfg);
      
      if (orderCfg.panelChannelId && orderCfg.panelMessageId) {
        try {
          const ch = interaction.guild.channels.cache.get(orderCfg.panelChannelId);
          const msg = await ch?.messages.fetch(orderCfg.panelMessageId).catch(() => null);
          if (msg) await msg.edit(createOrderPanel(guildId));
        } catch (e) {}
      }
      
      await interaction.reply({ embeds: [createStyledEmbed({ emoji: '▶️', title: 'Bestellungen fortgesetzt', color: '#57F287' })] });
      logOrderEvent(interaction.guild, `▶️ Bestellungen fortgesetzt von <@${interaction.user.id}>`);
    }

    // ===== LIST =====
    if (sub === 'list') {
      const filter = interaction.options.getString('status');
      let orders = loadOrders(guildId);
      if (filter) orders = orders.filter(o => o.status === filter);

      if (!orders.length) return interaction.reply({ content: '📋 Keine Bestellungen.', ephemeral: true });

      const grouped = {};
      for (const o of orders) {
        if (!grouped[o.status]) grouped[o.status] = [];
        grouped[o.status].push(o);
      }

      const fields = Object.entries(grouped).map(([status, list]) => {
        const info = Object.values(ORDER_STATUS).find(s => s.key === status) || ORDER_STATUS.NEW;
        return {
          name: `${info.emoji} ${info.label} (${list.length})`,
          value: list.slice(-10).map(o => `• #${o.id} - <@${o.userId}>`).join('\n').substring(0, 1024),
          inline: false
        };
      });

      await interaction.reply({
        embeds: [createStyledEmbed({ emoji: '📋', title: `Bestellungen (${orders.length})`, fields, color: '#5865F2' })],
        ephemeral: true
      });
    }

    // ===== STATUS =====
    if (sub === 'status') {
      const nr = interaction.options.getInteger('nummer');
      const newStatus = interaction.options.getString('neuer-status');
      const orders = loadOrders(guildId);
      const order = orders.find(o => o.id === nr);

      if (!order) return interaction.reply({ content: `❌ Bestellung #${nr} nicht gefunden.`, ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      await updateOrderStatus(interaction.guild, order, newStatus, interaction.user, guildId);
      const info = Object.values(ORDER_STATUS).find(s => s.key === newStatus);
      await interaction.editReply({ embeds: [createStyledEmbed({ emoji: '✅', title: 'Status geändert', description: `#${nr} → ${info.emoji} ${info.label}`, color: info.color })] });
    }

    // ===== FINISH =====
    if (sub === 'finish') {
      let nr = interaction.options.getInteger('nummer');
      const attachment = interaction.options.getAttachment('datei');
      const orders = loadOrders(guildId);
      
      let order;
      if (!nr || nr === 0) {
        order = orders.find(o => o.channelId === interaction.channel.id);
        if (!order) return interaction.reply({ content: '❌ Kein Bestell-Channel. Gib eine Nummer an.', ephemeral: true });
      } else {
        order = orders.find(o => o.id === nr);
        if (!order) return interaction.reply({ content: `❌ Bestellung #${nr} nicht gefunden.`, ephemeral: true });
      }

      await interaction.deferReply();

      try {
        const transcript = await generateOrderTranscript(interaction.guild, order, guildId);
        await updateOrderStatus(interaction.guild, order, 'completed', interaction.user, guildId);

        const files = [];
        if (transcript?.htmlPath) files.push({ attachment: transcript.htmlPath, name: `bestellung_${order.id}.html` });
        if (transcript?.txtPath) files.push({ attachment: transcript.txtPath, name: `bestellung_${order.id}.txt` });

        const finishEmbed = createStyledEmbed({
          emoji: '✅',
          title: `Bestellung #${order.id} abgeschlossen`,
          fields: [
            { name: 'Kunde', value: `<@${order.userId}>`, inline: true },
            { name: 'Von', value: `<@${interaction.user.id}>`, inline: true }
          ],
          color: '#57F287'
        });

        // Transcript Channel
        const orderCfg = getOrderConfig(guildId);
        const cfg = readCfg(guildId);
        const transcriptChId = orderCfg.transcriptChannelId || cfg.transcriptChannelId;
        if (transcriptChId) {
          const tCh = interaction.guild.channels.cache.get(transcriptChId);
          if (tCh) {
            const tFiles = [...files];
            if (attachment) tFiles.push({ attachment: attachment.url, name: attachment.name });
            await tCh.send({ embeds: [finishEmbed], files: tFiles });
          }
        }

        // DM mit Datei
        try {
          const user = await interaction.client.users.fetch(order.userId).catch(() => null);
          if (user) {
            const dmFiles = attachment ? [{ attachment: attachment.url, name: attachment.name }] : [];
            await user.send({
              embeds: [createStyledEmbed({ emoji: '✅', title: 'Deine Bestellung ist fertig!', description: `Bestellung **#${order.id}** abgeschlossen!`, color: '#57F287', footer: interaction.guild.name })],
              files: dmFiles
            }).catch(() => {});
          }
        } catch (e) {}

        const replyFiles = attachment ? [{ attachment: attachment.url, name: attachment.name }] : [];
        await interaction.editReply({ embeds: [finishEmbed], files: replyFiles });
        logOrderEvent(interaction.guild, `✅ Bestellung #${order.id} abgeschlossen von <@${interaction.user.id}>`);

        // Channel schließen
        setTimeout(async () => {
          const ch = interaction.guild.channels.cache.get(order.channelId);
          if (ch) {
            if (orderCfg.archiveCategoryId) {
              try {
                await ch.setParent(orderCfg.archiveCategoryId, { lockPermissions: false });
                await ch.setName(`abgeschlossen-${order.id}`);
                await ch.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
              } catch (e) { await ch.delete().catch(() => {}); }
            } else {
              await ch.delete().catch(() => {});
            }
          }
        }, 10000);

      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== INFO =====
    if (sub === 'info') {
      const nr = interaction.options.getInteger('nummer');
      const orders = loadOrders(guildId);
      const order = orders.find(o => o.id === nr);

      if (!order) return interaction.reply({ content: `❌ Bestellung #${nr} nicht gefunden.`, ephemeral: true });

      const info = Object.values(ORDER_STATUS).find(s => s.key === order.status) || ORDER_STATUS.NEW;

      await interaction.reply({
        embeds: [createStyledEmbed({
          emoji: '🛒',
          title: `Bestellung #${order.id}`,
          fields: [
            { name: 'Kunde', value: `<@${order.userId}>`, inline: true },
            { name: 'Status', value: `${info.emoji} ${info.label}`, inline: true },
            { name: 'Channel', value: order.channelId ? `<#${order.channelId}>` : 'Gelöscht', inline: true },
            { name: 'Erstellt', value: `<t:${Math.floor(order.createdAt / 1000)}:F>`, inline: true },
            ...Object.entries(order.formResponses || {}).map(([k, v]) => ({ name: k, value: v.substring(0, 1024), inline: false }))
          ],
          color: info.color
        })],
        ephemeral: true
      });
    }
  }
};