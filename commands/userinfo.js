const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { readCfg, loadTickets } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Zeigt die Ticket-Historie eines Benutzers')
    .setDescriptionLocalizations({
      'en-US': 'Shows ticket history of a user',
      'en-GB': 'Shows ticket history of a user'
    })
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Der Benutzer dessen Historie angezeigt werden soll')
        .setDescriptionLocalizations({
          'en-US': 'The user whose history should be displayed',
          'en-GB': 'The user whose history should be displayed'
        })
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const cfg = readCfg(guildId);
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

    // Check if user has team role (for viewing others)
    const teamRoleIds = Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : (cfg.teamRoleId ? [cfg.teamRoleId] : []);
    const isTeam = teamRoleIds.some(roleId => interaction.member.roles.cache.has(roleId));
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    // Only team/admin can view other users
    if (targetUser.id !== interaction.user.id && !isTeam && !isAdmin) {
      return interaction.reply({
        content: '❌ Du kannst nur deine eigene Ticket-Historie sehen.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Load all tickets
    const allTickets = loadTickets(guildId);

    // Filter tickets for target user
    const userTickets = allTickets.filter(t => t.userId === targetUser.id);
    const openTickets = userTickets.filter(t => t.status === 'offen' || t.status === 'open');
    const closedTickets = userTickets.filter(t => t.status === 'geschlossen' || t.status === 'closed');
    const claimedTickets = userTickets.filter(t => t.claimed);

    // Tickets where user is team member (claimed by them)
    const ticketsAsTeam = allTickets.filter(t => t.claimedBy === targetUser.id);
    const ticketsClosedByUser = allTickets.filter(t => t.closedBy === targetUser.id);

    // Calculate statistics
    const totalTickets = userTickets.length;
    const lastTicket = userTickets.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];

    // Average time to first response (if claimed)
    let avgResponseTime = null;
    const ticketsWithClaim = userTickets.filter(t => t.claimedAt && t.timestamp);
    if (ticketsWithClaim.length > 0) {
      const totalResponseTime = ticketsWithClaim.reduce((acc, t) => {
        return acc + (t.claimedAt - t.timestamp);
      }, 0);
      avgResponseTime = totalResponseTime / ticketsWithClaim.length;
    }

    // Format time duration
    function formatDuration(ms) {
      if (!ms) return 'N/A';
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m`;
      return `${seconds}s`;
    }

    // Get recent tickets (last 5)
    const recentTickets = userTickets
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 5);

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(`📊 Ticket-Info: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
      .setColor(0x3b82f6)
      .addFields(
        {
          name: '📈 Statistiken',
          value: [
            `**Gesamt Tickets:** ${totalTickets}`,
            `**Offene Tickets:** ${openTickets.length}`,
            `**Geschlossene Tickets:** ${closedTickets.length}`,
            `**Beanspruchte Tickets:** ${claimedTickets.length}`
          ].join('\n'),
          inline: true
        },
        {
          name: '⏱️ Zeiten',
          value: [
            `**Letztes Ticket:** ${lastTicket ? `<t:${Math.floor(lastTicket.timestamp / 1000)}:R>` : 'Keins'}`,
            `**Ø Antwortzeit:** ${formatDuration(avgResponseTime)}`
          ].join('\n'),
          inline: true
        }
      );

    // Add team stats if user is team member
    const isTargetTeam = teamRoleIds.some(roleId => targetMember?.roles.cache.has(roleId));
    if (isTargetTeam || ticketsAsTeam.length > 0) {
      embed.addFields({
        name: '👔 Team-Statistiken',
        value: [
          `**Beansprucht:** ${ticketsAsTeam.length} Tickets`,
          `**Geschlossen:** ${ticketsClosedByUser.length} Tickets`
        ].join('\n'),
        inline: true
      });
    }

    // Add recent tickets
    if (recentTickets.length > 0) {
      const recentList = recentTickets.map(t => {
        const status = (t.status === 'offen' || t.status === 'open') ? '🟢' : '🔴';
        const topic = t.topicLabel || t.topic || 'Allgemein';
        const date = t.timestamp ? `<t:${Math.floor(t.timestamp / 1000)}:d>` : 'N/A';
        return `${status} **#${t.id}** - ${topic} (${date})`;
      }).join('\n');

      embed.addFields({
        name: '📋 Letzte Tickets',
        value: recentList,
        inline: false
      });
    }

    // Check for blacklist
    const blacklist = cfg.ticketBlacklist || [];
    const isBlacklisted = blacklist.some(b => b.userId === targetUser.id);
    if (isBlacklisted && (isTeam || isAdmin)) {
      const blacklistEntry = blacklist.find(b => b.userId === targetUser.id);
      embed.addFields({
        name: '⚠️ Blacklist',
        value: `**Grund:** ${blacklistEntry?.reason || 'Kein Grund angegeben'}\n**Von:** <@${blacklistEntry?.addedBy || 'Unbekannt'}>`,
        inline: false
      });
      embed.setColor(0xef4444);
    }

    embed.setFooter({ text: `Server: ${interaction.guild.name}` });
    embed.setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
