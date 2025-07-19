// --- index.js | Ticket‑Bot v6.5 (Captcha vor Ticket-Erstellung + bestehende Features) ---
// Features Ergänzung:
//  * Mathe-Captcha Modal vor Ticket-Erstellung (konfigurierbar via .env)
//  * Alle bisherigen Funktionen aus deiner v6.3 (Priorität, Claim, Transcript, Panel-Reset ...)
//  * Sauber integrierbar ohne Änderungen am Panel
//  * Falls CAPTCHA_ENABLED != true -> komplett deaktiviert
//
// .env Optionen:
//   CAPTCHA_ENABLED=true
//   CAPTCHA_MIN=5
//   CAPTCHA_MAX=25
//   CAPTCHA_TIMEOUT_MS=180000
//
// Ticket-Erstellungsflow (bei aktivem Captcha):
//   User wählt Thema -> Captcha Modal -> prüft Lösung -> bei Erfolg Ticket erstellt, sonst Fehlermeldung.

require('dotenv').config();

/* ================= Imports ================= */
const path = require('path');
const fs   = require('fs');
const express = require('express');
let luxonAvailable = false; let DateTime = null; try { ({ DateTime } = require('luxon')); luxonAvailable = true; } catch {}

const {
  Client, GatewayIntentBits, Partials,
  Routes, REST, SlashCommandBuilder,
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, Events, AttachmentBuilder, StringSelectMenuBuilder
} = require('discord.js');

/* ================= Konstanten ================= */
const TEAM_ROLE = '1387525699908272218';         // Support / Team Rolle
const PREFIX    = '🎫│';
const PRIORITY_STATES = [
  { dot: '🟢', embedColor: 0x2bd94a, label: 'Grün'   },
  { dot: '🟠', embedColor: 0xff9900, label: 'Orange' },
  { dot: '🔴', embedColor: 0xd92b2b, label: 'Rot'    }
];

/* Captcha Konfiguration */
const CAPTCHA_ENABLED     = (process.env.CAPTCHA_ENABLED||'').toLowerCase()==='true';
const CAPTCHA_MIN         = parseInt(process.env.CAPTCHA_MIN||'5',10);
const CAPTCHA_MAX         = parseInt(process.env.CAPTCHA_MAX||'25',10);
const CAPTCHA_TIMEOUT_MS  = parseInt(process.env.CAPTCHA_TIMEOUT_MS||'180000',10); // 3 min

/* ================= Pfade / Dateien ================= */
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');

/* ================= Safe JSON Helpers ================= */
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
app.set('trust proxy', 1);
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended:true }));
app.use(express.static('public'));

const client = new Client({ intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages], partials:[Partials.Channel, Partials.Message] });
app.use('/', require('./panel')(client));
app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));

const TOKEN      = process.env.DISCORD_TOKEN;
const PANEL_HOST = process.env.PANEL_URL || 'localhost:3000';

/* ================= Counter ================= */
function nextTicket(){ const c=safeRead(COUNTER_PATH,{last:0}); c.last++; safeWrite(COUNTER_PATH,c); return c.last; }

/* ================= Button Rows ================= */
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

/* ================= Panel Select Builder ================= */
function buildPanelSelect(){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
  );
}

/* ================= Slash Command Deploy ================= */
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    { body: [ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON() ] }
  );
  console.log(`🤖 ${client.user.tag} bereit`);
});

/* ================= Embed Builder ================= */
function buildTicketEmbedData(i, topic, nr){
  cfg = safeRead(CFG_PATH, cfg);
  if(!cfg.ticketEmbed){ cfg.ticketEmbed = { title:'🎫 Ticket #{ticketNumber}', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' }; }
  const tData = cfg.ticketEmbed;
  const rep = (str='')=>str
    .replace(/\{ticketNumber\}/g, nr.toString())
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id);
  const embed = new EmbedBuilder().setTitle(rep(tData.title)||'🎫 Ticket').setDescription(rep(tData.description)||`<@${i.user.id}>`);
  if(tData.color && /^#?[0-9a-fA-F]{6}$/.test(tData.color)) embed.setColor(parseInt(tData.color.replace('#',''),16));
  if(tData.footer) embed.setFooter({ text: rep(tData.footer) });
  return embed;
}

/* ================= Channel Name Helpers ================= */
function buildChannelName(ticketNumber, priorityIndex){
  const num = ticketNumber.toString().padStart(5,'0');
  const state = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  return `${PREFIX}${state.dot}ticket-${num}`;
}
function renameChannelIfNeeded(channel, ticket){
  const desired = buildChannelName(ticket.id, ticket.priority||0);
  if(channel.name !== desired){ return channel.setName(desired).catch(()=>{}); }
}

/* ================= Logging ================= */
async function logEvent(guild, content){
  if(!cfg.logChannelId) return; // optional
  try { const ch = await guild.channels.fetch(cfg.logChannelId); if(!ch) return; await ch.send({ content }); } catch(err){ console.error('Log Fehler:', err); }
}

/* ================= Transcript Erstellung ================= */
async function createTranscript(channel, ticket){
  let messages = []; let lastId;
  while(messages.length < 1000){
    const fetched = await channel.messages.fetch({ limit:100, before:lastId }).catch(()=>null);
    if(!fetched || fetched.size===0) break;
    messages.push(...fetched.values());
    lastId = fetched.last().id;
  }
  messages = messages.sort((a,b)=>a.createdTimestamp - b.createdTimestamp);
  const lines = [];
  lines.push(`# Transcript für Ticket ${ticket.id}`);
  lines.push(`Channel: ${channel.name}`);
  lines.push(`Erstellt: ${new Date(ticket.timestamp).toISOString()}`); lines.push('');
  for(const m of messages){
    const time = luxonAvailable? DateTime.fromMillis(m.createdTimestamp).toISO() : new Date(m.createdTimestamp).toISOString();
    const author = `${m.author?.tag||m.author?.id||'Unbekannt'}`;
    const content = (m.content||'').replace(/\n/g,'\\n');
    lines.push(`[${time}] ${author}: ${content}`);
    if(m.attachments.size) m.attachments.forEach(att=>lines.push(`  [Anhang] ${att.name} -> ${att.url}`));
  }
  const plainText = lines.join('\n');
  const html = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>Transcript Ticket ${ticket.id}</title><style>body{font-family:Arial;background:#111;color:#eee}.msg{margin:4px 0}.time{color:#888;font-size:11px;margin-right:6px}.author{color:#4ea1ff;font-weight:bold;margin-right:4px}.attach{color:#ffa500;font-size:11px;display:block;margin-left:2rem}</style></head><body><h1>Transcript Ticket ${ticket.id}</h1>${messages.map(m=>{const atts=m.attachments.size?[...m.attachments.values()].map(a=>`<span class='attach'>📎 <a href='${a.url}'>${a.name}</a></span>`).join(''):''; return `<div class='msg'><span class='time'>${new Date(m.createdTimestamp).toISOString()}</span><span class='author'>${m.author?.tag||m.author?.id}</span><span>${(m.content||'').replace(/</g,'&lt;')}</span>${atts}</div>`;}).join('')}</body></html>`;
  const tTxt=path.join(__dirname,`transcript_${ticket.id}.txt`);
  const tHtml=path.join(__dirname,`transcript_${ticket.id}.html`);
  fs.writeFileSync(tTxt,plainText); fs.writeFileSync(tHtml,html);
  return { txt: tTxt, html: tHtml };
}

/* ================= Captcha Speicher ================= */
const pendingCaptcha = new Map(); // key: userId, value: { answer, topicValue, created }

function createCaptcha(){
  const a = Math.floor(Math.random()*(CAPTCHA_MAX-CAPTCHA_MIN+1))+CAPTCHA_MIN;
  const b = Math.floor(Math.random()*(CAPTCHA_MAX-CAPTCHA_MIN+1))+CAPTCHA_MIN;
  return { a, b, answer: a + b };
}

function cleanupCaptcha(){
  const now = Date.now();
  for(const [uid,obj] of pendingCaptcha.entries()){
    if(now - obj.created > CAPTCHA_TIMEOUT_MS) pendingCaptcha.delete(uid);
  }
}
setInterval(cleanupCaptcha, 30000);

/* ================= Interactions ================= */
client.on(Events.InteractionCreate, async i => {
  try {
    /* /dashboard */
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({
        components:[ new ActionRowBuilder().addComponents(
          new ButtonBuilder().setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard')
        )],
        ephemeral:true
      });
    }

    /* Thema Auswahl */
    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = cfg.topics?.find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema',ephemeral:true});

      if(CAPTCHA_ENABLED){
        const { a, b, answer } = createCaptcha();
        pendingCaptcha.set(i.user.id, { answer, topicValue: topic.value, created: Date.now() });
        const modal = new ModalBuilder().setCustomId('captcha_modal').setTitle('Captcha Bestätigung');
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('captcha_answer').setLabel(`Was ist ${a} + ${b}?`).setStyle(TextInputStyle.Short).setRequired(true)
        ));
        return i.showModal(modal);
      } else {
        await createTicket(i, topic);
        return;
      }
    }

    /* Captcha Modal */
    if(i.isModalSubmit() && i.customId==='captcha_modal'){
      const stored = pendingCaptcha.get(i.user.id);
      if(!stored){ return i.reply({ephemeral:true,content:'Captcha abgelaufen. Bitte Thema erneut wählen.'}); }
      const val = i.fields.getTextInputValue('captcha_answer').trim();
      if(parseInt(val,10) !== stored.answer){
        pendingCaptcha.delete(i.user.id);
        return i.reply({ephemeral:true,content:'Falsches Ergebnis. Bitte noch einmal versuchen.'});
      }
      // Erfolg -> Ticket erstellen
      const topic = cfg.topics.find(t=>t.value===stored.topicValue);
      pendingCaptcha.delete(i.user.id);
      if(!topic) return i.reply({ephemeral:true,content:'Thema nicht mehr vorhanden.'});
      await createTicket(i, topic);
      return;
    }

    /* Buttons */
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
          let files=null; try { files = await createTranscript(i.channel, ticket); } catch(err){ console.error('Transcript Fehler', err); }
          const transcriptChannelId = cfg.transcriptChannelId || cfg.logChannelId;
          if(transcriptChannelId && files){ try { const tCh=await i.guild.channels.fetch(transcriptChannelId); tCh && tCh.send({ content:`📁 Transcript Ticket #${ticket.id}`, files:[files.txt, files.html] }); } catch(e){} }
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
        case 'priority_up': {
          ticket.priority = Math.min(2, (ticket.priority||0)+1);
          await handlePriorityVisuals(i, ticket, log, 'hoch');
          break;
        }
        case 'priority_down': {
          ticket.priority = Math.max(0, (ticket.priority||0)-1);
          await handlePriorityVisuals(i, ticket, log, 'herab');
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
    }

    /* Modal Submit Add User */
    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team'});
      const raw = i.fields.getTextInputValue('user').trim();
      const id = (raw.replace(/<@!?|>/g,'').match(/\d{17,20}/)||[])[0];
      if(!id) return i.reply({ephemeral:true,content:'Ungültige ID / Mention'});
      try {
        await i.guild.members.fetch(id);
        if(i.channel.permissionOverwrites.cache.get(id))
          return i.reply({ephemeral:true,content:'User hat schon Zugriff'});
        await i.channel.permissionOverwrites.edit(id,{ ViewChannel:true, SendMessages:true });
        await i.reply({ephemeral:true,content:`<@${id}> hinzugefügt`});
        logEvent(i.guild, `➕ User <@${id}> zu Ticket #${safeRead(TICKETS_PATH,[]).find(t=>t.channelId===i.channel.id)?.id || '?'} hinzugefügt`);
      } catch(err){
        console.error(err);
        return i.reply({ephemeral:true,content:'Fehler beim Hinzufügen'});
      }
    }

  } catch(err){
    console.error(err);
    if(!i.replied && !i.deferred) i.reply({ephemeral:true,content:'Fehler'});
  }
});

/* ================= Priority Visuals ================= */
async function handlePriorityVisuals(interaction, ticket, log, direction){
  renameChannelIfNeeded(interaction.channel, ticket);
  const msg = await interaction.channel.messages.fetch({limit:10}).then(col=>col.find(m=>m.embeds.length)).catch(()=>null);
  const state = PRIORITY_STATES[ticket.priority||0];
  if(msg){
    const e = EmbedBuilder.from(msg.embeds[0]);
    e.setColor(state.embedColor);
    await msg.edit({ embeds:[e] });
  }
  safeWrite(TICKETS_PATH, log);
  logEvent(interaction.guild, `⚙️ Ticket #${ticket.id} Priorität ${direction}: **${state.label}**`);
  await interaction.reply({ephemeral:true,content:`Priorität: ${state.label}`});
}

/* ================= Ticket Erstellung Helper (für Captcha + Direkt) ================= */
async function createTicket(interaction, topic){
  const nr = nextTicket();
  const ch = await interaction.guild.channels.create({
    name: buildChannelName(nr,0),
    type: ChannelType.GuildText,
    parent: cfg.ticketCategoryId,
    permissionOverwrites:[
      { id:interaction.guild.id, deny: PermissionsBitField.Flags.ViewChannel },
      { id:interaction.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id:TEAM_ROLE, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });
  const embed = buildTicketEmbedData(interaction, topic, nr);
  await ch.send({ embeds:[embed], components: buttonRows(false) });
  interaction.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });
  const log = safeRead(TICKETS_PATH, []);
  log.push({ id:nr, channelId:ch.id, userId:interaction.user.id, topic:topic.value, status:'offen', priority:0, timestamp:Date.now() });
  safeWrite(TICKETS_PATH, log);
  logEvent(interaction.guild, `🆕 Ticket **#${nr}** erstellt von <@${interaction.user.id}> (Thema: ${topic.label})`);
}

client.login(TOKEN);
