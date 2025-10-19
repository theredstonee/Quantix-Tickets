const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'configs');

function readCfg(guildId) {
  try {
    const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

async function handleTemplateUse(interaction) {
  const { guild, channel, user } = interaction;
  const guildId = guild.id;
  const templateIdOrIndex = interaction.values[0];

  const cfg = readCfg(guildId);
  const templates = cfg.templates || [];

  // Find template by ID or index
  let template = templates.find(t => t.id === templateIdOrIndex);
  if (!template) {
    const index = parseInt(templateIdOrIndex.replace('template_', ''));
    template = templates[index];
  }

  if (!template) {
    return interaction.update({
      content: '❌ Template not found!',
      components: []
    });
  }

  try {
    // Send template message in ticket channel
    const embed = new EmbedBuilder()
      .setColor(parseInt(template.color?.replace('#', ''), 16) || 0x0ea5e9)
      .setTitle(`📝 ${template.name}`)
      .setDescription(template.content)
      .setFooter({
        text: `Template sent by ${user.tag}`,
        iconURL: user.displayAvatarURL({ size: 32 })
      })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Confirm to user
    await interaction.update({
      content: `✅ Template **${template.name}** was sent successfully!`,
      components: []
    });

  } catch (err) {
    console.error('Error sending template:', err);
    return interaction.update({
      content: '❌ Failed to send template. Please try again.',
      components: []
    });
  }
}

module.exports = {
  handleTemplateUse
};
