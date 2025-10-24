/**
 * Startup Banner for Quantix Tickets Bot
 * Displays beautiful ASCII art and system information at startup
 */

const { version: nodeVersion } = require('process');
const { version: discordVersion } = require('discord.js');
const { VERSION, RELEASE_DATE } = require('./version.config');

// ANSI Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

function showBanner() {
  const banner = `
${colors.cyan}${colors.bright}
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║     ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗██╗  ██╗                ║
║    ██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝██║╚██╗██╔╝                ║
║    ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ██║ ╚███╔╝                 ║
║    ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ██║ ██╔██╗                 ║
║    ╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██║██╔╝ ██╗                ║
║     ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═╝                ║
║                                                                            ║
║                      ${colors.white}Quantix Tickets Bot${colors.cyan}    ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`;

  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

  const info = `
${colors.magenta}🎫 ${colors.white}${colors.bright}Quantix Tickets Bot${colors.reset}       ${colors.gray}v${VERSION}${colors.reset}
${colors.green}🤖 ${colors.white}Discord Bot System${colors.reset}        ${colors.gray}Beta v0.6.7${colors.reset}
${colors.cyan}📅 ${colors.white}Starting:${colors.reset}                  ${colors.gray}${timestamp}${colors.reset}
${colors.yellow}⚡ ${colors.white}Node.js Version:${colors.reset}           ${colors.gray}${nodeVersion}${colors.reset}
${colors.magenta}🔷 ${colors.white}Discord.js Version:${colors.reset}        ${colors.gray}${discordVersion}${colors.reset}

${colors.green}🔧 Initialisiere Bot-System...${colors.reset}
${'═'.repeat(80)}
`;

  console.log(banner);
  console.log(info);
}

module.exports = { showBanner };
