const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const ALLOWED_GUILD = '1291125037876904026'; // Only this guild can use this command
const ALLOWED_USER = '1159182333316968530'; // Only this user can use this command
const CONFIG_DIR = path.join(__dirname, '..', 'configs');
const VERSION = 'Beta 0.3.0';

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

        // Create version update embed
        const embed = new EmbedBuilder()
          .setColor('#00b894')
          .setTitle('📢 Version Update')
          .setDescription(customMessage || `**TRS Tickets Bot** has been updated to version **${VERSION}**`)
          .addFields([
            { name: '🆕 Version', value: VERSION, inline: true },
            { name: '📅 Date', value: new Date().toLocaleDateString('de-DE'), inline: true }
          ])
          .setFooter({ text: 'TRS Tickets ©️' })
          .setTimestamp();

        // Add default changelog if no custom message
        if (!customMessage) {
          embed.addFields([
            {
              name: '✨ Updates',
              value: '• Improved multi-language support\n• New home page design\n• Performance improvements\n• Bug fixes'
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
