<?php
/**
 * Tickets routes
 */

function handleGetTickets() {
    requireAuth();

    $guildId = $_SESSION['selectedGuild'] ?? null;
    if (!$guildId) {
        jsonResponse(['error' => 'No guild selected'], 400);
    }

    $tickets = loadTickets($guildId);

    jsonResponse(['tickets' => $tickets]);
}
