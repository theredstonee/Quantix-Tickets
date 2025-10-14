const fs = require('fs');
const path = require('path');

const translations = {
  de: require('./translations/de.json'),
  en: require('./translations/en.json'),
  he: require('./translations/he.json'),
  ja: require('./translations/ja.json'),
  ru: require('./translations/ru.json'),
  pt: require('./translations/pt.json'),
  es: require('./translations/es.json'),
  id: require('./translations/id.json'),
  zh: require('./translations/zh.json'),
  ar: require('./translations/ar.json')
};

const CONFIG_DIR = path.join(__dirname, 'configs');

function getGuildLanguage(guildId) {
  try {
    if (!guildId) return 'de';
    const configPath = path.join(CONFIG_DIR, `${guildId}.json`);

    if (!fs.existsSync(configPath)) return 'de';

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.language || 'de';
  } catch (error) {
    console.error('Error getting guild language:', error);
    return 'de';
  }
}

function setGuildLanguage(guildId, lang) {
  try {
    if (!guildId) return false;

    if (!['de', 'en', 'he', 'ja', 'ru', 'pt', 'es', 'id', 'zh', 'ar'].includes(lang)) {
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

function t(guildId, key, replacements = {}) {
  const lang = getGuildLanguage(guildId);
  const keys = key.split('.');
  let value = translations[lang];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      return key;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  let result = value;
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), replacement);
  }

  return result;
}

function getTranslations(lang = 'de') {
  return translations[lang] || translations.de;
}

function getLanguageName(lang) {
  const names = {
    de: 'Deutsch',
    en: 'English',
    he: 'עברית',
    ja: '日本語',
    ru: 'Русский',
    pt: 'Português',
    es: 'Español',
    id: 'Bahasa Indonesia',
    zh: '中文',
    ar: 'العربية'
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
