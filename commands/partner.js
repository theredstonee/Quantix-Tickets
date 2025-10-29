const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const premium = require('../premium');
const { activatePartner, deactivatePartner, listPartnerServers } = premium;

const FOUNDER_IDS = ['1048900200497954868', '1159182333316968530'];
const PARTNER_ROLE_ID = '1432763693535465554';
const PARTNER_SERVER_ID = '1403053662825222388';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('partner')
    .setDescription('Manage Partner Status (Founder Only)')
    .setDescriptionLocalizations({
      de: 'Partner-Status verwalten (Nur Founder)',
      'en-US': 'Manage Partner Status (Founder Only)',
      ja: 'Partnerステータスを管理 (Founder専用)',
      ru: 'Управление статусом Partner (только Founder)',
      'pt-BR': 'Gerenciar Status de Partner (Apenas Founder)',
      'es-ES': 'Administrar Estado de Partner (Solo Founder)',
      id: 'Kelola Status Partner (Hanya Founder)'
    })
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add Partner status to a server')
        .setDescriptionLocalizations({
          de: 'Partner-Status zu einem Server hinzufügen',
          'en-US': 'Add Partner status to a server',
          ja: 'サーバーにPartnerステータスを追加',
          ru: 'Добавить статус Partner на сервер',
          'pt-BR': 'Adicionar status de Partner a um servidor',
          'es-ES': 'Agregar estado de Partner a un servidor',
          id: 'Tambahkan status Partner ke server'
        })
        .addStringOption(option =>
          option
            .setName('server')
            .setDescription('Server (Guild ID or name)')
            .setDescriptionLocalizations({
              de: 'Server (Guild ID oder Name)',
              'en-US': 'Server (Guild ID or name)',
              ja: 'サーバー（ギルドIDまたは名前）',
              ru: 'Сервер (ID или имя)',
              'pt-BR': 'Servidor (ID da guilda ou nome)',
              'es-ES': 'Servidor (ID del servidor o nombre)',
              id: 'Server (ID Guild atau nama)'
            })
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Partner user who will receive the role')
            .setDescriptionLocalizations({
              de: 'Partner-User der die Rolle erhält',
              'en-US': 'Partner user who will receive the role',
              ja: 'ロールを受け取るPartnerユーザー',
              ru: 'Партнёр-пользователь, который получит роль',
              'pt-BR': 'Usuário parceiro que receberá o cargo',
              'es-ES': 'Usuario partner que recibirá el rol',
              id: 'Pengguna partner yang akan menerima peran'
            })
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('link')
            .setDescription('Partner server invite link (optional)')
            .setDescriptionLocalizations({
              de: 'Partner-Server Einladungslink (optional)',
              'en-US': 'Partner server invite link (optional)',
              ja: 'Partnerサーバーの招待リンク（オプション）',
              ru: 'Пригласительная ссылка на сервер партнёра (опционально)',
              'pt-BR': 'Link de convite do servidor parceiro (opcional)',
              'es-ES': 'Enlace de invitación del servidor partner (opcional)',
              id: 'Link undangan server partner (opsional)'
            })
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove Partner status from a server')
        .setDescriptionLocalizations({
          de: 'Partner-Status von einem Server entfernen',
          'en-US': 'Remove Partner status from a server',
          ja: 'サーバーからPartnerステータスを削除',
          ru: 'Удалить статус Partner с сервера',
          'pt-BR': 'Remover status de Partner de um servidor',
          'es-ES': 'Eliminar estado de Partner de un servidor',
          id: 'Hapus status Partner dari server'
        })
        .addStringOption(option =>
          option
            .setName('server')
            .setDescription('Server (Guild ID or name)')
            .setDescriptionLocalizations({
              de: 'Server (Guild ID oder Name)',
              'en-US': 'Server (Guild ID or name)',
              ja: 'サーバー（ギルドIDまたは名前）',
              ru: 'Сервер (ID или имя)',
              'pt-BR': 'Servidor (ID da guilda ou nome)',
              'es-ES': 'Servidor (ID del servidor o nombre)',
              id: 'Server (ID Guild atau nama)'
            })
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all servers with Partner status')
        .setDescriptionLocalizations({
          de: 'Alle Server mit Partner-Status auflisten',
          'en-US': 'List all servers with Partner status',
          ja: 'Partnerステータスを持つすべてのサーバーをリスト表示',
          ru: 'Список всех серверов со статусом Partner',
          'pt-BR': 'Listar todos os servidores com status de Partner',
          'es-ES': 'Listar todos los servidores con estado de Partner',
          id: 'Daftar semua server dengan status Partner'
        })
    ),

  async autocomplete(interaction) {
    if (!FOUNDER_IDS.includes(interaction.user.id)) {
      return interaction.respond([]);
    }

    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const guilds = await interaction.client.guilds.fetch();

      const choices = guilds.map(guild => ({
        name: `${guild.name} (${guild.id})`,
        value: guild.id
      }));

      const filtered = choices.filter(choice =>
        choice.name.toLowerCase().includes(focusedValue) ||
        choice.value.includes(focusedValue)
      );

      await interaction.respond(filtered.slice(0, 25));
    } catch (err) {
      console.error('Autocomplete Error:', err);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (!FOUNDER_IDS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Dieser Command kann nur von Foundern ausgeführt werden.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        const guildId = interaction.options.getString('server');
        const partnerUser = interaction.options.getUser('user');
        const link = interaction.options.getString('link') || null;

        let guildName = guildId;
        try {
          const guild = await interaction.client.guilds.fetch(guildId);
          guildName = guild.name;
        } catch (err) {
          return interaction.reply({
            content: `❌ Server mit ID \`${guildId}\` nicht gefunden. Bot ist nicht auf diesem Server.`,
            ephemeral: true
          });
        }

        const result = activatePartner(guildId, partnerUser.id, link);

        if (!result.success) {
          return interaction.reply({
            content: `❌ Fehler beim Aktivieren von Partner für **${guildName}**.`,
            ephemeral: true
          });
        }

        // Assign Partner Role
        let roleStatus = '';
        try {
          const partnerServerGuild = await interaction.client.guilds.fetch(PARTNER_SERVER_ID);
          const member = await partnerServerGuild.members.fetch(partnerUser.id);

          if (member.roles.cache.has(PARTNER_ROLE_ID)) {
            roleStatus = '\n✅ User hatte bereits die Partner-Rolle';
          } else {
            await member.roles.add(PARTNER_ROLE_ID);
            roleStatus = '\n✅ Partner-Rolle auf Theredstonee Projects vergeben';
          }
        } catch (err) {
          roleStatus = `\n⚠️ Rolle konnte nicht vergeben werden: ${err.message}`;
        }

        const embed = new EmbedBuilder()
          .setTitle('🤝 Partner Aktiviert')
          .setDescription(
            `**Server:** ${guildName}\n` +
            `**Guild ID:** \`${guildId}\`\n` +
            `**Partner:** ${partnerUser.tag}\n` +
            `**User ID:** \`${partnerUser.id}\`\n` +
            (link ? `**Link:** ${link}\n` : '') +
            `**Features:** 👑 Pro-Level (unbegrenzte Kategorien, Analytics, Auto-Close, etc.)\n` +
            `**Status:** ♾️ Lifetime Partner` +
            roleStatus
          )
          .setColor(0x00ff88)
          .setTimestamp()
          .setFooter({ text: 'Quantix Tickets Bot • Partner' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });

        console.log(`🤝 Partner für Guild ${guildId} (${guildName}) aktiviert von ${interaction.user.tag}`);

      } else if (subcommand === 'remove') {
        const guildId = interaction.options.getString('server');

        let guildName = guildId;
        try {
          const guild = await interaction.client.guilds.fetch(guildId);
          guildName = guild.name;
        } catch (err) {
          guildName = `Unknown (${guildId})`;
        }

        const result = deactivatePartner(guildId);

        if (!result.success) {
          return interaction.reply({
            content: `❌ ${result.message || 'Fehler beim Entfernen von Partner-Status'}`,
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('🚫 Partner Entfernt')
          .setDescription(
            `**Server:** ${guildName}\n` +
            `**Guild ID:** \`${guildId}\`\n` +
            `**Status:** Partner-Status wurde entfernt`
          )
          .setColor(0xff4444)
          .setTimestamp()
          .setFooter({ text: 'Quantix Tickets Bot • Partner' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });

        console.log(`🚫 Partner für Guild ${guildId} (${guildName}) entfernt von ${interaction.user.tag}`);

      } else if (subcommand === 'list') {
        const partnerServers = listPartnerServers();

        if (partnerServers.length === 0) {
          return interaction.reply({
            content: '📋 Keine Partner-Server gefunden.',
            ephemeral: true
          });
        }

        const serverList = [];
        for (const server of partnerServers) {
          try {
            const guild = await interaction.client.guilds.fetch(server.guildId);

            serverList.push(
              `**${guild.name}**\n` +
              `├ ID: \`${server.guildId}\`\n` +
              `├ Partner User: <@${server.partnerUserId}>\n` +
              (server.partnerLink ? `├ Link: ${server.partnerLink}\n` : '') +
              `└ Status: ✅ Aktiv (Lifetime)`
            );
          } catch (err) {
            serverList.push(
              `**Unknown Server**\n` +
              `├ ID: \`${server.guildId}\`\n` +
              `├ Partner User: <@${server.partnerUserId}>\n` +
              (server.partnerLink ? `├ Link: ${server.partnerLink}\n` : '') +
              `└ Status: ✅ Aktiv (Lifetime)`
            );
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('🤝 Partner Server')
          .setDescription(
            `**Gesamt:** ${partnerServers.length} Server\n\n` +
            serverList.join('\n\n')
          )
          .setColor(0x00ff88)
          .setTimestamp()
          .setFooter({ text: 'Quantix Tickets Bot • Partner' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }
    } catch (err) {
      console.error('Partner Command Error:', err);
      await interaction.reply({
        content: '❌ Ein Fehler ist aufgetreten. Siehe Console für Details.',
        ephemeral: true
      });
    }
  }
};
