const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { execSync } = require('child_process');
const { t, getGuildLanguage } = require('../translations');
const { VERSION, RELEASE_DATE, REPOSITORY, COPYRIGHT } = require('../version.config');
const changelog = require('../changelog.json');

// Git Commit ID abrufen
function getGitCommitId() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show current bot version')
    .setDescriptionLocalizations({
      de: 'Zeige aktuelle Bot-Version'
    })
    .setDMPermission(false),

  async execute(interaction) {
    // Defer reply to prevent timeout on slow connections
    await interaction.deferReply();

    const guildId = interaction.guild?.id;
    const client = interaction.client;
    const lang = getGuildLanguage(guildId) || 'de';
    const commitId = getGitCommitId();

    // Lade aktuellen Changelog
    const currentChangelog = changelog.versions[0];
    const changes = currentChangelog?.changes[lang] || currentChangelog?.changes['en'] || currentChangelog?.changes['de'] || [];
    const changelogText = changes.slice(0, 5).map(c => `\`•\` ${c}`).join('\n') || 'Keine Änderungen';

    const embed = new EmbedBuilder()
      .setTitle('🤖 Quantix Tickets Bot')
      .setDescription(
        `Das moderne Ticket-System für Discord mit Multi-Server Support und 9 Sprachen.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        { name: '📌 Version', value: `\`${VERSION}\``, inline: true },
        { name: '🔧 Build', value: `\`${commitId}\``, inline: true },
        { name: '📅 Release', value: `${RELEASE_DATE}`, inline: true },
        {
          name: `✨ Neu in Version ${VERSION}`,
          value: changelogText,
          inline: false
        },
        {
          name: '🚀 Hauptfunktionen',
          value:
            '`•` 🎫 Vollständiges Ticket-System mit Claim\n' +
            '`•` 🎯 3-stufiges Priority-System (Grün/Orange/Rot)\n' +
            '`•` 📝 HTML & TXT Transcripts\n' +
            '`•` 📊 Analytics Dashboard\n' +
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
        .setURL('https://tickets.quantix-bot.de/panel')
        .setStyle(ButtonStyle.Link)
        .setLabel('Dashboard')
        .setEmoji('🎫')
    );

    await interaction.editReply({
      embeds: [embed],
      components: [buttonRow]
    });
  }
};
