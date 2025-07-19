// --- panel.js | Komplettes Web-Panel mit anpassbarem Panel-Embed & Ticket-Embed ---
// - OAuth2 Login (passport-discord)
// - Admin/Manage Guild Check
// - Kategorien (Topics) bearbeiten (Tabellen-Form)
// - Ticket-Embed (Nachricht im Ticket-Kanal) konfigurierbar
// - Panel-Embed (Dropdown-Nachricht) konfigurierbar
// - Panel-Nachricht senden & bearbeiten
// HINWEIS: Stelle sicher, dass CLIENT_ID / CLIENT_SECRET / SESSION_SECRET im .env stehen.

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

const CONFIG = path.join(__dirname,'config.json');
function safeRead(p,fb){ try{ const d=fs.readFileSync(p,'utf8'); return d?JSON.parse(d):fb; }catch{ return fb; } }
let cfg = safeRead(CONFIG,{});

/* Defaults falls fehlen */
if(!cfg.topics) cfg.topics = [];
if(!cfg.ticketEmbed) cfg.ticketEmbed = {
  title:'🎫 Ticket #{ticketNumber}',
  description:'Hallo {userMention}\n**Thema:** {topicLabel}',
  color:'#2b90d9',
  footer:'Ticket #{ticketNumber}'
};
if(!cfg.panelEmbed) cfg.panelEmbed = {
  title:'🎟️ Ticket erstellen',
  description:'Wähle unten dein Thema aus.',
  color:'#5865F2',
  footer:'Support Panel'
};

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

passport.use(new Strategy({
  clientID:     process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL:  '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read']
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave:false,
    saveUninitialized:false
  }));
  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  function isAuth(req,res,next){
    if(!req.isAuthenticated()) return res.redirect('/login');
    cfg = safeRead(CONFIG,cfg); // reload config
    const g = req.user.guilds.find(g=>g.id===cfg.guildId);
    const ALLOWED = 0x8n | 0x20n; // Admin | Manage Guild
    if(!g || !(BigInt(g.permissions) & ALLOWED)) return res.send('Keine Berechtigung');
    next();
  }

  async function buildPanelMessage(channelId, messageId=null){
    cfg = safeRead(CONFIG,cfg);
    if(!cfg.panelEmbed){
      cfg.panelEmbed = { title:'🎟️ Ticket erstellen', description:'Wähle unten dein Thema aus.', color:'#5865F2', footer:'Support Panel' };
    }
    const guild   = await client.guilds.fetch(cfg.guildId);
    const channel = await guild.channels.fetch(channelId);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('topic')
      .setPlaceholder('Thema wählen …')
      .addOptions(cfg.topics);

    const p = cfg.panelEmbed;
    const embed = new EmbedBuilder()
      .setTitle(p.title || '🎟️ Ticket erstellen')
      .setDescription(p.description || 'Bitte Thema auswählen');
    if(p.color && /^#?[0-9a-fA-F]{6}$/.test(p.color))
      embed.setColor(parseInt(p.color.replace('#',''),16));
    if(p.footer) embed.setFooter({ text:p.footer });

    const payload = { embeds:[embed], components:[ new ActionRowBuilder().addComponents(menu) ] };

    if(messageId){
      const msg = await channel.messages.fetch(messageId).catch(()=>null);
      if(!msg){
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

  /* Auth Routes */
  router.get('/login', passport.authenticate('discord'));
  router.get('/auth/discord/callback', passport.authenticate('discord',{failureRedirect:'/'}),(req,res)=>res.redirect('/panel'));

  /* Panel View */
  router.get('/panel', isAuth, (req,res)=>{
    cfg = safeRead(CONFIG,cfg);
    res.render('panel',{ cfg, msg:req.query.msg||null });
  });

  /* Save Form */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = safeRead(CONFIG,cfg);
      // Topics aus Tabelle (Mehrere Felder label/value/emoji)
      if(req.body.label){
        const labels = Array.isArray(req.body.label)? req.body.label : [req.body.label];
        const values = Array.isArray(req.body.value)? req.body.value : [req.body.value];
        const emojis = Array.isArray(req.body.emoji)? req.body.emoji : [req.body.emoji];
        const topics = [];
        labels.forEach((l,i)=>{
          if(!l.trim()) return;
          topics.push({
            label: l.trim(),
            value: (values[i] && values[i].trim()) || l.toLowerCase(),
            emoji: (emojis[i] && emojis[i].trim()) || ''
          });
        });
        cfg.topics = topics;
      }
      // Ticket Embed Felder
      if(!cfg.ticketEmbed) cfg.ticketEmbed = {};
      cfg.ticketEmbed.title       = req.body.embedTitle       || '🎫 Ticket #{ticketNumber}';
      cfg.ticketEmbed.description = req.body.embedDescription || 'Hallo {userMention}\n**Thema:** {topicLabel}';
      cfg.ticketEmbed.color       = req.body.embedColor       || '#2b90d9';
      cfg.ticketEmbed.footer      = req.body.embedFooter      || 'Ticket #{ticketNumber}';
      if(!/^#?[0-9a-fA-F]{6}$/.test(cfg.ticketEmbed.color)) cfg.ticketEmbed.color = '#2b90d9';

      // Panel Embed Felder
      if(!cfg.panelEmbed) cfg.panelEmbed = {};
      cfg.panelEmbed.title       = req.body.panelTitle       || '🎟️ Ticket erstellen';
      cfg.panelEmbed.description = req.body.panelDescription || 'Wähle unten dein Thema aus.';
      cfg.panelEmbed.color       = req.body.panelColor       || '#5865F2';
      cfg.panelEmbed.footer      = req.body.panelFooter      || 'Support Panel';
      if(!/^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) cfg.panelEmbed.color = '#5865F2';

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    } catch(err){
      console.error(err);
      res.redirect('/panel?msg=error');
    }
  });

  /* Panel Nachricht senden */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      const chId = req.body.channelId || cfg.panelChannelId;
      if(!chId) return res.redirect('/panel?msg=nochannel');
      const id = await buildPanelMessage(chId, null);
      cfg.panelChannelId = chId;
      cfg.panelMessageId = id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(e){
      console.error(e);
      res.redirect('/panel?msg=error');
    }
  });

  /* Panel Nachricht bearbeiten */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      await buildPanelMessage(cfg.panelChannelId, cfg.panelMessageId);
      res.redirect('/panel?msg=edited');
    } catch(e){
      console.error(e);
      res.redirect('/panel?msg=error');
    }
  });

  return router;
};