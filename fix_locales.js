const fs = require('fs');
const path = require('path');

const files = [
  'commands/lifetime-premium.js',
  'commands/premium-role.js',
  'commands/betatester.js'
];

files.forEach(filepath => {
  const fullPath = path.join(__dirname, filepath);
  let content = fs.readFileSync(fullPath, 'utf8');

  // Remove all lines containing 'he:' or 'ar:' as locale keys
  const lines = content.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith('he:') && !trimmed.startsWith('ar:');
  });

  // Fix trailing commas
  const result = [];
  for (let i = 0; i < filtered.length; i++) {
    const line = filtered[i];
    const nextLine = filtered[i + 1];

    // If this line ends with comma and next line starts with }),
    // remove the comma
    if (line.trim().endsWith(',') && nextLine && nextLine.trim().startsWith('})')) {
      result.push(line.replace(/,\s*$/, ''));
    } else {
      result.push(line);
    }
  }

  fs.writeFileSync(fullPath, result.join('\n'), 'utf8');
  console.log(`✅ Cleaned ${filepath}`);
});

console.log('✅ All files cleaned successfully!');
