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

  // Destroy and reconnect to force WebSocket refresh
  console.log('🔄 Disconnecting...');
  await client.destroy();

  console.log('🔄 Reconnecting...');
  await client.login(process.env.TOKEN);
});

client.on('ready', async () => {
  console.log('✅ Reconnected:', client.user.tag);

  console.log('🔴 Setze DND Status...');
  await client.user.setPresence({
    activities: [{
      name: 'Custom Status',
      type: 4,
      state: '🔧 FORCE UPDATE TEST'
    }],
    status: 'dnd'
  });

  console.log('✅ Status gesetzt!');
  console.log('📊 Check Discord now - Bot should be RED/DND');

  // Keep alive
  setTimeout(() => {}, 60000);
});

client.login(process.env.TOKEN);
