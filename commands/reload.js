// commands/reload.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
      // Multi-Server Configs Cache leeren
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

      // Legacy config.json Cache leeren
      const legacyPath = path.join(__dirname, '..', 'config.json');
      if (fs.existsSync(legacyPath)) {
        delete require.cache[require.resolve(legacyPath)];
      }

      // Command Files neu laden
      const commandFiles = fs.readdirSync(path.join(__dirname)).filter(f => f.endsWith('.js'));
      let reloadedCount = 0;
      for (const file of commandFiles) {
        const filePath = path.join(__dirname, file);
        delete require.cache[require.resolve(filePath)];
        reloadedCount++;
      }

      // Translation Cache leeren
      const translationsPath = path.join(__dirname, '..', 'translations.js');
      if (fs.existsSync(translationsPath)) {
        delete require.cache[require.resolve(translationsPath)];
      }

      await interaction.reply({
        content: `✅ **Reload Erfolgreich!**\n📦 ${reloadedCount} Commands neu geladen\n⚙️ ${configCount} Server-Configs aktualisiert\n🔄 Commands werden neu deployed...`,
        ephemeral: true
      });

      console.log(`🔄 Reload durchgeführt von ${interaction.user.tag} auf Server ${interaction.guild?.name}`);

    } catch (err) {
      console.error('Reload Fehler:', err);
      await interaction.reply({
        content: `❌ **Fehler beim Neuladen:**\n\`\`\`${err.message}\`\`\``,
        ephemeral: true
      });
    }
  }
};
