const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Owner and Founder IDs
const OWNER_IDS = ['928901974106202113', '1159182333316968530', '1415387837359984740', '1048900200497954868'];
const FOUNDER_IDS = ['1048900200497954868', '1159182333316968530'];

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
      const isAdmin = member.permissions.has('Administrator');
      const isOwner = OWNER_IDS.includes(userId);
      const isFounder = FOUNDER_IDS.includes(userId);

      // Define all commands with their info
      const commands = [
        {
          category: '📋 Allgemeine Commands',
          items: [
            {
              name: '/dashboard',
              description: 'Öffnet das Web-Dashboard',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/version',
              description: 'Zeigt die Bot-Version und Changelog',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/commands',
              description: 'Zeigt diese Command-Liste',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/forward',
              description: 'Leitet ein Ticket an ein anderes Team-Mitglied weiter (Pro Feature)',
              permission: 'Claimer',
              canUse: true
            }
          ]
        },
        {
          category: '⚙️ Server-Einstellungen',
          items: [
            {
              name: '/language',
              description: 'Ändert die Server-Sprache',
              permission: 'Administrator',
              canUse: isAdmin
            },
            {
              name: '/userlanguage',
              description: 'Ändert deine persönliche Sprache',
              permission: 'Alle',
              canUse: true
            },
            {
              name: '/github-commits',
              description: 'Toggle GitHub Commit-Benachrichtigungen',
              permission: 'Administrator',
              canUse: isAdmin
            },
            {
              name: '/togglemessage',
              description: 'Toggle Startup-Benachrichtigungen',
              permission: 'Administrator',
              canUse: isAdmin
            }
          ]
        },
        {
          category: '🔧 System-Commands',
          items: [
            {
              name: '/reload',
              description: 'Lädt Commands neu',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/restart',
              description: 'Startet den Bot neu',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/update',
              description: 'Updated den Bot von GitHub',
              permission: 'Owner',
              canUse: isOwner
            }
          ]
        },
        {
          category: '👑 Owner-Commands',
          items: [
            {
              name: '/broadcast',
              description: 'Sendet eine Nachricht an alle Server',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/lifetime-premium',
              description: 'Verwaltet Lifetime Premium',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/betatester',
              description: 'Verwaltet Betatester-Status',
              permission: 'Owner',
              canUse: isOwner
            },
            {
              name: '/premium-role',
              description: 'Verwaltet Premium-Rollen',
              permission: 'Owner',
              canUse: isOwner
            }
          ]
        }
      ];

      // Add Founder category if user is founder
      if (isFounder) {
        commands.push({
          category: '⭐ Founder-Commands',
          items: [
            {
              name: 'Founder Panel',
              description: 'Zugriff auf /founder Web-Panel',
              permission: 'Founder',
              canUse: isFounder
            }
          ]
        });
      }

      // Build embed
      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('📚 Quantix Tickets - Command Liste')
        .setDescription('Hier findest du alle verfügbaren Bot-Commands.\n✅ = Du kannst diesen Command verwenden\n❌ = Keine Berechtigung')
        .setFooter({ text: 'Quantix Tickets' })
        .setTimestamp();

      // Add fields for each category
      for (const category of commands) {
        let fieldValue = '';

        for (const cmd of category.items) {
          const icon = cmd.canUse ? '✅' : '❌';
          fieldValue += `${icon} **${cmd.name}**\n`;
          fieldValue += `└ ${cmd.description}\n`;
          fieldValue += `└ *Berechtigung: ${cmd.permission}*\n\n`;
        }

        embed.addFields({
          name: category.category,
          value: fieldValue || 'Keine Commands',
          inline: false
        });
      }

      // Add usage info
      embed.addFields({
        name: '💡 Hinweis',
        value: 'Du kannst Commands auch mit `!commands` im Chat aufrufen.\nFür mehr Informationen besuche das Dashboard mit `/dashboard`.',
        inline: false
      });

      await interaction.editReply({ embeds: [embed] });

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
  }
};
