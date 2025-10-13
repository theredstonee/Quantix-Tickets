const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

    const embed = new EmbedBuilder()
      .setTitle('🤖 TRS Tickets Bot')
      .setDescription(
        `**Version:** ${VERSION}\n` +
        `**Release Date:** ${RELEASE_DATE}\n\n` +
        `**New in ${VERSION}:**\n` +
        `🌐 Multi-language support: Japanese, Russian, Portuguese added\n` +
        `📦 Centralized version management system\n` +
        `🎌 Language flags and improved language selection\n` +
        `🔧 Improved codebase structure and maintainability\n` +
        `✨ Updated all components to use centralized VERSION variable\n\n` +
        `[GitHub Repository](${REPOSITORY})`
      )
      .setColor(0x00ff88)
      .setFooter({ text: COPYRIGHT })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
