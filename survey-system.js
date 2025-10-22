const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { t } = require('./translations');

/**
 * Survey System - Advanced Satisfaction Surveys
 *
 * Features:
 * - Multi-question surveys
 * - Custom questions per topic
 * - NPS (Net Promoter Score) tracking
 * - 5-star ratings
 * - Text feedback
 * - Multiple choice questions
 * - Trend analysis over time
 */

/**
 * Question Types
 */
const QUESTION_TYPES = {
  RATING: 'rating',        // 5-star rating (1-5)
  NPS: 'nps',             // Net Promoter Score (0-10)
  TEXT: 'text',           // Free text response
  MULTIPLE_CHOICE: 'multiple_choice',  // Dropdown selection
  YES_NO: 'yes_no'        // Boolean yes/no
};

/**
 * NPS Categories
 */
const NPS_CATEGORIES = {
  DETRACTOR: 'detractor',  // 0-6
  PASSIVE: 'passive',      // 7-8
  PROMOTER: 'promoter'     // 9-10
};

/**
 * Default Survey Configuration
 */
function getDefaultSurveyConfig() {
  return {
    enabled: false,
    sendOnClose: true,
    requireCompletion: false,
    showInAnalytics: true,
    defaultQuestions: [
      {
        id: 'satisfaction',
        type: QUESTION_TYPES.RATING,
        text: {
          de: 'Wie zufrieden bist du mit dem Support?',
          en: 'How satisfied are you with the support?'
        },
        required: true
      },
      {
        id: 'recommend',
        type: QUESTION_TYPES.NPS,
        text: {
          de: 'Wie wahrscheinlich ist es, dass du uns weiterempfiehlst?',
          en: 'How likely are you to recommend us?'
        },
        required: true
      },
      {
        id: 'feedback',
        type: QUESTION_TYPES.TEXT,
        text: {
          de: 'Was können wir besser machen?',
          en: 'What can we improve?'
        },
        required: false,
        maxLength: 1000
      }
    ],
    topicQuestions: {} // topic-specific additional questions
  };
}

/**
 * Get survey questions for a specific topic
 * @param {Object} config - Guild configuration
 * @param {string} topic - Ticket topic
 * @returns {Array} Array of questions
 */
function getSurveyQuestions(config, topic) {
  if (!config.surveySystem || !config.surveySystem.enabled) {
    return [];
  }

  const questions = [...(config.surveySystem.defaultQuestions || [])];

  // Add topic-specific questions
  if (topic && config.surveySystem.topicQuestions && config.surveySystem.topicQuestions[topic]) {
    questions.push(...config.surveySystem.topicQuestions[topic]);
  }

  return questions;
}

/**
 * Send survey to user via DM
 * @param {Object} user - Discord user object
 * @param {Object} ticket - Ticket object
 * @param {string} guildId - Guild ID
 * @param {Object} config - Guild configuration
 */
async function sendSurveyDM(user, ticket, guildId, config) {
  try {
    console.log(`🔍 Attempting to send survey DM to ${user.tag} for ticket #${ticket.id}`);

    const questions = getSurveyQuestions(config, ticket.topic);
    console.log(`📋 Found ${questions.length} survey questions`);

    if (questions.length === 0) {
      console.log('⚠️ No survey questions configured, skipping survey.');
      console.log('Config:', JSON.stringify(config.surveySystem, null, 2));
      return;
    }

    const lang = config.language || 'de';
    const firstQuestion = questions[0];
    console.log(`❓ First question: ${firstQuestion.id} (${firstQuestion.type})`);

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(t(guildId, 'surveys.dm_title'))
      .setDescription(t(guildId, 'surveys.dm_description', { ticketId: String(ticket.id).padStart(5, '0') }))
      .addFields({
        name: '📋 ' + (firstQuestion.text[lang] || firstQuestion.text.de || firstQuestion.text.en),
        value: getQuestionScaleText(firstQuestion.type, lang, guildId),
        inline: false
      })
      .setFooter({ text: `Quantix Tickets • Frage 1 von ${questions.length}` })
      .setTimestamp();

    // Create buttons/components based on first question type
    const components = createQuestionComponents(firstQuestion, ticket.id, 0, guildId);
    console.log(`🔘 Created ${components.length} component rows`);

    await user.send({ embeds: [embed], components });
    console.log(`✅ Survey DM successfully sent to ${user.tag} for ticket #${ticket.id}`);
  } catch (err) {
    console.error(`❌ Error sending survey DM to ${user.tag}:`, err);
    console.error('Error details:', err.message);
    console.error('Stack:', err.stack);
  }
}

/**
 * Get scale text for question type
 */
function getQuestionScaleText(type, lang, guildId) {
  switch (type) {
    case QUESTION_TYPES.RATING:
      return t(guildId, 'surveys.scale_1_5');
    case QUESTION_TYPES.NPS:
      return t(guildId, 'surveys.scale_0_10');
    case QUESTION_TYPES.YES_NO:
      return 'Ja / Nein';
    case QUESTION_TYPES.TEXT:
      return t(guildId, 'surveys.feedback_placeholder');
    default:
      return '';
  }
}

/**
 * Create interactive components for a question
 */
function createQuestionComponents(question, ticketId, questionIndex, guildId) {
  const components = [];

  switch (question.type) {
    case QUESTION_TYPES.RATING:
      // 5-star rating buttons
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`survey:${ticketId}:${questionIndex}:1`)
            .setLabel('⭐')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`survey:${ticketId}:${questionIndex}:2`)
            .setLabel('⭐⭐')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`survey:${ticketId}:${questionIndex}:3`)
            .setLabel('⭐⭐⭐')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`survey:${ticketId}:${questionIndex}:4`)
            .setLabel('⭐⭐⭐⭐')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`survey:${ticketId}:${questionIndex}:5`)
            .setLabel('⭐⭐⭐⭐⭐')
            .setStyle(ButtonStyle.Success)
        )
      );
      break;

    case QUESTION_TYPES.NPS:
      // NPS 0-10 scale (split into two rows)
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:0`).setLabel('0').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:1`).setLabel('1').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:2`).setLabel('2').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:3`).setLabel('3').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:4`).setLabel('4').setStyle(ButtonStyle.Danger)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:5`).setLabel('5').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:6`).setLabel('6').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:7`).setLabel('7').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:8`).setLabel('8').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:9`).setLabel('9').setStyle(ButtonStyle.Success)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`survey:${ticketId}:${questionIndex}:10`).setLabel('10').setStyle(ButtonStyle.Success)
        )
      );
      break;

    case QUESTION_TYPES.YES_NO:
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`survey:${ticketId}:${questionIndex}:yes`)
            .setLabel('✅ Ja')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`survey:${ticketId}:${questionIndex}:no`)
            .setLabel('❌ Nein')
            .setStyle(ButtonStyle.Danger)
        )
      );
      break;

    case QUESTION_TYPES.TEXT:
      // Text input will be handled via modal
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`survey_text:${ticketId}:${questionIndex}`)
            .setLabel('📝 Feedback eingeben')
            .setStyle(ButtonStyle.Primary)
        )
      );
      break;

    case QUESTION_TYPES.MULTIPLE_CHOICE:
      // Dropdown menu
      if (question.choices && question.choices.length > 0) {
        const options = question.choices.map((choice, index) => ({
          label: choice.text || `Option ${index + 1}`,
          value: `survey:${ticketId}:${questionIndex}:${choice.value || index}`,
          description: choice.description || undefined
        }));

        components.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`survey_select:${ticketId}:${questionIndex}`)
              .setPlaceholder('Wähle eine Option...')
              .addOptions(options)
          )
        );
      }
      break;
  }

  return components;
}

/**
 * Calculate NPS Score
 * @param {Array} responses - Array of survey responses
 * @returns {Object} NPS data
 */
function calculateNPS(responses) {
  const npsResponses = responses.filter(r => r.type === QUESTION_TYPES.NPS && typeof r.value === 'number');

  if (npsResponses.length === 0) {
    return {
      score: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
      promoterPercent: 0,
      passivePercent: 0,
      detractorPercent: 0
    };
  }

  const promoters = npsResponses.filter(r => r.value >= 9).length;
  const passives = npsResponses.filter(r => r.value >= 7 && r.value <= 8).length;
  const detractors = npsResponses.filter(r => r.value <= 6).length;
  const total = npsResponses.length;

  const promoterPercent = (promoters / total) * 100;
  const detractorPercent = (detractors / total) * 100;
  const score = Math.round(promoterPercent - detractorPercent);

  return {
    score,
    promoters,
    passives,
    detractors,
    total,
    promoterPercent: Math.round(promoterPercent),
    passivePercent: Math.round((passives / total) * 100),
    detractorPercent: Math.round(detractorPercent)
  };
}

/**
 * Calculate average rating
 * @param {Array} responses - Array of survey responses
 * @returns {number} Average rating (1-5)
 */
function calculateAverageRating(responses) {
  const ratingResponses = responses.filter(r => r.type === QUESTION_TYPES.RATING && typeof r.value === 'number');

  if (ratingResponses.length === 0) return 0;

  const sum = ratingResponses.reduce((acc, r) => acc + r.value, 0);
  return (sum / ratingResponses.length).toFixed(2);
}

/**
 * Get survey analytics data
 * @param {Array} tickets - Array of tickets
 * @param {number} days - Number of days to analyze (default: 30)
 * @returns {Object} Analytics data
 */
function getSurveyAnalytics(tickets, days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const relevantTickets = tickets.filter(t =>
    t.status === 'geschlossen' &&
    t.closedAt &&
    new Date(t.closedAt) >= cutoffDate
  );

  const ticketsWithSurvey = relevantTickets.filter(t => t.survey && t.survey.responses && t.survey.responses.length > 0);

  const allResponses = ticketsWithSurvey.flatMap(t => t.survey.responses || []);

  const responseRate = relevantTickets.length > 0
    ? ((ticketsWithSurvey.length / relevantTickets.length) * 100).toFixed(1)
    : 0;

  const avgRating = calculateAverageRating(allResponses);
  const npsData = calculateNPS(allResponses);

  // Count responses with feedback (text responses)
  const withFeedback = allResponses.filter(r => 
    r.type === QUESTION_TYPES.TEXT && 
    r.value && 
    r.value.trim().length > 0
  ).length;

  // Rating distribution (for star ratings)
  const ratingDistribution = {};
  allResponses
    .filter(r => r.type === QUESTION_TYPES.RATING && typeof r.value === 'number')
    .forEach(r => {
      const rating = Math.round(r.value);
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
    });

  // Trend data (daily averages)
  const trendData = calculateTrend(ticketsWithSurvey, days);

  // By topic breakdown
  const byTopic = {};
  ticketsWithSurvey.forEach(t => {
    if (!byTopic[t.topic]) {
      byTopic[t.topic] = [];
    }
    byTopic[t.topic].push(...(t.survey.responses || []));
  });

  const topicAnalytics = {};
  Object.keys(byTopic).forEach(topic => {
    topicAnalytics[topic] = {
      avgRating: calculateAverageRating(byTopic[topic]),
      nps: calculateNPS(byTopic[topic]),
      count: byTopic[topic].length
    };
  });

  // By team member (claimer)
  const byTeam = {};
  ticketsWithSurvey.forEach(t => {
    if (t.claimedBy) {
      if (!byTeam[t.claimedBy]) {
        byTeam[t.claimedBy] = [];
      }
      byTeam[t.claimedBy].push(...(t.survey.responses || []));
    }
  });

  const teamAnalytics = {};
  Object.keys(byTeam).forEach(userId => {
    const responses = byTeam[userId];
    teamAnalytics[userId] = {
      avgRating: calculateAverageRating(responses),
      averageRating: parseFloat(calculateAverageRating(responses)), // Add alias for template
      nps: calculateNPS(responses),
      count: responses.length,
      username: userId // Will be overwritten in panel.js
    };
  });

  return {
    responseRate,
    avgRating,
    averageRating: parseFloat(avgRating), // Add alias for template compatibility
    nps: npsData,
    totalResponses: ticketsWithSurvey.length,
    totalTickets: relevantTickets.length,
    totalEligible: relevantTickets.length, // Add alias for template
    withFeedback,
    ratingDistribution,
    trend: trendData,
    byTopic: topicAnalytics,
    byTeam: teamAnalytics,
    byTeamMember: teamAnalytics // Add alias for template compatibility
  };
}

/**
 * Calculate trend data over time
 */
function calculateTrend(tickets, days) {
  const trend = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayTickets = tickets.filter(t => {
      const closedAt = new Date(t.closedAt);
      return closedAt >= date && closedAt < nextDate;
    });

    const dayResponses = dayTickets.flatMap(t => t.survey.responses || []);

    trend.push({
      date: date.toISOString().split('T')[0],
      avgRating: calculateAverageRating(dayResponses),
      nps: calculateNPS(dayResponses).score,
      responses: dayTickets.length
    });
  }

  return trend;
}

module.exports = {
  QUESTION_TYPES,
  NPS_CATEGORIES,
  getDefaultSurveyConfig,
  getSurveyQuestions,
  sendSurveyDM,
  createQuestionComponents,
  calculateNPS,
  calculateAverageRating,
  getSurveyAnalytics,
  getQuestionScaleText
};
