const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Founder IDs
const FOUNDER_IDS = ['1048900200497954868', '1159182333316968530'];

// Whitelisted Server (funktioniert während Maintenance)
const WHITELISTED_SERVER_ID = '1403053662825222388';

const maintenanceFile = path.join(__dirname, '..', 'maintenance.json');

// Read guild config
function readCfg(guildId) {
  try {
    const CONFIG_DIR = path.join(__dirname, '..', 'configs');
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);

    if (!fs.existsSync(configPath)) {
      return {};
    }

    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading config for guild ${guildId}:`, err);
    return {};
  }
}

function readMaintenanceState() {
  if (!fs.existsSync(maintenanceFile)) {
    return { enabled: false, enabledAt: null, enabledBy: null, reason: null };
  }
  try {
    return JSON.parse(fs.readFileSync(maintenanceFile, 'utf8'));
  } catch (err) {
    return { enabled: false, enabledAt: null, enabledBy: null, reason: null };
  }
}

function writeMaintenanceState(state) {
  fs.writeFileSync(maintenanceFile, JSON.stringify(state, null, 2), 'utf8');
}

// Function to send log to all configured servers
async function sendMaintenanceLog(client, enabled, reason, userId) {
  try {
    const guilds = await client.guilds.fetch();

    for (const [guildId, guild] of guilds) {
      try {
        const fullGuild = await guild.fetch();
        const cfg = readCfg(fullGuild.id);
        const logChannelIds = Array.isArray(cfg.logChannelId) ? cfg.logChannelId : (cfg.logChannelId ? [cfg.logChannelId] : []);

        if (logChannelIds.length === 0) continue;

        const logEmbed = new EmbedBuilder()
          .setColor(enabled ? 0xff9500 : 0x00ff88)
          .setTitle(enabled ? '🔧 Wartungsmodus aktiviert' : '✅ Wartungsmodus deaktiviert')
          .setDescription(
            enabled
              ? '**Der Bot wurde in den Wartungsmodus versetzt.**\n\n' +
                `Der Bot funktioniert nur noch auf dem whitelisted Server.\n` +
                `Alle anderen Server erhalten eine Wartungsmeldung.`
              : '**Der Bot ist wieder für alle Server verfügbar.**\n\n' +
                'Der Wartungsmodus wurde beendet und alle Funktionen sind wieder verfügbar.'
          )
          .addFields(
            {
              name: enabled ? '📝 Grund' : '⏱️ Durchgeführt von',
              value: enabled ? (reason || 'Wartungsarbeiten') : `<@${userId}>`,
              inline: true
            },
            {
              name: '💡 Bot Status',
              value: enabled ? '🔴 Nicht stören (DND)' : '🟢 Online',
              inline: true
            }
          )
          .setFooter({ text: 'Quantix Tickets • Maintenance System' })
          .setTimestamp();

        if (enabled) {
          logEmbed.addFields({
            name: '✅ Whitelisted Server',
            value: `\`${WHITELISTED_SERVER_ID}\``,
            inline: false
          });
        }

        // Send to all log channels
        for (const channelId of logChannelIds) {
          try {
            const channel = await fullGuild.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
              await channel.send({ embeds: [logEmbed] });
            }
          } catch (err) {
            console.error(`Error sending maintenance log to channel ${channelId}:`, err);
          }
        }
      } catch (err) {
        console.error(`Error processing guild ${guildId} for maintenance log:`, err);
      }
    }
  } catch (err) {
    console.error('Error sending maintenance logs:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Toggle maintenance mode (Founder only)')
    .setDescriptionLocalizations({
      de: 'Wartungsmodus umschalten (Nur Founder)'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  sendMaintenanceLog, // Export for use in modal handler
  WHITELISTED_SERVER_ID, // Export for consistency

  async execute(interaction) {
    try {
      // Check if user is Founder
      if (!FOUNDER_IDS.includes(interaction.user.id)) {
        const noPermEmbed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('❌ Keine Berechtigung')
          .setDescription('Dieser Command ist nur für Founder verfügbar.')
          .setFooter({ text: 'Quantix Tickets • Founder Command' })
          .setTimestamp();

        return interaction.reply({ embeds: [noPermEmbed], ephemeral: true });
      }

      const state = readMaintenanceState();

      // Toggle maintenance mode
      if (state.enabled) {
        // DISABLE maintenance mode
        const previousState = { ...state };

        writeMaintenanceState({
          enabled: false,
          enabledAt: null,
          enabledBy: null,
          reason: null
        });

        // Restore bot status
        try {
          await interaction.client.user.setPresence({
            activities: [{ name: '🎫 Tickets verwalten | quantix-bot.de', type: ActivityType.Watching }],
            status: 'online'
          });
          console.log('✅ Bot Status wiederhergestellt: Online mit normalem Status');
        } catch (err) {
          console.error('❌ Error restoring bot status:', err);
        }

        const disableEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ Wartungsmodus deaktiviert')
          .setDescription(
            '**Der Bot ist wieder für alle Server verfügbar.**\n\n' +
            'Status wurde auf "Online" zurückgesetzt.'
          )
          .addFields(
            {
              name: '💡 Status',
              value: '🟢 Online',
              inline: true
            },
            {
              name: '⏱️ Wartungsdauer',
              value: `<t:${Math.floor(previousState.enabledAt / 1000)}:R> bis jetzt`,
              inline: true
            }
          )
          .setFooter({ text: 'Quantix Tickets • Maintenance Mode' })
          .setTimestamp();

        await interaction.reply({ embeds: [disableEmbed] });

        console.log(`✅ Maintenance Mode DISABLED by ${interaction.user.tag} (${interaction.user.id})`);

        // Send logs to all servers
        await sendMaintenanceLog(interaction.client, false, null, interaction.user.id);

      } else {
        // ENABLE maintenance mode - Show modal for reason (optional)
        const modal = new ModalBuilder()
          .setCustomId('maintenance_enable_modal')
          .setTitle('Wartungsmodus aktivieren');

        const reasonInput = new TextInputBuilder()
          .setCustomId('maintenance_reason')
          .setLabel('Grund für Wartung (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('z.B. Update 1.5.0, Server-Migration, etc.')
          .setRequired(false)
          .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
      }

    } catch (error) {
      console.error('Error in maintenance command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ein Fehler ist aufgetreten.',
          ephemeral: true
        });
      }
    }
  },

  // Export helper functions
  readMaintenanceState,
  writeMaintenanceState,
  FOUNDER_IDS
};
