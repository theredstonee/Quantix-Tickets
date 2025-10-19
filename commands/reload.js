const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { t } = require('../translations');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Reload bot configuration and commands')
    .setDescriptionLocalizations({
      de: 'Config und Commands neu laden'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild?.id;

    try {
      let configCount = 0;
      const configDir = path.join(__dirname, '..', 'configs');
      if (fs.existsSync(configDir)) {
        const configFiles = fs.readdirSync(configDir).filter(f => f.endsWith('.json'));
        configCount = configFiles.length;
        configFiles.forEach(file => {
          const filePath = path.join(configDir, file);
          delete require.cache[require.resolve(filePath)];
        });
      }

      const legacyPath = path.join(__dirname, '..', 'config.json');
      if (fs.existsSync(legacyPath)) {
        delete require.cache[require.resolve(legacyPath)];
      }

      const commandFiles = fs.readdirSync(path.join(__dirname)).filter(f => f.endsWith('.js'));
      let reloadedCount = 0;
      for (const file of commandFiles) {
        const filePath = path.join(__dirname, file);
        delete require.cache[require.resolve(filePath)];
        reloadedCount++;
      }

      const translationsPath = path.join(__dirname, '..', 'translations.js');
      if (fs.existsSync(translationsPath)) {
        delete require.cache[require.resolve(translationsPath)];
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('🔄 Reload erfolgreich!')
        .setDescription('**Alle Komponenten wurden erfolgreich neu geladen.**\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '📦 Commands', value: `\`${reloadedCount}\` neu geladen`, inline: true },
          { name: '⚙️ Server-Configs', value: `\`${configCount}\` aktualisiert`, inline: true },
          { name: '🌐 Übersetzungen', value: 'Cache geleert', inline: true },
          {
            name: '✅ Erfolgreich geladen',
            value:
              '`•` Command-Cache zurückgesetzt\n' +
              '`•` Konfigurationsdateien aktualisiert\n' +
              '`•` Übersetzungsmodul neu geladen\n' +
              '`•` Bot läuft weiter ohne Neustart',
            inline: false
          }
        )
        .setFooter({
          text: `Ausgeführt von ${interaction.user.tag} • Quantix Tickets`,
          iconURL: interaction.user.displayAvatarURL({ size: 32 })
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [successEmbed],
        ephemeral: true
      });

      console.log(`🔄 Reload durchgeführt von ${interaction.user.tag} auf Server ${interaction.guild?.name}`);

    } catch (err) {
      console.error('Reload Fehler:', err);

      const errorEmbed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Reload Fehler')
        .setDescription('**Beim Neuladen ist ein Fehler aufgetreten.**')
        .addFields({
          name: '🐛 Fehlermeldung',
          value: `\`\`\`${err.message || 'Unbekannter Fehler'}\`\`\``,
          inline: false
        })
        .setFooter({ text: 'Quantix Tickets • Fehler beim Reload' })
        .setTimestamp();

      await interaction.reply({
        embeds: [errorEmbed],
        ephemeral: true
      });
    }
  }
};
