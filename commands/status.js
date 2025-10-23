const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t } = require('../translations');
const http = require('http');

async function checkWebPanelStatus() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000', { timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 302);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function formatUptime(ms) {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check bot and server status')
    .setDescriptionLocalizations({
      de: 'Bot- und Server-Status überprüfen'
    })
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();

    const client = interaction.client;
    const guildId = interaction.guild?.id;

    // Check web panel status
    const webPanelOnline = await checkWebPanelStatus();

    // Calculate bot stats
    const uptime = formatUptime(client.uptime);
    const ping = client.ws.ping;
    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

    // Memory usage
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);

    const botStatus = '✅ Online';
    const webStatus = webPanelOnline ? '✅ Online' : '❌ Offline';
    const serverStatus = webPanelOnline ? '✅ Operational' : '⚠️ Degraded';

    const embed = new EmbedBuilder()
      .setTitle('📊 Quantix Tickets Status')
      .setDescription(
        `**Bot Status:** ${botStatus}\n` +
        `**Web Panel:** ${webStatus}\n` +
        `**Server Status:** ${serverStatus}\n\n` +
        `**Uptime:** ${uptime}\n` +
        `**Ping:** ${ping}ms\n` +
        `**Memory:** ${memUsedMB}MB / ${memTotalMB}MB\n\n` +
        `**Servers:** ${guildCount}\n` +
        `**Users:** ${userCount.toLocaleString()}\n\n` +
        `Für detaillierte Informationen über alle Dienste, klicke auf den Button unten:`
      )
      .setColor(webPanelOnline ? 0x00ff88 : 0xffaa00)
      .setFooter({ text: 'Quantix Tickets © 2025 Theredstonee • Alle Rechte vorbehalten' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🔍 Status Seite')
        .setStyle(ButtonStyle.Link)
        .setURL('https://status.theredstonee.de')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  }
};
