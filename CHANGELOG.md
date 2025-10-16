# Changelog

## [Beta 0.3.8] - 2025-10-16

### Added
- **Discord Embeds in Transcripts**
  - Discord Embeds werden jetzt vollständig in Ticket-Transcripts angezeigt
  - HTML-Transcripts zeigen Embeds mit Discord-ähnlichem Styling
  - TXT-Transcripts enthalten Embed-Inhalte als formatierten Text
  - Unterstützt: Titel, Beschreibung, Felder, Footer und Embed-Farben
  - Mention-Resolution funktioniert auch in Embed-Inhalten
  - XSS-Protection durch HTML-Entity-Encoding

- **Support Discord Server Link**
  - Neuer Button für den Support Discord Server (https://dc.theredstonee.de/) auf der Homepage
  - Support-Link auch im Admin Panel verfügbar
  - Mehrsprachige Beschriftung in allen 9 unterstützten Sprachen
  - Öffnet in neuem Tab mit `target="_blank"` und `rel="noopener noreferrer"`

### Changed
- **Transcript System**: Erweiterte CSS-Styles für Embed-Darstellung mit Discord-artiger Optik

---

## [Beta 0.3.7] - 2025-10-15

### Added
- **Discord DM-Benachrichtigungen** (Pro Feature)
  - Team-Mitglieder können per Discord DM über neue Tickets benachrichtigt werden
  - Konfigurierbar über das Web-Panel (User-IDs Textarea)
  - DM-Embed enthält Ticket-ID, Kategorie, Ersteller und Formular-Daten
  - Automatische Fehlerbehandlung bei fehlgeschlagenen DMs
  - Feature-Gate: Nur für Pro-Tier verfügbar
  - Neue Datei: `dm-notifications.js` mit vollständiger Implementierung

- **Analytics Dashboard** (Pro Feature)
  - Umfassende Ticket-Statistiken mit Visualisierungen
  - Übersichts-Cards: Gesamt-Tickets, Geschlossene, Offene, Geclaimte
  - Bar-Chart für Tickets nach Kategorie/Thema
  - Prioritäts-Verteilung (Grün/Orange/Rot)
  - Top-Claimer Tabelle mit Ticket-Anzahl
  - Zeitbasierte Statistiken: Heute, letzte 7 Tage, letzte 30 Tage, Durchschnitt pro Tag
  - Neue Route: `/analytics` mit Pro-Feature-Check
  - Neue Datei: `views/analytics.ejs` mit vollständigem Dashboard
  - Navigation-Button im Panel (nur für Pro-User sichtbar)

### Changed
- **Discord Markdown Formatting**: Alle Discord-Nachrichten nutzen jetzt Discord's natives Markdown (`**text**`) statt HTML-Tags (`<strong>text</strong>`)
  - Aktualisiert in allen 9 Sprachen: Deutsch, Englisch, Arabisch, Spanisch, Hebräisch, Portugiesisch, Russisch, Japanisch, Indonesisch
  - Betrifft Priority-Änderungen, Sprach-Änderungen und Log-Nachrichten
  - Bessere Darstellung in Discord-Clients

### Fixed
- **Navigation-Button**: "Zurück zum Dashboard" Button in `premium.ejs` verweist jetzt korrekt auf `/panel` statt `/dashboard`
- **Premium Features**: `dmNotifications` Feature-Flag wurde zu allen drei Tier-Definitionen hinzugefügt

---

## [Beta 0.3.6] - 2025-10-14

### Changed
- **Claim/Unclaim System Permissions**: Team-Rolle hat keinen automatischen Zugriff mehr auf geclaimte Tickets
  - Nur noch Creator, Claimer und hinzugefügte Nutzer haben Zugriff auf geclaimte Tickets
  - Hierarchische Priority-Rollen bleiben weiterhin aktiv und funktionsfähig
  - Verbesserte Sicherheit und Privatsphäre für geclaimte Tickets

### Removed
- **Chinesische Sprache entfernt**: Komplette Entfernung der chinesischen Sprachunterstützung
  - `zh.json` Translation-Datei gelöscht
  - Chinesische Flagge aus dem Web-Interface entfernt
  - Alle chinesischen Sprachoptionen aus Commands entfernt
  - Language-Selector aktualisiert

### Fixed
- Potentielle Startup-Fehler durch fehlerhafte zh.json Syntax behoben (durch Entfernung)

---

## [Beta 0.3.5] - 2025-10-13

### Added
- Hierarchisches Priority-System implementiert
  - Rot (Priority 2) sieht alle Tickets (2+1+0)
  - Orange (Priority 1) sieht Orange + Grün (1+0)
  - Grün (Priority 0) sieht nur Grüne Tickets (0)
- Neue Funktion `getHierarchicalPriorityRoles()` für hierarchische Zugriffskontrolle
- Priority-Rollen werden jetzt beim Claim/Unclaim korrekt berücksichtigt

### Changed
- `updatePriority()` Funktion nutzt jetzt hierarchische Priority-Rollen
- Claim-System wurde überarbeitet für bessere Rollenintegration
- Unclaim-System stellt jetzt korrekt alle hierarchischen Rollen wieder her

### Fixed
- Claim-System berücksichtigt jetzt Priority-Rollen in den Berechtigungen
- Unclaim-System stellt Priority-Rollen korrekt wieder her
- Priority-Änderungen aktualisieren Channel-Berechtigungen hierarchisch

---

## Ältere Versionen

Für ältere Versionen siehe Git-Commit-Historie.
