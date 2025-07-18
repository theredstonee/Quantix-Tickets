// --- index.js ---
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const express = require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST,
  SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionsBitField, ChannelType, Events
} = require('discord.js');

/* ───── Pfade & Konfig ───── */
const CFG_PATH      = path.join(__dirname, 'config.json');
const COUNTER_PATH  = path.join(__dirname, 'ticketCounter.json');
const cfg           = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
if (!fs.existsSync(COUNTER_PATH)) fs.writeFileSync(COUNTER_PATH, JSON.stringify({ last: 0 }, null, 2));

/* ───── Express + Panel ───── */
const panelRouter = require('./panel');          // Router benötigt client
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

/* ───── Discord Client ───── */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

app.use('/', panelRouter(client));               // Panel bekommt Client
app.listen(3000, () => console.log('Panel listening on :3000'));

/* ───── Slash‑Command /dashboard ───── */
client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);

  const dashboardCmd = new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Link zum Admin‑Panel anzeigen');

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    { body: [dashboardCmd.toJSON()] }
  );
  console.log('[slash] /dashboard registriert');
});

/* ───── Helfer ───── */
function nextTicketNumber() {
  const counter = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf8'));
  counter.last += 1;
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(counter, null, 2));
  return counter.last;
}

function buildActionRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_request').setLabel('Schließungsanfrage').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close').setLabel('Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('prio_up').setLabel('Erhöhen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prio_down').setLabel('Herabstufen').setStyle(ButtonStyle.Primary),
    claimed
      ? new ButtonBuilder().setCustomId('unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Secondary)
      : new ButtonBuilder().setCustomId('claim').setLabel('Beanspruchen').setStyle(ButtonStyle.Success)
  );
}

/* ───── Interaktionen ───── */
client.on(Events.InteractionCreate, async i => {
  try {
    /* ----- Slash‑Command ----- */
    if (i.isChatInputCommand() && i.commandName === 'dashboard') {
      const url = `http://${process.env.PANEL_URL || 'localhost:3000'}/panel`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setURL(url).setLabel('Dashboard').setStyle(ButtonStyle.Link)
      );
      return i.reply({ content: '🖥️ Admin‑Panel:', components: [row], ephemeral: true });
    }

    /* ----- Dropdown Thema ----- */
    if (i.isStringSelectMenu() && i.customId === 'topic') {
      const topic = cfg.topics.find(t => t.value === i.values[0]);
      if (!topic) return i.reply({ content: 'Unbekanntes Thema.', ephemeral: true });

      const num = nextTicketNumber();
      const channel = await i.guild.channels.create({
        name: `ticket-${num.toString().padStart(5, '0')}`,
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId,
        permissionOverwrites: [
          { id: i.guild.id, deny: PermissionsBitField.Flags.ViewChannel },
          { id: i.user.id,  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: cfg.supportRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const embed = new EmbedBuilder()
        .setColor(0x2b90d9)
        .setTitle(`🎫 Ticket #${num.toString().padStart(5, '0')}`)
        .setDescription(`Hallo <@${i.user.id}>, unser Support‑Team <@&${cfg.supportRoleId}> kümmert sich!`)
        .addFields({ name: 'Thema', value: `${topic.emoji || ''} ${topic.label}` });

      await channel.send({ embeds: [embed], components: [buildActionRow(false)] });
      await i.reply({ content: `Ticket erstellt: ${channel}`, ephemeral: true });
      return;
    }

    /* ----- Button‑Aktionen ----- */
    if (i.isButton()) {
      const { customId } = i;
      const ch = i.channel;

      // Beanspruchen / Unclaim
      if (customId === 'claim' || customId === 'unclaim') {
        const claimed = customId === 'claim' ? i.user.id : null;
        await ch.setTopic(claimed ? `Bearbeiter: ${i.user.tag}` : null);
        await i.update({ components: [buildActionRow(!!claimed)] });
        return;
      }

      // Schließungsanfrage
      if (customId === 'close_request') {
        await ch.send(`❔ <@&${cfg.supportRoleId}> Schließungsanfrage von <@${i.user.id}>`);
        await i.reply({ content: 'Anfrage gesendet.', ephemeral: true });
        return;
      }

      // Direkt schließen (nur Supporter)
      if (customId === 'close') {
        if (!i.member.roles.cache.has(cfg.supportRoleId))
          return i.reply({ content: 'Nur Support kann schließen.', ephemeral: true });
        await i.reply({ content: 'Ticket wird geschlossen …', ephemeral: true });
        return ch.delete();
      }

      // Priorität hoch/runter (Embed‑Farbe)
      if (customId === 'prio_up' || customId === 'prio_down') {
        const msg = await ch.messages.fetch({ limit: 10 }).then(c => c.find(m => m.embeds.length));
        if (msg) {
          const emb = EmbedBuilder.from(msg.embeds[0]);
          emb.setColor(customId === 'prio_up' ? 0xd92b2b : 0x2bd94a);
          await msg.edit({ embeds: [emb] });
        }
        await i.reply({ content: 'Priorität geändert.', ephemeral: true });
        return;
      }
    }
  } catch (e) {
    console.error(e);
    if (!i.replied && !i.deferred) i.reply({ content: 'Fehler :(', ephemeral: true });
  }
});

/* ───── Ticket‑Panel senden (einmalig ausführen, dann auskommentieren) ───── */
async function sendPanelMessage(channelId) {
  const guild   = await client.guilds.fetch(cfg.guildId);
  const channel = await guild.channels.fetch(channelId);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('topic')
    .setPlaceholder('Wähle dein Thema …')
    .addOptions(cfg.topics);

  await channel.send({
    embeds: [ new EmbedBuilder().setTitle('🎫 Ticket‑System').setDescription('Bitte Thema auswählen.') ],
    components: [ new ActionRowBuilder().addComponents(menu) ]
  });
  console.log(`[panel] Nachricht in #${channel.name} gesendet`);
}

/* ---- Bot starten ---- */
client.login(process.env.DISCORD_TOKEN);

/* Panel einmalig posten, dann auskommentieren */
// sendPanelMessage('1357443439079329874');
