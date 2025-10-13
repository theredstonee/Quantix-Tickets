// commands/version.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t } = require('../translations');

const VERSION = 'Beta 0.3.2';
const RELEASE_DATE = '2025-10-12';

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
        `🔧 GitHub Commit Logs Toggle System\n` +
        `👥 Multi-Level Priority Roles (Green/Orange/Red)\n` +
        `👀 Live Preview for Role Count per Priority\n` +
        `⚙️ Server-specific GitHub Logs Configuration\n` +
        `🎛️ Interactive Toggle Buttons for GitHub Notifications\n` +
        `🛡️ Multiple Role Selection per Priority Level\n\n` +
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
