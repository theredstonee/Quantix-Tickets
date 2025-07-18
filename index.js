// --- index.js (fix: env token, view engine, slash deploy) ---
require('dotenv').config();

const path = require('path');
const fs   = require('fs');
const express = require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST,
  SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder
} = require('discord.js');

const panelRouter = require('./panel');
const config     = require('./config.json');

const TOKEN      = process.env.DISCORD_TOKEN;      // ✔ richtiger Env‑Key
const PANEL_HOST = process.env.PANEL_URL || 'localhost:3000';

/* ───── Express‑App einrichten ───── */
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

/* Panel‑Router mounten */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});
app.use('/', panelRouter(client));

app.listen(3000, () => console.log('Panel listening on :3000'));

/* ───── Discord Client ───── */
client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);

  // Slash‑Command /dashboard
  const commands = [
    new SlashCommandBuilder()
      .setName('dashboard')
      .setDescription('Link zum Admin‑Panel anzeigen')
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, config.guildId),
    { body: commands.map(c => c.toJSON()) }
  );
  console.log('[slash] /dashboard registriert');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'dashboard') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Zum Admin‑Panel')
        .setStyle(ButtonStyle.Link)
        .setURL(`http://${PANEL_HOST}/panel`)
    );
    await interaction.reply({ content: '🖥️ Hier ist dein Link:', components: [row], ephemeral: true });
  }
});

client.login(TOKEN);
