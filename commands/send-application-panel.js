const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

function readCfg(guildId) {
  const configDir = path.join(__dirname, '..', 'configs');
  const cfgPath = path.join(configDir, `${guildId}.json`);
  if (!fs.existsSync(cfgPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeCfg(guildId, data) {
  const configDir = path.join(__dirname, '..', 'configs');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const cfgPath = path.join(configDir, `${guildId}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send-application-panel')
    .setDescription('Bewerbungs-Panel in einen Channel senden')
    .setDescriptionLocalizations({
      'en-US': 'Send application panel to a channel'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel für das Bewerbungs-Panel')
        .setDescriptionLocalizations({
          'en-US': 'Channel for the application panel'
        })
        .setRequired(false)
    ),
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const cfg = readCfg(guildId);

    if (!cfg || !cfg.applicationSystem) {
      return interaction.reply({
        content: '❌ Das Bewerbungssystem ist nicht konfiguriert. Bitte konfiguriere es zuerst im Web-Dashboard (`/dashboard`).',
        ephemeral: true
      });
    }

    if (!cfg.applicationSystem.enabled) {
      return interaction.reply({
        content: '❌ Das Bewerbungssystem ist deaktiviert. Aktiviere es im Web-Dashboard (`/dashboard`).',
        ephemeral: true
      });
    }

    // Get target channel
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        content: '❌ Dieser Channel-Typ wird nicht unterstützt.',
        ephemeral: true
      });
    }

    // Check bot permissions
    const botMember = interaction.guild.members.me;
    const permissions = targetChannel.permissionsFor(botMember);
    if (!permissions.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
      return interaction.reply({
        content: '❌ Ich habe keine Berechtigung, in diesem Channel zu schreiben.',
        ephemeral: true
      });
    }

    try {
      await interaction.deferReply({ ephemeral: true });

      // Build embed
      const panelColor = cfg.applicationSystem.panelColor || '#3b82f6';
      const colorInt = parseInt(panelColor.replace('#', ''), 16);

      const embed = new EmbedBuilder()
        .setColor(colorInt)
        .setTitle(cfg.applicationSystem.panelTitle || '📝 Bewerbungen')
        .setDescription(cfg.applicationSystem.panelDescription || 'Klicke auf den Button, um dich zu bewerben!')
        .setThumbnail(interaction.guild.iconURL({ size: 128 }))
        .setFooter({
          text: `${interaction.guild.name} • Bewerbungssystem`,
          iconURL: interaction.client.user.displayAvatarURL({ size: 64 })
        })
        .setTimestamp();

      // Build button
      const button = new ButtonBuilder()
        .setCustomId(`application_start_${guildId}`)
        .setLabel(cfg.applicationSystem.buttonText || '📝 Jetzt bewerben')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');

      const row = new ActionRowBuilder().addComponents(button);

      // Send panel
      const panelMessage = await targetChannel.send({
        embeds: [embed],
        components: [row]
      });

      // Save panel message ID
      cfg.applicationSystem.panelMessageId = panelMessage.id;
      cfg.applicationSystem.panelChannelId = targetChannel.id;
      writeCfg(guildId, cfg);

      await interaction.editReply({
        content: `✅ Bewerbungs-Panel erfolgreich in <#${targetChannel.id}> gesendet!`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error sending application panel:', error);
      await interaction.editReply({
        content: '❌ Fehler beim Senden des Bewerbungs-Panels.',
        ephemeral: true
      });
    }
  }
};
