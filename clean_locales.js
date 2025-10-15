const fs = require('fs');

const files = [
  './commands/lifetime-premium.js',
  './commands/premium-role.js',
  './commands/betatester.js'
];

files.forEach(filepath => {
  console.log(`Processing ${filepath}...`);

  let content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  const filtered = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip lines that start with 'he:' or 'ar:'
    if (trimmed.startsWith('he:') || trimmed.startsWith('ar:')) {
      console.log(`  Removing: ${trimmed.substring(0, 50)}...`);
      continue;
    }

    filtered.push(line);
  }

  fs.writeFileSync(filepath, filtered.join('\n'), 'utf8');
  console.log(`✅ Cleaned ${filepath}\n`);
});

console.log('✅ All files cleaned!');
