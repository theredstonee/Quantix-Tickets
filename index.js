// --- index.js | Full Ticket‑Bot v2 (Buttons, Counter, Ticket‑JSON, Panel‑Router‑Fix) ---
require('dotenv').config();

/* ───── Core & Deps ───── */
const path   = require('path');
const fs     = require('fs');
const express= require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST, SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionsBitField, ChannelType, Events
} = require('discord.js');

/* ───── Paths & Config ───── */
const CFG_PATH       = path.join(__dirname, 'config.json');
const COUNTER_PATH   = path.join(__dirname, 'ticketCounter.json');
const TICKETS_PATH   = path.join(__dirname, 'tickets.json');

let   cfg            = require(CFG_PATH);
if (!fs.existsSync(COUNTER_PATH)) fs.writeFileSync(COUNTER_PATH, JSON.stringify({ last: 0 }, null, 2));
if (!fs.existsSync(TICKETS_PATH )) fs.writeFileSync(TICKETS_PATH , '[]');

/* ───── Express Setup ───── */
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

/* ───── Discord Client ───── */
const client = new Client({ intents:[GatewayIntentBits.Guilds], partials:[Partials.Channel] });

/* Panel Router (factory) */
const panelRouterFactory = require('./panel');
app.use('/', panelRouterFactory(client));
app.listen(3000, () => console.log('Panel listening on :3000'));

const TOKEN       = process.env.DISCORD_TOKEN;
const PANEL_HOST  = process.env.PANEL_URL || 'localhost:3000';

/* ───── Helper: Ticket Counter ───── */
function nextTicket() {
  const c = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf8'));
  c.last += 1;
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(c, null, 2));
  return c.last;
}

/* ───── Helper: Buttons ───── */
function actionRow(claimed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('request_close').setLabel('Schließungsanfrage').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close').setLabel('Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('priority_up').setLabel('Erhöhen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('priority_down').setLabel('Herabstufen').setStyle(ButtonStyle.Primary),
    claimed
      ? new ButtonBuilder().setCustomId('unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Secondary)
      : new ButtonBuilder().setCustomId('claim').setLabel('Beanspruchen').setStyle(ButtonStyle.Success)
  );
}

/* ───── READY: Slash‑Command Deploy ───── */
client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  const rest = new REST({ version:'10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    { body:[ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON() ] }
  );
  console.log('[slash] /dashboard deployed');
});

/* ───── Interaction Handler ───── */
client.on(Events.InteractionCreate, async i => {
  try {
    /* ── /dashboard ── */
    if (i.isChatInputCommand() && i.commandName==='dashboard') {
      const linkRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Dashboard').setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link)
      );
      return i.reply({ content:'🖥️ Admin‑Panel', components:[linkRow], ephemeral:true });
    }

    /* ── Dropdown Thema ── */
    if (i.isStringSelectMenu() && i.customId==='topic') {
      const topic = cfg.topics.find(t=>t.value===i.values[0]);
      if (!topic) return i.reply({ content:'Unbekanntes Thema', ephemeral:true });

      const nr  = nextTicket();
      const name= `ticket-${nr.toString().padStart(5,'0')}`;
      const ch  = await i.guild.channels.create({
        name, type:ChannelType.GuildText, parent:cfg.ticketCategoryId,
        permissionOverwrites:[
          { id:i.guild.id, deny:PermissionsBitField.Flags.ViewChannel },
          { id:i.user.id,  allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id:cfg.supportRoleId, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const emb = new EmbedBuilder()
        .setColor(0x2b90d9)
        .setTitle(`🎫 Ticket #${nr}`)
        .setDescription(`Hallo <@${i.user.id}>! Thema: ${topic.label}`);

      await ch.send({ embeds:[emb], components:[actionRow(false)] });
      i.reply({ content:`✅ Ticket erstellt: ${ch}`, ephemeral:true });

      /* Log in tickets.json */
      const tickets = JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8'));
      tickets.push({ id:nr, channelId:ch.id, userId:i.user.id, topic:topic.value, status:'offen', timestamp:Date.now() });
      fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets,null,2));
      return;
    }

    /* ── Buttons ── */
    if (i.isButton()) {
      const tickets = JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8'));
      const ticket  = tickets.find(t=>t.channelId===i.channel.id);
      if (!ticket)   return i.reply({ content:'Ticketdaten fehlen', ephemeral:true });

      switch(i.customId) {
        case 'claim':
          ticket.claimer = i.user.id;
          await i.update({ components:[actionRow(true)] });
          break;
        case 'unclaim':
          delete ticket.claimer;
          await i.update({ components:[actionRow(false)] });
          break;
        case 'request_close':
          await i.channel.send(`❓ Schließungsanfrage von <@${i.user.id}>`);
          await i.reply({ content:'Anfrage gesendet', ephemeral:true });
          break;
        case 'close':
          if (!i.member.roles.cache.has(cfg.supportRoleId))
            return i.reply({ content:'Nur Support darf schließen', ephemeral:true });
          ticket.status='geschlossen';
          fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets,null,2));
          await i.channel.send('🔒 Ticket wird geschlossen …');
          await i.channel.delete();
          return;
        case 'priority_up':
        case 'priority_down':
          const msg = await i.channel.messages.fetch({ limit:5 }).then(c=>c.find(m=>m.embeds.length));
          if (msg) {
            const e = EmbedBuilder.from(msg.embeds[0]);
            e.setColor(i.customId==='priority_up'?0xd92b2b:0x2bd94a);
            await msg.edit({ embeds:[e] });
          }
          await i.reply({ content:'Priorität geändert', ephemeral:true });
          break;
      }
      fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets,null,2));
    }
  } catch(err) {
    console.error(err);
    if (!i.replied && !i.deferred) i.reply({ content:'💥 Fehler', ephemeral:true});
  }
});

client.login(TOKEN);

/* Panel‑Dropdown einmalig senden, danach auskommentieren */
// sendPanelMessage('1357443439079329874');
