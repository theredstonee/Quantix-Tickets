#!/usr/bin/env node
/**
 * Quantix Tickets Bot - Startup Script
 * Automatically installs dependencies before starting the bot
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = __dirname;

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           Quantix Tickets Bot - Startup                    ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Check if node_modules exists or package-lock.json changed
function needsInstall() {
  const nodeModulesPath = path.join(ROOT_DIR, 'node_modules');
  const packageLockPath = path.join(ROOT_DIR, 'package-lock.json');
  const installMarkerPath = path.join(ROOT_DIR, 'node_modules', '.install_marker');

  // No node_modules folder
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('[Startup] node_modules not found - install required');
    return true;
  }

  // Check if package-lock.json changed since last install
  if (fs.existsSync(packageLockPath) && fs.existsSync(installMarkerPath)) {
    const lockStat = fs.statSync(packageLockPath);
    const markerStat = fs.statSync(installMarkerPath);

    if (lockStat.mtime > markerStat.mtime) {
      console.log('[Startup] package-lock.json changed - install required');
      return true;
    }
  } else if (!fs.existsSync(installMarkerPath)) {
    console.log('[Startup] Install marker not found - install required');
    return true;
  }

  return false;
}

// Run npm install
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
        // Create install marker
        const markerPath = path.join(ROOT_DIR, 'node_modules', '.install_marker');
        fs.writeFileSync(markerPath, new Date().toISOString());
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
    // Check and install dependencies if needed
    if (needsInstall()) {
      await runNpmInstall();
    } else {
      console.log('[Startup] Dependencies up to date');
    }

    // Start the bot
    startBot();
  } catch (err) {
    console.error('[Startup] Error:', err.message);
    process.exit(1);
  }
}

main();
