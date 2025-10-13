const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { t } = require('../translations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the bot')
    .setDescriptionLocalizations({
      de: 'Bot neu starten'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild?.id;

    const embed = new EmbedBuilder()
      .setTitle('🔄 Bot Restart')
      .setDescription(
        '**Bot wird neu gestartet...**\n\n' +
        '⏱️ Erwartete Downtime: ~5-10 Sekunden\n' +
        '✅ Alle Konfigurationen bleiben erhalten\n' +
        '📝 Commands werden automatisch neu registriert\n\n' +
        `Angefordert von: ${interaction.user}`
      )
      .setColor(0xff9900)
      .setTimestamp()
      .setFooter({ text: 'TRS Tickets ©️' });

    await interaction.reply({
      embeds: [embed],
      ephemeral: false
    });

    console.log(`⚠️ RESTART angefordert von ${interaction.user.tag} (${interaction.user.id}) auf Server ${interaction.guild?.name} (${guildId})`);

    setTimeout(() => {
      console.log('🔄 Führe Restart durch...');
      process.exit(0);
    }, 2000);
  }
};
