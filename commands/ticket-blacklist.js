const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { t, getGuildLanguage } = require('../translations');

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

function readCfg(guildId) {
  try {
    const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

function saveCfg(guildId, cfg) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-blacklist')
    .setDescription('Manage ticket blacklist - block users from creating tickets')
    .setDescriptionLocalizations({
      de: 'Verwalte die Ticket-Blacklist - Blockiere User von der Ticket-Erstellung',
      ru: 'Управление черным списком - блокировка пользователей от создания тикетов',
      pt: 'Gerenciar lista negra - bloquear usuários de criar tickets',
      'es-ES': 'Administrar lista negra - bloquear usuarios de crear tickets',
      ja: 'チケットブラックリスト管理 - ユーザーのチケット作成をブロック',
      id: 'Kelola daftar hitam - blokir pengguna dari membuat tiket'
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a user to the ticket blacklist')
        .setDescriptionLocalizations({
          de: 'Füge einen User zur Ticket-Blacklist hinzu',
          ru: 'Добавить пользователя в черный список',
          pt: 'Adicionar um usuário à lista negra',
          'es-ES': 'Añadir un usuario a la lista negra',
          ja: 'ユーザーをブラックリストに追加',
          id: 'Tambahkan pengguna ke daftar hitam'
        })
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to blacklist')
            .setDescriptionLocalizations({
              de: 'User zum Blockieren',
              ru: 'Пользователь для блокировки',
              pt: 'Usuário para bloquear',
              'es-ES': 'Usuario para bloquear',
              ja: 'ブロックするユーザー',
              id: 'Pengguna untuk diblokir'
            })
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for blacklisting')
            .setDescriptionLocalizations({
              de: 'Grund für die Blockierung',
              ru: 'Причина блокировки',
              pt: 'Motivo para bloquear',
              'es-ES': 'Razón para bloquear',
              ja: 'ブロックの理由',
              id: 'Alasan untuk memblokir'
            })
            .setRequired(true))
        .addBooleanOption(option =>
          option
            .setName('permanent')
            .setDescription('Permanent blacklist (default: true)')
            .setDescriptionLocalizations({
              de: 'Permanente Blockierung (Standard: ja)',
              ru: 'Постоянная блокировка (по умолчанию: да)',
              pt: 'Bloqueio permanente (padrão: sim)',
              'es-ES': 'Bloqueo permanente (predeterminado: sí)',
              ja: '永久ブロック（デフォルト：はい）',
              id: 'Blokir permanen (default: ya)'
            })
            .setRequired(false))
        .addIntegerOption(option =>
          option
            .setName('days')
            .setDescription('Days to blacklist (if not permanent)')
            .setDescriptionLocalizations({
              de: 'Tage für die Blockierung (wenn nicht permanent)',
              ru: 'Дни блокировки (если не постоянно)',
              pt: 'Dias para bloquear (se não permanente)',
              'es-ES': 'Días para bloquear (si no permanente)',
              ja: 'ブロック日数（永久でない場合）',
              id: 'Hari untuk memblokir (jika tidak permanen)'
            })
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a user from the ticket blacklist')
        .setDescriptionLocalizations({
          de: 'Entferne einen User von der Ticket-Blacklist',
          ru: 'Удалить пользователя из черного списка',
          pt: 'Remover um usuário da lista negra',
          'es-ES': 'Eliminar un usuario de la lista negra',
          ja: 'ユーザーをブラックリストから削除',
          id: 'Hapus pengguna dari daftar hitam'
        })
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to unblacklist')
            .setDescriptionLocalizations({
              de: 'User zum Entblocken',
              ru: 'Пользователь для разблокировки',
              pt: 'Usuário para desbloquear',
              'es-ES': 'Usuario para desbloquear',
              ja: 'ブロック解除するユーザー',
              id: 'Pengguna untuk dibuka blokirnya'
            })
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all blacklisted users')
        .setDescriptionLocalizations({
          de: 'Liste alle blockierten User auf',
          ru: 'Список всех заблокированных пользователей',
          pt: 'Listar todos os usuários bloqueados',
          'es-ES': 'Listar todos los usuarios bloqueados',
          ja: 'ブロックされたユーザー一覧',
          id: 'Daftar semua pengguna yang diblokir'
        }))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check if a user is blacklisted')
        .setDescriptionLocalizations({
          de: 'Prüfe ob ein User blockiert ist',
          ru: 'Проверить, заблокирован ли пользователь',
          pt: 'Verificar se um usuário está bloqueado',
          'es-ES': 'Verificar si un usuario está bloqueado',
          ja: 'ユーザーがブロックされているか確認',
          id: 'Periksa apakah pengguna diblokir'
        })
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to check')
            .setDescriptionLocalizations({
              de: 'User zum Überprüfen',
              ru: 'Пользователь для проверки',
              pt: 'Usuário para verificar',
              'es-ES': 'Usuario para verificar',
              ja: '確認するユーザー',
              id: 'Pengguna untuk diperiksa'
            })
            .setRequired(true))),

  async execute(interaction) {
    const { guild } = interaction;
    const guildId = guild.id;
    const subcommand = interaction.options.getSubcommand();
    const lang = getGuildLanguage(guildId);

    const cfg = readCfg(guildId);

    if (!cfg.ticketBlacklist) {
      cfg.ticketBlacklist = [];
    }

    try {
      switch (subcommand) {
        case 'add': {
          const user = interaction.options.getUser('user');
          const reason = interaction.options.getString('reason');
          const isPermanent = interaction.options.getBoolean('permanent') !== false;
          const days = interaction.options.getInteger('days') || null;

          if (cfg.ticketBlacklist.find(b => b.userId === user.id)) {
            return interaction.reply({
              content: t(guildId, 'ticketBlacklist.already_blacklisted', { user: user.tag }),
              ephemeral: true
            });
          }

          const blacklistEntry = {
            userId: user.id,
            username: user.tag,
            reason: reason,
            isPermanent: isPermanent,
            blacklistedAt: new Date().toISOString(),
            blacklistedBy: interaction.user.id,
            expiresAt: isPermanent ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
          };

          cfg.ticketBlacklist.push(blacklistEntry);
          saveCfg(guildId, cfg);

          const embed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.user_blacklisted'))
            .setDescription(t(guildId, 'ticketBlacklist.blacklist_success', { user: user.tag }))
            .addFields(
              { name: t(guildId, 'ticketBlacklist.user'), value: `${user} (${user.id})`, inline: true },
              { name: t(guildId, 'ticketBlacklist.reason'), value: reason, inline: true },
              {
                name: t(guildId, 'ticketBlacklist.duration'),
                value: isPermanent
                  ? t(guildId, 'ticketBlacklist.permanent')
                  : t(guildId, 'ticketBlacklist.temporary_days', { days: days }),
                inline: true
              },
              { name: t(guildId, 'ticketBlacklist.blacklisted_by'), value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });

          try {
            const dmEmbed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.dm_title'))
              .setDescription(t(guildId, 'ticketBlacklist.dm_description', { guild: guild.name }))
              .addFields(
                { name: t(guildId, 'ticketBlacklist.reason'), value: reason, inline: false },
                {
                  name: t(guildId, 'ticketBlacklist.duration'),
                  value: isPermanent
                    ? t(guildId, 'ticketBlacklist.permanent')
                    : t(guildId, 'ticketBlacklist.temporary_days', { days: days }),
                  inline: false
                }
              )
              .setTimestamp();

            await user.send({ embeds: [dmEmbed] }).catch(() => {
              console.log(`Could not send DM to ${user.tag} about blacklist`);
            });
          } catch (err) {
            console.error('Error sending blacklist DM:', err);
          }

          break;
        }

        case 'remove': {
          const user = interaction.options.getUser('user');

          const index = cfg.ticketBlacklist.findIndex(b => b.userId === user.id);
          if (index === -1) {
            return interaction.reply({
              content: t(guildId, 'ticketBlacklist.not_blacklisted', { user: user.tag }),
              ephemeral: true
            });
          }

          cfg.ticketBlacklist.splice(index, 1);
          saveCfg(guildId, cfg);

          const embed = new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle('✅ ' + t(guildId, 'ticketBlacklist.user_removed'))
            .setDescription(t(guildId, 'ticketBlacklist.removal_success', { user: user.tag }))
            .addFields(
              { name: t(guildId, 'ticketBlacklist.user'), value: `${user} (${user.id})`, inline: true },
              { name: t(guildId, 'ticketBlacklist.removed_by'), value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });

          try {
            const dmEmbed = new EmbedBuilder()
              .setColor(0x00ff88)
              .setTitle('✅ ' + t(guildId, 'ticketBlacklist.dm_unblock_title'))
              .setDescription(t(guildId, 'ticketBlacklist.dm_unblock_description', { guild: guild.name }))
              .setTimestamp();

            await user.send({ embeds: [dmEmbed] }).catch(() => {
              console.log(`Could not send DM to ${user.tag} about unblacklist`);
            });
          } catch (err) {
            console.error('Error sending unblacklist DM:', err);
          }

          break;
        }

        case 'list': {
          if (cfg.ticketBlacklist.length === 0) {
            return interaction.reply({
              content: t(guildId, 'ticketBlacklist.empty_list'),
              ephemeral: true
            });
          }

          const now = new Date();
          const activeBlacklists = cfg.ticketBlacklist.filter(b => {
            if (b.isPermanent) return true;
            return new Date(b.expiresAt) > now;
          });

          const expiredBlacklists = cfg.ticketBlacklist.filter(b => {
            if (b.isPermanent) return false;
            return new Date(b.expiresAt) <= now;
          });

          if (expiredBlacklists.length > 0) {
            cfg.ticketBlacklist = activeBlacklists;
            saveCfg(guildId, cfg);
          }

          if (activeBlacklists.length === 0) {
            return interaction.reply({
              content: t(guildId, 'ticketBlacklist.empty_list'),
              ephemeral: true
            });
          }

          const embed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.list_title'))
            .setDescription(t(guildId, 'ticketBlacklist.list_description', { count: activeBlacklists.length }))
            .setTimestamp();

          const fields = activeBlacklists.slice(0, 25).map((bl, index) => {
            const expiryText = bl.isPermanent
              ? t(guildId, 'ticketBlacklist.permanent')
              : `<t:${Math.floor(new Date(bl.expiresAt).getTime() / 1000)}:R>`;

            return {
              name: `${index + 1}. ${bl.username}`,
              value: `**ID:** ${bl.userId}\n**${t(guildId, 'ticketBlacklist.reason')}:** ${bl.reason}\n**${t(guildId, 'ticketBlacklist.expires')}:** ${expiryText}`,
              inline: false
            };
          });

          embed.addFields(fields);

          if (activeBlacklists.length > 25) {
            embed.setFooter({ text: t(guildId, 'ticketBlacklist.showing_first', { count: 25, total: activeBlacklists.length }) });
          }

          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }

        case 'check': {
          const user = interaction.options.getUser('user');

          const blacklist = cfg.ticketBlacklist.find(b => b.userId === user.id);

          if (!blacklist) {
            return interaction.reply({
              content: t(guildId, 'ticketBlacklist.not_blacklisted', { user: user.tag }),
              ephemeral: true
            });
          }

          if (!blacklist.isPermanent && new Date(blacklist.expiresAt) <= new Date()) {
            cfg.ticketBlacklist = cfg.ticketBlacklist.filter(b => b.userId !== user.id);
            saveCfg(guildId, cfg);

            return interaction.reply({
              content: t(guildId, 'ticketBlacklist.expired_removed', { user: user.tag }),
              ephemeral: true
            });
          }

          const embed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle('🚫 ' + t(guildId, 'ticketBlacklist.check_title'))
            .setDescription(t(guildId, 'ticketBlacklist.check_description', { user: user.tag }))
            .addFields(
              { name: t(guildId, 'ticketBlacklist.user'), value: `${user} (${user.id})`, inline: true },
              { name: t(guildId, 'ticketBlacklist.reason'), value: blacklist.reason, inline: true },
              {
                name: t(guildId, 'ticketBlacklist.duration'),
                value: blacklist.isPermanent
                  ? t(guildId, 'ticketBlacklist.permanent')
                  : `<t:${Math.floor(new Date(blacklist.expiresAt).getTime() / 1000)}:R>`,
                inline: true
              },
              { name: t(guildId, 'ticketBlacklist.blacklisted_by'), value: `<@${blacklist.blacklistedBy}>`, inline: true },
              { name: t(guildId, 'ticketBlacklist.blacklisted_at'), value: `<t:${Math.floor(new Date(blacklist.blacklistedAt).getTime() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }
      }
    } catch (err) {
      console.error('Error in ticket-blacklist command:', err);
      await interaction.reply({
        content: t(guildId, 'errors.generic'),
        ephemeral: true
      }).catch(() => {});
    }
  }
};
