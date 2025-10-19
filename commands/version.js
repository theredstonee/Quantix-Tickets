const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t } = require('../translations');
const { VERSION, RELEASE_DATE, REPOSITORY, COPYRIGHT } = require('../version.config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show current bot version')
    .setDescriptionLocalizations({
      de: 'Zeige aktuelle Bot-Version'
    })
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild?.id;
    const client = interaction.client;

    const embed = new EmbedBuilder()
      .setTitle('🤖 Quantix Tickets Bot')
      .setDescription(
        `Das moderne Ticket-System für Discord mit Multi-Server Support und 9 Sprachen.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        { name: '📌 Version', value: `\`${VERSION}\``, inline: true },
        { name: '📅 Release', value: `${RELEASE_DATE}`, inline: true },
        { name: '🌐 Sprachen', value: '9 verfügbar', inline: true },
        {
          name: '✨ Neu in dieser Version',
          value:
            '`•` **Verbesserte Sicherheit:** Team-Rolle aus Claim entfernt\n' +
            '`•` **Privatsphäre:** Nur Creator, Claimer & Hinzugefügte\n' +
            '`•` **Hierarchie:** Priority-Rollen bleiben aktiv\n' +
            '`•` **Optimierung:** Bessere Performance & Stabilität',
          inline: false
        },
        {
          name: '🚀 Hauptfunktionen',
          value:
            '`•` 🎫 Vollständiges Ticket-System mit Claim\n' +
            '`•` 🎯 3-stufiges Priority-System (Grün/Orange/Rot)\n' +
            '`•` 📝 HTML & TXT Transcripts\n' +
            '`•` 📊 Analytics Dashboard (Premium)\n' +
            '`•` 🌍 9 Sprachen verfügbar',
          inline: false
        }
      )
      .setColor(0x00ff88)
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
      .setFooter({
        text: `${COPYRIGHT} • Server: ${interaction.guild.name}`,
        iconURL: interaction.guild.iconURL({ size: 64 })
      })
      .setTimestamp();

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL(REPOSITORY)
        .setStyle(ButtonStyle.Link)
        .setLabel('GitHub')
        .setEmoji('💻'),
      new ButtonBuilder()
        .setURL('https://discord.com/invite/mnYbnpyyBS')
        .setStyle(ButtonStyle.Link)
        .setLabel('Support Server')
        .setEmoji('💬'),
      new ButtonBuilder()
        .setURL('https://quantixtickets.theredstonee.de/panel')
        .setStyle(ButtonStyle.Link)
        .setLabel('Dashboard')
        .setEmoji('🎫')
    );

    await interaction.reply({
      embeds: [embed],
      components: [buttonRow],
      ephemeral: false
    });
  }
};
