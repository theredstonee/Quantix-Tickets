// commands/version.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const VERSION = 'Alpha 1.0';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Bot-Version anzeigen')
    .setDMPermission(false),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🤖 TRS Tickets Bot')
      .setDescription(`**Version:** ${VERSION}`)
      .setColor(0x00ff00)
      .setFooter({ text: 'TRS Tickets ©️' })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
