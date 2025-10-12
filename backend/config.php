<?php
/**
 * TRS Tickets - Configuration
 */

// Load environment variables
if (file_exists(__DIR__ . '/../.env')) {
    $lines = file(__DIR__ . '/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[trim($name)] = trim($value);
    }
}

// Configuration constants
define('DISCORD_CLIENT_ID', $_ENV['CLIENT_ID'] ?? '');
define('DISCORD_CLIENT_SECRET', $_ENV['CLIENT_SECRET'] ?? '');
define('DISCORD_REDIRECT_URI', ($_ENV['PUBLIC_BASE_URL'] ?? 'http://localhost:3000') . '/auth/discord/callback');
define('SESSION_SECRET', $_ENV['SESSION_SECRET'] ?? 'ticketbotsecret');

// Paths
define('CONFIG_DIR', __DIR__ . '/../configs');
define('TICKETS_DIR', __DIR__ . '/../data');
define('TRANSCRIPTS_DIR', __DIR__ . '/../transcripts');

// Create directories if they don't exist
if (!is_dir(CONFIG_DIR)) mkdir(CONFIG_DIR, 0755, true);
if (!is_dir(TICKETS_DIR)) mkdir(TICKETS_DIR, 0755, true);
if (!is_dir(TRANSCRIPTS_DIR)) mkdir(TRANSCRIPTS_DIR, 0755, true);

// Discord API URLs
define('DISCORD_API_BASE', 'https://discord.com/api/v10');
define('DISCORD_OAUTH_AUTHORIZE', 'https://discord.com/api/oauth2/authorize');
define('DISCORD_OAUTH_TOKEN', 'https://discord.com/api/oauth2/token');
