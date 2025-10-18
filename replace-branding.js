const fs = require('fs');
const path = require('path');

const replacements = [
  { from: /Quantix Tickets/g, to: 'Quantix Tickets' },
  { from: /Theredstonee/g, to: 'Quantix Development' }
];

const extensionsToProcess = ['.ejs', '.js', '.css', '.json'];
const excludeDirs = ['node_modules', '.git'];
const excludeFiles = ['package-lock.json', 'replace-branding.js'];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    replacements.forEach(({ from, to }) => {
      if (from.test(content)) {
        content = content.replace(from, to);
        changed = true;
      }
    });

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Updated: ${filePath}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error(`✗ Error processing ${filePath}:`, err.message);
    return false;
  }
}

function walkDir(dir) {
  let updatedCount = 0;

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (!excludeDirs.includes(file)) {
        updatedCount += walkDir(filePath);
      }
    } else if (stat.isFile()) {
      const ext = path.extname(file);
      if (extensionsToProcess.includes(ext) && !excludeFiles.includes(file)) {
        if (processFile(filePath)) {
          updatedCount++;
        }
      }
    }
  });

  return updatedCount;
}

console.log('Starting branding replacement...\n');
const totalUpdated = walkDir(__dirname);
console.log(`\n✓ Done! Updated ${totalUpdated} files.`);
