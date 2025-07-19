// === panel.js (Erweiterung) + neue tickets.ejs ===
// Diese Datei zeigt DIR NUR die Änderungen/ergänzte komplette Version von panel.js
// plus den neuen View "tickets.ejs" (unten als Template Kommentar) für Ticket-Übersicht.
// Füge das in deine bestehende panel.js ein (oder ersetze komplett) und erstelle zusätzlich
// die Datei views/tickets.ejs mit dem angegebenen Inhalt.

/* WICHTIG: index.js schreibt Tickets nach tickets.json.
   Wir lesen diese Datei hier, filtern in offene & geschlossene und zeigen sie an.
   Optional: einfache Suche & Pagination. */

require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const { Strategy } = require('passport-discord');
const fs        = require('fs');
const path      = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const CONFIG_PATH  = path.join(__dirname, 'config.json');
let   cfg          = require(CONFIG_PATH);
const TICKETS_PATH = path.join(__dirname, 'tickets.json');

passport.serializeUser((u, d) => d(null, u));
passport.deserializeUser((u, d) => d(null, u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',
  scope: ['identify', 'guilds', 'guilds.members.read']
}, (_a,_r, profile, done) => done(null, profile)));

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

  /* ---- Auth Middleware ---- */
  function isAuth(req,res,next){
    if(!req.isAuthenticated()) return res.redirect('/login');
    const g = req.user.guilds.find(g=>g.id===cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Admin / Manage Guild
    if(!g || !(BigInt(g.permissions) & ALLOWED)) return res.send('Keine Berechtigung');
    return next();
  }

  /* ---- Panel Nachricht bauen ---- */
  async function buildPanelMessage(channelId, messageId=null){
    const guild   = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(channelId);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions((cfg.topics||[]).map(t=>({ label:t.label, value:t.value, emoji:t.emoji || undefined })));

    // Panel Embed optional verwenden
    let payload = { components:[ new ActionRowBuilder().addComponents(menu) ] };
    if(cfg.panelEmbed){
      const pe = cfg.panelEmbed;
      const embed = new EmbedBuilder()
        .setTitle(pe.title || '🎟️ Ticket erstellen')
        .setDescription(pe.description || 'Wähle unten dein Thema aus.');
      if(pe.color && /^#?[0-9a-fA-F]{6}$/.test(pe.color)) embed.setColor(parseInt(pe.color.replace('#',''),16));
      if(pe.footer) embed.setFooter({ text: pe.footer });
      payload.embeds = [embed];
    }

    if(messageId){
      const msg = await channel.messages.fetch(messageId);
      await msg.edit(payload);
      return messageId;
    } else {
      const sent = await channel.send(payload);
      return sent.id;
    }
  }

  /* ---- Auth Routes ---- */
  router.get('/login', passport.authenticate('discord'));
  router.get('/auth/discord/callback', passport.authenticate('discord',{ failureRedirect:'/' }), (_req,res)=>res.redirect('/panel'));

  /* ---- Panel Hauptseite ---- */
  router.get('/panel', isAuth, (req,res)=> res.render('panel', { cfg, msg:req.query.msg||null }));

  /* ---- Speichern (Topics + Embeds) ---- */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      // Tabellen-Eingaben verarbeiten
      const labels = Array.isArray(req.body.label) ? req.body.label : (req.body.label ? [req.body.label]:[]);
      const values = Array.isArray(req.body.value) ? req.body.value : (req.body.value ? [req.body.value]:[]);
      const emojis = Array.isArray(req.body.emoji) ? req.body.emoji : (req.body.emoji ? [req.body.emoji]:[]);
      const topics = [];
      labels.forEach((lab, idx)=>{
        if(!lab.trim()) return; 
        const v = values[idx] && values[idx].trim() ? values[idx].trim() : lab.toLowerCase().replace(/\s+/g,'-');
        topics.push({ label: lab.trim(), value: v, emoji: (emojis[idx]||'').trim() });
      });
      cfg.topics = topics;

      // Ticket Embed
      cfg.ticketEmbed = {
        title: req.body.embedTitle || '',
        description: req.body.embedDescription || '',
        color: req.body.embedColor || '#2b90d9',
        footer: req.body.embedFooter || ''
      };
      // Panel Embed
      cfg.panelEmbed = {
        title: req.body.panelTitle || '',
        description: req.body.panelDescription || '',
        color: req.body.panelColor || '#5865F2',
        footer: req.body.panelFooter || ''
      };

      // RAW JSON (optional)
      if(req.body.topicsJson){
        try { const parsed = JSON.parse(req.body.topicsJson); if(Array.isArray(parsed)) cfg.topics = parsed; } catch{}
      }
      if(req.body.formFieldsJson){
        try { const parsed = JSON.parse(req.body.formFieldsJson); if(Array.isArray(parsed)) cfg.formFields = parsed; } catch{}
      }

      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg,null,2));
      return res.redirect('/panel?msg=saved');
    } catch(err){
      console.error(err);
      return res.status(500).send('Fehler beim Speichern');
    }
  });

  /* ---- Panel Nachricht senden ---- */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const id = await buildPanelMessage(req.body.channelId);
      cfg.panelChannelId = req.body.channelId;
      cfg.panelMessageId = id;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(err){ console.error(err); res.status(500).send('Fehler beim Senden: '+err.message); }
  });

  /* ---- Panel Nachricht bearbeiten ---- */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      await buildPanelMessage(cfg.panelChannelId, cfg.panelMessageId);
      res.redirect('/panel?msg=edited');
    } catch(err){ console.error(err); res.status(500).send('Fehler beim Bearbeiten: '+err.message); }
  });

  /* ---- Ticket Übersicht (Offen + Geschlossen) ---- */
  router.get('/tickets', isAuth, (req,res)=>{
    let tickets = [];
    try { tickets = JSON.parse(fs.readFileSync(TICKETS_PATH,'utf8')); } catch{}

    // Sortieren: neueste oben
    tickets.sort((a,b)=> b.timestamp - a.timestamp);

    const openTickets  = tickets.filter(t=>t.status !== 'geschlossen');
    const closedTickets= tickets.filter(t=>t.status === 'geschlossen');

    // Optional: einfache Suche (?q=123)
    const q = (req.query.q||'').trim();
    let filteredOpen = openTickets;
    let filteredClosed = closedTickets;
    if(q){
      const lc = q.toLowerCase();
      const match = t => `${t.id}`.includes(lc) || (t.topic||'').toLowerCase().includes(lc) || (t.userId||'').includes(lc);
      filteredOpen = filteredOpen.filter(match);
      filteredClosed = filteredClosed.filter(match);
    }

    res.render('tickets', { cfg, q, open: filteredOpen, closed: filteredClosed, counts: { all:tickets.length, open:openTickets.length, closed:closedTickets.length } });
  });

  return router;
};