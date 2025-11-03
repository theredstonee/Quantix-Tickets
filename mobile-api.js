// Mobile API für Quantix Tickets Android App
// REST API Endpunkte für native mobile Anwendungen

const express = require('express');
const router = express.Router();
const { readCfg, loadTickets, saveTickets } = require('./panel.js');
const { EmbedBuilder } = require('discord.js');

// Middleware für API Authentication
function requireAuth(req, res, next) {
  if (!req.session || !req.session.passport || !req.session.passport.user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Bitte einloggen' });
  }
  next();
}

// DEBUG: Session-Info Endpoint (zum Testen)
router.get('/debug/session', (req, res) => {
  console.log('[DEBUG] Session Info Request');
  console.log('[DEBUG] Cookies:', req.headers.cookie);
  console.log('[DEBUG] Session ID:', req.sessionID);
  console.log('[DEBUG] Session exists:', !!req.session);
  console.log('[DEBUG] Passport exists:', !!(req.session && req.session.passport));
  console.log('[DEBUG] User exists:', !!(req.session && req.session.passport && req.session.passport.user));

  res.json({
    success: true,
    debug: {
      hasSession: !!req.session,
      hasPassport: !!(req.session && req.session.passport),
      hasUser: !!(req.session && req.session.passport && req.session.passport.user),
      sessionID: req.sessionID,
      cookies: req.headers.cookie ? req.headers.cookie.substring(0, 100) + '...' : 'none',
      user: (req.session && req.session.passport && req.session.passport.user)
        ? { id: req.session.passport.user.id, username: req.session.passport.user.username }
        : null
    }
  });
});

// GET /api/user/me - Aktuelle User-Informationen
router.get('/user/me', requireAuth, async (req, res) => {
  try {
    const user = req.session.passport.user;
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/servers - Alle Server des Users
router.get('/servers', requireAuth, async (req, res) => {
  try {
    const user = req.session.passport.user;
    const client = req.app.locals.discordClient;

    const userGuilds = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${req.session.accessToken}` }
    }).then(r => r.json());

    const botGuilds = client.guilds.cache;

    const availableServers = userGuilds
      .filter(g => botGuilds.has(g.id))
      .map(g => {
        const guild = botGuilds.get(g.id);
        return {
          id: g.id,
          name: g.name,
          icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
          memberCount: guild.memberCount
        };
      });

    res.json({
      success: true,
      servers: availableServers
    });
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/tickets/:guildId - Alle Tickets eines Users auf einem Server
router.get('/tickets/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const userId = req.session.passport.user.id;
    const client = req.app.locals.discordClient;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const tickets = loadTickets(guildId);
    const cfg = readCfg(guildId);

    // Filter: Nur Tickets des Users oder wo User Team-Mitglied ist
    const member = await guild.members.fetch(userId).catch(() => null);
    const isTeamMember = member && (
      member.roles.cache.has(cfg.teamRoleId) ||
      Object.values(cfg.priorityRoles || {}).flat().some(roleId => member.roles.cache.has(roleId))
    );

    const userTickets = tickets.filter(t =>
      t.userId === userId ||
      (isTeamMember && t.guildId === guildId) ||
      t.claimer === userId ||
      (t.addedUsers && t.addedUsers.includes(userId))
    );

    // Anreichern mit zusätzlichen Infos
    const enrichedTickets = await Promise.all(userTickets.map(async (ticket) => {
      const creator = await client.users.fetch(ticket.userId).catch(() => null);
      const claimer = ticket.claimer ? await client.users.fetch(ticket.claimer).catch(() => null) : null;

      // Letzte Nachricht aus Channel holen
      let lastMessage = null;
      if (ticket.channelId) {
        const channel = guild.channels.cache.get(ticket.channelId);
        if (channel) {
          const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
          if (messages && messages.size > 0) {
            const msg = messages.first();
            lastMessage = {
              content: msg.content,
              author: {
                id: msg.author.id,
                username: msg.author.username,
                avatar: msg.author.displayAvatarURL()
              },
              timestamp: msg.createdTimestamp
            };
          }
        }
      }

      return {
        id: ticket.id,
        ticketId: ticket.ticketId,
        topic: ticket.topic,
        priority: ticket.priority || 0,
        status: ticket.status || 'open',
        createdAt: ticket.createdAt,
        closedAt: ticket.closedAt,
        creator: creator ? {
          id: creator.id,
          username: creator.username,
          avatar: creator.displayAvatarURL()
        } : null,
        claimer: claimer ? {
          id: claimer.id,
          username: claimer.username,
          avatar: claimer.displayAvatarURL()
        } : null,
        lastMessage,
        unreadCount: 0 // TODO: Implement unread tracking
      };
    }));

    res.json({
      success: true,
      tickets: enrichedTickets,
      server: {
        id: guildId,
        name: guild.name,
        icon: guild.iconURL()
      }
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// GET /api/ticket/:guildId/:ticketId - Einzelnes Ticket mit Nachrichten
router.get('/ticket/:guildId/:ticketId', requireAuth, async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const userId = req.session.passport.user.id;
    const client = req.app.locals.discordClient;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.id === ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket nicht gefunden' });
    }

    // Berechtigungsprüfung
    const cfg = readCfg(guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    const isTeamMember = member && (
      member.roles.cache.has(cfg.teamRoleId) ||
      Object.values(cfg.priorityRoles || {}).flat().some(roleId => member.roles.cache.has(roleId))
    );

    if (ticket.userId !== userId && !isTeamMember && ticket.claimer !== userId &&
        (!ticket.addedUsers || !ticket.addedUsers.includes(userId))) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    // Nachrichten aus Channel holen
    let messages = [];
    if (ticket.channelId) {
      const channel = guild.channels.cache.get(ticket.channelId);
      if (channel) {
        const fetchedMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        if (fetchedMessages) {
          messages = fetchedMessages
            .filter(msg => !msg.author.bot || msg.content.length > 0)
            .map(msg => ({
              id: msg.id,
              content: msg.content,
              author: {
                id: msg.author.id,
                username: msg.author.username,
                avatar: msg.author.displayAvatarURL(),
                bot: msg.author.bot
              },
              timestamp: msg.createdTimestamp,
              attachments: msg.attachments.map(att => ({
                id: att.id,
                filename: att.name,
                url: att.url,
                size: att.size
              })),
              embeds: msg.embeds.length > 0
            }))
            .reverse();
        }
      }
    }

    // Formular-Antworten
    const formResponses = ticket.formResponses || [];

    // Creator & Claimer Info
    const creator = await client.users.fetch(ticket.userId).catch(() => null);
    const claimer = ticket.claimer ? await client.users.fetch(ticket.claimer).catch(() => null) : null;

    res.json({
      success: true,
      ticket: {
        id: ticket.id,
        ticketId: ticket.ticketId,
        topic: ticket.topic,
        priority: ticket.priority || 0,
        status: ticket.status || 'open',
        createdAt: ticket.createdAt,
        closedAt: ticket.closedAt,
        creator: creator ? {
          id: creator.id,
          username: creator.username,
          avatar: creator.displayAvatarURL()
        } : null,
        claimer: claimer ? {
          id: claimer.id,
          username: claimer.username,
          avatar: claimer.displayAvatarURL()
        } : null,
        formResponses,
        channelId: ticket.channelId,
        rating: ticket.rating
      },
      messages,
      permissions: {
        canClose: ticket.userId === userId || isTeamMember || ticket.claimer === userId,
        canClaim: isTeamMember && !ticket.claimer,
        canUnclaim: ticket.claimer === userId,
        canSendMessage: true
      }
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// POST /api/ticket/:guildId/create - Neues Ticket erstellen
router.post('/ticket/:guildId/create', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { topic, priority, formResponses } = req.body;
    const userId = req.session.passport.user.id;
    const client = req.app.locals.discordClient;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const cfg = readCfg(guildId);
    const tickets = loadTickets(guildId);

    // Validierung
    if (!topic || !cfg.topics[topic]) {
      return res.status(400).json({ error: 'Ungültiges Topic' });
    }

    // Ticket-Limit prüfen
    const userOpenTickets = tickets.filter(t => t.userId === userId && t.status === 'open');
    if (userOpenTickets.length >= (cfg.maxTicketsPerUser || 3)) {
      return res.status(400).json({ error: 'Maximale Anzahl an offenen Tickets erreicht' });
    }

    // Ticket erstellen (vereinfachte Version - komplette Logik aus index.js übernehmen)
    const member = await guild.members.fetch(userId);
    const topicConfig = cfg.topics[topic];

    // Ticket ID generieren
    const fs = require('fs');
    const counterFile = `./configs/${guildId}_counter.json`;
    let counter = { count: 1 };
    if (fs.existsSync(counterFile)) {
      counter = JSON.parse(fs.readFileSync(counterFile, 'utf8'));
    }
    const ticketId = counter.count;
    counter.count++;
    fs.writeFileSync(counterFile, JSON.stringify(counter, null, 2));

    // Channel erstellen
    const channelName = `ticket-${ticketId}`;
    const category = guild.channels.cache.get(topicConfig.categoryId);

    const channel = await guild.channels.create({
      name: channelName,
      type: 0, // Text channel
      parent: category,
      permissionOverwrites: [
        { id: guild.id, deny: ['ViewChannel'] },
        { id: userId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        { id: client.user.id, allow: ['ViewChannel', 'SendMessages', 'ManageChannels'] }
      ]
    });

    // Ticket-Objekt
    const newTicket = {
      id: `${Date.now()}-${userId}`,
      ticketId,
      guildId,
      userId,
      topic,
      priority: priority || 0,
      status: 'open',
      channelId: channel.id,
      createdAt: Date.now(),
      formResponses: formResponses || []
    };

    tickets.push(newTicket);
    saveTickets(guildId, tickets);

    // Embed in Channel senden
    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${ticketId}`)
      .setDescription(`**Topic:** ${topic}\n**Erstellt von:** <@${userId}>`)
      .setColor(0x6366F1)
      .setTimestamp();

    if (formResponses && formResponses.length > 0) {
      formResponses.forEach(resp => {
        embed.addFields({ name: resp.label, value: resp.value || '-', inline: false });
      });
    }

    await channel.send({ content: `<@${userId}>`, embeds: [embed] });

    res.json({
      success: true,
      ticket: {
        id: newTicket.id,
        ticketId: newTicket.ticketId,
        channelId: channel.id
      }
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// POST /api/ticket/:guildId/:ticketId/message - Nachricht senden
router.post('/ticket/:guildId/:ticketId/message', requireAuth, async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { content } = req.body;
    const userId = req.session.passport.user.id;
    const client = req.app.locals.discordClient;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Nachricht darf nicht leer sein' });
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.id === ticketId);

    if (!ticket || !ticket.channelId) {
      return res.status(404).json({ error: 'Ticket nicht gefunden' });
    }

    const channel = guild.channels.cache.get(ticket.channelId);
    if (!channel) {
      return res.status(404).json({ error: 'Ticket-Channel nicht gefunden' });
    }

    const message = await channel.send(content);

    res.json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        timestamp: message.createdTimestamp
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// POST /api/ticket/:guildId/:ticketId/close - Ticket schließen
router.post('/ticket/:guildId/:ticketId/close', requireAuth, async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const userId = req.session.passport.user.id;
    const client = req.app.locals.discordClient;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const tickets = loadTickets(guildId);
    const ticketIndex = tickets.findIndex(t => t.id === ticketId);

    if (ticketIndex === -1) {
      return res.status(404).json({ error: 'Ticket nicht gefunden' });
    }

    const ticket = tickets[ticketIndex];

    // Berechtigung prüfen
    const cfg = readCfg(guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    const isTeamMember = member && (member.roles.cache.has(cfg.teamRoleId) ||
      Object.values(cfg.priorityRoles || {}).flat().some(roleId => member.roles.cache.has(roleId)));

    if (ticket.userId !== userId && !isTeamMember && ticket.claimer !== userId) {
      return res.status(403).json({ error: 'Keine Berechtigung zum Schließen' });
    }

    // Ticket schließen
    tickets[ticketIndex].status = 'closed';
    tickets[ticketIndex].closedAt = Date.now();
    tickets[ticketIndex].closedBy = userId;
    saveTickets(guildId, tickets);

    // Channel löschen
    if (ticket.channelId) {
      const channel = guild.channels.cache.get(ticket.channelId);
      if (channel) {
        await channel.delete().catch(console.error);
      }
    }

    res.json({
      success: true,
      message: 'Ticket wurde geschlossen'
    });
  } catch (error) {
    console.error('Error closing ticket:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// GET /api/topics/:guildId - Verfügbare Topics
router.get('/topics/:guildId', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.params;
    const client = req.app.locals.discordClient;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }

    const cfg = readCfg(guildId);
    const topics = Object.entries(cfg.topics || {}).map(([name, config]) => ({
      name,
      emoji: config.emoji || '🎫',
      description: config.description || '',
      formFields: config.formFields || []
    }));

    res.json({
      success: true,
      topics
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/fcm/register - Register FCM Token
router.post('/fcm/register', requireAuth, async (req, res) => {
  try {
    const { token, deviceId } = req.body;
    const userId = req.session.passport.user.id;

    if (!token) {
      return res.status(400).json({ error: 'Token erforderlich' });
    }

    // Save FCM token to database or file
    const fs = require('fs');
    const path = require('path');
    const tokensFile = path.join('./configs', 'fcm_tokens.json');

    let tokens = {};
    if (fs.existsSync(tokensFile)) {
      tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
    }

    tokens[userId] = {
      token,
      deviceId: deviceId || 'unknown',
      registeredAt: Date.now(),
      lastUpdated: Date.now()
    };

    fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2));

    console.log(`FCM Token registered for user ${userId}`);

    res.json({
      success: true,
      message: 'Token erfolgreich registriert'
    });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/fcm/unregister - Unregister FCM Token
router.delete('/fcm/unregister', requireAuth, async (req, res) => {
  try {
    const userId = req.session.passport.user.id;

    const fs = require('fs');
    const path = require('path');
    const tokensFile = path.join('./configs', 'fcm_tokens.json');

    if (fs.existsSync(tokensFile)) {
      let tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
      delete tokens[userId];
      fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2));
    }

    console.log(`FCM Token unregistered for user ${userId}`);

    res.json({
      success: true,
      message: 'Token erfolgreich entfernt'
    });
  } catch (error) {
    console.error('Error unregistering FCM token:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Helper function to send push notification
async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const fs = require('fs');
    const path = require('path');
    const tokensFile = path.join('./configs', 'fcm_tokens.json');

    if (!fs.existsSync(tokensFile)) {
      console.log('No FCM tokens registered');
      return;
    }

    const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
    const userToken = tokens[userId];

    if (!userToken) {
      console.log(`No FCM token for user ${userId}`);
      return;
    }

    // TODO: Implement Firebase Admin SDK to send push notification
    // const admin = require('firebase-admin');
    // await admin.messaging().send({
    //   token: userToken.token,
    //   notification: { title, body },
    //   data
    // });

    console.log(`Push notification sent to user ${userId}: ${title}`);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

module.exports = router;
module.exports.sendPushNotification = sendPushNotification;
