const fs = require('fs');
const path = require('path');

const translations = {
  de: require('./translations/de.json'),
  en: require('./translations/en.json'),
  he: require('./translations/he.json')
};

const CONFIG_DIR = path.join(__dirname, 'configs');

/**
 * Get guild's language from config
 * @param {string} guildId - Discord guild ID
 * @returns {string} Language code (de, en, or he)
 */
function getGuildLanguage(guildId) {
  try {
    if (!guildId) return 'de'; // Default to German
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);

    if (!fs.existsSync(configPath)) return 'de';

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.language || 'de';
  } catch (error) {
    console.error('Error getting guild language:', error);
    return 'de';
  }
}

/**
 * Set guild's language in config
 * @param {string} guildId - Discord guild ID
 * @param {string} lang - Language code (de, en, or he)
 */
function setGuildLanguage(guildId, lang) {
  try {
    if (!guildId) return false;

    // Validate language
    if (!['de', 'en', 'he'].includes(lang)) {
      lang = 'de';
    }

    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);
    let config = {};

    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {}

    config.language = lang;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error setting guild language:', error);
    return false;
  }
}

/**
 * Get translated text for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} key - Translation key (e.g., 'ticket.created')
 * @param {object} replacements - Object with placeholder replacements
 * @returns {string} Translated text
 */
function t(guildId, key, replacements = {}) {
  const lang = getGuildLanguage(guildId);
  const keys = key.split('.');
  let value = translations[lang];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      return key; // Return key if translation not found
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Replace placeholders
  let result = value;
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), replacement);
  }

  return result;
}

/**
 * Get all translations for a language
 * @param {string} lang - Language code
 * @returns {object} Translation object
 */
function getTranslations(lang = 'de') {
  return translations[lang] || translations.de;
}

/**
 * Get language name
 * @param {string} lang - Language code
 * @returns {string} Language name
 */
function getLanguageName(lang) {
  const names = {
    de: 'Deutsch',
    en: 'English',
    he: 'עברית'
  };
  return names[lang] || 'Deutsch';
}

module.exports = {
  getGuildLanguage,
  setGuildLanguage,
  t,
  getTranslations,
  getLanguageName
};
