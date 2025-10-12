<?php
/**
 * TRS Tickets - PHP Backend API
 * Version: 0.3.0
 * Main entry point for all API routes
 */

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

session_start();

// CORS Headers
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get request path
$requestUri = $_SERVER['REQUEST_URI'];
$path = parse_url($requestUri, PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// API Router
switch (true) {
    // Auth routes
    case $path === '/api/auth/me':
        require __DIR__ . '/routes/auth.php';
        handleAuthMe();
        break;

    case $path === '/login':
        require __DIR__ . '/routes/auth.php';
        handleLogin();
        break;

    case $path === '/logout':
        require __DIR__ . '/routes/auth.php';
        handleLogout();
        break;

    case $path === '/auth/discord/callback':
        require __DIR__ . '/routes/auth.php';
        handleDiscordCallback();
        break;

    // Server routes
    case $path === '/api/servers' && $method === 'GET':
        require __DIR__ . '/routes/servers.php';
        handleGetServers();
        break;

    case $path === '/api/select-server' && $method === 'POST':
        require __DIR__ . '/routes/servers.php';
        handleSelectServer();
        break;

    // Config routes
    case $path === '/api/config' && $method === 'GET':
        require __DIR__ . '/routes/config.php';
        handleGetConfig();
        break;

    case $path === '/api/config' && $method === 'POST':
        require __DIR__ . '/routes/config.php';
        handleSaveConfig();
        break;

    // Tickets routes
    case $path === '/api/tickets' && $method === 'GET':
        require __DIR__ . '/routes/tickets.php';
        handleGetTickets();
        break;

    // Transcript route
    case preg_match('/^\/api\/transcript\/(\d+)$/', $path, $matches):
        require __DIR__ . '/routes/transcript.php';
        handleGetTranscript($matches[1]);
        break;

    // Serve Vite build for all other routes (SPA)
    default:
        if (file_exists(__DIR__ . '/../public/index.html')) {
            readfile(__DIR__ . '/../public/index.html');
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Route not found']);
        }
        break;
}
