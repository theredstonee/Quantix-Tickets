// --- index.js | Ticket‑Bot v5.3 (JSON‑Parse‑Fix) ---
require('dotenv').config();

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

const TEAM_ROLE = '1387525699908272218';
const PREFIX    = '🎫│';

const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');
let cfg            = require(CFG_PATH);
if (!fs.existsSync(COUNTER_PATH)) fs.writeFileSync(COUNTER_PATH, JSON.stringify({ last:0 },null,2));
if (!fs.existsSync(TICKETS_PATH)) fs.writeFileSync(TICKETS_PATH,'[]');

/* ── Safe JSON read helper ── */
function safeRead(path, fallback){
  try{ const d=fs.readFileSync(path,'utf8'); return d?JSON.parse(d):fallback; }catch{ return fallback; }
}
function safeWrite(path,data){ fs.writeFileSync(path, JSON.stringify(data,null,2)); }

/* Express & Panel */
const app = express();
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));
app.use(express.static('public'));

const client = new Client({ intents:[GatewayIntentBits.Guilds], partials:[Partials.Channel] });
app.use('/', require('./panel')(client));
app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));

const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_HOST = process.env.PANEL_URL || 'localhost:3000';

function nextTicket(){ const c=safeRead(COUNTER_PATH,{last:0}); c.last++; safeWrite(COUNTER_PATH,c); return c.last; }
function buttonRows(claimed){
  const row1=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('request_close').setEmoji('❓').setLabel('Anfrage').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('priority_down').setEmoji('🔻').setLabel('Down').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('priority_up').setEmoji('🔺').setLabel('Up').setStyle(ButtonStyle.Primary),
    claimed? new ButtonBuilder().setCustomId('unclaim').setEmoji('🔄').setLabel('Unclaim').setStyle(ButtonStyle.Secondary)
           : new ButtonBuilder().setCustomId('claim').setEmoji('✅').setLabel('Claim').setStyle(ButtonStyle.Success)
  );
  const row2=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('add_user').setEmoji('➕').setLabel('User').setStyle(ButtonStyle.Secondary));
  return [row1,row2];
}

client.once('ready',async()=>{
  const rest=new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id,cfg.guildId),{body:[ new SlashCommandBuilder().setName('dashboard').setDescription('Admin‑Panel').toJSON() ]});
});

client.on(Events.InteractionCreate,async i=>{
  try{
    if(i.isChatInputCommand()&&i.commandName==='dashboard'){
      return i.reply({components:[ new ActionRowBuilder().addComponents( new ButtonBuilder().setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard')) ],ephemeral:true});
    }

    if(i.isStringSelectMenu()&&i.customId==='topic'){
      const topic=cfg.topics.find(t=>t.value===i.values[0]); if(!topic) return;
      const nr=nextTicket();
      const ch=await i.guild.channels.create({ name:`${PREFIX}ticket-${nr.toString().padStart(5,'0')}`, type:ChannelType.GuildText, parent:cfg.ticketCategoryId,
        permissionOverwrites:[
          {id:i.guild.id, deny:PermissionsBitField.Flags.ViewChannel},
          {id:i.user.id, allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]},
          {id:TEAM_ROLE, allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]}
        ]});
      await ch.send({embeds:[ new EmbedBuilder().setTitle('🎫 Ticket erstellt').setDescription(`Hallo <@${i.user.id}>\n**Thema:** ${topic.label}`) ], components:buttonRows(false)});
      i.reply({content:`Ticket erstellt: ${ch}`,ephemeral:true});
      const log=safeRead(TICKETS_PATH,[]); log.push({id:nr,channelId:ch.id,userId:i.user.id,topic:topic.value,status:'offen',timestamp:Date.now()}); safeWrite(TICKETS_PATH,log);
      return;
    }

    if(i.isButton()){
      const log=safeRead(TICKETS_PATH,[]); const t=log.find(x=>x.channelId===i.channel.id);
      if(!t) return i.reply({ephemeral:true,content:'Log fehlt'});
      switch(i.customId){
        case 'claim': t.claimer=i.user.id; await i.update({components:buttonRows(true)}); break;
        case 'unclaim': delete t.claimer; await i.update({components:buttonRows(false)}); break;
        case 'request_close': await i.channel.send(`❓ <@&${TEAM_ROLE}> Schließungsanfrage von <@${i.user.id}>`); await i.reply({ephemeral:true,content:'Anfrage gesendet'}); break;
        case 'close': if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team darf schließen'}); t.status='geschlossen'; await i.channel.send(`🔒 Ticket geschlossen von <@${i.user.id}> <@&${TEAM_ROLE}>`); await i.channel.delete(); break;
        case 'priority_down': case 'priority_up': const m=await i.channel.messages.fetch({limit:5}).then(l=>l.find(m=>m.embeds.length)); if(m){ const e=EmbedBuilder.from(m.embeds[0]); e.setColor(i.customId==='priority_up'?0xd92b2b:0x2bd94a); await m.edit({embeds:[e]}); } await i.reply({ephemeral:true,content:'Priorität geändert'}); break;
        case 'add_user': const modal=new ModalBuilder().setCustomId('modal_add_user').setTitle('Nutzer hinzufügen'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user').setLabel('User @ oder ID').setRequired(true).setStyle(TextInputStyle.Short))); return i.showModal(modal);
      }
      safeWrite(TICKETS_PATH,log);
    }

    if(i.isModalSubmit()&&i.customId==='modal_add_user'){
      const uid=(i.fields.getTextInputValue('user').match(/\d{17,20}/)||[])[0];
      if(!uid) return i.reply({ephemeral:true,content:'Ungültige Eingabe'});
      await i.channel.permissionOverwrites.edit(uid,{ViewChannel:true,SendMessages:true});
      await i.reply({ephemeral:true,content:`<@${uid}> hinzugefügt`});
    }
  }catch(err){ console.error(err); if(!i.replied&&!i.deferred) i.reply({ephemeral:true,content:'Fehler'});}  
});

client.login(TOKEN);
