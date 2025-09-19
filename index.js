// --- index.js | Ticket‑Bot v6.4 (Channelname Priority-Fix + Dynamische Formulare) ---
// Neue Features ggü. deiner v6.3.2 FINAL:
//  ✅ Dynamische Formular-Felder pro Topic (Modal bevor Channel erstellt wird)
//  ✅ Formular-Konfiguration über config.json (cfg.formFields)
//  ✅ Unterstützt bis zu 5 Felder (Discord Limit) – überschüssige werden ignoriert
//  ✅ Felder können global oder topicspezifisch sein
//  ✅ Erfasste Antworten werden dem Ticket-Embed als Felder hinzugefügt
//  ✅ Speicherung der ausgefüllten Werte in tickets.json unter ticket.formData
//  ✅ Channelname Priority-Fix (Rename Queue) unverändert beibehalten
//
//  Konfiguration (config.json -> formFields Beispiel):
//  "formFields": [
//     { "label": "Wie heißt du in Minecraft?", "id": "mcname", "style": "short", "required": true },
//     { "label": "Welcher Dienst ist betroffen?", "id": "service", "style": "short", "required": true },
//     { "label": "Beschreibe dein Anliegen", "id": "beschreibung", "style": "paragraph", "required": true },
//     { "label": "Event ID (nur für event)", "id": "eventid", "style": "short", "required": false, "topic": "event" }
//  ]
//  Felder mit "topic" erscheinen nur für dieses Topic. Ohne "topic" = für alle Topics.
//  Optional kann "topic" auch ein Array sein: "topic": ["bug","server"].
//  style: "short" oder "paragraph". required: true/false. "id" optional (sonst auto f0,f1,...).
//
//  WICHTIG: Beim Auswählen eines Topics öffnet sich zuerst das Formular (falls Felder vorhanden). Erst nach Absenden wird der Channel erstellt.
//
//  Nur Code rund um Formulare wurde zusätzlich eingefügt.

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
  PermissionsBitField, ChannelType, Events, AttachmentBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

/* ================= Konstanten ================= */
const TEAM_ROLE = '1387525699908272218';           // Team Rolle
const PREFIX    = '🎫│';                           // Präfix vor Ticket Channels
const PRIORITY_STATES = [
  { dot: '🟢', embedColor: 0x2bd94a, label: 'Grün'   },
  { dot: '🟠', embedColor: 0xff9900, label: 'Orange' },
  { dot: '🔴', embedColor: 0xd92b2b, label: 'Rot'    }
];

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
app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));
app.use(express.urlencoded({ extended:true }));
app.use(express.static('public')); // für CSS/JS

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers   // <-- hinzufügen
  ],
  partials: [Partials.Channel, Partials.Message]
});
app.set('trust proxy', 1);
app.use('/', require('./panel')(client));
app.listen(3000, ()=>console.log('🌐 Panel listening on :3000'));

const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_FIXED_URL = 'https://trstickets.theredstonee.de/panel';

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

/* ================= Panel Select ================= */
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

/* ================= Ticket Embed Builder ================= */
function buildTicketEmbed(i, topic, nr){
  cfg = safeRead(CFG_PATH, cfg);
  const t = cfg.ticketEmbed;
  const rep = s => (s||'')
    .replace(/\{ticketNumber\}/g, nr)
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id);
  const e = new EmbedBuilder().setTitle(rep(t.title) || '🎫 Ticket').setDescription(rep(t.description) || `<@${i.user.id}>`);
  if(t.color && /^#?[0-9a-fA-F]{6}$/.test(t.color)) e.setColor(parseInt(t.color.replace('#',''),16));
  if(t.footer) e.setFooter({ text: rep(t.footer) });
  return e;
}

/* ================= Channel Name Helpers (FIX mit Queue) ================= */
function buildChannelName(ticketNumber, priorityIndex){
  const num = ticketNumber.toString().padStart(5,'0');
  const st  = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  return `${PREFIX}${st.dot}ticket-${num}`;
}
// Debounce + Queue
const renameQueue = new Map(); // channelId -> { desiredName, timer, lastApplied }
const RENAME_MIN_INTERVAL_MS = 3000;
const RENAME_MAX_DELAY_MS    = 8000;
function scheduleChannelRename(channel, desired){
  const entry = renameQueue.get(channel.id) || { desiredName: channel.name, timer:null, lastApplied:0 };
  entry.desiredName = desired;
  const now = Date.now();
  const apply = async () => {
    const e = renameQueue.get(channel.id); if(!e) return; const need = e.desiredName;
    if(channel.name === need){ e.lastApplied = Date.now(); clearTimeout(e.timer); e.timer=null; return; }
    if(Date.now() - e.lastApplied < RENAME_MIN_INTERVAL_MS){ e.timer = setTimeout(apply, RENAME_MIN_INTERVAL_MS); return; }
    try { await channel.setName(need); e.lastApplied = Date.now(); }
    catch { e.timer = setTimeout(apply, 4000); return; }
    if(e.desiredName === need){ clearTimeout(e.timer); e.timer=null; }
  };
  if(now - entry.lastApplied > RENAME_MAX_DELAY_MS && !entry.timer){ entry.timer = setTimeout(apply, 250); }
  else { if(entry.timer) clearTimeout(entry.timer); entry.timer = setTimeout(apply, 500); }
  renameQueue.set(channel.id, entry);
}
function renameChannelIfNeeded(channel, ticket){ const desired = buildChannelName(ticket.id, ticket.priority||0); if(channel.name === desired) return; scheduleChannelRename(channel, desired); }

/* ================= Logging ================= */
async function logEvent(guild, text){
  if(!cfg.logChannelId) return;
  try { const ch = await guild.channels.fetch(cfg.logChannelId); ch && ch.send(text); } catch {}
}

/* ================= Transcript ================= */
async function createTranscript(channel, ticket){
  const guild = channel.guild;

  // Caches für schnelle Namensauflösung
  const userCache   = new Map();
  const roleCache   = new Map();
  const chanCache   = new Map();

  const esc = (s='') => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  async function resolveUser(id){
    if(userCache.has(id)) return userCache.get(id);
    let name = id;
    try {
      const m = await guild.members.fetch(id);
      name = `${m.displayName} (${m.user.username})`;
    } catch {
      try {
        const u = await channel.client.users.fetch(id);
        name = u.username || u.tag || id;
      } catch {}
    }
    userCache.set(id, name);
    return name;
  }
  async function resolveRole(id){
    if(roleCache.has(id)) return roleCache.get(id);
    let name = id;
    try { const r = await guild.roles.fetch(id); name = r ? `@${r.name}` : id; } catch {}
    roleCache.set(id, name); return name;
  }
  async function resolveChannel(id){
    if(chanCache.has(id)) return chanCache.get(id);
    let name = id;
    try { const ch = await guild.channels.fetch(id); name = ch ? `#${ch.name}` : id; } catch {}
    chanCache.set(id, name); return name;
  }

  // Mentions in PLAIN TEXT auflösen
  async function resolveMentionsText(text=''){
    let out = text;
    // users
    const uMatches = [...text.matchAll(/<@!?(\d{17,20})>/g)];
    for(const m of uMatches){ out = out.replace(m[0], '@'+await resolveUser(m[1])); }
    // roles
    const rMatches = [...out.matchAll(/<@&(\d{17,20})>/g)];
    for(const m of rMatches){ out = out.replace(m[0], await resolveRole(m[1])); }
    // channels
    const cMatches = [...out.matchAll(/<#(\d{17,20})>/g)];
    for(const m of cMatches){ out = out.replace(m[0], await resolveChannel(m[1])); }
    return out;
  }

  // Mentions in HTML (mit Escaping) auflösen
  async function resolveMentionsHtml(text=''){
    let out = esc(text);
    const uMatches = [...text.matchAll(/<@!?(\d{17,20})>/g)];
    for(const m of uMatches){
      const name = esc(await resolveUser(m[1]));
      out = out.replace(esc(m[0]), `<span class="mention">@${name}</span>`);
    }
    const rMatches = [...text.matchAll(/<@&(\d{17,20})>/g)];
    for(const m of rMatches){
      const name = esc(await resolveRole(m[1]));
      out = out.replace(esc(m[0]), `<span class="mention">${name}</span>`);
    }
    const cMatches = [...text.matchAll(/<#(\d{17,20})>/g)];
    for(const m of cMatches){
      const name = esc(await resolveChannel(m[1]));
      out = out.replace(esc(m[0]), `<span class="chan">${name}</span>`);
    }
    return out;
  }

  // Nachrichten einsammeln (bis 1000)
  let all = [];
  let before;
  while(all.length < 1000){
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(()=>null);
    if(!batch || batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  all.sort((a,b)=> a.createdTimestamp - b.createdTimestamp);

  // ---------- Plain-Text bauen (inkl. Embeds) ----------
  const lines = [];
  lines.push(`# Transcript Ticket ${ticket.id}`);
  lines.push(`Channel: ${channel.name}`);
  lines.push(`Erstellt: ${new Date(ticket.timestamp).toISOString()}`);
  lines.push(`Nachrichten: ${all.length}`);
  lines.push('');

  for(const m of all){
    const ts = new Date(m.createdTimestamp).toISOString();
    const author = m.author ? (m.author.tag || m.author.username || m.author.id) : 'Unbekannt';
    const content = await resolveMentionsText(m.content || '');
    lines.push(`[${ts}] ${author}: ${content}`);
    // Dateien
    if(m.attachments.size){
      m.attachments.forEach(a => lines.push(`  [Anhang] ${a.name} -> ${a.url}`));
    }
    // EMBEDS (als Text)
    if(m.embeds?.length){
      for(const e of m.embeds){
        if(e.title)       lines.push(`  [EMBED] ${e.title}`);
        if(e.description) lines.push('    '+(await resolveMentionsText(e.description)).replace(/\n/g,' '));
        if(e.fields?.length){
          for(const f of e.fields){
            const v = await resolveMentionsText(f.value || '');
            lines.push(`    [${f.name}] ${v.replace(/\n/g,' ')}`);
          }
        }
        if(e.footer?.text) lines.push(`    ⌯ ${e.footer.text}`);
      }
    }
  }
  const plain = lines.join('\n');

  // ---------- HTML bauen (inkl. Embeds) ----------
  const body = [];
  for(const m of all){
    const time = new Date(m.createdTimestamp).toISOString();
    const author = esc(m.author ? (m.author.tag || m.author.username || m.author.id) : 'Unbekannt');
    const msg = await resolveMentionsHtml(m.content || '');

    let atts = '';
    if(m.attachments.size){
      atts = [...m.attachments.values()]
        .map(a => `<div class="att">📎 <a href="${a.url}" target="_blank">${esc(a.name)}</a></div>`)
        .join('');
    }

    let embedsHtml = '';
    if(m.embeds?.length){
      embedsHtml = m.embeds.map(e=>{
        const parts = [];
        if(e.title)       parts.push(`<div class="e-title">${esc(e.title)}</div>`);
        if(e.description) parts.push(`<div class="e-desc">${await resolveMentionsHtml(e.description)}</div>`);
        if(e.fields?.length){
          parts.push(`<div class="e-fields">${
            e.fields.map(f=>`<div class="e-field"><div class="name">${esc(f.name)}</div><div class="value">${await resolveMentionsHtml(f.value||'')}</div></div>`).join('')
          }</div>`);
        }
        if(e.footer?.text) parts.push(`<div class="e-footer">${esc(e.footer.text)}</div>`);
        return `<div class="embed">${parts.join('')}</div>`;
      }).join('');
    }

    body.push(`
      <div class="m">
        <span class="t">${time}</span>
        <span class="a">${author}</span>
        <span class="c">${msg}</span>
        ${atts}
        ${embedsHtml}
      </div>
    `);
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<title>Transcript Ticket ${ticket.id}</title>
<style>
  body{background:#0f1115;color:#e6e6e6;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:18px}
  h1{margin:0 0 8px}
  .meta{opacity:.7;margin:0 0 12px}
  .m{margin:6px 0 10px}
  .t{color:#9aa0a6;font-size:12px;margin-right:6px}
  .a{color:#64b5f6;font-weight:600;margin-right:6px}
  .att{color:#ffb74d;font-size:12px;margin-left:2rem}
  .mention{color:#c3e88d;font-weight:600}
  .chan{color:#82aaff}
  .embed{border-left:4px solid #5865F2;background:#1a1d23;padding:.6rem .8rem;margin:.4rem 0;border-radius:6px}
  .e-title{font-weight:700;margin-bottom:.25rem}
  .e-desc{white-space:pre-wrap}
  .e-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem;margin-top:.4rem}
  .e-field{background:#12151a;padding:.45rem;border-radius:4px}
  .e-field .name{font-weight:600;margin-bottom:.2rem}
  .e-footer{opacity:.7;margin-top:.4rem;font-size:.9em}
</style>
</head><body>
  <h1>Transcript Ticket ${ticket.id}</h1>
  <p class="meta">Channel: ${esc(channel.name)} • Erstellt: ${new Date(ticket.timestamp).toISOString()} • Nachrichten: ${all.length}</p>
  <hr>
  ${body.join('\n')}
</body></html>`;

  const tTxt  = path.join(__dirname, `transcript_${ticket.id}.txt`);
  const tHtml = path.join(__dirname, `transcript_${ticket.id}.html`);
  fs.writeFileSync(tTxt,  plain);
  fs.writeFileSync(tHtml, html);

  return { txt: new AttachmentBuilder(tTxt), html: new AttachmentBuilder(tHtml) };
}


/* ================= FormField Helper ================= */
function getFormFieldsForTopic(topicValue){
  const all = Array.isArray(cfg.formFields)? cfg.formFields : [];
  return all.filter(f => {
    if(!f) return false;
    if(!f.topic) return true; // global
    if(Array.isArray(f.topic)) return f.topic.includes(topicValue);
    return f.topic === topicValue;
  }).slice(0,5); // Discord Limit
}
function normalizeField(field, index){
  return {
    label: (field.label||`Feld ${index+1}`).substring(0,45),
    id: (field.id||`f${index}`),
    required: field.required? true:false,
    style: field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short
  };
}

/* ================= Interactions ================= */
client.on(Events.InteractionCreate, async i => {
  try {
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({ components:[ new ActionRowBuilder().addComponents( new ButtonBuilder().setURL(PANEL_FIXED_URL).setStyle(ButtonStyle.Link).setLabel('Dashboard') ) ], ephemeral:true });
    }

    // Topic Auswahl -> ggf. Formular anzeigen
    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = cfg.topics?.find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema',ephemeral:true});

      const formFields = getFormFieldsForTopic(topic.value);
      if(formFields.length){
        // Modal anzeigen, Ticketnummer wird erst beim Submit erzeugt
        const modal = new ModalBuilder().setCustomId(`modal_newticket:${topic.value}`).setTitle(`Ticket: ${topic.label}`.substring(0,45));
        formFields.forEach((f,idx)=>{
          const nf = normalizeField(f,idx);
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId(nf.id)
                .setLabel(nf.label)
                .setRequired(nf.required)
                .setStyle(nf.style)
            ));
        });
        return i.showModal(modal);
      }

      // Kein Formular -> sofort Ticket erstellen
      return await createTicketChannel(i, topic, {});
    }

    // Modal Submit (neues Ticket)
    if(i.isModalSubmit() && i.customId.startsWith('modal_newticket:')){
      const topicValue = i.customId.split(':')[1];
      const topic = cfg.topics?.find(t=>t.value===topicValue);
      if(!topic) return i.reply({ephemeral:true,content:'Topic ungültig'});
      const formFields = getFormFieldsForTopic(topic.value).map(normalizeField);
      const answers = {};
      formFields.forEach(f=>{ answers[f.id] = i.fields.getTextInputValue(f.id); });
      await createTicketChannel(i, topic, answers);
      return;
    }

    if(i.isButton()){
      const log = safeRead(TICKETS_PATH, []);
      const ticket = log.find(t=>t.channelId===i.channel.id);
      if(!ticket) return i.reply({ephemeral:true,content:'Kein Ticket-Datensatz'});
      const isTeam = i.member.roles.cache.has(TEAM_ROLE);

      if(i.customId==='request_close'){
        await i.channel.send({ content:`❓ Schließungsanfrage von <@${i.user.id}> <@&${TEAM_ROLE}>`, components:[ new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId('team_close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger) ) ] });
        logEvent(i.guild, `❓ Close-Request Ticket #${ticket.id} von <@${i.user.id}>`);
        return i.reply({ephemeral:true,content:'Anfrage gesendet'});
      }

      if(!isTeam) return i.reply({ephemeral:true,content:'Nur Team'});

      switch(i.customId){
        case 'team_close':
        case 'close': {
          // Status speichern
         ticket.status = 'geschlossen';
         safeWrite(TICKETS_PATH, log);

         // Namen statt @IDs
        const closer = await i.guild.members.fetch(i.user.id).catch(()=>null);
        const closerTag  = closer?.user?.tag || i.user.tag || i.user.username || i.user.id;
        const closerName = closer?.displayName || closerTag;
        const roleObj    = await i.guild.roles.fetch(TEAM_ROLE).catch(()=>null);
        const teamLabel  = roleObj ? `@${roleObj.name}` : '@Team';

        await i.reply({ ephemeral:true, content:'Ticket wird geschlossen…' });

        // Keine Mentions mehr, nur Namen anzeigen (damit der Transcript sauber ist)
        await i.channel.send(`🔒 Ticket geschlossen von ${closerName} (${closerTag}) • ${teamLabel}`);

        // Transcript erstellen (mit Mention-Umwandlung, siehe Funktion unten)
        let files = null;
        try { files = await createTranscript(i.channel, ticket, { resolveMentions: true }); } catch {}

        // Transcript hochladen (falls Channel konfiguriert)
        const transcriptChannelId = cfg.transcriptChannelId || cfg.logChannelId;
        if (transcriptChannelId && files){
          try {
            const tc = await i.guild.channels.fetch(transcriptChannelId);
            if (tc) await tc.send({ content:`📁 Transcript Ticket #${ticket.id}`, files:[files.txt, files.html] });
         } catch {}
       }

  // Logging & Channel löschen
  logEvent(i.guild, `🔒 Ticket #${ticket.id} geschlossen von ${closerTag}`);
  setTimeout(()=> i.channel.delete().catch(()=>{}), 2500);
  return;
}
        case 'claim':
          ticket.claimer = i.user.id; safeWrite(TICKETS_PATH, log);
          await i.update({ components: buttonRows(true) });
          logEvent(i.guild, `✅ Claim Ticket #${ticket.id} von <@${i.user.id}>`);
          break;
        case 'unclaim':
          delete ticket.claimer; safeWrite(TICKETS_PATH, log);
          await i.update({ components: buttonRows(false) });
          logEvent(i.guild, `🔄 Unclaim Ticket #${ticket.id} von <@${i.user.id}>`);
          break;
        case 'priority_up': {
          ticket.priority = Math.min(2, (ticket.priority||0)+1);
          await updatePriority(i, ticket, log, 'hoch');
          break;
        }
        case 'priority_down': {
          ticket.priority = Math.max(0, (ticket.priority||0)-1);
          await updatePriority(i, ticket, log, 'herab');
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

    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team'});
      const raw = i.fields.getTextInputValue('user').trim();
      const id = (raw.replace(/<@!?|>/g,'').match(/\d{17,20}/)||[])[0];
      if(!id) return i.reply({ephemeral:true,content:'Ungültige ID'});
      try {
        await i.guild.members.fetch(id);
        if(i.channel.permissionOverwrites.cache.get(id))
          return i.reply({ephemeral:true,content:'Schon Zugriff'});
        await i.channel.permissionOverwrites.edit(id,{ ViewChannel:true, SendMessages:true });
        await i.reply({ephemeral:true,content:`<@${id}> hinzugefügt`});
        logEvent(i.guild, `➕ User <@${id}> zu Ticket #${safeRead(TICKETS_PATH,[]).find(t=>t.channelId===i.channel.id)?.id||'?'} hinzugefügt`);
      } catch {
        return i.reply({ephemeral:true,content:'Fehler beim Hinzufügen'});
      }
    }
  } catch(err) {
    console.error(err);
    if(!i.replied && !i.deferred) i.reply({ephemeral:true,content:'Fehler'});
  }
});

/* ================= Ticket Erstellung (mit optionalen Formular-Daten) ================= */
async function createTicketChannel(interaction, topic, formData){
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
  const embed = buildTicketEmbed(interaction, topic, nr);
  // Formular-Ergebnisse als Fields anhängen
  const formKeys = Object.keys(formData||{});
  if(formKeys.length){
    // Max 25 Felder
    const fields = formKeys.slice(0,25).map(k=>({ name: k, value: formData[k] ? (formData[k].substring(0,1024) || '—') : '—', inline:false }));
    embed.addFields(fields);
  }
  await ch.send({ embeds:[embed], components: buttonRows(false) });
  // Nutzer informieren
  if(interaction.isModalSubmit()){
    await interaction.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });
  } else {
    interaction.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });
  }
  // Speichern
  const log = safeRead(TICKETS_PATH, []);
  log.push({ id:nr, channelId:ch.id, userId:interaction.user.id, topic:topic.value, status:'offen', priority:0, timestamp:Date.now(), formData });
  safeWrite(TICKETS_PATH, log);
  logEvent(interaction.guild, `🆕 Ticket #${nr} erstellt von <@${interaction.user.id}> (${topic.label})`);

  // Panel Reset (Dropdown wiederherstellen)
  try {
    cfg = safeRead(CFG_PATH, cfg);
    if(cfg.panelMessageId && cfg.panelChannelId){
      const panelChannel = await interaction.guild.channels.fetch(cfg.panelChannelId).catch(()=>null);
      if(panelChannel){
        const panelMsg = await panelChannel.messages.fetch(cfg.panelMessageId).catch(()=>null);
        if(panelMsg){
          const row = buildPanelSelect();
          let panelEmbed = undefined;
          if(cfg.panelEmbed && (cfg.panelEmbed.title || cfg.panelEmbed.description)){
            panelEmbed = new EmbedBuilder();
            if(cfg.panelEmbed.title) panelEmbed.setTitle(cfg.panelEmbed.title);
            if(cfg.panelEmbed.description) panelEmbed.setDescription(cfg.panelEmbed.description);
            if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) panelEmbed.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
            if(cfg.panelEmbed.footer) panelEmbed.setFooter({ text: cfg.panelEmbed.footer });
          }
          await panelMsg.edit({ embeds: panelEmbed? [panelEmbed]: panelMsg.embeds, components:[row] });
        }
      }
    }
  } catch(e){ /* ignorieren */ }
}

/* ================= Priority Update ================= */
async function updatePriority(interaction, ticket, log, dir){
  renameChannelIfNeeded(interaction.channel, ticket);
  const msg = await interaction.channel.messages.fetch({limit:10}).then(c=>c.find(m=>m.embeds.length)).catch(()=>null);
  const state = PRIORITY_STATES[ticket.priority||0];
  if(msg){ const e = EmbedBuilder.from(msg.embeds[0]); e.setColor(state.embedColor); await msg.edit({embeds:[e]}); }
  safeWrite(TICKETS_PATH, log);
  logEvent(interaction.guild, `⚙️ Ticket #${ticket.id} Priorität ${dir}: ${state.label}`);
  await interaction.reply({ephemeral:true,content:`Priorität: ${state.label}`});
}

client.login(TOKEN);
