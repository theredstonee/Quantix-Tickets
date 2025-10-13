const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { t } = require('../translations');

const VERSION = 'Beta 0.3.4';
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
        `🔐 Application Key Security System implemented\n` +
        `📝 README.md completely redesigned with all features\n` +
        `⚖️ License changed to "All Rights Reserved"\n` +
        `🛡️ Removed setup details from README for security\n` +
        `📚 Full documentation of multi-server, priority roles & all features\n\n` +
        `[GitHub Repository](https://github.com/TheRedstoneE/TRS-Tickets-Bot)`
      )
      .setColor(0x00ff88)
      .setFooter({ text: 'TRS Tickets © 2025 Theredstonee • Alle Rechte vorbehalten' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });
  }
};
