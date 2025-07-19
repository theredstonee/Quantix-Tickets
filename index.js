// --- index.js | Ticket‑Bot v6.0 (Custom Ticket Embed aus Web‑Panel, Team‑Regeln, robuste Datei‑IO) ---
require('dotenv').config();

/* ========== Imports ========== */
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

/* ========== Konstanten ========== */
const TEAM_ROLE = '1387525699908272218';           // Rolle, die Supportaktionen darf
const PREFIX    = '🎫│';                           // Präfix vor Ticketchannels

/* ========== Pfade / Dateien ========== */
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');

/* ========== Safe JSON Helpers ========== */
function safeRead(file, fallback){
  try { const raw = fs.readFileSync(file,'utf8'); return raw?JSON.parse(raw):fallback; } catch { return fallback; }
}
function safeWrite(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }

let cfg = safeRead(CFG_PATH, {});
if(!fs.existsSync(COUNTER_PATH)) safeWrite(COUNTER_PATH, { last: 0 });
if(!fs.existsSync(TICKETS_PATH)) safeWrite(TICKETS_PATH, []);

/* Default für ticketEmbed falls noch nicht in config */
if(!cfg.ticketEmbed){
  cfg.ticketEmbed = {
    title: '🎫 Ticket #{ticketNumber}',
    description: 'Hallo {userMention}\n**Thema:** {topicLabel}',
    color: '#2b90d9',
    footer: 'Ticket #{ticketNumber}'
  };
}

/* ========== Express & Panel ========== */
const app = express();
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended:true }));
app.use(express.static('public'));

const client = new Client({ intents:[GatewayIntentBits.Guilds], partials:[Partials.Channel] });
app.use('/', require('./panel')(client));
app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));

const TOKEN      = process.env.DISCORD_TOKEN;
const PANEL_HOST = process.env.PANEL_URL || 'localhost:3000';

/* ========== Ticket Counter ========== */
function nextTicket(){ const c = safeRead(COUNTER_PATH,{last:0}); c.last++; safeWrite(COUNTER_PATH,c); return c.last; }

/* ========== Button Layout (Team only außer request_close) ========== */
function buttonRows(claimed){
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('request_close').setEmoji('❓').setLabel('Schließungsanfrage').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('priority_down').setEmoji('🔻').setLabel('Herab').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('priority_up').setEmoji('🔺').setLabel('Hoch').setStyle(ButtonStyle.Primary),
    claimed ? new ButtonBuilder().setCustomId('unclaim').setEmoji('🔄').setLabel('Unclaim').setStyle(ButtonStyle.Secondary)
            : new ButtonBuilder().setCustomId('claim').setEmoji('✅').setLabel('Claim').setStyle(ButtonStyle.Success)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('add_user').setEmoji('➕').setLabel('Nutzer').setStyle(ButtonStyle.Secondary)
  );
  return [row1,row2,row3];
}

/* ========== Slash Command Deploy ========== */
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    { body: [ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON() ] }
  );
  console.log(`🤖 ${client.user.tag} bereit`);
});

/* ========== Platzhalter Ersatz für Ticket Embed ========== */
function buildTicketEmbedData(i, topic, nr){
  // Re‑read config in case panel changed it while bot läuft
  cfg = safeRead(CFG_PATH, cfg);
  if(!cfg.ticketEmbed){
    cfg.ticketEmbed = { title:'🎫 Ticket #{ticketNumber}', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' };
  }
  const tData = cfg.ticketEmbed;

  const title = (tData.title || '')
    .replace(/\{ticketNumber\}/g, nr.toString())
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value);

  const desc = (tData.description || '')
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id)
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{ticketNumber\}/g, nr.toString());

  const footer = (tData.footer || '')
    .replace(/\{ticketNumber\}/g, nr.toString())
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value);

  const embed = new EmbedBuilder().setTitle(title || '🎫 Ticket').setDescription(desc || `<@${i.user.id}>`);
  if(tData.color && /^#?[0-9a-fA-F]{6}$/.test(tData.color)){
    embed.setColor(parseInt(tData.color.replace('#',''),16));
  }
  if(footer) embed.setFooter({ text: footer });
  return embed;
}

/* ========== Interaction Handling ========== */
client.on(Events.InteractionCreate, async i => {
  try {
    /* /dashboard */
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({
        components:[ new ActionRowBuilder().addComponents(
          new ButtonBuilder().setURL(`http://192.168.178.141:3000/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard')
        )],
        ephemeral:true
      });
    }

    /* Topic Auswahl */
    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = cfg.topics?.find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema',ephemeral:true});
      const nr = nextTicket();
      const channelName = `${PREFIX}ticket-${nr.toString().padStart(5,'0')}`;
      const ch = await i.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId,
        permissionOverwrites:[
          { id:i.guild.id, deny: PermissionsBitField.Flags.ViewChannel },
          { id:i.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id:TEAM_ROLE, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      const embed = buildTicketEmbedData(i, topic, nr);
      await ch.send({ embeds:[embed], components: buttonRows(false) });

      i.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });
      const log = safeRead(TICKETS_PATH, []);
      log.push({ id:nr, channelId:ch.id, userId:i.user.id, topic:topic.value, status:'offen', timestamp:Date.now() });
      safeWrite(TICKETS_PATH, log);
      return;
    }

    /* Buttons */
    if(i.isButton()){
      const log = safeRead(TICKETS_PATH, []);
      const t   = log.find(x=>x.channelId===i.channel.id);
      if(!t) return i.reply({ephemeral:true,content:'Kein Log'});
      const isTeam = i.member.roles.cache.has(TEAM_ROLE);

      // Öffentlicher Button
      if(i.customId==='request_close'){
        await i.channel.send({
          content:`❓ Schließungsanfrage von <@${i.user.id}> <@&${TEAM_ROLE}>`,
          components:[ new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('team_close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger)
          )]
        });
        return i.reply({ephemeral:true,content:'Schließungsanfrage gesendet'});
      }

      // Rest Team only
      if(!isTeam) return i.reply({ephemeral:true,content:'Nur Team darf diesen Button verwenden'});

      switch(i.customId){
        case 'team_close':
        case 'close':
          t.status='geschlossen'; safeWrite(TICKETS_PATH, log);
          await i.channel.send(`🔒 Ticket geschlossen von <@${i.user.id}> <@&${TEAM_ROLE}>`);
          return i.channel.delete();
        case 'claim':
          t.claimer = i.user.id; await i.update({components:buttonRows(true)}); break;
        case 'unclaim':
          delete t.claimer; await i.update({components:buttonRows(false)}); break;
        case 'priority_down':
        case 'priority_up': {
          const msg = await i.channel.messages.fetch({limit:5}).then(c=>c.find(m=>m.embeds.length));
          if(msg){ const e = EmbedBuilder.from(msg.embeds[0]); e.setColor(i.customId==='priority_up'?0xd92b2b:0x2bd94a); await msg.edit({embeds:[e]}); }
          await i.reply({ephemeral:true,content:'Priorität geändert'});
          break;
        }
        case 'add_user': {
          const modal = new ModalBuilder().setCustomId('modal_add_user').setTitle('Nutzer hinzufügen');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('user').setLabel('User @ oder ID').setRequired(true).setStyle(TextInputStyle.Short)
          ));
          return i.showModal(modal);
        }
      }
      safeWrite(TICKETS_PATH, log);
    }

    /* Modal: Nutzer hinzufügen */
    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team'});
      const raw = i.fields.getTextInputValue('user').trim();
      const cleaned = raw.replace(/<@!?|>/g,'');
      const uidMatch = cleaned.match(/\d{17,20}/);
      const uid = uidMatch?uidMatch[0]:null;
      if(!uid) return i.reply({ephemeral:true,content:'Ungültige ID / Mention'});
      try {
        await i.guild.members.fetch(uid); // validiert Mitgliedschaft
        if(i.channel.permissionOverwrites.cache.get(uid))
          return i.reply({ephemeral:true,content:'User hat bereits Zugriff'});
        await i.channel.permissionOverwrites.edit(uid,{ ViewChannel:true, SendMessages:true });
        await i.reply({ephemeral:true,content:`<@${uid}> hinzugefügt`});
      } catch(err){
        console.error('AddUser Fehler', err);
        return i.reply({ephemeral:true,content:'Fehler beim Hinzufügen'});
      }
    }
  } catch(err) {
    console.error(err);
    if(!i.replied && !i.deferred) i.reply({ephemeral:true,content:'Fehler'});
  }
});

client.login(TOKEN);
