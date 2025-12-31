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

// ============================================================
// CONSTANTS
// ============================================================

const CATEGORIES = [
  { value: "basis", label: "Basis-Setup", emoji: "🎯", description: "Team-Rollen, Kategorien & Channels" },
  { value: "topics", label: "Topics", emoji: "📋", description: "Ticket-Themen verwalten" },
  { value: "panel", label: "Panel-Embed", emoji: "🎨", description: "Panel-Nachricht anpassen" },
  { value: "ticket", label: "Ticket-Embed", emoji: "📝", description: "Ticket-Nachricht anpassen" },
  { value: "priority", label: "Prioritäten", emoji: "🔴", description: "Priority-Rollen konfigurieren" },
  { value: "formfields", label: "Formular-Felder", emoji: "📄", description: "Eingabefelder für Tickets" },
  { value: "autoclose", label: "Auto-Close", emoji: "⏰", description: "Automatisches Schließen" },
  { value: "supporttimes", label: "Support-Zeiten", emoji: "🕒", description: "Wochentags-Zeiten festlegen" },
];

const DAY_OPTIONS = [
  { option: "montag", key: "monday", label: "Montag", emoji: "📅" },
  { option: "dienstag", key: "tuesday", label: "Dienstag", emoji: "📅" },
  { option: "mittwoch", key: "wednesday", label: "Mittwoch", emoji: "📅" },
  { option: "donnerstag", key: "thursday", label: "Donnerstag", emoji: "📅" },
  { option: "freitag", key: "friday", label: "Freitag", emoji: "📅" },
  { option: "samstag", key: "saturday", label: "Samstag", emoji: "📅" },
  { option: "sonntag", key: "sunday", label: "Sonntag", emoji: "📅" },
];

const PRIORITY_LEVELS = [
  { key: "0", label: "Grün (Niedrig)", emoji: "🟢", color: 0x22c55e },
  { key: "1", label: "Orange (Mittel)", emoji: "🟠", color: 0xf97316 },
  { key: "2", label: "Rot (Hoch)", emoji: "🔴", color: 0xef4444 },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function sanitizeSnowflake(id) {
  if (!id) return null;
  const match = String(id).match(/(\d{17,20})/);
  return match ? match[1] : null;
}

function sanitizeTopicValue(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/gi, "-");
  const clean = normalized.replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  return clean || null;
}

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

  const match = normalized.match(/(\d{1,2}):(\d{2})\s*(?:-|bis|–|—|to)\s*(\d{1,2}):(\d{2})/);
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

// ============================================================
// CATEGORY MENU BUILDER
// ============================================================

function buildCategoryMenu(currentCategory = null) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("setup_category_select")
      .setPlaceholder("📂 Kategorie auswählen...")
      .addOptions(
        CATEGORIES.map((cat) => ({
          label: cat.label,
          value: cat.value,
          description: cat.description,
          emoji: cat.emoji,
          default: currentCategory === cat.value,
        }))
      )
  );
}

// ============================================================
// EMBED BUILDERS
// ============================================================

function buildMainEmbed(cfg) {
  const roleMentions = (Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : cfg.teamRoleId ? [cfg.teamRoleId] : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(", ") || "❌ Nicht konfiguriert";

  const categoryId = sanitizeSnowflake(cfg.categoryId);
  const panelChannelId = sanitizeSnowflake(cfg.panelChannelId);
  const topicsCount = Array.isArray(cfg.topics) ? cfg.topics.length : 0;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚙️ Setup & Konfiguration")
    .setDescription("Wähle unten eine Kategorie aus dem Dropdown-Menü, um die Einstellungen zu bearbeiten.")
    .addFields(
      { name: "👥 Team-Rollen", value: roleMentions, inline: true },
      { name: "📁 Ticket-Kategorie", value: categoryId ? `<#${categoryId}>` : "❌ Nicht konfiguriert", inline: true },
      { name: "📢 Panel-Channel", value: panelChannelId ? `<#${panelChannelId}>` : "❌ Nicht konfiguriert", inline: true },
      { name: "📋 Topics", value: topicsCount ? `${topicsCount} Thema(en)` : "❌ Keine Topics", inline: true },
      { name: "📄 Formular-Felder", value: `${(cfg.formFields || []).length} Feld(er)`, inline: true },
      { name: "⏰ Auto-Close", value: cfg.autoClose?.enabled ? `✅ ${cfg.autoClose.inactiveHours || 72}h` : "❌ Deaktiviert", inline: true }
    )
    .setFooter({ text: "Quantix Tickets • Setup" })
    .setTimestamp();
}

function buildBasisEmbed(cfg) {
  const roleMentions = (Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : cfg.teamRoleId ? [cfg.teamRoleId] : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(", ") || "Keine Rolle ausgewählt";

  const allowedRoles = (Array.isArray(cfg.allowedTicketRoles) ? cfg.allowedTicketRoles : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean)
    .map((id) => `<@&${id}>`)
    .join(", ") || "Alle dürfen Tickets erstellen";

  const categoryId = sanitizeSnowflake(cfg.categoryId);
  const panelChannelId = sanitizeSnowflake(cfg.panelChannelId);
  const transcriptId = sanitizeSnowflake(cfg.transcriptChannelId);
  const logChannelIds = (Array.isArray(cfg.logChannelId) ? cfg.logChannelId : cfg.logChannelId ? [cfg.logChannelId] : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean);

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎯 Basis-Setup")
    .setDescription("Konfiguriere die grundlegenden Einstellungen für das Ticket-System.")
    .addFields(
      { name: "👥 Team-Rollen", value: roleMentions, inline: false },
      { name: "🔒 Ticket-Erstellung erlaubt für", value: allowedRoles, inline: false },
      { name: "📁 Ticket-Kategorie", value: categoryId ? `<#${categoryId}>` : "Nicht konfiguriert", inline: true },
      { name: "📢 Panel-Channel", value: panelChannelId ? `<#${panelChannelId}>` : "Nicht konfiguriert", inline: true },
      { name: "📜 Transcript-Channel", value: transcriptId ? `<#${transcriptId}>` : "Nicht konfiguriert", inline: true },
      { name: "📋 Log-Channels", value: logChannelIds.length ? logChannelIds.map((id) => `<#${id}>`).join(", ") : "Nicht konfiguriert", inline: false }
    )
    .setFooter({ text: "Wähle unten die Rollen und Channels aus" });
}

function buildTopicsEmbed(cfg) {
  const topics = Array.isArray(cfg.topics) ? cfg.topics.filter((t) => t && t.label && t.value) : [];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Topics verwalten")
    .setDescription(topics.length ? "Wähle ein Topic zum Bearbeiten oder füge ein neues hinzu." : "Noch keine Topics vorhanden. Klicke auf **Topic hinzufügen** um zu starten.");

  if (topics.length > 0) {
    const topicList = topics.slice(0, 15).map((t, i) => `${t.emoji || "📌"} **${t.label}** (\`${t.value}\`)`).join("\n");
    embed.addFields({ name: `Topics (${topics.length})`, value: topicList, inline: false });
  }

  return embed.setFooter({ text: "Topics werden im Panel-Dropdown angezeigt" });
}

function buildPanelEmbedEmbed(cfg) {
  const panelEmbed = cfg.panelEmbed || {};
  const title = panelEmbed.title || cfg.panelTitle || "🎫 Ticket System";
  const description = panelEmbed.description || cfg.panelDescription || "Wähle ein Thema aus, um ein Ticket zu erstellen.";
  const color = panelEmbed.color || cfg.panelColor || "#5865F2";
  const footer = panelEmbed.footer || cfg.panelFooter || "Quantix Tickets";

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎨 Panel-Embed bearbeiten")
    .setDescription("Passe die Nachricht an, die im Panel-Channel angezeigt wird.")
    .addFields(
      { name: "📝 Titel", value: title || "Nicht gesetzt", inline: true },
      { name: "🎨 Farbe", value: color, inline: true },
      { name: "📋 Footer", value: footer || "Nicht gesetzt", inline: true },
      { name: "📄 Beschreibung", value: description.substring(0, 200) + (description.length > 200 ? "..." : ""), inline: false }
    )
    .setFooter({ text: "Klicke auf 'Bearbeiten' um die Texte anzupassen" });
}

function buildTicketEmbedEmbed(cfg) {
  const ticketEmbed = cfg.ticketEmbed || {};
  const title = ticketEmbed.title || "🎫 Ticket #{ticketNumber}";
  const description = ticketEmbed.description || "Willkommen {userMention}!";
  const color = ticketEmbed.color || "#0ea5e9";
  const footer = ticketEmbed.footer || "Quantix Tickets";

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📝 Ticket-Embed bearbeiten")
    .setDescription("Passe die erste Nachricht an, die in jedem neuen Ticket erscheint.\n\n**Platzhalter:**\n`{ticketNumber}` - Ticket-Nummer\n`{userMention}` - User-Erwähnung\n`{userId}` - User-ID\n`{topicLabel}` - Topic-Name")
    .addFields(
      { name: "📝 Titel", value: title || "Nicht gesetzt", inline: true },
      { name: "🎨 Farbe", value: color, inline: true },
      { name: "📋 Footer", value: footer || "Nicht gesetzt", inline: true },
      { name: "📄 Beschreibung", value: description.substring(0, 200) + (description.length > 200 ? "..." : ""), inline: false }
    )
    .setFooter({ text: "Klicke auf 'Bearbeiten' um die Texte anzupassen" });
}

function buildPriorityEmbed(cfg) {
  const priorityRoles = cfg.priorityRoles || {};

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔴 Prioritäts-Rollen")
    .setDescription("Konfiguriere welche Rollen bei welcher Priorität Zugriff auf Tickets haben.");

  for (const priority of PRIORITY_LEVELS) {
    const roles = (priorityRoles[priority.key] || [])
      .map((id) => sanitizeSnowflake(id))
      .filter(Boolean)
      .map((id) => `<@&${id}>`)
      .join(", ") || "Keine Rollen";
    embed.addFields({ name: `${priority.emoji} ${priority.label}`, value: roles, inline: false });
  }

  return embed.setFooter({ text: "Wähle unten eine Priorität um die Rollen zu setzen" });
}

function buildFormFieldsEmbed(cfg) {
  const fields = cfg.formFields || [];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📄 Formular-Felder")
    .setDescription(fields.length ? `${fields.length} Feld(er) konfiguriert. Diese werden beim Ticket-Erstellen abgefragt.` : "Keine Formular-Felder konfiguriert. Füge Felder hinzu, die beim Ticket-Erstellen abgefragt werden.");

  if (fields.length > 0) {
    const fieldList = fields.slice(0, 10).map((f, i) => {
      const style = f.style === "paragraph" ? "📝 Paragraph" : f.style === "number" ? "🔢 Nummer" : "📎 Kurz";
      const required = f.required ? "✅" : "❌";
      return `**${i + 1}.** ${f.label}\n└ ${style} | Pflicht: ${required}`;
    }).join("\n\n");
    embed.addFields({ name: "Felder", value: fieldList, inline: false });
  }

  return embed.setFooter({ text: "Max. 5 Felder pro Modal möglich" });
}

function buildAutoCloseEmbed(cfg) {
  const autoClose = cfg.autoClose || {};
  const enabled = autoClose.enabled || false;
  const hours = autoClose.inactiveHours || 72;
  const excludePriority = autoClose.excludePriority || [];

  const excludeText = excludePriority.length
    ? excludePriority.map((p) => PRIORITY_LEVELS.find((l) => l.key === String(p))?.emoji || p).join(" ")
    : "Keine";

  return new EmbedBuilder()
    .setColor(enabled ? 0x22c55e : 0xef4444)
    .setTitle("⏰ Auto-Close")
    .setDescription("Tickets werden automatisch geschlossen, wenn sie für eine bestimmte Zeit inaktiv sind.")
    .addFields(
      { name: "Status", value: enabled ? "✅ Aktiviert" : "❌ Deaktiviert", inline: true },
      { name: "Inaktivitätszeit", value: `${hours} Stunden`, inline: true },
      { name: "Ausgenommene Prioritäten", value: excludeText, inline: true }
    )
    .setFooter({ text: "24h vor Schließung wird eine Warnung gesendet" });
}

function buildSupportTimesEmbed(cfg) {
  const supportTimes = cfg.ticketSupportTimes || {};
  const enabled = supportTimes.enabled !== false;
  const schedule = buildSupportSchedule(supportTimes.schedule);
  const timezone = supportTimes.timezone || "Europe/Berlin";

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x22c55e : 0xf97316)
    .setTitle("🕒 Support-Zeiten")
    .setDescription(enabled ? "Nutzer werden außerhalb der Support-Zeiten gewarnt." : "Support-Zeiten sind deaktiviert.")
    .setFooter({ text: `Zeitzone: ${timezone}` });

  for (const day of DAY_OPTIONS) {
    const dayCfg = schedule[day.key];
    const value = dayCfg.enabled ? `${dayCfg.start} - ${dayCfg.end}` : "Geschlossen";
    embed.addFields({ name: `${day.emoji} ${day.label}`, value, inline: true });
  }

  return embed;
}

// ============================================================
// COMPONENT BUILDERS
// ============================================================

function buildBasisComponents(cfg) {
  const roleIds = (Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : cfg.teamRoleId ? [cfg.teamRoleId] : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean);

  const allowedRoleIds = (Array.isArray(cfg.allowedTicketRoles) ? cfg.allowedTicketRoles : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean);

  const logChannelIds = (Array.isArray(cfg.logChannelId) ? cfg.logChannelId : cfg.logChannelId ? [cfg.logChannelId] : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean);

  return [
    buildCategoryMenu("basis"),
    new ActionRowBuilder().addComponents(
      (() => {
        const builder = new RoleSelectMenuBuilder()
          .setCustomId("setup_team_roles")
          .setPlaceholder("👥 Team-Rollen auswählen")
          .setMinValues(0)
          .setMaxValues(5);
        if (roleIds.length) builder.setDefaultRoles(roleIds.slice(0, 5));
        return builder;
      })()
    ),
    new ActionRowBuilder().addComponents(
      (() => {
        const builder = new RoleSelectMenuBuilder()
          .setCustomId("setup_allowed_roles")
          .setPlaceholder("🔒 Wer darf Tickets erstellen? (leer = alle)")
          .setMinValues(0)
          .setMaxValues(5);
        if (allowedRoleIds.length) builder.setDefaultRoles(allowedRoleIds.slice(0, 5));
        return builder;
      })()
    ),
    new ActionRowBuilder().addComponents(
      (() => {
        const builder = new ChannelSelectMenuBuilder()
          .setCustomId("setup_category")
          .setPlaceholder("📁 Ticket-Kategorie")
          .setChannelTypes(ChannelType.GuildCategory)
          .setMinValues(0)
          .setMaxValues(1);
        const categoryId = sanitizeSnowflake(cfg.categoryId);
        if (categoryId) builder.setDefaultChannels([categoryId]);
        return builder;
      })()
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_basis_page2").setLabel("Weitere Channels ▶").setStyle(ButtonStyle.Primary).setEmoji("📢"),
      new ButtonBuilder().setCustomId("setup_send_panel").setLabel("Panel senden").setStyle(ButtonStyle.Success).setEmoji("📨"),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    ),
  ];
}

function buildBasisPage2Components(cfg) {
  const logChannelIds = (Array.isArray(cfg.logChannelId) ? cfg.logChannelId : cfg.logChannelId ? [cfg.logChannelId] : [])
    .map((id) => sanitizeSnowflake(id))
    .filter(Boolean);

  return [
    buildCategoryMenu("basis"),
    new ActionRowBuilder().addComponents(
      (() => {
        const builder = new ChannelSelectMenuBuilder()
          .setCustomId("setup_panel_channel")
          .setPlaceholder("📢 Panel-Channel")
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0)
          .setMaxValues(1);
        const panelId = sanitizeSnowflake(cfg.panelChannelId);
        if (panelId) builder.setDefaultChannels([panelId]);
        return builder;
      })()
    ),
    new ActionRowBuilder().addComponents(
      (() => {
        const builder = new ChannelSelectMenuBuilder()
          .setCustomId("setup_transcript_channel")
          .setPlaceholder("📜 Transcript-Channel")
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0)
          .setMaxValues(1);
        const transcriptId = sanitizeSnowflake(cfg.transcriptChannelId);
        if (transcriptId) builder.setDefaultChannels([transcriptId]);
        return builder;
      })()
    ),
    new ActionRowBuilder().addComponents(
      (() => {
        const builder = new ChannelSelectMenuBuilder()
          .setCustomId("setup_log_channel")
          .setPlaceholder("📋 Log-Channels")
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0)
          .setMaxValues(3);
        if (logChannelIds.length) builder.setDefaultChannels(logChannelIds.slice(0, 3));
        return builder;
      })()
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_basis_page1").setLabel("◀ Zurück zu Rollen").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Hauptmenü").setStyle(ButtonStyle.Secondary).setEmoji("🏠")
    ),
  ];
}

function buildTopicsComponents(cfg) {
  const topics = Array.isArray(cfg.topics) ? cfg.topics.filter((t) => t && t.value && t.label) : [];

  const rows = [buildCategoryMenu("topics")];

  if (topics.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("setup_topic_select")
          .setPlaceholder("📋 Topic zum Bearbeiten auswählen")
          .addOptions(
            topics.slice(0, 25).map((t) => ({
              label: t.label?.substring(0, 50) || t.value,
              value: t.value,
              description: t.description?.substring(0, 100) || undefined,
              emoji: t.emoji || "📌",
              default: cfg.__selectedTopic === t.value,
            }))
          )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_topic_add").setLabel("Topic hinzufügen").setStyle(ButtonStyle.Success).setEmoji("➕"),
      new ButtonBuilder().setCustomId("setup_topic_edit").setLabel("Bearbeiten").setStyle(ButtonStyle.Primary).setEmoji("✏️").setDisabled(!cfg.__selectedTopic),
      new ButtonBuilder().setCustomId("setup_topic_delete").setLabel("Löschen").setStyle(ButtonStyle.Danger).setEmoji("🗑️").setDisabled(!cfg.__selectedTopic),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    )
  );

  return rows;
}

function buildPanelEmbedComponents() {
  return [
    buildCategoryMenu("panel"),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_panel_edit").setLabel("Bearbeiten").setStyle(ButtonStyle.Primary).setEmoji("✏️"),
      new ButtonBuilder().setCustomId("setup_panel_preview").setLabel("Vorschau").setStyle(ButtonStyle.Secondary).setEmoji("👁️"),
      new ButtonBuilder().setCustomId("setup_send_panel").setLabel("Panel senden").setStyle(ButtonStyle.Success).setEmoji("📨"),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    ),
  ];
}

function buildTicketEmbedComponents() {
  return [
    buildCategoryMenu("ticket"),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_ticket_edit").setLabel("Bearbeiten").setStyle(ButtonStyle.Primary).setEmoji("✏️"),
      new ButtonBuilder().setCustomId("setup_ticket_preview").setLabel("Vorschau").setStyle(ButtonStyle.Secondary).setEmoji("👁️"),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    ),
  ];
}

function buildPriorityComponents(cfg) {
  return [
    buildCategoryMenu("priority"),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("setup_priority_select")
        .setPlaceholder("🔴 Priorität auswählen")
        .addOptions(
          PRIORITY_LEVELS.map((p) => ({
            label: p.label,
            value: p.key,
            emoji: p.emoji,
            default: cfg.__selectedPriority === p.key,
          }))
        )
    ),
    new ActionRowBuilder().addComponents(
      (() => {
        const selectedPriority = cfg.__selectedPriority || "0";
        const priorityRoles = cfg.priorityRoles || {};
        const currentRoles = (priorityRoles[selectedPriority] || [])
          .map((id) => sanitizeSnowflake(id))
          .filter(Boolean);

        const builder = new RoleSelectMenuBuilder()
          .setCustomId("setup_priority_roles")
          .setPlaceholder(`Rollen für ${PRIORITY_LEVELS.find((p) => p.key === selectedPriority)?.label || "Priorität"}`)
          .setMinValues(0)
          .setMaxValues(10);
        if (currentRoles.length) builder.setDefaultRoles(currentRoles.slice(0, 10));
        return builder;
      })()
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    ),
  ];
}

function buildFormFieldsComponents(cfg) {
  const fields = cfg.formFields || [];

  const rows = [buildCategoryMenu("formfields")];

  if (fields.length > 0) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("setup_field_select")
          .setPlaceholder("📄 Feld zum Bearbeiten auswählen")
          .addOptions(
            fields.slice(0, 25).map((f, i) => ({
              label: f.label?.substring(0, 50) || `Feld ${i + 1}`,
              value: String(i),
              description: f.style === "paragraph" ? "Paragraph" : f.style === "number" ? "Nummer" : "Kurz",
              emoji: f.required ? "✅" : "❌",
              default: cfg.__selectedField === String(i),
            }))
          )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_field_add").setLabel("Feld hinzufügen").setStyle(ButtonStyle.Success).setEmoji("➕").setDisabled(fields.length >= 5),
      new ButtonBuilder().setCustomId("setup_field_edit").setLabel("Bearbeiten").setStyle(ButtonStyle.Primary).setEmoji("✏️").setDisabled(cfg.__selectedField === undefined),
      new ButtonBuilder().setCustomId("setup_field_delete").setLabel("Löschen").setStyle(ButtonStyle.Danger).setEmoji("🗑️").setDisabled(cfg.__selectedField === undefined),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    )
  );

  return rows;
}

function buildAutoCloseComponents(cfg) {
  const autoClose = cfg.autoClose || {};
  const enabled = autoClose.enabled || false;

  return [
    buildCategoryMenu("autoclose"),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_autoclose_toggle").setLabel(enabled ? "Deaktivieren" : "Aktivieren").setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji(enabled ? "⏸️" : "▶️"),
      new ButtonBuilder().setCustomId("setup_autoclose_hours").setLabel("Zeit ändern").setStyle(ButtonStyle.Primary).setEmoji("⏱️"),
      new ButtonBuilder().setCustomId("setup_autoclose_exclude").setLabel("Prioritäten").setStyle(ButtonStyle.Secondary).setEmoji("🔴"),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    ),
  ];
}

function buildSupportTimesComponents(cfg) {
  const supportTimes = cfg.ticketSupportTimes || {};
  const enabled = supportTimes.enabled !== false;

  return [
    buildCategoryMenu("supporttimes"),
    new ActionRowBuilder().addComponents(
      ...DAY_OPTIONS.slice(0, 5).map((day) =>
        new ButtonBuilder()
          .setCustomId(`setup_time_edit:${day.key}`)
          .setLabel(day.label.substring(0, 2))
          .setEmoji("🕒")
          .setStyle(ButtonStyle.Primary)
      )
    ),
    new ActionRowBuilder().addComponents(
      ...DAY_OPTIONS.slice(5).map((day) =>
        new ButtonBuilder()
          .setCustomId(`setup_time_edit:${day.key}`)
          .setLabel(day.label.substring(0, 2))
          .setEmoji("🕒")
          .setStyle(ButtonStyle.Primary)
      ),
      new ButtonBuilder()
        .setCustomId("setup_time_toggle")
        .setLabel(enabled ? "Deaktivieren" : "Aktivieren")
        .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success)
        .setEmoji(enabled ? "⏸️" : "▶️"),
      new ButtonBuilder().setCustomId("setup_back").setLabel("Zurück").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
    ),
  ];
}

function buildMainComponents() {
  return [
    buildCategoryMenu(null),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_send_panel").setLabel("Panel senden").setStyle(ButtonStyle.Success).setEmoji("📨"),
      new ButtonBuilder().setCustomId("setup_refresh").setLabel("Aktualisieren").setStyle(ButtonStyle.Secondary).setEmoji("🔄")
    ),
  ];
}

// ============================================================
// PANEL BUILDER (for sending)
// ============================================================

function buildPanelEmbed(cfg) {
  const panelEmbed = cfg.panelEmbed || {};
  const title = panelEmbed.title || cfg.panelTitle || "🎫 Ticket System";
  const description = panelEmbed.description || cfg.panelDescription || "Wähle unten ein Thema aus, um ein Ticket zu erstellen.";
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

// ============================================================
// INTERACTION HANDLER
// ============================================================

async function handleComponent(interaction) {
  const guildId = interaction.guildId;
  if (!guildId) return false;

  const customId = interaction.customId || "";

  // Check if this is a setup interaction
  if (!customId.startsWith("setup_")) return false;

  // Permission check
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "❌ Du benötigst die Berechtigung **Server verwalten**.",
      ephemeral: true,
    });
    return true;
  }

  const cfg = readCfg(guildId);

  // ============================================================
  // CATEGORY SELECT
  // ============================================================
  if (interaction.isStringSelectMenu() && customId === "setup_category_select") {
    const category = interaction.values[0];
    cfg.__currentCategory = category;
    cfg.__selectedTopic = null;
    cfg.__selectedField = null;
    cfg.__selectedPriority = "0";
    writeCfg(guildId, cfg);

    let embed, components;
    switch (category) {
      case "basis":
        embed = buildBasisEmbed(cfg);
        components = buildBasisComponents(cfg);
        break;
      case "topics":
        embed = buildTopicsEmbed(cfg);
        components = buildTopicsComponents(cfg);
        break;
      case "panel":
        embed = buildPanelEmbedEmbed(cfg);
        components = buildPanelEmbedComponents();
        break;
      case "ticket":
        embed = buildTicketEmbedEmbed(cfg);
        components = buildTicketEmbedComponents();
        break;
      case "priority":
        embed = buildPriorityEmbed(cfg);
        components = buildPriorityComponents(cfg);
        break;
      case "formfields":
        embed = buildFormFieldsEmbed(cfg);
        components = buildFormFieldsComponents(cfg);
        break;
      case "autoclose":
        embed = buildAutoCloseEmbed(cfg);
        components = buildAutoCloseComponents(cfg);
        break;
      case "supporttimes":
        embed = buildSupportTimesEmbed(cfg);
        components = buildSupportTimesComponents(cfg);
        break;
      default:
        embed = buildMainEmbed(cfg);
        components = buildMainComponents();
    }

    await interaction.update({ embeds: [embed], components });
    return true;
  }

  // ============================================================
  // BACK BUTTON
  // ============================================================
  if (interaction.isButton() && customId === "setup_back") {
    cfg.__currentCategory = null;
    cfg.__selectedTopic = null;
    cfg.__selectedField = null;
    writeCfg(guildId, cfg);

    await interaction.update({
      embeds: [buildMainEmbed(cfg)],
      components: buildMainComponents(),
    });
    return true;
  }

  // ============================================================
  // REFRESH BUTTON
  // ============================================================
  if (interaction.isButton() && customId === "setup_refresh") {
    await interaction.update({
      embeds: [buildMainEmbed(cfg)],
      components: buildMainComponents(),
    });
    return true;
  }

  // ============================================================
  // BASIS: Role & Channel Selects
  // ============================================================
  if (interaction.isRoleSelectMenu()) {
    if (customId === "setup_team_roles") {
      cfg.teamRoleId = interaction.values || [];
      writeCfg(guildId, cfg);
      await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisComponents(cfg) });
      return true;
    }
    if (customId === "setup_allowed_roles") {
      cfg.allowedTicketRoles = interaction.values || [];
      writeCfg(guildId, cfg);
      await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisComponents(cfg) });
      return true;
    }
    if (customId === "setup_priority_roles") {
      const selectedPriority = cfg.__selectedPriority || "0";
      if (!cfg.priorityRoles) cfg.priorityRoles = {};
      cfg.priorityRoles[selectedPriority] = interaction.values || [];
      writeCfg(guildId, cfg);
      await interaction.update({ embeds: [buildPriorityEmbed(cfg)], components: buildPriorityComponents(cfg) });
      return true;
    }
  }

  if (interaction.isChannelSelectMenu()) {
    if (customId === "setup_category") {
      cfg.categoryId = interaction.values?.[0] || "";
      writeCfg(guildId, cfg);
      await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisComponents(cfg) });
      return true;
    }
    if (customId === "setup_panel_channel") {
      cfg.panelChannelId = interaction.values?.[0] || "";
      if (!cfg.panelChannelId) cfg.panelMessageId = "";
      writeCfg(guildId, cfg);
      await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisPage2Components(cfg) });
      return true;
    }
    if (customId === "setup_transcript_channel") {
      cfg.transcriptChannelId = interaction.values?.[0] || "";
      writeCfg(guildId, cfg);
      await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisPage2Components(cfg) });
      return true;
    }
    if (customId === "setup_log_channel") {
      cfg.logChannelId = interaction.values || [];
      writeCfg(guildId, cfg);
      await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisPage2Components(cfg) });
      return true;
    }
  }

  // ============================================================
  // BASIS: Page Navigation
  // ============================================================
  if (interaction.isButton() && customId === "setup_basis_page2") {
    await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisPage2Components(cfg) });
    return true;
  }
  if (interaction.isButton() && customId === "setup_basis_page1") {
    await interaction.update({ embeds: [buildBasisEmbed(cfg)], components: buildBasisComponents(cfg) });
    return true;
  }

  // ============================================================
  // SEND PANEL
  // ============================================================
  if (interaction.isButton() && customId === "setup_send_panel") {
    await interaction.deferUpdate();

    const topics = (cfg.topics || []).filter((t) => t && t.label && t.value);
    const errors = [];

    if (!cfg.panelChannelId) errors.push("Kein Panel-Channel ausgewählt");
    if (!cfg.categoryId) errors.push("Keine Ticket-Kategorie ausgewählt");
    if (topics.length === 0) errors.push("Keine Topics konfiguriert");

    if (errors.length) {
      await interaction.followUp({ content: `❌ **Fehler:**\n- ${errors.join("\n- ")}`, ephemeral: true });
      return true;
    }

    try {
      const channel = await interaction.guild.channels.fetch(cfg.panelChannelId).catch(() => null);
      if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        await interaction.followUp({ content: "❌ Panel-Channel nicht gefunden oder ungültig.", ephemeral: true });
        return true;
      }

      const embed = buildPanelEmbed(cfg);
      const row = buildPanelSelect(cfg);
      const msg = await channel.send({ embeds: [embed], components: [row] });

      cfg.panelMessageId = msg.id;
      cfg.panelChannelId = channel.id;
      writeCfg(guildId, cfg);

      await interaction.followUp({ content: `✅ Panel gesendet in ${channel.toString()}!`, ephemeral: true });
    } catch (err) {
      console.error("Setup Panel Send Error:", err);
      await interaction.followUp({ content: "❌ Fehler beim Senden. Prüfe die Bot-Berechtigungen.", ephemeral: true });
    }
    return true;
  }

  // ============================================================
  // TOPICS
  // ============================================================
  if (interaction.isStringSelectMenu() && customId === "setup_topic_select") {
    cfg.__selectedTopic = interaction.values[0];
    writeCfg(guildId, cfg);
    await interaction.update({ embeds: [buildTopicsEmbed(cfg)], components: buildTopicsComponents(cfg) });
    return true;
  }

  if (interaction.isButton() && customId === "setup_topic_add") {
    const modal = new ModalBuilder().setCustomId("setup_topic_add_modal").setTitle("Topic hinzufügen");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("topic_label").setLabel("Name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder("z.B. Support")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("topic_value").setLabel("ID (unique, ohne Leerzeichen)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setPlaceholder("z.B. support")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("topic_emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder("z.B. 🎫")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("topic_description").setLabel("Beschreibung (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200).setPlaceholder("Kurze Beschreibung des Topics")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId === "setup_topic_edit") {
    const topics = Array.isArray(cfg.topics) ? cfg.topics : [];
    const selected = topics.find((t) => t.value === cfg.__selectedTopic);
    if (!selected) {
      await interaction.reply({ content: "❌ Bitte erst ein Topic auswählen.", ephemeral: true });
      return true;
    }

    const modal = new ModalBuilder().setCustomId("setup_topic_edit_modal").setTitle("Topic bearbeiten");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("topic_label").setLabel("Name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(selected.label || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("topic_emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(selected.emoji || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("topic_description").setLabel("Beschreibung (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200).setValue(selected.description || "")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId === "setup_topic_delete") {
    const topics = Array.isArray(cfg.topics) ? cfg.topics : [];
    const filtered = topics.filter((t) => t.value !== cfg.__selectedTopic);
    if (filtered.length === topics.length) {
      await interaction.reply({ content: "❌ Kein Topic ausgewählt.", ephemeral: true });
      return true;
    }
    cfg.topics = filtered;
    cfg.__selectedTopic = filtered[0]?.value || null;
    writeCfg(guildId, cfg);
    await interaction.update({ embeds: [buildTopicsEmbed(cfg)], components: buildTopicsComponents(cfg) });
    return true;
  }

  // ============================================================
  // PANEL EMBED
  // ============================================================
  if (interaction.isButton() && customId === "setup_panel_edit") {
    const panelEmbed = cfg.panelEmbed || {};
    const modal = new ModalBuilder().setCustomId("setup_panel_text_modal").setTitle("Panel-Embed bearbeiten");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("panel_title").setLabel("Titel").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(panelEmbed.title || cfg.panelTitle || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("panel_description").setLabel("Beschreibung").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1024).setValue(panelEmbed.description || cfg.panelDescription || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("panel_footer").setLabel("Footer").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(panelEmbed.footer || cfg.panelFooter || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("panel_color").setLabel("Farbe (Hex, z.B. #5865F2)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue(panelEmbed.color || cfg.panelColor || "#5865F2")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId === "setup_panel_preview") {
    await interaction.reply({ embeds: [buildPanelEmbed(cfg)], components: [buildPanelSelect(cfg)], ephemeral: true });
    return true;
  }

  // ============================================================
  // TICKET EMBED
  // ============================================================
  if (interaction.isButton() && customId === "setup_ticket_edit") {
    const ticketEmbed = cfg.ticketEmbed || {};
    const modal = new ModalBuilder().setCustomId("setup_ticket_text_modal").setTitle("Ticket-Embed bearbeiten");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("ticket_title").setLabel("Titel").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(ticketEmbed.title || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("ticket_description").setLabel("Beschreibung").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1024).setValue(ticketEmbed.description || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("ticket_footer").setLabel("Footer").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(ticketEmbed.footer || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("ticket_color").setLabel("Farbe (Hex, z.B. #0ea5e9)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setValue(ticketEmbed.color || "#0ea5e9")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId === "setup_ticket_preview") {
    const ticketEmbed = cfg.ticketEmbed || {};
    const title = (ticketEmbed.title || "🎫 Ticket #{ticketNumber}").replace("{ticketNumber}", "00001");
    const description = (ticketEmbed.description || "Willkommen {userMention}!\n\n**Topic:** {topicLabel}")
      .replace("{userMention}", interaction.user.toString())
      .replace("{userId}", interaction.user.id)
      .replace("{topicLabel}", "Support")
      .replace("{ticketNumber}", "00001");
    const color = ticketEmbed.color || "#0ea5e9";
    const footer = ticketEmbed.footer || "Quantix Tickets";

    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setFooter({ text: footer });
    if (/^#?[0-9a-fA-F]{6}$/.test(color)) {
      embed.setColor(parseInt(color.replace("#", ""), 16));
    }
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return true;
  }

  // ============================================================
  // PRIORITY
  // ============================================================
  if (interaction.isStringSelectMenu() && customId === "setup_priority_select") {
    cfg.__selectedPriority = interaction.values[0];
    writeCfg(guildId, cfg);
    await interaction.update({ embeds: [buildPriorityEmbed(cfg)], components: buildPriorityComponents(cfg) });
    return true;
  }

  // ============================================================
  // FORM FIELDS
  // ============================================================
  if (interaction.isStringSelectMenu() && customId === "setup_field_select") {
    cfg.__selectedField = interaction.values[0];
    writeCfg(guildId, cfg);
    await interaction.update({ embeds: [buildFormFieldsEmbed(cfg)], components: buildFormFieldsComponents(cfg) });
    return true;
  }

  if (interaction.isButton() && customId === "setup_field_add") {
    const modal = new ModalBuilder().setCustomId("setup_field_add_modal").setTitle("Formular-Feld hinzufügen");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("field_label").setLabel("Frage / Label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45).setPlaceholder("z.B. Wie lautet dein IGN?")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("field_id").setLabel("ID (unique, ohne Leerzeichen)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30).setPlaceholder("z.B. ign")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("field_style").setLabel("Typ: short / paragraph / number").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue("short")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("field_required").setLabel("Pflichtfeld? (ja / nein)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setValue("ja")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId === "setup_field_edit") {
    const fields = cfg.formFields || [];
    const index = parseInt(cfg.__selectedField, 10);
    const field = fields[index];
    if (!field) {
      await interaction.reply({ content: "❌ Bitte erst ein Feld auswählen.", ephemeral: true });
      return true;
    }

    const modal = new ModalBuilder().setCustomId("setup_field_edit_modal").setTitle("Formular-Feld bearbeiten");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("field_label").setLabel("Frage / Label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(45).setValue(field.label || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("field_style").setLabel("Typ: short / paragraph / number").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(field.style || "short")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("field_required").setLabel("Pflichtfeld? (ja / nein)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setValue(field.required ? "ja" : "nein")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId === "setup_field_delete") {
    const fields = cfg.formFields || [];
    const index = parseInt(cfg.__selectedField, 10);
    if (isNaN(index) || index < 0 || index >= fields.length) {
      await interaction.reply({ content: "❌ Kein Feld ausgewählt.", ephemeral: true });
      return true;
    }
    fields.splice(index, 1);
    cfg.formFields = fields;
    cfg.__selectedField = undefined;
    writeCfg(guildId, cfg);
    await interaction.update({ embeds: [buildFormFieldsEmbed(cfg)], components: buildFormFieldsComponents(cfg) });
    return true;
  }

  // ============================================================
  // AUTO-CLOSE
  // ============================================================
  if (interaction.isButton() && customId === "setup_autoclose_toggle") {
    if (!cfg.autoClose) cfg.autoClose = {};
    cfg.autoClose.enabled = !cfg.autoClose.enabled;
    writeCfg(guildId, cfg);
    await interaction.update({ embeds: [buildAutoCloseEmbed(cfg)], components: buildAutoCloseComponents(cfg) });
    return true;
  }

  if (interaction.isButton() && customId === "setup_autoclose_hours") {
    const modal = new ModalBuilder().setCustomId("setup_autoclose_hours_modal").setTitle("Auto-Close Zeit");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("hours").setLabel("Inaktivitätszeit (Stunden, 25-720)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(cfg.autoClose?.inactiveHours || 72))
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && customId === "setup_autoclose_exclude") {
    const modal = new ModalBuilder().setCustomId("setup_autoclose_exclude_modal").setTitle("Prioritäten ausschließen");
    const current = (cfg.autoClose?.excludePriority || []).join(", ");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("priorities").setLabel("Prioritäten (0=Grün, 1=Orange, 2=Rot)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(current).setPlaceholder("z.B. 1, 2")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  // ============================================================
  // SUPPORT TIMES
  // ============================================================
  if (interaction.isButton() && customId === "setup_time_toggle") {
    if (!cfg.ticketSupportTimes) {
      cfg.ticketSupportTimes = { enabled: true, timezone: "Europe/Berlin", schedule: getDefaultSupportSchedule() };
    }
    cfg.ticketSupportTimes.enabled = !cfg.ticketSupportTimes.enabled;
    writeCfg(guildId, cfg);
    await interaction.update({ embeds: [buildSupportTimesEmbed(cfg)], components: buildSupportTimesComponents(cfg) });
    return true;
  }

  if (interaction.isButton() && customId.startsWith("setup_time_edit:")) {
    const dayKey = customId.split(":")[1];
    const schedule = buildSupportSchedule(cfg.ticketSupportTimes?.schedule);
    const currentDay = schedule[dayKey];

    const modal = new ModalBuilder().setCustomId(`setup_time_modal:${dayKey}`).setTitle(`${getDayLabel(dayKey)}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("time_range").setLabel("Zeitfenster").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("z.B. 18:00-20:00, 24/7, geschlossen").setValue(currentDay?.enabled ? `${currentDay.start}-${currentDay.end}` : "geschlossen")
      )
    );
    await interaction.showModal(modal);
    return true;
  }

  // ============================================================
  // MODAL SUBMITS
  // ============================================================
  if (interaction.isModalSubmit()) {
    const modalId = customId;

    // Topic Add
    if (modalId === "setup_topic_add_modal") {
      const topics = Array.isArray(cfg.topics) ? cfg.topics : [];
      const rawLabel = interaction.fields.getTextInputValue("topic_label")?.trim();
      const rawValue = interaction.fields.getTextInputValue("topic_value")?.trim();
      const rawEmoji = interaction.fields.getTextInputValue("topic_emoji")?.trim();
      const rawDescription = interaction.fields.getTextInputValue("topic_description")?.trim();

      const topicValue = sanitizeTopicValue(rawValue);
      if (!topicValue) {
        await interaction.reply({ content: "❌ Ungültige Topic-ID.", ephemeral: true });
        return true;
      }

      if (topics.some((t) => t.value === topicValue)) {
        await interaction.reply({ content: "❌ Topic-ID existiert bereits.", ephemeral: true });
        return true;
      }

      topics.push({
        label: rawLabel?.substring(0, 80) || topicValue,
        value: topicValue,
        emoji: rawEmoji?.substring(0, 10) || null,
        description: rawDescription?.substring(0, 200) || null,
      });

      cfg.topics = topics;
      cfg.__selectedTopic = topicValue;
      writeCfg(guildId, cfg);

      await interaction.reply({ content: "✅ Topic hinzugefügt!", embeds: [buildTopicsEmbed(cfg)], components: buildTopicsComponents(cfg), ephemeral: true });
      return true;
    }

    // Topic Edit
    if (modalId === "setup_topic_edit_modal") {
      const topics = Array.isArray(cfg.topics) ? cfg.topics : [];
      const topicValue = cfg.__selectedTopic;
      const rawLabel = interaction.fields.getTextInputValue("topic_label")?.trim();
      const rawEmoji = interaction.fields.getTextInputValue("topic_emoji")?.trim();
      const rawDescription = interaction.fields.getTextInputValue("topic_description")?.trim();

      cfg.topics = topics.map((t) =>
        t.value === topicValue
          ? { ...t, label: rawLabel?.substring(0, 80) || t.label, emoji: rawEmoji?.substring(0, 10) || null, description: rawDescription?.substring(0, 200) || null }
          : t
      );
      writeCfg(guildId, cfg);

      await interaction.reply({ content: "✅ Topic aktualisiert!", embeds: [buildTopicsEmbed(cfg)], components: buildTopicsComponents(cfg), ephemeral: true });
      return true;
    }

    // Panel Text
    if (modalId === "setup_panel_text_modal") {
      const title = interaction.fields.getTextInputValue("panel_title")?.trim() || "";
      const description = interaction.fields.getTextInputValue("panel_description")?.trim() || "";
      const footer = interaction.fields.getTextInputValue("panel_footer")?.trim() || "";
      const color = interaction.fields.getTextInputValue("panel_color")?.trim() || "";

      cfg.panelEmbed = {
        title: title.substring(0, 100),
        description: description.substring(0, 1024),
        footer: footer.substring(0, 100),
        color: /^#?[0-9a-fA-F]{6}$/.test(color) ? (color.startsWith("#") ? color : `#${color}`) : "#5865F2",
      };
      cfg.panelTitle = undefined;
      cfg.panelDescription = undefined;
      cfg.panelFooter = undefined;
      cfg.panelColor = undefined;
      writeCfg(guildId, cfg);

      // Update existing panel if exists
      if (cfg.panelMessageId && cfg.panelChannelId) {
        try {
          const channel = await interaction.guild.channels.fetch(cfg.panelChannelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(cfg.panelMessageId).catch(() => null);
            if (msg) await msg.edit({ embeds: [buildPanelEmbed(cfg)], components: [buildPanelSelect(cfg)] });
          }
        } catch (err) {
          console.error("Panel update error:", err);
        }
      }

      await interaction.reply({ content: "✅ Panel-Embed gespeichert!", embeds: [buildPanelEmbedEmbed(cfg)], components: buildPanelEmbedComponents(), ephemeral: true });
      return true;
    }

    // Ticket Text
    if (modalId === "setup_ticket_text_modal") {
      const title = interaction.fields.getTextInputValue("ticket_title")?.trim() || "";
      const description = interaction.fields.getTextInputValue("ticket_description")?.trim() || "";
      const footer = interaction.fields.getTextInputValue("ticket_footer")?.trim() || "";
      const color = interaction.fields.getTextInputValue("ticket_color")?.trim() || "";

      cfg.ticketEmbed = {
        title: title.substring(0, 100) || undefined,
        description: description.substring(0, 1024) || undefined,
        footer: footer.substring(0, 100) || undefined,
        color: /^#?[0-9a-fA-F]{6}$/.test(color) ? (color.startsWith("#") ? color : `#${color}`) : "#0ea5e9",
      };
      writeCfg(guildId, cfg);

      await interaction.reply({ content: "✅ Ticket-Embed gespeichert!", embeds: [buildTicketEmbedEmbed(cfg)], components: buildTicketEmbedComponents(), ephemeral: true });
      return true;
    }

    // Field Add
    if (modalId === "setup_field_add_modal") {
      const fields = cfg.formFields || [];
      if (fields.length >= 5) {
        await interaction.reply({ content: "❌ Maximal 5 Felder möglich.", ephemeral: true });
        return true;
      }

      const label = interaction.fields.getTextInputValue("field_label")?.trim();
      const id = interaction.fields.getTextInputValue("field_id")?.trim().toLowerCase().replace(/\s+/g, "_");
      const style = interaction.fields.getTextInputValue("field_style")?.trim().toLowerCase();
      const required = ["ja", "yes", "true", "1"].includes(interaction.fields.getTextInputValue("field_required")?.trim().toLowerCase());

      if (!label || !id) {
        await interaction.reply({ content: "❌ Label und ID sind erforderlich.", ephemeral: true });
        return true;
      }

      if (!["short", "paragraph", "number"].includes(style)) {
        await interaction.reply({ content: "❌ Ungültiger Typ. Nutze: short, paragraph oder number.", ephemeral: true });
        return true;
      }

      fields.push({ label, id, style, required });
      cfg.formFields = fields;
      cfg.__selectedField = String(fields.length - 1);
      writeCfg(guildId, cfg);

      await interaction.reply({ content: "✅ Feld hinzugefügt!", embeds: [buildFormFieldsEmbed(cfg)], components: buildFormFieldsComponents(cfg), ephemeral: true });
      return true;
    }

    // Field Edit
    if (modalId === "setup_field_edit_modal") {
      const fields = cfg.formFields || [];
      const index = parseInt(cfg.__selectedField, 10);
      if (isNaN(index) || !fields[index]) {
        await interaction.reply({ content: "❌ Feld nicht gefunden.", ephemeral: true });
        return true;
      }

      const label = interaction.fields.getTextInputValue("field_label")?.trim();
      const style = interaction.fields.getTextInputValue("field_style")?.trim().toLowerCase();
      const required = ["ja", "yes", "true", "1"].includes(interaction.fields.getTextInputValue("field_required")?.trim().toLowerCase());

      if (!["short", "paragraph", "number"].includes(style)) {
        await interaction.reply({ content: "❌ Ungültiger Typ. Nutze: short, paragraph oder number.", ephemeral: true });
        return true;
      }

      fields[index] = { ...fields[index], label, style, required };
      cfg.formFields = fields;
      writeCfg(guildId, cfg);

      await interaction.reply({ content: "✅ Feld aktualisiert!", embeds: [buildFormFieldsEmbed(cfg)], components: buildFormFieldsComponents(cfg), ephemeral: true });
      return true;
    }

    // Auto-Close Hours
    if (modalId === "setup_autoclose_hours_modal") {
      const hours = parseInt(interaction.fields.getTextInputValue("hours")?.trim(), 10);
      if (isNaN(hours) || hours < 25 || hours > 720) {
        await interaction.reply({ content: "❌ Ungültige Stunden. Erlaubt: 25-720.", ephemeral: true });
        return true;
      }

      if (!cfg.autoClose) cfg.autoClose = {};
      cfg.autoClose.inactiveHours = hours;
      writeCfg(guildId, cfg);

      await interaction.reply({ content: `✅ Auto-Close auf ${hours} Stunden gesetzt!`, embeds: [buildAutoCloseEmbed(cfg)], components: buildAutoCloseComponents(cfg), ephemeral: true });
      return true;
    }

    // Auto-Close Exclude
    if (modalId === "setup_autoclose_exclude_modal") {
      const input = interaction.fields.getTextInputValue("priorities")?.trim() || "";
      const priorities = input.split(/[,\s]+/).map((p) => parseInt(p, 10)).filter((p) => [0, 1, 2].includes(p));

      if (!cfg.autoClose) cfg.autoClose = {};
      cfg.autoClose.excludePriority = priorities;
      writeCfg(guildId, cfg);

      await interaction.reply({ content: "✅ Ausgenommene Prioritäten gespeichert!", embeds: [buildAutoCloseEmbed(cfg)], components: buildAutoCloseComponents(cfg), ephemeral: true });
      return true;
    }

    // Support Time Modal
    if (modalId.startsWith("setup_time_modal:")) {
      const dayKey = modalId.split(":")[1];
      const raw = interaction.fields.getTextInputValue("time_range")?.trim();

      if (!cfg.ticketSupportTimes) {
        cfg.ticketSupportTimes = { enabled: true, timezone: "Europe/Berlin", schedule: getDefaultSupportSchedule() };
      }

      if (!raw) {
        await interaction.reply({ content: "ℹ️ Keine Änderung (leeres Feld).", ephemeral: true });
        return true;
      }

      const parsed = parseTimeRange(raw);
      if (!parsed) {
        await interaction.reply({ content: "❌ Ungültiges Format. Nutze z.B. `18:00-20:00`, `24/7` oder `geschlossen`.", ephemeral: true });
        return true;
      }

      const schedule = buildSupportSchedule(cfg.ticketSupportTimes.schedule);
      schedule[dayKey] = parsed;
      cfg.ticketSupportTimes.schedule = schedule;
      writeCfg(guildId, cfg);

      await interaction.reply({
        content: `✅ **${getDayLabel(dayKey)}** gespeichert: ${parsed.enabled ? `${parsed.start} - ${parsed.end}` : "Geschlossen"}`,
        embeds: [buildSupportTimesEmbed(cfg)],
        components: buildSupportTimesComponents(cfg),
        ephemeral: true,
      });
      return true;
    }
  }

  return false;
}

// ============================================================
// COMMAND EXPORT
// ============================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Konfiguriere das Ticket-System über ein interaktives Menü")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ Du benötigst die Berechtigung **Server verwalten**.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guildId;
    const cfg = readCfg(guildId);

    // Reset temporary state
    cfg.__currentCategory = null;
    cfg.__selectedTopic = null;
    cfg.__selectedField = null;
    cfg.__selectedPriority = "0";
    writeCfg(guildId, cfg);

    const embed = buildMainEmbed(cfg);
    const components = buildMainComponents();

    return interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
    });
  },

  handleComponent,
};
