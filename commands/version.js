const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t } = require('../translations');

const VERSION = 'Beta 0.3.3';
const RELEASE_DATE = '2025-10-13';

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
        `🔧 Fixed Hebrew locale issue in slash commands\n` +
        `✅ All 9 commands now load correctly\n` +
        `📊 New /status command with link to status page\n` +
        `🐛 Fixed UnknownEnumValueError for github-commits, version, reload, restart\n\n` +
        `[GitHub Repository](https://github.com/TheRedstoneE/TRS-Tickets-Bot)`
      )
      .setColor(0x00ff88)
      .setFooter({ text: 'TRS Tickets ©️' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
