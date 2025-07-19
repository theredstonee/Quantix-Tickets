// --- index.js | Ticket‑Bot v6.3.2 (Loop-Fix kompatibel, Panel-Reset + feste Panel URL) ---
// Änderungen ggü. deiner geposteten v6.3.1:
//  1) Dashboard-Link fest auf https://trstickets.theredstonee.de/panel
//  2) Panel-Dropdown Reset nach Themenauswahl bleibt erhalten
//  3) Keine sonstigen Logik-Änderungen
//  4) Kleine Robustheits-Prüfung beim Ticket-Panel Reset
//  5) Nur minimal notwendige Anpassungen wie gewünscht

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

const client = new Client({ intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages], partials:[Partials.Channel, Partials.Message] });
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

/* ================= Channel Name Helpers ================= */
function buildChannelName(ticketNumber, priorityIndex){
  const num = ticketNumber.toString().padStart(5,'0');
  const st  = PRIORITY_STATES[priorityIndex] || PRIORITY_STATES[0];
  return `${PREFIX}${st.dot}ticket-${num}`;
}
function renameChannelIfNeeded(channel, ticket){
  const desired = buildChannelName(ticket.id, ticket.priority||0);
  if(channel.name !== desired) channel.setName(desired).catch(()=>{});
}

/* ================= Logging ================= */
async function logEvent(guild, text){
  if(!cfg.logChannelId) return;
  try { const ch = await guild.channels.fetch(cfg.logChannelId); ch && ch.send(text); } catch {}
}

/* ================= Transcript ================= */
async function createTranscript(channel, ticket){
  let messages = []; let lastId;
  while(messages.length < 1000){
    const fetched = await channel.messages.fetch({ limit:100, before:lastId }).catch(()=>null);
    if(!fetched || fetched.size===0) break;
    messages.push(...fetched.values());
    lastId = fetched.last().id;
  }
  messages.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);

  const lines = [ `# Transcript Ticket ${ticket.id}`, `Channel: ${channel.name}`, `Erstellt: ${new Date(ticket.timestamp).toISOString()}`, '' ];
  for(const m of messages){
    const time = new Date(m.createdTimestamp).toISOString();
    const author = m.author ? (m.author.tag || m.author.id) : 'Unbekannt';
    const content = (m.content||'').replace(/\n/g,'\\n');
    lines.push(`[${time}] ${author}: ${content}`);
    if(m.attachments.size) m.attachments.forEach(att=>lines.push(`  [Anhang] ${att.name} -> ${att.url}`));
  }
  const txt = lines.join('\n');
  const html = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>Transcript ${ticket.id}</title><style>body{font-family:Arial;background:#111;color:#eee}.m{margin:4px 0}.t{color:#888;font-size:11px;margin-right:6px}.a{color:#4ea1ff;font-weight:bold;margin-right:4px}.att{color:#ffa500;font-size:11px;display:block;margin-left:2rem}</style></head><body><h1>Transcript Ticket ${ticket.id}</h1>${messages.map(m=>{const atts=m.attachments.size?[...m.attachments.values()].map(a=>`<span class='att'>📎 <a href='${a.url}'>${a.name}</a></span>`).join(''):'';return `<div class='m'><span class='t'>${new Date(m.createdTimestamp).toISOString()}</span><span class='a'>${m.author?m.author.tag:''}</span><span>${(m.content||'').replace(/</g,'&lt;')}</span>${atts}</div>`}).join('')}</body></html>`;
  const txtPath = path.join(__dirname,`transcript_${ticket.id}.txt`);
  const htmlPath= path.join(__dirname,`transcript_${ticket.id}.html`);
  fs.writeFileSync(txtPath, txt); fs.writeFileSync(htmlPath, html);
  return { txt: new AttachmentBuilder(txtPath), html: new AttachmentBuilder(htmlPath) };
}

/* ================= Interactions ================= */
client.on(Events.InteractionCreate, async i => {
  try {
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({ components:[ new ActionRowBuilder().addComponents( new ButtonBuilder().setURL(PANEL_FIXED_URL).setStyle(ButtonStyle.Link).setLabel('Dashboard') ) ], ephemeral:true });
    }

    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = cfg.topics?.find(t=>t.value===i.values[0]);
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
      const embed = buildTicketEmbed(i, topic, nr);
      await ch.send({ embeds:[embed], components: buttonRows(false) });
      i.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });

      const log = safeRead(TICKETS_PATH, []);
      log.push({ id:nr, channelId:ch.id, userId:i.user.id, topic:topic.value, status:'offen', priority:0, timestamp:Date.now() });
      safeWrite(TICKETS_PATH, log);
      logEvent(i.guild, `🆕 Ticket #${nr} erstellt von <@${i.user.id}> (${topic.label})`);

      // Panel Reset
      try {
        cfg = safeRead(CFG_PATH, cfg);
        if(cfg.panelMessageId && cfg.panelChannelId){
          const panelChannel = await i.guild.channels.fetch(cfg.panelChannelId).catch(()=>null);
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
          ticket.status='geschlossen'; safeWrite(TICKETS_PATH, log);
          await i.reply({ephemeral:true,content:'Ticket wird geschlossen…'});
          await i.channel.send(`🔒 Ticket geschlossen von <@${i.user.id}> <@&${TEAM_ROLE}>`);
          let files=null; try { files = await createTranscript(i.channel, ticket); } catch {}
          const transcriptChannelId = cfg.transcriptChannelId || cfg.logChannelId;
          if(transcriptChannelId){
            try { const tc = await i.guild.channels.fetch(transcriptChannelId); if(tc && files) tc.send({ content:`📁 Transcript Ticket #${ticket.id}`, files:[files.txt, files.html] }); } catch {}
          }
          logEvent(i.guild, `🔒 Ticket #${ticket.id} geschlossen von <@${i.user.id}>`);
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
