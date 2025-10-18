const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('togglemessage')
    .setDescription('Toggle startup notifications for this server')
    .setDescriptionLocalizations({
      de: 'Aktiviere/Deaktiviere Startup-Benachrichtigungen für diesen Server'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guildId = interaction.guild.id;
      const configPath = path.join(__dirname, '..', 'configs', `${guildId}.json`);

      // Read current config
      let cfg = {};
      if (fs.existsSync(configPath)) {
        cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }

      // Toggle the setting (default is false)
      const currentStatus = cfg.startupNotificationsEnabled || false;
      cfg.startupNotificationsEnabled = !currentStatus;

      // Save config
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));

      const statusText = cfg.startupNotificationsEnabled ? '✅ Aktiviert' : '❌ Deaktiviert';
      const statusEmoji = cfg.startupNotificationsEnabled ? '🔔' : '🔕';

      await interaction.editReply({
        embeds: [{
          color: cfg.startupNotificationsEnabled ? 0x00ff88 : 0xe74c3c,
          title: `${statusEmoji} Startup-Benachrichtigungen ${statusText}`,
          description: cfg.startupNotificationsEnabled
            ? 'Der Bot sendet ab jetzt eine Benachrichtigung, wenn er neu gestartet wird.'
            : 'Der Bot sendet keine Startup-Benachrichtigungen mehr.',
          fields: [
            {
              name: '📋 Status',
              value: statusText,
              inline: true
            },
            {
              name: '🔧 Konfiguriert von',
              value: `<@${interaction.user.id}>`,
              inline: true
            }
          ],
          footer: { text: 'Quantix Tickets' },
          timestamp: new Date()
        }]
      });

      console.log(`📢 Startup-Benachrichtigungen ${cfg.startupNotificationsEnabled ? 'aktiviert' : 'deaktiviert'} für ${interaction.guild.name} (${guildId})`);

    } catch (err) {
      console.error('Error in togglemessage command:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ein Fehler ist aufgetreten beim Toggle der Startup-Benachrichtigungen.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: '❌ Ein Fehler ist aufgetreten beim Toggle der Startup-Benachrichtigungen.'
        });
      }
    }
  }
};
