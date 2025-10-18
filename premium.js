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
        maxCategories: 5
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
      maxCategories: 5
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
  },
  beta: {
    name: 'Betatester',
    price: 0,
    priceId: null,
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

  // Betatester haben Pro-Level Access
  if (cfg.premium.tier === 'beta') {
    // Prüfe ob abgelaufen
    if (cfg.premium.expiresAt && new Date(cfg.premium.expiresAt) < new Date()) {
      return false;
    }
    return true; // Beta = Pro-Level
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

  // Betatester haben Pro-Features
  if (cfg.premium.tier === 'beta') {
    // Prüfe ob abgelaufen
    if (cfg.premium.expiresAt && new Date(cfg.premium.expiresAt) < new Date()) {
      return PREMIUM_TIERS.none.features[feature] || false;
    }
    return PREMIUM_TIERS.beta.features[feature] || false;
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
 * @returns {string} 'none', 'basic', 'pro' oder 'beta'
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

  // Check if Trial
  const isTrial = cfg.premium?.isTrial === true;
  const trialInfo = isTrial ? getTrialInfo(guildId) : null;

  let tierName = PREMIUM_TIERS[tier].name;
  if (isLifetime) {
    tierName = `${tierName} (Lifetime)`;
  } else if (isTrial && trialInfo) {
    tierName = `${tierName} (Trial - ${trialInfo.daysRemaining} ${trialInfo.daysRemaining === 1 ? 'Tag' : 'Tage'})`;
  }

  return {
    tier: tier,
    tierName: tierName,
    price: PREMIUM_TIERS[tier].price,
    features: cfg.premium?.features || PREMIUM_TIERS[tier].features,
    expiresAt: cfg.premium?.expiresAt || null,
    isActive: tier !== 'none',
    isLifetime: isLifetime,
    isTrial: isTrial,
    trialInfo: trialInfo,
    subscriptionId: cfg.premium?.subscriptionId || null
  };
}

/**
 * Aktiviert Premium für einen Server
 * @param {string} guildId - Discord Guild ID
 * @param {string} tier - 'basic' oder 'pro'
 * @param {string} subscriptionId - Stripe Subscription ID
 * @param {string} customerId - Stripe Customer ID
 * @param {string} buyerId - Discord User ID des Käufers (optional)
 * @param {string} billingPeriod - 'monthly' oder 'yearly' (optional, default: 'monthly')
 */
function activatePremium(guildId, tier, subscriptionId, customerId, buyerId = null, billingPeriod = 'monthly') {
  const cfg = readCfg(guildId);

  const expiresAt = new Date();
  if (billingPeriod === 'yearly') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 12 Monate
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 Monat
  }

  cfg.premium = {
    tier: tier,
    expiresAt: expiresAt.toISOString(),
    subscriptionId: subscriptionId,
    customerId: customerId,
    buyerId: buyerId,
    billingPeriod: billingPeriod,
    features: { ...PREMIUM_TIERS[tier].features }
  };

  saveCfg(guildId, cfg);
  console.log(`✅ Premium ${tier} (${billingPeriod}) aktiviert für Guild ${guildId} bis ${expiresAt.toLocaleDateString()}`);

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

  const billingPeriod = cfg.premium.billingPeriod || 'monthly';
  const expiresAt = new Date(cfg.premium.expiresAt || new Date());

  if (billingPeriod === 'yearly') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Verlängere um 12 Monate
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1); // Verlängere um 1 Monat
  }

  cfg.premium.expiresAt = expiresAt.toISOString();
  saveCfg(guildId, cfg);

  console.log(`🔄 Premium (${billingPeriod}) verlängert für Guild ${guildId} bis ${expiresAt.toLocaleDateString()}`);
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

  // Betatester haben unbegrenzte Kategorien
  if (tier === 'beta') {
    return 999;
  }

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
 * @param {string} buyerId - Discord User ID des Käufers (optional)
 * @returns {object}
 */
function activateLifetimePremium(guildId, tier, buyerId = null) {
  const cfg = readCfg(guildId);

  cfg.premium = {
    tier: tier,
    expiresAt: null, // Null = Lifetime
    subscriptionId: 'lifetime_' + guildId,
    customerId: 'lifetime_customer_' + guildId,
    lifetime: true,
    buyerId: buyerId,
    features: { ...PREMIUM_TIERS[tier].features }
  };

  saveCfg(guildId, cfg);
  console.log(`♾️ Lifetime Premium ${tier} aktiviert für Guild ${guildId}`);

  return {
    success: true,
    tier: tier,
    guildId: guildId,
    buyerId: buyerId
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

/**
 * Vergibt Premium-Rolle auf dem Theredstonee Projects Server
 * @param {Client} client - Discord.js Client
 * @param {string} buyerId - User ID des Käufers
 * @returns {Promise<object>} Success/Error object
 */
async function assignPremiumRole(client, buyerId) {
  const THEREDSTONEE_GUILD_ID = '1291125037876904026';
  const PREMIUM_ROLE_ID = '1428069033269268551';

  try {
    // Fetch Theredstonee Projects Server
    const guild = await client.guilds.fetch(THEREDSTONEE_GUILD_ID);

    // Fetch Member
    const member = await guild.members.fetch(buyerId);

    // Check if member already has role
    if (member.roles.cache.has(PREMIUM_ROLE_ID)) {
      console.log(`✅ User ${buyerId} hat bereits die Premium-Rolle`);
      return {
        success: true,
        alreadyHad: true,
        message: 'User hatte bereits die Premium-Rolle'
      };
    }

    // Assign Role
    await member.roles.add(PREMIUM_ROLE_ID);
    console.log(`✅ Premium-Rolle vergeben an ${member.user.tag} (${buyerId})`);

    return {
      success: true,
      alreadyHad: false,
      message: `Premium-Rolle erfolgreich vergeben an ${member.user.tag}`
    };

  } catch (err) {
    console.error(`❌ Fehler beim Vergeben der Premium-Rolle an ${buyerId}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Aktiviert Betatester-Status für einen Server (Owner-only)
 * @param {string} guildId - Discord Guild ID
 * @param {number} days - Anzahl Tage (z.B. 30, 60, 90)
 * @param {string} testerId - Discord User ID des Betatester (optional)
 * @returns {object}
 */
function activateBetatester(guildId, days, testerId = null) {
  const cfg = readCfg(guildId);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  cfg.premium = {
    tier: 'beta',
    expiresAt: expiresAt.toISOString(),
    subscriptionId: 'betatester_' + guildId,
    customerId: 'betatester_customer_' + guildId,
    testerId: testerId,
    betatester: true,
    features: { ...PREMIUM_TIERS.beta.features }
  };

  saveCfg(guildId, cfg);
  console.log(`🧪 Betatester aktiviert für Guild ${guildId} bis ${expiresAt.toLocaleDateString()}`);

  return {
    success: true,
    tier: 'beta',
    guildId: guildId,
    testerId: testerId,
    expiresAt: expiresAt.toISOString()
  };
}

/**
 * Deaktiviert Betatester-Status von einem Server (Owner-only)
 * @param {string} guildId - Discord Guild ID
 * @returns {object}
 */
function deactivateBetatester(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier !== 'beta') {
    return {
      success: false,
      message: 'Dieser Server ist kein Betatester'
    };
  }

  cfg.premium = {
    tier: 'none',
    expiresAt: null,
    subscriptionId: null,
    customerId: null,
    betatester: false,
    features: { ...PREMIUM_TIERS.none.features }
  };

  saveCfg(guildId, cfg);
  console.log(`🧪 Betatester deaktiviert für Guild ${guildId}`);

  return {
    success: true,
    guildId: guildId
  };
}

/**
 * Listet alle Betatester-Server auf
 * @returns {array}
 */
function listBetatesterServers() {
  const betatesterServers = [];

  if (!fs.existsSync(CONFIG_DIR)) {
    return betatesterServers;
  }

  const files = fs.readdirSync(CONFIG_DIR);

  for (const file of files) {
    if (!file.endsWith('.json') || file.includes('_tickets')) continue;

    const guildId = file.replace('.json', '');
    const cfg = readCfg(guildId);

    if (cfg.premium && cfg.premium.tier === 'beta') {
      betatesterServers.push({
        guildId: guildId,
        testerId: cfg.premium.testerId,
        expiresAt: cfg.premium.expiresAt
      });
    }
  }

  return betatesterServers;
}

/**
 * Aktiviert automatische 14-Tage Trial (Premium Pro) für neue Server
 * @param {string} guildId - Discord Guild ID
 * @returns {object}
 */
function activateAutoTrial(guildId) {
  const cfg = readCfg(guildId);

  // Prüfe ob Server bereits Premium oder Trial hatte
  if (cfg.premium && (cfg.premium.tier !== 'none' || cfg.premium.hadTrial === true)) {
    return {
      success: false,
      message: 'Server hatte bereits Premium oder Trial',
      alreadyHadTrial: cfg.premium.hadTrial === true
    };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14); // 14 Tage Trial

  cfg.premium = {
    tier: 'pro',
    expiresAt: expiresAt.toISOString(),
    subscriptionId: 'trial_' + guildId,
    customerId: 'trial_customer_' + guildId,
    isTrial: true,
    hadTrial: true, // Markiere dass Server Trial hatte
    trialStartedAt: new Date().toISOString(),
    features: { ...PREMIUM_TIERS.pro.features }
  };

  saveCfg(guildId, cfg);
  console.log(`🎁 Auto-Trial (14 Tage Pro) aktiviert für Guild ${guildId} bis ${expiresAt.toLocaleDateString()}`);

  return {
    success: true,
    tier: 'pro',
    guildId: guildId,
    isTrial: true,
    expiresAt: expiresAt.toISOString(),
    daysRemaining: 14
  };
}

/**
 * Prüft ob ein Server noch im Trial ist
 * @param {string} guildId - Discord Guild ID
 * @returns {boolean}
 */
function isTrialActive(guildId) {
  const cfg = readCfg(guildId);
  if (!cfg.premium || !cfg.premium.isTrial) return false;

  const tier = getPremiumTier(guildId);
  return tier === 'pro' && cfg.premium.isTrial === true;
}

/**
 * Gibt Trial-Informationen zurück
 * @param {string} guildId - Discord Guild ID
 * @returns {object|null}
 */
function getTrialInfo(guildId) {
  const cfg = readCfg(guildId);
  if (!cfg.premium || !cfg.premium.isTrial) return null;

  const expiresAt = new Date(cfg.premium.expiresAt);
  const now = new Date();
  const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

  return {
    isActive: isTrialActive(guildId),
    startedAt: cfg.premium.trialStartedAt,
    expiresAt: cfg.premium.expiresAt,
    daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
    isExpiringSoon: daysRemaining <= 3 && daysRemaining > 0,
    warningsSent: cfg.premium.trialWarningsSent || []
  };
}

/**
 * Get all servers with expiring trials (3 days or less)
 * @returns {Array<{guildId: string, daysRemaining: number}>}
 */
function getExpiringTrials() {
  const configsPath = './configs';
  if (!fs.existsSync(configsPath)) return [];

  const expiringTrials = [];
  const files = fs.readdirSync(configsPath);

  for (const file of files) {
    // Only process main config files (not _tickets.json or _counter.json)
    if (!file.endsWith('.json') || file.includes('_')) continue;

    const guildId = file.replace('.json', '');
    const trialInfo = getTrialInfo(guildId);

    if (trialInfo && trialInfo.isActive && trialInfo.isExpiringSoon) {
      expiringTrials.push({
        guildId,
        daysRemaining: trialInfo.daysRemaining,
        warningsSent: trialInfo.warningsSent
      });
    }
  }

  return expiringTrials;
}

/**
 * Mark that a trial warning was sent
 * @param {string} guildId - Guild ID
 * @param {number} daysRemaining - Days remaining when warning was sent
 */
function markTrialWarningSent(guildId, daysRemaining) {
  const cfg = readCfg(guildId);
  if (!cfg.premium || !cfg.premium.isTrial) return;

  if (!cfg.premium.trialWarningsSent) {
    cfg.premium.trialWarningsSent = [];
  }

  // Add warning timestamp and days remaining
  cfg.premium.trialWarningsSent.push({
    sentAt: new Date().toISOString(),
    daysRemaining
  });

  saveCfg(guildId, cfg);
}

/**
 * Check if warning was already sent for this day count
 * @param {string} guildId - Guild ID
 * @param {number} daysRemaining - Days remaining
 * @returns {boolean}
 */
function wasWarningSent(guildId, daysRemaining) {
  const cfg = readCfg(guildId);
  if (!cfg.premium || !cfg.premium.trialWarningsSent) return false;

  return cfg.premium.trialWarningsSent.some(w => w.daysRemaining === daysRemaining);
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
  assignPremiumRole,
  activateBetatester,
  deactivateBetatester,
  listBetatesterServers,
  activateAutoTrial,
  isTrialActive,
  getTrialInfo,
  getExpiringTrials,
  markTrialWarningSent,
  wasWarningSent,
  readCfg,
  saveCfg
};
