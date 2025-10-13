const { exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Auto-Update System für TRS Tickets Bot
 * Führt bei GitHub Push automatisch git pull aus und startet den Bot neu
 */

const UPDATE_LOG = path.join(__dirname, 'update.log');
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || null;

/**
 * Logge Update-Aktivitäten
 */
function logUpdate(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  console.log(`🔄 ${message}`);

  try {
    fs.appendFileSync(UPDATE_LOG, logMessage);
  } catch (err) {
    console.error('Log-Fehler:', err);
  }
}

/**
 * Verifiziere GitHub Webhook Signatur
 */
function verifyGitHubSignature(payload, signature) {
  if (!WEBHOOK_SECRET) {
    logUpdate('⚠️ WARNUNG: Kein GITHUB_WEBHOOK_SECRET in .env konfiguriert!');
    return true; // Erlauben wenn kein Secret gesetzt (nicht empfohlen für Production)
  }

  if (!signature) {
    logUpdate('❌ Keine Signatur im Header gefunden');
    return false;
  }

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );

  if (!isValid) {
    logUpdate('❌ Signatur-Validierung fehlgeschlagen!');
  }

  return isValid;
}

/**
 * Führe Git Pull aus
 */
function gitPull() {
  return new Promise((resolve, reject) => {
    logUpdate('📥 Führe git pull aus...');

    exec('git pull', { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        logUpdate(`❌ Git Pull Fehler: ${error.message}`);
        return reject(error);
      }

      if (stderr) {
        logUpdate(`⚠️ Git Pull Stderr: ${stderr}`);
      }

      logUpdate(`✅ Git Pull erfolgreich: ${stdout.trim()}`);
      resolve(stdout);
    });
  });
}

/**
 * Prüfe ob package.json geändert wurde und installiere Dependencies
 */
function checkAndInstallDependencies(commits) {
  return new Promise((resolve, reject) => {
    let needsInstall = false;

    // Prüfe ob package.json in einem Commit geändert wurde
    for (const commit of commits) {
      const modified = commit.modified || [];
      const added = commit.added || [];

      if (modified.includes('package.json') || added.includes('package.json')) {
        needsInstall = true;
        break;
      }
    }

    if (!needsInstall) {
      logUpdate('ℹ️ package.json nicht geändert, überspringe npm install');
      return resolve();
    }

    logUpdate('📦 package.json wurde geändert, führe npm install aus...');

    exec('npm install', { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        logUpdate(`❌ npm install Fehler: ${error.message}`);
        return reject(error);
      }

      if (stderr && !stderr.includes('npm WARN')) {
        logUpdate(`⚠️ npm install Stderr: ${stderr}`);
      }

      logUpdate(`✅ npm install erfolgreich`);
      resolve();
    });
  });
}

/**
 * Starte Bot neu
 */
function restartBot() {
  logUpdate('🔄 Starte Bot neu...');

  // Prüfe ob PM2 läuft
  exec('pm2 list', (error) => {
    if (!error) {
      // PM2 ist verfügbar
      logUpdate('✅ PM2 erkannt, verwende pm2 restart');
      exec('pm2 restart trs-tickets-bot', (restartError, stdout) => {
        if (restartError) {
          logUpdate(`⚠️ PM2 Restart Fehler: ${restartError.message}, verwende process.exit()`);
          setTimeout(() => process.exit(0), 1000);
        } else {
          logUpdate(`✅ Bot über PM2 neugestartet: ${stdout.trim()}`);
        }
      });
    } else {
      // Kein PM2, verwende process.exit
      logUpdate('ℹ️ Kein PM2 erkannt, verwende process.exit()');
      logUpdate('⚠️ WICHTIG: Stelle sicher, dass der Bot mit einem Process Manager läuft!');

      setTimeout(() => {
        logUpdate('🔄 Bot wird in 2 Sekunden beendet...');
        process.exit(0);
      }, 2000);
    }
  });
}

/**
 * Handle Auto-Update Webhook
 */
async function handleAutoUpdate(req, res) {
  const startTime = Date.now();

  try {
    // Antworte sofort mit 200 OK
    res.status(200).send('Auto-Update gestartet');

    const payload = req.body;
    const event = req.headers['x-github-event'];
    const signature = req.headers['x-hub-signature-256'];

    logUpdate(`\n${'='.repeat(60)}`);
    logUpdate(`📡 Auto-Update Webhook empfangen`);
    logUpdate(`Event: ${event}`);
    logUpdate(`Repository: ${payload.repository?.full_name || 'Unknown'}`);

    // Verifiziere Signatur
    if (!verifyGitHubSignature(payload, signature)) {
      logUpdate('❌ Signatur-Verifizierung fehlgeschlagen! Update abgebrochen.');
      return;
    }

    // Nur auf Push Events reagieren
    if (event !== 'push') {
      logUpdate(`⏭️ Event ${event} ignoriert (nur push wird verarbeitet)`);
      return;
    }

    const ref = payload.ref || '';
    const branch = ref.replace('refs/heads/', '');
    const commits = payload.commits || [];
    const pusher = payload.pusher?.name || 'Unknown';

    logUpdate(`🌿 Branch: ${branch}`);
    logUpdate(`👤 Pusher: ${pusher}`);
    logUpdate(`📝 Commits: ${commits.length}`);

    // Nur auf main/master Branch reagieren
    if (branch !== 'main' && branch !== 'master') {
      logUpdate(`⏭️ Branch ${branch} wird ignoriert (nur main/master wird auto-updated)`);
      return;
    }

    // Prüfe ob Repository TRS-Tickets-Bot ist
    const repository = payload.repository?.full_name || '';
    if (!repository.toLowerCase().includes('trs-tickets-bot')) {
      logUpdate(`⏭️ Repository ${repository} ist nicht TRS-Tickets-Bot, ignoriere Update`);
      return;
    }

    logUpdate(`\n🚀 Starte Auto-Update Prozess...`);

    // 1. Git Pull
    try {
      await gitPull();
    } catch (error) {
      logUpdate(`❌ Auto-Update fehlgeschlagen: Git Pull Error`);
      return;
    }

    // 2. Prüfe Dependencies und installiere falls nötig
    try {
      await checkAndInstallDependencies(commits);
    } catch (error) {
      logUpdate(`⚠️ Warnung: npm install fehlgeschlagen, fahre trotzdem fort`);
    }

    // 3. Bot neustarten
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logUpdate(`\n✅ Auto-Update erfolgreich abgeschlossen in ${duration}s`);
    logUpdate(`🔄 Bot wird jetzt neugestartet...\n`);

    restartBot();

  } catch (error) {
    logUpdate(`❌ Auto-Update Fehler: ${error.message}`);
    console.error('Auto-Update Error:', error);
  }
}

/**
 * Zeige Update-Log Webseite
 */
function showUpdateLog(req, res) {
  try {
    let log = 'Keine Updates vorhanden.';

    if (fs.existsSync(UPDATE_LOG)) {
      const logContent = fs.readFileSync(UPDATE_LOG, 'utf8');
      const lines = logContent.split('\n').slice(-100); // Letzte 100 Zeilen
      log = lines.join('\n');
    }

    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auto-Update Log - TRS Tickets Bot</title>
  <meta http-equiv="refresh" content="10">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      background: #0a0a0a;
      color: #00ff88;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: #1a1a1a;
      border-radius: 10px;
      padding: 2rem;
      box-shadow: 0 4px 20px rgba(0,255,136,0.2);
      border: 1px solid #00ff88;
    }
    h1 {
      margin-bottom: 1rem;
      color: #00ff88;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .refresh-info {
      opacity: 0.6;
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    pre {
      background: #0a0a0a;
      padding: 1.5rem;
      border-radius: 6px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      border: 1px solid #00ff8844;
      max-height: 70vh;
      overflow-y: auto;
    }
    .footer {
      margin-top: 1rem;
      text-align: center;
      opacity: 0.6;
      font-size: 0.85rem;
    }
    a { color: #00ff88; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔄 Auto-Update Log</h1>
    <div class="refresh-info">↻ Automatische Aktualisierung alle 10 Sekunden | <a href="/">← Zurück zur Homepage</a></div>
    <pre>${escapeHtml(log)}</pre>
    <div class="footer">
      <p>TRS Tickets Bot © ${new Date().getFullYear()} | Letzte 100 Log-Einträge</p>
    </div>
  </div>
</body>
</html>
    `;

    res.status(200).send(html);
  } catch (error) {
    res.status(500).send('Fehler beim Laden des Update-Logs');
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = {
  handleAutoUpdate,
  showUpdateLog
};
