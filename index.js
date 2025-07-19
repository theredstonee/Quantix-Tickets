// --- index.js | Ticket‑Bot v6.2 (3-stufige Priorität + farbiger Punkt im Channelnamen + Panel-Reset) ---
require('dotenv').config();

/* ================= Imports ================= */
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

/* ================= Konstanten ================= */
const TEAM_ROLE = '1387525699908272218';              // Teamrolle
const PREFIX    = '🎫│';                               // Basispräfix
// Drei Prioritätsstufen: Index 0..2
const PRIORITY_STATES = [
  { dot: '🟢', embedColor: 0x2bd94a, label: 'Grün'   },
  { dot: '🟠', embedColor: 0xff9900, label: 'Orange' },
  { dot: '🔴', embedColor: 0xd92b2b, label: 'Rot'    }
];

/* ================= Pfade / Dateien ================= */
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');

/* ================= Safe JSON Helper ================= */
function safeRead(file, fallback){
  try { const raw = fs.readFileSync(file,'utf8'); return raw?JSON.parse(raw):fallback; } catch { return fallback; }
}
function safeWrite(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }

let cfg = safeRead(CFG_PATH, {});
if(!fs.existsSync(COUNTER_PATH)) safeWrite(COUNTER_PATH, { last: 0 });
if(!fs.existsSync(TICKETS_PATH)) safeWrite(TICKETS_PATH, []);

if(!cfg.ticketEmbed){
  cfg.ticketEmbed = {
    title: '🎫 Ticket #{ticketNumber}',
    description: 'Hallo {userMention}\n**Thema:** {topicLabel}',
    color: '#2b90d9',
    footer: 'Ticket #{ticketNumber}'
  };
}

/* ================= Express / Panel ================= */
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

/* ================= Counter ================= */
function nextTicket(){ const c = safeRead(COUNTER_PATH,{last:0}); c.last++; safeWrite(COUNTER_PATH,c); return c.last; }

/* ================= Buttons ================= */
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

/* ================= Panel Select Builder (Reset) ================= */
function buildPanelSelect(cfg){
  const { StringSelectMenuBuilder } = require('discord.js');
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions((cfg.topics||[]).map(t => ({ label:t.label, value:t.value, emoji: t.emoji || undefined })))
  );
}

/* ================= Slash Commands ================= */
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    { body: [ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON() ] }
  );
  console.log(`🤖 ${client.user.tag} bereit`);
});

/* ================= Ticket Embed Builder ================= */
function buildTicketEmbedData(i, topic, nr){
  cfg = safeRead(CFG_PATH, cfg);
  const tData = cfg.ticketEmbed || {};
  const title = (tData.title||'').replace(/\{ticketNumber\}/g,nr).replace(/\{topicLabel\}/g,topic.label).replace(/\{topicValue\}/g,topic.value);
  const desc  = (tData.description||'')
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id)
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{ticketNumber\}/g, nr);
  const footer= (tData.footer||'')
    .replace(/\{ticketNumber\}/g, nr)
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value);

  const embed = new EmbedBuilder().setTitle(title||'🎫 Ticket').setDescription(desc||`<@${i.user.id}>`).setColor(0x2b90d9);
  if(tData.color && /^#?[0-9a-fA-F]{6}$/.test(tData.color)) embed.setColor(parseInt(tData.color.replace('#',''),16));
  if(footer) embed.setFooter({ text: footer });
  return embed;
}

/* ================= Channel Name Helper ================= */
function buildChannelName(ticketNumber, priorityIndex){
  const num = ticketNumber.toString().padStart(5,'0');
  const state = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  return `${PREFIX}${state.dot}ticket-${num}`;
}
function renameChannelIfNeeded(channel, ticket){
  const desired = buildChannelName(ticket.id, ticket.priority||0);
  if(channel.name !== desired){
    return channel.setName(desired).catch(()=>{});
  }
}

/* ================= Priority Visual Update ================= */
async function handlePriorityVisuals(interaction, ticket, log){
  renameChannelIfNeeded(interaction.channel, ticket);
  const msg = await interaction.channel.messages.fetch({limit:10}).then(c=>c.find(m=>m.embeds.length));
  const state = PRIORITY_STATES[ticket.priority||0] || PRIORITY_STATES[0];
  if(msg){
    const e = EmbedBuilder.from(msg.embeds[0]);
    e.setColor(state.embedColor);
    await msg.edit({ embeds:[e] });
  } else {
    await interaction.channel.send(`Priorität jetzt: **${state.label}**`);
  }
  safeWrite(TICKETS_PATH, log);
  await interaction.reply({ephemeral:true,content:`Priorität: ${state.label}`});
}

/* ================= Interaction Handling ================= */
client.on(Events.InteractionCreate, async i => {
  try {
    // /dashboard
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({
        components:[ new ActionRowBuilder().addComponents(
          new ButtonBuilder().setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard')
        )],
        ephemeral:true
      });
    }

    // Themen-Auswahl
    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = (cfg.topics||[]).find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema',ephemeral:true});

      const nr = nextTicket();
      const ch = await i.guild.channels.create({
        name: buildChannelName(nr,0),
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

      // Loggen
      const log = safeRead(TICKETS_PATH, []);
      log.push({ id:nr, channelId:ch.id, userId:i.user.id, topic:topic.value, status:'offen', priority:0, timestamp:Date.now() });
      safeWrite(TICKETS_PATH, log);

      await i.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });

      // Panel Nachricht zurücksetzen (Select ohne Auswahl)
      try {
        const freshRow = buildPanelSelect(cfg);
        if(cfg.panelEmbed){
          const p = cfg.panelEmbed;
          const pe = new EmbedBuilder().setTitle(p.title||'🎟️ Ticket erstellen').setDescription(p.description||'Wähle unten dein Thema aus.');
          if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)) pe.setColor(parseInt(p.color.replace('#',''),16));
          if(p.footer) pe.setFooter({ text:p.footer });
          await i.message.edit({ embeds:[pe], components:[freshRow] });
        } else {
          await i.message.edit({ components:[freshRow] });
        }
      } catch(e){ console.error('Panel Reset Fehler:', e); }
      return;
    }

    // Buttons
    if(i.isButton()){
      const log = safeRead(TICKETS_PATH, []);
      const ticket = log.find(t=>t.channelId===i.channel?.id);
      if(!ticket) return i.reply({ephemeral:true,content:'Kein Ticket-Datensatz gefunden.'});

      const isTeam = i.member.roles.cache.has(TEAM_ROLE);

      if(i.customId==='request_close'){
        await i.channel.send({
          content:`❓ Schließungsanfrage von <@${i.user.id}> <@&${TEAM_ROLE}>`,
          components:[ new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('team_close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger)
          )]
        });
        return i.reply({ephemeral:true,content:'Schließungsanfrage gesendet'});
      }

      // Rest nur Team
      if(!isTeam) return i.reply({ephemeral:true,content:'Nur Team darf diesen Button verwenden'});

      switch(i.customId){
        case 'team_close':
        case 'close':
          ticket.status='geschlossen';
          safeWrite(TICKETS_PATH, log);
          await i.channel.send(`🔒 Ticket geschlossen von <@${i.user.id}> <@&${TEAM_ROLE}>`);
          return i.channel.delete();
        case 'claim':
          ticket.claimer = i.user.id;
          await i.update({components:buttonRows(true)});
          break;
        case 'unclaim':
          delete ticket.claimer;
          await i.update({components:buttonRows(false)});
          break;
        case 'priority_up':
          ticket.priority = Math.min(2,(ticket.priority||0)+1);
          await handlePriorityVisuals(i, ticket, log);
          return; // schon geantwortet
        case 'priority_down':
          ticket.priority = Math.max(0,(ticket.priority||0)-1);
          await handlePriorityVisuals(i, ticket, log);
          return;
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

    // Modal: Nutzer hinzufügen
    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team'});
      const raw = i.fields.getTextInputValue('user').trim();
      const cleaned = raw.replace(/<@!?|>/g,'');
      const uidMatch = cleaned.match(/\d{17,20}/);
      const uid = uidMatch ? uidMatch[0] : null;
      if(!uid) return i.reply({ephemeral:true,content:'Ungültige ID / Mention'});
      try {
        await i.guild.members.fetch(uid); // Validate
        if(i.channel.permissionOverwrites.cache.get(uid))
          return i.reply({ephemeral:true,content:'User hat bereits Zugriff'});
        await i.channel.permissionOverwrites.edit(uid,{ViewChannel:true,SendMessages:true});
        await i.reply({ephemeral:true,content:`<@${uid}> hinzugefügt`});
      } catch(err){
        console.error('AddUser Fehler', err);
        return i.reply({ephemeral:true,content:'Fehler beim Hinzufügen'});
      }
    }
  } catch(err){
    console.error(err);
    if(!i.replied && !i.deferred) i.reply({ephemeral:true,content:'Fehler'});
  }
});

/* ================= Login ================= */
client.login(TOKEN);
