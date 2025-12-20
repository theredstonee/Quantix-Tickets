const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { readCfg, loadTickets } = require('../database');


module.exports = {
  data: new SlashCommandBuilder()
    .setName('template')
    .setDescription('Use predefined templates for quick responses')
    .setDescriptionLocalizations({ de: 'Verwende vordefinierte Vorlagen für schnelle Antworten' })
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand.setName('use')
        .setDescription('Send a predefined template message in this ticket')
        .setDescriptionLocalizations({ de: 'Sende eine vordefinierte Vorlage in diesem Ticket' })
    )
    .addSubcommand(subcommand =>
      subcommand.setName('list')
        .setDescription('List all available templates')
        .setDescriptionLocalizations({ de: 'Alle verfügbaren Vorlagen anzeigen' })
    ),

  async execute(interaction) {
    const { guild, channel, member } = interaction;
    const guildId = guild.id;

    const cfg = readCfg(guildId);
    const templates = cfg.templates || [];

    if (templates.length === 0) {
      return interaction.reply({
        content: '❌ No templates configured! An admin needs to create templates first via the admin panel.',
        ephemeral: true
      });
    }

    // Check if user is admin or team member
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const isTeam = cfg.teamRoleId && member.roles.cache.has(cfg.teamRoleId);

    if (!isAdmin && !isTeam) {
      return interaction.reply({
        content: '❌ Only admins and team members can use templates.',
        ephemeral: true
      });
    }

    // Check if this is a ticket channel
    const tickets = loadTickets(guildId);
    const ticket = tickets.find(t => t.channelId === channel.id);

    if (!ticket) {
      return interaction.reply({
        content: '❌ This command can only be used in a ticket channel.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'list') {
        // List all available templates
        const embed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('📋 Available Templates')
          .setDescription(templates.map((tpl, index) =>
            `**${index + 1}.** ${tpl.name}\n${tpl.description ? `_${tpl.description}_` : ''}`
          ).join('\n\n') || 'No templates available')
          .setFooter({ text: 'Use /template use to send a template' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (subcommand === 'use') {
        // Show template selection menu
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('template_use_select')
          .setPlaceholder('Select a template to send')
          .addOptions(
            templates.slice(0, 25).map((tpl, index) => ({
              label: tpl.name,
              value: tpl.id || `template_${index}`,
              description: tpl.description ? tpl.description.substring(0, 100) : 'Click to send this template',
              emoji: '📝'
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          content: '📋 **Select a template to send:**',
          components: [row],
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('Template command error:', err);
      return interaction.reply({
        content: '❌ An error occurred while managing templates.',
        ephemeral: true
      });
    }
  }
};
