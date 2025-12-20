const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { readCfg, writeCfg } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('availability')
    .setDescription('Toggle your availability for auto-assignment')
    .setDescriptionLocalizations({
      de: 'Verfügbarkeit für automatische Zuweisung umschalten',
      'en-US': 'Toggle your availability for auto-assignment',
      'en-GB': 'Toggle your availability for auto-assignment'
    })
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const cfg = readCfg(guildId);

    // Check if auto-assignment is enabled
    if (!cfg.autoAssignment || !cfg.autoAssignment.enabled) {
      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('⚠️ Automatische Zuweisung nicht aktiv')
        .setDescription('Das Auto-Assignment System ist auf diesem Server nicht aktiviert.\n\nEin Admin kann es im `/dashboard` aktivieren.')
        .setFooter({ text: 'Quantix Tickets' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Initialize excluded members array if not exists
    if (!cfg.autoAssignment.excludedMembers) {
      cfg.autoAssignment.excludedMembers = [];
    }

    const isExcluded = cfg.autoAssignment.excludedMembers.includes(userId);

    if (isExcluded) {
      // Remove from excluded list (make available again)
      cfg.autoAssignment.excludedMembers = cfg.autoAssignment.excludedMembers.filter(id => id !== userId);
      writeCfg(guildId, cfg);

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('✅ Verfügbar für Auto-Assignment')
        .setDescription(
          '**Du wurdest wieder zur automatischen Zuweisung hinzugefügt.**\n\n' +
          'Ab sofort können dir wieder automatisch Tickets zugewiesen werden.'
        )
        .addFields(
          { name: '📊 Status', value: '🟢 Verfügbar', inline: true },
          { name: '🎯 Strategie', value: cfg.autoAssignment.strategy || 'workload', inline: true }
        )
        .setFooter({ text: 'Quantix Tickets • Auto-Assignment' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      // Add to excluded list (make unavailable)
      cfg.autoAssignment.excludedMembers.push(userId);
      writeCfg(guildId, cfg);

      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('⏸️ Pausiert von Auto-Assignment')
        .setDescription(
          '**Du wurdest von der automatischen Zuweisung ausgenommen.**\n\n' +
          'Dir werden jetzt keine neuen Tickets automatisch zugewiesen.\n' +
          'Du kannst Tickets weiterhin manuell claimen.'
        )
        .addFields(
          { name: '📊 Status', value: '⏸️ Pausiert', inline: true },
          { name: '💡 Tipp', value: 'Nutze `/availability` erneut um dich wieder zu aktivieren', inline: false }
        )
        .setFooter({ text: 'Quantix Tickets • Auto-Assignment' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};
