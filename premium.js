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
        dmNotifications: false,
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
      dmNotifications: false,
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
      dmNotifications: false,
      unlimitedCategories: false,
      maxCategories: 7
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
      dmNotifications: true,
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
  // Special case: Developer/Owner Server hat immer Premium Pro
  if (guildId === '1291125037876904026') {
    return true;
  }

  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return false;
  }

  // Lifetime Premium läuft nie ab
  if (cfg.premium.lifetime === true) {
    return true;
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
  // Special case: Developer/Owner Server hat alle Pro-Features
  if (guildId === '1291125037876904026') {
    return PREMIUM_TIERS.pro.features[feature] || false;
  }

  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return PREMIUM_TIERS.none.features[feature] || false;
  }

  // Lifetime Premium läuft nie ab
  if (cfg.premium.lifetime === true) {
    return cfg.premium.features?.[feature] || false;
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
  // Special case: Developer/Owner Server hat immer Pro
  if (guildId === '1291125037876904026') {
    return 'pro';
  }

  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return 'none';
  }

  // Lifetime Premium läuft nie ab
  if (cfg.premium.lifetime === true) {
    return cfg.premium.tier;
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
  // Special case: Developer/Owner Server hat volle Pro-Infos
  if (guildId === '1291125037876904026') {
    return {
      tier: 'pro',
      tierName: 'Premium Pro (Lifetime)',
      price: PREMIUM_TIERS.pro.price,
      features: PREMIUM_TIERS.pro.features,
      expiresAt: null, // Läuft nie ab
      isActive: true,
      subscriptionId: 'lifetime_owner_server'
    };
  }

  const tier = getPremiumTier(guildId);
  const cfg = readCfg(guildId);

  // Check if Lifetime Premium
  const isLifetime = cfg.premium?.lifetime === true;
  const tierName = isLifetime
    ? `${PREMIUM_TIERS[tier].name} (Lifetime)`
    : PREMIUM_TIERS[tier].name;

  return {
    tier: tier,
    tierName: tierName,
    price: PREMIUM_TIERS[tier].price,
    features: cfg.premium?.features || PREMIUM_TIERS[tier].features,
    expiresAt: cfg.premium?.expiresAt || null,
    isActive: tier !== 'none',
    isLifetime: isLifetime,
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
  // Special case: Developer/Owner Server hat immer unbegrenzte Kategorien
  if (guildId === '1291125037876904026') {
    return 999;
  }

  const cfg = readCfg(guildId);
  const tier = getPremiumTier(guildId);

  return cfg.premium?.features?.maxCategories || PREMIUM_TIERS[tier].features.maxCategories;
}

/**
 * Downgrade von Pro zu Basic
 * @param {string} guildId - Discord Guild ID
 * @returns {boolean}
 */
function downgradePremium(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier !== 'pro') {
    console.log(`⚠️ Downgrade nicht möglich: Guild ${guildId} hat kein Pro`);
    return false;
  }

  // Behalte Subscription ID und Customer ID für Billing
  cfg.premium.tier = 'basic';
  cfg.premium.features = { ...PREMIUM_TIERS.basic.features };

  saveCfg(guildId, cfg);
  console.log(`⬇️ Premium downgraded zu Basic für Guild ${guildId}`);

  return true;
}

/**
 * Kündigt Premium (für manuelle Kündigung)
 * @param {string} guildId - Discord Guild ID
 * @returns {object} Subscription Info für Stripe-Kündigung
 */
function cancelPremium(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return { success: false, message: 'Kein aktives Premium' };
  }

  const subscriptionId = cfg.premium.subscriptionId;
  const customerId = cfg.premium.customerId;

  // Setze auf Free
  cfg.premium = {
    tier: 'none',
    expiresAt: null,
    subscriptionId: null,
    customerId: null,
    features: { ...PREMIUM_TIERS.none.features }
  };

  saveCfg(guildId, cfg);
  console.log(`🚫 Premium gekündigt für Guild ${guildId}`);

  return {
    success: true,
    subscriptionId: subscriptionId,
    customerId: customerId
  };
}

/**
 * Aktiviert Lifetime Premium für einen Server (Owner-only)
 * @param {string} guildId - Discord Guild ID
 * @param {string} tier - 'basic' oder 'pro'
 * @returns {object}
 */
function activateLifetimePremium(guildId, tier) {
  const cfg = readCfg(guildId);

  cfg.premium = {
    tier: tier,
    expiresAt: null, // Null = Lifetime
    subscriptionId: 'lifetime_' + guildId,
    customerId: 'lifetime_customer_' + guildId,
    lifetime: true,
    features: { ...PREMIUM_TIERS[tier].features }
  };

  saveCfg(guildId, cfg);
  console.log(`♾️ Lifetime Premium ${tier} aktiviert für Guild ${guildId}`);

  return {
    success: true,
    tier: tier,
    guildId: guildId
  };
}

/**
 * Entfernt Lifetime Premium von einem Server (Owner-only)
 * @param {string} guildId - Discord Guild ID
 * @returns {object}
 */
function removeLifetimePremium(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || !cfg.premium.lifetime) {
    return {
      success: false,
      message: 'Dieser Server hat kein Lifetime Premium'
    };
  }

  cfg.premium = {
    tier: 'none',
    expiresAt: null,
    subscriptionId: null,
    customerId: null,
    lifetime: false,
    features: { ...PREMIUM_TIERS.none.features }
  };

  saveCfg(guildId, cfg);
  console.log(`♾️ Lifetime Premium entfernt für Guild ${guildId}`);

  return {
    success: true,
    guildId: guildId
  };
}

/**
 * Listet alle Server mit Lifetime Premium auf
 * @returns {array}
 */
function listLifetimePremiumServers() {
  const lifetimeServers = [];

  if (!fs.existsSync(CONFIG_DIR)) {
    return lifetimeServers;
  }

  const files = fs.readdirSync(CONFIG_DIR);

  for (const file of files) {
    if (!file.endsWith('.json') || file.includes('_tickets')) continue;

    const guildId = file.replace('.json', '');
    const cfg = readCfg(guildId);

    if (cfg.premium && cfg.premium.lifetime === true) {
      lifetimeServers.push({
        guildId: guildId,
        tier: cfg.premium.tier,
        activatedAt: cfg.premium.activatedAt || 'Unknown'
      });
    }
  }

  return lifetimeServers;
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
  downgradePremium,
  cancelPremium,
  activateLifetimePremium,
  removeLifetimePremium,
  listLifetimePremiumServers,
  readCfg,
  saveCfg
};
