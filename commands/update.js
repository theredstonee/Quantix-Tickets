const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('Neueste Version von GitHub ziehen und Bot + Website neu starten')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      console.log('🔄 Update angefordert von', interaction.user.tag);

      // Git stash um lokale Änderungen zu sichern
      console.log('📦 Stashing local changes...');
      await execPromise('git stash --include-untracked').catch(() => {});

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

      response += '\n\n📦 Installiere Dependencies...';
      await interaction.editReply(response);

      console.log('📦 Running npm install...');
      await execPromise('npm install').catch(err => {
        console.warn('⚠️ npm install warning:', err.message);
      });

      response += '\n🔄 Bot und Website werden neu gestartet...';
      await interaction.editReply(response);

      // Restart both bot and panel via PM2
      setTimeout(async () => {
        console.log('🔄 Restarting bot and panel after update...');
        try {
          // Try to restart panel if it exists
          await execPromise('pm2 restart quantix-panel').catch(() => {
            console.log('Panel nicht als PM2 Prozess gefunden, überspringe...');
          });
        } catch (e) {
          // Panel might not be running as separate PM2 process
        }
        // Exit to restart bot (PM2 will restart it)
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
