const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { activateLifetimePremium, removeLifetimePremium, listLifetimePremiumServers, assignPremiumRole } = require('../premium');

const OWNER_ID = '1159182333316968530';
const ALLOWED_USERS = [
  '1159182333316968530',
  '928901974106202113',
  '1415387837359984740',
  '1048900200497954868'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lifetime-premium')
    .setDescription('Manage Lifetime Premium (Owner Only)')
    .setDescriptionLocalizations({
      de: 'Lifetime Premium verwalten (Nur Owner)',
      'en-US': 'Manage Lifetime Premium (Owner Only)',
      ja: 'ライフタイムプレミアムを管理 (オーナー専用)',
      ru: 'Управление Lifetime Premium (только владелец)',
      'pt-BR': 'Gerenciar Premium Vitalício (Apenas Proprietário)',
      'es-ES': 'Administrar Premium de por Vida (Solo Propietario)',
      id: 'Kelola Premium Seumur Hidup (Hanya Pemilik)'
    })
    .setDMPermission(false)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add Lifetime Premium to a server')
        .setDescriptionLocalizations({
          de: 'Lifetime Premium zu einem Server hinzufügen',
          'en-US': 'Add Lifetime Premium to a server',
          ja: 'サーバーにライフタイムプレミアムを追加',
          ru: 'Добавить Lifetime Premium на сервер',
          'pt-BR': 'Adicionar Premium Vitalício a um servidor',
          'es-ES': 'Agregar Premium de por Vida a un servidor',
          id: 'Tambahkan Premium Seumur Hidup ke server'
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
        .addStringOption(option =>
          option
            .setName('tier')
            .setDescription('Premium Tier')
            .setDescriptionLocalizations({
              de: 'Premium Stufe',
              'en-US': 'Premium Tier',
              ja: 'プレミアム層',
              ru: 'Уровень Premium',
              'pt-BR': 'Nível Premium',
              'es-ES': 'Nivel Premium',
              id: 'Tingkat Premium'
            })
            .setRequired(true)
            .addChoices(
              { name: '💎 Basic', value: 'basic' },
              { name: '👑 Pro', value: 'pro' }
            )
        )
        .addUserOption(option =>
          option
            .setName('buyer')
            .setDescription('User who bought Premium (will receive role on Theredstonee Projects)')
            .setDescriptionLocalizations({
              de: 'User der Premium gekauft hat (erhält Rolle auf Theredstonee Projects)',
              'en-US': 'User who bought Premium (will receive role on Theredstonee Projects)',
              ja: 'Premiumを購入したユーザー（Theredstonee Projectsでロールを受け取る）',
              ru: 'Пользователь, купивший Premium (получит роль на Theredstonee Projects)',
              'pt-BR': 'Usuário que comprou Premium (receberá cargo no Theredstonee Projects)',
              'es-ES': 'Usuario que compró Premium (recibirá rol en Theredstonee Projects)',
              id: 'Pengguna yang membeli Premium (akan menerima peran di Theredstonee Projects)'
            })
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove Lifetime Premium from a server')
        .setDescriptionLocalizations({
          de: 'Lifetime Premium von einem Server entfernen',
          'en-US': 'Remove Lifetime Premium from a server',
          ja: 'サーバーからライフタイムプレミアムを削除',
          ru: 'Удалить Lifetime Premium с сервера',
          'pt-BR': 'Remover Premium Vitalício de um servidor',
          'es-ES': 'Eliminar Premium de por Vida de un servidor',
          id: 'Hapus Premium Seumur Hidup dari server'
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
        .setDescription('List all servers with Lifetime Premium')
        .setDescriptionLocalizations({
          de: 'Alle Server mit Lifetime Premium auflisten',
          'en-US': 'List all servers with Lifetime Premium',
          ja: 'ライフタイムプレミアムを持つすべてのサーバーをリスト表示',
          ru: 'Список всех серверов с Lifetime Premium',
          'pt-BR': 'Listar todos os servidores com Premium Vitalício',
          'es-ES': 'Listar todos los servidores con Premium de por Vida',
          id: 'Daftar semua server dengan Premium Seumur Hidup'
        })
    ),

  async autocomplete(interaction) {
    // Check if user is allowed
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
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
    // Check if user is allowed
    if (!ALLOWED_USERS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Dieser Command kann nur vom Bot-Owner oder autorisierten Usern ausgeführt werden.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        const guildId = interaction.options.getString('server');
        const tier = interaction.options.getString('tier');
        const buyer = interaction.options.getUser('buyer');

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

        // Determine buyer ID (falls nicht angegeben, Server-Owner)
        const buyerId = buyer ? buyer.id : guildOwner.id;

        // Activate Lifetime Premium
        const result = activateLifetimePremium(guildId, tier, buyerId);

        if (!result.success) {
          return interaction.reply({
            content: `❌ Fehler beim Aktivieren von Lifetime Premium für **${guildName}**.`,
            ephemeral: true
          });
        }

        // Assign Premium Role on Theredstonee Projects
        const roleResult = await assignPremiumRole(interaction.client, buyerId);

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

        const embed = new EmbedBuilder()
          .setTitle('♾️ Lifetime Premium Aktiviert')
          .setDescription(
            `**Server:** ${guildName}\n` +
            `**Guild ID:** \`${guildId}\`\n` +
            `**Tier:** ${tier === 'pro' ? '👑 Pro' : '💎 Basic'}\n` +
            `**Käufer:** ${buyer ? buyer.tag : guildOwner.user.tag}\n` +
            `**Status:** ♾️ Lifetime (läuft nie ab)` +
            roleStatus
          )
          .setColor(tier === 'pro' ? 0x764ba2 : 0x667eea)
          .setTimestamp()
          .setFooter({ text: 'TRS Tickets Bot • Lifetime Premium' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });

        console.log(`♾️ Lifetime Premium ${tier} für Guild ${guildId} (${guildName}) aktiviert von ${interaction.user.tag}`);

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

        // Remove Lifetime Premium
        const result = removeLifetimePremium(guildId);

        if (!result.success) {
          return interaction.reply({
            content: `❌ ${result.message || 'Fehler beim Entfernen von Lifetime Premium'}`,
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('🚫 Lifetime Premium Entfernt')
          .setDescription(
            `**Server:** ${guildName}\n` +
            `**Guild ID:** \`${guildId}\`\n` +
            `**Status:** Lifetime Premium wurde entfernt`
          )
          .setColor(0xff4444)
          .setTimestamp()
          .setFooter({ text: 'TRS Tickets Bot • Lifetime Premium' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });

        console.log(`🚫 Lifetime Premium für Guild ${guildId} (${guildName}) entfernt von ${interaction.user.tag}`);

      } else if (subcommand === 'list') {
        const lifetimeServers = listLifetimePremiumServers();

        if (lifetimeServers.length === 0) {
          return interaction.reply({
            content: '📋 Keine Server mit Lifetime Premium gefunden.',
            ephemeral: true
          });
        }

        // Fetch guild names
        const serverList = [];
        for (const server of lifetimeServers) {
          try {
            const guild = await interaction.client.guilds.fetch(server.guildId);
            serverList.push(
              `**${guild.name}**\n` +
              `├ ID: \`${server.guildId}\`\n` +
              `└ Tier: ${server.tier === 'pro' ? '👑 Pro' : '💎 Basic'}`
            );
          } catch (err) {
            serverList.push(
              `**Unknown Server**\n` +
              `├ ID: \`${server.guildId}\`\n` +
              `└ Tier: ${server.tier === 'pro' ? '👑 Pro' : '💎 Basic'}`
            );
          }
        }

        const embed = new EmbedBuilder()
          .setTitle('♾️ Lifetime Premium Server')
          .setDescription(
            `**Gesamt:** ${lifetimeServers.length} Server\n\n` +
            serverList.join('\n\n')
          )
          .setColor(0x764ba2)
          .setTimestamp()
          .setFooter({ text: 'TRS Tickets Bot • Lifetime Premium' });

        await interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }
    } catch (err) {
      console.error('Lifetime Premium Command Error:', err);
      await interaction.reply({
        content: '❌ Ein Fehler ist aufgetreten. Siehe Console für Details.',
        ephemeral: true
      });
    }
  }
};
