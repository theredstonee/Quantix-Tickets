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

module.exports = {
  sanitizeHtml,
  sanitizeText,
  sanitizeUrl,
  sanitizeEmail,
  sanitizeDiscordId,
  sanitizeColor,
  sanitizeNumber,
  sanitizeString,
  sanitizeJson,
  cspMiddleware
};
