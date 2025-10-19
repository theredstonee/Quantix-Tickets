const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Link zum Admin-Panel anzeigen')
    .setDMPermission(false),
  async execute(interaction) {
    const PANEL_URL = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
      : 'https://tickets.quantix-bot.de';

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🎫 Quantix Tickets Dashboard')
      .setDescription(
        '**Verwalte dein Ticket-System im Web-Dashboard**\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      )
      .addFields(
        {
          name: '📊 Dashboard-Funktionen',
          value:
            '`•` **Ticket-Kategorien** konfigurieren\n' +
            '`•` **Team-Rollen** & Berechtigungen verwalten\n' +
            '`•` **Dynamische Formulare** erstellen\n' +
            '`•` **Embeds** anpassen & gestalten\n' +
            '`•` **Ticket-Verlauf** & Transcripts ansehen\n' +
            '`•` **Premium-Features** verwalten',
          inline: false
        },
        {
          name: '🔐 Zugriff',
          value: 'Du benötigst **Administrator-Rechte** auf diesem Server, um das Dashboard zu nutzen.',
          inline: false
        }
      )
      .setThumbnail(interaction.client.user.displayAvatarURL({ size: 128 }))
      .setFooter({
        text: `Quantix Tickets © ${new Date().getFullYear()} • ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL({ size: 64 })
      })
      .setTimestamp();

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL(PANEL_URL)
        .setStyle(ButtonStyle.Link)
        .setLabel('Dashboard öffnen')
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setURL('https://discord.com/invite/mnYbnpyyBS')
        .setStyle(ButtonStyle.Link)
        .setLabel('Support')
        .setEmoji('💬')
    );

    await interaction.reply({
      embeds: [embed],
      components: [buttonRow],
      ephemeral: true
    });
  }
};
