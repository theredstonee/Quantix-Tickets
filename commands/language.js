const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlanguage')
    .setDescription('Set server language / Server-Sprache festlegen / הגדר שפת שרת / サーバー言語を設定 / Установить язык / Definir idioma')
    .setDescriptionLocalizations({
      de: 'Server-Sprache festlegen',
      'en-US': 'Set server language'
    })
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Select language / Sprache auswählen / בחר שפה / 言語を選択 / Выбрать язык / Selecionar idioma')
        .setDescriptionLocalizations({
          de: 'Sprache auswählen',
          'en-US': 'Select language'
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
