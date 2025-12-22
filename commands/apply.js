const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { createStyledEmbed } = require('../helpers');
const { readCfg, loadTickets, saveTickets } = require('../database');

function getApplicationTeamRoles(cfg, ticket) {
  const roles = new Set();
  if (cfg?.applicationSystem?.teamRoleId) roles.add(cfg.applicationSystem.teamRoleId);

  if (ticket && typeof ticket.applicationCategoryIndex === 'number') {
    const category = cfg?.applicationSystem?.categories?.[ticket.applicationCategoryIndex];
    if (category?.teamRoleId) roles.add(category.teamRoleId);
  }

  return Array.from(roles).filter(Boolean);
}

function hasApplicationTeamRole(member, cfg, ticket) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const roles = getApplicationTeamRoles(cfg, ticket);
  return roles.some(roleId => member.roles.cache.has(roleId));
}

function findApplicationTicket(guildId, channelId) {
  const tickets = loadTickets(guildId);
  const ticket = tickets.find(t => t.channelId === channelId && t.isApplication);
  return { tickets, ticket };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Bewerbungstickets verwalten')
    .addSubcommand(sub =>
      sub
        .setName('hide')
        .setDescription('Ticket für alle außer Ausführendem und Bewerber verstecken (Claimer)')
    )
    .addSubcommand(sub =>
      sub
        .setName('unhide')
        .setDescription('Verstecktes Bewerbungsticket wieder freigeben (Claimer)')
    )
    .addSubcommand(sub =>
      sub
        .setName('claim')
        .setDescription('Bewerbungsticket übernehmen (Team)')
    )
    .addSubcommand(sub =>
      sub
        .setName('unclaim')
        .setDescription('Übernahme eines Bewerbungstickets aufheben (Claimer)')
    )
    .addSubcommand(sub =>
      sub
        .setName('forward')
        .setDescription('Bewerbung weiterleiten')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Team-Mitglied, an das weitergeleitet werden soll')
            .setRequired(false)
        )
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Rolle, an die weitergeleitet werden soll')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const cfg = readCfg(guildId);
    const subcommand = interaction.options.getSubcommand();
    const { tickets, ticket } = findApplicationTicket(guildId, interaction.channel.id);

    if (!ticket) {
      const embed = createStyledEmbed({
        emoji: '❌',
        title: 'Kein Bewerbungsticket',
        description: 'Dieser Channel gehört zu keinem aktiven Bewerbungsticket.',
        color: '#ED4245'
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const teamRoles = getApplicationTeamRoles(cfg, ticket);
    const isApplicationTeam = hasApplicationTeamRole(interaction.member, cfg, ticket);

    if (subcommand === 'claim') {
      if (!isApplicationTeam) {
        const embed = createStyledEmbed({
          emoji: '🚫',
          title: 'Keine Berechtigung',
          description: 'Nur das Bewerbungs-Team kann Bewerbungen übernehmen.',
          fields: [
            { name: 'Benötigte Rolle', value: teamRoles.length ? teamRoles.map(r => `<@&${r}>`).join(', ') : 'Nicht konfiguriert', inline: false }
          ],
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (ticket.claimer) {
        const embed = createStyledEmbed({
          emoji: '⚠️',
          title: 'Bereits übernommen',
          description: `Diese Bewerbung wurde bereits von <@${ticket.claimer}> übernommen.`,
          color: '#FEE75C'
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      ticket.claimer = interaction.user.id;
      saveTickets(guildId, tickets);

      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ticket.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
      ];

      if (Array.isArray(ticket.addedUsers)) {
        ticket.addedUsers.forEach(uid => {
          overwrites.push({ id: uid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        });
      }

      teamRoles.forEach(roleId => {
        overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
      });

      await interaction.channel.permissionOverwrites.set(overwrites).catch(() => {});

      const embed = createStyledEmbed({
        emoji: '✨',
        title: 'Bewerbung übernommen',
        description: `<@${interaction.user.id}> hat diese Bewerbung übernommen.`,
        fields: [
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Claimer', value: `<@${interaction.user.id}>`, inline: true }
        ],
        color: '#57F287'
      });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'unclaim') {
      if (ticket.claimer !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = createStyledEmbed({
          emoji: '🚫',
          title: 'Keine Berechtigung',
          description: 'Nur der aktuelle Claimer kann die Übernahme aufheben.',
          fields: [
            { name: 'Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Niemand', inline: true }
          ],
          color: '#ED4245'
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      ticket.claimer = null;
      saveTickets(guildId, tickets);

      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: ticket.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
      ];

      if (Array.isArray(ticket.addedUsers)) {
        ticket.addedUsers.forEach(uid => {
          overwrites.push({ id: uid, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
        });
      }

      teamRoles.forEach(roleId => {
        overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
      });

      await interaction.channel.permissionOverwrites.set(overwrites).catch(() => {});

      const embed = createStyledEmbed({
        emoji: '↩️',
        title: 'Übernahme aufgehoben',
        description: 'Das Bewerbungsticket steht wieder allen Team-Mitgliedern zur Verfügung.',
        fields: [
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Von', value: `<@${interaction.user.id}>`, inline: true }
        ],
        color: '#57F287'
      });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (!ticket.claimer || ticket.claimer !== interaction.user.id) {
      const embed = createStyledEmbed({
        emoji: '🚫',
        title: 'Keine Berechtigung',
        description: 'Du musst der Claimer dieser Bewerbung sein, um diesen Befehl zu nutzen.',
        fields: [
          { name: 'Claimer', value: ticket.claimer ? `<@${ticket.claimer}>` : 'Nicht geclaimt', inline: true }
        ],
        color: '#ED4245'
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === 'hide') {
      ticket.hidden = true;
      ticket.hiddenAt = Date.now();
      ticket.hiddenBy = interaction.user.id;
      saveTickets(guildId, tickets);

      const allowedUsers = new Set([interaction.user.id, ticket.userId]);
      if (Array.isArray(ticket.addedUsers)) {
        ticket.addedUsers.forEach(uid => allowedUsers.add(uid));
      }
      if (ticket.claimer) allowedUsers.add(ticket.claimer);

      for (const roleId of teamRoles) {
        await interaction.channel.permissionOverwrites.edit(roleId, { ViewChannel: false, SendMessages: false }).catch(() => {});
      }

      for (const userId of allowedUsers) {
        if (userId) {
          await interaction.channel.permissionOverwrites.edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
          }).catch(() => {});
        }
      }

      const embed = createStyledEmbed({
        emoji: '🔒',
        title: 'Bewerbung versteckt',
        description: 'Das Ticket ist jetzt nur noch für dich und den Bewerber sichtbar.',
        fields: [
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Versteckt von', value: `<@${interaction.user.id}>`, inline: true }
        ],
        color: '#FEE75C'
      });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'unhide') {
      if (!ticket.hidden) {
        const embed = createStyledEmbed({
          emoji: 'ℹ️',
          title: 'Bereits sichtbar',
          description: 'Dieses Bewerbungsticket ist nicht versteckt.',
          color: '#FEE75C'
        });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      ticket.hidden = false;
      ticket.unhiddenAt = Date.now();
      ticket.unhiddenBy = interaction.user.id;
      saveTickets(guildId, tickets);

      for (const roleId of teamRoles) {
        await interaction.channel.permissionOverwrites.edit(roleId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(() => {});
      }

      const embed = createStyledEmbed({
        emoji: '👁️',
        title: 'Bewerbung wieder sichtbar',
        description: 'Das Ticket ist wieder für das Bewerbungs-Team zugänglich.',
        fields: [
          { name: 'Ticket', value: `#${ticket.id}`, inline: true },
          { name: 'Freigegeben von', value: `<@${interaction.user.id}>`, inline: true }
        ],
        color: '#57F287'
      });

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'forward') {
      const targetUser = interaction.options.getUser('user');
      const targetRole = interaction.options.getRole('role');

      if (!targetUser && !targetRole) {
        return interaction.reply({
          content: '❌ Du musst entweder einen Benutzer oder eine Rolle angeben.',
          ephemeral: true
        });
      }

      if (targetUser) {
        if (targetUser.bot) {
          return interaction.reply({ content: '❌ Bots können keine Bewerbungen übernehmen.', ephemeral: true });
        }
        if (targetUser.id === interaction.user.id) {
          return interaction.reply({ content: '❌ Du kannst nicht an dich selbst weiterleiten.', ephemeral: true });
        }
      }

      const targetId = targetUser ? targetUser.id : targetRole.id;
      const targetType = targetUser ? 'user' : 'role';

      const modal = new ModalBuilder()
        .setCustomId(`forward_modal_${targetType}_${targetId}`)
        .setTitle('Bewerbung weiterleiten');

      const reasonInput = new TextInputBuilder()
        .setCustomId('forward_reason')
        .setLabel('Grund der Weiterleitung')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
    }
  }
};
