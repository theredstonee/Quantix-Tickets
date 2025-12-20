const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { t } = require('./translations');
const { readCfg, loadTickets, saveTickets } = require('./database');

async function createVoiceChannel(interaction, ticket, guildId) {
  const { guild, channel } = interaction;
  const cfg = readCfg(guildId);

  try {
    const categoryId = channel.parent?.id || cfg.categoryId;

    if (!categoryId) {
      throw new Error('No category found for voice channel');
    }

    const voiceChannelName = `voice-ticket-${String(ticket.id).padStart(5, '0')}`;

    const permissions = [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: ticket.userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream
        ]
      }
    ];

    if (cfg.teamRole) {
      permissions.push({
        id: cfg.teamRole,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers
        ]
      });
    }

    if (ticket.claimer) {
      permissions.push({
        id: ticket.claimer,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers
        ]
      });
    }

    if (ticket.priorityRoles) {
      ticket.priorityRoles.forEach(roleId => {
        permissions.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak
          ]
        });
      });
    }

    const voiceChannel = await guild.channels.create({
      name: voiceChannelName,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      permissionOverwrites: permissions,
      userLimit: 10,
      bitrate: Math.min(guild.premiumTier >= 1 ? 128000 : 96000, 96000)
    });

    // Update voiceChannelId without overwriting other ticket fields
    const tickets = loadTickets(guildId);
    const ticketIndex = tickets.findIndex(t => t.id === ticket.id);

    if (ticketIndex !== -1) {
      // Only update voice-related fields, preserve all other fields (like claimer)
      tickets[ticketIndex].voiceChannelId = voiceChannel.id;
      tickets[ticketIndex].voiceCreatedAt = new Date().toISOString();
      tickets[ticketIndex].voiceCreatedBy = interaction.user.id;

      // Important: Don't overwrite claimer, status, or other fields that might have been updated
      saveTickets(guildId, tickets);
      console.log(`📝 Updated ticket #${ticket.id} with voiceChannelId (preserving claimer: ${tickets[ticketIndex].claimer || 'none'})`);
    }

    // Log-Nachricht wird in index.js gesendet
    console.log(`✅ Voice channel ${voiceChannel.id} created for ticket ${ticket.id}`);

    return voiceChannel;

  } catch (err) {
    console.error('Error creating voice channel:', err);
    throw err;
  }
}

async function deleteVoiceChannel(guild, voiceChannelId, guildId) {
  try {
    const voiceChannel = await guild.channels.fetch(voiceChannelId).catch(() => null);

    if (voiceChannel) {
      await voiceChannel.delete();
      console.log(`✅ Voice channel ${voiceChannelId} deleted`);
    }

    // Update voiceChannelId without overwriting other ticket fields
    const tickets = loadTickets(guildId);
    const ticketIndex = tickets.findIndex(t => t.voiceChannelId === voiceChannelId);

    if (ticketIndex !== -1) {
      // Only update voice-related fields, preserve all other fields (like claimer)
      tickets[ticketIndex].voiceChannelId = null;
      tickets[ticketIndex].voiceDeletedAt = new Date().toISOString();

      // Important: Don't overwrite claimer, status, or other fields that might have been updated
      saveTickets(guildId, tickets);
      console.log(`📝 Updated ticket #${tickets[ticketIndex].id} - removed voiceChannelId (preserving claimer: ${tickets[ticketIndex].claimer || 'none'})`);
    }

  } catch (err) {
    console.error('Error deleting voice channel:', err);
  }
}

async function logVoiceActivity(guild, member, action, guildId, voiceChannelId) {
  try {
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.voiceChannelId === voiceChannelId);

    if (!ticket) return;

    const cfg = readCfg(guildId);
    const logChannelId = cfg.logChannelId;

    if (!logChannelId) return;

    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);

    if (!logChannel) return;

    let actionText = '';
    let color = 0x00ff88;

    switch (action) {
      case 'join':
        actionText = t(guildId, 'voiceSupport.joined');
        color = 0x00ff88;
        break;
      case 'leave':
        actionText = t(guildId, 'voiceSupport.left');
        color = 0xffc107;
        break;
      case 'mute':
        actionText = t(guildId, 'voiceSupport.muted');
        color = 0xff9900;
        break;
      case 'unmute':
        actionText = t(guildId, 'voiceSupport.unmuted');
        color = 0x00ff88;
        break;
      case 'deafen':
        actionText = t(guildId, 'voiceSupport.deafened');
        color = 0xff9900;
        break;
      case 'undeafen':
        actionText = t(guildId, 'voiceSupport.undeafened');
        color = 0x00ff88;
        break;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(`🎤 ${actionText}: <@${member.id}> in <#${voiceChannelId}>`)
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });

    const ticketIndex = tickets.findIndex(t => t.id === ticket.id);
    if (ticketIndex !== -1) {
      if (!tickets[ticketIndex].voiceHistory) {
        tickets[ticketIndex].voiceHistory = [];
      }

      tickets[ticketIndex].voiceHistory.push({
        userId: member.id,
        username: member.user.tag,
        action: action,
        timestamp: new Date().toISOString()
      });

      saveTickets(guildId, tickets);
    }

  } catch (err) {
    console.error('Error logging voice activity:', err);
  }
}

function hasVoiceChannel(ticket) {
  return ticket.voiceChannelId !== null && ticket.voiceChannelId !== undefined;
}

function getVoiceChannelId(ticket) {
  return ticket.voiceChannelId || null;
}

module.exports = {
  createVoiceChannel,
  deleteVoiceChannel,
  logVoiceActivity,
  hasVoiceChannel,
  getVoiceChannelId
};
