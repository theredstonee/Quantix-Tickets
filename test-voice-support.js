#!/usr/bin/env node

/**
 * Voice Support Test Script
 * Überprüft ob alle Voraussetzungen für das Voice Support System erfüllt sind
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Voice Support System - Diagnose\n');
console.log('='.repeat(50));

// 1. Check audio directory
const audioDir = path.join(__dirname, 'audio');
console.log('\n📂 1. Audio-Verzeichnis:');
if (fs.existsSync(audioDir)) {
  console.log('   ✅ Verzeichnis existiert: audio/');
} else {
  console.log('   ❌ Verzeichnis fehlt: audio/');
  console.log('   ➜ Erstelle mit: mkdir audio');
}

// 2. Check music file
const musicFile = path.join(audioDir, 'waiting-music.mp3');
console.log('\n🎵 2. Wartemusik-Datei:');
if (fs.existsSync(musicFile)) {
  const stats = fs.statSync(musicFile);
  const sizeInMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`   ✅ Datei existiert: audio/waiting-music.mp3`);
  console.log(`   📊 Größe: ${sizeInMB} MB`);
  if (stats.size === 0) {
    console.log('   ⚠️  Datei ist leer!');
  }
} else {
  console.log('   ❌ Datei fehlt: audio/waiting-music.mp3');
  console.log('   ➜ Siehe audio/README.md für Download-Links');
}

// 3. Check dependencies
console.log('\n📦 3. NPM-Pakete:');
const packageJson = require('./package.json');
const requiredPackages = ['@discordjs/voice', '@discordjs/opus', 'discord.js'];

requiredPackages.forEach(pkg => {
  if (packageJson.dependencies[pkg] || packageJson.optionalDependencies?.[pkg]) {
    console.log(`   ✅ ${pkg}`);
  } else {
    console.log(`   ❌ ${pkg} fehlt`);
    console.log(`      ➜ Installiere mit: npm install ${pkg}`);
  }
});

// 4. Check if voice-waiting-room.js exists
console.log('\n📄 4. Modul-Dateien:');
const voiceModule = path.join(__dirname, 'voice-waiting-room.js');
if (fs.existsSync(voiceModule)) {
  console.log('   ✅ voice-waiting-room.js');
} else {
  console.log('   ❌ voice-waiting-room.js fehlt');
}

const supportTimesCmd = path.join(__dirname, 'commands', 'support-times.js');
if (fs.existsSync(supportTimesCmd)) {
  console.log('   ✅ commands/support-times.js');
} else {
  console.log('   ❌ commands/support-times.js fehlt');
}

// 5. Check index.js for GuildVoiceStates intent
console.log('\n🔐 5. Discord Intents:');
const indexJs = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
if (indexJs.includes('GuildVoiceStates')) {
  console.log('   ✅ GuildVoiceStates Intent ist aktiviert');
} else {
  console.log('   ❌ GuildVoiceStates Intent fehlt in index.js');
  console.log('      ➜ Füge hinzu: GatewayIntentBits.GuildVoiceStates');
}

if (indexJs.includes('handleVoiceJoin') && indexJs.includes('VoiceStateUpdate')) {
  console.log('   ✅ VoiceStateUpdate Event Handler ist registriert');
} else {
  console.log('   ❌ VoiceStateUpdate Event Handler fehlt');
}

// 6. Summary
console.log('\n' + '='.repeat(50));
console.log('\n📋 ZUSAMMENFASSUNG:\n');

const checks = {
  audioDir: fs.existsSync(audioDir),
  musicFile: fs.existsSync(musicFile) && fs.statSync(musicFile).size > 0,
  voiceModule: fs.existsSync(voiceModule),
  intent: indexJs.includes('GuildVoiceStates'),
  eventHandler: indexJs.includes('handleVoiceJoin')
};

const allPassed = Object.values(checks).every(v => v);

if (allPassed) {
  console.log('✅ Alle Checks bestanden! Voice Support sollte funktionieren.');
  console.log('\n📝 Nächste Schritte:');
  console.log('   1. Bot neustarten: pm2 restart quantix-tickets');
  console.log('   2. Im Panel Voice Support aktivieren');
  console.log('   3. Wartezimmer-Channel auswählen');
  console.log('   4. Support-Channel für Embeds auswählen');
  console.log('   5. Teste indem du dem Voice-Channel beitrittst');
} else {
  console.log('❌ Einige Checks fehlgeschlagen. Bitte behebe die Fehler oben.\n');

  if (!checks.musicFile) {
    console.log('🎵 WICHTIG: Musik-Datei fehlt!');
    console.log('   Download: https://www.youtube.com/audiolibrary');
    console.log('   Speichern unter: audio/waiting-music.mp3\n');
  }

  if (!checks.intent) {
    console.log('🔐 WICHTIG: Discord Intent fehlt!');
    console.log('   Aktiviere im Discord Developer Portal:');
    console.log('   https://discord.com/developers/applications');
    console.log('   Bot → Privileged Gateway Intents → PRESENCE INTENT & SERVER MEMBERS INTENT\n');
  }
}

console.log('\n' + '='.repeat(50));
