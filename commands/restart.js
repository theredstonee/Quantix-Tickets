const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { t } = require('../translations');

const ALLOWED_USERS = ['1159182333316968530', '1415387837359984740'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the bot (Owner only)')
    .setDescriptionLocalizations({
      de: 'Bot neu starten (Nur Owner)'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    // Owner-only check
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Only the bot owner can use this command.',
        ephemeral: true
      });
    }

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
      .setFooter({ text: 'TRS Tickets © 2025 Theredstonee • Alle Rechte vorbehalten' });

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
