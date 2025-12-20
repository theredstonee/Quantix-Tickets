const { Translate } = require('@google-cloud/translate').v2;
const { readCfg } = require('./database');

const languageMapping = {
  de: 'de',
  en: 'en',
  es: 'es',
  pt: 'pt',
  ru: 'ru',
  ja: 'ja',
  he: 'he',
  ar: 'ar',
  id: 'id'
};

let translateClient = null;

function getTranslateClient() {
  if (translateClient) return translateClient;

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) {
    console.warn('⚠️ GOOGLE_TRANSLATE_API_KEY not configured');
    return null;
  }

  try {
    translateClient = new Translate({ key: apiKey });
    return translateClient;
  } catch (err) {
    console.error('Google Translate Client Error:', err.message);
    return null;
  }
}

async function translateText(text, targetLang, sourceLang = null) {
  const client = getTranslateClient();

  if (!client) {
    console.warn('⚠️ Google Translate API not configured');
    return null;
  }

  try {
    const googleTargetLang = languageMapping[targetLang] || 'en';

    const options = {
      to: googleTargetLang
    };

    if (sourceLang && languageMapping[sourceLang]) {
      options.from = languageMapping[sourceLang];
    }

    const [translation] = await client.translate(text, options);
    return translation;

  } catch (err) {
    console.error('Google Translate Error:', err.message);
    return null;
  }
}

async function detectLanguage(text) {
  const client = getTranslateClient();

  if (!client) return null;

  try {
    const [detection] = await client.detect(text);

    const detectedLang = detection.language;

    return detectedLang || 'en';

  } catch (err) {
    console.error('Google Language Detection Error:', err.message);
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
