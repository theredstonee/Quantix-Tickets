const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Sanitize HTML content
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'code', 'pre'],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false
  });
}

// Sanitize plain text (escape HTML entities)
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Sanitize URL
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();

  // Block javascript: and data: protocols
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return '';
  }

  // Allow only http, https, and relative URLs
  if (!/^(https?:\/\/|\/)/i.test(trimmed)) {
    return '';
  }

  return trimmed;
}

// Sanitize email
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return '';

  const trimmed = email.trim();

  // Basic email validation
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!emailRegex.test(trimmed)) {
    return '';
  }

  return trimmed;
}

// Sanitize Discord ID
function sanitizeDiscordId(id) {
  if (!id || typeof id !== 'string') return '';

  const trimmed = id.trim();

  // Discord IDs are 17-20 digit numbers
  if (!/^\d{17,20}$/.test(trimmed)) {
    return '';
  }

  return trimmed;
}

// Sanitize color hex code
function sanitizeColor(color) {
  if (!color || typeof color !== 'string') return '#000000';

  const trimmed = color.trim();

  // Valid hex color
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed;
  }

  // Valid short hex color
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    return trimmed;
  }

  return '#000000';
}

// Sanitize number
function sanitizeNumber(num, min = null, max = null) {
  const parsed = parseInt(num, 10);

  if (isNaN(parsed)) {
    return min !== null ? min : 0;
  }

  if (min !== null && parsed < min) return min;
  if (max !== null && parsed > max) return max;

  return parsed;
}

// Sanitize string (general purpose - removes control characters)
function sanitizeString(str, maxLength = 2000) {
  if (!str || typeof str !== 'string') return '';

  // Remove control characters except newlines and tabs
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Limit length
  return cleaned.slice(0, maxLength).trim();
}

// Sanitize Discord username/tag (protection against overflow and XSS)
function sanitizeUsername(username, maxLength = 100) {
  if (!username || typeof username !== 'string') return 'Unknown User';

  // Remove control characters and potentially malicious content
  let cleaned = username.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove any HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Limit length (Discord username max 32, tag max 37, but we allow 100 for safety)
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }

  // If empty after sanitization, return fallback
  if (!cleaned || cleaned.length === 0) {
    return 'Unknown User';
  }

  // Escape HTML entities for safe display
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Validate and sanitize Discord ID (strict validation)
function validateDiscordId(id) {
  if (!id) return null;

  // Convert to string if needed
  const idStr = String(id).trim();

  // Discord IDs must be 17-20 digits
  if (!/^\d{17,20}$/.test(idStr)) {
    return null;
  }

  return idStr;
}

// Sanitize JSON
function sanitizeJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') return null;

  try {
    const parsed = JSON.parse(jsonString);
    return parsed;
  } catch (err) {
    return null;
  }
}

// Content Security Policy middleware
function cspMiddleware() {
  return (req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "img-src 'self' data: https: http:",
        "font-src 'self' data: https://cdnjs.cloudflare.com",
        "connect-src 'self' https://www.google-analytics.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    );

    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
  };
}

/**
 * Sanitize request body middleware
 * Sanitizes all string values in req.body to prevent XSS
 */
function sanitizeBodyMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;

      const sanitized = {};

      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = sanitizeString(key, 100);

        if (typeof value === 'string') {
          // Special handling for specific fields
          if (key === 'email' || key === 'notificationEmail') {
            sanitized[sanitizedKey] = sanitizeEmail(value);
          } else if (key.includes('Color') || key.includes('color')) {
            sanitized[sanitizedKey] = sanitizeColor(value);
          } else if (key.includes('Id') || key.includes('ID') || key === 'guildId' || key === 'serverId') {
            sanitized[sanitizedKey] = sanitizeDiscordId(value) || value;
          } else if (key.includes('Url') || key.includes('url')) {
            sanitized[sanitizedKey] = sanitizeUrl(value);
          } else {
            sanitized[sanitizedKey] = sanitizeString(value, 10000);
          }
        } else if (typeof value === 'number') {
          sanitized[sanitizedKey] = sanitizeNumber(value);
        } else if (typeof value === 'boolean') {
          sanitized[sanitizedKey] = Boolean(value);
        } else if (Array.isArray(value)) {
          sanitized[sanitizedKey] = value.map(item =>
            typeof item === 'object' ? sanitizeObject(item) : sanitizeString(String(item), 1000)
          );
        } else if (value && typeof value === 'object') {
          sanitized[sanitizedKey] = sanitizeObject(value);
        } else {
          sanitized[sanitizedKey] = value;
        }
      }

      return sanitized;
    };

    req.body = sanitizeObject(req.body);
  }

  next();
}

/**
 * Rate limiting for XSS attack prevention
 */
const rateLimitStore = new Map();

function xssRateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 60000 });
    return next();
  }

  const record = rateLimitStore.get(ip);

  if (now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + 60000 });
    return next();
  }

  if (record.count > 100) {
    console.log(`⚠️ Rate limit exceeded for IP: ${ip}`);
    return res.status(429).send('Too many requests. Please try again later.');
  }

  record.count++;
  next();
}

// Clean up rate limit store every hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}, 3600000);

module.exports = {
  sanitizeHtml,
  sanitizeText,
  sanitizeUrl,
  sanitizeEmail,
  sanitizeDiscordId,
  sanitizeColor,
  sanitizeNumber,
  sanitizeString,
  sanitizeUsername,
  validateDiscordId,
  sanitizeJson,
  cspMiddleware,
  sanitizeBodyMiddleware,
  xssRateLimitMiddleware
};
