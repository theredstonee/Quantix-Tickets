<?php
/**
 * Configuration routes
 */

function handleGetConfig() {
    requireAuth();

    $guildId = $_SESSION['selectedGuild'] ?? null;
    if (!$guildId) {
        jsonResponse(['error' => 'No guild selected'], 400);
    }

    $config = loadConfig($guildId);

    // Mock channels and categories for now
    // In production, you would fetch these from Discord API
    $channels = [
        ['id' => '123', 'name' => 'general', 'type' => 0],
        ['id' => '456', 'name' => 'tickets', 'type' => 0]
    ];

    $categories = [
        ['id' => '789', 'name' => 'Tickets Category', 'type' => 4]
    ];

    jsonResponse([
        'config' => $config,
        'channels' => $channels,
        'categories' => $categories
    ]);
}

function handleSaveConfig() {
    requireAuth();

    $guildId = $_SESSION['selectedGuild'] ?? null;
    if (!$guildId) {
        jsonResponse(['error' => 'No guild selected'], 400);
    }

    $input = json_decode(file_get_contents('php://input'), true);

    // Validate and sanitize input
    $config = [
        'guildId' => $guildId,
        'topics' => $input['topics'] ?? [],
        'formFields' => $input['formFields'] ?? [],
        'ticketCategoryId' => $input['ticketCategoryId'] ?? '',
        'logChannelId' => $input['logChannelId'] ?? '',
        'transcriptChannelId' => $input['transcriptChannelId'] ?? '',
        'teamRoleId' => $input['teamRoleId'] ?? '',
        'ticketEmbed' => $input['ticketEmbed'] ?? [],
        'panelEmbed' => $input['panelEmbed'] ?? []
    ];

    saveConfig($guildId, $config);

    jsonResponse(['success' => true]);
}
