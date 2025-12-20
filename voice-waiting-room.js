const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { EmbedBuilder, PermissionFlagsBits, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { t } = require('./translations');
const { readCfg, writeCfg } = require('./database');

const CONFIG_DIR = path.join(__dirname, 'configs');
const AUDIO_DIR = path.join(__dirname, 'audio');
const DEFAULT_WAITING_MUSIC = path.join(AUDIO_DIR, 'waiting-music.mp3');

const activeConnections = new Map();
const activePlayers = new Map();
const activeCases = new Map();

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

function loadVoiceCases(guildId) {
  try {
    const casesPath = path.join(CONFIG_DIR, `${guildId}_voice_cases.json`);
    if (!fs.existsSync(casesPath)) return [];
    return JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveVoiceCases(guildId, cases) {
  try {
    const casesPath = path.join(CONFIG_DIR, `${guildId}_voice_cases.json`);
    fs.writeFileSync(casesPath, JSON.stringify(cases, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving voice cases:', err);
  }
}

function getNextCaseId(guildId) {
  try {
    const counterPath = path.join(CONFIG_DIR, `${guildId}_voice_counter.json`);
    let counter = 1;

    if (fs.existsSync(counterPath)) {
      const data = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
      counter = data.counter || 1;
    }

    fs.writeFileSync(counterPath, JSON.stringify({ counter: counter + 1 }, null, 2), 'utf8');
    return counter;
  } catch (err) {
    console.error('Error getting next case ID:', err);
    return Math.floor(Math.random() * 10000);
  }
}

function isWithinSupportHours(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.voiceSupport?.enabled) {
    return false;
  }

  if (!cfg.voiceSupport?.enforceHours) {
    return true;
  }

  const supportHours = cfg.voiceSupport?.supportHours;
  if (!supportHours) {
    return true;
  }

  const now = new Date();
  const dayOfWeek = now.getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = dayNames[dayOfWeek];

  const dayConfig = supportHours[currentDay];
  if (!dayConfig || !dayConfig.enabled) {
    return false;
  }

  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMin] = dayConfig.start.split(':').map(Number);
  const [endHour, endMin] = dayConfig.end.split(':').map(Number);

  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;

  if (startTime <= endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    return currentTime >= startTime || currentTime <= endTime;
  }
}

function getDefaultSupportHours() {
  return {
    monday: { enabled: true, start: '13:00', end: '22:00' },
    tuesday: { enabled: true, start: '13:00', end: '22:00' },
    wednesday: { enabled: true, start: '13:00', end: '22:00' },
    thursday: { enabled: true, start: '13:00', end: '22:00' },
    friday: { enabled: true, start: '13:00', end: '22:00' },
    saturday: { enabled: true, start: '07:00', end: '22:00' },
    sunday: { enabled: true, start: '07:00', end: '22:00' }
  };
}

async function playWaitingMusic(voiceChannel, guildId) {
  try {
    console.log(`🎵 Attempting to play waiting music in ${voiceChannel.name} (${voiceChannel.id})`);

    // Check if bot has permission to join voice channel
    const guild = voiceChannel.guild;
    const botMember = await guild.members.fetch(guild.client.user.id).catch(() => null);
    if (!botMember) {
      console.log('⚠️ Bot member not found');
      return null;
    }

    const permissions = voiceChannel.permissionsFor(botMember);
    if (!permissions || !permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
      console.log(`⚠️ Bot has no permission to join/speak in voice channel ${voiceChannel.name}`);
      return null;
    }

    const cfg = readCfg(guildId);
    const musicPath = cfg.voiceSupport?.customMusicPath || DEFAULT_WAITING_MUSIC;

    console.log(`🎵 Using music file: ${musicPath}`);

    if (!fs.existsSync(musicPath)) {
      console.log(`⚠️ Waiting music file not found: ${musicPath}`);
      console.log(`📂 Please add a music file to: ${AUDIO_DIR}/waiting-music.mp3`);
      return null;
    }

    console.log(`🔗 Joining voice channel...`);
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false
    });

    console.log(`⏳ Waiting for connection to be ready...`);
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    console.log(`🎧 Creating audio player...`);
    const player = createAudioPlayer();
    const resource = createAudioResource(musicPath, {
      inlineVolume: true
    });

    resource.volume.setVolume(0.3);

    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      console.log(`🔁 Audio finished, looping...`);
      const newResource = createAudioResource(musicPath, { inlineVolume: true });
      newResource.volume.setVolume(0.3);
      player.play(newResource);
    });

    player.on('error', error => {
      console.error('❌ Audio player error:', error);
    });

    connection.on('error', error => {
      console.error('❌ Voice connection error:', error);
    });

    activeConnections.set(voiceChannel.id, connection);
    activePlayers.set(voiceChannel.id, player);

    console.log(`✅ Successfully playing waiting music in voice channel ${voiceChannel.name}`);
    return { connection, player };

  } catch (err) {
    console.error('❌ Error playing waiting music:', err);
    console.error('Stack:', err.stack);
    return null;
  }
}

async function stopWaitingMusic(channelId) {
  try {
    const player = activePlayers.get(channelId);
    if (player) {
      player.stop();
      activePlayers.delete(channelId);
    }

    const connection = activeConnections.get(channelId);
    if (connection) {
      connection.destroy();
      activeConnections.delete(channelId);
    }

    console.log(`🎵 Stopped waiting music in voice channel ${channelId}`);
  } catch (err) {
    console.error('Error stopping waiting music:', err);
  }
}

async function sendSupportCaseEmbed(guild, member, guildId, caseId) {
  try {
    const cfg = readCfg(guildId);
    const supportChannelId = cfg.voiceSupport?.supportChannelId || cfg.logChannelId;

    if (!supportChannelId) {
      console.log('⚠️ No support channel configured for voice embeds');
      return null;
    }

    const supportChannel = await guild.channels.fetch(supportChannelId).catch(() => null);
    if (!supportChannel) {
      console.log('⚠️ Support channel not found');
      return null;
    }

    // Check if bot has permission to send messages
    const botMember = await guild.members.fetch(guild.client.user.id).catch(() => null);
    if (!botMember) {
      console.log('⚠️ Bot member not found');
      return null;
    }

    const permissions = supportChannel.permissionsFor(botMember);
    if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.ViewChannel)) {
      console.log(`⚠️ Bot has no permission to send messages in channel ${supportChannel.name}`);
      return null;
    }

    const embedTitle = cfg.voiceSupport?.embedTitle || t(guildId, 'voiceWaitingRoom.caseEmbed.title');
    const embedColor = cfg.voiceSupport?.embedColor || '#3b82f6';

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({ name: guild.name, iconURL: guild.iconURL() })
      .setTitle(`${embedTitle}`)
      .setDescription(t(guildId, 'voiceWaitingRoom.caseEmbed.description', { user: `<@${member.id}>` }))
      .addFields(
        { name: t(guildId, 'voiceWaitingRoom.caseEmbed.caseId'), value: `#${String(caseId).padStart(5, '0')}`, inline: true },
        { name: t(guildId, 'voiceWaitingRoom.caseEmbed.user'), value: `<@${member.id}>`, inline: true },
        { name: t(guildId, 'voiceWaitingRoom.caseEmbed.created'), value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    // Initial: Nur "Übernehmen" und "Kommentar" Buttons
    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`voice_claim_${caseId}`)
          .setLabel(t(guildId, 'voiceWaitingRoom.buttons.claim'))
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`voice_comment_${caseId}`)
          .setLabel(t(guildId, 'voiceWaitingRoom.buttons.comment'))
          .setEmoji('💬')
          .setStyle(ButtonStyle.Secondary)
      );

    const message = await supportChannel.send({ embeds: [embed], components: [buttons] });
    return message;

  } catch (err) {
    console.error('Error sending support case embed:', err);
    return null;
  }
}

async function createVoiceCase(guild, member, guildId) {
  try {
    const caseId = getNextCaseId(guildId);
    const cases = loadVoiceCases(guildId);

    const newCase = {
      id: caseId,
      userId: member.id,
      username: member.user.tag,
      status: 'open',
      createdAt: new Date().toISOString(),
      claimedBy: null,
      claimedAt: null,
      closedAt: null,
      closedBy: null,
      comments: [],
      transfers: [],
      messageId: null
    };

    const message = await sendSupportCaseEmbed(guild, member, guildId, caseId);

    if (message) {
      newCase.messageId = message.id;
    }

    cases.push(newCase);
    saveVoiceCases(guildId, cases);

    activeCases.set(`${guildId}_${member.id}`, newCase);

    console.log(`✅ Voice case #${caseId} created for ${member.user.tag}`);
    return newCase;

  } catch (err) {
    console.error('Error creating voice case:', err);
    return null;
  }
}

async function handleVoiceJoin(oldState, newState) {
  try {
    if (!newState.channelId || oldState.channelId === newState.channelId) {
      console.log(`⏭️ handleVoiceJoin: Skipped (no channel change)`);
      return;
    }

    const member = newState.member;
    if (member.user.bot) {
      console.log(`⏭️ handleVoiceJoin: Skipped (user is bot)`);
      return;
    }

    const guild = newState.guild;
    const guildId = guild.id;
    const cfg = readCfg(guildId);

    console.log(`🔍 handleVoiceJoin: Checking Voice Support config for ${guild.name}`);
    console.log(`   - Voice Support enabled: ${cfg.voiceSupport?.enabled}`);
    console.log(`   - Configured Waiting Room ID: ${cfg.voiceSupport?.waitingRoomChannelId}`);
    console.log(`   - User joined Channel ID: ${newState.channelId}`);

    if (!cfg.voiceSupport?.enabled) {
      console.log(`⏭️ handleVoiceJoin: Voice Support ist nicht aktiviert für ${guild.name}`);
      console.log(`   ➜ Aktiviere es im Panel unter "Voice" Tab`);
      return;
    }

    const waitingRoomId = cfg.voiceSupport?.waitingRoomChannelId;
    if (!waitingRoomId) {
      console.log(`⏭️ handleVoiceJoin: Kein Wartezimmer-Channel konfiguriert`);
      console.log(`   ➜ Konfiguriere einen Channel im Panel unter "Voice" Tab`);
      return;
    }

    if (newState.channelId !== waitingRoomId) {
      console.log(`⏭️ handleVoiceJoin: User joined falschen Channel`);
      console.log(`   - Erwartet: ${waitingRoomId}`);
      console.log(`   - Erhalten: ${newState.channelId}`);
      return;
    }

    console.log(`🎤 User ${member.user.tag} joined waiting room in ${guild.name}`);

    if (!isWithinSupportHours(guildId)) {
      const outsideHoursEmbed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle(t(guildId, 'voiceWaitingRoom.outsideHours.title'))
        .setDescription(t(guildId, 'voiceWaitingRoom.outsideHours.description'))
        .setTimestamp();

      try {
        await member.send({ embeds: [outsideHoursEmbed] });
      } catch {
        console.log(`⚠️ Could not send DM to ${member.user.tag}`);
      }

      await logVoiceEvent(guild, member, 'outside_hours', waitingRoomId);
      return;
    }

    await playWaitingMusic(newState.channel, guildId);

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle(t(guildId, 'voiceWaitingRoom.welcome.title'))
      .setDescription(t(guildId, 'voiceWaitingRoom.welcome.description'))
      .setTimestamp();

    try {
      await member.send({ embeds: [welcomeEmbed] });
    } catch {
      console.log(`⚠️ Could not send welcome DM to ${member.user.tag}`);
    }

    await createVoiceCase(guild, member, guildId);

    await notifyTeam(guild, member, guildId);
    await logVoiceEvent(guild, member, 'joined_waiting_room', waitingRoomId);

  } catch (err) {
    console.error('Error in handleVoiceJoin:', err);
  }
}

async function closeVoiceCase(guild, member, guildId, reason = 'User left') {
  try {
    const cases = loadVoiceCases(guildId);
    const caseIndex = cases.findIndex(c => c.userId === member.id && c.status === 'open');

    if (caseIndex === -1) return;

    const voiceCase = cases[caseIndex];
    voiceCase.status = 'closed';
    voiceCase.closedAt = new Date().toISOString();
    voiceCase.closeReason = reason;

    cases[caseIndex] = voiceCase;
    saveVoiceCases(guildId, cases);

    activeCases.delete(`${guildId}_${member.id}`);

    if (voiceCase.messageId) {
      try {
        const cfg = readCfg(guildId);
        const supportChannelId = cfg.voiceSupport?.supportChannelId || cfg.logChannelId;
        if (supportChannelId) {
          const supportChannel = await guild.channels.fetch(supportChannelId).catch(() => null);
          if (supportChannel) {
            // Check permissions before fetching message
            const botMember = await guild.members.fetch(guild.client.user.id).catch(() => null);
            if (!botMember) return;

            const permissions = supportChannel.permissionsFor(botMember);
            if (!permissions || !permissions.has(PermissionFlagsBits.ViewChannel)) {
              console.log(`⚠️ Bot has no permission to view channel ${supportChannel.name}`);
              return;
            }

            const message = await supportChannel.messages.fetch(voiceCase.messageId).catch(() => null);
            if (message) {
              const updatedEmbed = EmbedBuilder.from(message.embeds[0])
                .setColor('#95a5a6')
                .setTitle(t(guildId, 'voiceWaitingRoom.actions.closed'))
                .setDescription(t(guildId, 'voiceWaitingRoom.actions.closedDescription', { closer: reason }));

              if (voiceCase.claimedBy) {
                updatedEmbed.addFields({ name: t(guildId, 'voiceWaitingRoom.caseEmbed.claimedBy'), value: `<@${voiceCase.claimedBy}>`, inline: true });
              }

              const duration = Math.floor((new Date(voiceCase.closedAt) - new Date(voiceCase.createdAt)) / 1000);
              const minutes = Math.floor(duration / 60);
              const seconds = duration % 60;
              updatedEmbed.addFields({ name: t(guildId, 'voiceWaitingRoom.caseEmbed.duration'), value: `${minutes}m ${seconds}s`, inline: true });

              await message.edit({ embeds: [updatedEmbed], components: [] });
            }
          }
        }
      } catch (err) {
        console.error('Error updating closed case embed:', err);
      }
    }

    console.log(`🔒 Voice case #${voiceCase.id} closed for ${member.user.tag}`);

  } catch (err) {
    console.error('Error closing voice case:', err);
  }
}

async function handleVoiceLeave(oldState, newState) {
  try {
    if (!oldState.channelId) return;

    const guild = oldState.guild;
    const guildId = guild.id;
    const cfg = readCfg(guildId);

    if (!cfg.voiceSupport?.enabled) return;

    const waitingRoomId = cfg.voiceSupport?.waitingRoomChannelId;

    // ========== CHECK: User left WAITING ROOM ==========
    if (waitingRoomId && oldState.channelId === waitingRoomId) {
      const channel = oldState.channel;
      if (channel) {
        const nonBotMembers = channel.members.filter(m => !m.user.bot);

        if (nonBotMembers.size === 0) {
          console.log(`🎵 Waiting room ${channel.name} is now empty, stopping music`);
          await stopWaitingMusic(channel.id);
        }
      }

      const member = oldState.member;
      if (member && !member.user.bot) {
        // Nur Case schließen wenn er NICHT claimed ist
        // Wenn claimed, ist der User im Support-Channel und soll dort bleiben
        const cases = loadVoiceCases(guildId);
        const userCase = cases.find(c => c.userId === member.id && c.status === 'open');

        if (userCase && !userCase.claimedBy) {
          // Fall wurde nicht übernommen, User hat wirklich das Wartezimmer verlassen
          await closeVoiceCase(guild, member, guildId, 'User left waiting room before being claimed');
          console.log(`🔒 Voice case #${userCase.id} closed because user left before being claimed`);
        } else {
          console.log(`✅ User left waiting room but case is claimed, keeping case open`);
        }

        await logVoiceEvent(guild, member, 'left_waiting_room', waitingRoomId);
      }
      return;
    }

    // ========== CHECK: User left SUPPORT CHANNEL ==========
    // Support-Channels werden NICHT automatisch geschlossen
    // Nur manuelles Schließen über den Button ist erlaubt
    console.log(`ℹ️ User left channel ${oldState.channelId}, but support channels are only closed manually`);

  } catch (err) {
    console.error('Error in handleVoiceLeave:', err);
  }
}

async function notifyTeam(guild, member, guildId) {
  try {
    const cfg = readCfg(guildId);
    const notificationChannelId = cfg.voiceSupport?.notificationChannelId || cfg.logChannelId;

    if (!notificationChannelId) return;

    const notificationChannel = await guild.channels.fetch(notificationChannelId).catch(() => null);
    if (!notificationChannel) return;

    // Check if bot has permission to send messages
    const botMember = await guild.members.fetch(guild.client.user.id).catch(() => null);
    if (!botMember) return;

    const permissions = notificationChannel.permissionsFor(botMember);
    if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.ViewChannel)) {
      console.log(`⚠️ Bot has no permission to send notifications in channel ${notificationChannel.name}`);
      return;
    }

    const teamRole = cfg.teamRoleId || cfg.priorityRoles?.['2']?.[0];

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle('🔔 ' + t(guildId, 'voiceWaitingRoom.teamNotification.title'))
      .setDescription(t(guildId, 'voiceWaitingRoom.teamNotification.description', { user: `<@${member.id}>` }))
      .addFields(
        { name: t(guildId, 'voiceWaitingRoom.teamNotification.user'), value: `<@${member.id}>`, inline: true },
        { name: t(guildId, 'voiceWaitingRoom.teamNotification.time'), value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
      )
      .setTimestamp();

    const message = teamRole ? `<@&${teamRole}>` : '';
    await notificationChannel.send({ content: message, embeds: [embed] });

  } catch (err) {
    console.error('Error notifying team:', err);
  }
}

async function logVoiceEvent(guild, member, event, channelId) {
  try {
    const guildId = guild.id;
    const cfg = readCfg(guildId);
    const logChannelId = cfg.logChannelId;

    if (!logChannelId) return;

    const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel) return;

    // Check if bot has permission to send messages
    const botMember = await guild.members.fetch(guild.client.user.id).catch(() => null);
    if (!botMember) return;

    const permissions = logChannel.permissionsFor(botMember);
    if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.ViewChannel)) {
      console.log(`⚠️ Bot has no permission to log in channel ${logChannel.name}`);
      return;
    }

    let emoji = '🎤';
    let color = 0x00ff88;
    let description = '';

    switch (event) {
      case 'joined_waiting_room':
        emoji = '🟢';
        color = 0x00ff88;
        description = t(guildId, 'voiceWaitingRoom.log.joined', { user: `<@${member.id}>`, channel: `<#${channelId}>` });
        break;
      case 'left_waiting_room':
        emoji = '🔴';
        color = 0xff9900;
        description = t(guildId, 'voiceWaitingRoom.log.left', { user: `<@${member.id}>`, channel: `<#${channelId}>` });
        break;
      case 'outside_hours':
        emoji = '⏰';
        color = 0xff9900;
        description = t(guildId, 'voiceWaitingRoom.log.outsideHours', { user: `<@${member.id}>` });
        break;
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(`${emoji} ${description}`)
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });

  } catch (err) {
    console.error('Error logging voice event:', err);
  }
}

function initializeVoiceSupport(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.voiceSupport) {
    cfg.voiceSupport = {
      enabled: false,
      waitingRoomChannelId: null,
      notificationChannelId: null,
      enforceHours: true,
      supportHours: getDefaultSupportHours(),
      customMusicPath: null
    };
    writeCfg(guildId, cfg);
  }

  return cfg.voiceSupport;
}

module.exports = {
  handleVoiceJoin,
  handleVoiceLeave,
  isWithinSupportHours,
  playWaitingMusic,
  stopWaitingMusic,
  initializeVoiceSupport,
  getDefaultSupportHours,
  loadVoiceCases,
  saveVoiceCases,
  closeVoiceCase
};
