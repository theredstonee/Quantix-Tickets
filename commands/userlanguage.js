const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Choose your language for the web panel / Wähle deine Sprache / בחר את השפה שלך'),

  async execute(interaction) {
    const BASE_URL = process.env.PUBLIC_BASE_URL
      ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
      : 'https://tickets.quantix-bot.de';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setURL(`${BASE_URL}/set-user-language/de`)
        .setStyle(ButtonStyle.Link)
        .setLabel('🇩🇪 Deutsch'),
      new ButtonBuilder()
        .setURL(`${BASE_URL}/set-user-language/en`)
        .setStyle(ButtonStyle.Link)
        .setLabel('🇬🇧 English'),
      new ButtonBuilder()
        .setURL(`${BASE_URL}/set-user-language/he`)
        .setStyle(ButtonStyle.Link)
        .setLabel('🇮🇱 עברית')
    );

    await interaction.reply({
      content: '🌐 **Choose your language / Wähle deine Sprache / בחר את השפה שלך**\n\nClick a button to set your preferred language for the TRS Tickets web panel.',
      components: [row],
      ephemeral: true
    });
  }
};
