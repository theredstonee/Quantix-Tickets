#!/usr/bin/env node
/**
 * Quantix Tickets - Web Panel Service
 * Startet NUR das Web-Panel ohne Bot Event-Handler
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

console.log('🌐 Starting Quantix Tickets Web Panel Service...');
console.log('📊 Mode: WEB PANEL ONLY (Bot events disabled)');
console.log('');

// Application Key Validation (gleich wie in index.js)
let REQUIRED_APP_KEY;
try {
  const keyPath = path.join(__dirname, 'app.key');
  REQUIRED_APP_KEY = fs.readFileSync(keyPath, 'utf8').trim();
  if(!REQUIRED_APP_KEY || REQUIRED_APP_KEY.length < 10){
    throw new Error('Invalid key format');
  }
} catch(err) {
  console.error('\n❌ CRITICAL ERROR: app.key file not found or invalid!');
  console.error('📝 Please ensure app.key file exists in the root directory');
  console.error('🔐 Contact the developer for the correct app.key file');
  console.error('⛔ Web Panel startup aborted for security reasons\n');
  process.exit(1);
}

if (!process.env.APPLICATION_KEY || process.env.APPLICATION_KEY !== REQUIRED_APP_KEY) {
  console.error('\n❌ CRITICAL ERROR: Invalid or missing APPLICATION_KEY!');
  console.error('📝 Please set APPLICATION_KEY in your .env file');
  console.error('🔐 Contact the developer for the correct APPLICATION_KEY');
  console.error('⛔ Web Panel startup aborted for security reasons\n');
  process.exit(1);
}

console.log('✅ Application Key verified successfully');

// Express Server Setup
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('trust proxy', 1);

// Discord Client (nur für Daten-Fetching, KEINE Event-Handler)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences  // Für Member-Status
  ],
  partials: [Partials.Channel, Partials.Message]
});

const TOKEN = process.env.DISCORD_TOKEN;

// Client Login (nur für Daten-Zugriff, keine Events)
client.login(TOKEN)
  .then(() => {
    console.log('✅ Discord Client connected (data-fetch only mode)');
    console.log(`👤 Logged in as: ${client.user.tag}`);

    // Panel Routes laden (nach Client-Login)
    app.use('/', require('./panel')(client));

    // Web Server starten
    const PORT = process.env.WEB_PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🌐 Web Panel listening on port ${PORT}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log('');
      console.log('✅ Web Panel Service ready!');
    });
  })
  .catch(err => {
    console.error('❌ Failed to login Discord Client:', err);
    process.exit(1);
  });

// Error Handler
client.on('error', err => {
  console.error('❌ Discord Client Error:', err);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});
