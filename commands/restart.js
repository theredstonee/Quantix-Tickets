// commands/restart.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Bot neu starten')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.reply({
      content: '🔄 Bot wird neu gestartet...',
      ephemeral: true
    });

    console.log('⚠️ Restart angefordert von', interaction.user.tag);

    // Bot neu starten nach kurzer Verzögerung
    setTimeout(() => {
      process.exit(0); // Exit Code 0 = clean exit (Process Manager sollte neu starten)
    }, 1000);
  }
};
