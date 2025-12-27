const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { readCfg, writeCfg } = require('../database');

const DAY_OPTIONS = [
  { option: 'montag', key: 'monday', label: 'Montag' },
  { option: 'dienstag', key: 'tuesday', label: 'Dienstag' },
  { option: 'mittwoch', key: 'wednesday', label: 'Mittwoch' },
  { option: 'donnerstag', key: 'thursday', label: 'Donnerstag' },
  { option: 'freitag', key: 'friday', label: 'Freitag' },
  { option: 'samstag', key: 'saturday', label: 'Samstag' },
  { option: 'sonntag', key: 'sunday', label: 'Sonntag' }
];

function formatTimePart(value) {
  return value.toString().padStart(2, '0');
}

function parseTimeRange(input) {
  if (!input || typeof input !== 'string') return null;
  const normalized = input.toLowerCase().replace(/\s+/g, ' ').trim();

  if (['geschlossen', 'close', 'closed', 'aus', 'off'].includes(normalized)) {
    return { enabled: false, start: '00:00', end: '00:00' };
  }

  if (normalized === '24/7' || normalized === '24-7') {
    return { enabled: true, start: '00:00', end: '23:59' };
  }

  const match = normalized.match(/(\d{1,2}):(\d{2})\s*(?:-|bis|–|—|to)\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const [_, sh, sm, eh, em] = match;
  const startHour = parseInt(sh, 10);
  const startMin = parseInt(sm, 10);
  const endHour = parseInt(eh, 10);
  const endMin = parseInt(em, 10);

  const isValid =
    startHour >= 0 && startHour < 24 &&
    endHour >= 0 && endHour < 24 &&
    startMin >= 0 && startMin < 60 &&
    endMin >= 0 && endMin < 60;

  if (!isValid) return null;

  return {
    enabled: true,
    start: `${formatTimePart(startHour)}:${formatTimePart(startMin)}`,
    end: `${formatTimePart(endHour)}:${formatTimePart(endMin)}`
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Konfiguriere Ticket-Einstellungen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('time')
        .setDescription('Supportzeiten für die Ticket-Erstellung festlegen (24h-Format)')
        .addStringOption(opt =>
          opt
            .setName('montag')
            .setDescription('z.B. 18:00-20:00 oder geschlossen')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('dienstag')
            .setDescription('z.B. 18:00-20:00 oder geschlossen')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('mittwoch')
            .setDescription('z.B. 18:00-20:00 oder geschlossen')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('donnerstag')
            .setDescription('z.B. 18:00-20:00 oder geschlossen')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('freitag')
            .setDescription('z.B. 18:00-20:00 oder geschlossen')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('samstag')
            .setDescription('z.B. 18:00-20:00 oder geschlossen')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('sonntag')
            .setDescription('z.B. 18:00-20:00 oder geschlossen')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt
            .setName('aktiv')
            .setDescription('Supportzeiten aktivieren (Standard: an)')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'time') return;

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: '❌ Du benötigst die Berechtigung **Server verwalten**, um die Supportzeiten zu ändern.',
        ephemeral: true
      });
    }

    const guildId = interaction.guild.id;
    const cfg = readCfg(guildId);

    const schedule = {};
    for (const day of DAY_OPTIONS) {
      const raw = interaction.options.getString(day.option);
      const parsed = parseTimeRange(raw);

      if (!parsed) {
        return interaction.reply({
          content: `❌ Ungültiges Zeitformat für **${day.label}**. Nutze z.B. \`18:00-20:00\`, \`18:00 bis 20:00\` oder \`geschlossen\`.`,
          ephemeral: true
        });
      }

      schedule[day.key] = parsed;
    }

    const enabledFlag = interaction.options.getBoolean('aktiv');
    cfg.ticketSupportTimes = {
      enabled: enabledFlag !== false,
      timezone: cfg.ticketSupportTimes?.timezone || 'Europe/Berlin',
      schedule
    };

    writeCfg(guildId, cfg);

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle('🕒 Supportzeiten aktualisiert')
      .setDescription('Tickets außerhalb der eingetragenen Zeiten erhalten einen Hinweis im Ticket-Embed.')
      .addFields(
        DAY_OPTIONS.map(day => {
          const dayCfg = schedule[day.key];
          const value = dayCfg.enabled ? `${dayCfg.start} - ${dayCfg.end}` : 'Geschlossen';
          return { name: day.label, value, inline: true };
        })
      )
      .setFooter({ text: cfg.language === 'en' ? 'Support hours saved' : 'Supportzeiten gespeichert' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
