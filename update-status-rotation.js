const fs = require('fs');
const path = require('path');

console.log('🔄 Aktualisiere Status-Rotation mit Support Server und Partner-Links...\n');

const indexPath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(indexPath, 'utf8');

const oldCode = `    const serverCount = client.guilds.cache.size;

    // Berechne Gesamt-Member-Anzahl
    const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

    const statuses = [
      { name: \`auf \${serverCount} Servern\`, type: ActivityType.Playing },
      { name: \`Release v\${VERSION}\`, type: ActivityType.Playing },
      { name: \`Quantix Development\`, type: ActivityType.Playing },
      { name: \`!commands für Hilfe\`, type: ActivityType.Playing },
      { name: \`\${totalMembers} Members zu\`, type: ActivityType.Watching }
    ];`;

const newCode = `    const serverCount = client.guilds.cache.size;

    // Berechne Gesamt-Member-Anzahl
    const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

    // Lade Partner-Server für Status-Rotation
    const { listPartnerServers } = require('./premium');
    const partnerServers = listPartnerServers();

    const statuses = [
      { name: \`Support: dsc.gg/quantix-bot\`, type: ActivityType.Playing },
      { name: \`auf \${serverCount} Servern\`, type: ActivityType.Playing },
      { name: \`Release v\${VERSION}\`, type: ActivityType.Playing },
      { name: \`Quantix Development\`, type: ActivityType.Playing },
      { name: \`!commands für Hilfe\`, type: ActivityType.Playing },
      { name: \`\${totalMembers} Members zu\`, type: ActivityType.Watching }
    ];

    // Füge Partner-Links zur Status-Rotation hinzu (falls vorhanden)
    if (partnerServers && partnerServers.length > 0) {
      for (const partner of partnerServers) {
        if (partner.partnerLink) {
          statuses.push({
            name: \`Partner: \${partner.partnerLink.replace('https://', '')}\`,
            type: ActivityType.Playing
          });
        }
      }
    }`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(indexPath, content, 'utf8');
  console.log('✅ Status-Rotation erfolgreich aktualisiert!');
  console.log('✅ Support Server Link hinzugefügt: dsc.gg/quantix-bot');
  console.log('✅ Partner-Links werden dynamisch geladen');
  console.log('\n📝 Hinweis: Starte den Bot neu, damit die Änderungen wirksam werden.');
} else if (content.includes('Support: dsc.gg/quantix-bot')) {
  console.log('✅ Status-Rotation ist bereits aktualisiert!');
} else {
  console.log('❌ Konnte den zu ersetzenden Code nicht finden.');
  console.log('⚠️  Möglicherweise wurde die Datei bereits manuell geändert.');
}
