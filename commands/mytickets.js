const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

function getTicketsPath(guildId) {
  return path.join(__dirname, '..', 'configs', `${guildId}_tickets.json`);
}

function safeRead(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mytickets')
    .setDescription('Show your own tickets (open and history)')
    .setDescriptionLocalizations({
      de: 'Zeige deine eigenen Tickets (offen und Verlauf)',
      'en-US': 'Show your own tickets (open and history)',
      'en-GB': 'Show your own tickets (open and history)',
      'es-ES': 'Muestra tus propios tickets (abiertos e historial)',
      fr: 'Afficher vos propres tickets (ouverts et historique)',
      'pt-BR': 'Mostrar seus próprios tickets (abertos e histórico)',
      ru: 'Показать ваши тикеты (открытые и история)',
      ja: '自分のチケットを表示（オープンと履歴）',
      id: 'Tampilkan tiket Anda sendiri (terbuka dan riwayat)'
    })
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const ticketsPath = getTicketsPath(guildId);
    const allTickets = safeRead(ticketsPath, []);

    // Filter user's tickets
    const userTickets = allTickets.filter(t => t.userId === userId);

    if (userTickets.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('📋 Meine Tickets')
        .setDescription('Du hast noch keine Tickets erstellt.')
        .setFooter({ text: `Quantix Tickets • ${interaction.guild.name}` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    const openTickets = userTickets.filter(t => t.status === 'offen');
    const closedTickets = userTickets.filter(t => t.status === 'geschlossen');

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('📋 Meine Tickets')
      .setDescription(
        `**Übersicht deiner Tickets**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        {
          name: '✅ Offene Tickets',
          value: openTickets.length > 0
            ? openTickets.map(t => {
                const channel = interaction.guild.channels.cache.get(t.channelId);
                const channelMention = channel ? `<#${t.channelId}>` : `~~Ticket #${String(t.id).padStart(5, '0')}~~`;
                const priorityDot = t.priority === 2 ? '🔴' : t.priority === 1 ? '🟠' : '🟢';
                const timestamp = `<t:${Math.floor(t.timestamp / 1000)}:R>`;
                return `${priorityDot} ${channelMention} • **${t.topic}** • ${timestamp}`;
              }).join('\n')
            : '`Keine offenen Tickets`',
          inline: false
        },
        {
          name: '📦 Geschlossene Tickets',
          value: closedTickets.length > 0
            ? `\`${closedTickets.length} geschlossene Tickets\``
            : '`Keine geschlossenen Tickets`',
          inline: false
        }
      )
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
      .setFooter({
        text: `Quantix Tickets © ${new Date().getFullYear()} • ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL({ size: 64 })
      })
      .setTimestamp();

    // Add statistics
    if (userTickets.length > 0) {
      const avgTime = closedTickets.length > 0
        ? closedTickets.reduce((sum, t) => {
            const closeTime = t.closedAt || Date.now();
            return sum + (closeTime - t.timestamp);
          }, 0) / closedTickets.length
        : 0;

      const avgDays = avgTime > 0 ? Math.floor(avgTime / (1000 * 60 * 60 * 24)) : 0;
      const avgHours = avgTime > 0 ? Math.floor((avgTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : 0;

      embed.addFields({
        name: '📊 Statistiken',
        value:
          `\`•\` **Gesamt:** ${userTickets.length} Tickets\n` +
          `\`•\` **Offen:** ${openTickets.length}\n` +
          `\`•\` **Geschlossen:** ${closedTickets.length}\n` +
          (avgTime > 0 ? `\`•\` **Ø Bearbeitungszeit:** ${avgDays}d ${avgHours}h` : ''),
        inline: false
      });
    }

    const PANEL_URL = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
      : 'https://tickets.quantix-bot.de';

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL(`${PANEL_URL}/my-tickets`)
        .setStyle(ButtonStyle.Link)
        .setLabel('Vollständiger Verlauf')
        .setEmoji('📜'),
      new ButtonBuilder()
        .setURL('https://discord.com/invite/mnYbnpyyBS')
        .setStyle(ButtonStyle.Link)
        .setLabel('Support')
        .setEmoji('💬')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [buttonRow]
    });
  }
};
