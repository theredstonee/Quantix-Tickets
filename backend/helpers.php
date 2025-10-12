<?php
/**
 * Helper functions for TRS Tickets
 */

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit();
}

function requireAuth() {
    if (!isset($_SESSION['user'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}

function getConfigPath($guildId) {
    return CONFIG_DIR . "/{$guildId}.json";
}

function loadConfig($guildId) {
    $path = getConfigPath($guildId);
    if (!file_exists($path)) {
        return [
            'guildId' => $guildId,
            'topics' => [],
            'formFields' => [],
            'ticketCategoryId' => '',
            'logChannelId' => '',
            'transcriptChannelId' => '',
            'teamRoleId' => '',
            'ticketEmbed' => [
                'title' => '🎫 Ticket #{ticketNumber}',
                'description' => 'Hallo {userMention}\n**Thema:** {topicLabel}',
                'color' => '#2b90d9',
                'footer' => 'TRS Tickets ©️'
            ],
            'panelEmbed' => [
                'title' => '🎫 Ticket System',
                'description' => 'Wähle dein Thema',
                'color' => '#5865F2',
                'footer' => 'TRS Tickets ©️'
            ]
        ];
    }
    return json_decode(file_get_contents($path), true);
}

function saveConfig($guildId, $config) {
    $path = getConfigPath($guildId);
    file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT));
}

function getTicketsPath($guildId) {
    return TICKETS_DIR . "/{$guildId}_tickets.json";
}

function loadTickets($guildId) {
    $path = getTicketsPath($guildId);
    if (!file_exists($path)) return [];
    return json_decode(file_get_contents($path), true) ?: [];
}

function saveTickets($guildId, $tickets) {
    $path = getTicketsPath($guildId);
    file_put_contents($path, json_encode($tickets, JSON_PRETTY_PRINT));
}

function discordRequest($endpoint, $token, $method = 'GET', $data = null) {
    $ch = curl_init(DISCORD_API_BASE . $endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json'
    ]);

    if ($method !== 'GET') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    }
    if ($data) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 400) {
        return null;
    }

    return json_decode($response, true);
}
