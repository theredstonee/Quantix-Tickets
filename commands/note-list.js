const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

function getTicketsPath(guildId) {
  return path.join(__dirname, '..', 'configs', `${guildId}_tickets.json`);
}

function safeRead(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

function readCfg(guildId) {
  try {
    const configPath = path.join(__dirname, '..', 'configs', `${guildId}.json`);
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data || {};
  } catch {
    return {};
  }
}

function getAllTeamRoles(guildId) {
  const cfg = readCfg(guildId);
  const roles = new Set();

  if (cfg.priorityRoles) {
    Object.values(cfg.priorityRoles).forEach(roleList => {
      if (Array.isArray(roleList)) roleList.forEach(r => roles.add(r));
    });
  }

  if (cfg.teamRoleId) {
    if (Array.isArray(cfg.teamRoleId)) {
      cfg.teamRoleId.forEach(r => roles.add(r));
    } else {
      roles.add(cfg.teamRoleId);
    }
  }

  return [...roles].filter(r => r && r.trim());
}

function isTeamMember(guildId, member) {
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const teamRoles = getAllTeamRoles(guildId);
  return teamRoles.some(roleId => member.roles.cache.has(roleId));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note-list')
    .setDescription('List all internal notes for the current ticket (team only)')
    .setDescriptionLocalizations({
      de: 'Alle internen Notizen für das aktuelle Ticket auflisten (nur Team)',
      es: 'Listar todas las notas internas del ticket actual (solo equipo)',
      fr: 'Lister toutes les notes internes du ticket actuel (équipe uniquement)',
      pt: 'Listar todas as notas internas do ticket atual (apenas equipe)',
      ru: 'Список всех внутренних заметок текущего тикета (только команда)',
      ja: '現在のチケットのすべての内部メモをリストする（チームのみ）',
      id: 'Daftar semua catatan internal untuk tiket saat ini (hanya tim)'
    })
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const member = interaction.member;

    // Check if user is team member
    if (!isTeamMember(guildId, member)) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Keine Berechtigung')
        .setDescription('Nur Team-Mitglieder können interne Notizen einsehen.')
        .setFooter({ text: 'Quantix Tickets • Fehlende Berechtigung' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Check if we're in a ticket channel
    const ticketsPath = getTicketsPath(guildId);
    const allTickets = safeRead(ticketsPath, []);
    const ticket = allTickets.find(t => t.channelId === interaction.channel.id);

    if (!ticket) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Kein Ticket-Channel')
        .setDescription('Dieser Befehl kann nur in einem Ticket-Channel verwendet werden.')
        .setFooter({ text: 'Quantix Tickets • Ungültiger Channel' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Initialize notes array if it doesn't exist
    if (!ticket.notes || ticket.notes.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('📝 Interne Notizen')
        .setDescription(`**Ticket #${String(ticket.id).padStart(5, '0')}**\n\nKeine internen Notizen vorhanden.`)
        .setFooter({
          text: `Quantix Tickets • Nur für Team sichtbar`,
          iconURL: interaction.guild.iconURL({ size: 64 })
        })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Build notes list
    const notesText = ticket.notes
      .map((note, index) => {
        const timestamp = `<t:${Math.floor(note.timestamp / 1000)}:R>`;
        const author = `<@${note.authorId}>`;
        const content = note.content.length > 200 ? note.content.substring(0, 200) + '...' : note.content;
        return `**${index + 1}.** ${author} • ${timestamp}\n> ${content}\n`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('📝 Interne Notizen')
      .setDescription(
        `**Ticket #${String(ticket.id).padStart(5, '0')}**\n` +
        `**Topic:** ${ticket.topic}\n` +
        `**Ersteller:** <@${ticket.userId}>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        notesText
      )
      .addFields({
        name: '📊 Statistik',
        value: `Gesamt: **${ticket.notes.length}** Notizen`,
        inline: false
      })
      .setFooter({
        text: `Quantix Tickets • Nur für Team sichtbar`,
        iconURL: interaction.guild.iconURL({ size: 64 })
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
