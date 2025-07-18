/**
 * Ticket-Bot  |  Discord.js v14 + Express-Panel
 * ------------------------------------------------------------
 * Voraussetzungen:
 *   - panel.js   (siehe frühere Schritte)
 *   - config.json
 *   - .env       (DISCORD_TOKEN, CLIENT_ID, CLIENT_SECRET, ...)
 *
 * Dieses Skript
 *   • startet das Express-Panel
 *   • registriert /dashboard (nur im Ziel-Guild)
 *   • postet einmalig das Ticket-Panel in Kanal 1357443439079329874
 *   • erstellt Tickets via Dropdown
 */

require('dotenv').config();

const {
  Client, GatewayIntentBits, Events,
  ChannelType, PermissionsBitField,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, EmbedBuilder,
  REST, Routes
} = require('discord.js');

const fs   = require('fs');
const path = require('path');
const app  = require('./panel');

const CFG_PATH = path.join(__dirname, 'config.json');
let   cfg      = require(CFG_PATH);

/* ───────── Discord-Client ───────── */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ───────── Live-Reload bei Änderungen im Panel ───────── */
fs.watchFile(CFG_PATH, () => {
  delete require.cache[require.resolve(CFG_PATH)];
  cfg = require(CFG_PATH);
  console.log('[config] neu geladen');
});

/* ───────── Slash-Command „/dashboard“ registrieren ───────── */
client.once(Events.ClientReady, async () => {
  console.log(`Bot online: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('dashboard')
      .setDescription('Link zum Ticket-Dashboard')
      .setDMPermission(false)                                   // nur im Server
      .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // nur Leute mit „Server verwalten“
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, cfg.guildId),
    { body: commands.map(c => c.toJSON()) }
  );
  console.log('[slash] /dashboard registriert');

  /* Panel-Nachricht einmalig senden – bei Erst-Setup ausführen,
     danach ZEILE KOMMENTIEREN, damit nicht jedes Mal neu gepostet wird. */
//  await sendPanelMessage('1357443439079329874');
});

/* ───────── Interaction-Handler ───────── */
client.on(Events.InteractionCreate, async interaction => {
  try {
    /* ---- 1) Slash-Commands ---- */
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'dashboard') {
        const url = process.env.PANEL_URL || `http://${interaction.guild?.preferredLocale ?? 'localhost'}:3000/panel`;

        // Button mit Link
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Dashboard öffnen')
            .setURL(url)
            .setStyle(ButtonStyle.Link)
        );

        return interaction.reply({ content: '🖥️ Hier ist dein Link:', components: [row], ephemeral: true });
      }
    }

    /* ---- 2) Dropdown aus Ticket-Panel ---- */
    if (interaction.isStringSelectMenu() && interaction.customId === 'topic') {
      const topic = cfg.topics.find(t => t.value === interaction.values[0]);
      if (!topic)
        return interaction.reply({ content: 'Unbekanntes Thema.', ephemeral: true });

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId,
        permissionOverwrites: [
          { id: interaction.guild.id, deny:  PermissionsBitField.Flags.ViewChannel },
          { id: interaction.user.id,  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: cfg.supportRoleId,    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      await ticketChannel.send({
        embeds: [ new EmbedBuilder()
          .setTitle(`${topic.emoji || ''} ${topic.label}`)
          .setDescription(`Hallo ${interaction.user}, unser Team meldet sich gleich …`)
        ]
      });

      return interaction.reply({ content: `✅ Ticket erstellt: ${ticketChannel}`, ephemeral: true });
    }
  } catch (err) {
    console.error('[interaction]', err);
    if (!interaction.replied) interaction.reply({ content: 'Ein Fehler ist aufgetreten.', ephemeral: true });
  }
});

/* ───────── Ticket-Panel posten ───────── */
async function sendPanelMessage (channelId) {
  const guild   = await client.guilds.fetch(cfg.guildId);
  const channel = await guild.channels.fetch(channelId);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('topic')
    .setPlaceholder('Wähle dein Thema …')
    .addOptions(cfg.topics);

  await channel.send({
    embeds: [ new EmbedBuilder()
      .setTitle('🎫 Ticket-System')
      .setDescription('Bitte Thema auswählen, um ein Ticket zu eröffnen.') ],
    components: [ new ActionRowBuilder().addComponents(menu) ]
  });

  console.log(`[panel] in #${channel.name} gepostet`);
}

/* ───────── Express-Panel starten ───────── */
app.listen(process.env.PORT || 3000,
  () => console.log(`Panel listening on :${process.env.PORT || 3000}`));

/* ───────── Login ───────── */
client.login(process.env.DISCORD_TOKEN);

client.once('ready', () => {
  client.guilds.cache.forEach(g => {
    console.log(`✅ Verbunden mit Server: ${g.name}`);
    console.log(`🔑 Guild-ID: ${g.id}`);
  });
});
