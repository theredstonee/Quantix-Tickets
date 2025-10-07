// commands/reload.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Config neu laden')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  async execute(interaction) {
    try {
      // Config neu laden
      const cfgPath = path.join(__dirname, '..', 'config.json');
      delete require.cache[require.resolve(cfgPath)];

      await interaction.reply({
        content: '✅ Config erfolgreich neu geladen!',
        ephemeral: true
      });
    } catch (err) {
      console.error('Reload Fehler:', err);
      await interaction.reply({
        content: '❌ Fehler beim Neuladen der Config: ' + err.message,
        ephemeral: true
      });
    }
  }
};
