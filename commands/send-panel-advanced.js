const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllTicketSystems, getTicketSystem } = require('../ticket-systems');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send-panel-advanced')
    .setDescription('Send advanced ticket panel with system selection')
    .setDescriptionLocalizations({
      de: 'Sende erweitertes Ticket-Panel mit System-Auswahl'
    })
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel where to send the panel')
        .setDescriptionLocalizations({ de: 'Channel, in dem das Panel gesendet werden soll' })
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('system')
        .setDescription('Select ticket system')
        .setDescriptionLocalizations({ de: 'Wähle Ticket-System aus' })
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async autocomplete(interaction) {
    const guildId = interaction.guild.id;
    const systems = getAllTicketSystems(guildId);

    const choices = systems
      .filter(sys => sys.enabled)
      .map(sys => ({
        name: `${sys.name} (ID: ${sys.id})`,
        value: sys.id
      }));

    await interaction.respond(choices.slice(0, 25));
  },

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;

      await interaction.deferReply({ ephemeral: true });

      const targetChannel = interaction.options.getChannel('channel');
      const systemId = interaction.options.getString('system');

      // Get ticket system
      const system = getTicketSystem(guildId, systemId);
      if (!system) {
        return interaction.editReply({
          content: `❌ Ticket-System "${systemId}" nicht gefunden.`
        });
      }

      if (!system.enabled) {
        return interaction.editReply({
          content: `❌ Ticket-System "${system.name}" ist deaktiviert.`
        });
      }

      // Validate system configuration
      if (!system.topics || system.topics.length === 0) {
        return interaction.editReply({
          content: `❌ Ticket-System "${system.name}" hat keine Topics konfiguriert. Bitte konfiguriere zuerst Topics im Dashboard.`
        });
      }

      if (!system.categoryId) {
        return interaction.editReply({
          content: `❌ Ticket-System "${system.name}" hat keine Kategorie konfiguriert. Bitte konfiguriere zuerst eine Kategorie im Dashboard.`
        });
      }

      // Build embed
      const embedColor = parseInt(system.embedColor?.replace('#', '') || '00ff88', 16);
      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(system.embedTitle || system.name)
        .setDescription(system.embedDescription || 'Wähle ein Thema aus, um ein Ticket zu erstellen.')
        .setFooter({ text: 'Quantix Tickets • Multi-System' })
        .setTimestamp();

      // Add server icon as thumbnail
      const guildIconURL = interaction.guild.iconURL({ size: 128, extension: 'png' });
      if (guildIconURL) {
        embed.setThumbnail(guildIconURL);
      }

      // Add topics as fields
      for (const topic of system.topics.slice(0, 25)) {
        embed.addFields({
          name: `${topic.emoji || '🎫'} ${topic.label}`,
          value: topic.description || 'Kein Beschreibung',
          inline: true
        });
      }

      // Build buttons
      const buttons = [];
      for (let i = 0; i < Math.min(system.topics.length, 25); i++) {
        const topic = system.topics[i];
        const button = new ButtonBuilder()
          .setCustomId(`ticket_create:${systemId}:${topic.value}`)
          .setLabel(topic.label)
          .setStyle(ButtonStyle.Primary);

        if (topic.emoji) {
          button.setEmoji(topic.emoji);
        }

        buttons.push(button);
      }

      // Split into rows (max 5 buttons per row)
      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      // Send panel
      const panelMessage = await targetChannel.send({
        embeds: [embed],
        components: rows
      });

      // Update system config with panel message ID
      const { updateTicketSystem } = require('../ticket-systems');
      updateTicketSystem(guildId, systemId, {
        panelMessageId: panelMessage.id,
        panelChannelId: targetChannel.id
      });

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('✅ Panel gesendet')
        .setDescription(
          `**Ticket-System:** ${system.name}\n` +
          `**Channel:** <#${targetChannel.id}>\n` +
          `**Topics:** ${system.topics.length}`
        )
        .setFooter({ text: 'Quantix Tickets • Multi-System' })
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Error in send-panel-advanced command:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ein Fehler ist aufgetreten beim Senden des Panels.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: '❌ Ein Fehler ist aufgetreten beim Senden des Panels.'
        });
      }
    }
  }
};
