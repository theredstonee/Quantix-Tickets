const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getGuildLanguage } = require('../translations');
const { COPYRIGHT } = require('../version.config');

const ALLOWED_GUILD = '1291125037876904026';
const ALLOWED_USERS = ['1159182333316968530', '1415387837359984740'];
const CONFIG_DIR = path.join(__dirname, '..', 'configs');
const CHANGELOG_PATH = path.join(__dirname, '..', 'changelog.json');

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
    if (interaction.guild.id !== ALLOWED_GUILD) {
      return interaction.reply({
        content: '❌ This command can only be used in the authorized server.',
        ephemeral: true
      });
    }

    if (!ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ You are not authorized to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const customMessage = interaction.options.getString('message');

    let guildConfigs = [];
    try {
      const files = fs.readdirSync(CONFIG_DIR);
      // Filter out _counter.json and _tickets.json files - only load actual guild configs
      guildConfigs = files
        .filter(f => f.endsWith('.json') && !f.includes('_counter') && !f.includes('_tickets'))
        .map(f => {
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
        const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          failCount++;
          results.push(`❌ ${guildId}: Guild not found`);
          continue;
        }

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

        const guildLang = getGuildLanguage(guildId) || 'de';

        const currentVersionData = changelog.versions.find(v => v.version === VERSION);
        const changes = currentVersionData?.changes?.[guildLang] || currentVersionData?.changes?.de || [];

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
          },
          ja: {
            title: '📢 バージョンアップデート',
            description: `**TRS Tickets Bot** がバージョン **${VERSION}** にアップデートされました`,
            versionLabel: '🆕 バージョン',
            dateLabel: '📅 日付',
            changesLabel: '✨ 変更点'
          },
          ru: {
            title: '📢 Обновление версии',
            description: `**TRS Tickets Bot** обновлен до версии **${VERSION}**`,
            versionLabel: '🆕 Версия',
            dateLabel: '📅 Дата',
            changesLabel: '✨ Изменения'
          },
          pt: {
            title: '📢 Atualização de Versão',
            description: `**TRS Tickets Bot** foi atualizado para a versão **${VERSION}**`,
            versionLabel: '🆕 Versão',
            dateLabel: '📅 Data',
            changesLabel: '✨ Mudanças'
          }
        };

        const t = texts[guildLang] || texts.de;

        const embed = new EmbedBuilder()
          .setColor('#00b894')
          .setTitle(t.title)
          .setDescription(customMessage || t.description)
          .addFields([
            { name: t.versionLabel, value: VERSION, inline: true },
            { name: t.dateLabel, value: new Date().toLocaleDateString(
              guildLang === 'de' ? 'de-DE' :
              guildLang === 'he' ? 'he-IL' :
              guildLang === 'ja' ? 'ja-JP' :
              guildLang === 'ru' ? 'ru-RU' :
              guildLang === 'pt' ? 'pt-PT' :
              'en-US'
            ), inline: true }
          ])
          .setFooter({ text: COPYRIGHT })
          .setTimestamp();

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

    if (results.length > 0) {
      const resultText = results.slice(0, 10).join('\n');
      summaryEmbed.addFields([
        { name: '📋 Results', value: resultText + (results.length > 10 ? `\n... and ${results.length - 10} more` : '') }
      ]);
    }

    await interaction.editReply({ embeds: [summaryEmbed] });
  },
};
