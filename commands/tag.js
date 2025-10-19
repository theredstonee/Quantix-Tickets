const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
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

function writeCfg(guildId, cfg) {
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
}

function getTicketsPath(guildId) {
  return path.join(CONFIG_DIR, `${guildId}_tickets.json`);
}

function loadTickets(guildId) {
  try {
    const ticketsPath = getTicketsPath(guildId);
    if (!fs.existsSync(ticketsPath)) return [];
    const data = fs.readFileSync(ticketsPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveTickets(guildId, tickets) {
  try {
    const ticketsPath = getTicketsPath(guildId);
    fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving tickets:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Manage ticket tags (Premium Basic+)')
    .setDescriptionLocalizations({
      de: 'Verwalte Ticket-Tags (Premium Basic+)'
    })
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a tag to this ticket')
        .setDescriptionLocalizations({
          de: 'Tag zu diesem Ticket hinzufügen'
        })
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a tag from this ticket')
        .setDescriptionLocalizations({
          de: 'Tag von diesem Ticket entfernen'
        })
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all available tags')
        .setDescriptionLocalizations({
          de: 'Alle verfügbaren Tags anzeigen'
        })
    ),

  async execute(interaction) {
    const { guild, channel, member } = interaction;
    const guildId = guild.id;

    // Premium Check
    if (!hasFeature(guildId, 'customTags')) {
      return interaction.reply({
        content: '❌ **Premium Basic+** Feature! Tags are only available with Premium Basic or higher.\n🔗 Upgrade: https://your-domain.com/premium',
        ephemeral: true
      });
    }

    const cfg = readCfg(guildId);
    const customTags = cfg.customTags || [];

    if (customTags.length === 0) {
      return interaction.reply({
        content: '❌ No tags configured! An admin needs to create tags first via the admin panel.',
        ephemeral: true
      });
    }

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
        // List all available tags
        const embed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('📋 Available Tags')
          .setDescription(customTags.map(tag =>
            `${tag.emoji || '🏷️'} **${tag.label}**`
          ).join('\n') || 'No tags available')
          .setFooter({ text: 'Use /tag add to add a tag to this ticket' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (subcommand === 'add') {
        // Show tag selection menu
        if (!ticket.tags) ticket.tags = [];

        const availableTags = customTags.filter(tag => !ticket.tags.includes(tag.id));

        if (availableTags.length === 0) {
          return interaction.reply({
            content: '✅ All tags are already added to this ticket!',
            ephemeral: true
          });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('tag_add_select')
          .setPlaceholder('Select a tag to add')
          .addOptions(
            availableTags.slice(0, 25).map(tag => ({
              label: tag.label,
              value: tag.id,
              emoji: tag.emoji || '🏷️',
              description: `Add "${tag.label}" tag`
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          content: '📋 **Select a tag to add:**',
          components: [row],
          ephemeral: true
        });
      }

      if (subcommand === 'remove') {
        // Show tag removal menu
        if (!ticket.tags || ticket.tags.length === 0) {
          return interaction.reply({
            content: '❌ No tags on this ticket!',
            ephemeral: true
          });
        }

        const currentTags = customTags.filter(tag => ticket.tags.includes(tag.id));

        if (currentTags.length === 0) {
          return interaction.reply({
            content: '❌ No tags on this ticket!',
            ephemeral: true
          });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('tag_remove_select')
          .setPlaceholder('Select a tag to remove')
          .addOptions(
            currentTags.slice(0, 25).map(tag => ({
              label: tag.label,
              value: tag.id,
              emoji: tag.emoji || '🏷️',
              description: `Remove "${tag.label}" tag`
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.reply({
          content: '📋 **Select a tag to remove:**',
          components: [row],
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('Tag command error:', err);
      return interaction.reply({
        content: '❌ An error occurred while managing tags.',
        ephemeral: true
      });
    }
  }
};
