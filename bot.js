#!/usr/bin/env node
/**
 * Quantix Tickets - Discord Bot Service
 * Startet NUR den Discord Bot ohne Web-Panel
 */

// Setze BOT_ONLY Modus
process.env.BOT_ONLY = 'true';

console.log('🤖 Starting Quantix Tickets Bot Service...');
console.log('📊 Mode: BOT ONLY (Web Panel disabled)');
console.log('');

// Lade Hauptbot
require('./index.js');
