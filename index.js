// --- index.js | Ticket‑Bot v6.1 FIX (Panel Reset + Priority Buttons Fix + Robust Logging) ---
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
  PermissionsBitField, ChannelType, Events,
  StringSelectMenuBuilder
} = require('discord.js');

/* ================= Constants ================= */
const TEAM_ROLE = '1387525699908272218';
const PREFIX    = '🎫│';

/* ================= Paths ================= */
const CFG_PATH     = path.join(__dirname,'config.json');
const COUNTER_PATH = path.join(__dirname,'ticketCounter.json');
const TICKETS_PATH = path.join(__dirname,'tickets.json');

/* ================= Safe JSON Helpers ================= */
function safeRead(file, fallback){ try { const raw = fs.readFileSync(file,'utf8'); return raw?JSON.parse(raw):fallback; } catch { return fallback; } }
function safeWrite(file, data){ fs.writeFileSync(file, JSON.stringify(data,null,2)); }

let cfg = safeRead(CFG_PATH, {});
if(!fs.existsSync(COUNTER_PATH)) safeWrite(COUNTER_PATH, { last: 0 });
if(!fs.existsSync(TICKETS_PATH)) safeWrite(TICKETS_PATH, []);

if(!cfg.ticketEmbed){
  cfg.ticketEmbed = { title:'🎫 Ticket #{ticketNumber}', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' };
}
if(!cfg.panelEmbed){
  cfg.panelEmbed = { title:'🎟️ Ticket erstellen', description:'Wähle unten dein Thema aus.', color:'#5865F2', footer:'Support Panel' };
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

/* ================= Utils ================= */
function nextTicket(){ const c = safeRead(COUNTER_PATH,{last:0}); c.last++; safeWrite(COUNTER_PATH,c); return c.last; }

function buildPanelSelect(){
  // refresh cfg each time
  cfg = safeRead(CFG_PATH, cfg);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji||undefined })))
  );
}

function buildTicketEmbed(i, topic, nr){
  cfg = safeRead(CFG_PATH, cfg);
  if(!cfg.ticketEmbed){ cfg.ticketEmbed = { title:'🎫 Ticket #{ticketNumber}', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' }; }
  const t = cfg.ticketEmbed;
  const repl = (s='')=>s
    .replace(/\{userMention\}/g, `<@${i.user.id}>`)
    .replace(/\{userId\}/g, i.user.id)
    .replace(/\{topicLabel\}/g, topic.label)
    .replace(/\{topicValue\}/g, topic.value)
    .replace(/\{ticketNumber\}/g, nr.toString());
  const embed = new EmbedBuilder()
    .setTitle(repl(t.title)||'🎫 Ticket')
    .setDescription(repl(t.description)||`Hallo <@${i.user.id}>`);
  if(t.color && /^#?[0-9a-fA-F]{6}$/.test(t.color)) embed.setColor(parseInt(t.color.replace('#',''),16));
  if(t.footer) embed.setFooter({ text: repl(t.footer) });
  return embed;
}

function ticketButtons(claimed){
  // Row1: public request_close only
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('request_close').setEmoji('❓').setLabel('Schließungsanfrage').setStyle(ButtonStyle.Secondary)
  );
  // Row2: team actions (4 max) claim/unclaim dynamic
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

/* ================= Slash Commands ================= */
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, cfg.guildId),
    { body: [ new SlashCommandBuilder().setName('dashboard').setDescription('Link zum Admin‑Panel').toJSON() ] }
  );
  console.log(`🤖 ${client.user.tag} bereit`);
});

/* ================= Interaction Handler ================= */
client.on(Events.InteractionCreate, async i => {
  try {
    // DASHBOARD
    if(i.isChatInputCommand() && i.commandName==='dashboard'){
      return i.reply({
        components:[ new ActionRowBuilder().addComponents(
          new ButtonBuilder().setURL(`http://${PANEL_HOST}/panel`).setStyle(ButtonStyle.Link).setLabel('Dashboard')
        )],
        ephemeral:true
      });
    }

    // TOPIC SELECT
    if(i.isStringSelectMenu() && i.customId==='topic'){
      const topic = (cfg.topics||[]).find(t=>t.value===i.values[0]);
      if(!topic) return i.reply({content:'Unbekanntes Thema', ephemeral:true});
      const nr = nextTicket();
      const ch = await i.guild.channels.create({
        name: `${PREFIX}ticket-${nr.toString().padStart(5,'0')}`,
        type: ChannelType.GuildText,
        parent: cfg.ticketCategoryId,
        permissionOverwrites:[
          { id:i.guild.id, deny: PermissionsBitField.Flags.ViewChannel },
          { id:i.user.id, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id:TEAM_ROLE, allow:[PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });

      await ch.send({ embeds:[buildTicketEmbed(i, topic, nr)], components: ticketButtons(false) });

      const log = safeRead(TICKETS_PATH, []);
      log.push({ id:nr, channelId:ch.id, userId:i.user.id, topic:topic.value, status:'offen', timestamp:Date.now() });
      safeWrite(TICKETS_PATH, log);

      await i.reply({ content:`Ticket erstellt: ${ch}`, ephemeral:true });

      // RESET panel message (keine Auswahl mehr sichtbar)
      try {
        const freshSelect = buildPanelSelect();
        if(cfg.panelEmbed){
          const p = cfg.panelEmbed;
          const panelEmbed = new EmbedBuilder()
            .setTitle(p.title || '🎟️ Ticket erstellen')
            .setDescription(p.description || 'Wähle unten dein Thema aus.');
          if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)) panelEmbed.setColor(parseInt(p.color.replace('#',''),16));
          if(p.footer) panelEmbed.setFooter({ text:p.footer });
          await i.message.edit({ embeds:[panelEmbed], components:[freshSelect] });
        } else {
          await i.message.edit({ components:[freshSelect] });
        }
      } catch(e){ console.warn('Panel Reset fehlgeschlagen:', e.message); }
      return;
    }

    // BUTTONS
    if(i.isButton()){
      const log = safeRead(TICKETS_PATH, []);
      const ticket = log.find(t=>t.channelId === (i.channel && i.channel.id));
      if(!ticket){
        return i.reply({ephemeral:true,content:'Kein Ticket-Kontext'});
      }
      const isTeam = i.member.roles.cache.has(TEAM_ROLE);

      if(i.customId === 'request_close'){
        await i.channel.send({
          content:`❓ Schließungsanfrage von <@${i.user.id}> <@&${TEAM_ROLE}>`,
          components:[ new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('team_close').setEmoji('🔒').setLabel('Schließen').setStyle(ButtonStyle.Danger)
          )]
        });
        return i.reply({ephemeral:true,content:'Schließungsanfrage gesendet'});
      }

      // Ab hier Team only
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
          await i.update({ components: ticketButtons(true) });
          break;
        case 'unclaim':
          delete ticket.claimer;
          await i.update({ components: ticketButtons(false) });
          break;
        case 'priority_down':
        case 'priority_up': {
          // Farbwechsel nur auf erste Embed Nachricht (Ticket Start)
            const msg = await i.channel.messages.fetch({ limit: 10 }).then(col => col.find(m=>m.embeds.length));
            if(msg){
              const e = EmbedBuilder.from(msg.embeds[0]);
              e.setColor(i.customId==='priority_up' ? 0xd92b2b : 0x2bd94a);
              await msg.edit({ embeds:[e] });
            }
            await i.reply({ ephemeral:true, content:'Priorität geändert' });
          break; }
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

    // MODAL: Add User
    if(i.isModalSubmit() && i.customId==='modal_add_user'){
      if(!i.member.roles.cache.has(TEAM_ROLE)) return i.reply({ephemeral:true,content:'Nur Team'});
      const raw = i.fields.getTextInputValue('user').trim();
      const uid = (raw.replace(/<@!?|>/g,'').match(/\d{17,20}/)||[])[0];
      if(!uid) return i.reply({ephemeral:true,content:'Ungültige ID'});
      try {
        await i.guild.members.fetch(uid);
        if(i.channel.permissionOverwrites.cache.get(uid))
          return i.reply({ephemeral:true,content:'User hat bereits Zugriff'});
        await i.channel.permissionOverwrites.edit(uid,{ ViewChannel:true, SendMessages:true });
        await i.reply({ephemeral:true,content:`<@${uid}> hinzugefügt`});
      } catch(err){
        console.error('AddUser Fehler', err);
        return i.reply({ephemeral:true,content:'Fehler beim Hinzufügen'});
      }
    }
  } catch(err){
    console.error('Interaction Fehler:', err);
    if(!i.replied && !i.deferred) i.reply({ephemeral:true,content:'Fehler'});
  }
});

client.login(TOKEN);
