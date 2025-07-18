// --- index.js | Ticket‑Bot v5.1 (Emoji‑Buttons, Team‑Close, Add‑User, Channel‑Prefix) ---
require('dotenv').config();

/* ── Core Deps ── */
const path = require('path');
const fs   = require('fs');
const express = require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST, SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, Events
} = require('discord.js');

/* ── Constants ── */
const TEAM_ROLE = '1387525699908272218';          // Rolle, die schließen darf
const PREFIX    = '🎫│';                          // Emoji + Pipe vor Ticket‑Namen

/* ── Paths & Config ── */
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');
let   cfg          = require(CFG_PATH);
if (!fs.existsSync(COUNTER_PATH)) fs.writeFileSync(COUNTER_PATH, JSON.stringify({ last: 0 }, null, 2));
if (!fs.existsSync(TICKETS_PATH)) fs.writeFileSync(TICKETS_PATH, '[]');

/* ── Express & Panel ── */
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const client = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });
app.use('/', require('./panel')(client));
app.listen(3000, () => console.log('🌐 Panel listening on :3000'));

const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_HOST = process.env.PANEL_URL || 'localhost:3000';

/* ── Helper: Counter ── */
function nextTicket() {
  const c = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf8'));
  c.last += 1;
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(c, null, 2));
  return c.last;
}

/* ── Helper: Button‑Row ── */
function buttonRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('request_close').setLabel('❓ Schließungsanfrage').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close').setLabel('🔒 Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('priority_down').setLabel('🔻 Herabstufen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('priority_up').setLabel('🔺 Erhöhen').setStyle(ButtonStyle.Primary),
    claimed
      ? new ButtonBuilder().setCustomId('unclaim').setLabel('🔄 Unclaim').setStyle(ButtonStyle.Secondary)
      : new ButtonBuilder().setCustomId('claim').setLabel('✅ Beanspruchen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('add_user').setLabel('➕ Nutzer hinzufügen').setStyle(ButtonStyle.Secondary)
  );
}

/* ── Ready → Slash‑Command deploy ── */
client.once('ready', async () => {
  console.log(`🤖 ${client.user.tag} online`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    {
      body: [
        new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON(),
      ],
    },
  );
});

/* ── Interaction Handler ── */
client.on(Events.InteractionCreate, async (i) => {
  try {
    /* /dashboard */
    if (i.isChatInputCommand() && i.commandName === 'dashboard') {
      return i.reply({
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard'),
          ),
        ],
        ephemeral: true,
      });
    }

    /* Thema wählen */
    if (i.isStringSelectMenu() && i.customId === 'topic') {
      const topic = cfg.topics.find((t) => t.value === i.values[0]);
      if (!topic) return;
      const nr = nextTicket();
      const channelName = `${PREFIX}ticket-${nr.toString().padStart(5, '0')}`;
      const ch = await i.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId,
        permissionOverwrites: [
          { id: i.guild.id, deny: PermissionsBitField.Flags.ViewChannel },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: TEAM_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ],
      });

      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎫 Ticket erstellt')
            .setDescription(`Hallo <@${i.user.id}>\n**Thema:** ${topic.label}`),
        ],
        components: [buttonRow(false)],
      });

      const tickets = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
      tickets.push({ id: nr, channelId: ch.id, userId: i.user.id, topic: topic.value, status: 'offen', timestamp: Date.now() });
      fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets, null, 2));

      return i.reply({ content: `Ticket erstellt: ${ch}`, ephemeral: true });
    }

    /* Buttons */
    if (i.isButton()) {
      const tickets = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
      const t = tickets.find((x) => x.channelId === i.channel.id);
      if (!t) return i.reply({ content: 'Kein Log', ephemeral: true });

      switch (i.customId) {
        case 'claim':
          t.claimer = i.user.id;
          await i.update({ components: [buttonRow(true)] });
          break;
        case 'unclaim':
          delete t.claimer;
          await i.update({ components: [buttonRow(false)] });
          break;
        case 'request_close':
          await i.channel.send(`❓ <@&${TEAM_ROLE}> Schließungsanfrage von <@${i.user.id}>`);
          await i.reply({ ephemeral: true, content: 'Anfrage gesendet' });
          break;
        case 'close':
          if (!i.member.roles.cache.has(TEAM_ROLE)) {
            return i.reply({ ephemeral: true, content: 'Nur Team darf schließen' });
          }
          t.status = 'geschlossen';
          await i.channel.send(`🔒 Ticket geschlossen von <@${i.user.id}> <@&${TEAM_ROLE}>`);
          await i.channel.delete();
          break;
        case 'priority_down':
        case 'priority_up':
          const msg = await i.channel.messages
            .fetch({ limit: 5 })
            .then((l) => l.find((m) => m.embeds.length));
          if (msg) {
            const e = EmbedBuilder.from(msg.embeds[0]);
            e.setColor(i.customId === 'priority_up' ? 0xd92b2b : 0x2bd94a);
            await msg.edit({ embeds: [e] });
          }
          await i.reply({ ephemeral: true, content: 'Priorität geändert' });
          break;
        case 'add_user':
          const modal = new ModalBuilder().setCustomId('modal_add_user').setTitle('Nutzer hinzufügen');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('user')
                .setLabel('User @ oder ID')
                .setRequired(true)
                .setStyle(TextInputStyle.Short),
            ),
          );
          return i.showModal(modal);
      }
      fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets, null, 2));
    }

    /* Modal submit → Nutzer hinzufügen */
    if (i.isModalSubmit() && i.customId === 'modal_add_user') {
      const userField = i.fields.getTextInputValue('user');
      const userId = (userField.match(/\d{17,20}/) || [])[0];
      if (!userId) return i.reply({ ephemeral: true, content: 'Ungültige Eingabe' });
      await i.channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true });
      await i.reply({ ephemeral: true, content: `<@${userId}> hinzugefügt` });
    }
  } catch (err) {
    console.error(err);
    if (!i.replied && !i.deferred) i.reply({ content: 'Fehler', ephemeral: true });
  }
});

client.login(TOKEN);
