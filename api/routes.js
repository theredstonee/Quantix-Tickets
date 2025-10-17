const express = require('express');
const router = express.Router();

// Middleware: Check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Nicht authentifiziert' });
}

// Middleware: Check if user is admin of selected guild
async function isAdmin(req, res, next) {
  const guildId = req.session?.selectedGuild;
  if (!guildId) {
    return res.status(400).json({ error: 'Kein Server ausgewählt' });
  }

  try {
    const guild = await req.app.locals.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(req.user.id);

    if (member.permissions.has('Administrator')) {
      return next();
    }

    return res.status(403).json({ error: 'Keine Administrator-Rechte' });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Überprüfen der Berechtigungen' });
  }
}

// Middleware: Check if user is admin OR team member
async function isAdminOrTeam(req, res, next) {
  const guildId = req.session?.selectedGuild;
  if (!guildId) {
    return res.status(400).json({ error: 'Kein Server ausgewählt' });
  }

  try {
    const guild = await req.app.locals.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(req.user.id);

    // Check if admin
    if (member.permissions.has('Administrator')) {
      return next();
    }

    // Check if team member
    const { readCfg } = require('../panel.js');
    const cfg = readCfg(guildId);
    const teamRoleId = cfg.teamRoleId;

    if (teamRoleId && member.roles.cache.has(teamRoleId)) {
      return next();
    }

    return res.status(403).json({ error: 'Keine Berechtigung' });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Überprüfen der Berechtigungen' });
  }
}

// ============================================================
// USER & AUTH ENDPOINTS
// ============================================================

// GET /api/user - Get current user info
router.get('/user', isAuthenticated, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    discriminator: req.user.discriminator,
    avatar: req.user.avatar,
    selectedGuild: req.session?.selectedGuild || null
  });
});

// POST /api/select-guild - Select a guild
router.post('/select-guild', isAuthenticated, async (req, res) => {
  const { guildId } = req.body;

  if (!guildId) {
    return res.status(400).json({ error: 'Guild ID erforderlich' });
  }

  try {
    const guild = await req.app.locals.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(req.user.id);

    if (!member.permissions.has('Administrator')) {
      return res.status(403).json({ error: 'Keine Administrator-Rechte' });
    }

    req.session.selectedGuild = guildId;
    res.json({ success: true, guildId });
  } catch (err) {
    res.status(500).json({ error: 'Server nicht gefunden' });
  }
});

// GET /api/guilds - Get user's guilds where they have admin perms
router.get('/guilds', isAuthenticated, async (req, res) => {
  try {
    const client = req.app.locals.client;
    const userId = req.user.id;

    const userGuilds = await fetch(`https://discord.com/api/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${req.user.accessToken}` }
    }).then(r => r.json());

    const adminGuilds = userGuilds.filter(g => {
      const perms = BigInt(g.permissions);
      return (perms & 0x8n) === 0x8n; // Administrator permission
    });

    const botGuilds = client.guilds.cache;

    const availableGuilds = adminGuilds
      .filter(g => botGuilds.has(g.id))
      .map(g => {
        const guild = botGuilds.get(g.id);
        return {
          id: g.id,
          name: g.name,
          icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
        };
      });

    res.json({
      guilds: availableGuilds,
      currentGuild: req.session?.selectedGuild || null
    });
  } catch (err) {
    console.error('Guilds fetch error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Server' });
  }
});

// ============================================================
// CONFIG ENDPOINTS
// ============================================================

// GET /api/config - Get guild configuration
router.get('/config', isAuthenticated, isAdmin, (req, res) => {
  const guildId = req.session.selectedGuild;
  const { readCfg } = require('../panel.js');
  const cfg = readCfg(guildId);

  res.json({ config: cfg });
});

// POST /api/config - Update guild configuration
router.post('/config', isAuthenticated, isAdmin, async (req, res) => {
  const guildId = req.session.selectedGuild;
  const { readCfg, writeCfg } = require('../panel.js');

  try {
    const cfg = readCfg(guildId);
    const updates = req.body;

    // Merge updates into config
    Object.assign(cfg, updates);

    writeCfg(guildId, cfg);

    res.json({ success: true, config: cfg });
  } catch (err) {
    console.error('Config update error:', err);
    res.status(500).json({ error: 'Fehler beim Speichern der Konfiguration' });
  }
});

// ============================================================
// TICKETS ENDPOINTS
// ============================================================

// GET /api/tickets - Get all tickets
router.get('/tickets', isAuthenticated, isAdmin, (req, res) => {
  const guildId = req.session.selectedGuild;
  const { loadTickets } = require('../panel.js');

  try {
    const tickets = loadTickets(guildId);
    res.json({ tickets });
  } catch (err) {
    console.error('Tickets load error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Tickets' });
  }
});

// GET /api/tickets/:id - Get specific ticket
router.get('/tickets/:id', isAuthenticated, isAdminOrTeam, (req, res) => {
  const guildId = req.session.selectedGuild;
  const ticketId = req.params.id;
  const { loadTickets } = require('../panel.js');

  try {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.id === ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket nicht gefunden' });
    }

    res.json({ ticket });
  } catch (err) {
    console.error('Ticket load error:', err);
    res.status(500).json({ error: 'Fehler beim Laden des Tickets' });
  }
});

// ============================================================
// ANALYTICS ENDPOINTS
// ============================================================

// GET /api/analytics - Get analytics data
router.get('/analytics', isAuthenticated, isAdminOrTeam, async (req, res) => {
  const guildId = req.session.selectedGuild;
  const { loadTickets } = require('../panel.js');
  const { getPremiumInfo, hasFeature } = require('../premium.js');

  try {
    // Check premium
    const premiumInfo = getPremiumInfo(guildId);
    if (!hasFeature(guildId, 'analytics')) {
      return res.status(403).json({ error: 'Analytics ist ein Pro-Feature' });
    }

    const tickets = loadTickets(guildId);
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const stats = {
      total: tickets.length,
      closed: tickets.filter(t => t.closedAt).length,
      open: tickets.filter(t => !t.closedAt).length,
      claimed: tickets.filter(t => t.claimerId).length,
      today: tickets.filter(t => t.createdAt > oneDayAgo).length,
      last7Days: tickets.filter(t => t.createdAt > sevenDaysAgo).length,
      last30Days: tickets.filter(t => t.createdAt > thirtyDaysAgo).length,
      avgPerDay: (tickets.filter(t => t.createdAt > thirtyDaysAgo).length / 30).toFixed(1),
      byTopic: {},
      byPriority: {},
      topClaimers: {}
    };

    // Calculate by topic
    tickets.forEach(t => {
      const topic = t.topic || 'Unbekannt';
      stats.byTopic[topic] = (stats.byTopic[topic] || 0) + 1;
    });

    // Calculate by priority
    tickets.forEach(t => {
      const priority = t.priority !== undefined ? t.priority : 'Keine';
      stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
    });

    // Calculate top claimers
    tickets.filter(t => t.claimerId).forEach(t => {
      stats.topClaimers[t.claimerId] = (stats.topClaimers[t.claimerId] || 0) + 1;
    });

    res.json({ analytics: stats });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Analytics' });
  }
});

// ============================================================
// PREMIUM ENDPOINTS
// ============================================================

// GET /api/premium - Get premium info
router.get('/premium', isAuthenticated, isAdmin, (req, res) => {
  const guildId = req.session.selectedGuild;
  const { getPremiumInfo } = require('../premium.js');

  try {
    const premiumInfo = getPremiumInfo(guildId);
    res.json({ premium: premiumInfo });
  } catch (err) {
    console.error('Premium info error:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Premium-Informationen' });
  }
});

// ============================================================
// TRANSCRIPT ENDPOINTS
// ============================================================

// GET /api/transcript/:id - Get transcript HTML
router.get('/transcript/:id', isAuthenticated, isAdminOrTeam, (req, res) => {
  const guildId = req.session.selectedGuild;
  const ticketId = req.params.id;
  const fs = require('fs');
  const path = require('path');

  try {
    const transcriptPath = path.join(__dirname, '..', 'transcripts', guildId, `transcript_${ticketId}.html`);

    if (!fs.existsSync(transcriptPath)) {
      return res.status(404).json({ error: 'Transcript nicht gefunden' });
    }

    const html = fs.readFileSync(transcriptPath, 'utf-8');
    res.send(html);
  } catch (err) {
    console.error('Transcript load error:', err);
    res.status(500).json({ error: 'Fehler beim Laden des Transcripts' });
  }
});

module.exports = router;
