const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { readCfg } = require('../database');

const DAY_OPTIONS = [
  { key: 'monday', label: 'Montag', emoji: '📅' },
  { key: 'tuesday', label: 'Dienstag', emoji: '📅' },
  { key: 'wednesday', label: 'Mittwoch', emoji: '📅' },
  { key: 'thursday', label: 'Donnerstag', emoji: '📅' },
  { key: 'friday', label: 'Freitag', emoji: '📅' },
  { key: 'saturday', label: 'Samstag', emoji: '📅' },
  { key: 'sunday', label: 'Sonntag', emoji: '📅' }
];

function getDefaultSupportSchedule() {
  const defaultDay = { enabled: true, start: '00:00', end: '23:59' };
  return DAY_OPTIONS.reduce((acc, day) => {
    acc[day.key] = { ...defaultDay };
    return acc;
  }, {});
}

function buildSupportSchedule(schedule = {}) {
  const defaults = getDefaultSupportSchedule();
  const merged = {};

  for (const day of DAY_OPTIONS) {
    const cfg = schedule[day.key] || {};
    merged[day.key] = {
      enabled: cfg.enabled !== undefined ? cfg.enabled : defaults[day.key].enabled,
      start: cfg.start || defaults[day.key].start,
      end: cfg.end || defaults[day.key].end
    };
  }

  return merged;
}

function buildScheduleEmbed(cfg) {
  const enabled = cfg.ticketSupportTimes?.enabled !== false;
  const schedule = buildSupportSchedule(cfg.ticketSupportTimes?.schedule);
  const timezone = cfg.ticketSupportTimes?.timezone || 'Europe/Berlin';

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x3b82f6 : 0xffa500)
    .setTitle('🕒 Supportzeiten konfigurieren')
    .setDescription(
      enabled
        ? 'Klicke auf einen Wochentag, um die Zeiten zu ändern. Lässt du ein Feld leer, bleibt der Tag unverändert.'
        : 'Supportzeiten sind aktuell deaktiviert. Aktiviere sie mit dem Button oder passe einzelne Tage an.'
    )
    .setFooter({ text: `Zeitzone: ${timezone}` })
    .setTimestamp();

  for (const day of DAY_OPTIONS) {
    const dayCfg = schedule[day.key];
    const value = dayCfg.enabled ? `${dayCfg.start} - ${dayCfg.end}` : 'Geschlossen';
    embed.addFields({ name: `${day.emoji} ${day.label}`, value, inline: true });
  }

  return embed;
}

function buildScheduleComponents(cfg) {
  const enabled = cfg.ticketSupportTimes?.enabled !== false;

  const firstRow = new ActionRowBuilder().addComponents(
    ...DAY_OPTIONS.slice(0, 5).map(day =>
      new ButtonBuilder()
        .setCustomId(`setup_time_edit:${day.key}`)
        .setLabel(day.label)
        .setEmoji('🕒')
        .setStyle(ButtonStyle.Primary)
    )
  );

  const secondRowButtons = DAY_OPTIONS.slice(5).map(day =>
    new ButtonBuilder()
      .setCustomId(`setup_time_edit:${day.key}`)
      .setLabel(day.label)
      .setEmoji('🕒')
      .setStyle(ButtonStyle.Primary)
  );

  secondRowButtons.push(
    new ButtonBuilder()
      .setCustomId('setup_time_toggle')
      .setLabel(enabled ? 'Deaktivieren' : 'Aktivieren')
      .setEmoji(enabled ? '⏸️' : '▶️')
      .setStyle(enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
  );

  const secondRow = new ActionRowBuilder().addComponents(secondRowButtons);

  return [firstRow, secondRow];
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
        .setDescription('Supportzeiten für die Ticket-Erstellung bearbeiten (Formular)')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'time') return;

    const guildId = interaction.guild.id;
    const cfg = readCfg(guildId);

    const embed = buildScheduleEmbed(cfg);
    const components = buildScheduleComponents(cfg);

    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true
    });
  }
};
