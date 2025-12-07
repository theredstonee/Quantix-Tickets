const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'configs');

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

function saveTickets(guildId, tickets) {
  const ticketsPath = path.join(CONFIG_DIR, `${guildId}_tickets.json`);
  const tempFile = ticketsPath + '.tmp';
  const backupFile = ticketsPath + '.bak';
  try {
    const jsonData = JSON.stringify(tickets, null, 2);
    JSON.parse(jsonData);
    fs.writeFileSync(tempFile, jsonData, 'utf8');
    if (fs.existsSync(ticketsPath)) {
      try { fs.copyFileSync(ticketsPath, backupFile); } catch (e) { /* optional */ }
    }
    fs.renameSync(tempFile, ticketsPath);
  } catch (err) {
    console.error('[department-handler] Error saving tickets:', err.message);
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
  }
}

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
