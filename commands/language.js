const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlanguage')
    .setDescription('Set the server language for the bot')
    .setDescriptionLocalizations({
      de: 'Server-Sprache festlegen',
      'en-US': 'Set the server language for the bot',
      ja: 'サーバー言語を設定',
      ru: 'Установить язык сервера',
      'pt-BR': 'Definir idioma do servidor',
      'es-ES': 'Establecer el idioma del servidor',
      id: 'Atur bahasa server'
    })
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Choose the language for bot responses')
        .setDescriptionLocalizations({
          de: 'Sprache auswählen',
          'en-US': 'Choose the language for bot responses',
          ja: '言語を選択',
          ru: 'Выбрать язык',
          'pt-BR': 'Selecionar idioma',
          'es-ES': 'Elegir el idioma',
          id: 'Pilih bahasa'
        })
        .setRequired(true)
        .addChoices(
          { name: '🇩🇪 Deutsch', value: 'de' },
          { name: '🇬🇧 English', value: 'en' },
          { name: '🇮🇱 עברית (Hebrew)', value: 'he' },
          { name: '🇯🇵 日本語 (Japanese)', value: 'ja' },
          { name: '🇷🇺 Русский (Russian)', value: 'ru' },
          { name: '🇵🇹 Português (Portuguese)', value: 'pt' },
          { name: '🇪🇸 Español (Spanish)', value: 'es' },
          { name: '🇮🇩 Bahasa Indonesia (Indonesian)', value: 'id' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
};
