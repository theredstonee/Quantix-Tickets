const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t } = require('../translations');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

function readCfg(guildId) {
  try {
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return data || {};
  } catch {
    return {};
  }
}

function writeCfg(guildId, data) {
  try {
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('writeCfg error:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('github-commits')
    .setDescription('Toggle GitHub commit logging for this server')
    .setDescriptionLocalizations({
      de: 'GitHub Commit-Logs für diesen Server ein-/ausschalten'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.reply({
        content: t(guildId, 'errors.guild_only') || '❌ This command can only be used in a server.',
        ephemeral: true
      });
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: t(guildId, 'language.only_admin') || '❌ Only administrators can use this command.',
        ephemeral: true
      });
    }

    const cfg = readCfg(guildId);

    const currentStatus = cfg.githubCommitsEnabled !== false;

    const embed = new EmbedBuilder()
      .setTitle('⚙️ GitHub Commit Logs')
      .setDescription(
        `**Current Status:** ${currentStatus ? '✅ Enabled' : '❌ Disabled'}\n\n` +
        `GitHub commit notifications will ${currentStatus ? '' : 'not '}be logged to this server.\n\n` +
        `${cfg.githubWebhookChannelId ? `**Log Channel:** <#${cfg.githubWebhookChannelId}>` : '⚠️ **No log channel set!** Please configure a channel in the panel.'}`
      )
      .setColor(currentStatus ? 0x00ff88 : 0xff4444)
      .setFooter({ text: 'TRS Tickets © 2025 Theredstonee • Alle Rechte vorbehalten' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`github_toggle:${guildId}`)
        .setLabel(currentStatus ? 'Disable Logging' : 'Enable Logging')
        .setEmoji(currentStatus ? '❌' : '✅')
        .setStyle(currentStatus ? ButtonStyle.Danger : ButtonStyle.Success)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: false
    });
  }
};
