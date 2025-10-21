const { PermissionsBitField } = require('discord.js');

/**
 * Auto-Assignment System
 *
 * Features:
 * - Round-Robin Distribution (Basic+)
 * - Workload-based Assignment (Basic+)
 * - Online Status Check (Pro)
 * - Skill-based Assignment per Topic (Pro)
 * - Priority-based Queue (Pro)
 * - Team Member Availability Toggle
 */

/**
 * Assignment Strategies
 */
const ASSIGNMENT_STRATEGIES = {
  ROUND_ROBIN: 'round_robin',        // Rotate through team members
  WORKLOAD_BASED: 'workload',        // Assign to member with least open tickets
  RANDOM: 'random',                  // Random assignment
  PRIORITY_QUEUE: 'priority_queue'   // Pro: Considers priority + workload + online status
};

/**
 * Default Auto-Assignment Configuration
 */
function getDefaultAutoAssignmentConfig() {
  return {
    enabled: false,
    strategy: ASSIGNMENT_STRATEGIES.WORKLOAD_BASED,
    assignOnCreate: true,
    notifyAssignee: true,
    checkOnlineStatus: false,           // Pro only
    skillBasedAssignment: false,        // Pro only
    topicSkills: {},                    // Pro: { topicValue: [roleIds] }
    excludedMembers: [],                // Team members who opted out
    assignmentHistory: [],              // Track last assignments for round-robin
    stats: {
      totalAssignments: 0,
      byMember: {}                      // { userId: count }
    }
  };
}

/**
 * Get all team members who can be assigned tickets
 * @param {Guild} guild - Discord guild
 * @param {Object} config - Guild configuration
 * @param {string} topic - Ticket topic (for skill-based filtering)
 * @param {boolean} checkOnline - Check online status (Pro feature)
 * @returns {Array} Array of eligible team member IDs
 */
async function getEligibleTeamMembers(guild, config, topic = null, checkOnline = false) {
  try {
    const teamRoles = getAllTeamRoles(config);

    if (teamRoles.length === 0) {
      console.log('No team roles configured for auto-assignment');
      return [];
    }

    const members = await guild.members.fetch();
    let eligibleMembers = [];

    // Get all members with team roles
    for (const [memberId, member] of members) {
      // Skip bots
      if (member.user.bot) continue;

      // Check if member has any team role
      const hasTeamRole = teamRoles.some(roleId => member.roles.cache.has(roleId));
      if (!hasTeamRole) continue;

      // Check if member is excluded
      if (config.autoAssignment?.excludedMembers?.includes(memberId)) {
        continue;
      }

      // Skill-based filtering (Pro feature)
      if (config.autoAssignment?.skillBasedAssignment && topic) {
        const topicSkills = config.autoAssignment.topicSkills?.[topic];
        if (topicSkills && topicSkills.length > 0) {
          const hasSkill = topicSkills.some(roleId => member.roles.cache.has(roleId));
          if (!hasSkill) continue;
        }
      }

      // Online status check (Pro feature)
      if (checkOnline && config.autoAssignment?.checkOnlineStatus) {
        const presence = member.presence;
        if (!presence || presence.status === 'offline' || presence.status === 'invisible') {
          continue;
        }
      }

      eligibleMembers.push(memberId);
    }

    return eligibleMembers;
  } catch (error) {
    console.error('Error getting eligible team members:', error);
    return [];
  }
}

/**
 * Get all team role IDs from configuration
 */
function getAllTeamRoles(config) {
  const roles = new Set();

  if (config.priorityRoles) {
    Object.values(config.priorityRoles).forEach(roleList => {
      if (Array.isArray(roleList)) roleList.forEach(r => roles.add(r));
    });
  }

  if (config.teamRoleId) {
    if (Array.isArray(config.teamRoleId)) {
      config.teamRoleId.forEach(r => roles.add(r));
    } else {
      roles.add(config.teamRoleId);
    }
  }

  return [...roles].filter(r => r && r.trim());
}

/**
 * Get current workload for a team member
 * @param {string} userId - User ID
 * @param {Array} tickets - All tickets
 * @returns {number} Number of open tickets assigned to this member
 */
function getMemberWorkload(userId, tickets) {
  return tickets.filter(t =>
    t.status === 'offen' &&
    t.claimer === userId
  ).length;
}

/**
 * Select team member using Round-Robin strategy
 */
function selectRoundRobin(eligibleMembers, config) {
  if (eligibleMembers.length === 0) return null;
  if (eligibleMembers.length === 1) return eligibleMembers[0];

  const history = config.autoAssignment?.assignmentHistory || [];

  // Find member who was assigned longest ago
  let selectedMember = null;
  let oldestIndex = -1;

  for (const memberId of eligibleMembers) {
    const lastIndex = history.lastIndexOf(memberId);
    if (lastIndex < oldestIndex || oldestIndex === -1) {
      oldestIndex = lastIndex;
      selectedMember = memberId;
    }
  }

  return selectedMember || eligibleMembers[0];
}

/**
 * Select team member using Workload-Based strategy
 */
function selectWorkloadBased(eligibleMembers, tickets) {
  if (eligibleMembers.length === 0) return null;
  if (eligibleMembers.length === 1) return eligibleMembers[0];

  let selectedMember = null;
  let lowestWorkload = Infinity;

  for (const memberId of eligibleMembers) {
    const workload = getMemberWorkload(memberId, tickets);
    if (workload < lowestWorkload) {
      lowestWorkload = workload;
      selectedMember = memberId;
    }
  }

  return selectedMember || eligibleMembers[0];
}

/**
 * Select team member using Random strategy
 */
function selectRandom(eligibleMembers) {
  if (eligibleMembers.length === 0) return null;
  return eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];
}

/**
 * Select team member using Priority Queue strategy (Pro)
 * Considers: Priority level, Workload, Online status
 */
function selectPriorityQueue(eligibleMembers, tickets, priority, guild) {
  if (eligibleMembers.length === 0) return null;
  if (eligibleMembers.length === 1) return eligibleMembers[0];

  // Score each member
  const scores = eligibleMembers.map(memberId => {
    const workload = getMemberWorkload(memberId, tickets);
    const member = guild.members.cache.get(memberId);

    let score = 100;

    // Lower workload = higher score
    score -= workload * 10;

    // Online status bonus
    if (member?.presence?.status === 'online') {
      score += 20;
    } else if (member?.presence?.status === 'idle' || member?.presence?.status === 'dnd') {
      score += 10;
    }

    // Priority adjustment (high priority tickets go to less busy members)
    if (priority === 2 && workload === 0) {
      score += 30; // High priority + no workload = best match
    }

    return { memberId, score };
  });

  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);

  return scores[0].memberId;
}

/**
 * Assign ticket to team member automatically
 * @param {Guild} guild - Discord guild
 * @param {Object} config - Guild configuration
 * @param {Object} ticket - Ticket object
 * @param {Array} allTickets - All tickets (for workload calculation)
 * @returns {string|null} Assigned member ID or null
 */
async function autoAssignTicket(guild, config, ticket, allTickets) {
  try {
    if (!config.autoAssignment || !config.autoAssignment.enabled) {
      return null;
    }

    const strategy = config.autoAssignment.strategy || ASSIGNMENT_STRATEGIES.WORKLOAD_BASED;
    const checkOnline = config.autoAssignment.checkOnlineStatus || false;

    // Get eligible team members
    const eligibleMembers = await getEligibleTeamMembers(
      guild,
      config,
      ticket.topic,
      checkOnline
    );

    if (eligibleMembers.length === 0) {
      console.log('No eligible team members for auto-assignment');
      return null;
    }

    let assignedMember = null;

    // Select member based on strategy
    switch (strategy) {
      case ASSIGNMENT_STRATEGIES.ROUND_ROBIN:
        assignedMember = selectRoundRobin(eligibleMembers, config);
        break;

      case ASSIGNMENT_STRATEGIES.WORKLOAD_BASED:
        assignedMember = selectWorkloadBased(eligibleMembers, allTickets);
        break;

      case ASSIGNMENT_STRATEGIES.RANDOM:
        assignedMember = selectRandom(eligibleMembers);
        break;

      case ASSIGNMENT_STRATEGIES.PRIORITY_QUEUE:
        assignedMember = selectPriorityQueue(
          eligibleMembers,
          allTickets,
          ticket.priority,
          guild
        );
        break;

      default:
        assignedMember = selectWorkloadBased(eligibleMembers, allTickets);
    }

    if (assignedMember) {
      // Update assignment history (for round-robin)
      if (!config.autoAssignment.assignmentHistory) {
        config.autoAssignment.assignmentHistory = [];
      }
      config.autoAssignment.assignmentHistory.push(assignedMember);

      // Keep history limited to last 100 assignments
      if (config.autoAssignment.assignmentHistory.length > 100) {
        config.autoAssignment.assignmentHistory.shift();
      }

      // Update stats
      if (!config.autoAssignment.stats) {
        config.autoAssignment.stats = { totalAssignments: 0, byMember: {} };
      }
      config.autoAssignment.stats.totalAssignments++;
      config.autoAssignment.stats.byMember[assignedMember] =
        (config.autoAssignment.stats.byMember[assignedMember] || 0) + 1;

      console.log(`✅ Auto-assigned ticket #${ticket.id} to ${assignedMember} using ${strategy} strategy`);
    }

    return assignedMember;
  } catch (error) {
    console.error('Error in auto-assignment:', error);
    return null;
  }
}

/**
 * Get assignment statistics
 * @param {Object} config - Guild configuration
 * @param {Array} tickets - All tickets
 * @returns {Object} Assignment statistics
 */
function getAssignmentStats(config, tickets) {
  const stats = config.autoAssignment?.stats || { totalAssignments: 0, byMember: {} };

  const currentWorkloads = {};
  tickets.filter(t => t.status === 'offen' && t.claimer).forEach(t => {
    currentWorkloads[t.claimer] = (currentWorkloads[t.claimer] || 0) + 1;
  });

  return {
    totalAutoAssignments: stats.totalAssignments,
    assignmentsByMember: stats.byMember,
    currentWorkloads,
    strategy: config.autoAssignment?.strategy || ASSIGNMENT_STRATEGIES.WORKLOAD_BASED,
    excludedCount: config.autoAssignment?.excludedMembers?.length || 0
  };
}

module.exports = {
  ASSIGNMENT_STRATEGIES,
  getDefaultAutoAssignmentConfig,
  getEligibleTeamMembers,
  autoAssignTicket,
  getAssignmentStats,
  getAllTeamRoles,
  getMemberWorkload
};
