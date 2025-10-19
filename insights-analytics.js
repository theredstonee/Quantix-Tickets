const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'configs');

function getTicketsPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

function loadTickets(guildId) {
  try {
    const ticketsPath = getTicketsPath(guildId);
    if (!fs.existsSync(ticketsPath)) return [];
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Analyzes ticket creation patterns by hour of day
 */
function getHourlyHeatmap(tickets) {
  const hourCounts = new Array(24).fill(0);

  tickets.forEach(ticket => {
    const date = new Date(ticket.timestamp);
    const hour = date.getHours();
    hourCounts[hour]++;
  });

  return hourCounts;
}

/**
 * Analyzes ticket creation patterns by day of week
 */
function getDailyHeatmap(tickets) {
  const dayCounts = new Array(7).fill(0); // 0 = Sunday, 6 = Saturday

  tickets.forEach(ticket => {
    const date = new Date(ticket.timestamp);
    const day = date.getDay();
    dayCounts[day]++;
  });

  return dayCounts;
}

/**
 * Gets most frequent topics with counts
 */
function getTopicFrequency(tickets) {
  const topicCounts = {};

  tickets.forEach(ticket => {
    const topic = ticket.topic || 'Unbekannt';
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });

  // Convert to array and sort by count
  return Object.entries(topicCounts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculates average resolution time per topic (in hours)
 */
function getAverageResolutionByTopic(tickets) {
  const topicData = {};

  tickets.forEach(ticket => {
    if (ticket.status !== 'geschlossen') return;
    if (!ticket.closedAt) return;

    const topic = ticket.topic || 'Unbekannt';
    const createdAt = new Date(ticket.timestamp);
    const closedAt = new Date(ticket.closedAt);
    const resolutionTime = (closedAt - createdAt) / (1000 * 60 * 60); // hours

    if (!topicData[topic]) {
      topicData[topic] = { total: 0, count: 0 };
    }

    topicData[topic].total += resolutionTime;
    topicData[topic].count += 1;
  });

  // Calculate averages
  return Object.entries(topicData)
    .map(([topic, data]) => ({
      topic,
      averageHours: data.total / data.count,
      count: data.count
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Gets trend analysis for the last N days
 */
function getTrendAnalysis(tickets, days = 30) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const dailyCounts = new Array(days).fill(0);
  const dailyLabels = [];

  // Generate labels
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - (i * dayMs));
    dailyLabels.push(date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }));
  }

  // Count tickets per day
  tickets.forEach(ticket => {
    const ticketDate = new Date(ticket.timestamp);
    const daysAgo = Math.floor((now - ticketDate.getTime()) / dayMs);

    if (daysAgo >= 0 && daysAgo < days) {
      dailyCounts[days - 1 - daysAgo]++;
    }
  });

  return {
    labels: dailyLabels,
    counts: dailyCounts
  };
}

/**
 * Gets ticket statistics by priority
 */
function getPriorityStats(tickets) {
  const priorityLabels = ['🟢 Niedrig', '🟠 Mittel', '🔴 Hoch'];
  const priorityCounts = [0, 0, 0];

  tickets.forEach(ticket => {
    const priority = ticket.priority || 0;
    if (priority >= 0 && priority <= 2) {
      priorityCounts[priority]++;
    }
  });

  return {
    labels: priorityLabels,
    counts: priorityCounts
  };
}

/**
 * Gets comprehensive insights for a guild
 */
function getComprehensiveInsights(guildId, timeRange = 'all') {
  let tickets = loadTickets(guildId);

  // Filter by time range
  if (timeRange !== 'all') {
    const now = Date.now();
    const ranges = {
      'today': 24 * 60 * 60 * 1000,
      'week': 7 * 24 * 60 * 60 * 1000,
      'month': 30 * 24 * 60 * 60 * 1000
    };

    if (ranges[timeRange]) {
      const cutoff = now - ranges[timeRange];
      tickets = tickets.filter(t => new Date(t.timestamp).getTime() >= cutoff);
    }
  }

  return {
    hourlyHeatmap: getHourlyHeatmap(tickets),
    dailyHeatmap: getDailyHeatmap(tickets),
    topicFrequency: getTopicFrequency(tickets),
    averageResolutionByTopic: getAverageResolutionByTopic(tickets),
    trendAnalysis: getTrendAnalysis(tickets, 30),
    priorityStats: getPriorityStats(tickets),
    totalTickets: tickets.length,
    closedTickets: tickets.filter(t => t.status === 'geschlossen').length,
    openTickets: tickets.filter(t => t.status === 'offen').length,
    averageResolutionTimeHours: calculateOverallAverageResolution(tickets)
  };
}

function calculateOverallAverageResolution(tickets) {
  const closed = tickets.filter(t => t.status === 'geschlossen' && t.closedAt);
  if (closed.length === 0) return 0;

  const total = closed.reduce((sum, ticket) => {
    const createdAt = new Date(ticket.timestamp);
    const closedAt = new Date(ticket.closedAt);
    return sum + (closedAt - createdAt) / (1000 * 60 * 60);
  }, 0);

  return total / closed.length;
}

module.exports = {
  getComprehensiveInsights,
  getHourlyHeatmap,
  getDailyHeatmap,
  getTopicFrequency,
  getAverageResolutionByTopic,
  getTrendAnalysis,
  getPriorityStats
};
