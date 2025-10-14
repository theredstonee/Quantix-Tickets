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
        `🔒 Claim/Unclaim System: Team role removed from permissions\n` +
        `👥 Only creator, claimer and added users have access to claimed tickets\n` +
        `🎯 Hierarchical priority roles remain active and functional\n` +
        `🗑️ Chinese language completely removed (zh.json, flag, commands)\n` +
        `🛡️ Improved security and privacy for claimed tickets\n\n` +
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
