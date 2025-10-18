const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Link zum Admin-Panel anzeigen')
    .setDMPermission(false),
  async execute(interaction) {
    const PANEL_URL = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
      : 'https://tickets.quantix-bot.de';

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL(PANEL_URL)
        .setStyle(ButtonStyle.Link)
        .setLabel('🖥️ Dashboard öffnen')
    );

    await interaction.reply({
      content: '**TRS Tickets Admin-Panel**\nKlicke auf den Button um das Dashboard zu öffnen:',
      components: [button],
      ephemeral: true
    });
  }
};
