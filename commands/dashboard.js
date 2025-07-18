// commands/dashboard.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Link zum Ticket‑Dashboard anzeigen')
    .setDMPermission(false),       // nur im Server, nicht in DMs
  async execute (interaction) {
    // Panel‑Adresse zentral festlegen (→ .env oder harte URL)
    const url = process.env.PANEL_URL || 'http://192.168.178.141:3000/panel';

    // Nur dir zeigen (ephemeral), damit kein Spam entsteht
    await interaction.reply({
      content: `🖥️ Hier geht’s zum Dashboard:\n${url}`,
      ephemeral: true
    });
  }
};
