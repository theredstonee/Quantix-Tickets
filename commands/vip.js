const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');
const VIP_SERVER_ID = '1403053662825222388';

function readCfg(guildId) {
  try {
    const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeCfg(guildId, cfg) {
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vip')
    .setDescription('Manage VIP users (Only available on specific server)')
    .setDescriptionLocalizations({ de: 'VIP-User verwalten (Nur auf bestimmten Servern)' })
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand.setName('add')
        .setDescription('Add a user to VIP list')
        .setDescriptionLocalizations({ de: 'User zur VIP-Liste hinzufügen' })
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to add to VIP list')
            .setDescriptionLocalizations({ de: 'Der User, der zur VIP-Liste hinzugefügt werden soll' })
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('remove')
        .setDescription('Remove a user from VIP list')
        .setDescriptionLocalizations({ de: 'User von der VIP-Liste entfernen' })
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to remove from VIP list')
            .setDescriptionLocalizations({ de: 'Der User, der von der VIP-Liste entfernt werden soll' })
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('list')
        .setDescription('List all VIP users')
        .setDescriptionLocalizations({ de: 'Alle VIP-User anzeigen' })
    )
    .addSubcommand(subcommand =>
      subcommand.setName('role')
        .setDescription('Set the VIP role')
        .setDescriptionLocalizations({ de: 'VIP-Rolle festlegen' })
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to assign to VIP users')
            .setDescriptionLocalizations({ de: 'Die Rolle für VIP-User' })
            .setRequired(true))
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    const guildId = guild.id;

    // Check if this is the VIP server
    if (guildId !== VIP_SERVER_ID) {
      return interaction.reply({
        content: '❌ VIP System ist nur auf bestimmten Servern verfügbar.\n\n*This feature is only available on specific servers.*',
        ephemeral: true
      });
    }

    const cfg = readCfg(guildId);
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        const user = interaction.options.getUser('user');

        // Initialize VIP list if not exists
        if (!cfg.vipUsers) cfg.vipUsers = [];

        // Check if already VIP
        if (cfg.vipUsers.includes(user.id)) {
          return interaction.reply({
            content: `❌ **${user.tag}** ist bereits ein VIP-User!`,
            ephemeral: true
          });
        }

        // Add to VIP list
        cfg.vipUsers.push(user.id);
        writeCfg(guildId, cfg);

        // Assign VIP role if configured
        if (cfg.vipRoleId) {
          try {
            const targetMember = await guild.members.fetch(user.id);
            await targetMember.roles.add(cfg.vipRoleId);
          } catch (err) {
            console.error('Failed to assign VIP role:', err);
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0xffd700) // Gold color for VIP
          .setTitle('✨ VIP-User hinzugefügt')
          .setDescription(`**${user.tag}** wurde zur VIP-Liste hinzugefügt!`)
          .addFields(
            { name: '👤 User', value: `<@${user.id}>`, inline: true },
            { name: '🎫 Priorität', value: 'VIP (Höchste)', inline: true }
          )
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (subcommand === 'remove') {
        const user = interaction.options.getUser('user');

        if (!cfg.vipUsers || !cfg.vipUsers.includes(user.id)) {
          return interaction.reply({
            content: `❌ **${user.tag}** ist kein VIP-User!`,
            ephemeral: true
          });
        }

        // Remove from VIP list
        cfg.vipUsers = cfg.vipUsers.filter(id => id !== user.id);
        writeCfg(guildId, cfg);

        // Remove VIP role if configured
        if (cfg.vipRoleId) {
          try {
            const targetMember = await guild.members.fetch(user.id);
            await targetMember.roles.remove(cfg.vipRoleId);
          } catch (err) {
            console.error('Failed to remove VIP role:', err);
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle('VIP-User entfernt')
          .setDescription(`**${user.tag}** wurde von der VIP-Liste entfernt.`)
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (subcommand === 'list') {
        const vipUsers = cfg.vipUsers || [];

        if (vipUsers.length === 0) {
          return interaction.reply({
            content: 'ℹ️ Es sind keine VIP-User konfiguriert.',
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle('✨ VIP-User Liste')
          .setDescription(vipUsers.map(id => `<@${id}> (\`${id}\`)`).join('\n'))
          .setFooter({ text: `${vipUsers.length} VIP-User insgesamt` })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (subcommand === 'role') {
        const role = interaction.options.getRole('role');

        cfg.vipRoleId = role.id;
        writeCfg(guildId, cfg);

        // Assign role to all existing VIP users
        if (cfg.vipUsers && cfg.vipUsers.length > 0) {
          let assigned = 0;
          for (const userId of cfg.vipUsers) {
            try {
              const targetMember = await guild.members.fetch(userId);
              await targetMember.roles.add(role.id);
              assigned++;
            } catch (err) {
              console.error(`Failed to assign VIP role to ${userId}:`, err);
            }
          }

          const embed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('✅ VIP-Rolle konfiguriert')
            .setDescription(`Die VIP-Rolle wurde auf **${role.name}** gesetzt.`)
            .addFields(
              { name: '👥 Zugewiesen', value: `${assigned} von ${cfg.vipUsers.length} VIP-Usern`, inline: true }
            )
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('✅ VIP-Rolle konfiguriert')
          .setDescription(`Die VIP-Rolle wurde auf **${role.name}** gesetzt.`)
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

    } catch (err) {
      console.error('VIP command error:', err);
      return interaction.reply({
        content: '❌ Ein Fehler ist aufgetreten.',
        ephemeral: true
      });
    }
  }
};
