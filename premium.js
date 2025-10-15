const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, 'configs');

function readCfg(guildId) {
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  if (!fs.existsSync(cfgPath)) {
    return getDefaultConfig();
  }
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return getDefaultConfig();
  }
}

function saveCfg(guildId, cfg) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  const cfgPath = path.join(CONFIG_DIR, `${guildId}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
}

function getDefaultConfig() {
  return {
    premium: {
      tier: 'none',
      expiresAt: null,
      subscriptionId: null,
      customerId: null,
      features: {
        noAds: false,
        customAvatar: false,
        statistics: false,
        prioritySupport: false,
        autoClose: false,
        emailNotifications: false,
        unlimitedCategories: false,
        maxCategories: 3
      }
    }
  };
}

// Premium Tiers Definition
const PREMIUM_TIERS = {
  none: {
    name: 'Free',
    price: 0,
    priceId: null,
    features: {
      noAds: false,
      customAvatar: false,
      statistics: false,
      prioritySupport: false,
      autoClose: false,
      emailNotifications: false,
      unlimitedCategories: false,
      maxCategories: 3
    }
  },
  basic: {
    name: 'Premium Basic',
    price: 2.99,
    priceId: 'price_basic_monthly', // Ersetze mit echter Stripe Price ID
    features: {
      noAds: true,
      customAvatar: true,
      statistics: true,
      prioritySupport: true,
      autoClose: false,
      emailNotifications: false,
      unlimitedCategories: false,
      maxCategories: 5
    }
  },
  pro: {
    name: 'Premium Pro',
    price: 4.99,
    priceId: 'price_pro_monthly', // Ersetze mit echter Stripe Price ID
    features: {
      noAds: true,
      customAvatar: true,
      statistics: true,
      prioritySupport: true,
      autoClose: true,
      emailNotifications: true,
      unlimitedCategories: true,
      maxCategories: 999
    }
  }
};

/**
 * Prüft ob ein Server Premium hat
 * @param {string} guildId - Discord Guild ID
 * @param {string} requiredTier - Minimum benötigtes Tier ('basic' oder 'pro')
 * @returns {boolean}
 */
function isPremium(guildId, requiredTier = 'basic') {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return false;
  }

  // Prüfe ob abgelaufen
  if (cfg.premium.expiresAt && new Date(cfg.premium.expiresAt) < new Date()) {
    return false;
  }

  const tiers = ['none', 'basic', 'pro'];
  const requiredIndex = tiers.indexOf(requiredTier);
  const currentIndex = tiers.indexOf(cfg.premium.tier);

  return currentIndex >= requiredIndex;
}

/**
 * Prüft ob ein Server ein bestimmtes Feature hat
 * @param {string} guildId - Discord Guild ID
 * @param {string} feature - Feature-Name
 * @returns {boolean}
 */
function hasFeature(guildId, feature) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return PREMIUM_TIERS.none.features[feature] || false;
  }

  // Prüfe ob abgelaufen
  if (cfg.premium.expiresAt && new Date(cfg.premium.expiresAt) < new Date()) {
    return PREMIUM_TIERS.none.features[feature] || false;
  }

  return cfg.premium.features?.[feature] || false;
}

/**
 * Gibt das Premium-Tier eines Servers zurück
 * @param {string} guildId - Discord Guild ID
 * @returns {string} 'none', 'basic' oder 'pro'
 */
function getPremiumTier(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return 'none';
  }

  // Prüfe ob abgelaufen
  if (cfg.premium.expiresAt && new Date(cfg.premium.expiresAt) < new Date()) {
    return 'none';
  }

  return cfg.premium.tier;
}

/**
 * Gibt Premium-Informationen zurück
 * @param {string} guildId - Discord Guild ID
 * @returns {object}
 */
function getPremiumInfo(guildId) {
  const tier = getPremiumTier(guildId);
  const cfg = readCfg(guildId);

  return {
    tier: tier,
    tierName: PREMIUM_TIERS[tier].name,
    price: PREMIUM_TIERS[tier].price,
    features: cfg.premium?.features || PREMIUM_TIERS.none.features,
    expiresAt: cfg.premium?.expiresAt || null,
    isActive: tier !== 'none',
    subscriptionId: cfg.premium?.subscriptionId || null
  };
}

/**
 * Aktiviert Premium für einen Server
 * @param {string} guildId - Discord Guild ID
 * @param {string} tier - 'basic' oder 'pro'
 * @param {string} subscriptionId - Stripe Subscription ID
 * @param {string} customerId - Stripe Customer ID
 */
function activatePremium(guildId, tier, subscriptionId, customerId) {
  const cfg = readCfg(guildId);

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1); // 30 Tage

  cfg.premium = {
    tier: tier,
    expiresAt: expiresAt.toISOString(),
    subscriptionId: subscriptionId,
    customerId: customerId,
    features: { ...PREMIUM_TIERS[tier].features }
  };

  saveCfg(guildId, cfg);
  console.log(`✅ Premium ${tier} aktiviert für Guild ${guildId} bis ${expiresAt.toLocaleDateString()}`);

  return cfg.premium;
}

/**
 * Deaktiviert Premium für einen Server
 * @param {string} guildId - Discord Guild ID
 */
function deactivatePremium(guildId) {
  const cfg = readCfg(guildId);

  cfg.premium = {
    tier: 'none',
    expiresAt: null,
    subscriptionId: null,
    customerId: null,
    features: { ...PREMIUM_TIERS.none.features }
  };

  saveCfg(guildId, cfg);
  console.log(`❌ Premium deaktiviert für Guild ${guildId}`);
}

/**
 * Verlängert Premium für einen Server
 * @param {string} guildId - Discord Guild ID
 */
function renewPremium(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return false;
  }

  const expiresAt = new Date(cfg.premium.expiresAt || new Date());
  expiresAt.setMonth(expiresAt.getMonth() + 1); // Verlängere um 1 Monat

  cfg.premium.expiresAt = expiresAt.toISOString();
  saveCfg(guildId, cfg);

  console.log(`🔄 Premium verlängert für Guild ${guildId} bis ${expiresAt.toLocaleDateString()}`);
  return true;
}

/**
 * Gibt maximale Anzahl an Kategorien zurück
 * @param {string} guildId - Discord Guild ID
 * @returns {number}
 */
function getMaxCategories(guildId) {
  const cfg = readCfg(guildId);
  const tier = getPremiumTier(guildId);

  return cfg.premium?.features?.maxCategories || PREMIUM_TIERS[tier].features.maxCategories;
}

module.exports = {
  PREMIUM_TIERS,
  isPremium,
  hasFeature,
  getPremiumTier,
  getPremiumInfo,
  activatePremium,
  deactivatePremium,
  renewPremium,
  getMaxCategories,
  readCfg,
  saveCfg
};
