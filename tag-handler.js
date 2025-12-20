const { EmbedBuilder } = require('discord.js');
const { readCfg, loadTickets, saveTickets } = require('./database');

async function handleTagAdd(interaction) {
  const { guild, channel } = interaction;
  const guildId = guild.id;
  const tagId = interaction.values[0];

  const cfg = readCfg(guildId);
  const customTags = cfg.customTags || [];
  const tag = customTags.find(t => t.id === tagId);

  if (!tag) {
    return interaction.update({
      content: '❌ Tag not found!',
      components: []
    });
  }

  const tickets = loadTickets(guildId);
  const ticketIndex = tickets.findIndex(t => t.channelId === channel.id);

  if (ticketIndex === -1) {
    return interaction.update({
      content: '❌ Ticket not found!',
      components: []
    });
  }

  if (!tickets[ticketIndex].tags) tickets[ticketIndex].tags = [];

  if (tickets[ticketIndex].tags.includes(tagId)) {
    return interaction.update({
      content: `❌ Tag "${tag.label}" is already on this ticket!`,
      components: []
    });
  }

  tickets[ticketIndex].tags.push(tagId);
  saveTickets(guildId, tickets);

  const embed = new EmbedBuilder()
    .setColor(parseInt(tag.color?.replace('#', ''), 16) || 0x00ff88)
    .setDescription(`✅ Tag **${tag.emoji || '🏷️'} ${tag.label}** added to this ticket!`)
    .setTimestamp();

  await interaction.update({
    embeds: [embed],
    components: []
  });

  // Send message in ticket channel
  await channel.send({
    content: `${tag.emoji || '🏷️'} Tag **${tag.label}** wurde hinzugefügt von <@${interaction.user.id}>`
  });
}

async function handleTagRemove(interaction) {
  const { guild, channel } = interaction;
  const guildId = guild.id;
  const tagId = interaction.values[0];

  const cfg = readCfg(guildId);
  const customTags = cfg.customTags || [];
  const tag = customTags.find(t => t.id === tagId);

  if (!tag) {
    return interaction.update({
      content: '❌ Tag not found!',
      components: []
    });
  }

  const tickets = loadTickets(guildId);
  const ticketIndex = tickets.findIndex(t => t.channelId === channel.id);

  if (ticketIndex === -1) {
    return interaction.update({
      content: '❌ Ticket not found!',
      components: []
    });
  }

  if (!tickets[ticketIndex].tags || !tickets[ticketIndex].tags.includes(tagId)) {
    return interaction.update({
      content: `❌ Tag "${tag.label}" is not on this ticket!`,
      components: []
    });
  }

  tickets[ticketIndex].tags = tickets[ticketIndex].tags.filter(t => t !== tagId);
  saveTickets(guildId, tickets);

  const embed = new EmbedBuilder()
    .setColor(parseInt(tag.color?.replace('#', ''), 16) || 0xff4444)
    .setDescription(`✅ Tag **${tag.emoji || '🏷️'} ${tag.label}** removed from this ticket!`)
    .setTimestamp();

  await interaction.update({
    embeds: [embed],
    components: []
  });

  // Send message in ticket channel
  await channel.send({
    content: `${tag.emoji || '🏷️'} Tag **${tag.label}** wurde entfernt von <@${interaction.user.id}>`
  });
}

module.exports = {
  handleTagAdd,
  handleTagRemove
};
