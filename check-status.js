const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences]
});

client.once('ready', () => {
  console.log('✅ Bot bereit:', client.user.tag);
  console.log('\n📊 Aktueller Bot Status:');
  console.log('─────────────────────────────────────');

  const presence = client.user.presence;

  if (!presence) {
    console.log('❌ KEINE PRESENCE DATEN!');
    console.log('   → Presence Intent möglicherweise nicht aktiv');
  } else {
    console.log('Status:', presence.status || 'unknown');
    console.log('Activities:', presence.activities?.length || 0);

    if (presence.activities && presence.activities.length > 0) {
      presence.activities.forEach((activity, i) => {
        console.log(`\nActivity ${i + 1}:`);
        console.log('  Name:', activity.name);
        console.log('  Type:', activity.type);
        console.log('  State:', activity.state);
      });
    }
  }

  console.log('─────────────────────────────────────\n');

  // Check if bot is in maintenance mode
  const fs = require('fs');
  const path = require('path');
  const maintenanceFile = path.join(__dirname, 'maintenance.json');

  if (fs.existsSync(maintenanceFile)) {
    const state = JSON.parse(fs.readFileSync(maintenanceFile, 'utf8'));
    console.log('🔧 Maintenance Status:', state.enabled ? 'AKTIV' : 'Inaktiv');
    if (state.enabled) {
      console.log('   Seit:', new Date(state.enabledAt).toLocaleString('de-DE'));
      console.log('   Grund:', state.reason);
    }
  }

  process.exit(0);
});

client.login(process.env.TOKEN);
