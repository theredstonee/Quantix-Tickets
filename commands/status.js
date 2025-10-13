const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t } = require('../translations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check bot and server status')
    .setDescriptionLocalizations({
      de: 'Bot- und Server-Status überprüfen'
    })
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild?.id;

    const embed = new EmbedBuilder()
      .setTitle('📊 TRS Tickets Status')
      .setDescription(
        '**Bot Status:** ✅ Online\n' +
        '**Server Status:** ✅ Operational\n\n' +
        'Für detaillierte Informationen über alle Dienste, klicke auf den Button unten:'
      )
      .setColor(0x00ff88)
      .setFooter({ text: 'TRS Tickets ©️' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🔍 Status Seite')
        .setStyle(ButtonStyle.Link)
        .setURL('https://status.theredstonee.de')
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false
    });
  }
};
