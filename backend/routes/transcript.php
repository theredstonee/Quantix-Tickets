<?php
/**
 * Transcript routes
 */

function handleGetTranscript($ticketId) {
    requireAuth();

    $transcriptFile = TRANSCRIPTS_DIR . "/transcript_{$ticketId}.html";

    if (!file_exists($transcriptFile)) {
        jsonResponse(['error' => 'Transcript not found'], 404);
    }

    $html = file_get_contents($transcriptFile);

    jsonResponse(['html' => $html]);
}
