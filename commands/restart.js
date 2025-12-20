const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { t } = require('../translations');

const ALLOWED_USERS = ['1159182333316968530', '1415387837359984740', '1048900200497954868', '928901974106202113'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Services neu starten (Owner only)')
    .setDescriptionLocalizations({
      de: 'Bot/Web neu starten (Nur Owner)'
    })
    .addStringOption(option =>
      option.setName('service')
        .setDescription('Was soll neu gestartet werden?')
        .setRequired(true)
        .addChoices(
          { name: '🔄 Alles (Bot + Web)', value: 'all' },
          { name: '🤖 Nur Bot', value: 'bot' },
          { name: '🌐 Nur Web', value: 'web' }
        ))
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

    const service = interaction.options.getString('service');
    const guildId = interaction.guild?.id;

    const serviceNames = {
      all: 'Bot + Website',
      bot: 'Bot',
      web: 'Website'
    };

    const embed = new EmbedBuilder()
      .setTitle(`🔄 ${serviceNames[service]} wird neu gestartet`)
      .setDescription(
        `**${serviceNames[service]} wird jetzt neu gestartet...**\n\n` +
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
            '`•` Services sofort einsatzbereit',
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

    console.log(`⚠️ RESTART (${service}) angefordert von ${interaction.user.tag} (${interaction.user.id}) auf Server ${interaction.guild?.name} (${guildId})`);

    setTimeout(async () => {
      console.log(`🔄 Führe Restart durch für: ${service}...`);

      // Restart Web if selected
      if (service === 'all' || service === 'web') {
        try {
          console.log('🌐 Restarting quantix-web...');
          await execPromise('sudo systemctl restart quantix-web').catch(async () => {
            await execPromise('pm2 restart quantix-panel').catch(() => {});
          });
          console.log('✅ quantix-web restarted');
        } catch (e) {
          console.log('⚠️ Web restart error:', e.message);
        }
      }

      // Restart Bot if selected
      if (service === 'all' || service === 'bot') {
        try {
          console.log('🤖 Restarting quantix-bot...');
          await execPromise('sudo systemctl restart quantix-bot').catch(() => {
            // Fallback: Exit process
            process.exit(0);
          });
        } catch (e) {
          // Fallback: Exit to let service manager restart
          process.exit(0);
        }
      }

      // If only web was restarted, don't exit the bot
      if (service === 'web') {
        console.log('✅ Web restart complete, bot continues running');
      }
    }, 2000);
  }
};
