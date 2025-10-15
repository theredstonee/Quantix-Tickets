const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { assignPremiumRole } = require('../premium');

const OWNER_ID = '1159182333316968530';
const THEREDSTONEE_GUILD_ID = '1291125037876904026';
const PREMIUM_ROLE_ID = '1428069033269268551';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium-role')
    .setDescription('Manage Premium Role on Theredstonee Projects (Owner Only)')
    .setDescriptionLocalizations({
      de: 'Premium-Rolle auf Theredstonee Projects verwalten (Nur Owner)'
    })
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add Premium role to a user')
        .setDescriptionLocalizations({
          de: 'Premium-Rolle einem User hinzufügen'
        })
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User who should receive the Premium role')
            .setDescriptionLocalizations({
              de: 'User der die Premium-Rolle erhalten soll'
            })
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove Premium role from a user')
        .setDescriptionLocalizations({
          de: 'Premium-Rolle von einem User entfernen'
        })
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User who should lose the Premium role')
            .setDescriptionLocalizations({
              de: 'User der die Premium-Rolle verlieren soll'
            })
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    // Owner-only check
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '❌ Dieser Command kann nur vom Bot-Owner ausgeführt werden.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');

    try {
      if (subcommand === 'add') {
        // Add Premium Role
        const result = await assignPremiumRole(interaction.client, user.id);

        if (!result.success) {
          return interaction.reply({
            content: `❌ Fehler beim Hinzufügen der Premium-Rolle: ${result.error}`,
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ Premium-Rolle Hinzugefügt')
          .setDescription(
            `**User:** ${user.tag}\n` +
            `**User ID:** \`${user.id}\`\n` +
            `**Server:** Theredstonee Projects\n` +
            `**Rolle:** <@&${PREMIUM_ROLE_ID}>\n\n` +
            (result.alreadyHad ? '⚠️ User hatte bereits die Rolle' : '✅ Rolle erfolgreich vergeben')
          )
          .setColor(0x00ff88)
          .setTimestamp()
          .setFooter({ text: 'TRS Tickets Bot • Premium Role' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });

        console.log(`✅ Premium-Rolle hinzugefügt für ${user.tag} (${user.id}) von ${interaction.user.tag}`);

      } else if (subcommand === 'remove') {
        // Remove Premium Role
        try {
          const guild = await interaction.client.guilds.fetch(THEREDSTONEE_GUILD_ID);
          const member = await guild.members.fetch(user.id);

          // Check if member has role
          if (!member.roles.cache.has(PREMIUM_ROLE_ID)) {
            return interaction.reply({
              content: `⚠️ User **${user.tag}** hat die Premium-Rolle nicht.`,
              ephemeral: true
            });
          }

          // Remove Role
          await member.roles.remove(PREMIUM_ROLE_ID);

          const embed = new EmbedBuilder()
            .setTitle('🚫 Premium-Rolle Entfernt')
            .setDescription(
              `**User:** ${user.tag}\n` +
              `**User ID:** \`${user.id}\`\n` +
              `**Server:** Theredstonee Projects\n` +
              `**Rolle:** <@&${PREMIUM_ROLE_ID}>\n\n` +
              '✅ Rolle erfolgreich entfernt'
            )
            .setColor(0xff4444)
            .setTimestamp()
            .setFooter({ text: 'TRS Tickets Bot • Premium Role' });

          await interaction.reply({
            embeds: [embed],
            ephemeral: false
          });

          console.log(`🚫 Premium-Rolle entfernt für ${user.tag} (${user.id}) von ${interaction.user.tag}`);

        } catch (err) {
          console.error('Premium Role Remove Error:', err);
          return interaction.reply({
            content: `❌ Fehler beim Entfernen der Premium-Rolle: ${err.message}`,
            ephemeral: true
          });
        }
      }
    } catch (err) {
      console.error('Premium Role Command Error:', err);
      await interaction.reply({
        content: '❌ Ein Fehler ist aufgetreten. Siehe Console für Details.',
        ephemeral: true
      });
    }
  }
};
