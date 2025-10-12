<?php
/**
 * Server management routes
 */

function handleGetServers() {
    requireAuth();

    $guilds = $_SESSION['guilds'] ?? [];
    $availableServers = [];

    // Filter guilds where user has admin permissions
    foreach ($guilds as $guild) {
        $permissions = intval($guild['permissions']);
        $isAdmin = ($permissions & 0x8) === 0x8; // Administrator permission

        if ($isAdmin) {
            $availableServers[] = [
                'id' => $guild['id'],
                'name' => $guild['name'],
                'icon' => $guild['icon'] ? "https://cdn.discordapp.com/icons/{$guild['id']}/{$guild['icon']}.png" : null
            ];
        }
    }

    jsonResponse([
        'servers' => $availableServers,
        'currentGuild' => $_SESSION['selectedGuild'] ?? null
    ]);
}

function handleSelectServer() {
    requireAuth();

    $input = json_decode(file_get_contents('php://input'), true);
    $guildId = $input['guildId'] ?? null;

    if (!$guildId) {
        jsonResponse(['error' => 'Guild ID required'], 400);
    }

    // Verify user has access to this guild
    $guilds = $_SESSION['guilds'] ?? [];
    $hasAccess = false;

    foreach ($guilds as $guild) {
        if ($guild['id'] === $guildId) {
            $permissions = intval($guild['permissions']);
            $hasAccess = ($permissions & 0x8) === 0x8;
            break;
        }
    }

    if (!$hasAccess) {
        jsonResponse(['error' => 'Access denied'], 403);
    }

    $_SESSION['selectedGuild'] = $guildId;

    jsonResponse(['success' => true, 'guildId' => $guildId]);
}
