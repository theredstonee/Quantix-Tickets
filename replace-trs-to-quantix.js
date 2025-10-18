const fs = require('fs');
const path = require('path');

// Liste der Dateien, die geändert werden sollen
const filesToUpdate = [
  'panel.js',
  'index.js',
  'auto-update.js',
  'dm-notifications.js',
  'email-notifications.js',
  'README.md',
  'bulk-replace.js',
  'replace-branding.js',
  'changelog.json',
  'commands/restart.js',
  'commands/premium-role.js',
  'commands/betatester.js',
  'commands/lifetime-premium.js',
  'commands/broadcast.js',
  'commands/dashboard.js',
  'commands/userlanguage.js',
  'commands/version.js',
  'commands/status.js',
  'commands/github-commits.js',
  'public/css/app.css',
  'public/js/app/main.js',
  'public/js/app/tickets.js',
  'public/js/app/panel.js',
  'public/js/app/state.js',
  'public/js/app/api.js',
  'public/markdown.css'
];

let totalReplacements = 0;

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Datei nicht gefunden: ${file}`);
    return;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Ersetze alle Vorkommen von "Quantix Tickets" mit "Quantix Tickets"
    content = content.replace(/Quantix Tickets/g, 'Quantix Tickets');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      const count = (originalContent.match(/Quantix Tickets/g) || []).length;
      totalReplacements += count;
      console.log(`✅ ${file}: ${count} Ersetzung(en)`);
    } else {
      console.log(`   ${file}: Keine Änderungen`);
    }
  } catch (err) {
    console.error(`❌ Fehler bei ${file}:`, err.message);
  }
});

console.log(`\n🎉 Fertig! Insgesamt ${totalReplacements} Ersetzungen vorgenommen.`);
