const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { readCfg, writeCfg } = require("../database");

const DAY_OPTIONS = [
  { option: "montag", key: "monday", label: "Montag", emoji: "📅" },
  { option: "dienstag", key: "tuesday", label: "Dienstag", emoji: "📅" },
  { option: "mittwoch", key: "wednesday", label: "Mittwoch", emoji: "📅" },
  { option: "donnerstag", key: "thursday", label: "Donnerstag", emoji: "📅" },
  { option: "freitag", key: "friday", label: "Freitag", emoji: "📅" },
  { option: "samstag", key: "saturday", label: "Samstag", emoji: "📅" },
  { option: "sonntag", key: "sunday", label: "Sonntag", emoji: "📅" },
];

function getDefaultSupportSchedule() {
  const defaultDay = { enabled: true, start: "00:00", end: "23:59" };
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
      end: cfg.end || defaults[day.key].end,
    };
  }

  return merged;
}

function buildScheduleEmbed(cfg) {
  const enabled = cfg.ticketSupportTimes?.enabled !== false;
  const schedule = buildSupportSchedule(cfg.ticketSupportTimes?.schedule);
  const timezone = cfg.ticketSupportTimes?.timezone || "Europe/Berlin";

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x3b82f6 : 0xffa500)
    .setTitle("🕒 Supportzeiten konfigurieren")
    .setDescription(
      enabled
        ? "Klicke auf einen Wochentag, um die Zeiten zu ändern."
        : "Supportzeiten sind aktuell deaktiviert. Aktiviere sie mit dem Button oder passe einzelne Tage an."
    )
    .setFooter({ text: `Zeitzone: ${timezone}` })
    .setTimestamp();

  for (const day of DAY_OPTIONS) {
    const dayCfg = schedule[day.key];
    const value = dayCfg.enabled ? `${dayCfg.start} - ${dayCfg.end}` : "Geschlossen";
    embed.addFields({ name: `${day.emoji} ${day.label}`, value, inline: true });
  }

  return embed;
}

function buildScheduleComponents(cfg) {
  const enabled = cfg.ticketSupportTimes?.enabled !== false;

  const firstRow = new ActionRowBuilder().addComponents(
    ...DAY_OPTIONS.slice(0, 5).map((day) =>
      new ButtonBuilder()
        .setCustomId(`setup_time_edit:${day.key}`)
        .setLabel(day.label)
        .setEmoji("🕒")
        .setStyle(ButtonStyle.Primary)
    )
  );

  const secondRowButtons = DAY_OPTIONS.slice(5).map((day) =>
    new ButtonBuilder()
      .setCustomId(`setup_time_edit:${day.key}`)
      .setLabel(day.label)
      .setEmoji("🕒")
      .setStyle(ButtonStyle.Primary)
  );

  secondRowButtons.push(
    new ButtonBuilder()
      .setCustomId("setup_time_toggle")
      .setLabel(enabled ? "Deaktivieren" : "Aktivieren")
      .setEmoji(enabled ? "⏸️" : "▶️")
      .setStyle(enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
  );

  const secondRow = new ActionRowBuilder().addComponents(secondRowButtons);

  return [firstRow, secondRow];
}

function formatTimePart(value) {
  return value.toString().padStart(2, "0");
}

function parseTimeRange(input) {
  if (!input || typeof input !== "string") return null;
  const normalized = input.toLowerCase().replace(/\s+/g, " ").trim();

  if (["geschlossen", "close", "closed", "aus", "off"].includes(normalized)) {
    return { enabled: false, start: "00:00", end: "00:00" };
  }

  if (normalized === "24/7" || normalized === "24-7") {
    return { enabled: true, start: "00:00", end: "23:59" };
  }

  const match = normalized.match(
    /(\d{1,2}):(\d{2})\s*(?:-|bis|–|—|to)\s*(\d{1,2}):(\d{2})/
  );
  if (!match) return null;

  const [, sh, sm, eh, em] = match;
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
    end: `${formatTimePart(endHour)}:${formatTimePart(endMin)}`,
  };
}

function getDayLabel(dayKey) {
  return DAY_OPTIONS.find((d) => d.key === dayKey)?.label || dayKey;
}

/**
 * Button + Modal Handling (damit du index.js:2914 entfernen kannst)
 * Rückgabe: true wenn handled, sonst false
 */
async function handleComponent(interaction) {
  // Buttons
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith("setup_time_")) return false;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content:
          "❌ Du benötigst die Berechtigung **Server verwalten**, um die Supportzeiten zu ändern.",
        ephemeral: true,
      });
      return true;
    }

    const guildId = interaction.guildId;
    const cfg = readCfg(guildId);

    if (!cfg.ticketSupportTimes) {
      cfg.ticketSupportTimes = {
        enabled: true,
        timezone: "Europe/Berlin",
        schedule: getDefaultSupportSchedule(),
      };
    }

    // Toggle
    if (interaction.customId === "setup_time_toggle") {
      const current = cfg.ticketSupportTimes.enabled !== false;
      cfg.ticketSupportTimes.enabled = !current;
      writeCfg(guildId, cfg);

      const embed = buildScheduleEmbed(cfg);
      const components = buildScheduleComponents(cfg);

      await interaction.update({ embeds: [embed], components });
      return true;
    }

    // Edit Day -> Modal
    if (interaction.customId.startsWith("setup_time_edit:")) {
      const dayKey = interaction.customId.split(":")[1];
      const schedule = buildSupportSchedule(cfg.ticketSupportTimes.schedule);
      const currentDay = schedule[dayKey];

      const modal = new ModalBuilder()
        .setCustomId(`setup_time_modal:${dayKey}`)
        .setTitle(`Supportzeit: ${getDayLabel(dayKey)}`); // kurz halten

      const input = new TextInputBuilder()
        .setCustomId("time_range")
        .setLabel("Zeitfenster") // <= 45 Zeichen (FIX)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('z.B. 18:00-20:00, 24/7 oder "geschlossen"')
        .setValue(currentDay?.enabled ? `${currentDay.start}-${currentDay.end}` : "geschlossen");

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      await interaction.showModal(modal);
      return true;
    }

    return false;
  }

  // Modal Submit
  if (interaction.isModalSubmit()) {
    if (!interaction.customId.startsWith("setup_time_modal:")) return false;

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content:
          "❌ Du benötigst die Berechtigung **Server verwalten**, um die Supportzeiten zu ändern.",
        ephemeral: true,
      });
      return true;
    }

    const dayKey = interaction.customId.split(":")[1];
    const raw = interaction.fields.getTextInputValue("time_range")?.trim();

    const guildId = interaction.guildId;
    const cfg = readCfg(guildId);

    if (!cfg.ticketSupportTimes) {
      cfg.ticketSupportTimes = {
        enabled: true,
        timezone: "Europe/Berlin",
        schedule: getDefaultSupportSchedule(),
      };
    }

    // leer -> nichts ändern
    if (!raw) {
      const embed = buildScheduleEmbed(cfg);
      const components = buildScheduleComponents(cfg);

      await interaction.reply({
        content: "ℹ️ Keine Änderung vorgenommen (leeres Feld).",
        embeds: [embed],
        components,
        ephemeral: true,
      });
      return true;
    }

    const parsed = parseTimeRange(raw);
    if (!parsed) {
      await interaction.reply({
        content:
          "❌ Ungültiges Format. Nutze z.B. `18:00-20:00`, `18:00 bis 20:00`, `24/7` oder `geschlossen`.",
        ephemeral: true,
      });
      return true;
    }

    const schedule = buildSupportSchedule(cfg.ticketSupportTimes.schedule);
    schedule[dayKey] = parsed;
    cfg.ticketSupportTimes.schedule = schedule;

    writeCfg(guildId, cfg);

    const embed = buildScheduleEmbed(cfg);
    const components = buildScheduleComponents(cfg);

    await interaction.reply({
      content: `✅ **${getDayLabel(dayKey)}** gespeichert: ${
        parsed.enabled ? `${parsed.start} - ${parsed.end}` : "Geschlossen"
      }`,
      embeds: [embed],
      components,
      ephemeral: true,
    });

    return true;
  }

  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Konfiguriere Ticket-Einstellungen")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName("time").setDescription("Supportzeiten bearbeiten (UI mit Buttons)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("time-set")
        .setDescription("Supportzeiten festlegen (24h-Format)")
        .addStringOption((opt) =>
          opt
            .setName("montag")
            .setDescription("z.B. 18:00-20:00 oder geschlossen")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("dienstag")
            .setDescription("z.B. 18:00-20:00 oder geschlossen")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("mittwoch")
            .setDescription("z.B. 18:00-20:00 oder geschlossen")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("donnerstag")
            .setDescription("z.B. 18:00-20:00 oder geschlossen")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("freitag")
            .setDescription("z.B. 18:00-20:00 oder geschlossen")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("samstag")
            .setDescription("z.B. 18:00-20:00 oder geschlossen")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("sonntag")
            .setDescription("z.B. 18:00-20:00 oder geschlossen")
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("aktiv")
            .setDescription("Supportzeiten aktivieren (Standard: an)")
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content:
          "❌ Du benötigst die Berechtigung **Server verwalten**, um die Supportzeiten zu ändern.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guildId;
    const cfg = readCfg(guildId);

    if (sub === "time") {
      const embed = buildScheduleEmbed(cfg);
      const components = buildScheduleComponents(cfg);

      return interaction.reply({
        embeds: [embed],
        components,
        ephemeral: true,
      });
    }

    if (sub === "time-set") {
      const schedule = {};
      for (const day of DAY_OPTIONS) {
        const raw = interaction.options.getString(day.option);
        const parsed = parseTimeRange(raw);

        if (!parsed) {
          return interaction.reply({
            content: `❌ Ungültiges Zeitformat für **${day.label}**. Nutze z.B. \`18:00-20:00\` oder \`geschlossen\`.`,
            ephemeral: true,
          });
        }

        schedule[day.key] = parsed;
      }

      const enabledFlag = interaction.options.getBoolean("aktiv");
      cfg.ticketSupportTimes = {
        enabled: enabledFlag !== false,
        timezone: cfg.ticketSupportTimes?.timezone || "Europe/Berlin",
        schedule,
      };

      writeCfg(guildId, cfg);

      const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle("🕒 Supportzeiten aktualisiert")
        .setDescription("Supportzeiten wurden gespeichert.")
        .addFields(
          DAY_OPTIONS.map((day) => {
            const dayCfg = schedule[day.key];
            const value = dayCfg.enabled ? `${dayCfg.start} - ${dayCfg.end}` : "Geschlossen";
            return { name: day.label, value, inline: true };
          })
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // Export für interactionCreate (Buttons/Modals)
  handleComponent,
};
