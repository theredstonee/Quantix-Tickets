// --- panel.js | Panel + anpassbares Panel-Embed & Ticket-Embed ---
require('dotenv').config();
const express   = require('express');
const session   = require('express-session');
const passport  = require('passport');
const { Strategy } = require('passport-discord');
const fs        = require('fs');
const path      = require('path');
const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder
} = require('discord.js');

const CONFIG = path.join(__dirname, 'config.json');
let cfg = require(CONFIG);

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read']
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client) => {
  const router = express.Router();

  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false
  }));
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  function isAuth(req,res,next){
    if(!req.isAuthenticated()) return res.redirect('/login');
    const g = req.user.guilds.find(g=>g.id===cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Admin | Manage Guild
    if(!g || !(BigInt(g.permissions) & ALLOWED)) return res.send('Keine Berechtigung');
    next();
  }

  // Defaults
  if(!cfg.ticketEmbed){
    cfg.ticketEmbed = {
      title:'🎫 Ticket #{ticketNumber}',
      description:'Hallo {userMention}\\n**Thema:** {topicLabel}',
      color:'#2b90d9',
      footer:'Ticket #{ticketNumber}'
    };
  }
  if(!cfg.panelEmbed){
    cfg.panelEmbed = {
      title:'🎟️ Ticket erstellen',
      description:'Wähle unten dein Thema aus.',
      color:'#5865F2',
      footer:'Support Panel'
    };
  }

  async function buildPanelMessage(channelId, messageId=null){
    // immer neu lesen falls Datei extern geändert
    cfg = JSON.parse(fs.readFileSync(CONFIG,'utf8'));
    if(!cfg.panelEmbed){
      cfg.panelEmbed = {
        title:'🎟️ Ticket erstellen',
        description:'Wähle unten dein Thema aus.',
        color:'#5865F2',
        footer:'Support Panel'
      };
    }

    const guild   = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(channelId);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Wähle dein Thema …')
      .addOptions(cfg.topics || []);

    const p = cfg.panelEmbed;
    const embed = new EmbedBuilder()
      .setTitle(p.title || '🎟️ Ticket erstellen')
      .setDescription(p.description || 'Bitte Thema auswählen');

    if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color)){
      embed.setColor(parseInt(p.color.replace('#',''),16));
    }
    if(p.footer){
      embed.setFooter({ text: p.footer });
    }

    const payload = {
      embeds:[embed],
      components:[ new ActionRowBuilder().addComponents(menu) ]
    };

    if(messageId){
      const msg = await channel.messages.fetch(messageId).catch(()=>null);
      if(!msg) {
        const sent = await channel.send(payload);
        return sent.id;
      }
      await msg.edit(payload);
      return msg.id;
    } else {
      const sent = await channel.send(payload);
      return sent.id;
    }
  }

  /* Auth */
  router.get('/login', passport.authenticate('discord'));
  router.get('/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect:'/' }),
    (_req,res)=>res.redirect('/panel')
  );

  /* Panel Seite */
  router.get('/panel', isAuth, (req,res)=>{
    res.render('panel',{ cfg, msg:req.query.msg||null });
  });

  /* Speichern */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      // Topics aus Tabelle: name="label"/"value"/"emoji"
      if(req.body.label){
        const labels = Array.isArray(req.body.label) ? req.body.label : [req.body.label];
        const values = Array.isArray(req.body.value) ? req.body.value : [req.body.value];
        const emojis = Array.isArray(req.body.emoji) ? req.body.emoji : [req.body.emoji];
        const topics = [];
        labels.forEach((l,idx)=>{
          if(!l.trim()) return;
            topics.push({
              label: l.trim(),
              value: (values[idx] && values[idx].trim()) || l.toLowerCase(),
              emoji: (emojis[idx] && emojis[idx].trim()) || ''
            });
        });
        cfg.topics = topics;
      }

      // Ticket Embed Felder
      if(!cfg.ticketEmbed) cfg.ticketEmbed = {};
      cfg.ticketEmbed.title       = req.body.embedTitle       || '🎫 Ticket #{ticketNumber}';
      cfg.ticketEmbed.description = req.body.embedDescription || 'Hallo {userMention}\\n**Thema:** {topicLabel}';
      cfg.ticketEmbed.color       = req.body.embedColor       || '#2b90d9';
      cfg.ticketEmbed.footer      = req.body.embedFooter      || 'Ticket #{ticketNumber}';

      // Panel Embed Felder
      if(!cfg.panelEmbed) cfg.panelEmbed = {};
      cfg.panelEmbed.title       = req.body.panelTitle       || '🎟️ Ticket erstellen';
      cfg.panelEmbed.description = req.body.panelDescription || 'Wähle unten dein Thema aus.';
      cfg.panelEmbed.color       = req.body.panelColor       || '#5865F2';
      cfg.panelEmbed.footer      = req.body.panelFooter      || 'Support Panel';

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    } catch(e){
      console.error(e);
      res.redirect('/panel?msg=error');
    }
  });

  router.post('/panel/send', isAuth, async (req,res)=>{
    try{
      const id = await buildPanelMessage(req.body.channelId || cfg.panelChannelId);
      cfg.panelChannelId = req.body.channelId || cfg.panelChannelId;
      cfg.panelMessageId = id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    }catch(e){
      console.error(e);
      res.redirect('/panel?msg=error');
    }
  });

  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId)
      return res.redirect('/panel?msg=nopanel');
    try{
      await buildPanelMessage(cfg.panelChannelId, cfg.panelMessageId);
      res.redirect('/panel?msg=edited');
    }catch(e){
      console.error(e);
      res.redirect('/panel?msg=error');
    }
  });

  return router;
};
