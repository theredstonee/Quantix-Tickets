const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { t } = require('../translations');

const ALLOWED_USERS = ['1159182333316968530', '1415387837359984740', '1048900200497954868', '928901974106202113'];

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
      .setTitle('🔄 Bot wird neu gestartet')
      .setDescription(
        '**Der Bot wird jetzt neu gestartet...**\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      )
      .addFields(
        { name: '⏱️ Downtime', value: '`~5-10 Sekunden`', inline: true },
        { name: '💾 Daten', value: 'Alle gespeichert', inline: true },
        { name: '🔐 Status', value: 'Sicher', inline: true },
        {
          name: '✅ Was bleibt erhalten',
          value:
            '`•` Alle Server-Konfigurationen\n' +
            '`•` Ticket-Verlauf & Transcripts\n' +
            '`•` Premium-Status & Features\n' +
            '`•` Alle Benutzereinstellungen',
          inline: false
        },
        {
          name: '🚀 Nach dem Restart',
          value:
            '`•` Commands automatisch neu registriert\n' +
            '`•` Alle Funktionen wieder verfügbar\n' +
            '`•` Bot ist sofort einsatzbereit',
          inline: false
        }
      )
      .setColor(0xff9900)
      .setFooter({
        text: `Angefordert von ${interaction.user.tag} • Quantix Tickets`,
        iconURL: interaction.user.displayAvatarURL({ size: 32 })
      })
      .setTimestamp();

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
