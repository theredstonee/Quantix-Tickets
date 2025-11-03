const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildLanguage } = require('../translations');
const { getPremiumInfo } = require('../premium');
const { VERSION } = require('../version.config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help and getting started guide')
    .setDescriptionLocalizations({
      de: 'Hilfe und Erste-Schritte-Anleitung anzeigen',
      'en-US': 'Show help and getting started guide',
      'en-GB': 'Show help and getting started guide',
      tr: 'Yardım ve başlangıç kılavuzunu göster',
      ja: 'ヘルプと使い始めガイドを表示',
      ru: 'Показать справку и руководство по началу работы',
      'pt-BR': 'Mostrar ajuda e guia de início',
      'es-ES': 'Mostrar ayuda y guía de inicio',
      id: 'Tampilkan bantuan dan panduan memulai'
    }),

  async execute(interaction) {
    try {
      const guildId = interaction.guild?.id;
      const lang = getGuildLanguage(guildId);
      const premiumInfo = getPremiumInfo(guildId);

      // Get translations
      const translations = getHelpTranslations(lang);

      // Build main embed
      const helpEmbed = new EmbedBuilder()
        .setColor(premiumInfo.tier === 'partner' ? 0x00ff88 : premiumInfo.tier === 'pro' || premiumInfo.tier === 'beta' ? 0x9b59b6 : 0x00ff88)
        .setAuthor({
          name: translations.title,
          iconURL: interaction.client.user.displayAvatarURL({ size: 256 })
        })
        .setDescription(translations.welcome)
        .addFields(
          {
            name: `${translations.quickStart.emoji} ${translations.quickStart.title}`,
            value: translations.quickStart.steps,
            inline: false
          },
          {
            name: `${translations.categories.emoji} ${translations.categories.title}`,
            value: translations.categories.list,
            inline: false
          },
          {
            name: `${translations.features.emoji} ${translations.features.title}`,
            value: translations.features.list,
            inline: false
          },
          {
            name: `${translations.premium.emoji} ${translations.premium.title}`,
            value: translations.premium.info,
            inline: false
          },
          {
            name: `${translations.tips.emoji} ${translations.tips.title}`,
            value: translations.tips.list,
            inline: false
          }
        )
        .setFooter({
          text: `${translations.footer} • Quantix Tickets v${VERSION}`,
          iconURL: interaction.client.user.displayAvatarURL({ size: 64 })
        })
        .setTimestamp();

      // Premium badge if active
      if (premiumInfo.isActive) {
        const premiumBadge = premiumInfo.tier === 'partner' ? '🤝 Partner' :
                            premiumInfo.tier === 'pro' ? '👑 Premium Pro' :
                            premiumInfo.tier === 'beta' ? '🧪 Betatester' : '';

        if (premiumBadge) {
          helpEmbed.setThumbnail(interaction.guild.iconURL({ size: 256 }));
          helpEmbed.addFields({
            name: `✨ ${translations.currentPlan}`,
            value: `**${premiumBadge}**${premiumInfo.isLifetime ? ' (Lifetime)' : ''}`,
            inline: true
          });
        }
      }

      // Build button row
      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setURL(process.env.PUBLIC_BASE_URL || 'https://quantixtickets.theredstonee.de')
          .setStyle(ButtonStyle.Link)
          .setLabel(translations.buttons.dashboard)
          .setEmoji('🎛️'),
        new ButtonBuilder()
          .setURL((process.env.PUBLIC_BASE_URL || 'https://quantixtickets.theredstonee.de') + '/premium')
          .setStyle(ButtonStyle.Link)
          .setLabel(translations.buttons.premium)
          .setEmoji('⭐'),
        new ButtonBuilder()
          .setURL('https://discord.gg/mnYbnpyyBS')
          .setStyle(ButtonStyle.Link)
          .setLabel(translations.buttons.support)
          .setEmoji('💬'),
        new ButtonBuilder()
          .setURL('https://quantixtickets.theredstonee.de')
          .setStyle(ButtonStyle.Link)
          .setLabel(translations.buttons.commands)
          .setEmoji('📝')
      );

      await interaction.reply({
        embeds: [helpEmbed],
        components: [buttonRow],
        ephemeral: false
      });

    } catch (err) {
      console.error('Error in help command:', err);
      await interaction.reply({
        content: '❌ Ein Fehler ist aufgetreten. Bitte versuche es später erneut.',
        ephemeral: true
      }).catch(() => {});
    }
  }
};

/**
 * Get help translations for specified language
 * @param {string} lang - Language code
 * @returns {object} - Translations object
 */
function getHelpTranslations(lang) {
  const translations = {
    de: {
      title: '🎫 Quantix Tickets - Hilfe & Erste Schritte',
      welcome: '**Willkommen bei Quantix Tickets!**\n\nDer professionelle Multi-Server Ticket-Bot mit Web-Dashboard und 9 Sprachen. Hier findest du alle wichtigen Informationen für den Einstieg.',
      quickStart: {
        emoji: '🚀',
        title: 'Schnellstart',
        steps:
          '**1️⃣** Öffne das **[Dashboard](https://quantixtickets.theredstonee.de)** und logge dich mit Discord ein\n' +
          '**2️⃣** Wähle deinen Server aus\n' +
          '**3️⃣** Konfiguriere deine Ticket-Kategorien und Team-Rollen\n' +
          '**4️⃣** Sende das Ticket-Panel mit dem Button im Dashboard\n' +
          '**5️⃣** Fertig! Dein Ticket-System ist einsatzbereit 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'Command-Kategorien',
        list:
          '• **🎫 Ticket Management** - Tickets verwalten und organisieren\n' +
          '• **📝 Notizen** - Interne Notizen zu Tickets\n' +
          '• **🚫 Moderation** - Blacklist und User-Verwaltung\n' +
          '• **⚙️ Server-Einstellungen** - Bot konfigurieren\n' +
          '• **📊 Analytics** - Statistiken und Auswertungen (Pro)\n' +
          '• **ℹ️ Information** - Version, Status, Commands\n\n' +
          '💡 Nutze `/commands` für die vollständige Liste!'
      },
      features: {
        emoji: '✨',
        title: 'Hauptfeatures',
        list:
          '🌍 **Multi-Language**: 9 Sprachen verfügbar\n' +
          '🎨 **Anpassbar**: Custom Embeds, Formulare & Farben\n' +
          '📊 **Analytics**: Detaillierte Statistiken (Pro)\n' +
          '🎯 **Priority System**: 3 Prioritätsstufen mit Rollen\n' +
          '📝 **Live Transcripts**: HTML & TXT Formate\n' +
          '⏱️ **SLA System**: Automatische Eskalation (Pro)\n' +
          '🔔 **Benachrichtigungen**: DM & Email Support (Pro)\n' +
          '⭐ **Rating System**: 5-Sterne Bewertungen'
      },
      premium: {
        emoji: '💎',
        title: 'Premium Features',
        info:
          '**🆓 Free**: 5 Kategorien, Basis-Features\n' +
          '**💎 Basic** (€2.99): 7 Kategorien, File Upload, Custom Avatar\n' +
          '**👑 Pro** (€4.99): Unbegrenzt, Analytics, SLA, Auto-Close\n' +
          '**🤝 Partner**: Lifetime Pro-Features\n\n' +
          '➡️ [Premium kaufen](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: 'Hilfreiche Tipps',
        list:
          '• Nutze `/dashboard` für die Web-Konfiguration\n' +
          '• Team-Rollen können hierarchisch konfiguriert werden\n' +
          '• Transcripts werden automatisch bei Ticket-Schließung erstellt\n' +
          '• DM-Benachrichtigungen können pro User konfiguriert werden\n' +
          '• Der Bot unterstützt mehrere Ticket-Systeme pro Server (Pro)'
      },
      currentPlan: 'Dein aktueller Plan',
      footer: 'Brauchst du Hilfe? Tritt unserem Support-Server bei!',
      buttons: {
        dashboard: 'Dashboard',
        premium: 'Premium',
        support: 'Support Server',
        commands: 'Alle Commands'
      }
    },
    en: {
      title: '🎫 Quantix Tickets - Help & Getting Started',
      welcome: '**Welcome to Quantix Tickets!**\n\nThe professional multi-server ticket bot with web dashboard and 9 languages. Here you will find all important information to get started.',
      quickStart: {
        emoji: '🚀',
        title: 'Quick Start',
        steps:
          '**1️⃣** Open the **[Dashboard](https://quantixtickets.theredstonee.de)** and login with Discord\n' +
          '**2️⃣** Select your server\n' +
          '**3️⃣** Configure your ticket categories and team roles\n' +
          '**4️⃣** Send the ticket panel using the button in the dashboard\n' +
          '**5️⃣** Done! Your ticket system is ready to use 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'Command Categories',
        list:
          '• **🎫 Ticket Management** - Manage and organize tickets\n' +
          '• **📝 Notes** - Internal notes for tickets\n' +
          '• **🚫 Moderation** - Blacklist and user management\n' +
          '• **⚙️ Server Settings** - Configure the bot\n' +
          '• **📊 Analytics** - Statistics and insights (Pro)\n' +
          '• **ℹ️ Information** - Version, status, commands\n\n' +
          '💡 Use `/commands` for the complete list!'
      },
      features: {
        emoji: '✨',
        title: 'Main Features',
        list:
          '🌍 **Multi-Language**: 9 languages available\n' +
          '🎨 **Customizable**: Custom embeds, forms & colors\n' +
          '📊 **Analytics**: Detailed statistics (Pro)\n' +
          '🎯 **Priority System**: 3 priority levels with roles\n' +
          '📝 **Live Transcripts**: HTML & TXT formats\n' +
          '⏱️ **SLA System**: Automatic escalation (Pro)\n' +
          '🔔 **Notifications**: DM & Email support (Pro)\n' +
          '⭐ **Rating System**: 5-star ratings'
      },
      premium: {
        emoji: '💎',
        title: 'Premium Features',
        info:
          '**🆓 Free**: 5 categories, basic features\n' +
          '**💎 Basic** (€2.99): 7 categories, file upload, custom avatar\n' +
          '**👑 Pro** (€4.99): Unlimited, analytics, SLA, auto-close\n' +
          '**🤝 Partner**: Lifetime Pro features\n\n' +
          '➡️ [Get Premium](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: 'Helpful Tips',
        list:
          '• Use `/dashboard` for web configuration\n' +
          '• Team roles can be configured hierarchically\n' +
          '• Transcripts are automatically created when closing tickets\n' +
          '• DM notifications can be configured per user\n' +
          '• The bot supports multiple ticket systems per server (Pro)'
      },
      currentPlan: 'Your Current Plan',
      footer: 'Need help? Join our support server!',
      buttons: {
        dashboard: 'Dashboard',
        premium: 'Premium',
        support: 'Support Server',
        commands: 'All Commands'
      }
    },
    tr: {
      title: '🎫 Quantix Tickets - Yardım & Başlangıç',
      welcome: '**Quantix Tickets\'a Hoş Geldiniz!**\n\nWeb paneli ve 9 dil destekli profesyonel çok sunuculu destek bileti botu. Başlamak için gerekli tüm bilgileri burada bulabilirsiniz.',
      quickStart: {
        emoji: '🚀',
        title: 'Hızlı Başlangıç',
        steps:
          '**1️⃣** **[Panel](https://quantixtickets.theredstonee.de)**\'i açın ve Discord ile giriş yapın\n' +
          '**2️⃣** Sunucunuzu seçin\n' +
          '**3️⃣** Destek kategorilerinizi ve takım rollerinizi yapılandırın\n' +
          '**4️⃣** Paneldeki butonu kullanarak destek panelini gönderin\n' +
          '**5️⃣** Tamamlandı! Destek sisteminiz kullanıma hazır 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'Komut Kategorileri',
        list:
          '• **🎫 Destek Yönetimi** - Destek taleplerini yönetin\n' +
          '• **📝 Notlar** - Destek için dahili notlar\n' +
          '• **🚫 Moderasyon** - Kara liste ve kullanıcı yönetimi\n' +
          '• **⚙️ Sunucu Ayarları** - Botu yapılandırın\n' +
          '• **📊 Analitik** - İstatistikler ve analizler (Pro)\n' +
          '• **ℹ️ Bilgi** - Sürüm, durum, komutlar\n\n' +
          '💡 Tam liste için `/commands` kullanın!'
      },
      features: {
        emoji: '✨',
        title: 'Ana Özellikler',
        list:
          '🌍 **Çok Dilli**: 9 dil mevcut\n' +
          '🎨 **Özelleştirilebilir**: Özel embed\'ler, formlar ve renkler\n' +
          '📊 **Analitik**: Detaylı istatistikler (Pro)\n' +
          '🎯 **Öncelik Sistemi**: Rollerle 3 öncelik seviyesi\n' +
          '📝 **Canlı Transkriptler**: HTML ve TXT formatları\n' +
          '⏱️ **SLA Sistemi**: Otomatik yükseltme (Pro)\n' +
          '🔔 **Bildirimler**: DM ve Email desteği (Pro)\n' +
          '⭐ **Değerlendirme Sistemi**: 5 yıldızlı değerlendirmeler'
      },
      premium: {
        emoji: '💎',
        title: 'Premium Özellikler',
        info:
          '**🆓 Ücretsiz**: 5 kategori, temel özellikler\n' +
          '**💎 Basic** (€2.99): 7 kategori, dosya yükleme, özel avatar\n' +
          '**👑 Pro** (€4.99): Sınırsız, analitik, SLA, otomatik kapatma\n' +
          '**🤝 Partner**: Ömür boyu Pro özellikleri\n\n' +
          '➡️ [Premium Al](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: 'Yararlı İpuçları',
        list:
          '• Web yapılandırması için `/dashboard` kullanın\n' +
          '• Takım rolleri hiyerarşik olarak yapılandırılabilir\n' +
          '• Transkriptler destek kapandığında otomatik oluşturulur\n' +
          '• DM bildirimleri kullanıcı başına yapılandırılabilir\n' +
          '• Bot sunucu başına birden fazla destek sistemini destekler (Pro)'
      },
      currentPlan: 'Mevcut Planınız',
      footer: 'Yardıma mı ihtiyacınız var? Destek sunucumuza katılın!',
      buttons: {
        dashboard: 'Panel',
        premium: 'Premium',
        support: 'Destek Sunucusu',
        commands: 'Tüm Komutlar'
      }
    },
    ja: {
      title: '🎫 Quantix Tickets - ヘルプ＆スタートガイド',
      welcome: '**Quantix Ticketsへようこそ！**\n\nWebダッシュボードと9言語対応のプロフェッショナルなマルチサーバーチケットボット。ここで始めるための重要な情報をすべて見つけることができます。',
      quickStart: {
        emoji: '🚀',
        title: 'クイックスタート',
        steps:
          '**1️⃣** **[ダッシュボード](https://quantixtickets.theredstonee.de)**を開き、Discordでログイン\n' +
          '**2️⃣** サーバーを選択\n' +
          '**3️⃣** チケットカテゴリとチームロールを設定\n' +
          '**4️⃣** ダッシュボードのボタンでチケットパネルを送信\n' +
          '**5️⃣** 完了！チケットシステムの準備完了 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'コマンドカテゴリ',
        list:
          '• **🎫 チケット管理** - チケットの管理と整理\n' +
          '• **📝 メモ** - チケットの内部メモ\n' +
          '• **🚫 モデレーション** - ブラックリストとユーザー管理\n' +
          '• **⚙️ サーバー設定** - ボットの設定\n' +
          '• **📊 分析** - 統計と洞察 (Pro)\n' +
          '• **ℹ️ 情報** - バージョン、ステータス、コマンド\n\n' +
          '💡 完全なリストは `/commands` を使用！'
      },
      features: {
        emoji: '✨',
        title: '主な機能',
        list:
          '🌍 **多言語対応**: 9言語利用可能\n' +
          '🎨 **カスタマイズ可能**: カスタム埋め込み、フォーム、色\n' +
          '📊 **分析**: 詳細な統計 (Pro)\n' +
          '🎯 **優先度システム**: ロール付き3段階優先度\n' +
          '📝 **ライブトランスクリプト**: HTMLとTXT形式\n' +
          '⏱️ **SLAシステム**: 自動エスカレーション (Pro)\n' +
          '🔔 **通知**: DMとメールサポート (Pro)\n' +
          '⭐ **評価システム**: 5つ星評価'
      },
      premium: {
        emoji: '💎',
        title: 'プレミアム機能',
        info:
          '**🆓 無料**: 5カテゴリ、基本機能\n' +
          '**💎 Basic** (€2.99): 7カテゴリ、ファイルアップロード、カスタムアバター\n' +
          '**👑 Pro** (€4.99): 無制限、分析、SLA、自動クローズ\n' +
          '**🤝 Partner**: 生涯Pro機能\n\n' +
          '➡️ [プレミアムを取得](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: '役立つヒント',
        list:
          '• Web設定には `/dashboard` を使用\n' +
          '• チームロールは階層的に設定可能\n' +
          '• トランスクリプトはチケット終了時に自動作成\n' +
          '• DM通知はユーザーごとに設定可能\n' +
          '• ボットはサーバーごとに複数のチケットシステムをサポート (Pro)'
      },
      currentPlan: '現在のプラン',
      footer: 'ヘルプが必要ですか？サポートサーバーに参加！',
      buttons: {
        dashboard: 'ダッシュボード',
        premium: 'プレミアム',
        support: 'サポートサーバー',
        commands: '全コマンド'
      }
    },
    ru: {
      title: '🎫 Quantix Tickets - Справка и Начало Работы',
      welcome: '**Добро пожаловать в Quantix Tickets!**\n\nПрофессиональный мультисерверный тикет-бот с веб-панелью и 9 языками. Здесь вы найдете всю важную информацию для начала работы.',
      quickStart: {
        emoji: '🚀',
        title: 'Быстрый Старт',
        steps:
          '**1️⃣** Откройте **[Панель](https://quantixtickets.theredstonee.de)** и войдите через Discord\n' +
          '**2️⃣** Выберите свой сервер\n' +
          '**3️⃣** Настройте категории тикетов и роли команды\n' +
          '**4️⃣** Отправьте панель тикетов с помощью кнопки в панели\n' +
          '**5️⃣** Готово! Ваша система тикетов готова к использованию 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'Категории Команд',
        list:
          '• **🎫 Управление Тикетами** - Управление и организация тикетов\n' +
          '• **📝 Заметки** - Внутренние заметки для тикетов\n' +
          '• **🚫 Модерация** - Черный список и управление пользователями\n' +
          '• **⚙️ Настройки Сервера** - Настройка бота\n' +
          '• **📊 Аналитика** - Статистика и аналитика (Pro)\n' +
          '• **ℹ️ Информация** - Версия, статус, команды\n\n' +
          '💡 Используйте `/commands` для полного списка!'
      },
      features: {
        emoji: '✨',
        title: 'Основные Функции',
        list:
          '🌍 **Мультиязычность**: Доступно 9 языков\n' +
          '🎨 **Настраиваемость**: Пользовательские встраивания, формы и цвета\n' +
          '📊 **Аналитика**: Подробная статистика (Pro)\n' +
          '🎯 **Система Приоритетов**: 3 уровня с ролями\n' +
          '📝 **Живые Транскрипты**: Форматы HTML и TXT\n' +
          '⏱️ **SLA Система**: Автоматическая эскалация (Pro)\n' +
          '🔔 **Уведомления**: Поддержка DM и Email (Pro)\n' +
          '⭐ **Система Оценок**: 5-звездочные оценки'
      },
      premium: {
        emoji: '💎',
        title: 'Premium Функции',
        info:
          '**🆓 Бесплатно**: 5 категорий, базовые функции\n' +
          '**💎 Basic** (€2.99): 7 категорий, загрузка файлов, пользовательский аватар\n' +
          '**👑 Pro** (€4.99): Неограниченно, аналитика, SLA, авто-закрытие\n' +
          '**🤝 Partner**: Пожизненные Pro функции\n\n' +
          '➡️ [Получить Premium](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: 'Полезные Советы',
        list:
          '• Используйте `/dashboard` для веб-настройки\n' +
          '• Роли команды можно настроить иерархически\n' +
          '• Транскрипты создаются автоматически при закрытии тикетов\n' +
          '• DM уведомления можно настроить для каждого пользователя\n' +
          '• Бот поддерживает несколько систем тикетов на сервер (Pro)'
      },
      currentPlan: 'Ваш Текущий План',
      footer: 'Нужна помощь? Присоединяйтесь к нашему серверу поддержки!',
      buttons: {
        dashboard: 'Панель',
        premium: 'Premium',
        support: 'Сервер Поддержки',
        commands: 'Все Команды'
      }
    },
    pt: {
      title: '🎫 Quantix Tickets - Ajuda & Guia Inicial',
      welcome: '**Bem-vindo ao Quantix Tickets!**\n\nO bot profissional de tickets multi-servidor com painel web e 9 idiomas. Aqui você encontrará todas as informações importantes para começar.',
      quickStart: {
        emoji: '🚀',
        title: 'Início Rápido',
        steps:
          '**1️⃣** Abra o **[Painel](https://quantixtickets.theredstonee.de)** e faça login com Discord\n' +
          '**2️⃣** Selecione seu servidor\n' +
          '**3️⃣** Configure suas categorias de tickets e funções da equipe\n' +
          '**4️⃣** Envie o painel de tickets usando o botão no painel\n' +
          '**5️⃣** Pronto! Seu sistema de tickets está pronto para uso 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'Categorias de Comandos',
        list:
          '• **🎫 Gestão de Tickets** - Gerenciar e organizar tickets\n' +
          '• **📝 Notas** - Notas internas para tickets\n' +
          '• **🚫 Moderação** - Lista negra e gestão de usuários\n' +
          '• **⚙️ Configurações do Servidor** - Configurar o bot\n' +
          '• **📊 Análises** - Estatísticas e insights (Pro)\n' +
          '• **ℹ️ Informação** - Versão, status, comandos\n\n' +
          '💡 Use `/commands` para a lista completa!'
      },
      features: {
        emoji: '✨',
        title: 'Recursos Principais',
        list:
          '🌍 **Multi-idioma**: 9 idiomas disponíveis\n' +
          '🎨 **Personalizável**: Embeds, formulários e cores personalizados\n' +
          '📊 **Análises**: Estatísticas detalhadas (Pro)\n' +
          '🎯 **Sistema de Prioridade**: 3 níveis com funções\n' +
          '📝 **Transcrições ao Vivo**: Formatos HTML e TXT\n' +
          '⏱️ **Sistema SLA**: Escalação automática (Pro)\n' +
          '🔔 **Notificações**: Suporte DM e Email (Pro)\n' +
          '⭐ **Sistema de Avaliação**: Avaliações de 5 estrelas'
      },
      premium: {
        emoji: '💎',
        title: 'Recursos Premium',
        info:
          '**🆓 Grátis**: 5 categorias, recursos básicos\n' +
          '**💎 Basic** (€2.99): 7 categorias, upload de arquivos, avatar personalizado\n' +
          '**👑 Pro** (€4.99): Ilimitado, análises, SLA, fechamento automático\n' +
          '**🤝 Partner**: Recursos Pro vitalícios\n\n' +
          '➡️ [Obter Premium](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: 'Dicas Úteis',
        list:
          '• Use `/dashboard` para configuração web\n' +
          '• Funções da equipe podem ser configuradas hierarquicamente\n' +
          '• Transcrições são criadas automaticamente ao fechar tickets\n' +
          '• Notificações DM podem ser configuradas por usuário\n' +
          '• O bot suporta vários sistemas de tickets por servidor (Pro)'
      },
      currentPlan: 'Seu Plano Atual',
      footer: 'Precisa de ajuda? Junte-se ao nosso servidor de suporte!',
      buttons: {
        dashboard: 'Painel',
        premium: 'Premium',
        support: 'Servidor de Suporte',
        commands: 'Todos os Comandos'
      }
    },
    es: {
      title: '🎫 Quantix Tickets - Ayuda y Guía de Inicio',
      welcome: '**¡Bienvenido a Quantix Tickets!**\n\nEl bot profesional de tickets multi-servidor con panel web y 9 idiomas. Aquí encontrarás toda la información importante para comenzar.',
      quickStart: {
        emoji: '🚀',
        title: 'Inicio Rápido',
        steps:
          '**1️⃣** Abre el **[Panel](https://quantixtickets.theredstonee.de)** e inicia sesión con Discord\n' +
          '**2️⃣** Selecciona tu servidor\n' +
          '**3️⃣** Configura tus categorías de tickets y roles del equipo\n' +
          '**4️⃣** Envía el panel de tickets usando el botón en el panel\n' +
          '**5️⃣** ¡Listo! Tu sistema de tickets está listo para usar 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'Categorías de Comandos',
        list:
          '• **🎫 Gestión de Tickets** - Gestionar y organizar tickets\n' +
          '• **📝 Notas** - Notas internas para tickets\n' +
          '• **🚫 Moderación** - Lista negra y gestión de usuarios\n' +
          '• **⚙️ Configuración del Servidor** - Configurar el bot\n' +
          '• **📊 Análisis** - Estadísticas e información (Pro)\n' +
          '• **ℹ️ Información** - Versión, estado, comandos\n\n' +
          '💡 ¡Usa `/commands` para la lista completa!'
      },
      features: {
        emoji: '✨',
        title: 'Características Principales',
        list:
          '🌍 **Multi-idioma**: 9 idiomas disponibles\n' +
          '🎨 **Personalizable**: Embeds, formularios y colores personalizados\n' +
          '📊 **Análisis**: Estadísticas detalladas (Pro)\n' +
          '🎯 **Sistema de Prioridad**: 3 niveles con roles\n' +
          '📝 **Transcripciones en Vivo**: Formatos HTML y TXT\n' +
          '⏱️ **Sistema SLA**: Escalación automática (Pro)\n' +
          '🔔 **Notificaciones**: Soporte DM y Email (Pro)\n' +
          '⭐ **Sistema de Calificación**: Calificaciones de 5 estrellas'
      },
      premium: {
        emoji: '💎',
        title: 'Características Premium',
        info:
          '**🆓 Gratis**: 5 categorías, características básicas\n' +
          '**💎 Basic** (€2.99): 7 categorías, carga de archivos, avatar personalizado\n' +
          '**👑 Pro** (€4.99): Ilimitado, análisis, SLA, cierre automático\n' +
          '**🤝 Partner**: Características Pro de por vida\n\n' +
          '➡️ [Obtener Premium](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: 'Consejos Útiles',
        list:
          '• Use `/dashboard` para configuración web\n' +
          '• Los roles del equipo se pueden configurar jerárquicamente\n' +
          '• Las transcripciones se crean automáticamente al cerrar tickets\n' +
          '• Las notificaciones DM se pueden configurar por usuario\n' +
          '• El bot admite múltiples sistemas de tickets por servidor (Pro)'
      },
      currentPlan: 'Tu Plan Actual',
      footer: '¿Necesitas ayuda? ¡Únete a nuestro servidor de soporte!',
      buttons: {
        dashboard: 'Panel',
        premium: 'Premium',
        support: 'Servidor de Soporte',
        commands: 'Todos los Comandos'
      }
    },
    id: {
      title: '🎫 Quantix Tickets - Bantuan & Panduan Awal',
      welcome: '**Selamat datang di Quantix Tickets!**\n\nBot tiket multi-server profesional dengan panel web dan 9 bahasa. Di sini Anda akan menemukan semua informasi penting untuk memulai.',
      quickStart: {
        emoji: '🚀',
        title: 'Mulai Cepat',
        steps:
          '**1️⃣** Buka **[Panel](https://quantixtickets.theredstonee.de)** dan login dengan Discord\n' +
          '**2️⃣** Pilih server Anda\n' +
          '**3️⃣** Konfigurasi kategori tiket dan peran tim Anda\n' +
          '**4️⃣** Kirim panel tiket menggunakan tombol di panel\n' +
          '**5️⃣** Selesai! Sistem tiket Anda siap digunakan 🎉'
      },
      categories: {
        emoji: '📋',
        title: 'Kategori Perintah',
        list:
          '• **🎫 Manajemen Tiket** - Kelola dan atur tiket\n' +
          '• **📝 Catatan** - Catatan internal untuk tiket\n' +
          '• **🚫 Moderasi** - Daftar hitam dan manajemen pengguna\n' +
          '• **⚙️ Pengaturan Server** - Konfigurasi bot\n' +
          '• **📊 Analitik** - Statistik dan wawasan (Pro)\n' +
          '• **ℹ️ Informasi** - Versi, status, perintah\n\n' +
          '💡 Gunakan `/commands` untuk daftar lengkap!'
      },
      features: {
        emoji: '✨',
        title: 'Fitur Utama',
        list:
          '🌍 **Multi-Bahasa**: 9 bahasa tersedia\n' +
          '🎨 **Dapat Disesuaikan**: Embed, formulir & warna kustom\n' +
          '📊 **Analitik**: Statistik terperinci (Pro)\n' +
          '🎯 **Sistem Prioritas**: 3 tingkat dengan peran\n' +
          '📝 **Transkrip Langsung**: Format HTML & TXT\n' +
          '⏱️ **Sistem SLA**: Eskalasi otomatis (Pro)\n' +
          '🔔 **Notifikasi**: Dukungan DM & Email (Pro)\n' +
          '⭐ **Sistem Penilaian**: Penilaian 5 bintang'
      },
      premium: {
        emoji: '💎',
        title: 'Fitur Premium',
        info:
          '**🆓 Gratis**: 5 kategori, fitur dasar\n' +
          '**💎 Basic** (€2.99): 7 kategori, unggah file, avatar kustom\n' +
          '**👑 Pro** (€4.99): Tidak terbatas, analitik, SLA, tutup otomatis\n' +
          '**🤝 Partner**: Fitur Pro seumur hidup\n\n' +
          '➡️ [Dapatkan Premium](https://quantixtickets.theredstonee.de/premium)'
      },
      tips: {
        emoji: '💡',
        title: 'Tips Berguna',
        list:
          '• Gunakan `/dashboard` untuk konfigurasi web\n' +
          '• Peran tim dapat dikonfigurasi secara hierarkis\n' +
          '• Transkrip dibuat otomatis saat menutup tiket\n' +
          '• Notifikasi DM dapat dikonfigurasi per pengguna\n' +
          '• Bot mendukung beberapa sistem tiket per server (Pro)'
      },
      currentPlan: 'Paket Anda Saat Ini',
      footer: 'Butuh bantuan? Bergabunglah dengan server dukungan kami!',
      buttons: {
        dashboard: 'Panel',
        premium: 'Premium',
        support: 'Server Dukungan',
        commands: 'Semua Perintah'
      }
    }
  };

  // Return requested language or fallback to English
  return translations[lang] || translations['en'];
}
