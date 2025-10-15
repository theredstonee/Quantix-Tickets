const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { activateBetatester, deactivateBetatester, listBetatesterServers, assignPremiumRole } = require('../premium');

const OWNER_ID = '1159182333316968530';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('betatester')
    .setDescription('Manage Betatester Status (Owner Only)')
    .setDescriptionLocalizations({
      de: 'Betatester-Status verwalten (Nur Owner)',
      'en-US': 'Manage Betatester Status (Owner Only)',
      he: 'נהל סטטוס Betatester (בעלים בלבד)',
      ja: 'Betatesterステータスを管理 (オーナー専用)',
      ru: 'Управление статусом Betatester (только владелец)',
      'pt-BR': 'Gerenciar Status de Betatester (Apenas Proprietário)',
      'es-ES': 'Administrar Estado de Betatester (Solo Propietario)',
      id: 'Kelola Status Betatester (Hanya Pemilik)',
      ar: 'إدارة حالة Betatester (المالك فقط)'
    })
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add Betatester status to a server')
        .setDescriptionLocalizations({
          de: 'Betatester-Status zu einem Server hinzufügen',
          'en-US': 'Add Betatester status to a server',
          he: 'הוסף סטטוס Betatester לשרת',
          ja: 'サーバーにBetatesterステータスを追加',
          ru: 'Добавить статус Betatester на сервер',
          'pt-BR': 'Adicionar status de Betatester a um servidor',
          'es-ES': 'Agregar estado de Betatester a un servidor',
          id: 'Tambahkan status Betatester ke server',
          ar: 'إضافة حالة Betatester إلى خادم'
        })
        .addStringOption(option =>
          option
            .setName('server')
            .setDescription('Server (Guild ID or name)')
            .setDescriptionLocalizations({
              de: 'Server (Guild ID oder Name)',
              'en-US': 'Server (Guild ID or name)',
              he: 'שרת (מזהה או שם)',
              ja: 'サーバー（ギルドIDまたは名前）',
              ru: 'Сервер (ID или имя)',
              'pt-BR': 'Servidor (ID da guilda ou nome)',
              'es-ES': 'Servidor (ID del servidor o nombre)',
              id: 'Server (ID Guild atau nama)',
              ar: 'الخادم (معرف الخادم أو الاسم)'
            })
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option
            .setName('duration')
            .setDescription('Duration in days (default: 30)')
            .setDescriptionLocalizations({
              de: 'Zeitraum in Tagen (Standard: 30)',
              'en-US': 'Duration in days (default: 30)',
              he: 'משך בימים (ברירת מחדל: 30)',
              ja: '期間（日数、デフォルト：30）',
              ru: 'Длительность в днях (по умолчанию: 30)',
              'pt-BR': 'Duração em dias (padrão: 30)',
              'es-ES': 'Duración en días (predeterminado: 30)',
              id: 'Durasi dalam hari (default: 30)',
              ar: 'المدة بالأيام (الافتراضي: 30)'
            })
            .setRequired(false)
            .addChoices(
              { name: '7 Days / 7 Tage', value: 7 },
              { name: '14 Days / 14 Tage', value: 14 },
              { name: '30 Days / 30 Tage (Default)', value: 30 },
              { name: '60 Days / 60 Tage', value: 60 },
              { name: '90 Days / 90 Tage', value: 90 },
              { name: '180 Days / 180 Tage (6 Months)', value: 180 },
              { name: '365 Days / 365 Tage (1 Year)', value: 365 }
            )
        )
        .addUserOption(option =>
          option
            .setName('tester')
            .setDescription('User who is the betatester (will receive role on Theredstonee Projects)')
            .setDescriptionLocalizations({
              de: 'User der Betatester ist (erhält Rolle auf Theredstonee Projects)',
              'en-US': 'User who is the betatester (will receive role on Theredstonee Projects)',
              he: 'משתמש שהוא ה-Betatester (יקבל תפקיד ב-Theredstonee Projects)',
              ja: 'Betatesterであるユーザー（Theredstonee Projectsでロールを受け取る）',
              ru: 'Пользователь-бета-тестер (получит роль на Theredstonee Projects)',
              'pt-BR': 'Usuário que é o betatester (receberá cargo no Theredstonee Projects)',
              'es-ES': 'Usuario que es el betatester (recibirá rol en Theredstonee Projects)',
              id: 'Pengguna yang merupakan betatester (akan menerima peran di Theredstonee Projects)',
              ar: 'المستخدم الذي هو المختبر (سيحصل على دور في Theredstonee Projects)'
            })
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove Betatester status from a server')
        .setDescriptionLocalizations({
          de: 'Betatester-Status von einem Server entfernen',
          'en-US': 'Remove Betatester status from a server',
          he: 'הסר סטטוס Betatester משרת',
          ja: 'サーバーからBetatesterステータスを削除',
          ru: 'Удалить статус Betatester с сервера',
          'pt-BR': 'Remover status de Betatester de um servidor',
          'es-ES': 'Eliminar estado de Betatester de un servidor',
          id: 'Hapus status Betatester dari server',
          ar: 'إزالة حالة Betatester من خادم'
        })
        .addStringOption(option =>
          option
            .setName('server')
            .setDescription('Server (Guild ID or name)')
            .setDescriptionLocalizations({
              de: 'Server (Guild ID oder Name)',
              'en-US': 'Server (Guild ID or name)',
              he: 'שרת (מזהה או שם)',
              ja: 'サーバー（ギルドIDまたは名前）',
              ru: 'Сервер (ID или имя)',
              'pt-BR': 'Servidor (ID da guilda ou nome)',
              'es-ES': 'Servidor (ID del servidor o nombre)',
              id: 'Server (ID Guild atau nama)',
              ar: 'الخادم (معرف الخادم أو الاسم)'
            })
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all servers with Betatester status')
        .setDescriptionLocalizations({
          de: 'Alle Server mit Betatester-Status auflisten',
          'en-US': 'List all servers with Betatester status',
          he: 'הצג את כל השרתים עם סטטוס Betatester',
          ja: 'Betatesterステータスを持つすべてのサーバーをリスト表示',
          ru: 'Список всех серверов со статусом Betatester',
          'pt-BR': 'Listar todos os servidores com status de Betatester',
          'es-ES': 'Listar todos los servidores con estado de Betatester',
          id: 'Daftar semua server dengan status Betatester',
          ar: 'قائمة بجميع الخوادم التي لديها حالة Betatester'
        })
    ),

  async autocomplete(interaction) {
    // Owner-only check
    if (interaction.user.id !== OWNER_ID) {
      return interaction.respond([]);
    }

    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const guilds = await interaction.client.guilds.fetch();

      const choices = guilds.map(guild => ({
        name: `${guild.name} (${guild.id})`,
        value: guild.id
      }));

      // Filter based on user input
      const filtered = choices.filter(choice =>
        choice.name.toLowerCase().includes(focusedValue) ||
        choice.value.includes(focusedValue)
      );

      // Limit to 25 results (Discord API limit)
      await interaction.respond(filtered.slice(0, 25));
    } catch (err) {
      console.error('Autocomplete Error:', err);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    // Owner-only check
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({
        content: '❌ Dieser Command kann nur vom Bot-Owner ausgeführt werden.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        const guildId = interaction.options.getString('server');
        const days = interaction.options.getInteger('duration') || 30; // Default: 30 Days
        const tester = interaction.options.getUser('tester');

        // Fetch guild info
        let guildName = guildId;
        let guildOwner = null;
        try {
          const guild = await interaction.client.guilds.fetch(guildId);
          guildName = guild.name;
          guildOwner = await guild.fetchOwner();
        } catch (err) {
          return interaction.reply({
            content: `❌ Server mit ID \`${guildId}\` nicht gefunden. Bot ist nicht auf diesem Server.`,
            ephemeral: true
          });
        }

        // Determine tester ID (falls nicht angegeben, Server-Owner)
        const testerId = tester ? tester.id : guildOwner.id;

        // Activate Betatester
        const result = activateBetatester(guildId, days, testerId);

        if (!result.success) {
          return interaction.reply({
            content: `❌ Fehler beim Aktivieren von Betatester für **${guildName}**.`,
            ephemeral: true
          });
        }

        // Assign Premium Role on Theredstonee Projects
        const roleResult = await assignPremiumRole(interaction.client, testerId);

        let roleStatus = '';
        if (roleResult.success) {
          if (roleResult.alreadyHad) {
            roleStatus = '\n✅ User hatte bereits die Premium-Rolle';
          } else {
            roleStatus = '\n✅ Premium-Rolle auf Theredstonee Projects vergeben';
          }
        } else {
          roleStatus = `\n⚠️ Rolle konnte nicht vergeben werden: ${roleResult.error}`;
        }

        const expiresDate = new Date(result.expiresAt);
        const embed = new EmbedBuilder()
          .setTitle('🧪 Betatester Aktiviert')
          .setDescription(
            `**Server:** ${guildName}\n` +
            `**Guild ID:** \`${guildId}\`\n` +
            `**Betatester:** ${tester ? tester.tag : guildOwner.user.tag}\n` +
            `**Zeitraum:** ${days} Tage\n` +
            `**Läuft ab:** <t:${Math.floor(expiresDate.getTime() / 1000)}:f>\n` +
            `**Features:** 👑 Pro-Level (unbegrenzte Kategorien, Analytics, Auto-Close, etc.)` +
            roleStatus
          )
          .setColor(0x00ff88)
          .setTimestamp()
          .setFooter({ text: 'TRS Tickets Bot • Betatester' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });

        console.log(`🧪 Betatester für Guild ${guildId} (${guildName}) aktiviert von ${interaction.user.tag} für ${days} Tage`);

      } else if (subcommand === 'remove') {
        const guildId = interaction.options.getString('server');

        // Fetch guild info
        let guildName = guildId;
        try {
          const guild = await interaction.client.guilds.fetch(guildId);
          guildName = guild.name;
        } catch (err) {
          guildName = `Unknown (${guildId})`;
        }

        // Remove Betatester
        const result = deactivateBetatester(guildId);

        if (!result.success) {
          return interaction.reply({
            content: `❌ ${result.message || 'Fehler beim Entfernen von Betatester-Status'}`,
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('🚫 Betatester Entfernt')
          .setDescription(
            `**Server:** ${guildName}\n` +
            `**Guild ID:** \`${guildId}\`\n` +
            `**Status:** Betatester-Status wurde entfernt`
          )
          .setColor(0xff4444)
          .setTimestamp()
          .setFooter({ text: 'TRS Tickets Bot • Betatester' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });

        console.log(`🚫 Betatester für Guild ${guildId} (${guildName}) entfernt von ${interaction.user.tag}`);

      } else if (subcommand === 'list') {
        const betatesterServers = listBetatesterServers();

        if (betatesterServers.length === 0) {
          return interaction.reply({
            content: '📋 Keine Betatester-Server gefunden.',
            ephemeral: true
          });
        }

        // Fetch guild names
        const serverList = [];
        for (const server of betatesterServers) {
          try {
            const guild = await interaction.client.guilds.fetch(server.guildId);
            const expiresDate = new Date(server.expiresAt);
            const isExpired = expiresDate < new Date();

            serverList.push(
              `**${guild.name}**${isExpired ? ' ⚠️ ABGELAUFEN' : ''}\n` +
              `├ ID: \`${server.guildId}\`\n` +
              `├ Läuft ab: <t:${Math.floor(expiresDate.getTime() / 1000)}:R>\n` +
              `└ Status: ${isExpired ? '❌ Abgelaufen' : '✅ Aktiv'}`
            );
          } catch (err) {
            const expiresDate = new Date(server.expiresAt);
            const isExpired = expiresDate < new Date();

            serverList.push(
              `**Unknown Server**${isExpired ? ' ⚠️ ABGELAUFEN' : ''}\n` +
              `├ ID: \`${server.guildId}\`\n` +
              `├ Läuft ab: <t:${Math.floor(expiresDate.getTime() / 1000)}:R>\n` +
              `└ Status: ${isExpired ? '❌ Abgelaufen' : '✅ Aktiv'}`
            );
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('🧪 Betatester Server')
          .setDescription(
            `**Gesamt:** ${betatesterServers.length} Server\n\n` +
            serverList.join('\n\n')
          )
          .setColor(0x00ff88)
          .setTimestamp()
          .setFooter({ text: 'TRS Tickets Bot • Betatester' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }
    } catch (err) {
      console.error('Betatester Command Error:', err);
      await interaction.reply({
        content: '❌ Ein Fehler ist aufgetreten. Siehe Console für Details.',
        ephemeral: true
      });
    }
  }
};
