const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlanguage')
    .setDescription('Set the server language for the bot')
    .setDescriptionLocalizations({
      de: 'Server-Sprache festlegen',
      'en-US': 'Set the server language for the bot',
      he: 'הגדר שפת שרת',
      ja: 'サーバー言語を設定',
      ru: 'Установить язык сервера',
      pt: 'Definir idioma do servidor'
    })
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Choose the language for bot responses')
        .setDescriptionLocalizations({
          de: 'Sprache auswählen',
          'en-US': 'Choose the language for bot responses',
          he: 'בחר שפה',
          ja: '言語を選択',
          ru: 'Выбрать язык',
          pt: 'Selecionar idioma'
        })
        .setRequired(true)
        .addChoices(
          { name: '🇩🇪 Deutsch', value: 'de' },
          { name: '🇬🇧 English', value: 'en' },
          { name: '🇮🇱 עברית (Hebrew)', value: 'he' },
          { name: '🇯🇵 日本語 (Japanese)', value: 'ja' },
          { name: '🇷🇺 Русский (Russian)', value: 'ru' },
          { name: '🇵🇹 Português (Portuguese)', value: 'pt' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
};
