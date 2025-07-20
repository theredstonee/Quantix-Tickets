// panel.js – Erweiterung: FormFields bearbeiten + sichere Topics/Forms Speicherung
// Features:
//  * Login / Auth unverändert
//  * Speichern der Topics wie bisher (Tabellen-Einträge > optional JSON Override)
//  * NEU: FormFields-Verarbeitung aus einfachem Tabellen-Formular ODER JSON (falls Tabelle leer)
//  * FormField Struktur: { label, customId, style:"short"|"paragraph", required:true/false, min:0, max:200, placeholder }
//  * Validierung & Normalisierung (Grenzen für Länge)
//  * Routen /panel, /panel/send, /panel/edit unverändert außer dass formFields geschrieben werden
//  * Helper buildPanelSelect unverändert
//  * (Front-End Anpassung in panel.ejs nötig: Tabelle für FormFields – kommt separat)

require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

/* ====== Config laden ====== */
const CONFIG = path.join(__dirname, 'config.json');
function readCfg(){ try { return JSON.parse(fs.readFileSync(CONFIG,'utf8')); } catch { return {}; } }
let cfg = readCfg();

/* ====== Basis‑URL (für Callback) ====== */
const BASE = process.env.PUBLIC_BASE_URL || '';

/* ====== Passport Serialisierung ====== */
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

/* ====== Discord Strategy ====== */
passport.use(new Strategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: BASE ? `${BASE.replace(/\/$/,'')}/auth/discord/callback` : '/auth/discord/callback',
  scope: ['identify','guilds','guilds.members.read'],
  state: true
}, (_a,_b,profile,done)=>done(null,profile)));

module.exports = (client)=>{
  const router = express.Router();

  /* ====== Session ====== */
  router.use(session({
    secret: process.env.SESSION_SECRET || 'ticketbotsecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: /^https:\/\//i.test(BASE)
    }
  }));

  router.use(passport.initialize());
  router.use(passport.session());
  router.use(express.urlencoded({extended:true}));

  /* ====== Helper: Auth Middleware ====== */
  function isAuth(req,res,next){
    if(!(req.isAuthenticated && req.isAuthenticated())) return res.redirect('/login');
    const entry = req.user.guilds?.find(g=>g.id===cfg.guildId);
    if(!entry) return res.status(403).send('Nicht auf Ziel‑Server.');
    const ALLOWED = 0x8n | 0x20n; // Admin oder Manage Guild
    if(!(BigInt(entry.permissions) & ALLOWED)) return res.status(403).send('Keine Berechtigung.');
    next();
  }

  /* ====== Root ====== */
  router.get('/', (req,res)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    res.send('<h1>Ticket Panel</h1><p><a href="/login">Login mit Discord</a></p>');
  });

  /* ====== Login Rate-Limit ====== */
  router.get('/login', (req,res,next)=>{
    if(req.isAuthenticated && req.isAuthenticated()) return res.redirect('/panel');
    const now = Date.now();
    if(now - (req.session.lastLoginAttempt||0) < 4000){
      return res.status(429).send('Zu viele Login‑Versuche – bitte 4s warten. <a href="/">Zurück</a>');
    }
    req.session.lastLoginAttempt = now;
    next();
  }, passport.authenticate('discord'));

  /* ====== OAuth Callback ====== */
  router.get('/auth/discord/callback', (req,res,next)=>{
    passport.authenticate('discord',(err,user)=>{
      if(err){
        console.error('OAuth Fehler:', err);
        if(err.oauthError) return res.status(429).send('<h2>Rate Limit</h2><p>Bitte kurz warten.</p><p><a href="/login">Login</a></p>');
        return res.status(500).send('OAuth Fehler.');
      }
      if(!user) return res.redirect('/login');
      req.logIn(user,(e)=>{
        if(e){ console.error('Session Fehler:', e); return res.status(500).send('Session Fehler.'); }
        res.redirect('/panel');
      });
    })(req,res,next);
  });

  /* ====== Logout ====== */
  router.get('/logout',(req,res)=>{
    req.logout?.(()=>{});
    req.session.destroy(()=>res.redirect('/'));
  });

  /* ====== Panel Ansicht ====== */
  router.get('/panel', isAuth, (req,res)=>{
    cfg = readCfg();
    res.render('panel', { cfg, msg:req.query.msg||null });
  });

  /* ====== Panel speichern (Topics + Embeds + FormFields) ====== */
  router.post('/panel', isAuth, (req,res)=>{
    try {
      cfg = readCfg();
      // 1. Topics Tabelle
      const labelInputs = [].concat(req.body.label||[]);
      const valueInputs = [].concat(req.body.value||[]);
      const emojiInputs = [].concat(req.body.emoji||[]);

      let tableTopics = [];
      for(let i=0;i<labelInputs.length;i++){
        const L = (labelInputs[i]||'').trim();
        if(!L) continue; // leere / gelöschte Zeilen
        const Vraw = (valueInputs[i]||'').trim();
        const E = (emojiInputs[i]||'').trim();
        const V = Vraw || L.toLowerCase().replace(/\s+/g,'-');
        tableTopics.push({ label:L, value:V, emoji:E||undefined });
      }

      const hasTableTopics = tableTopics.length > 0;
      if(!hasTableTopics){
        const rawJson = (req.body.topicsJson||'').trim();
        if(rawJson){
          try { const parsed = JSON.parse(rawJson); if(Array.isArray(parsed)) tableTopics = parsed; } catch(err){ console.warn('topicsJson parse Fehler ignoriert'); }
        }
      }
      cfg.topics = tableTopics; // kann [] sein

      // 2. FormFields Tabelle (falls später in panel.ejs vorhanden)
      const ffLabel = [].concat(req.body.ff_label||[]);      // Anzeigename
      const ffId    = [].concat(req.body.ff_id||[]);         // customId
      const ffStyle = [].concat(req.body.ff_style||[]);      // short|paragraph
      const ffReq   = [].concat(req.body.ff_required||[]);   // 'on' oder undefined
      const ffMin   = [].concat(req.body.ff_min||[]);
      const ffMax   = [].concat(req.body.ff_max||[]);
      const ffPH    = [].concat(req.body.ff_placeholder||[]);

      let formFields = [];
      for(let i=0;i<ffLabel.length;i++){
        const lbl = (ffLabel[i]||'').trim();
        if(!lbl) continue; // leere Zeile ignorieren
        const cidRaw = (ffId[i]||'').trim();
        const cid = cidRaw || lbl.toLowerCase().replace(/[^a-z0-9_\-]/gi,'_');
        let style = (ffStyle[i]||'short').toLowerCase();
        if(!['short','paragraph'].includes(style)) style='short';
        const required = Array.isArray(ffReq) ? (ffReq[i]==='on' || ffReq.includes(String(i)) || ffReq.includes('true')) : (ffReq==='on');
        let min = parseInt(ffMin[i]||'0',10); if(isNaN(min)||min<0) min=0; if(min>190) min=190;
        let max = parseInt(ffMax[i]|| (style==='short'?'100':'500'),10); if(isNaN(max)) max = (style==='short'?100:500);
        if(max<min+1) max = min+1; if(max>2000) max=2000; // Discord Hard-Limits: Short 1..100, Paragraph bis 4000 (hier konservativ)
        if(style==='short' && max>100) max=100; // Discord limit
        const placeholder = (ffPH[i]||'').slice(0,100); // Placeholder max 100 chars
        formFields.push({ label:lbl, customId:cid, style, required, min, max, placeholder });
      }

      // Falls keine Tabellen-FormFields -> JSON verwenden (falls da)
      if(formFields.length===0){
        const rawFF = (req.body.formFieldsJson||'').trim();
        if(rawFF){
          try {
            const parsedFF = JSON.parse(rawFF);
            if(Array.isArray(parsedFF)){
              formFields = parsedFF.filter(f=>f && typeof f==='object' && f.label && f.customId);
            }
          } catch(err){ console.warn('formFieldsJson parse Fehler ignoriert'); }
        }
      }
      cfg.formFields = formFields; // kann [] sein

      // 3. Embeds (mit Farbvalidierung)
      function valColor(c, fallback){ return /^#?[0-9a-fA-F]{6}$/.test(c||'') ? c : fallback; }
      cfg.ticketEmbed = {
        title: req.body.embedTitle || cfg.ticketEmbed?.title || '',
        description: req.body.embedDescription || cfg.ticketEmbed?.description || '',
        color: valColor(req.body.embedColor || cfg.ticketEmbed?.color, '#2b90d9'),
        footer: req.body.embedFooter || cfg.ticketEmbed?.footer || ''
      };
      cfg.panelEmbed = {
        title: req.body.panelTitle || cfg.panelEmbed?.title || '',
        description: req.body.panelDescription || cfg.panelEmbed?.description || '',
        color: valColor(req.body.panelColor || cfg.panelEmbed?.color, '#5865F2'),
        footer: req.body.panelFooter || cfg.panelEmbed?.footer || ''
      };

      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=saved');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht senden ====== */
  router.post('/panel/send', isAuth, async (req,res)=>{
    try {
      cfg = readCfg();
      cfg.panelChannelId = req.body.channelId;
      const guild   = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const row = buildPanelSelect(cfg);
      let embed = buildPanelEmbed(cfg);
      const sent = await channel.send({ embeds: embed? [embed]: undefined, components:[row] });
      cfg.panelMessageId = sent.id;
      fs.writeFileSync(CONFIG, JSON.stringify(cfg,null,2));
      res.redirect('/panel?msg=sent');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Panel Nachricht bearbeiten ====== */
  router.post('/panel/edit', isAuth, async (_req,res)=>{
    if(!cfg.panelChannelId || !cfg.panelMessageId) return res.redirect('/panel?msg=nopanel');
    try {
      cfg = readCfg();
      const guild   = await client.guilds.fetch(cfg.guildId);
      const channel = await guild.channels.fetch(cfg.panelChannelId);
      const msg     = await channel.messages.fetch(cfg.panelMessageId);
      const row     = buildPanelSelect(cfg);
      const embed   = buildPanelEmbed(cfg);
      await msg.edit({ embeds: embed? [embed]: undefined, components:[row] });
      res.redirect('/panel?msg=edited');
    } catch(e){ console.error(e); res.redirect('/panel?msg=error'); }
  });

  /* ====== Tickets Übersicht (JSON Raw) ====== */
  router.get('/tickets', isAuth, (_req,res)=>{
    try { const tickets = JSON.parse(fs.readFileSync(path.join(__dirname,'tickets.json'),'utf8')); res.json(tickets); }
    catch { res.json([]); }
  });

  return router;
};

/* ====== Helper für Select & Embed ====== */
function buildPanelSelect(cfg){
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('topic').setPlaceholder('Thema wählen …').addOptions((cfg.topics||[]).map(t=>({label:t.label,value:t.value,emoji:t.emoji||undefined})))
  );
}
function buildPanelEmbed(cfg){
  if(!cfg.panelEmbed || (!cfg.panelEmbed.title && !cfg.panelEmbed.description)) return null;
  const e = new EmbedBuilder();
  if(cfg.panelEmbed.title) e.setTitle(cfg.panelEmbed.title);
  if(cfg.panelEmbed.description) e.setDescription(cfg.panelEmbed.description);
  if(cfg.panelEmbed.color && /^#?[0-9a-fA-F]{6}$/.test(cfg.panelEmbed.color)) e.setColor(parseInt(cfg.panelEmbed.color.replace('#',''),16));
  if(cfg.panelEmbed.footer) e.setFooter({ text: cfg.panelEmbed.footer });
  return e;
}
