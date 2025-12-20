const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { readCfg, loadTickets, saveTickets } = require('./database');

/**
 * Handles department forwarding
 */
async function handleDepartmentForward(interaction) {
  const { guild, channel } = interaction;
  const guildId = guild.id;

  try {
    const targetDeptId = interaction.values[0];

    const cfg = readCfg(guildId);
    const departments = cfg.departments || [];
    const targetDept = departments.find(d => d.id === targetDeptId);

    if (!targetDept) {
      return interaction.update({
        content: '❌ Abteilung nicht gefunden.',
        components: [],
        ephemeral: true
      });
    }

    const tickets = loadTickets(guildId);
    const ticketIndex = tickets.findIndex(t => t.channelId === channel.id);

    if (ticketIndex === -1) {
      return interaction.update({
        content: '❌ Ticket nicht gefunden.',
        components: [],
        ephemeral: true
      });
    }

    const ticket = tickets[ticketIndex];
    const oldDept = ticket.department || 'Keine';

    // Update ticket department
    tickets[ticketIndex].department = targetDept.id;
    tickets[ticketIndex].departmentName = targetDept.name;
    saveTickets(guildId, tickets);

    // Update channel permissions
    // Remove old team role if exists
    const oldDeptObj = departments.find(d => d.id === oldDept);
    if (oldDeptObj && oldDeptObj.teamRole) {
      try {
        await channel.permissionOverwrites.delete(oldDeptObj.teamRole);
      } catch (err) {
        console.error('Failed to remove old department team role:', err);
      }
    }

    // Add new team role
    if (targetDept.teamRole) {
      try {
        await channel.permissionOverwrites.create(targetDept.teamRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        });
      } catch (err) {
        console.error('Failed to add new department team role:', err);
      }
    }

    // Send notification in ticket channel
    const notificationEmbed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🔄 Ticket weitergeleitet')
      .setDescription(`Dieses Ticket wurde an **${targetDept.emoji || '📁'} ${targetDept.name}** weitergeleitet.`)
      .addFields(
        { name: 'Vorherige Abteilung', value: oldDeptObj ? `${oldDeptObj.emoji || '📁'} ${oldDeptObj.name}` : 'Keine', inline: true },
        { name: 'Neue Abteilung', value: `${targetDept.emoji || '📁'} ${targetDept.name}`, inline: true },
        { name: 'Weitergeleitet von', value: `<@${interaction.user.id}>`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [notificationEmbed] });

    // Ping new department team
    if (targetDept.teamRole) {
      await channel.send({
        content: `<@&${targetDept.teamRole}> Neues Ticket wurde an eure Abteilung weitergeleitet!`
      });
    }

    await interaction.update({
      content: `✅ Ticket erfolgreich an **${targetDept.emoji || '📁'} ${targetDept.name}** weitergeleitet!`,
      components: [],
      ephemeral: true
    });

  } catch (err) {
    console.error('Department forward error:', err);

    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({
        content: '❌ Fehler beim Weiterleiten des Tickets.',
        ephemeral: true
      });
    } else {
      return interaction.editReply({
        content: '❌ Fehler beim Weiterleiten des Tickets.',
        components: []
      });
    }
  }
}

module.exports = {
  handleDepartmentForward
};
