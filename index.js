// --- index.js | Ticket‑Bot v3 (Router‑Fix, Buttons, Counter) ---
require('dotenv').config();

/* ── Core Deps ── */
const path = require('path');
const fs   = require('fs');
const express = require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST, SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder,
  PermissionsBitField, ChannelType, Events
} = require('discord.js');

/* ── Files & Config ── */
const CFG_PATH     = path.join(__dirname, 'config.json');
const COUNTER_PATH = path.join(__dirname, 'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname, 'tickets.json');
let   cfg          = require(CFG_PATH);
if (!fs.existsSync(COUNTER_PATH)) fs.writeFileSync(COUNTER_PATH, JSON.stringify({ last:0 },null,2));
if (!fs.existsSync(TICKETS_PATH)) fs.writeFileSync(TICKETS_PATH, '[]');

/* ── Express Grundgerüst ── */
const app = express();
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended:true }));
app.use(express.static('public'));

/* ── Discord Client ── */
const client = new Client({ intents:[GatewayIntentBits.Guilds], partials:[Partials.Channel] });

/* ── Panel Router Factory ── */
const panelFactory = require('./panel');        // EXPORTIERT FUNKTION
app.use('/', panelFactory(client));             // liefert Router

app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));

const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_HOST = process.env.PANEL_URL || 'localhost:3000:3000';

/* ── Helpers ── */
function nextTicket(){
  const c = JSON.parse(fs.readFileSync(COUNTER_PATH,'utf8')); c.last++; fs.writeFileSync(COUNTER_PATH, JSON.stringify(c,null,2)); return c.last;
}
function buttons(claimed){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('request_close').setLabel('Schließungsanfrage').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close').setLabel('Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('priority_up').setLabel('Erhöhen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('priority_down').setLabel('Herabstufen').setStyle(ButtonStyle.Primary),
    claimed ? new ButtonBuilder().setCustomId('unclaim').setLabel('Unclaim').setStyle(ButtonStyle.Secondary)
            : new ButtonBuilder().setCustomId('claim').setLabel('Beanspruchen').setStyle(ButtonStyle.Success)
  );
}

/* ── Client Ready → Slash deploy ── */
client.once('ready', async()=>{
  console.log(`🤖 Bot online: ${client.user.tag}`);
  const rest = new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id,cfg.guildId), { body:[ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON() ] });
  console.log('✅ /dashboard deployed');
});

/* ── Interaction Handler ── */
client.on(Events.InteractionCreate, async i=>{
  try{
    /* Dashboard link */
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({ components:[ new ActionRowBuilder().addComponents( new ButtonBuilder().setURL(`http://192.168.178.141:3000/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard')) ], ephemeral:true });
    }

    /* Thema Auswahl */
    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = cfg.topics.find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema',ephemeral:true});
      const nr = nextTicket();
      const ch = await i.guild.channels.create({
        name:`ticket-${nr.toString().padStart(5,'0')}`,
        type:ChannelType.GuildText,
        parent:cfg.ticketCategoryId,
        permissionOverwrites:[
          {id:i.guild.id, deny:PermissionsBitField.Flags.ViewChannel},
          {id:i.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]},
          {id:cfg.supportRoleId, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]}
        ]
      });
      await ch.send({ embeds:[ new EmbedBuilder().setTitle(`🎫 Ticket #${nr}`).setDescription(`Hallo <@${i.user.id}>, Thema: ${topic.label}`) ], components:[buttons(false)] });
      i.reply({content:`Ticket erstellt: ${ch}`,ephemeral:true});
      const log = JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8')); log.push({id:nr,channelId:ch.id,userId:i.user.id,topic:topic.value,status:'offen',timestamp:Date.now()}); fs.writeFileSync(TICKETS_PATH, JSON.stringify(log,null,2));
      return;
    }

    /* Buttons */
    if(i.isButton()){
      const log = JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8'));
      const t   = log.find(x=>x.channelId===i.channel.id);
      if(!t) return i.reply({content:'Kein Log',ephemeral:true});
      switch(i.customId){
        case 'claim': t.claimer=i.user.id; await i.update({components:[buttons(true)]}); break;
        case 'unclaim': delete t.claimer; await i.update({components:[buttons(false)]}); break;
        case 'request_close': await i.channel.send(`❓ Schließungsanfrage von <@${i.user.id}>`); await i.reply({ephemeral:true,content:'Anfrage gesendet'}); break;
        case 'close': if(!i.member.roles.cache.has(cfg.supportRoleId)) return i.reply({content:'Nur Support',ephemeral:true}); t.status='geschlossen'; await i.channel.send('🔒 Ticket wird geschlossen'); await i.channel.delete(); break;
        case 'priority_up': case 'priority_down': const m=await i.channel.messages.fetch({limit:5}).then(l=>l.find(m=>m.embeds.length)); if(m){const e=EmbedBuilder.from(m.embeds[0]); e.setColor(i.customId==='priority_up'?0xd92b2b:0x2bd94a); await m.edit({embeds:[e]});} await i.reply({content:'Priorität geändert',ephemeral:true}); break;
      }
      fs.writeFileSync(TICKETS_PATH, JSON.stringify(log,null,2));
    }
  }catch(err){ console.error(err); if(!i.replied&&!i.deferred) i.reply({content:'Fehler',ephemeral:true}); }
});

client.login(TOKEN);

/* Einmal Panel-Dropdown senden
sendPanelMessage('1357443439079329874'); */