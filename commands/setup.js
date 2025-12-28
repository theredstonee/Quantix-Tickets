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
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelType,
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

function buildPanelSelect(cfg) {
  const topics = (cfg.topics || []).filter((t) => t && t.label && t.value);
  const options = topics.length > 0
    ? topics
    : [{ label: "Keine Topics konfiguriert", value: "none", emoji: "⚠️" }];

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("topic")
      .setPlaceholder("Wähle dein Thema …")
      .addOptions(
        options.map((t) => ({
          label: t.label,
          value: t.value,
          emoji: t.emoji || undefined,
        }))
      )
  );
}

function buildPanelEmbed(cfg) {
  const panelEmbed = cfg.panelEmbed || {};

  const title = panelEmbed.title || cfg.panelTitle || "🎫 Ticket System";
  const description =
    panelEmbed.description ||
    cfg.panelDescription ||
    "Wähle unten ein Thema aus, um ein Ticket zu erstellen.";
  const color = panelEmbed.color || cfg.panelColor || "#5865F2";
  const footer = panelEmbed.footer || cfg.panelFooter || "Quantix Tickets";

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footer });

  if (/^#?[0-9a-fA-F]{6}$/.test(color)) {
    embed.setColor(parseInt(color.replace("#", ""), 16));
  }

  return embed;
}

function buildSetupEmbed(cfg) {
  const roleMentions = (Array.isArray(cfg.teamRoleId)
    ? cfg.teamRoleId
    : cfg.teamRoleId
    ? [cfg.teamRoleId]
    : [])
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(", ") || "Keine Rolle ausgewählt";

  const allowedRoles = (Array.isArray(cfg.allowedTicketRoles)
    ? cfg.allowedTicketRoles
    : [])
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(", ") || "Alle dürfen Tickets erstellen";

  const categoryText = cfg.categoryId ? `<#${cfg.categoryId}>` : "Keine Kategorie ausgewählt";
  const panelChannelText = cfg.panelChannelId ? `<#${cfg.panelChannelId}>` : "Kein Panel-Channel ausgewählt";
  const transcriptText = cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "Kein Transcript-Channel ausgewählt";
  const logChannelText = (() => {
    const ids = Array.isArray(cfg.logChannelId)
      ? cfg.logChannelId
      : cfg.logChannelId
      ? [cfg.logChannelId]
      : [];
    if (!ids.length) return "Kein Log-Channel ausgewählt";
    return ids.map((id) => `<#${id}>`).join(", ");
  })();

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🚀 Setup & Konfiguration")
    .setDescription(
      "Richte den Bot in wenigen Schritten ein. Wähle Team-Rollen, Kategorie, Panel- und Log-Channel und sende anschließend das Ticket-Panel."
    )
    .addFields(
      { name: "Team-Rollen", value: roleMentions, inline: false },
      { name: "Ticket-Erstellung erlaubt für", value: allowedRoles, inline: false },
      { name: "Ticket-Kategorie", value: categoryText, inline: false },
      { name: "Panel-Channel", value: panelChannelText, inline: false },
      { name: "Transcript-Channel", value: transcriptText, inline: false },
      { name: "Log-Channel", value: logChannelText, inline: false }
    )
    .setFooter({ text: "Quantix Tickets • Setup-Assistent" });
}

function buildSetupComponents(cfg) {
  const roleIds = Array.isArray(cfg.teamRoleId)
    ? cfg.teamRoleId.filter(Boolean)
    : cfg.teamRoleId
    ? [cfg.teamRoleId]
    : [];

  const logChannelIds = Array.isArray(cfg.logChannelId)
    ? cfg.logChannelId.filter(Boolean)
    : cfg.logChannelId
    ? [cfg.logChannelId]
    : [];

  const rows = [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("setup_roles")
        .setPlaceholder("Wähle Support-Rolle(n)")
        .setMinValues(0)
        .setMaxValues(5)
        .setDefaultRoles(roleIds.slice(0, 5))
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId("setup_allowed_roles")
        .setPlaceholder("Wer darf Tickets erstellen? (leer = alle)")
        .setMinValues(0)
        .setMaxValues(5)
        .setDefaultRoles((cfg.allowedTicketRoles || []).filter(Boolean).slice(0, 5))
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("setup_category")
        .setPlaceholder("Wähle Ticket-Kategorie")
        .setChannelTypes(ChannelType.GuildCategory)
        .setMinValues(0)
        .setMaxValues(1)
        .setDefaultChannels(cfg.categoryId ? [cfg.categoryId] : [])
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("setup_panel_channel")
        .setPlaceholder("Channel für Ticket-Panel")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)
        .setDefaultChannels(cfg.panelChannelId ? [cfg.panelChannelId] : [])
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("setup_transcript_channel")
        .setPlaceholder("Transcript-Channel (optional)")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1)
        .setDefaultChannels(cfg.transcriptChannelId ? [cfg.transcriptChannelId] : [])
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("setup_log_channel")
        .setPlaceholder("Log-Channel auswählen")
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(3)
        .setDefaultChannels(logChannelIds.slice(0, 3))
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup_send_panel")
        .setLabel("Panel senden")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📨"),
      new ButtonBuilder()
        .setCustomId("setup_panel_text")
        .setLabel("Panel-Text bearbeiten")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝"),
      new ButtonBuilder()
        .setCustomId("setup_refresh")
        .setLabel("Aktualisieren")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔄")
    ),
  ];

  return rows;
}

/**
 * Button + Modal Handling (damit du index.js:2914 entfernen kannst)
 * Rückgabe: true wenn handled, sonst false
 */
async function handleComponent(interaction) {
  const guildId = interaction.guildId;

  const setupIds = [
    "setup_roles",
    "setup_category",
    "setup_panel_channel",
    "setup_transcript_channel",
    "setup_log_channel",
    "setup_send_panel",
    "setup_panel_text",
    "setup_refresh",
  ];

  const isSetupWizardInteraction =
    ((interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) ||
      (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) ||
      interaction.isButton()) &&
    setupIds.includes(interaction.customId);

  if (isSetupWizardInteraction) {
    if (!guildId) return false;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "❌ Du benötigst die Berechtigung **Server verwalten**, um das Setup zu nutzen.",
        ephemeral: true,
      });
      return true;
    }

    const cfg = readCfg(guildId);
    const refresh = async (content) => {
      const embed = buildSetupEmbed(cfg);
      const components = buildSetupComponents(cfg);
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content, embeds: [embed], components });
      }
      return interaction.update({ content, embeds: [embed], components });
    };

    if (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) {
      if (interaction.customId !== "setup_roles") return false;
      cfg.teamRoleId = interaction.values || [];
      writeCfg(guildId, cfg);
      await refresh("✅ Team-Rollen gespeichert.");
      return true;
    }

    if (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu()) {
      if (interaction.customId === "setup_allowed_roles") {
        cfg.allowedTicketRoles = interaction.values || [];
        writeCfg(guildId, cfg);
        await refresh(cfg.allowedTicketRoles.length ? "✅ Erlaubte Rollen gespeichert." : "ℹ️ Ticket-Erlaubnis auf alle gesetzt.");
        return true;
      }
    }

    if (interaction.isChannelSelectMenu && interaction.isChannelSelectMenu()) {
      if (interaction.customId === "setup_category") {
        cfg.categoryId = interaction.values?.[0] || "";
        writeCfg(guildId, cfg);
        await refresh(cfg.categoryId ? "✅ Kategorie gespeichert." : "ℹ️ Kategorie entfernt.");
        return true;
      }

      if (interaction.customId === "setup_panel_channel") {
        cfg.panelChannelId = interaction.values?.[0] || "";
        if (!cfg.panelChannelId) cfg.panelMessageId = "";
        writeCfg(guildId, cfg);
        await refresh(cfg.panelChannelId ? "✅ Panel-Channel gespeichert." : "ℹ️ Panel-Channel entfernt.");
        return true;
      }

      if (interaction.customId === "setup_transcript_channel") {
        cfg.transcriptChannelId = interaction.values?.[0] || "";
        writeCfg(guildId, cfg);
        await refresh(cfg.transcriptChannelId ? "✅ Transcript-Channel gespeichert." : "ℹ️ Transcript-Channel entfernt.");
        return true;
      }

      if (interaction.customId === "setup_log_channel") {
        cfg.logChannelId = interaction.values || [];
        writeCfg(guildId, cfg);
        await refresh(cfg.logChannelId.length ? "✅ Log-Channel gespeichert." : "ℹ️ Log-Channel entfernt.");
        return true;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "setup_refresh") {
        await refresh("🔄 Aktualisiert.");
        return true;
      }

      if (interaction.customId === "setup_send_panel") {
        await interaction.deferUpdate();

        try {
          const topics = (cfg.topics || []).filter((t) => t && t.label && t.value);
          const errors = [];

          if (!cfg.panelChannelId) errors.push("Bitte wähle einen Panel-Channel aus.");
          if (!cfg.categoryId) errors.push("Bitte wähle eine Ticket-Kategorie aus.");
          if (topics.length === 0) errors.push("Bitte konfiguriere mindestens ein Ticket-Thema im Dashboard.");

          if (errors.length) {
            await interaction.followUp({ content: `❌ Panel konnte nicht gesendet werden:\n- ${errors.join("\n- ")}`, ephemeral: true });
            return true;
          }

          const channel = await interaction.guild.channels.fetch(cfg.panelChannelId).catch(() => null);

          if (
            !channel ||
            ![
              "GUILD_TEXT",
              "GUILD_NEWS",
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ].includes(channel.type)
          ) {
            await interaction.followUp({ content: "❌ Panel-Channel ist ungültig oder nicht auffindbar.", ephemeral: true });
            return true;
          }

          const embed = buildPanelEmbed(cfg);
          const row = buildPanelSelect(cfg);
          const msg = await channel.send({ embeds: [embed], components: [row] });

          cfg.panelMessageId = msg.id;
          cfg.panelChannelId = channel.id;
          writeCfg(guildId, cfg);

          await interaction.editReply({
            content:
              "Nutze die Menüs unten, um Rollen, Kategorien und Channels zu setzen. Drücke anschließend **Panel senden**.",
            embeds: [buildSetupEmbed(cfg)],
            components: buildSetupComponents(cfg),
          });

          await interaction.followUp({
            content: `✅ Panel gesendet in ${channel.toString()}.`,
            ephemeral: true,
          });
        } catch (err) {
          console.error("Setup Panel Send Error:", err);
          await interaction.followUp({
            content: "❌ Fehler beim Senden des Panels. Bitte prüfe die Berechtigungen.",
            ephemeral: true,
          });
        }
        return true;
      }

      if (interaction.customId === "setup_panel_text") {
        const panelEmbed = cfg.panelEmbed || {};
        const modal = new ModalBuilder()
          .setCustomId("setup_panel_text_modal")
          .setTitle("Panel-Text bearbeiten");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("panel_title")
              .setLabel("Titel")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(100)
              .setValue(panelEmbed.title || cfg.panelTitle || "")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("panel_description")
              .setLabel("Beschreibung")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(1024)
              .setValue(panelEmbed.description || cfg.panelDescription || "")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("panel_footer")
              .setLabel("Footer")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(100)
              .setValue(panelEmbed.footer || cfg.panelFooter || "")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("panel_color")
              .setLabel("Farbe (Hex, z.B. #5865F2)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(7)
              .setValue(panelEmbed.color || cfg.panelColor || "#5865F2")
          )
        );

        await interaction.showModal(modal);
        return true;
      }
    }
  }

  // Buttons für Supportzeiten
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
    if (interaction.customId === "setup_panel_text_modal") {
      if (!guildId) return false;

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: "❌ Du benötigst die Berechtigung **Server verwalten**, um das Setup zu nutzen.",
          ephemeral: true,
        });
        return true;
      }

      const cfg = readCfg(guildId);
      const title = interaction.fields.getTextInputValue("panel_title")?.trim() || "";
      const description = interaction.fields.getTextInputValue("panel_description")?.trim() || "";
      const footer = interaction.fields.getTextInputValue("panel_footer")?.trim() || "";
      const color = interaction.fields.getTextInputValue("panel_color")?.trim() || "";

      const nextEmbed = {
        title: title.substring(0, 100),
        description: description.substring(0, 1024),
        footer: footer.substring(0, 100),
        color: /^#?[0-9a-fA-F]{6}$/.test(color) ? (color.startsWith("#") ? color : `#${color}`) : "#5865F2",
      };

      cfg.panelEmbed = nextEmbed;
      cfg.panelTitle = undefined;
      cfg.panelDescription = undefined;
      cfg.panelFooter = undefined;
      cfg.panelColor = undefined;
      writeCfg(guildId, cfg);

      if (cfg.panelMessageId && cfg.panelChannelId) {
        try {
          const channel = await interaction.guild.channels.fetch(cfg.panelChannelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(cfg.panelMessageId).catch(() => null);
            if (msg) {
              await msg.edit({ embeds: [buildPanelEmbed(cfg)], components: [buildPanelSelect(cfg)] });
            }
          }
        } catch (err) {
          console.error("Panel update error:", err);
        }
      }

      await interaction.reply({
        content: "✅ Panel-Text aktualisiert.",
        embeds: [buildSetupEmbed(cfg)],
        components: buildSetupComponents(cfg),
        ephemeral: true,
      });
      return true;
    }

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
    .setDescription("Setup und Konfiguration für Tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("wizard")
        .setDescription("Interaktiver Setup-Assistent (Rollen, Kategorie, Panel, Logs)")
    )
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
          "❌ Du benötigst die Berechtigung **Server verwalten**, um das Setup zu nutzen.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guildId;
    const cfg = readCfg(guildId);

    if (sub === "wizard") {
      const embed = buildSetupEmbed(cfg);
      const components = buildSetupComponents(cfg);

      return interaction.reply({
        content: "Nutze die Menüs unten, um Rollen, Kategorien und Channels zu setzen. Drücke anschließend **Panel senden**.",
        embeds: [embed],
        components,
        ephemeral: true,
      });
    }

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
