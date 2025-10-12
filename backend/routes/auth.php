<?php
/**
 * Authentication routes
 */

function handleAuthMe() {
    if (!isset($_SESSION['user'])) {
        jsonResponse(['user' => null, 'selectedGuild' => null]);
    }

    jsonResponse([
        'user' => $_SESSION['user'],
        'selectedGuild' => $_SESSION['selectedGuild'] ?? null
    ]);
}

function handleLogin() {
    $params = http_build_query([
        'client_id' => DISCORD_CLIENT_ID,
        'redirect_uri' => DISCORD_REDIRECT_URI,
        'response_type' => 'code',
        'scope' => 'identify guilds guilds.members.read'
    ]);

    header('Location: ' . DISCORD_OAUTH_AUTHORIZE . '?' . $params);
    exit();
}

function handleLogout() {
    session_destroy();
    header('Location: /');
    exit();
}

function handleDiscordCallback() {
    if (!isset($_GET['code'])) {
        jsonResponse(['error' => 'No code provided'], 400);
    }

    $code = $_GET['code'];

    // Exchange code for access token
    $ch = curl_init(DISCORD_OAUTH_TOKEN);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'client_id' => DISCORD_CLIENT_ID,
        'client_secret' => DISCORD_CLIENT_SECRET,
        'grant_type' => 'authorization_code',
        'code' => $code,
        'redirect_uri' => DISCORD_REDIRECT_URI
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/x-www-form-urlencoded'
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        jsonResponse(['error' => 'Failed to exchange code'], 500);
    }

    $tokenData = json_decode($response, true);
    $accessToken = $tokenData['access_token'];

    // Get user info
    $user = discordRequest('/users/@me', $accessToken);
    if (!$user) {
        jsonResponse(['error' => 'Failed to get user info'], 500);
    }

    // Get user guilds
    $guilds = discordRequest('/users/@me/guilds', $accessToken);
    if (!$guilds) {
        jsonResponse(['error' => 'Failed to get guilds'], 500);
    }

    $_SESSION['user'] = [
        'id' => $user['id'],
        'username' => $user['username'],
        'avatar' => $user['avatar'],
        'discriminator' => $user['discriminator']
    ];
    $_SESSION['guilds'] = $guilds;
    $_SESSION['access_token'] = $accessToken;

    header('Location: /select-server');
    exit();
}
