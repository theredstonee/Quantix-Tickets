const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'configs');

function readCfg(guildId) {
  try {
    const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return {};
  }
}

const languageMapping = {
  de: 'DE',
  en: 'EN',
  es: 'ES',
  pt: 'PT',
  ru: 'RU',
  ja: 'JA',
  he: 'HE', // DeepL unterstützt kein Hebräisch
  ar: 'AR',  // DeepL unterstützt kein Arabisch
  id: 'ID'   // DeepL unterstützt kein Indonesisch
};

async function translateText(text, targetLang, sourceLang = null) {
  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) {
    console.warn('⚠️ DEEPL_API_KEY not configured');
    return null;
  }

  try {
    const deeplTargetLang = languageMapping[targetLang] || 'EN';

    if (!['HE', 'AR', 'ID'].includes(deeplTargetLang)) {
      const params = {
        auth_key: apiKey,
        text: text,
        target_lang: deeplTargetLang
      };

      if (sourceLang && languageMapping[sourceLang]) {
        params.source_lang = languageMapping[sourceLang];
      }

      const response = await axios.post('https://api-free.deepl.com/v2/translate', null, {
        params: params,
        timeout: 5000
      });

      if (response.data && response.data.translations && response.data.translations.length > 0) {
        return response.data.translations[0].text;
      }
    }

    return null;
  } catch (err) {
    console.error('DeepL Translation Error:', err.message);
    return null;
  }
}

async function detectLanguage(text) {
  const apiKey = process.env.DEEPL_API_KEY;

  if (!apiKey) return null;

  try {
    const response = await axios.post('https://api-free.deepl.com/v2/translate', null, {
      params: {
        auth_key: apiKey,
        text: text,
        target_lang: 'EN'
      },
      timeout: 5000
    });

    if (response.data && response.data.translations && response.data.translations.length > 0) {
      const detectedLang = response.data.translations[0].detected_source_language;

      const reversedMapping = {
        'DE': 'de',
        'EN': 'en',
        'ES': 'es',
        'PT': 'pt',
        'RU': 'ru',
        'JA': 'ja'
      };

      return reversedMapping[detectedLang] || 'en';
    }

    return null;
  } catch (err) {
    console.error('DeepL Language Detection Error:', err.message);
    return null;
  }
}

function isAutoTranslateEnabled(guildId) {
  const cfg = readCfg(guildId);
  return cfg.autoTranslate && cfg.autoTranslate.enabled === true;
}

function getAutoTranslateConfig(guildId) {
  const cfg = readCfg(guildId);
  return {
    enabled: cfg.autoTranslate?.enabled || false,
    teamLanguage: cfg.autoTranslate?.teamLanguage || 'de',
    showOriginal: cfg.autoTranslate?.showOriginal || false,
    translateUserMessages: cfg.autoTranslate?.translateUserMessages !== false,
    translateTeamMessages: cfg.autoTranslate?.translateTeamMessages !== false
  };
}

async function translateTicketMessage(message, guildId, isTeamMember) {
  const config = getAutoTranslateConfig(guildId);

  if (!config.enabled) return null;

  if (isTeamMember && !config.translateTeamMessages) return null;
  if (!isTeamMember && !config.translateUserMessages) return null;

  try {
    const detectedLang = await detectLanguage(message.content);

    if (!detectedLang) return null;

    let targetLang;
    if (isTeamMember) {
      targetLang = detectedLang;
    } else {
      targetLang = config.teamLanguage;
    }

    if (detectedLang === targetLang) {
      return null;
    }

    const translatedText = await translateText(message.content, targetLang, detectedLang);

    if (!translatedText) return null;

    return {
      originalText: message.content,
      translatedText: translatedText,
      sourceLang: detectedLang,
      targetLang: targetLang,
      showOriginal: config.showOriginal
    };

  } catch (err) {
    console.error('Auto-Translate Error:', err);
    return null;
  }
}

async function translateFormField(text, targetLang, sourceLang = null) {
  try {
    return await translateText(text, targetLang, sourceLang);
  } catch (err) {
    console.error('Form Field Translation Error:', err);
    return null;
  }
}

module.exports = {
  translateText,
  detectLanguage,
  isAutoTranslateEnabled,
  getAutoTranslateConfig,
  translateTicketMessage,
  translateFormField
};
