#!/usr/bin/env node
/**
 * Quantix Tickets Bot - Startup Script
 * Automatically installs dependencies before every start
 */

const { spawn } = require('child_process');
const path = require('path');

const ROOT_DIR = __dirname;

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           Quantix Tickets Bot - Startup                    ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Run npm install (always)
function runNpmInstall() {
  return new Promise((resolve, reject) => {
    console.log('[Startup] Installing dependencies...');
    console.log('');

    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    const install = spawn(npmCmd, ['install'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: isWindows
    });

    install.on('close', (code) => {
      if (code === 0) {
        console.log('');
        console.log('[Startup] Dependencies installed successfully!');
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}`));
      }
    });

    install.on('error', (err) => {
      reject(err);
    });
  });
}

// Start the bot
function startBot() {
  console.log('');
  console.log('[Startup] Starting Quantix Tickets Bot...');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');

  // Use spawn with inherit to pass through all I/O
  const bot = spawn('node', ['index.js'], {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });

  bot.on('close', (code) => {
    console.log(`[Startup] Bot exited with code ${code}`);
    process.exit(code);
  });

  bot.on('error', (err) => {
    console.error('[Startup] Failed to start bot:', err.message);
    process.exit(1);
  });

  // Handle termination signals
  process.on('SIGINT', () => {
    console.log('[Startup] Received SIGINT, shutting down...');
    bot.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('[Startup] Received SIGTERM, shutting down...');
    bot.kill('SIGTERM');
  });
}

// Main
async function main() {
  try {
    // Always install dependencies on every start
    await runNpmInstall();

    // Start the bot
    startBot();
  } catch (err) {
    console.error('[Startup] Error:', err.message);
    process.exit(1);
  }
}

main();
