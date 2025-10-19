const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'configs');

function loadTickets(guildId) {
  try {
    const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
    if (!fs.existsSync(ticketsPath)) return [];
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Generates CSV export of tickets
 */
function generateCSVExport(guildId, options = {}) {
  const tickets = loadTickets(guildId);
  const { startDate, endDate, status, priority } = options;

  // Filter tickets based on options
  let filtered = tickets;

  if (startDate) {
    const start = new Date(startDate).getTime();
    filtered = filtered.filter(t => new Date(t.timestamp).getTime() >= start);
  }

  if (endDate) {
    const end = new Date(endDate).getTime();
    filtered = filtered.filter(t => new Date(t.timestamp).getTime() <= end);
  }

  if (status) {
    filtered = filtered.filter(t => t.status === status);
  }

  if (priority !== undefined && priority !== 'all') {
    filtered = filtered.filter(t => (t.priority || 0) === parseInt(priority));
  }

  // CSV Header
  const headers = [
    'Ticket ID',
    'Status',
    'Priorität',
    'Thema',
    'Ersteller (User ID)',
    'Claimer (User ID)',
    'Erstellt am',
    'Geschlossen am',
    'Lösungszeit (Stunden)',
    'Channel ID',
    'Tags'
  ];

  const rows = filtered.map(ticket => {
    const createdAt = new Date(ticket.timestamp);
    const closedAt = ticket.closedAt ? new Date(ticket.closedAt) : null;
    const resolutionTime = closedAt
      ? ((closedAt - createdAt) / (1000 * 60 * 60)).toFixed(2)
      : '';

    const priorityLabels = ['Niedrig', 'Mittel', 'Hoch'];
    const priority = priorityLabels[ticket.priority || 0];

    const tags = (ticket.tags || []).join('; ');

    return [
      ticket.id,
      ticket.status,
      priority,
      escapeCSV(ticket.topic || ''),
      ticket.userId || '',
      ticket.claimer || '',
      createdAt.toLocaleString('de-DE'),
      closedAt ? closedAt.toLocaleString('de-DE') : '',
      resolutionTime,
      ticket.channelId || '',
      tags
    ];
  });

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => escapeCSV(cell.toString())).join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Generates detailed statistics CSV
 */
function generateStatsCSVExport(guildId) {
  const tickets = loadTickets(guildId);

  // Topic Statistics
  const topicStats = {};
  tickets.forEach(ticket => {
    const topic = ticket.topic || 'Unbekannt';
    if (!topicStats[topic]) {
      topicStats[topic] = {
        total: 0,
        closed: 0,
        open: 0,
        avgResolution: []
      };
    }

    topicStats[topic].total++;

    if (ticket.status === 'geschlossen') {
      topicStats[topic].closed++;

      if (ticket.closedAt) {
        const resolutionTime = (new Date(ticket.closedAt) - new Date(ticket.timestamp)) / (1000 * 60 * 60);
        topicStats[topic].avgResolution.push(resolutionTime);
      }
    } else {
      topicStats[topic].open++;
    }
  });

  // Build Stats CSV
  const headers = ['Thema', 'Gesamt', 'Geschlossen', 'Offen', 'Ø Lösungszeit (Stunden)'];
  const rows = Object.entries(topicStats).map(([topic, stats]) => {
    const avgTime = stats.avgResolution.length > 0
      ? (stats.avgResolution.reduce((sum, t) => sum + t, 0) / stats.avgResolution.length).toFixed(2)
      : '';

    return [
      escapeCSV(topic),
      stats.total,
      stats.closed,
      stats.open,
      avgTime
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Escapes special characters for CSV
 */
function escapeCSV(str) {
  if (str === null || str === undefined) return '';
  str = str.toString();

  // Escape quotes and wrap in quotes if needed
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

module.exports = {
  generateCSVExport,
  generateStatsCSVExport
};
