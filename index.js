// --- index.js | Ticket‑Bot v5.4 (Button‑Label & Add‑User Fix) ---
require('dotenv').config();

/* Core Deps */
const path = require('path');
const fs   = require('fs');
const express = require('express');
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST, SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, Events
} = require('discord.js');

/* Constants */
const TEAM_ROLE = '1387525699908272218';
const PREFIX    = '🎫│';

/* Paths & Config */
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');
let cfg            = require(CFG_PATH);
if(!fs.existsSync(COUNTER_PATH)) fs.writeFileSync(COUNTER_PATH, JSON.stringify({last:0},null,2));
if(!fs.existsSync(TICKETS_PATH)) fs.writeFileSync(TICKETS_PATH,'[]');

/* Safe JSON helpers */
const safeRead  = (p,fb)=>{try{const d=fs.readFileSync(p,'utf8');return d?JSON.parse(d):fb}catch{return fb}};
const safeWrite = (p,obj)=>fs.writeFileSync(p,JSON.stringify(obj,null,2));

/* Express & Panel */
const app=express();
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));app.use(express.urlencoded({extended:true}));app.use(express.static('public'));
const client=new Client({intents:[GatewayIntentBits.Guilds],partials:[Partials.Channel]});
app.use('/', require('./panel')(client));
app.listen(3000,()=>console.log('🌐 Panel listening on :3000'));

const TOKEN=process.env.DISCORD_TOKEN;
const PANEL_HOST=process.env.PANEL_URL||'localhost:3000';

/* Ticket Counter */
function nextTicket(){const c=safeRead(COUNTER_PATH,{last:0});c.last++;safeWrite(COUNTER_PATH,c);return c.last;}

/* Button Rows (<=5 per row) */
function buttonRows(claimed){
  const row1=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('request_close').setEmoji('❓').setLabel('Schließungsanfrage').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('priority_down').setEmoji('🔻').setLabel('Herabstufen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('priority_up').setEmoji('🔺').setLabel('Erhöhen').setStyle(ButtonStyle.Primary)
  );
  const row2=new ActionRowBuilder().addComponents(
    claimed? new ButtonBuilder().setCustomId('unclaim').setEmoji('🔄').setLabel('Unclaim').setStyle(ButtonStyle.Secondary)
           : new ButtonBuilder().setCustomId('claim').setEmoji('✅').setLabel('Beanspruchen').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('add_user').setEmoji('➕').setLabel('Nutzer hinzufügen').setStyle(ButtonStyle.Secondary)
  );
  return [row1,row2];
}

/* Ready */
client.once('ready',async()=>{
  const rest=new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id,cfg.guildId),{body:[new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON()]});
  console.log(`🤖 ${client.user.tag} bereit`);
});

/* Interactions */
client.on(Events.InteractionCreate,async i=>{
  try{
    /* /dashboard */
    if(i.isChatInputCommand()&&i.commandName==='dashboard'){
      return i.reply({components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard'))],ephemeral:true});
    }

    /* Thema Auswahl */
    if(i.isStringSelectMenu()&&i.customId==='topic'){
      const topic=cfg.topics.find(t=>t.value===i.values[0]); if(!topic) return;
      const nr=nextTicket();
      const ch=await i.guild.channels.create({name:`${PREFIX}ticket-${nr.toString().padStart(5,'0')}`,type:ChannelType.GuildText,parent:cfg.ticketCategoryId,permissionOverwrites:[{id:i.guild.id,deny:PermissionsBitField.Flags.ViewChannel},{id:i.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]},{id:TEAM_ROLE,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]}]});
      await ch.send({embeds:[new EmbedBuilder().setTitle('🎫 Ticket erstellt').setDescription(`Hallo <@${i.user.id}>\n**Thema:** ${topic.label}`)],components:buttonRows(false)});
      i.reply({content:`Ticket erstellt: ${ch}`,ephemeral:true});
      const log=safeRead(TICKETS_PATH,[]);log.push({id:nr,channelId:ch.id,userId:i.user.id,topic:topic.value,status:'offen',timestamp:Date.now()});safeWrite(TICKETS_PATH,log);
      return;
    }

    /* Button Aktionen */
    if(i.isButton()){
      const log=safeRead(TICKETS_PATH,[]);const t=log.find(x=>x.channelId===i.channel.id);
      if(!t) return i.reply({ephemeral:true,content:'Log fehlt'});
      switch(i.customId){
        case 'claim': t.claimer=i.user.id; await i.update({components:buttonRows(true)}); break;
        case 'unclaim': delete t.claimer; await i.update({components:buttonRows(false)}); break;
        case 'request_close': await i.channel.send(`❓ <@&${TEAM_ROLE}> Schließungsanfrage von <@${i.user.id}>`); await i.reply({ephemeral:true,content:'Schließungsanfrage gesendet'}); break;
        case 'close': if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team darf schließen'}); t.status='geschlossen'; safeWrite(TICKETS_PATH,log); await i.channel.send(`🔒 Ticket geschlossen von <@${i.user.id}> <@&${TEAM_ROLE}>`); return i.channel.delete();
        case 'priority_down': case 'priority_up': const m=await i.channel.messages.fetch({limit:5}).then(l=>l.find(m=>m.embeds.length)); if(m){const e=EmbedBuilder.from(m.embeds[0]);e.setColor(i.customId==='priority_up'?0xd92b2b:0x2bd94a);await m.edit({embeds:[e]});} await i.reply({ephemeral:true,content:'Priorität geändert'}); break;
        case 'add_user': const modal=new ModalBuilder().setCustomId('modal_add_user').setTitle('Nutzer hinzufügen'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user').setLabel('User @ oder ID').setRequired(true).setStyle(TextInputStyle.Short))); return i.showModal(modal);
      }
      safeWrite(TICKETS_PATH,log);
    }

    /* Modal Submit: User hinzufügen */
    if(i.isModalSubmit()&&i.customId==='modal_add_user'){
      const value=i.fields.getTextInputValue('user').trim();
      const idMatch=value.match(/\d{17,20}/);
      const userId=idMatch? idMatch[0] : null;
      if(!userId) return i.reply({ephemeral:true,content:'Bitte eine gültige User‑ID oder Mention eingeben.'});
      await i.channel.permissionOverwrites.edit(userId,{ViewChannel:true,SendMessages:true});
      await i.reply({ephemeral:true,content:`<@${userId}> wurde hinzugefügt.`});
    }
  }catch(err){ console.error(err); if(!i.replied&&!i.deferred) i.reply({ephemeral:true,content:'Fehler'}); }
});

client.login(TOKEN);
