const fs = require('fs');
const path = require('path');

const files = [
  'views/owner.ejs',
  'views/founder.ejs',
  'views/tickets.ejs',
  'views/analytics.ejs',
  'views/premium.ejs'
];

const scriptTag = '  <script src="/js/auth-session.js"></script>\n';

files.forEach(file => {
  const filePath = path.join(__dirname, file);

  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if script is already added
    if (content.includes('/js/auth-session.js')) {
      console.log(`✅ ${file}: Script already exists, skipping`);
      return;
    }

    // Find </body> tag and insert script before it
    if (content.includes('</body>')) {
      content = content.replace('</body>', `${scriptTag}</body>`);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ ${file}: Script added successfully`);
    } else {
      console.log(`⚠️ ${file}: No </body> tag found`);
    }
  } catch (error) {
    console.error(`❌ ${file}: Error - ${error.message}`);
  }
});

console.log('\n🎉 Done! Auth session script added to all pages.');
