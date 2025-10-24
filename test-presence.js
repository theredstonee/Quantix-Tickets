const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences
  ]
});

client.once('ready', async () => {
  console.log('✅ Bot bereit:', client.user.tag);
  console.log('📊 Aktueller Status:', client.user.presence?.status || 'Kein Status');

  console.log('\n🔴 Teste DND Status (Variante 1: String "dnd")...');
  await client.user.setPresence({
    activities: [{ name: '🔴 TEST DND v1', type: ActivityType.Playing }],
    status: 'dnd'
  });
  console.log('✅ Status gesetzt (dnd string)');
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n🟠 Teste Idle Status...');
  await client.user.setPresence({
    activities: [{ name: '🟠 TEST IDLE', type: ActivityType.Playing }],
    status: 'idle'
  });
  console.log('✅ Status gesetzt (idle)');
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n⚫ Teste Invisible Status...');
  await client.user.setPresence({
    activities: [{ name: 'Invisible', type: ActivityType.Playing }],
    status: 'invisible'
  });
  console.log('✅ Status gesetzt (invisible)');
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n🟢 Teste Online Status...');
  await client.user.setPresence({
    activities: [{ name: '🟢 TEST ONLINE', type: ActivityType.Playing }],
    status: 'online'
  });
  console.log('✅ Status gesetzt (online)');
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n🔴 Teste DND nochmal mit Custom Activity...');
  await client.user.setPresence({
    activities: [{
      name: 'Custom Status Test',
      type: 4,
      state: '🔧 Wartungsmodus'
    }],
    status: 'dnd'
  });
  console.log('✅ Status gesetzt (dnd mit custom)');

  console.log('\n📊 Test abgeschlossen!');
  console.log('Prüfe Discord, ob die Status-Änderungen sichtbar waren.');
  console.log('Drücke Ctrl+C zum Beenden.');
});

client.login(process.env.TOKEN);
