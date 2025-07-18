// --- index.js | Full Ticket Bot with Buttons & Counter ---
require('dotenv').config();

const path   = require('path');
const fs     = require('fs');
const express= require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST,
  SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField, ChannelType, Events
} = require('discord.js');

/* ───── Pfade & Dateien ───── */
const CFG_PATH        = path.join(__dirname, 'config.json');
const COUNTER_PATH    = path.join(__dirname, 'ticketCounter.json');
const TICKETS_PATH    = path.join(__dirname, 'tickets.json');

let cfg               = require(CFG_PATH);
if (!fs.existsSync(COUNTER_PATH)) fs.writeFileSync(COUNTER_PATH, JSON.stringify({ last: 0 }));
if (!fs.existsSync(TICKETS_PATH)) fs.writeFileSync(TICKETS_PATH, '[]');

/* ───── Express Setup ───── */
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const panelRouter = require('./panel');

/* ───── Discord Client ───── */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});
app.use('/', panelRouter(client));
app.listen(3000, () => console.log('Panel listening on :3000'));

const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_HOST = process.env.PANEL_URL || 'localhost:3000';

/* ───── Helper: Counter ───── */
const nextTicketNumber = () => {
  const counter = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf8'));
  counter.last += 1;
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(counter));
  return counter.last;
};

/* ───── Bot Ready ───── */
client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);

  // /dashboard Command
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    { body: [ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel') ].map(c=>c.toJSON()) }
  );
  console.log('[slash] /dashboard registriert');
});

/* ───── Interaction Handler ───── */
client.on(Events.InteractionCreate, async i => {
  try {
    /* 1) Slash /dashboard */
    if (i.isChatInputCommand() && i.commandName === 'dashboard') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Dashboard').setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link)
      );
      return i.reply({ content:'🖥️ Admin‑Panel', components:[row], ephemeral:true});
    }

    /* 2) Dropdown: Thema auswählen */
    if (i.isStringSelectMenu() && i.customId === 'topic') {
      const topic = cfg.topics.find(t=>t.value===i.values[0]);
      if (!topic) return i.reply({ content:'Thema unbekannt', ephemeral:true});
      const num = nextTicketNumber();
      const chName = `ticket-${num.toString().padStart(5,'0')}`;
      const ticketChannel = await i.guild.channels.create({
        name: chName,
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId,
        permissionOverwrites:[
          {id:i.guild.id, deny: PermissionsBitField.Flags.ViewChannel},
          {id:i.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]},
          {id:cfg.supportRoleId, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]}
        ]
      });

      /* Buttons */
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close').setLabel('Schließen').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('request_close').setLabel('Schließungsanfrage').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('priority_up').setLabel('Erhöhen').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('priority_down').setLabel('Herabstufen').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('claim').setLabel('Beanspruchen').setStyle(ButtonStyle.Success)
      );

      await ticketChannel.send({
        embeds:[ new EmbedBuilder().setTitle(`${topic.emoji||''} ${topic.label}`).setDescription(`Ticket #${num}\nSupport wird sich melden, ${i.user}.`) ],
        components:[buttons]
      });
      i.reply({ content:`✅ Ticket erstellt: ${ticketChannel}`, ephemeral:true});

      /* Ticket in Datei loggen */
      const tickets = JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8'));
      tickets.push({ id:num, channelId:ticketChannel.id, userId:i.user.id, topic:topic.value, status:'offen', timestamp:Date.now() });
      fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets,null,2));
      return;
    }

    /* 3) Button Handler */
    if (i.isButton()) {
      const ch = i.channel;
      const tickets = JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8'));
      const ticket = tickets.find(t=>t.channelId===ch.id);
      if (!ticket) return i.reply({content:'Ticketdaten nicht gefunden',ephemeral:true});

      switch(i.customId){
        case 'close':
          ticket.status='geschlossen';
          fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets,null,2));
          await ch.send('🔒 Ticket wird geschlossen …');
          await ch.delete();
          break;
        case 'request_close':
          await ch.send('❓ Schließungsanfrage gestellt. Support bestätigen.');
          break;
        case 'priority_up':
          ch.setName(ch.name+ '🔺');
          await i.reply({content:'Priorität erhöht',ephemeral:true});
          break;
        case 'priority_down':
          ch.setName(ch.name.replace('🔺',''));
          await i.reply({content:'Priorität herabgestuft',ephemeral:true});
          break;
        case 'claim':
          if(ticket.claimer===i.user.id){
            ticket.claimer=null;
            await i.reply({content:'Unclaim durchgeführt',ephemeral:true});
          }else{
            ticket.claimer=i.user.id;
            await i.reply({content:`Ticket beansprucht von ${i.user}`,ephemeral:true});
          }
          fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets,null,2));
          break;
        default: return;
      }
    }
  } catch(err){ console.error(err); }
});

client.login(TOKEN);
