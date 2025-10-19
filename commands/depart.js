const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { hasFeature } = require('../premium');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('depart')
    .setDescription('Forward ticket to department (Premium Basic+)')
    .setDescriptionLocalizations({ de: 'Ticket an Abteilung weiterleiten (Premium Basic+)' })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const { guild, channel } = interaction;
    const guildId = guild.id;

    // Premium Check
    if (!hasFeature(guildId, 'multiDepartment')) {
      return interaction.reply({
        content: '❌ **Premium Basic+** Feature! Multi-Department Support is only available with Premium Basic+ or higher.\n🔗 Upgrade: https://tickets.quantix-bot.de/premium',
        ephemeral: true
      });
    }

    const cfg = readCfg(guildId);
    const departments = cfg.departments || [];

    if (departments.length === 0) {
      return interaction.reply({
        content: '❌ Keine Abteilungen konfiguriert! Ein Admin muss zuerst Abteilungen im Panel erstellen.',
        ephemeral: true
      });
    }

    try {
      // Check if this is a ticket channel
      const tickets = loadTickets(guildId);
      const ticketIndex = tickets.findIndex(t => t.channelId === channel.id);

      if (ticketIndex === -1) {
        return interaction.reply({
          content: '❌ Dieser Command kann nur in einem Ticket-Channel verwendet werden.',
          ephemeral: true
        });
      }

      const ticket = tickets[ticketIndex];
      const currentDept = ticket.department || 'none';

      // Filter out current department
      const availableDepts = departments.filter(d => d.id !== currentDept);

      if (availableDepts.length === 0) {
        return interaction.reply({
          content: '❌ Keine anderen Abteilungen verfügbar.',
          ephemeral: true
        });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('department_forward_select')
        .setPlaceholder('Wähle eine Abteilung')
        .addOptions(
          availableDepts.slice(0, 25).map(dept => ({
            label: dept.name,
            value: dept.id,
            emoji: dept.emoji || '📁',
            description: dept.description ? dept.description.substring(0, 100) : 'An diese Abteilung weiterleiten'
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return interaction.reply({
        content: '🔄 **Ticket weiterleiten**\nWähle die Ziel-Abteilung:',
        components: [row],
        ephemeral: true
      });

    } catch (err) {
      console.error('Depart command error:', err);
      return interaction.reply({
        content: '❌ Ein Fehler ist aufgetreten.',
        ephemeral: true
      });
    }
  }
};
