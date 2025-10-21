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

function safeWrite(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('safeWrite error:', err);
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
    .setName('note-add')
    .setDescription('Add an internal note to the current ticket (team only)')
    .setDescriptionLocalizations({
      de: 'Interne Notiz zum aktuellen Ticket hinzufügen (nur Team)',
      'en-US': 'Add an internal note to the current ticket (team only)',
      'en-GB': 'Add an internal note to the current ticket (team only)',
      'es-ES': 'Agregar una nota interna al ticket actual (solo equipo)',
      fr: 'Ajouter une note interne au ticket actuel (équipe uniquement)',
      'pt-BR': 'Adicionar uma nota interna ao ticket atual (apenas equipe)',
      ru: 'Добавить внутреннюю заметку к текущему тикету (только команда)',
      ja: '現在のチケットに内部メモを追加（チームのみ）',
      id: 'Tambahkan catatan internal ke tiket saat ini (hanya tim)'
    })
    .addStringOption(option =>
      option
        .setName('note')
        .setDescription('The note content')
        .setDescriptionLocalizations({
          de: 'Der Notizinhalt',
          'en-US': 'The note content',
          'en-GB': 'The note content',
          'es-ES': 'El contenido de la nota',
          fr: 'Le contenu de la note',
          'pt-BR': 'O conteúdo da nota',
          ru: 'Содержание заметки',
          ja: 'メモの内容',
          id: 'Konten catatan'
        })
        .setRequired(true)
        .setMaxLength(1000)
    )
    .setDMPermission(false),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const member = interaction.member;

    // Check if user is team member
    if (!isTeamMember(guildId, member)) {
      const embed = new EmbedBuilder()
        .setColor(0xff4444)
        .setTitle('❌ Keine Berechtigung')
        .setDescription('Nur Team-Mitglieder können interne Notizen hinzufügen.')
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

    const noteContent = interaction.options.getString('note');

    // Initialize notes array if it doesn't exist
    if (!ticket.notes) {
      ticket.notes = [];
    }

    // Add the note
    const note = {
      content: noteContent,
      authorId: userId,
      authorTag: interaction.user.tag,
      timestamp: Date.now()
    };

    ticket.notes.push(note);

    // Save tickets
    safeWrite(ticketsPath, allTickets);

    const embed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('📝 Interne Notiz hinzugefügt')
      .setDescription(`**Notiz:**\n${noteContent}`)
      .addFields(
        {
          name: '👤 Autor',
          value: `<@${userId}>`,
          inline: true
        },
        {
          name: '🎫 Ticket',
          value: `#${String(ticket.id).padStart(5, '0')}`,
          inline: true
        },
        {
          name: '📊 Notizen gesamt',
          value: `${ticket.notes.length}`,
          inline: true
        }
      )
      .setFooter({
        text: `Quantix Tickets • Nur für Team sichtbar`,
        iconURL: interaction.guild.iconURL({ size: 64 })
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
