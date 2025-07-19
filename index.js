// --- index.js | Ticket‑Bot v6.4 (Verbessert: Logging, sichere Luxon-Erkennung, Fehler-Handling) ---
// Änderungen ggü. deiner aktuellen v6.3 Version:
//  * /dashboard Button URL auf endgültige Domain (https://trstickets.theredstonee.de/panel)
//  * Luxon optional sicher (kein doppelter require)
//  * Kleinere Robustheit bei Datei-IO (Fallback bei defekten JSON)
//  * Konsolidierte Funktionen + Kommentare bereinigt
//  * PRIORITY_STATES + Channel-Rename beibehalten
//  * Transcript-Erstellung unverändert, aber Fehler Logging präziser
//  * Panel-Dropdown Reset unverändert
//  * Add User Modal & Team-Rechte beibehalten
//  * PANEL_HOST nicht mehr mit "http://" vermischt – direkt Domain nutzen
//  * Falls cfg.panelEmbed fehlt, wird nur das Select aktualisiert

require('dotenv').config();

/* =============== Imports =============== */
const path = require('path');
const fs   = require('fs');
const express = require('express');
let luxonAvailable=false; let DateTime=null; try { ({ DateTime } = require('luxon')); luxonAvailable=true; } catch {}
const {
  Client, GatewayIntentBits, Partials,
  Routes, REST, SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, Events, AttachmentBuilder
} = require('discord.js');

/* =============== Konstanten =============== */
const TEAM_ROLE = '1387525699908272218';
const PREFIX    = '🎫│';
const PRIORITY_STATES = [
  { dot:'🟢', embedColor:0x2bd94a, label:'Grün' },
  { dot:'🟠', embedColor:0xff9900, label:'Orange' },
  { dot:'🔴', embedColor:0xd92b2b, label:'Rot' }
];

/* =============== Pfade =============== */
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');

/* =============== Safe JSON Helpers =============== */
function safeRead(file, fallback){
  try {
    const raw = fs.readFileSync(file,'utf8');
    if(!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function safeWrite(file, data){
  try { fs.writeFileSync(file, JSON.stringify(data,null,2)); } catch(e){ console.error('Write Fehler', file, e); }
}

let cfg = safeRead(CFG_PATH, {});
if(!fs.existsSync(COUNTER_PATH)) safeWrite(COUNTER_PATH,{ last:0 });
if(!fs.existsSync(TICKETS_PATH)) safeWrite(TICKETS_PATH,[]);
if(!cfg.ticketEmbed){ cfg.ticketEmbed = { title:'🎫 Ticket #{ticketNumber}', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' }; }

/* =============== Express / Panel =============== */
const app = express();
app.set('trust proxy',1); // wichtig hinter Cloudflare Tunnel
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended:true }));
app.use(express.static('public'));

const client = new Client({ intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages], partials:[Partials.Channel, Partials.Message] });
app.use('/', require('./panel')(client));
app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));

const TOKEN = process.env.DISCORD_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_BASE_URL || process.env.PANEL_URL || 'trstickets.theredstonee.de';

/* =============== Counter =============== */
function nextTicket(){ const c = safeRead(COUNTER_PATH,{last:0}); c.last++; safeWrite(COUNTER_PATH,c); return c.last; }

/* =============== Panel Select =============== */
function buildPanelSelect(cfg){
  const { StringSelectMenuBuilder } = require('discord.js');
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
  );
}

/* =============== Button Rows =============== */
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

/* =============== Slash Commands =============== */
client.once('ready', async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, cfg.guildId),
      { body: [ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON() ] }
    );
    console.log(`🤖 ${client.user.tag} bereit`);
  } catch(e){ console.error('Slash Deploy Fehler', e); }
});

/* =============== Ticket Embed Builder =============== */
function buildTicketEmbedData(i, topic, nr){
  cfg = safeRead(CFG_PATH, cfg);
  if(!cfg.ticketEmbed) cfg.ticketEmbed = { title:'🎫 Ticket #{ticketNumber}', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' };
  const tData = cfg.ticketEmbed;
  const rep = (s='')=> s
    .replace(/\{ticketNumber\}/g, nr.toString())
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id);
  const embed = new EmbedBuilder()
    .setTitle(rep(tData.title)||'🎫 Ticket')
    .setDescription(rep(tData.description)||`<@${i.user.id}>`);
  if(tData.color && /^#?[0-9a-fA-F]{6}$/.test(tData.color)) embed.setColor(parseInt(tData.color.replace('#',''),16));
  if(tData.footer) embed.setFooter({ text: rep(tData.footer) });
  return embed;
}

/* =============== Channel Name Helpers =============== */
function buildChannelName(ticketNumber, priorityIndex){
  const num = ticketNumber.toString().padStart(5,'0');
  const state = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  return `${PREFIX}${state.dot}ticket-${num}`;
}
function renameChannelIfNeeded(channel, ticket){
  const desired = buildChannelName(ticket.id, ticket.priority||0);
  if(channel.name !== desired){ channel.setName(desired).catch(()=>{}); }
}

/* =============== Logging Helper =============== */
async function logEvent(guild, content){
  if(!cfg.logChannelId) return;
  try { const ch = await guild.channels.fetch(cfg.logChannelId); if(ch) await ch.send({ content }); } catch(e){ console.error('LogEvent Fehler', e); }
}

/* =============== Transcript =============== */
async function createTranscript(channel, ticket){
  let messages=[]; let lastId; let loops=0;
  while(messages.length < 1000 && loops < 30){
    const fetched = await channel.messages.fetch({ limit:100, before:lastId }).catch(()=>null);
    if(!fetched || fetched.size===0) break;
    messages.push(...fetched.values());
    lastId = fetched.last().id; loops++;
  }
  messages.sort((a,b)=>a.createdTimestamp - b.createdTimestamp);

  const plain = messages.map(m=>{
    const t = luxonAvailable ? DateTime.fromMillis(m.createdTimestamp).setZone('Europe/Berlin').toFormat('yyyy-LL-dd HH:mm:ss') : new Date(m.createdTimestamp).toISOString();
    const base = `[${t}] ${(m.author?.tag)||m.author?.id||'Unbekannt'}: ${(m.content||'').replace(/\n/g,'\\n')}`;
    const atts = m.attachments.size ? [...m.attachments.values()].map(a=>` [Anhang ${a.name} ${a.url}]`).join('') : '';
    return base + atts;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript Ticket ${ticket.id}</title>
<style>body{font-family:Arial; background:#111; color:#ddd;} .msg{margin:4px 0;} .time{color:#888;font-size:11px;margin-right:6px;} .author{color:#4ea1ff;font-weight:bold;margin-right:4px;} .attach{color:#ffa500;font-size:11px;display:block;margin-left:2rem;}</style></head><body>
<h1>Transcript Ticket ${ticket.id}</h1>
<p>Channel: ${channel.name}<br>Erstellt: ${new Date(ticket.timestamp).toISOString()}<br>Messages: ${messages.length}</p><hr>
${messages.map(m=>{
  const t = luxonAvailable ? DateTime.fromMillis(m.createdTimestamp).setZone('Europe/Berlin').toFormat('yyyy-LL-dd HH:mm:ss') : new Date(m.createdTimestamp).toISOString();
  const atts = m.attachments.size ? [...m.attachments.values()].map(a=>`<span class=\"attach\">📎 <a href=\"${a.url}\">${a.name}</a></span>`).join('') : '';
  return `<div class=msg><span class=time>${t}</span><span class=author>${(m.author?.tag)||m.author?.id}</span><span class=content>${(m.content||'').replace(/</g,'&lt;')}</span>${atts}</div>`;
}).join('\n')}
</body></html>`;

  const txtPath  = path.join(__dirname,`transcript_${ticket.id}.txt`);
  const htmlPath = path.join(__dirname,`transcript_${ticket.id}.html`);
  fs.writeFileSync(txtPath, plain);
  fs.writeFileSync(htmlPath, html);
  return { txt:new AttachmentBuilder(txtPath), html:new AttachmentBuilder(htmlPath) };
}

/* =============== Interactions =============== */
client.on(Events.InteractionCreate, async i => {
  try {
    // /dashboard
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({ components:[ new ActionRowBuilder().addComponents( new ButtonBuilder().setURL(`https://${PUBLIC_URL}/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard') ) ], ephemeral:true });
    }

    // Thema Auswahl
    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = cfg.topics?.find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({ephemeral:true,content:'Unbekanntes Thema'});
      const nr = nextTicket();
      const channel = await i.guild.channels.create({
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
      await channel.send({ embeds:[embed], components: buttonRows(false) });
      i.reply({ content:`Ticket erstellt: ${channel}`, ephemeral:true });
      const log = safeRead(TICKETS_PATH, []); log.push({ id:nr, channelId:channel.id, userId:i.user.id, topic:topic.value, status:'offen', priority:0, timestamp:Date.now() }); safeWrite(TICKETS_PATH, log);
      logEvent(i.guild, `🆕 Ticket #${nr} erstellt von <@${i.user.id}> (Thema: ${topic.label})`);

      // Panel zurücksetzen
      try {
        const row = buildPanelSelect(cfg);
        if(cfg.panelEmbed){
          const p = cfg.panelEmbed; const pEmbed = new EmbedBuilder().setTitle(p.title||'🎟️ Ticket erstellen').setDescription(p.description||'Wähle unten dein Thema aus.');
          if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)) pEmbed.setColor(parseInt(p.color.replace('#',''),16));
          if(p.footer) pEmbed.setFooter({ text:p.footer });
          await i.message.edit({ embeds:[pEmbed], components:[row] });
        } else {
          await i.message.edit({ components:[row] });
        }
      } catch{}
      return;
    }

    // Buttons
    if(i.isButton()){
      const log = safeRead(TICKETS_PATH, []);
      const ticket = log.find(t=>t.channelId===i.channel.id);
      if(!ticket) return i.reply({ephemeral:true,content:'Kein Ticket-Datensatz'});
      const isTeam = i.member.roles.cache.has(TEAM_ROLE);

      if(i.customId==='request_close'){
        await i.channel.send({ content:`❓ Schließungsanfrage von <@${i.user.id}> <@&${TEAM_ROLE}>`, components:[ new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId('team_close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger) ) ] });
        logEvent(i.guild, `❓ Schließungsanfrage Ticket #${ticket.id} von <@${i.user.id}>`);
        return i.reply({ephemeral:true,content:'Anfrage gesendet'});
      }

      if(!isTeam) return i.reply({ephemeral:true,content:'Nur Team darf diesen Button nutzen'});

      switch(i.customId){
        case 'team_close':
        case 'close': {
          ticket.status='geschlossen'; safeWrite(TICKETS_PATH, log);
          await i.reply({ephemeral:true,content:'Ticket wird geschlossen…'});
          await i.channel.send(`🔒 Ticket geschlossen von <@${i.user.id}> <@&${TEAM_ROLE}>`);
          let attachments=null; try { attachments = await createTranscript(i.channel, ticket); } catch(e){ console.error('Transcript Fehler', e); }
          const transcriptChannelId = cfg.transcriptChannelId || cfg.logChannelId;
          if(transcriptChannelId && attachments){
            try {
              const tCh = await i.guild.channels.fetch(transcriptChannelId);
              if(tCh) await tCh.send({ content:`📁 Transcript Ticket #${ticket.id}`, files:[attachments.txt, attachments.html] });
            } catch(e){ console.error('Transcript Upload Fehler', e); }
          }
          logEvent(i.guild, `🔒 Ticket #${ticket.id} geschlossen von <@${i.user.id}>`);
          setTimeout(()=>{ i.channel.delete().catch(()=>{}); }, 2500);
          return;
        }
        case 'claim':
          ticket.claimer = i.user.id; safeWrite(TICKETS_PATH, log);
          await i.update({ components: buttonRows(true) });
          logEvent(i.guild, `✅ Ticket #${ticket.id} claimed von <@${i.user.id}>`);
          break;
        case 'unclaim':
          delete ticket.claimer; safeWrite(TICKETS_PATH, log);
          await i.update({ components: buttonRows(false) });
          logEvent(i.guild, `🔄 Ticket #${ticket.id} unclaimed von <@${i.user.id}>`);
          break;
        case 'priority_up':
          ticket.priority = Math.min(2,(ticket.priority||0)+1); await updatePriority(interaction=i, ticket, log, 'hoch');
          break;
        case 'priority_down':
          ticket.priority = Math.max(0,(ticket.priority||0)-1); await updatePriority(interaction=i, ticket, log, 'herab');
          break;
        case 'add_user': {
          const modal = new ModalBuilder().setCustomId('modal_add_user').setTitle('Nutzer hinzufügen');
          modal.addComponents(new ActionRowBuilder().addComponents( new TextInputBuilder().setCustomId('user').setLabel('User @ oder ID').setRequired(true).setStyle(TextInputStyle.Short) ));
          return i.showModal(modal);
        }
      }
    }

    // Modal Add User
    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team'});
      const raw = i.fields.getTextInputValue('user').trim();
      const id = (raw.replace(/<@!?|>/g,'').match(/\d{17,20}/)||[])[0];
      if(!id) return i.reply({ephemeral:true,content:'Ungültige ID / Mention'});
      try {
        await i.guild.members.fetch(id);
        if(i.channel.permissionOverwrites.cache.get(id)) return i.reply({ephemeral:true,content:'User hat schon Zugriff'});
        await i.channel.permissionOverwrites.edit(id,{ ViewChannel:true, SendMessages:true });
        await i.reply({ephemeral:true,content:`<@${id}> hinzugefügt`});
        logEvent(i.guild, `➕ User <@${id}> zu Ticket #${safeRead(TICKETS_PATH,[]).find(t=>t.channelId===i.channel.id)?.id||'?'} hinzugefügt`);
      } catch(e){ console.error('AddUser Fehler', e); return i.reply({ephemeral:true,content:'Fehler beim Hinzufügen'}); }
    }
  } catch(e){ console.error('Interaction Fehler', e); if(!i.replied && !i.deferred) i.reply({ephemeral:true,content:'Fehler'}); }
});

/* =============== Priority Visual Update =============== */
async function updatePriority(interaction, ticket, log, dir){
  renameChannelIfNeeded(interaction.channel, ticket);
  const msg = await interaction.channel.messages.fetch({limit:10}).then(c=>c.find(m=>m.embeds.length)).catch(()=>null);
  const state = PRIORITY_STATES[ticket.priority||0];
  if(msg){ const e = EmbedBuilder.from(msg.embeds[0]); e.setColor(state.embedColor); await msg.edit({ embeds:[e] }); }
  safeWrite(TICKETS_PATH, log);
  logEvent(interaction.guild, `⚙️ Ticket #${ticket.id} Priorität ${dir}: **${state.label}**`);
  await interaction.reply({ephemeral:true,content:`Priorität: ${state.label}`});
}

client.login(TOKEN);
