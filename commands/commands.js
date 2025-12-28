const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Owner and Founder IDs
const OWNER_IDS = ['928901974106202113', '1159182333316968530', '1415387837359984740', '1048900200497954868'];
const FOUNDER_IDS = ['1048900200497954868', '1159182333316968530'];

function getCommandsList(userId, member, guildId) {
  const isAdmin = member.permissions.has('Administrator');
  const isOwner = OWNER_IDS.includes(userId);
  const isFounder = FOUNDER_IDS.includes(userId);
  const isTeam = member.roles.cache.some(role =>
    role.permissions.has('ManageMessages') || role.permissions.has('Administrator')
  );

  const commands = [
    {
      category: '🎫 Ticket Management',
      emoji: '🎫',
      items: [
        {
          name: '/dashboard',
          description: 'Web-Dashboard für Server-Konfiguration',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/mytickets',
          description: 'Zeige alle deine eigenen Tickets',
          permission: 'Alle',
          canUse: true,
          premium: null
        },
        {
          name: '/forward',
          description: 'Leite ein Ticket an ein anderes Team-Mitglied weiter',
          permission: 'Claimer',
          canUse: isTeam,
          premium: null
        },
        {
          name: '/tag',
          description: 'Verwalte Tags für bessere Ticket-Organisation',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        },
        {
          name: '/template',
          description: 'Vordefinierte Antwort-Vorlagen verwenden',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        },
        {
          name: '/department',
          description: 'Abteilungsverwaltung und Ticket-Weiterleitung',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        },
        {
          name: '/depart',
          description: 'Verlasse deine aktuelle Abteilung',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        },
        {
          name: '/apply',
          description: 'Bewerbungstickets verwalten (claim, hide, forward)',
          permission: 'Team/Claimer',
          canUse: isTeam,
          premium: null
        }
      ]
    },
    {
      category: '📝 Notizen & Organisation',
      emoji: '📝',
      items: [
        {
          name: '/note-add',
          description: 'Füge eine interne Notiz zu einem Ticket hinzu',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        },
        {
          name: '/note-list',
          description: 'Zeige alle Notizen eines Tickets',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        },
        {
          name: '/status',
          description: 'Setze einen benutzerdefinierten Ticket-Status',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        }
      ]
    },
    {
      category: '🚫 Moderation',
      emoji: '🚫',
      items: [
        {
          name: '/ticket-blacklist add',
          description: 'Blockiere User von der Ticket-Erstellung',
          permission: 'Nachrichten verwalten',
          canUse: isAdmin || member.permissions.has('ManageMessages'),
          premium: null
        },
        {
          name: '/ticket-blacklist remove',
          description: 'Entferne User von der Blacklist',
          permission: 'Nachrichten verwalten',
          canUse: isAdmin || member.permissions.has('ManageMessages'),
          premium: null
        },
        {
          name: '/ticket-blacklist list',
          description: 'Zeige alle blockierten User',
          permission: 'Nachrichten verwalten',
          canUse: isAdmin || member.permissions.has('ManageMessages'),
          premium: null
        },
        {
          name: '/ticket-blacklist check',
          description: 'Prüfe ob ein User blockiert ist',
          permission: 'Nachrichten verwalten',
          canUse: isAdmin || member.permissions.has('ManageMessages'),
          premium: null
        },
        {
          name: '/vip',
          description: 'VIP-User verwalten (Nur bestimmte Server)',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        }
      ]
    },
    {
      category: '⚙️ Server-Einstellungen',
      emoji: '⚙️',
      items: [
        {
          name: '/language',
          description: 'Server-Sprache ändern (9 Sprachen verfügbar)',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/setup time',
          description: 'Supportzeiten für die Ticket-Erstellung konfigurieren',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/setup wizard',
          description: 'Interaktiver Setup-Assistent (Rollen, Kategorie, Panel, Logs)',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/userlanguage',
          description: 'Persönliche Sprache ändern',
          permission: 'Alle',
          canUse: true,
          premium: null
        },
        {
          name: '/send-application-panel',
          description: 'Bewerbungs-Panel in einen Channel senden',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/send-panel-advanced',
          description: 'Erweitertes Ticket-Panel mit System-Auswahl',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/github-commits',
          description: 'GitHub Commit-Benachrichtigungen toggle',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/togglemessage',
          description: 'Startup-Benachrichtigungen toggle',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        },
        {
          name: '/availability',
          description: 'Team-Mitglied Verfügbarkeit setzen',
          permission: 'Team',
          canUse: isTeam,
          premium: null
        }
      ]
    },
    {
      category: '📊 Analytics & Statistiken',
      emoji: '📊',
      items: [
        {
          name: 'Analytics Dashboard',
          description: 'Web-basierte Analytics (Tickets, Ratings, Performance)',
          permission: 'Team/Admin',
          canUse: isTeam || isAdmin,
          premium: null
        },
        {
          name: 'Ticket History',
          description: 'Detaillierte Ticket-Historie im Web-Panel',
          permission: 'Administrator',
          canUse: isAdmin,
          premium: null
        }
      ]
    },
    {
      category: 'ℹ️ Information',
      emoji: 'ℹ️',
      items: [
        {
          name: '/version',
          description: 'Bot-Version und Changelog anzeigen',
          permission: 'Alle',
          canUse: true,
          premium: null
        },
        {
          name: '/commands',
          description: 'Diese Command-Liste anzeigen',
          permission: 'Alle',
          canUse: true,
          premium: null
        },
        {
          name: '/uptime',
          description: 'Bot-Uptime und Statistiken anzeigen',
          permission: 'Alle',
          canUse: true,
          premium: null
        },
        {
          name: '/status',
          description: 'Bot und Web-Panel Status anzeigen',
          permission: 'Alle',
          canUse: true,
          premium: null
        }
      ]
    }
  ];

  // System Commands (nur für Owner)
  if (isOwner) {
    commands.push({
      category: '🔧 System-Commands',
      emoji: '🔧',
      items: [
        {
          name: '/reload',
          description: 'Commands und Konfiguration neu laden',
          permission: 'Owner',
          canUse: true,
          premium: null
        },
        {
          name: '/restart',
          description: 'Bot neu starten',
          permission: 'Owner',
          canUse: true,
          premium: null
        },
        {
          name: '/update',
          description: 'Bot von GitHub aktualisieren',
          permission: 'Owner',
          canUse: true,
          premium: null
        }
      ]
    });

    commands.push({
      category: '👑 Owner-Commands',
      emoji: '👑',
      items: [
        {
          name: '/broadcast',
          description: 'Nachricht an alle Server senden',
          permission: 'Owner',
          canUse: true,
          premium: null
        },
        {
          name: '/lifetime-premium',
          description: 'Lifetime Premium verwalten',
          permission: 'Owner',
          canUse: true,
          premium: null
        },
        {
          name: '/betatester',
          description: 'Betatester-Status verwalten',
          permission: 'Owner',
          canUse: true,
          premium: null
        },
        {
          name: '/premium-role',
          description: 'Premium-Rollen verwalten',
          permission: 'Owner',
          canUse: true,
          premium: null
        },
        {
          name: '/partner add',
          description: 'Partner-Status hinzufügen (Lifetime Pro)',
          permission: 'Founder',
          canUse: isFounder,
          premium: null
        },
        {
          name: '/partner remove',
          description: 'Partner-Status entfernen',
          permission: 'Founder',
          canUse: isFounder,
          premium: null
        },
        {
          name: '/partner list',
          description: 'Alle Partner-Server auflisten',
          permission: 'Founder',
          canUse: isFounder,
          premium: null
        },
        {
          name: '/ticket-open-as',
          description: 'Ticket als anderer User öffnen (Testing)',
          permission: 'Owner',
          canUse: true,
          premium: null
        }
      ]
    });
  }

  // Founder Commands
  if (isFounder) {
    commands.push({
      category: '⭐ Founder-Commands',
      emoji: '⭐',
      items: [
        {
          name: '/maintenance',
          description: 'Wartungsmodus aktivieren/deaktivieren',
          permission: 'Founder',
          canUse: true,
          premium: null
        },
        {
          name: 'Founder Panel',
          description: 'Zugriff auf /founder Web-Panel (Server verwalten)',
          permission: 'Founder',
          canUse: true,
          premium: null
        },
        {
          name: 'Owner Panel',
          description: 'Zugriff auf /owner Web-Panel (Premium, Feedback)',
          permission: 'Owner',
          canUse: isOwner,
          premium: null
        }
      ]
    });
  }

  return commands;
}

function buildCommandEmbed(commands, username) {
  const embed = new EmbedBuilder()
    .setColor(0x00ff88)
    .setAuthor({
      name: 'Quantix Tickets - Command Übersicht',
      iconURL: 'https://cdn.discordapp.com/attachments/1234567890/icon.png' // Optional: Bot icon
    })
    .setDescription(
      '**Hier findest du alle verfügbaren Bot-Commands.**\n\n' +
      '**Legende:**\n' +
      '✅ = Du kannst diesen Command verwenden\n' +
      '❌ = Keine Berechtigung\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    )
    .setFooter({ text: `Angefordert von ${username} • Quantix Tickets` })
    .setTimestamp();

  // Add fields for each category
  for (const category of commands) {
    let fieldValue = '';

    for (const cmd of category.items) {
      const icon = cmd.canUse ? '✅' : '❌';

      fieldValue += `${icon} **${cmd.name}**\n`;
      fieldValue += `   └ ${cmd.description}\n`;
      fieldValue += `   └ *${cmd.permission}*\n\n`;
    }

    embed.addFields({
      name: `${category.emoji} ${category.category}`,
      value: fieldValue || 'Keine Commands',
      inline: false
    });
  }

  // Add helpful information
  embed.addFields({
    name: '💡 Hilfreiche Tipps',
    value:
      '• Commands können auch mit **!commands** im Chat aufgerufen werden\n' +
      '• Verwende **/dashboard** für detaillierte Konfiguration\n' +
      '• Brauchst du Hilfe? Klicke auf den **Support** Button!',
    inline: false
  });

  return embed;
}

function buildButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setURL('https://tickets.quantix-bot.de/panel')
      .setStyle(ButtonStyle.Link)
      .setLabel('Dashboard')
      .setEmoji('🎛️'),
    new ButtonBuilder()
      .setURL('https://discord.com/invite/mnYbnpyyBS')
      .setStyle(ButtonStyle.Link)
      .setLabel('Support')
      .setEmoji('💬'),
    new ButtonBuilder()
      .setURL('https://tickets.quantix-bot.de')
      .setStyle(ButtonStyle.Link)
      .setLabel('Website')
      .setEmoji('🌐')
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Show all available bot commands')
    .setDescriptionLocalizations({
      de: 'Zeige alle verfügbaren Bot-Commands'
    }),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.user.id;
      const member = interaction.member;
      const guildId = interaction.guild?.id;

      const commands = getCommandsList(userId, member, guildId);
      const embed = buildCommandEmbed(commands, interaction.user.username);
      const buttonRow = buildButtonRow();

      await interaction.editReply({
        embeds: [embed],
        components: [buttonRow]
      });

    } catch (err) {
      console.error('Error in commands command:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ein Fehler ist aufgetreten beim Laden der Command-Liste.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: '❌ Ein Fehler ist aufgetreten beim Laden der Command-Liste.'
        });
      }
    }
  },

  // Export helper functions for message command
  getCommandsList,
  buildCommandEmbed,
  buildButtonRow
};
