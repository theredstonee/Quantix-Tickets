const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { t } = require('./translations');

const CONFIG_DIR = path.join(__dirname, 'configs');

function readCfg(guildId) {
  try {
    const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function loadTickets(guildId) {
  try {
    const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
    if (!fs.existsSync(ticketsPath)) return [];
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  try {
    const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
    fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving tickets:', err);
  }
}

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

    const tickets = loadTickets(guildId);
    const ticketIndex = tickets.findIndex(t => t.id === ticket.id);

    if (ticketIndex !== -1) {
      tickets[ticketIndex].voiceChannelId = voiceChannel.id;
      tickets[ticketIndex].voiceCreatedAt = new Date().toISOString();
      tickets[ticketIndex].voiceCreatedBy = interaction.user.id;
      saveTickets(guildId, tickets);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🎤 ' + t(guildId, 'voiceSupport.channel_created'))
      .setDescription(t(guildId, 'voiceSupport.channel_description', { channel: `<#${voiceChannel.id}>` }))
      .addFields(
        { name: t(guildId, 'voiceSupport.created_by'), value: `<@${interaction.user.id}>`, inline: true },
        { name: t(guildId, 'voiceSupport.created_at'), value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });

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

    const tickets = loadTickets(guildId);
    const ticketIndex = tickets.findIndex(t => t.voiceChannelId === voiceChannelId);

    if (ticketIndex !== -1) {
      tickets[ticketIndex].voiceChannelId = null;
      tickets[ticketIndex].voiceDeletedAt = new Date().toISOString();
      saveTickets(guildId, tickets);
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
