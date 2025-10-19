const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const https = require('https');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows bot uptime statistics from UptimeRobot')
    .setDescriptionLocalizations({
      de: 'Zeigt Bot-Uptime-Statistiken von UptimeRobot'
    }),

  async execute(interaction) {
    try {
      await interaction.deferReply();

      const apiKey = process.env.UPTIMEROBOT_API_KEY;

      if (!apiKey) {
        return interaction.editReply({
          content: '❌ UptimeRobot API Key ist nicht konfiguriert. Bitte füge `UPTIMEROBOT_API_KEY` zur .env Datei hinzu.',
        });
      }

      // Fetch data from UptimeRobot API
      const uptimeData = await getUptimeRobotData(apiKey);

      if (!uptimeData || uptimeData.stat !== 'ok') {
        return interaction.editReply({
          content: '❌ Fehler beim Abrufen der Uptime-Daten von UptimeRobot.',
        });
      }

      const monitors = uptimeData.monitors;

      if (!monitors || monitors.length === 0) {
        return interaction.editReply({
          content: '❌ Keine Monitors gefunden. Bitte konfiguriere einen Monitor in UptimeRobot.',
        });
      }

      // Get first monitor (or you can loop through all)
      const monitor = monitors[0];

      // Calculate uptime percentages
      const uptimeRatios = monitor.custom_uptime_ratios || '';
      const ratios = uptimeRatios.split('-');
      const uptime1Day = ratios[0] || 'N/A';
      const uptime7Days = ratios[1] || 'N/A';
      const uptime30Days = ratios[2] || 'N/A';

      // Status mapping
      const statusMap = {
        0: '⏸️ Pausiert',
        1: '❌ Nicht überwacht',
        2: '🟢 Online',
        8: '🔴 Down',
        9: '🟠 Scheint Down'
      };

      const status = statusMap[monitor.status] || '❓ Unbekannt';
      const statusColor = monitor.status === 2 ? 0x00ff88 :
                         monitor.status === 8 ? 0xff4444 :
                         monitor.status === 9 ? 0xff9900 : 0x95a5a6;

      // Response times
      const avgResponseTime = monitor.average_response_time || 'N/A';

      // Create progress bars
      const uptimeBar1Day = createProgressBar(parseFloat(uptime1Day));
      const uptimeBar7Days = createProgressBar(parseFloat(uptime7Days));
      const uptimeBar30Days = createProgressBar(parseFloat(uptime30Days));

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(statusColor)
        .setTitle('📊 Bot Uptime Statistics')
        .setDescription(`**${monitor.friendly_name}**\n${monitor.url || 'N/A'}`)
        .addFields(
          {
            name: '🔴 Status',
            value: status,
            inline: true
          },
          {
            name: '⚡ Ø Response Time',
            value: avgResponseTime !== 'N/A' ? `${avgResponseTime}ms` : 'N/A',
            inline: true
          },
          {
            name: '\u200b',
            value: '\u200b',
            inline: true
          },
          {
            name: '📅 24 Stunden Uptime',
            value: `${uptimeBar1Day}\n**${uptime1Day}%** Uptime`,
            inline: false
          },
          {
            name: '📆 7 Tage Uptime',
            value: `${uptimeBar7Days}\n**${uptime7Days}%** Uptime`,
            inline: false
          },
          {
            name: '📊 30 Tage Uptime',
            value: `${uptimeBar30Days}\n**${uptime30Days}%** Uptime`,
            inline: false
          }
        )
        .setFooter({
          text: 'Powered by UptimeRobot',
          iconURL: 'https://uptimerobot.com/assets/img/logo_plain.png'
        })
        .setTimestamp();

      // Add last downtime if available
      if (monitor.logs && monitor.logs.length > 0) {
        const lastLog = monitor.logs[0];
        if (lastLog.type === 1) { // Down event
          const downDate = new Date(lastLog.datetime * 1000);
          embed.addFields({
            name: '⏱️ Letzter Downtime',
            value: `<t:${lastLog.datetime}:R> (${lastLog.duration || 'N/A'}s)`,
            inline: false
          });
        }
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Error in uptime command:', err);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ein Fehler ist aufgetreten beim Abrufen der Uptime-Daten.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: '❌ Ein Fehler ist aufgetreten beim Abrufen der Uptime-Daten.'
        });
      }
    }
  }
};

/**
 * Fetches data from UptimeRobot API
 */
function getUptimeRobotData(apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      api_key: apiKey,
      format: 'json',
      custom_uptime_ratios: '1-7-30', // 1 day, 7 days, 30 days
      logs: 1,
      log_types: '1-2', // down and up events
      logs_limit: 10
    });

    const options = {
      hostname: 'api.uptimerobot.com',
      port: 443,
      path: '/v2/getMonitors',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Cache-Control': 'no-cache'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Creates a visual progress bar
 */
function createProgressBar(percentage) {
  if (isNaN(percentage)) return '▱▱▱▱▱▱▱▱▱▱ 0%';

  const total = 10;
  const filled = Math.round((percentage / 100) * total);
  const empty = total - filled;

  const bar = '▰'.repeat(filled) + '▱'.repeat(empty);

  // Color based on percentage
  if (percentage >= 99.5) return `🟢 ${bar}`;
  if (percentage >= 95) return `🟡 ${bar}`;
  if (percentage >= 90) return `🟠 ${bar}`;
  return `🔴 ${bar}`;
}
