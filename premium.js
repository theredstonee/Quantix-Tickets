const { readCfg, writeCfg } = require('./database');

// Alias for backwards compatibility
const saveCfg = writeCfg;

function getDefaultConfig() {
  return {
    premium: {
      tier: 'none',
      expiresAt: null,
      subscriptionId: null,
      customerId: null,
      features: {
        // ALLE operativen Features sind 100% KOSTENLOS
        ratingSystem: true,
        statistics: true,
        customAvatar: true,
        fileUpload: true,
        autoAssignment: true,
        slaSystem: true,
        emailNotifications: true,
        dmNotifications: true,
        autoClose: true,
        customTags: true,
        templates: true,
        vipSystem: true,
        voiceSupport: true,
        multiDepartment: true,
        applicationSystem: true,
        multiTicketSystems: true,
        ticketBlacklist: true,
        unlimitedCategories: true,
        maxCategories: 999,
        advancedAnalytics: true,
        // NUR Premium: Whitelabel/Bot-Customization Features
        customBotToken: false,
        whiteLabel: false,
        customBotName: false,
        customBotAvatar: false,
        customBotBanner: false,
        customBotStatus: false
      }
    },
    whitelabel: {
      enabled: false,
      botName: '',
      botToken: '',
      botAvatar: '',
      botBanner: '',
      botStatus: {
        type: 'online', // online, idle, dnd, invisible
        text: ''
      },
      footerImage: ''
    }
  };
}

// Premium Tiers Definition
// NEUE STRUKTUR: ALLE Features sind FREE, NUR Whitelabel ist Premium
const PREMIUM_TIERS = {
  none: {
    name: 'Free',
    price: 0,
    priceId: null,
    features: {
      // ALLE operativen Features sind 100% KOSTENLOS für JEDEN
      ratingSystem: true,
      statistics: true,
      customAvatar: true,
      fileUpload: true,
      autoAssignment: true,
      slaSystem: true,
      emailNotifications: true,
      dmNotifications: true,
      autoClose: true,
      customTags: true,
      templates: true,
      vipSystem: true,
      voiceSupport: true,
      multiDepartment: true,
      applicationSystem: true,
      multiTicketSystems: true,
      ticketBlacklist: true,
      unlimitedCategories: true,
      maxCategories: 999,
      advancedAnalytics: true,
      // NUR Premium: Whitelabel/Bot-Customization
      customBotToken: false,
      whiteLabel: false,
      customBotName: false,
      customBotAvatar: false,
      customBotBanner: false,
      customBotStatus: false
    }
  },
  pro: {
    name: 'Premium',
    price: 9.99,
    priceId: 'price_pro_monthly', // Ersetze mit echter Stripe Price ID
    features: {
      // ALLE Free Features (= ALLES außer Whitelabel)
      ratingSystem: true,
      statistics: true,
      customAvatar: true,
      fileUpload: true,
      autoAssignment: true,
      slaSystem: true,
      emailNotifications: true,
      dmNotifications: true,
      autoClose: true,
      customTags: true,
      templates: true,
      vipSystem: true,
      voiceSupport: true,
      multiDepartment: true,
      applicationSystem: true,
      multiTicketSystems: true,
      ticketBlacklist: true,
      unlimitedCategories: true,
      maxCategories: 999,
      advancedAnalytics: true,
      // Premium-exklusive Features: NUR Whitelabel/Bot-Customization
      customBotToken: true,
      whiteLabel: true,
      customBotName: true,
      customBotAvatar: true,
      customBotBanner: true,
      customBotStatus: true
    }
  },
  beta: {
    name: 'Betatester',
    price: 0,
    priceId: null,
    features: {
      // ALLE Free Features
      ratingSystem: true,
      statistics: true,
      customAvatar: true,
      fileUpload: true,
      autoAssignment: true,
      slaSystem: true,
      emailNotifications: true,
      dmNotifications: true,
      autoClose: true,
      customTags: true,
      templates: true,
      vipSystem: true,
      voiceSupport: true,
      multiDepartment: true,
      applicationSystem: true,
      multiTicketSystems: true,
      ticketBlacklist: true,
      unlimitedCategories: true,
      maxCategories: 999,
      advancedAnalytics: true,
      // Betatester bekommen volle Whitelabel-Features
      customBotToken: true,
      whiteLabel: true,
      customBotName: true,
      customBotAvatar: true,
      customBotBanner: true,
      customBotStatus: true
    }
  }
};

/**
 * Prüft ob ein Server Premium hat
 * @param {string} guildId - Discord Guild ID
 * @param {string} requiredTier - Minimum benötigtes Tier ('pro') - Default 'pro'
 * @returns {boolean}
 */
function isPremium(guildId, requiredTier = 'pro') {
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

  // Partner haben KEIN Premium mehr - nur Free-Level
  if (cfg.premium.tier === 'partner') {
    return false;
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

  // Nur noch 'none' und 'pro' - kein 'basic' mehr
  const tiers = ['none', 'pro'];
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

  // Get current tier
  let tier = cfg.premium.tier;

  // Partner haben NUR Free-Features (kein Premium mehr)
  if (tier === 'partner') {
    return PREMIUM_TIERS.none.features[feature] || false;
  }

  // Prüfe ob abgelaufen (nicht für Lifetime)
  if (!cfg.premium.lifetime && cfg.premium.expiresAt && new Date(cfg.premium.expiresAt) < new Date()) {
    return PREMIUM_TIERS.none.features[feature] || false;
  }

  // Return features from PREMIUM_TIERS (nicht aus Config!)
  // Dies stellt sicher, dass neue Features automatisch verfügbar sind
  return PREMIUM_TIERS[tier]?.features[feature] || false;
}

/**
 * Gibt das Premium-Tier eines Servers zurück
 * @param {string} guildId - Discord Guild ID
 * @returns {string} 'none', 'pro', 'beta' oder 'partner'
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

  // Partner haben Pro-Level (lifetime)
  if (cfg.premium.tier === 'partner') {
    return 'partner';
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

  // Check if Partner
  const isPartner = cfg.premium?.partner === true || tier === 'partner';

  // Check if Lifetime Premium
  const isLifetime = cfg.premium?.lifetime === true;

  // Check if Trial
  const isTrial = cfg.premium?.isTrial === true;
  const trialInfo = isTrial ? getTrialInfo(guildId) : null;

  let tierName = tier === 'partner' ? 'Partner' : PREMIUM_TIERS[tier]?.name || 'Free';
  if (isPartner) {
    tierName = 'Partner';
  } else if (isLifetime) {
    tierName = `${tierName} (Lifetime)`;
  } else if (isTrial && trialInfo) {
    tierName = `${tierName} (Trial - ${trialInfo.daysRemaining} ${trialInfo.daysRemaining === 1 ? 'Tag' : 'Tage'})`;
  }

  return {
    tier: tier,
    tierName: tierName,
    price: tier === 'partner' ? 0 : (PREMIUM_TIERS[tier]?.price || 0),
    features: tier === 'partner' ? PREMIUM_TIERS.none.features : (PREMIUM_TIERS[tier]?.features || PREMIUM_TIERS.none.features),
    expiresAt: cfg.premium?.expiresAt || null,
    isActive: tier !== 'none' && tier !== 'partner', // Partner ist NICHT aktiv (kein Premium)
    isLifetime: isLifetime,
    isPartner: isPartner,
    isTrial: isTrial,
    trialInfo: trialInfo,
    subscriptionId: cfg.premium?.subscriptionId || null,
    willCancel: cfg.premium?.willCancel || false,
    cancelledAt: cfg.premium?.cancelledAt || null,
    partnerUserId: cfg.premium?.partnerUserId || null,
    partnerLink: cfg.premium?.partnerLink || null
  };
}

/**
 * Aktiviert Premium für einen Server
 * @param {string} guildId - Discord Guild ID
 * @param {string} tier - 'pro' (nur Pro verfügbar, da Basic entfernt wurde)
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

  const tier = getPremiumTier(guildId);

  // Betatester haben unbegrenzte Kategorien
  if (tier === 'beta') {
    return 999;
  }

  // Immer aktuelle maxCategories aus PREMIUM_TIERS verwenden
  return PREMIUM_TIERS[tier].features.maxCategories;
}

/**
 * Downgrade von Pro zu Free (None)
 * @param {string} guildId - Discord Guild ID
 * @returns {boolean}
 */
function downgradePremium(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier !== 'pro') {
    console.log(`⚠️ Downgrade nicht möglich: Guild ${guildId} hat kein Pro`);
    return false;
  }

  // Downgrade zu Free (none) - da Basic nicht mehr existiert
  cfg.premium.tier = 'none';
  cfg.premium.expiresAt = null;
  cfg.premium.subscriptionId = null;
  cfg.premium.customerId = null;
  cfg.premium.features = { ...PREMIUM_TIERS.none.features };

  saveCfg(guildId, cfg);
  console.log(`⬇️ Premium downgraded zu Free für Guild ${guildId}`);

  return true;
}

/**
 * Kündigt Premium (für manuelle Kündigung)
 * Abo läuft bis expiresAt weiter, dann automatisch downgrade
 * @param {string} guildId - Discord Guild ID
 * @returns {object} Subscription Info für Stripe-Kündigung
 */
function cancelPremium(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier === 'none') {
    return { success: false, message: 'Kein aktives Premium' };
  }

  // Lifetime Premium kann nicht gekündigt werden
  if (cfg.premium.lifetime === true) {
    return { success: false, message: 'Lifetime Premium kann nicht gekündigt werden' };
  }

  const subscriptionId = cfg.premium.subscriptionId;
  const customerId = cfg.premium.customerId;

  // Markiere als gekündigt, aber behalte Zugriff bis expiresAt
  cfg.premium.willCancel = true;
  cfg.premium.cancelledAt = new Date().toISOString();

  // NICHT sofort löschen - Premium läuft bis expiresAt weiter
  // expiresAt und tier bleiben erhalten!

  saveCfg(guildId, cfg);
  console.log(`🚫 Premium zur Kündigung markiert für Guild ${guildId} - läuft bis ${cfg.premium.expiresAt}`);

  return {
    success: true,
    subscriptionId: subscriptionId,
    customerId: customerId,
    expiresAt: cfg.premium.expiresAt
  };
}

/**
 * Aktiviert Lifetime Premium für einen Server (Owner-only)
 * @param {string} guildId - Discord Guild ID
 * @param {string} tier - 'pro' (nur Pro verfügbar, da Basic entfernt wurde)
 * @param {string} buyerId - Discord User ID des Käufers (optional)
 * @returns {object}
 */
function activateLifetimePremium(guildId, tier = 'pro', buyerId = null) {
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

/**
 * Prüft alle Guilds auf abgelaufene, gekündigte Premium-Abos
 * und stuft sie automatisch herab
 * @returns {Array} Liste der herabgestuften Guilds
 */
function checkExpiredCancellations() {
  const downgradedGuilds = [];

  if (!fs.existsSync(CONFIG_DIR)) {
    return downgradedGuilds;
  }

  const configFiles = fs.readdirSync(CONFIG_DIR)
    .filter(file => file.endsWith('.json') && !file.includes('_tickets') && !file.includes('_counter'));

  for (const file of configFiles) {
    const guildId = file.replace('.json', '');
    const cfg = readCfg(guildId);

    // Prüfe ob Premium vorhanden und zur Kündigung markiert ist
    if (!cfg.premium || !cfg.premium.willCancel) {
      continue;
    }

    // Prüfe ob expiresAt erreicht ist
    if (cfg.premium.expiresAt && new Date(cfg.premium.expiresAt) <= new Date()) {
      const oldTier = cfg.premium.tier;

      // Downgrade zu 'none'
      cfg.premium = {
        tier: 'none',
        expiresAt: null,
        subscriptionId: null,
        customerId: null,
        lifetime: false,
        willCancel: false,
        cancelledAt: null,
        features: { ...PREMIUM_TIERS.none.features }
      };

      saveCfg(guildId, cfg);

      console.log(`⬇️ Automatischer Downgrade nach Kündigung: Guild ${guildId} (${oldTier} → none)`);

      downgradedGuilds.push({
        guildId,
        oldTier,
        downgradedAt: new Date().toISOString()
      });
    }
  }

  if (downgradedGuilds.length > 0) {
    console.log(`✅ ${downgradedGuilds.length} gekündigte Abonnement(s) automatisch beendet`);
  }

  return downgradedGuilds;
}

/**
 * Aktiviert Partner-Status für einen Server
 * @param {string} guildId - Discord Guild ID
 * @param {string} partnerUserId - User ID des Partners
 * @param {string} partnerLink - Optional: Einladungslink zum Partner-Server
 * @returns {object}
 */
function activatePartner(guildId, partnerUserId, partnerLink = null) {
  const cfg = readCfg(guildId);

  cfg.premium = {
    tier: 'partner',
    expiresAt: null,
    subscriptionId: 'partner_' + guildId,
    customerId: 'partner_customer_' + guildId,
    partnerUserId: partnerUserId,
    partnerLink: partnerLink,
    partner: true,
    lifetime: false, // Partner ist NICHT Lifetime Premium
    features: { ...PREMIUM_TIERS.none.features } // Partner hat nur FREE Features
  };

  saveCfg(guildId, cfg);
  console.log(`🤝 Partner aktiviert für Guild ${guildId} (User: ${partnerUserId}) - NUR Free-Features`);

  return {
    success: true,
    guildId: guildId,
    partnerUserId: partnerUserId,
    partnerLink: partnerLink
  };
}

/**
 * Deaktiviert Partner-Status für einen Server
 * @param {string} guildId - Discord Guild ID
 * @returns {object}
 */
function deactivatePartner(guildId) {
  const cfg = readCfg(guildId);

  if (!cfg.premium || cfg.premium.tier !== 'partner') {
    return {
      success: false,
      message: 'Dieser Server ist kein Partner'
    };
  }

  cfg.premium = {
    tier: 'none',
    expiresAt: null,
    subscriptionId: null,
    customerId: null,
    partner: false,
    features: { ...PREMIUM_TIERS.none.features }
  };

  saveCfg(guildId, cfg);
  console.log(`🤝 Partner deaktiviert für Guild ${guildId}`);

  return {
    success: true,
    guildId: guildId
  };
}

/**
 * Listet alle Partner-Server auf
 * @returns {array}
 */
function listPartnerServers() {
  const partnerServers = [];

  if (!fs.existsSync(CONFIG_DIR)) {
    return partnerServers;
  }

  const files = fs.readdirSync(CONFIG_DIR);

  for (const file of files) {
    if (!file.endsWith('.json') || file.includes('_tickets') || file.includes('_counter')) continue;

    const guildId = file.replace('.json', '');
    const cfg = readCfg(guildId);

    if (cfg.premium && cfg.premium.tier === 'partner') {
      partnerServers.push({
        guildId: guildId,
        partnerUserId: cfg.premium.partnerUserId,
        partnerLink: cfg.premium.partnerLink || null
      });
    }
  }

  return partnerServers;
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
  checkExpiredCancellations,
  activateLifetimePremium,
  removeLifetimePremium,
  listLifetimePremiumServers,
  assignPremiumRole,
  activateBetatester,
  deactivateBetatester,
  listBetatesterServers,
  activatePartner,
  deactivatePartner,
  listPartnerServers,
  activateAutoTrial,
  isTrialActive,
  getTrialInfo,
  getExpiringTrials,
  markTrialWarningSent,
  wasWarningSent,
  readCfg,
  saveCfg
};
