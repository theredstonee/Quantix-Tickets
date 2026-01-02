const path = require('path');
const fs = require('fs');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { t } = require('../translations');
const { createStyledEmbed } = require('../helpers');
const { readCfg, writeCfg, loadTickets, saveTickets } = require('../database');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

const PRIORITY_STATES = [
  { dot: '🟢', embedColor: 0x2bd94a, label: 'Grün' },
  { dot: '🟠', embedColor: 0xff9900, label: 'Orange' },
  { dot: '🔴', embedColor: 0xd92b2b, label: 'Rot' }
];

function getTeamRole(guildId) {
  const cfg = readCfg(guildId);
  if (Array.isArray(cfg.teamRoleId)) return cfg.teamRoleId.length > 0 ? cfg.teamRoleId[0] : null;
  return cfg.teamRoleId || null;
}

function getAllTeamRoles(guildId) {
  const cfg = readCfg(guildId);
  const roles = new Set();
  if (Array.isArray(cfg.teamRoleId)) cfg.teamRoleId.forEach(r => r && roles.add(r));
  else if (cfg.teamRoleId) roles.add(cfg.teamRoleId);
  if (cfg.priorityRoles) Object.values(cfg.priorityRoles).forEach(roleList => {
    if (Array.isArray(roleList)) roleList.forEach(r => r && roles.add(r));
  });
  return Array.from(roles);
}

function hasAnyTeamRole(member, guildId) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return getAllTeamRoles(guildId).some(roleId => member.roles.cache.has(roleId));
}

function logEvent(guild, message) {
  const cfg = readCfg(guild.id);
  if (!cfg.logChannelId) return;
  const ch = guild.channels.cache.get(cfg.logChannelId);
  if (ch?.isTextBased()) ch.send(message).catch(console.error);
}

function nextTicket(guildId) {
  const counterPath = path.join(CONFIG_DIR, `${guildId}_counter.json`);
  if (!fs.existsSync(counterPath)) fs.writeFileSync(counterPath, JSON.stringify({ last: 0 }, null, 2), 'utf8');
  const counter = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
  counter.last++;
  fs.writeFileSync(counterPath, JSON.stringify(counter, null, 2), 'utf8');
  return counter.last;
}

function getHierarchicalPriorityRoles(guildId, priority = 0) {
  const cfg = readCfg(guildId);
  const roles = new Set();
  if (!cfg.priorityRoles) {
    if (Array.isArray(cfg.teamRoleId)) return cfg.teamRoleId.filter(r => r?.trim());
    return cfg.teamRoleId ? [cfg.teamRoleId] : [];
  }
  for (let level = priority; level >= 0; level--) {
    const levelRoles = cfg.priorityRoles[level.toString()] || [];
    if (Array.isArray(levelRoles)) levelRoles.forEach(r => roles.add(r));
  }
  return Array.from(roles).filter(r => r?.trim());
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket management commands')
    
    // ===== STANDALONE SUBCOMMANDS (17) =====
    .addSubcommand(s => s.setName('claim').setDescription('Claim this ticket (Team only)'))
    .addSubcommand(s => s.setName('unclaim').setDescription('Release this ticket for other team members'))
    .addSubcommand(s => s.setName('close').setDescription('Close this ticket (Team only)')
      .addStringOption(o => o.setName('reason').setDescription('Reason for closing').setRequired(false).setMaxLength(500)))
    .addSubcommand(s => s.setName('request-close').setDescription('Request to close this ticket'))
    .addSubcommand(s => s.setName('elevate').setDescription('Increase ticket priority (Team only)'))
    .addSubcommand(s => s.setName('lower').setDescription('Decrease ticket priority (Team only)'))
    .addSubcommand(s => s.setName('merge').setDescription('Merge another ticket into this one (Team only)'))
    .addSubcommand(s => s.setName('add').setDescription('Add a user to the ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(s => s.setName('hide').setDescription('Hide ticket from team (claimer only)'))
    .addSubcommand(s => s.setName('unhide').setDescription('Unhide ticket (claimer only)'))
    .addSubcommand(s => s.setName('split').setDescription('Split into new ticket')
      .addStringOption(o => o.setName('reason').setDescription('Reason for split').setRequired(true)))
    .addSubcommand(s => s.setName('forward').setDescription('Forward ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(false))
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(false)))
    .addSubcommand(s => s.setName('pause').setDescription('Pause auto-close timer'))
    .addSubcommand(s => s.setName('resume').setDescription('Resume auto-close timer'))
    .addSubcommand(s => s.setName('block').setDescription('Block ticket messages'))
    .addSubcommand(s => s.setName('unblock').setDescription('Unblock ticket messages'))
    .addSubcommand(s => s.setName('rename').setDescription('Rename ticket channel')
      .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true).setMaxLength(100)))
    
    // ===== SUBCOMMAND GROUP: BLACKLIST (1 group with 4 subs) =====
    .addSubcommandGroup(g => g.setName('blacklist').setDescription('Manage blacklist')
      .addSubcommand(s => s.setName('add').setDescription('Add user to blacklist')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
        .addBooleanOption(o => o.setName('permanent').setDescription('Permanent?'))
        .addIntegerOption(o => o.setName('days').setDescription('Days').setMinValue(1).setMaxValue(365)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove from blacklist')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('List blacklisted users'))
      .addSubcommand(s => s.setName('check').setDescription('Check if blacklisted')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))))
    
    // ===== SUBCOMMAND GROUP: NOTE (1 group with 2 subs) =====
    .addSubcommandGroup(g => g.setName('note').setDescription('Manage notes')
      .addSubcommand(s => s.setName('add').setDescription('Add internal note')
        .addStringOption(o => o.setName('content').setDescription('Note content').setRequired(true).setMaxLength(1000)))
      .addSubcommand(s => s.setName('list').setDescription('List notes')))
    
    // ===== SUBCOMMAND GROUP: VOICE (1 group with 2 subs) =====
    .addSubcommandGroup(g => g.setName('voice').setDescription('Manage voice support')
      .addSubcommand(s => s.setName('start').setDescription('Create voice channel'))
      .addSubcommand(s => s.setName('end').setDescription('Delete voice channel')))
    
    // ===== SUBCOMMAND GROUP: TAG =====
    .addSubcommandGroup(g => g.setName('tag').setDescription('Manage ticket tags')
      .addSubcommand(s => s.setName('add').setDescription('Add a tag to this ticket'))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a tag from this ticket'))
      .addSubcommand(s => s.setName('list').setDescription('List all available tags')))
    
    // ===== SUBCOMMAND GROUP: DEPARTMENT =====
    .addSubcommandGroup(g => g.setName('department').setDescription('Manage ticket departments')
      .addSubcommand(s => s.setName('forward').setDescription('Forward ticket to another department'))
      .addSubcommand(s => s.setName('list').setDescription('List all departments'))),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    // ===== GROUP: BLACKLIST =====
    if (group === 'blacklist') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', description: 'Nur Team-Mitglieder.', color: '#ED4245' })], ephemeral: true });

      if (sub === 'add') {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const isPermanent = interaction.options.getBoolean('permanent') !== false;
        const days = interaction.options.getInteger('days') || 30;

        const cfg = readCfg(guildId);
        if (!cfg.ticketBlacklist) cfg.ticketBlacklist = [];
        if (cfg.ticketBlacklist.find(b => b.userId === user.id)) return interaction.reply({ content: `❌ ${user.tag} ist bereits auf der Blacklist.`, ephemeral: true });

        cfg.ticketBlacklist.push({
          userId: user.id, username: user.tag, reason, isPermanent,
          addedBy: interaction.user.id, addedAt: new Date().toISOString(),
          expiresAt: isPermanent ? null : new Date(Date.now() + days * 86400000).toISOString()
        });
        writeCfg(guildId, cfg);

        await interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Blacklist', description: `<@${user.id}> hinzugefügt.\nGrund: ${reason}\nDauer: ${isPermanent ? '♾️ Permanent' : `${days} Tage`}`, color: '#ED4245' })] });
        logEvent(interaction.guild, `🚫 <@${user.id}> auf Blacklist von <@${interaction.user.id}> | ${reason}`);
      }
      if (sub === 'remove') {
        const user = interaction.options.getUser('user');
        const cfg = readCfg(guildId);
        if (!cfg.ticketBlacklist) cfg.ticketBlacklist = [];
        const idx = cfg.ticketBlacklist.findIndex(b => b.userId === user.id);
        if (idx === -1) return interaction.reply({ content: `❌ ${user.tag} ist nicht auf der Blacklist.`, ephemeral: true });
        cfg.ticketBlacklist.splice(idx, 1);
        writeCfg(guildId, cfg);
        await interaction.reply({ embeds: [createStyledEmbed({ emoji: '✅', title: 'Blacklist', description: `<@${user.id}> entfernt.`, color: '#57F287' })] });
        logEvent(interaction.guild, `✅ <@${user.id}> von Blacklist entfernt von <@${interaction.user.id}>`);
      }
      if (sub === 'list') {
        const cfg = readCfg(guildId);
        const list = cfg.ticketBlacklist || [];
        if (!list.length) return interaction.reply({ content: '📋 Blacklist ist leer.', ephemeral: true });
        await interaction.reply({ embeds: [createStyledEmbed({ emoji: '📋', title: 'Blacklist', description: list.map((b, i) => `**${i + 1}.** <@${b.userId}> - ${b.reason}`).join('\n'), color: '#ED4245' })], ephemeral: true });
      }
      if (sub === 'check') {
        const user = interaction.options.getUser('user');
        const cfg = readCfg(guildId);
        const entry = (cfg.ticketBlacklist || []).find(b => b.userId === user.id);
        if (!entry) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '✅', title: 'Nicht auf Blacklist', description: `<@${user.id}>`, color: '#57F287' })], ephemeral: true });
        await interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Auf Blacklist', description: `<@${user.id}>\nGrund: ${entry.reason}\n${entry.isPermanent ? '♾️ Permanent' : `Bis: <t:${Math.floor(new Date(entry.expiresAt).getTime() / 1000)}:R>`}`, color: '#ED4245' })], ephemeral: true });
      }
      return;
    }

    // ===== GROUP: NOTE =====
    if (group === 'note') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      if (sub === 'add') {
        const content = interaction.options.getString('content');
        if (!ticket.notes) ticket.notes = [];
        ticket.notes.push({ id: ticket.notes.length + 1, content, author: interaction.user.id, createdAt: Date.now() });
        saveTickets(guildId, tickets);
        await interaction.reply({ embeds: [createStyledEmbed({ emoji: '📝', title: 'Notiz hinzugefügt', description: content.substring(0, 200), color: '#5865F2' })], ephemeral: true });
        logEvent(interaction.guild, `📝 Notiz zu Ticket #${ticket.id} von <@${interaction.user.id}>`);
      }
      if (sub === 'list') {
        const notes = ticket.notes || [];
        if (!notes.length) return interaction.reply({ content: '📝 Keine Notizen.', ephemeral: true });
        await interaction.reply({ embeds: [createStyledEmbed({ emoji: '📝', title: `Notizen #${ticket.id}`, description: notes.map((n, i) => `**${i + 1}.** <@${n.author}>: ${n.content}`).join('\n\n').substring(0, 4000), color: '#5865F2' })], ephemeral: true });
      }
      return;
    }

    // ===== GROUP: VOICE =====
    if (group === 'voice') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      if (sub === 'start') {
        if (ticket.voiceChannelId) return interaction.reply({ content: `ℹ️ Voice existiert: <#${ticket.voiceChannelId}>`, ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        try {
          const { createVoiceChannel } = require('../voice-support');
          const vc = await createVoiceChannel(interaction.guild, ticket, guildId);
          if (!vc) throw new Error('Failed');
          ticket.voiceChannelId = vc.id;
          saveTickets(guildId, tickets);
          await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '🎤', title: 'Voice erstellt', description: `<#${vc.id}>`, color: '#57F287' })] });
          await interaction.editReply({ content: `✅ <#${vc.id}>` });
          logEvent(interaction.guild, `🎤 Voice für #${ticket.id} von <@${interaction.user.id}>`);
        } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
      }
      if (sub === 'end') {
        if (!ticket.voiceChannelId) return interaction.reply({ content: '❌ Kein Voice-Channel.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        try {
          const { deleteVoiceChannel } = require('../voice-support');
          await deleteVoiceChannel(interaction.guild, ticket.voiceChannelId, guildId);
          await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '🔇', title: 'Voice beendet', color: '#ED4245' })] });
          await interaction.editReply({ content: '✅ Voice beendet.' });
          logEvent(interaction.guild, `🔇 Voice für #${ticket.id} beendet von <@${interaction.user.id}>`);
        } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
      }
      return;
    }

    // ===== GROUP: TAG =====
    if (group === 'tag') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      const cfg = readCfg(guildId);
      const availableTags = cfg.ticketTags || [];

      if (sub === 'add') {
        if (!availableTags.length) return interaction.reply({ content: '❌ Keine Tags konfiguriert. Erstelle Tags im Dashboard.', ephemeral: true });

        const opts = availableTags.slice(0, 25).map(t => ({ label: t.name, description: t.description || '', value: t.id || t.name, emoji: t.emoji }));

        await interaction.reply({
          embeds: [createStyledEmbed({ emoji: '🏷️', title: 'Tag hinzufügen', description: 'Wähle einen Tag für dieses Ticket.', color: '#5865F2' })],
          components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`tag_add_select:${ticket.id}`).setPlaceholder('Tag wählen...').addOptions(opts))],
          ephemeral: true
        });
      }

      if (sub === 'remove') {
        const ticketTags = ticket.tags || [];
        if (!ticketTags.length) return interaction.reply({ content: 'ℹ️ Dieses Ticket hat keine Tags.', ephemeral: true });

        const opts = ticketTags.slice(0, 25).map(t => ({ label: t.name || t, value: t.id || t.name || t }));

        await interaction.reply({
          embeds: [createStyledEmbed({ emoji: '🏷️', title: 'Tag entfernen', description: 'Wähle einen Tag zum Entfernen.', color: '#ED4245' })],
          components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`tag_remove_select:${ticket.id}`).setPlaceholder('Tag wählen...').addOptions(opts))],
          ephemeral: true
        });
      }

      if (sub === 'list') {
        const ticketTags = ticket.tags || [];
        const tagList = ticketTags.length ? ticketTags.map(t => `• ${t.emoji || '🏷️'} ${t.name || t}`).join('\n') : 'Keine Tags';
        const availableList = availableTags.length ? availableTags.map(t => `• ${t.emoji || '🏷️'} ${t.name}`).join('\n') : 'Keine Tags konfiguriert';

        await interaction.reply({
          embeds: [createStyledEmbed({
            emoji: '🏷️',
            title: 'Tags',
            fields: [
              { name: 'Ticket-Tags', value: tagList, inline: true },
              { name: 'Verfügbare Tags', value: availableList, inline: true }
            ],
            color: '#5865F2'
          })],
          ephemeral: true
        });
      }
      return;
    }

    // ===== GROUP: DEPARTMENT =====
    if (group === 'department') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      const cfg = readCfg(guildId);
      const departments = cfg.departments || [];

      if (sub === 'forward') {
        if (!departments.length) return interaction.reply({ content: '❌ Keine Abteilungen konfiguriert. Erstelle Abteilungen im Dashboard.', ephemeral: true });

        const opts = departments.slice(0, 25).map(d => ({ label: d.name, description: d.description || '', value: d.id || d.name, emoji: d.emoji }));

        await interaction.reply({
          embeds: [createStyledEmbed({ emoji: '🏢', title: 'An Abteilung weiterleiten', description: 'Wähle eine Abteilung.', color: '#5865F2' })],
          components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`department_forward_select:${ticket.id}`).setPlaceholder('Abteilung wählen...').addOptions(opts))],
          ephemeral: true
        });
      }

      if (sub === 'list') {
        const deptList = departments.length ? departments.map(d => `• ${d.emoji || '🏢'} **${d.name}**${d.description ? ` - ${d.description}` : ''}`).join('\n') : 'Keine Abteilungen konfiguriert';

        await interaction.reply({
          embeds: [createStyledEmbed({
            emoji: '🏢',
            title: 'Abteilungen',
            description: deptList,
            color: '#5865F2'
          })],
          ephemeral: true
        });
      }
      return;
    }

    // ===== STANDALONE: CLAIM =====
    if (sub === 'claim') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      if (ticket.claimer) return interaction.reply({ content: `⚠️ Bereits von <@${ticket.claimer}> übernommen.`, ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        ticket.claimer = interaction.user.id;
        ticket.claimedAt = Date.now();
        saveTickets(guildId, tickets);

        const perms = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        (ticket.addedUsers || []).forEach(uid => perms.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }));
        
        for (const roleId of getHierarchicalPriorityRoles(guildId, ticket.priority || 0)) {
          if (roleId?.trim()) perms.push({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] });
        }
        await interaction.channel.permissionOverwrites.set(perms);

        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '✨', title: 'Ticket übernommen', description: `<@${interaction.user.id}> kümmert sich um dein Anliegen.`, color: '#57F287' })] });
        await interaction.editReply({ content: '✅ Übernommen!' });
        logEvent(interaction.guild, `✨ #${ticket.id} von <@${interaction.user.id}> übernommen`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: UNCLAIM =====
    if (sub === 'unclaim') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      if (!ticket.claimer) return interaction.reply({ content: 'ℹ️ Nicht übernommen.', ephemeral: true });

      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam && ticket.claimer !== interaction.user.id) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        const prev = ticket.claimer;
        ticket.claimer = null;
        saveTickets(guildId, tickets);

        const perms = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        getAllTeamRoles(guildId).forEach(r => r && perms.push({ id: r, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }));
        (ticket.addedUsers || []).forEach(uid => perms.push({ id: uid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }));
        await interaction.channel.permissionOverwrites.set(perms);

        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '🔓', title: 'Ticket freigegeben', description: `Von <@${prev}> freigegeben.`, color: '#5865F2' })] });
        await interaction.editReply({ content: '✅ Freigegeben!' });
        logEvent(interaction.guild, `🔓 #${ticket.id} freigegeben von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: CLOSE =====
    if (sub === 'close') {
      const reason = interaction.options.getString('reason') || 'Kein Grund angegeben';
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam && ticket.claimer !== interaction.user.id) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });
      if (ticket.archived) return interaction.reply({ content: '📦 Bereits archiviert.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        ticket.status = 'geschlossen';
        ticket.closedAt = Date.now();
        ticket.closedBy = interaction.user.id;
        ticket.closeReason = reason;
        saveTickets(guildId, tickets);

        const cfg = readCfg(guildId);

        await interaction.channel.send({ embeds: [createStyledEmbed({
          emoji: '🔐', title: 'Ticket geschlossen',
          description: `Von <@${interaction.user.id}> geschlossen.`,
          fields: [{ name: 'Grund', value: reason }],
          color: '#ED4245'
        })] });

        // Update transcript
        try {
          const dir = path.join(__dirname, '..', 'transcripts', guildId);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const txt = path.join(dir, `transcript_${ticket.id}.txt`);
          fs.appendFileSync(txt, `\n=== GESCHLOSSEN ===\nVon: ${interaction.user.tag}\nGrund: ${reason}\nZeit: ${new Date().toLocaleString('de-DE')}\n`, 'utf8');
          const html = path.join(dir, `transcript_${ticket.id}.html`);
          if (fs.existsSync(html)) fs.appendFileSync(html, `<div style="background:#d92b2b;padding:10px;margin-top:20px;border-radius:8px;"><b>🔐 Geschlossen</b><br>Von: ${interaction.user.tag}<br>Grund: ${reason}</div>`, 'utf8');
        } catch (e) { console.error('Transcript error:', e); }

        // DM to creator
        try {
          const creator = await interaction.client.users.fetch(ticket.userId).catch(() => null);
          if (creator) await creator.send({ embeds: [createStyledEmbed({ emoji: '🔐', title: 'Ticket geschlossen', description: `Dein Ticket #${ticket.id} auf **${interaction.guild.name}** wurde geschlossen.\n\n**Grund:** ${reason}`, color: '#ED4245', footer: interaction.guild.name })] }).catch(() => {});
        } catch (e) {}

        await interaction.editReply({ content: '✅ Wird geschlossen...' });
        logEvent(interaction.guild, `🔐 #${ticket.id} geschlossen von <@${interaction.user.id}> | ${reason}`);

        setTimeout(async () => {
          if (cfg.archiveEnabled && cfg.archiveCategoryId) {
            try {
              const perms = [{ id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }];
              getAllTeamRoles(guildId).forEach(r => r && perms.push({ id: r, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.SendMessages] }));
              await interaction.channel.permissionOverwrites.set(perms);
              await interaction.channel.setParent(cfg.archiveCategoryId, { lockPermissions: false });
              await interaction.channel.setName(`closed-${interaction.channel.name}`);
              ticket.archived = true;
              saveTickets(guildId, tickets);
            } catch (e) { await interaction.channel.delete().catch(() => {}); }
          } else {
            await interaction.channel.delete().catch(() => {});
          }
        }, 5000);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: REQUEST-CLOSE =====
    if (sub === 'request-close') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      if (ticket.archived) return interaction.reply({ content: '📦 Archiviert.', ephemeral: true });

      const isCreator = ticket.userId === interaction.user.id;
      const type = isCreator ? 'user' : 'team';

      ticket.closeRequest = { requestedBy: interaction.user.id, requesterType: type, requestedAt: Date.now(), status: 'pending' };
      saveTickets(guildId, tickets);

      const ping = type === 'user' ? (ticket.claimer ? `<@${ticket.claimer}>` : getAllTeamRoles(guildId).map(r => `<@&${r}>`).join(' ')) : `<@${ticket.userId}>`;

      const msg = await interaction.channel.send({
        content: ping,
        embeds: [createStyledEmbed({ emoji: '📩', title: 'Schließungsanfrage', description: `<@${interaction.user.id}> möchte schließen.`, color: '#FEE75C' })],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('approve_close_request').setLabel('Genehmigen').setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId('deny_close_request').setLabel('Ablehnen').setStyle(ButtonStyle.Danger).setEmoji('❌')
        )]
      });

      ticket.closeRequest.messageId = msg.id;
      saveTickets(guildId, tickets);
      await interaction.reply({ content: '📩 Anfrage gesendet!', ephemeral: true });
      logEvent(interaction.guild, `📩 Schließungsanfrage #${ticket.id} von <@${interaction.user.id}>`);
    }

    // ===== STANDALONE: ELEVATE =====
    if (sub === 'elevate') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      const cur = ticket.priority || 0;
      if (cur >= 2) return interaction.reply({ content: '🔴 Bereits höchste Priorität.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        const next = cur + 1;
        ticket.priority = next;
        saveTickets(guildId, tickets);

        let name = interaction.channel.name.replace(/^(🟢|🟠|🔴)/, '').trim();
        await interaction.channel.setName(`${PRIORITY_STATES[next].dot}${name}`).catch(() => {});

        for (const r of getHierarchicalPriorityRoles(guildId, next)) {
          if (r?.trim()) await interaction.channel.permissionOverwrites.edit(r, { ViewChannel: true, SendMessages: ticket.claimer ? false : true }).catch(() => {});
        }

        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '⬆️', title: 'Priorität erhöht', fields: [{ name: 'Jetzt', value: `${PRIORITY_STATES[next].dot} ${PRIORITY_STATES[next].label}`, inline: true }], color: PRIORITY_STATES[next].embedColor })] });
        await interaction.editReply({ content: `✅ ${PRIORITY_STATES[next].label}` });
        logEvent(interaction.guild, `⬆️ #${ticket.id} → ${PRIORITY_STATES[next].label} von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: LOWER =====
    if (sub === 'lower') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      const cur = ticket.priority || 0;
      if (cur <= 0) return interaction.reply({ content: '🟢 Bereits niedrigste Priorität.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        const next = cur - 1;
        ticket.priority = next;
        saveTickets(guildId, tickets);

        let name = interaction.channel.name.replace(/^(🟢|🟠|🔴)/, '').trim();
        await interaction.channel.setName(`${PRIORITY_STATES[next].dot}${name}`).catch(() => {});

        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '⬇️', title: 'Priorität gesenkt', fields: [{ name: 'Jetzt', value: `${PRIORITY_STATES[next].dot} ${PRIORITY_STATES[next].label}`, inline: true }], color: PRIORITY_STATES[next].embedColor })] });
        await interaction.editReply({ content: `✅ ${PRIORITY_STATES[next].label}` });
        logEvent(interaction.guild, `⬇️ #${ticket.id} → ${PRIORITY_STATES[next].label} von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: MERGE =====
    if (sub === 'merge') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      const open = tickets.filter(t => t.status === 'offen' && t.id !== ticket.id && !t.isApplication);
      if (!open.length) return interaction.reply({ content: '❌ Keine anderen Tickets.', ephemeral: true });

      const opts = open.slice(0, 25).map(t => ({ label: `#${t.id}`, description: `${t.topic || 'Kein Thema'}`.substring(0, 100), value: `${t.id}` }));

      await interaction.reply({
        embeds: [createStyledEmbed({ emoji: '🔗', title: 'Merge', description: 'Wähle ein Ticket zum Zusammenführen.', color: '#5865F2' })],
        components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`merge_ticket_select:${ticket.id}`).setPlaceholder('Ticket wählen...').addOptions(opts))],
        ephemeral: true
      });
    }

    // ===== STANDALONE: ADD =====
    if (sub === 'add') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const user = interaction.options.getUser('user');
      const member = interaction.options.getMember('user');
      if (!member) return interaction.reply({ content: `❌ ${user.tag} nicht auf Server.`, ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      if (!ticket.addedUsers) ticket.addedUsers = [];
      if (ticket.addedUsers.includes(user.id) || ticket.userId === user.id) return interaction.reply({ content: `ℹ️ <@${user.id}> hat bereits Zugriff.`, ephemeral: true });

      try {
        ticket.addedUsers.push(user.id);
        saveTickets(guildId, tickets);
        await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '👥', title: 'User hinzugefügt', description: `<@${user.id}> von <@${interaction.user.id}>`, color: '#57F287' })] });
        await interaction.reply({ content: `✅ <@${user.id}> hinzugefügt!`, ephemeral: true });
        logEvent(interaction.guild, `👥 <@${user.id}> zu #${ticket.id} von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.reply({ content: '❌ Fehler.', ephemeral: true }); }
    }

    // ===== STANDALONE: HIDE =====
    if (sub === 'hide') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      if (ticket.claimer !== interaction.user.id) return interaction.reply({ content: '🚫 Nur Claimer!', ephemeral: true });

      await interaction.deferReply();
      try {
        ticket.hidden = true;
        saveTickets(guildId, tickets);
        for (const r of getAllTeamRoles(guildId)) await interaction.channel.permissionOverwrites.edit(r, { ViewChannel: false }).catch(() => {});
        for (const u of [ticket.userId, ticket.claimer, ...(ticket.addedUsers || [])]) {
          if (u) await interaction.channel.permissionOverwrites.edit(u, { ViewChannel: true, SendMessages: true }).catch(() => {});
        }
        await interaction.editReply({ embeds: [createStyledEmbed({ emoji: '🔒', title: 'Versteckt', color: '#FEE75C' })] });
        logEvent(interaction.guild, `🔒 #${ticket.id} versteckt von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: UNHIDE =====
    if (sub === 'unhide') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      if (ticket.claimer !== interaction.user.id) return interaction.reply({ content: '🚫 Nur Claimer!', ephemeral: true });
      if (!ticket.hidden) return interaction.reply({ content: 'ℹ️ Nicht versteckt.', ephemeral: true });

      await interaction.deferReply();
      try {
        ticket.hidden = false;
        saveTickets(guildId, tickets);
        const cfg = readCfg(guildId);
        const roles = [...(Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId]), ...(cfg.priorityRoles?.[ticket.priority?.toString()] || [])];
        for (const r of roles) if (r) await interaction.channel.permissionOverwrites.edit(r, { ViewChannel: true, SendMessages: true }).catch(() => {});
        await interaction.editReply({ embeds: [createStyledEmbed({ emoji: '👁️', title: 'Sichtbar', color: '#57F287' })] });
        logEvent(interaction.guild, `👁️ #${ticket.id} sichtbar von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: SPLIT =====
    if (sub === 'split') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const reason = interaction.options.getString('reason');
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      await interaction.deferReply();
      try {
        const num = nextTicket(guildId);
        const ch = await interaction.guild.channels.create({
          name: `ticket-${num}`, type: 0, parent: interaction.channel.parentId,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: ['ViewChannel'] },
            { id: ticket.userId, allow: ['ViewChannel', 'SendMessages'] },
            { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] }
          ]
        });
        for (const r of getAllTeamRoles(guildId)) await ch.permissionOverwrites.edit(r, { ViewChannel: true, SendMessages: true }).catch(() => {});

        tickets.push({ id: num, channelId: ch.id, userId: ticket.userId, topic: reason, status: 'open', claimer: interaction.user.id, priority: ticket.priority || 0, createdAt: new Date().toISOString(), splitFrom: ticket.id, addedUsers: ticket.addedUsers || [] });
        if (!ticket.splitTo) ticket.splitTo = [];
        ticket.splitTo.push(num);
        saveTickets(guildId, tickets);

        await ch.send({ content: `<@${ticket.userId}>`, embeds: [createStyledEmbed({ emoji: '🔀', title: `Split #${num}`, description: `Aus #${ticket.id}\n**Grund:** ${reason}`, color: '#5865F2' })] });
        await interaction.editReply({ embeds: [createStyledEmbed({ emoji: '🔀', title: 'Gesplittet', description: `<#${ch.id}>`, color: '#5865F2' })] });
        logEvent(interaction.guild, `🔀 #${ticket.id} → #${num} von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: BLOCK =====
    if (sub === 'block') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam && ticket.claimer !== interaction.user.id) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });
      if (ticket.blocked) return interaction.reply({ content: '🔒 Bereits gesperrt.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
        ticket.blocked = true;
        saveTickets(guildId, tickets);
        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '🔒', title: 'Gesperrt', color: '#ED4245' })] });
        await interaction.editReply({ content: '✅ Gesperrt!' });
        logEvent(interaction.guild, `🔒 #${ticket.id} gesperrt von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: UNBLOCK =====
    if (sub === 'unblock') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam && ticket.claimer !== interaction.user.id) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });
      if (!ticket.blocked) return interaction.reply({ content: '🔓 Nicht gesperrt.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        const cfg = readCfg(guildId);
        const perms = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ticket.userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        (ticket.addedUsers || []).forEach(u => perms.push({ id: u, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }));
        if (ticket.claimer) perms.push({ id: ticket.claimer, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        else (Array.isArray(cfg.teamRoleId) ? cfg.teamRoleId : [cfg.teamRoleId]).forEach(r => r && perms.push({ id: r, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }));
        await interaction.channel.permissionOverwrites.set(perms);
        ticket.blocked = false;
        saveTickets(guildId, tickets);
        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '🔓', title: 'Entsperrt', color: '#57F287' })] });
        await interaction.editReply({ content: '✅ Entsperrt!' });
        logEvent(interaction.guild, `🔓 #${ticket.id} entsperrt von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }

    // ===== STANDALONE: RENAME =====
    if (sub === 'rename') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam && ticket.claimer !== interaction.user.id && ticket.userId !== interaction.user.id) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const name = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9äöüß\-_]/gi, '-').replace(/-+/g, '-').substring(0, 100);
      if (!name) return interaction.reply({ content: '❌ Ungültiger Name.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      try {
        const old = interaction.channel.name;
        await interaction.channel.setName(name);
        ticket.previousName = old;
        saveTickets(guildId, tickets);
        await interaction.channel.send({ embeds: [createStyledEmbed({ emoji: '✏️', title: 'Umbenannt', fields: [{ name: 'Vorher', value: old, inline: true }, { name: 'Jetzt', value: name, inline: true }], color: '#5865F2' })] });
        await interaction.editReply({ content: `✅ \`${name}\`` });
        logEvent(interaction.guild, `✏️ #${ticket.id}: ${old} → ${name} von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler (Rate-Limit?).' }); }
    }

    // ===== STANDALONE: PAUSE =====
    if (sub === 'pause') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      ticket.autoClosePaused = true;
      saveTickets(guildId, tickets);
      await interaction.reply({ embeds: [createStyledEmbed({ emoji: '⏸️', title: 'Auto-Close pausiert', color: '#FEE75C' })] });
      logEvent(interaction.guild, `⏸️ #${ticket.id} Auto-Close pausiert von <@${interaction.user.id}>`);
    }

    // ===== STANDALONE: RESUME =====
    if (sub === 'resume') {
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });
      ticket.autoClosePaused = false;
      saveTickets(guildId, tickets);
      await interaction.reply({ embeds: [createStyledEmbed({ emoji: '▶️', title: 'Auto-Close fortgesetzt', color: '#57F287' })] });
      logEvent(interaction.guild, `▶️ #${ticket.id} Auto-Close fortgesetzt von <@${interaction.user.id}>`);
    }

    // ===== STANDALONE: FORWARD =====
    if (sub === 'forward') {
      const isTeam = hasAnyTeamRole(interaction.member, guildId);
      if (!isTeam) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '🚫', title: 'Zugriff verweigert', color: '#ED4245' })], ephemeral: true });

      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      if (!user && !role) return interaction.reply({ content: '❌ User oder Rolle angeben!', ephemeral: true });

      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);
      if (!ticket) return interaction.reply({ embeds: [createStyledEmbed({ emoji: '❌', title: 'Kein Ticket', color: '#ED4245' })], ephemeral: true });

      await interaction.deferReply();
      try {
        if (user) await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true });
        if (role) await interaction.channel.permissionOverwrites.edit(role.id, { ViewChannel: true, SendMessages: true });
        saveTickets(guildId, tickets);
        await interaction.editReply({ embeds: [createStyledEmbed({ emoji: '➡️', title: 'Weitergeleitet', description: `An ${user ? `<@${user.id}>` : ''}${user && role ? ' & ' : ''}${role ? `<@&${role.id}>` : ''}`, color: '#5865F2' })] });
        logEvent(interaction.guild, `➡️ #${ticket.id} weitergeleitet von <@${interaction.user.id}>`);
      } catch (e) { console.error(e); await interaction.editReply({ content: '❌ Fehler.' }); }
    }
  }
};
