# Changelog

## [1.3.0] - 2025-10-20

### 🎉 Major Feature Update - Quality & Performance

Dieses Update bringt vier leistungsstarke neue Features zur Verbesserung der Ticket-Qualität, Service-Level-Überwachung und Echtzeit-Dokumentation.

### Added

#### ⭐ **Ticket-Bewertungssystem** (Free)
- Kunden können Tickets nach Schließung bewerten (1-5 Sterne)
- DM-basierte Bewertung mit optionalem Feedback-Text
- Team-Performance-Analytics im Dashboard
- Individuelle Bewertungs-Statistiken pro Team-Mitglied
- Rating-Distribution Charts
- Top-Performer Rankings mit Prozent-Anzeigen
- Konfigurierbar: DM-Versand, Feedback-Pflicht, Analytics-Anzeige
- Integration in Analytics-Dashboard (analytics.ejs)

#### ⏱️ **SLA-System mit Live-Countdown** (Pro Feature)
- Automatische SLA-Deadline-Berechnung basierend auf Priority:
  - 🔴 Priority 2 (Rot): 1 Stunde Reaktionszeit
  - 🟠 Priority 1 (Orange): 4 Stunden Reaktionszeit
  - 🟢 Priority 0 (Grün): 24 Stunden Reaktionszeit
- Discord Timestamp Integration für Live-Countdown im Embed
- ⚠️ Automatische Warnung bei 80% SLA-Fortschritt
- 🚨 Eskalation bei SLA-Überschreitung mit Role-Ping
- Background-Service läuft alle 10 Minuten
- Konfigurierbar: Warn-Prozentsatz, Eskalations-Rolle
- Visueller Fortschrittsbalken in Ticket-Embeds

#### 📎 **File-Upload System** (Basic+ Feature)
- Datei-Uploads in Ticket-Channels (bis 10MB Standard)
- Format-Validierung: png, jpg, jpeg, pdf, txt, log
- Größen-Validierung mit konfigurierbarem Limit
- Automatisches Löschen von invaliden Uploads
- Informative Fehlermeldungen mit Details
- Premium-Paywall für Free-Tier
- Panel-UI für Konfiguration (maxSizeMB, allowedFormats)

#### 📝 **Live-Transcript System** (Free)
- Echtzeit-Protokollierung aller Ticket-Nachrichten
- Dual-Format: TXT + HTML
- Automatische Initialisierung beim ersten Message
- Mention-Auflösung (User/Rolle/Channel → Namen)
- Attachment-URLs werden erfasst
- Modern gestyltes HTML-Transcript mit Dark-Theme
- Performance-optimiert: Nur aktive Tickets werden getrackt
- Transcript wird bei Close komplett neu generiert (Final Version)

### Changed

#### 🌐 **Premium-Tier Beschreibungen aktualisiert**
- **Free Tier**:
  - Hinzugefügt: Ticket-Bewertungssystem
  - Hinzugefügt: Live-Transcripts
- **Basic+ Tier**:
  - Hinzugefügt: Datei-Upload (bis 10MB)
- **Pro Tier**:
  - Hinzugefügt: SLA-System mit Live-Countdown & Eskalation
- Premium-Seiten (home.ejs, premium.ejs) komplett aktualisiert
- Feature-Flags in premium.js korrekt zugeordnet

### Technical

- SLA Helper-Funktionen: `calculateSLADeadline()`, `getSLAStatusText()`, `getSLAProgress()`
- Live-Transcript Funktion: `appendToLiveTranscript(message, ticket, guildId)`
- File-Upload Validierung in messageCreate Event-Handler
- Rating Button Handler mit Cross-Guild Ticket-Search
- Rating Modal Handler für Feedback-Erfassung
- Analytics Backend erweitert um Rating-Statistiken
- Background-Service: `startSLAChecker()` läuft alle 10 Minuten

---

## [1.2.1] - 2025-10-20

### 🛡️ Security & Spam Protection

#### Added
- **🛡️ AntiSpam System**: Umfassender Schutz vor Ticket- und Button-Spam
  - Rate-Limiting für Ticket-Erstellung (konfigurierbar: X Tickets in Y Minuten)
  - Button-Click Protection (max. 5 Klicks in 10 Sekunden)
  - Server-spezifische Konfiguration im Panel
  - Einstellbar: Max. Tickets (1-10), Zeitfenster (5-60 Minuten)
  - Schöne Fehlermeldungen mit Wartezeit-Anzeige
  - Automatisches Cleanup alter Logs alle 5 Minuten
  - Toggle zum An/Ausschalten im Panel-UI
  - Glassmorphism-Design für AntiSpam-Einstellungen
  - Memory-optimiert mit Map-basierten Logs

### Fixed
- **🐛 FAQ Button**: "Trotzdem Ticket erstellen" Button funktioniert jetzt korrekt
  - Fehler durch doppelte Interaction-Calls behoben
  - Modal wird jetzt sauber angezeigt
- **💎 Premium Feature Access**: Pro-Tier kann jetzt alle Basic+ Features nutzen
  - hasFeature() liest jetzt direkt aus PREMIUM_TIERS
  - getPremiumInfo() gibt immer aktuelle Feature-Liste zurück
  - CSV Export, /depart und andere Features jetzt für Pro verfügbar
- **🎨 Ticket Cards CSS**: Überlappung in der Ticket-Historie behoben
  - z-index, position: relative, flexbox Layout hinzugefügt
  - Grid Layout für korrekte Abstände
- **🔒 Transcript Security**: Transcripte werden nur noch vom ausgewählten Server angezeigt
  - Cross-Server Transcript-Zugriff verhindert
  - Gefährliche Fallback-Suche entfernt
- **🔘 Close Request Buttons**: Buttons werden nach Aktion korrekt deaktiviert
  - Message-ID Tracking implementiert
  - Buttons bleiben nicht mehr klickbar nach Approve/Deny
- **🌙 Dark Mode Theme**: Neue dunkelblaue Optik mit schwarzem Hintergrund
  - Accent-Farbe: #3b82f6 (Dunkelblau)
  - Hintergrund: #000000 (Schwarz)
  - Animiertes Dot-Pattern im Dark Mode deaktiviert
  - Alle 16 EJS-Seiten aktualisiert
- **📝 Modal Submit Error**: "Etwas ist schiefgelaufen" beim Ablehnen von Close Requests behoben
  - Modal-Submit Handler korrekt außerhalb des Button-Blocks platziert
  - isModalSubmit() Check hinzugefügt
- **🔐 Close Button**: Schließen-Button funktioniert jetzt
  - Fehlender 'close' Handler im switch-Statement hinzugefügt
  - Transcript-Erstellung vor Channel-Löschung
  - 5-Sekunden Verzögerung vor Löschung

### Changed
- **🎨 Theme System**: Dark Mode komplett überarbeitet
  - Von Grün (#00ff88) zu Blau (#3b82f6) gewechselt
  - Background von #0a0a0a zu #000000 geändert
  - Glass-Effekte angepasst

---

## [1.2.0] - 2025-10-19

### 🎉 Major Premium Features Release

Dieses Update bringt zahlreiche neue Premium-Features für Basic+ und Pro-Tier, sowie umfassende Analytics-Funktionen.

### Added

#### 🏷️ **Tag/Label System** (Basic+ Feature)
- Tickets können mit benutzerdefinierten Tags versehen werden (z.B. "Bug", "Dringend", "In Bearbeitung")
- `/tag add` - Tags zu Tickets hinzufügen
- `/tag remove` - Tags von Tickets entfernen
- `/tag list` - Alle verfügbaren Tags anzeigen
- Farb-kodierte Labels für bessere Übersicht im Dashboard
- Filterung nach Tags in der Ticket-Übersicht
- Panel-UI für Tag-Verwaltung mit Emoji, Name und Farbe
- Vollständige Integration in Ticket-Cards und Table-View

#### 📝 **Ticket-Vorlagen System** (Basic+ Feature)
- Admins können vordefinierte Antworten erstellen
- `/template use` - Vorlage in Ticket senden
- `/template list` - Alle Vorlagen anzeigen
- Schnellantworten per Dropdown-Menü
- Markdown-Formatierung wird unterstützt
- Custom Embed-Farben pro Vorlage
- Panel-UI für Vorlagen-Verwaltung
- Spart Zeit bei wiederkehrenden Fragen

#### 🎨 **Custom Branding** (Pro Feature)
- Eigene Embed-Farben für Tickets
- Custom Button-Texte (Claimen, Schließen, Unclaimen, Erneut öffnen)
- 4 anpassbare Farben: Primary, Success, Error, Warning
- Panel-UI mit Color-Pickern für einfache Anpassung
- Vollständige Integration in alle Ticket-Embeds

#### ✨ **VIP-User System** (Server-spezifisch)
- Nur verfügbar auf Server ID: 1403053662825222388
- `/vip add` - VIP-User hinzufügen
- `/vip remove` - VIP-User entfernen
- `/vip list` - Alle VIP-User anzeigen
- `/vip role` - VIP-Rolle festlegen
- VIP-User bekommen höchste Priorität
- Separate VIP-Queue möglich
- Channel-Namen mit ✨vip- Prefix
- Automatische Rollen-Zuweisung

#### 🏢 **Multi-Department Support** (Basic+ Feature)
- Verschiedene Abteilungen (Sales, Support, Billing) erstellen
- `/department forward` - Tickets zwischen Abteilungen weiterleiten
- `/department list` - Alle Abteilungen anzeigen
- Separate Teams pro Abteilung
- Automatische Berechtigungswechsel beim Weiterleiten
- Panel-UI für Abteilungs-Verwaltung mit Emoji, Name, Beschreibung und Team-Rolle
- Notification beim Weiterleiten mit vollständiger Historie

#### 📊 **Heatmap & Insights** (Basic+ Feature)
- Wann werden die meisten Tickets erstellt? (Stundenweise + Wochentag)
- Welche Topics sind am häufigsten?
- Durchschnittliche Lösungszeit pro Topic mit Performance-Rating
- 30-Tage Trend-Analyse
- Visualisierung mit Bar-Charts und Tabellen
- Integriert im Analytics-Dashboard

#### 📈 **Erweiterte Reports** (Pro Feature)
- CSV Export von Tickets mit allen Details
- CSV Export von Statistiken
- UTF-8 BOM für Excel-Kompatibilität
- Filterung nach Zeitraum, Status, Priorität
- Lösungszeit-Tracking in Stunden
- Export-Buttons im Analytics-Dashboard

#### 🌍 **Übersetzungen**
- Alle neuen Features vollständig übersetzt in 9 Sprachen
- Sprachen: Deutsch, Englisch, Hebräisch, Japanisch, Russisch, Portugiesisch, Spanisch, Indonesisch, Arabisch
- Custom Branding, VIP-System, Department-System vollständig lokalisiert

### Changed
- Analytics-Dashboard erweitert mit 8 neuen Visualisierungen
- Premium-System erweitert mit 8 neuen Feature-Flags
- Panel-UI erheblich erweitert (Premium-Tab um ~800 Zeilen gewachsen)
- Ticket-Dashboard unterstützt jetzt Tag-Filterung

### Technical
- Neue Handler-Dateien: `tag-handler.js`, `template-handler.js`, `department-handler.js`
- Neue Utility-Dateien: `insights-analytics.js`, `export-utils.js`
- Neue Commands: `/tag`, `/template`, `/department`, `/vip`
- Erweiterte Panel-Backend-Logik für alle neuen Features
- XSS-Protection für alle User-Inputs

---

## [1.0.4] - 2025-10-19

### Added
- 📢 **Founder Changelog Broadcast**: Founder können jetzt das Changelog an alle Log-Channels senden
  - "Changelog Broadcast" Button im Founder Panel (nur für nicht-restricted Founder)
  - Bestätigungs-Modal mit Changelog-Vorschau
  - Automatischer Versand der aktuellen Changelog-Version
  - Loading-Animation während des Sendens
  - Detaillierte Ergebnis-Anzeige: Erfolgreiche und fehlgeschlagene Server
  - Wird nur in konfigurierte Log-Channels gesendet (Server ohne Log-Channel werden übersprungen)
  - Automatische Sprach-Anpassung pro Server (9 Sprachen)
  - Professional Embed-Design mit Versions-Info und Änderungsliste
  - Vollständige Logging aller Broadcast-Aktionen

---

## [1.0.3] - 2025-10-19

### Added
- 📨 **/forward Command** (Pro Feature): Ticket-Weiterleitung an andere Team-Mitglieder
  - Nur der Claimer kann Tickets weiterleiten
  - Modal-Dialog für Grund-Eingabe
  - Professional Embed mit allen Ticket-Informationen
  - User-Ping außerhalb des Embeds
  - Annehmen/Ablehnen Buttons (nur für gepingten User)
  - Automatische Claim-Übertragung bei Annahme
  - 24h Timeout für Weiterleitung
  - Log-Events für alle Aktionen
- 📊 **Echte Uptime-Anzeige**: Homepage zeigt jetzt echte Bot-Uptime als Prozent
  - Berechnung basierend auf Laufzeit (1 Tag / 7 Tage / 30 Tage)
  - Live-Updates alle 30 Sekunden
  - Maximum 99.9% für realistisch Darstellung

### Fixed
- 👥 **Team-Rollen Server-Anzeige**: Team-Mitglieder sehen jetzt alle Server mit Team-Rolle
  - Durchläuft alle Bot-Server, nicht nur User-Guilds
  - Zeigt Server auch ohne Discord-Admin-Berechtigung

### Changed
- 🎨 **Ticket-Themen Design**: Komplett überarbeitetes Layout
  - Live-Vorschau von Emoji und Name im Header
  - 3-Spalten-Grid statt 2-Spalten
  - Größeres Emoji-Feld (zentriert, 1.5rem)
  - Professional visuelle Hierarchie
- 📋 **Panel-Embed Position**: Vom "Design"-Tab zum "Panel"-Tab verschoben
  - Bessere Übersichtlichkeit
  - Alle Panel-Einstellungen an einem Ort

---

## [1.0.2] - 2025-10-19

### Added
- 👀 **Member Counter Status**: Bot zeigt jetzt "Schaut X Members zu" als zusätzlichen Status an
- 🔐 **Automatische Mitternachts-Abmeldung**: Session-Management mit automatischem Logout um 00:00 Uhr
  - LocalStorage-basierte Session-Verwaltung
  - Visuelle Benachrichtigung vor der Abmeldung
  - Neue Datei: `public/js/auth-session.js`
  - Script in alle authentifizierten Seiten integriert

### Fixed
- 🔘 **Panel-Send-Buttons**: "Panel senden" und "Panel bearbeiten" Buttons sind jetzt sofort klickbar
  - JavaScript-basierte Aktivierung basierend auf Channel-Auswahl
  - Keine vorherige Speicherung der Einstellungen mehr nötig

### Changed
- ⏱️ **Status-Rotation**: Bot-Status wechselt jetzt alle 20 Sekunden (vorher 10 Sekunden)
- 📊 **Status-Anzeige**: 5 verschiedene Status-Typen statt 4
  - SPIELT auf X Servern
  - SPIELT vX.X.X
  - SPIELT Quantix Development
  - SPIELT !commands für Hilfe
  - SCHAUT X Members zu (NEU)

---

## [1.0.1] - 2025-10-18

### Added
- 🎨 **Startup Banner**: Beautiful ASCII art banner with system information displayed on bot startup
- 📋 **Discord Logger System**: All console logs (log, error, warn, info) are now automatically sent to Discord channel
- 🎨 **Complete Panel Redesign**: New features and improved UI/UX

### Fixed
- 🐛 **Translation Errors**: Fixed all `panel_config` translation errors using optional chaining (`?.`)
- 🔧 **Premium Management Modal**: Fixed `confirmPremiumAction` null reference error
- ✨ **Error Pages Scroll**: Fixed scroll overflow on `/founder` and `/owner` error pages

### Changed
- 📊 **Logging**: Console output now includes color-coded embeds in Discord
- 🎯 **Founder Access**: Enhanced founder panel with improved access controls

---

## [1.0.0] - 2025-10-16

### 🎉 First Stable Release

Dies ist der erste stabile Release des Quantix Tickets Bot mit vollständig modernisiertem Design und allen Core-Features.

**Alle Features von Release 0.1.0 sind enthalten:**
- Modernes Glassmorphism-Design auf allen Seiten
- Animierter Dot-Pattern-Hintergrund
- 10 komplett überarbeitete Seiten
- Bot Invite Link mit Mehrsprachen-Support
- Vollständige SEO-Optimierung
- CSS-Variablen System für konsistentes Theming
- Theme-Persistenz über localStorage und Cookies

**System Features:**
- Multi-Server Discord Ticket System
- Web Dashboard mit Discord OAuth2
- 9 Sprachen Support (DE, EN, HE, JA, RU, PT, ES, ID, AR)
- Priority-Rollen System (3-Tier Hierarchical)
- Premium System (Free, Basic, Pro, Betatester)
- Analytics Dashboard (Pro Feature)
- Email & DM Notifications (Pro Features)
- Transcript System (TXT & HTML)
- GitHub Webhook Integration
- Auto-Update System

---

## [Release 0.1.0] - 2025-10-16

### 🎨 Major Design Overhaul
- **Modern Glassmorphism Design** auf allen Seiten implementiert
  - Backdrop-filter Blur-Effekte auf allen Cards und Boxen
  - Semi-transparente Hintergründe für modernes Aussehen
  - Einheitliches Design-System mit CSS-Variablen
  - Smooth Hover-Effekte mit Transform und Shadow-Animationen

- **Animierter Dot-Pattern-Hintergrund**
  - 20s Endlos-Animation auf allen Seiten
  - Radial-Gradient Pattern für subtile Bewegung
  - Theme-bewusst (Light/Dark Mode kompatibel)

- **Komplett überarbeitete Seiten:**
  - Homepage (home.ejs) - Vollständige Landing Page mit SEO
  - Admin Panel (panel.ejs) - Glassmorphism auf allen Fieldsets
  - Analytics Dashboard (analytics.ejs) - Moderne Stat-Cards
  - Premium Page (premium.ejs) - Elegante Pricing Cards
  - Tickets Overview (tickets.ejs) - Glassmorphism Ticket-Cards
  - Server Selection (select-server.ejs) - Moderne Server-Karten
  - Ticket Detail (ticketDetail.ejs) - Animierter Hintergrund
  - Privacy Policy (privacy-policy.ejs) - Glassmorphism Info-Boxen
  - Terms of Service (terms-of-service.ejs) - Glassmorphism Info-Boxen
  - Imprint (imprint.ejs) - Glassmorphism Info-Boxen

### ✨ New Features
- **Bot Invite Link** hinzugefügt
  - Sichtbar auf Homepage für angemeldete und nicht-angemeldete Nutzer
  - Direkter Link zu https://trstickets.theredstonee.de/install
  - Mehrsprachige Unterstützung in allen 9 Sprachen

### 🔧 Improvements
- **CSS-Variablen System** für konsistentes Theming
- **Responsive Design** auf allen modernisierten Seiten
- **Verbesserte User Experience** durch flüssige Animationen
- **Theme-Persistenz** über localStorage und Cookies

### 🎯 SEO & Performance
- Meta Tags vollständig implementiert
- Open Graph Tags für Social Media
- Structured Data (JSON-LD) für bessere Indexierung
- Optimierte Load-Times durch Preconnect

---

## [Beta 0.3.9] - 2025-10-16

### Fixed
- **Broadcast-Command Filter**
  - Broadcast-Command filtert jetzt `_counter.json` und `_tickets.json` Dateien korrekt aus
  - Verhindert Fehler "Guild not found" bei Counter- und Tickets-Dateien
  - Nur echte Guild-Config-Dateien werden für Broadcasts verwendet
  - Reduziert Failed-Count und vermeidet unnötige Guild-Fetch-Versuche

---

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
