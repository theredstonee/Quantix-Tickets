const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('Neueste Version von GitHub ziehen und neu starten')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      console.log('🔄 Update angefordert von', interaction.user.tag);

      const { stdout, stderr } = await execPromise('git pull');

      let response = '📥 **Git Pull Output:**\n```\n' + stdout + '\n```';
      if (stderr) {
        response += '\n⚠️ **Stderr:**\n```\n' + stderr + '\n```';
      }

      if (stdout.includes('Already up to date') || stdout.includes('Bereits aktuell')) {
        response += '\n✅ Bereits auf dem neuesten Stand!';
        await interaction.editReply(response);
        return;
      }

      response += '\n\n🔄 Bot wird neu gestartet...';
      await interaction.editReply(response);

      console.log('📦 Running npm install...');
      await execPromise('npm install').catch(err => {
        console.warn('⚠️ npm install warning:', err.message);
      });

      setTimeout(() => {
        console.log('🔄 Restarting after update...');
        process.exit(0);
      }, 2000);

    } catch (err) {
      console.error('Update Fehler:', err);
      await interaction.editReply({
        content: '❌ Fehler beim Update:\n```\n' + err.message + '\n```'
      });
    }
  }
};
