// === Ticket Embed Customization Update ===
// Enthält: panel.js (Erweiterung), panel.ejs (Erweiterung), index.js Änderungen, Beispiel config.json Abschnitt.
// Kopiere die jeweiligen Teile in deine Dateien.

/* ======================= 1) panel.js (ersetzen) ======================= */
/*
Fügt Formularfelder für das Ticket-Embed hinzu (Titel, Beschreibung, Farbe, Footer) + Platzhalter-Hinweis.
*/

// panel.js
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const { Strategy } = require('passport-discord');
const fs        = require('fs');
const path      = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CONFIG = path.join(__dirname, 'config.json');
let   cfg    = require(CONFIG);

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((u, d) => d(null, u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',
  scope: ['identify', 'guilds', 'guilds.members.read']
}, (_a, _b, profile, done) => done(null, profile)));

module.exports = (client) => {
  const router = express.Router();

  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false
  }));
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({ extended: true }));

  function isAuth(req,res,next){
    if(!req.isAuthenticated()) return res.redirect('/login');
    const g = req.user.guilds.find(g=>g.id===cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Admin | ManageGuild
    if(!g || !(BigInt(g.permissions)&ALLOWED)) return res.send('Keine Berechtigung');
    next();
  }

  // Panel Nachricht bauen (Dropdown)
  async function buildPanelMessage(channelId, messageId=null){
    const guild   = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(channelId);
    const menu = new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Wähle dein Thema …').addOptions(cfg.topics);
    const payload = {
      embeds:[ new EmbedBuilder().setTitle(cfg.panelTitle || '🎫 Ticket-System').setDescription(cfg.panelDescription || 'Bitte Thema auswählen') ],
      components:[ new ActionRowBuilder().addComponents(menu) ]
    };
    if(messageId){
      const msg = await channel.messages.fetch(messageId);
      return msg.edit(payload);
    }
    const sent = await channel.send(payload);
    return sent.id;
  }

  router.get('/login', passport.authenticate('discord'));
  router.get('/auth/discord/callback', passport.authenticate('discord', { failureRedirect:'/' }), (_req,res)=>res.redirect('/panel'));

  router.get('/panel', isAuth, (req,res)=>{
    // Defaults für Embed Werte
    if(!cfg.ticketEmbed) cfg.ticketEmbed = { title:'🎫 Ticket erstellt', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' };
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  router.post('/panel', isAuth, (req,res)=>{
    try {
      // Themen & Formularfelder (JSON Textareas) optional
      if(req.body.topicsJson){
        cfg.topics = JSON.parse(req.body.topicsJson || '[]');
      }
      if(req.body.formFieldsJson){
        cfg.formFields = JSON.parse(req.body.formFieldsJson || '[]');
      }
    } catch(e){
      console.error(e);
      res.redirect('/panel?msg=jsonerror');
    }
  });

  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const id = await buildPanelMessage(req.body.channelId || cfg.panelChannelId, null);
      cfg.panelChannelId = req.body.channelId || cfg.panelChannelId;
      cfg.panelMessageId = id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(err){ console.error(err); res.redirect('/panel?msg=error'); }
  });

  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try { await buildPanelMessage(cfg.panelChannelId,cfg.panelMessageId); res.redirect('/panel?msg=edited'); }
    catch(err){ console.error(err); res.redirect('/panel?msg=error'); }
  });

  return router;
};

/* ======================= 2) panel.ejs (Erweiterung) ======================= */
/* Füge innerhalb deines bestehenden <form> oder als eigener Abschnitt hinzu. */
/* Beispiel: */
/*
<h2>Ticket Embed Vorlage</h2>
<p>Platzhalter: {userMention} {topicLabel} {ticketNumber} {userId} {topicValue}</p>
<label>Titel
  <input name="embedTitle" value="<%= (cfg.ticketEmbed && cfg.ticketEmbed.title) || '' %>">
</label>
<label>Beschreibung
  <textarea name="embedDescription" rows="4"><%= (cfg.ticketEmbed && cfg.ticketEmbed.description) || '' %></textarea>
</label>
<label>Farbe (Hex)
  <input name="embedColor" value="<%= (cfg.ticketEmbed && cfg.ticketEmbed.color) || '#2b90d9' %>" placeholder="#2b90d9">
</label>
<label>Footer
  <input name="embedFooter" value="<%= (cfg.ticketEmbed && cfg.ticketEmbed.footer) || '' %>">
</label>

<!-- Falls du Topics/FormFields als JSON bearbeiten willst -->
<h3>Themen (JSON)</h3>
<textarea name="topicsJson" rows="6"><%= JSON.stringify(cfg.topics || [], null, 2) %></textarea>
<h3>Formularfelder (JSON)</h3>
<textarea name="formFieldsJson" rows="6"><%= JSON.stringify(cfg.formFields || [], null, 2) %></textarea>

<button type="submit">💾 Speichern</button>
*/

/* ======================= 3) index.js (nur kleine Änderung) ======================= */
/* Ersetze in deiner index.js beim Erstellen eines Tickets den Embed-Build Block. (Suche nach: await ch.send({embeds:[new EmbedBuilder()...) */
/* ALT: */
// await ch.send({embeds:[new EmbedBuilder().setTitle('🎫 Ticket erstellt').setDescription(`Hallo <@${i.user.id}>\n**Thema:** ${topic.label}`)],components:buttonRows(false)});
/* NEU: */
/*
// Sicherstellen, dass cfg.ticketEmbed existiert
if(!cfg.ticketEmbed) cfg.ticketEmbed = { title:'🎫 Ticket erstellt', description:'Hallo {userMention}\n**Thema:** {topicLabel}', color:'#2b90d9', footer:'Ticket #{ticketNumber}' };

const ticketEmbedData = cfg.ticketEmbed;
const replacedDescription = (ticketEmbedData.description || '')
  .replace(/\{userMention\}/g, `<@${i.user.id}>`)
  .replace(/\{userId\}/g, i.user.id)
  .replace(/\{topicLabel\}/g, topic.label)
  .replace(/\{topicValue\}/g, topic.value)
  .replace(/\{ticketNumber\}/g, nr.toString());

const replacedTitle = (ticketEmbedData.title || '')
  .replace(/\{ticketNumber\}/g, nr.toString())
  .replace(/\{topicLabel\}/g, topic.label);

const replacedFooter = (ticketEmbedData.footer || '')
  .replace(/\{ticketNumber\}/g, nr.toString())
  .replace(/\{topicLabel\}/g, topic.label);

const embed = new EmbedBuilder()
  .setTitle(replacedTitle || '🎫 Ticket')
  .setDescription(replacedDescription || `Hallo <@${i.user.id}>`);

if(ticketEmbedData.color && /^#?[0-9a-fA-F]{6}$/.test(ticketEmbedData.color)){
  embed.setColor(parseInt(ticketEmbedData.color.replace('#',''),16));
}
if(replacedFooter) embed.setFooter({ text: replacedFooter });

await ch.send({ embeds:[embed], components:buttonRows(false) });
*/

/* ======================= 4) config.json Beispiel Ergänzung ======================= */
/*
{
  "guildId": "123456789012345678",
  "ticketCategoryId": "123456789012345678",
  "supportRoleId": "123456789012345678",
  "topics": [
    {"label":"Allgemein","value":"allgemein","emoji":"💬"},
    {"label":"Kauf","value":"kauf","emoji":"💰"}
  ],
  "ticketEmbed": {
    "title": "🎫 Ticket #{ticketNumber}",
    "description": "Hallo {userMention}\nDu hast **{topicLabel}** gewählt.",
    "color": "#2b90d9",
    "footer": "Support Ticket #{ticketNumber}"
  }
}
*/

/* ======================= 5) Platzhalter Übersicht ======================= */
/*
{userMention}   -> @User
{userId}        -> Zahl der User ID
{topicLabel}    -> Angezeigter Name des gewählten Themas
{topicValue}    -> value Feld des Themas
{ticketNumber}  -> fortlaufende Ticketnummer
*/

/* ======================= 6) Schritte ======================= */
/*
1. panel.js durch neue Version ersetzen.
2. panel.ejs Formularabschnitt einfügen (oder erweitern) -> Speichern.
3. index.js Embed‑Block austauschen wie oben beschrieben.
4. Bot neu starten.
5. Im Panel Werte anpassen, speichern, neue Ticket Erstellung testen.
*/

// Ende der Update-Datei
