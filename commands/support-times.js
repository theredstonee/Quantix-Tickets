const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

function readCfg(guildId) {
  try {
    const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function getDayName(day, lang) {
  const names = {
    de: {
      monday: 'Montag',
      tuesday: 'Dienstag',
      wednesday: 'Mittwoch',
      thursday: 'Donnerstag',
      friday: 'Freitag',
      saturday: 'Samstag',
      sunday: 'Sonntag'
    },
    en: {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday'
    }
  };

  return names[lang]?.[day] || day;
}

function getDayEmoji(day, enabled) {
  if (!enabled) return '❌';

  const now = new Date();
  const dayOfWeek = now.getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[dayOfWeek];

  return day === currentDay ? '🟢' : '✅';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support-times')
    .setDescription('Zeigt die Voice Support-Zeiten an')
    .setDescriptionLocalizations({
      'en-US': 'Show voice support hours'
    }),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const cfg = readCfg(guildId);

      const lang = cfg.language || 'de';

      if (!cfg.voiceSupport || !cfg.voiceSupport.enabled) {
        const noVoiceEmbed = new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle(lang === 'de' ? '🔴 Voice Support nicht verfügbar' : '🔴 Voice Support not available')
          .setDescription(
            lang === 'de'
              ? 'Voice Support ist auf diesem Server nicht aktiviert.'
              : 'Voice support is not enabled on this server.'
          )
          .setTimestamp();

        return interaction.reply({ embeds: [noVoiceEmbed], ephemeral: true });
      }

      const supportHours = cfg.voiceSupport.supportHours || {};
      const enforceHours = cfg.voiceSupport.enforceHours !== false;

      const embed = new EmbedBuilder()
        .setColor(cfg.voiceSupport.embedColor || '#3b82f6')
        .setTitle(lang === 'de' ? '🕒 Voice Support-Zeiten' : '🕒 Voice Support Hours')
        .setDescription(
          enforceHours
            ? (lang === 'de'
                ? 'Unsere Voice Support-Zeiten. Außerhalb dieser Zeiten ist der Voice-Support nicht verfügbar.'
                : 'Our voice support hours. Outside these hours, voice support is not available.')
            : (lang === 'de'
                ? 'Voice Support ist 24/7 verfügbar! Die angezeigten Zeiten sind nur als Richtwert gedacht.'
                : 'Voice support is available 24/7! The displayed hours are for reference only.')
        )
        .setFooter({ text: lang === 'de' ? 'Aktuelle Uhrzeit: ' + new Date().toLocaleTimeString('de-DE') : 'Current time: ' + new Date().toLocaleTimeString('en-US') })
        .setTimestamp();

      // Add fields for each day
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const fields = [];

      days.forEach(day => {
        const dayConfig = supportHours[day] || { enabled: true, start: '00:00', end: '23:59' };
        const dayName = getDayName(day, lang);
        const emoji = getDayEmoji(day, dayConfig.enabled);

        let value = '';
        if (dayConfig.enabled) {
          value = `${dayConfig.start} - ${dayConfig.end}`;
        } else {
          value = lang === 'de' ? 'Geschlossen' : 'Closed';
        }

        fields.push({
          name: `${emoji} ${dayName}`,
          value: value,
          inline: true
        });
      });

      embed.addFields(fields);

      // Add current status
      const now = new Date();
      const dayOfWeek = now.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = dayNames[dayOfWeek];
      const currentDayConfig = supportHours[currentDay] || { enabled: true, start: '00:00', end: '23:59' };

      if (currentDayConfig.enabled && enforceHours) {
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startHour, startMin] = currentDayConfig.start.split(':').map(Number);
        const [endHour, endMin] = currentDayConfig.end.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        let isOpen = false;
        if (startTime <= endTime) {
          isOpen = currentTime >= startTime && currentTime <= endTime;
        } else {
          isOpen = currentTime >= startTime || currentTime <= endTime;
        }

        embed.addFields({
          name: '\u200B',
          value: '\u200B'
        });

        embed.addFields({
          name: lang === 'de' ? '📊 Aktueller Status' : '📊 Current Status',
          value: isOpen
            ? (lang === 'de' ? '🟢 **Geöffnet** - Support ist aktuell verfügbar!' : '🟢 **Open** - Support is currently available!')
            : (lang === 'de' ? '🔴 **Geschlossen** - Support ist aktuell nicht verfügbar' : '🔴 **Closed** - Support is currently not available'),
          inline: false
        });
      } else if (!enforceHours) {
        embed.addFields({
          name: '\u200B',
          value: '\u200B'
        });

        embed.addFields({
          name: lang === 'de' ? '📊 Aktueller Status' : '📊 Current Status',
          value: lang === 'de' ? '🟢 **24/7 Verfügbar**' : '🟢 **Available 24/7**',
          inline: false
        });
      }

      // Add waiting room channel link if exists
      if (cfg.voiceSupport.waitingRoomChannelId) {
        embed.addFields({
          name: lang === 'de' ? '🎤 Wartezimmer' : '🎤 Waiting Room',
          value: `<#${cfg.voiceSupport.waitingRoomChannelId}>`,
          inline: false
        });
      }

      return interaction.reply({ embeds: [embed] });

    } catch (err) {
      console.error('Error in support-times command:', err);
      return interaction.reply({
        content: '❌ Es ist ein Fehler aufgetreten.',
        ephemeral: true
      });
    }
  }
};
