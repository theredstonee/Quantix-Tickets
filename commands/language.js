const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlanguage')
    .setDescription('Set server language / Server-Sprache festlegen / הגדר שפת שרת')
    .setDescriptionLocalizations({
      de: 'Server-Sprache festlegen',
      'en-US': 'Set server language'
    })
    .addStringOption(option =>
      option.setName('language')
        .setDescription('Select language / Sprache auswählen / בחר שפה')
        .setDescriptionLocalizations({
          de: 'Sprache auswählen',
          'en-US': 'Select language'
        })
        .setRequired(true)
        .addChoices(
          { name: '🇩🇪 Deutsch', value: 'de' },
          { name: '🇬🇧 English', value: 'en' },
          { name: '🇮🇱 עברית (Hebrew)', value: 'he' }
        ))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
};
