const fs = require('fs');
const path = require('path');

const files = [
  // Views
  'views/owner.ejs',
  'views/feedback.ejs',
  'views/all-feedbacks.ejs',
  'views/ticketDetail.ejs',

  // Backend
  'panel.js',

  // Commands
  'commands/restart.js',
  'commands/broadcast.js',
  'commands/lifetime-premium.js',
  'commands/betatester.js',
  'commands/premium-role.js',
  'commands/version.js',
  'commands/status.js',
  'commands/github-commits.js',
  'commands/userlanguage.js',
  'commands/dashboard.js',

  // Email & DM
  'dm-notifications.js',
  'email-notifications.js',
  'auto-update.js',

  // Public
  'public/css/app.css',
  'public/js/app/main.js',
  'public/js/app/tickets.js',
  'public/js/app/panel.js',
  'public/js/app/state.js',
  'public/js/app/api.js'
];

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

    content = content.replace(/Quantix Tickets/g, 'Quantix Tickets');
    content = content.replace(/Theredstonee/g, 'Quantix Development');

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
