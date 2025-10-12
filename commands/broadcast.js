const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuildLanguage } = require('../translations');

const ALLOWED_GUILD = '1291125037876904026'; // Only this guild can use this command
const ALLOWED_USER = '1159182333316968530'; // Only this user can use this command
const CONFIG_DIR = path.join(__dirname, '..', 'configs');
const CHANGELOG_PATH = path.join(__dirname, '..', 'changelog.json');

// Load changelog
function loadChangelog() {
  try {
    const data = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading changelog:', err);
    return { currentVersion: 'Beta 0.3.1', versions: [] };
  }
}

const changelog = loadChangelog();
const VERSION = changelog.currentVersion;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Send version update to all servers (Admin only)')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Update message to send')
        .setRequired(false)),

  async execute(interaction) {
    // Check if command is executed in the allowed guild
    if (interaction.guild.id !== ALLOWED_GUILD) {
      return interaction.reply({
        content: '❌ This command can only be used in the authorized server.',
        ephemeral: true
      });
    }

    // Check if user is the authorized user
    if (interaction.user.id !== ALLOWED_USER) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const customMessage = interaction.options.getString('message');

    // Get all guild configs
    let guildConfigs = [];
    try {
      const files = fs.readdirSync(CONFIG_DIR);
      guildConfigs = files.filter(f => f.endsWith('.json')).map(f => {
        const guildId = f.replace('.json', '');
        const configPath = path.join(CONFIG_DIR, f);
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return { guildId, config };
      });
    } catch (err) {
      console.error('Error reading configs:', err);
      return interaction.editReply('❌ Error reading server configurations.');
    }

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (const { guildId, config } of guildConfigs) {
      try {
        // Get guild
        const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          failCount++;
          results.push(`❌ ${guildId}: Guild not found`);
          continue;
        }

        // Get log channel
        const logChannelId = config.logChannelId;
        if (!logChannelId) {
          failCount++;
          results.push(`⚠️ ${guild.name}: No log channel configured`);
          continue;
        }

        const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) {
          failCount++;
          results.push(`❌ ${guild.name}: Log channel not found`);
          continue;
        }

        // Get guild language
        const guildLang = getGuildLanguage(guildId) || 'de';

        // Get current version changelog
        const currentVersionData = changelog.versions.find(v => v.version === VERSION);
        const changes = currentVersionData?.changes?.[guildLang] || currentVersionData?.changes?.de || [];

        // Create localized texts
        const texts = {
          de: {
            title: '📢 Versions-Update',
            description: `**TRS Tickets Bot** wurde auf Version **${VERSION}** aktualisiert`,
            versionLabel: '🆕 Version',
            dateLabel: '📅 Datum',
            changesLabel: '✨ Änderungen'
          },
          en: {
            title: '📢 Version Update',
            description: `**TRS Tickets Bot** has been updated to version **${VERSION}**`,
            versionLabel: '🆕 Version',
            dateLabel: '📅 Date',
            changesLabel: '✨ Changes'
          },
          he: {
            title: '📢 עדכון גרסה',
            description: `**בוט TRS Tickets** עודכן לגרסה **${VERSION}**`,
            versionLabel: '🆕 גרסה',
            dateLabel: '📅 תאריך',
            changesLabel: '✨ שינויים'
          }
        };

        const t = texts[guildLang] || texts.de;

        // Create version update embed
        const embed = new EmbedBuilder()
          .setColor('#00b894')
          .setTitle(t.title)
          .setDescription(customMessage || t.description)
          .addFields([
            { name: t.versionLabel, value: VERSION, inline: true },
            { name: t.dateLabel, value: new Date().toLocaleDateString(guildLang === 'de' ? 'de-DE' : guildLang === 'he' ? 'he-IL' : 'en-US'), inline: true }
          ])
          .setFooter({ text: 'TRS Tickets ©️' })
          .setTimestamp();

        // Add automatic changelog if no custom message
        if (!customMessage && changes.length > 0) {
          embed.addFields([
            {
              name: t.changesLabel,
              value: changes.join('\n')
            }
          ]);
        }

        await logChannel.send({ embeds: [embed] });
        successCount++;
        results.push(`✅ ${guild.name}`);
      } catch (err) {
        console.error(`Error sending to guild ${guildId}:`, err);
        failCount++;
        results.push(`❌ ${guildId}: ${err.message}`);
      }
    }

    // Create summary embed
    const summaryEmbed = new EmbedBuilder()
      .setColor(failCount === 0 ? '#00b894' : '#ffc107')
      .setTitle('📊 Broadcast Summary')
      .setDescription(`Version update sent to **${successCount}/${guildConfigs.length}** servers`)
      .addFields([
        { name: '✅ Success', value: successCount.toString(), inline: true },
        { name: '❌ Failed', value: failCount.toString(), inline: true },
        { name: '📝 Total Servers', value: guildConfigs.length.toString(), inline: true }
      ])
      .setTimestamp();

    // Add results (limit to first 10)
    if (results.length > 0) {
      const resultText = results.slice(0, 10).join('\n');
      summaryEmbed.addFields([
        { name: '📋 Results', value: resultText + (results.length > 10 ? `\n... and ${results.length - 10} more` : '') }
      ]);
    }

    await interaction.editReply({ embeds: [summaryEmbed] });
  },
};
