const fs = require('fs');
const path = require('path');

const files = [
  'views/panel.ejs',
  'panel.js',
  'views/imprint.ejs',
  'views/home.ejs',
  'install-premium.sh',
  'README.md',
  'commands/userlanguage.js',
  'commands/dashboard.js'
];

const oldUrl = 'trstickets.theredstonee.de';
const newUrl = 'tickets.quantix-bot.de';

let count = 0;

files.forEach(file => {
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠ File not found: ${file}`);
    return;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;

    // Replace all occurrences (case-insensitive)
    content = content.replace(new RegExp(oldUrl, 'gi'), newUrl);

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Updated: ${file}`);
      count++;
    } else {
      console.log(`○ No changes: ${file}`);
    }
  } catch (err) {
    console.log(`✗ Error: ${file} - ${err.message}`);
  }
});

console.log(`\n✓ Done! Updated ${count} files.`);
console.log(`Changed: ${oldUrl} → ${newUrl}`);
