const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences
  ]
});

client.once('clientReady', async () => {
  console.log('✅ Bot bereit:', client.user.tag);
  console.log('📊 Aktueller Status:', client.user.presence?.status || 'unknown');

  console.log('\n🔴 Setze DND Status (Variante 1)...');
  await client.user.setPresence({
    activities: [{
      name: 'Custom Status',
      type: 4,
      state: '🔧 TEST DND STATUS'
    }],
    status: 'dnd'
  });
  console.log('✅ Status gesetzt!');
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n🔴 Setze DND Status nochmal (Force)...');
  await client.user.setPresence({
    activities: [{
      name: 'Custom Status',
      type: 4,
      state: '🔧 WARTUNGSMODUS TEST'
    }],
    status: 'dnd'
  });
  console.log('✅ Status erneut gesetzt!');
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n📊 Finaler Status:', client.user.presence?.status || 'unknown');
  console.log('\n🎯 CHECK DISCORD JETZT - Bot sollte ROT/DND sein!');
  console.log('   Wenn nicht → Discord Cache Problem');
  console.log('   Wenn ja → `/maintenance` wird auch funktionieren');

  console.log('\nDrücke Ctrl+C zum Beenden...');
});

client.login(process.env.TOKEN);
