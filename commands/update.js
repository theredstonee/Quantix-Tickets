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

      // Restart services via systemctl or PM2
      setTimeout(async () => {
        console.log('🔄 Restarting bot and web after update...');

        // Try systemctl first (for systemd services)
        try {
          console.log('🌐 Restarting quantix-web via systemctl...');
          await execPromise('sudo systemctl restart quantix-web').catch(async (e) => {
            console.log('systemctl quantix-web failed, trying PM2...');
            await execPromise('pm2 restart quantix-panel').catch(() => {});
          });
        } catch (e) {
          console.log('Web restart error:', e.message);
        }

        // Restart bot via systemctl (this will also restart this process)
        try {
          console.log('🤖 Restarting quantix-bot via systemctl...');
          await execPromise('sudo systemctl restart quantix-bot').catch(async (e) => {
            console.log('systemctl quantix-bot failed, using process.exit...');
            // Fallback: Exit process (PM2/systemd will restart it)
            process.exit(0);
          });
        } catch (e) {
          // Fallback: Exit to let service manager restart
          process.exit(0);
        }
      }, 2000);

    } catch (err) {
      console.error('Update Fehler:', err);
      await interaction.editReply({
        content: '❌ Fehler beim Update:\n```\n' + err.message + '\n```'
      });
    }
  }
};
