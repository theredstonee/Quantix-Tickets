const { hasFeature } = require('./premium');

// Email-Benachrichtigungen (Pro Feature)
// Hinweis: nodemailer muss installiert werden: npm install nodemailer

let emailEnabled = false;
let transporter = null;

/**
 * Initialisiert den Email-Service
 * Wird nur aktiviert wenn alle SMTP-Einstellungen in .env gesetzt sind
 */
function initEmailService() {
  const requiredEnvVars = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM'
  ];

  const allSet = requiredEnvVars.every(key =>
    process.env[key] &&
    process.env[key] !== '' &&
    !process.env[key].includes('your_')
  );

  if (!allSet) {
    console.log('⚠️  Email-Benachrichtigungen deaktiviert (SMTP nicht konfiguriert)');
    console.log('   Zum Aktivieren: SMTP_* Variablen in .env setzen');
    return false;
  }

  try {
    const nodemailer = require('nodemailer');

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    emailEnabled = true;
    console.log('✅ Email-Benachrichtigungen aktiviert');
    return true;

  } catch (err) {
    console.error('❌ Fehler beim Initialisieren des Email-Service:', err.message);
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log('   Installiere nodemailer: npm install nodemailer');
    }
    return false;
  }
}

/**
 * Sendet Email-Benachrichtigung für neues Ticket
 * Nur für Pro-Tier Guilds
 *
 * @param {string} guildId - Discord Guild ID
 * @param {object} ticketInfo - Ticket-Informationen
 * @param {string} emailAddress - Email-Adresse des Empfängers
 */
async function sendTicketNotification(guildId, ticketInfo, emailAddress) {
  // Prüfe ob Guild Pro hat
  if (!hasFeature(guildId, 'emailNotifications')) {
    return { success: false, reason: 'not_pro' };
  }

  // Prüfe ob Email-Service aktiviert ist
  if (!emailEnabled || !transporter) {
    return { success: false, reason: 'email_not_configured' };
  }

  // Prüfe ob Email-Adresse gültig ist
  if (!emailAddress || !emailAddress.includes('@')) {
    return { success: false, reason: 'invalid_email' };
  }

  try {
    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: emailAddress,
      subject: `🎫 Neues Ticket #${ticketInfo.id} - ${ticketInfo.topic}`,
      html: buildTicketEmail(ticketInfo)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email gesendet für Ticket #${ticketInfo.id} an ${emailAddress}`);

    return {
      success: true,
      messageId: info.messageId
    };

  } catch (err) {
    console.error(`❌ Fehler beim Senden der Email für Ticket #${ticketInfo.id}:`, err);
    return {
      success: false,
      reason: 'send_error',
      error: err.message
    };
  }
}

/**
 * Erstellt HTML für Ticket-Email
 */
function buildTicketEmail(ticketInfo) {
  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f4f4f4;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
    }
    .content {
      padding: 30px;
    }
    .ticket-badge {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .info-row {
      margin: 15px 0;
      padding: 15px;
      background: #f8f9fa;
      border-left: 4px solid #667eea;
      border-radius: 5px;
    }
    .info-label {
      font-weight: bold;
      color: #333;
      margin-bottom: 5px;
    }
    .info-value {
      color: #666;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎫 Neues Ticket</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Quantix Tickets Bot</p>
    </div>

    <div class="content">
      <div class="ticket-badge">Ticket #${ticketInfo.id}</div>

      <div class="info-row">
        <div class="info-label">📋 Thema</div>
        <div class="info-value">${ticketInfo.topic}</div>
      </div>

      <div class="info-row">
        <div class="info-label">👤 Erstellt von</div>
        <div class="info-value">${ticketInfo.user}</div>
      </div>

      <div class="info-row">
        <div class="info-label">🕐 Zeitpunkt</div>
        <div class="info-value">${new Date(ticketInfo.timestamp).toLocaleString('de-DE', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })}</div>
      </div>

      ${ticketInfo.formData && Object.keys(ticketInfo.formData).length > 0 ? `
      <div class="info-row">
        <div class="info-label">📝 Formulardaten</div>
        <div class="info-value">
          ${Object.entries(ticketInfo.formData)
            .map(([key, value]) => `<strong>${key}:</strong> ${value}`)
            .join('<br>')}
        </div>
      </div>
      ` : ''}

      <p style="margin-top: 30px; color: #666;">
        Bitte logge dich in Discord ein um das Ticket zu bearbeiten.
      </p>
    </div>

    <div class="footer">
      <p>Diese Email wurde automatisch von Quantix Tickets Bot gesendet.</p>
      <p style="margin-top: 10px;">
        <a href="https://github.com/Theredstonee/TRS-Tickets-Bot" style="color: #667eea;">GitHub</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Gibt Email-Adresse für Guild zurück
 * Muss in der Guild-Config gespeichert sein
 */
function getGuildEmail(guildId) {
  try {
    const { readCfg } = require('./premium');
    const cfg = readCfg(guildId);
    return cfg.notificationEmail || null;
  } catch {
    return null;
  }
}

module.exports = {
  initEmailService,
  sendTicketNotification,
  getGuildEmail,
  isEmailEnabled: () => emailEnabled
};
