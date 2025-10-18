const fs = require('fs');
const path = require('path');

const files = [
  'views/panel.ejs',
  'views/analytics.ejs',
  'views/tickets.ejs',
  'views/select-server.ejs',
  'views/privacy-policy.ejs',
  'views/terms-of-service.ejs',
  'views/imprint.ejs',
  'views/feedback.ejs',
  'views/all-feedbacks.ejs',
  'views/ticketDetail.ejs',
  'views/premium.ejs',
  'views/owner.ejs'
];

const oldColors = {
  '--bg-color: #ffffff': '--bg-color: #f0f8ff',
  '--text-color: #1a1a1a': '--text-color: #1a1a2e',
  '--border-color: #e5e8ec': '--border-color: #bdd7ee',
  '--accent-color: #00b894': '--accent-color: #0ea5e9',
  '--accent-hover: #00a077': '--accent-hover: #0284c7',
  '--hero-gradient-start: #00b894': '--hero-gradient-start: #0ea5e9',
  '--hero-gradient-end: #00a077': '--hero-gradient-end: #0284c7',
  '--glass-bg: rgba(255, 255, 255, 0.7)': '--glass-bg: rgba(240, 248, 255, 0.7)',
  '--glass-border: rgba(255, 255, 255, 0.3)': '--glass-border: rgba(14, 165, 233, 0.3)',
  '--shadow-color: rgba(0, 0, 0, 0.1)': '--shadow-color: rgba(14, 165, 233, 0.15)'
};

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

    // Replace all old colors with new ones
    Object.keys(oldColors).forEach(oldColor => {
      const newColor = oldColors[oldColor];
      content = content.replace(new RegExp(oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newColor);
    });

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

console.log(`\n✓ Done! Updated ${count} files with blue color scheme.`);
