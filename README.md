# 🎫 Quantix Tickets Bot

**Version:** Beta 0.3.5

Ein professioneller Multi-Server Discord-Ticket-Bot mit Web-Dashboard, Multi-Language-Support und dynamischen Formularen für Discord-Server.

## ✨ Features

### 🎫 Ticket-System
- 📋 **Dynamische Formulare** - Konfigurierbare Eingabefelder pro Ticket-Kategorie
- 🎨 **Prioritätssystem** - 3 Stufen (🟢 Grün, 🟠 Orange, 🔴 Rot) mit automatischer Farbe & Channel-Umbenennung
- 👥 **Priority-based Role Access** - Unterschiedliche Team-Rollen pro Prioritätsstufe
- ✅ **Claim-System** - Team-Mitglieder können Tickets beanspruchen
- 📄 **Automatische Transcripts** - Moderne HTML & TXT Exports bei Ticket-Schließung
- 🔒 **Berechtigungssystem** - Automatische Channel-Permissions für Ersteller & Team
- 🏷️ **Themen/Topics** - Mehrere konfigurierbare Ticket-Kategorien
- ➕ **User hinzufügen** - Weitere Nutzer zum Ticket hinzufügen

### 🌐 Web-Dashboard
- 🌍 **Multi-Server Support** - Ein Bot für unbegrenzt viele Server
- 🔐 **Discord OAuth** - Sichere Anmeldung über Discord
- 📊 **Ticket-Übersicht** - Alle Tickets mit Usernames & Filter
- 🎨 **Dark Theme** - Modernes Schwarz-Grün Design
- 📱 **Responsive** - Funktioniert perfekt auf Desktop & Mobile
- ⚙️ **Server-Konfiguration** - Channel-Dropdowns, Role-Management, GitHub Integration
- 🏆 **Priority Role Management** - Team-Rollen pro Prioritätsstufe konfigurieren
- 📄 **Transcript Viewer** - HTML-Transcripts direkt im Browser ansehen

### 🌍 Multi-Language Support
- 🇩🇪 **Deutsch** - Vollständige deutsche Übersetzung
- 🇬🇧 **English** - Full English translation
- 🇮🇱 **עברית (Hebrew)** - תמיכה מלאה בעברית
- 🇯🇵 **日本語 (Japanese)** - 完全な日本語翻訳
- 🇷🇺 **Русский (Russian)** - Полный русский перевод
- 🇵🇹 **Português (Portuguese)** - Tradução completa em português
- 🔄 **Server-Sprache** - `/language` Command für Server-Language
- 👤 **User-Sprache** - `/userlanguage` Command für persönliche Web-Panel-Sprache

### 🔐 Security & Deployment
- 🔑 **Application Key System** - Verhindert unbefugte Bot-Nutzung nach Clone
- 🗑️ **Auto-Cleanup** - Alte Server-Daten werden nach 2 Monaten automatisch gelöscht
- 📝 **Changelog System** - Automatisches Changelog für Updates

### 📡 GitHub Integration
- 🔔 **Commit Logs** - Automatische Commit-Benachrichtigungen in Discord
- 🎨 **Rich Embeds** - Schöne Embed-Darstellung für Commits
- ⚙️ **Toggle Command** - `/github-commits` zum Aktivieren/Deaktivieren

### 💬 Slash Commands
- `/dashboard` - Link zum Web-Dashboard anzeigen
- `/version` - Bot-Version und Changelog anzeigen
- `/status` - Bot-Status-Seite Link
- `/language` - Server-Sprache einstellen (Admin-only)
- `/userlanguage` - Persönliche Web-Panel-Sprache wählen
- `/github-commits` - GitHub Commit Logs aktivieren/deaktivieren
- `/broadcast` - Update-Nachricht an alle Server senden (Bot-Owner only)
- `/reload` - Bot-Konfiguration neu laden
- `/restart` - Bot neu starten
- `/update` - Neueste Version von GitHub ziehen & neu starten

## 🚀 Installation

### Voraussetzungen
- Node.js 16.x oder höher
- Discord Bot Application ([Discord Developer Portal](https://discord.com/developers/applications))

### 🔐 Security Notice

Dieser Bot verwendet ein **Application Key System** zum Schutz vor unbefugter Nutzung:

- Der Bot benötigt eine `app.key` Datei und passende `.env` Konfiguration
- Ohne diese Dateien startet der Bot nicht
- Diese Dateien sind aus Sicherheitsgründen nicht im Repository enthalten

**Für Zugriff auf den Bot kontaktiere bitte:**
- 💬 **Discord Server:** [dc.theredstonee.de](https://dc.theredstonee.de)
- 🌐 **Website:** [theredstonee.de](https://theredstonee.de)

### 📦 Dependencies

```bash
npm install
```

**Hauptabhängigkeiten:**
- discord.js v14
- express
- passport
- passport-discord
- ejs
- dotenv

### 🚀 Production Deployment mit PM2

Für Production-Einsatz empfehlen wir PM2 für automatisches Neustart und Process-Management:

```bash
# PM2 global installieren
npm install -g pm2

# Bot mit PM2 starten
pm2 start ecosystem.config.js

# PM2 Commands
pm2 list              # Alle Prozesse anzeigen
pm2 logs trs-tickets-bot   # Logs anzeigen
pm2 restart trs-tickets-bot  # Bot neu starten
pm2 stop trs-tickets-bot     # Bot stoppen
pm2 delete trs-tickets-bot   # Prozess entfernen

# PM2 Auto-Start beim Server-Neustart
pm2 startup           # Generiert Start-Script
pm2 save              # Speichert aktuelle Prozessliste
```

### 🔄 Manuelles Update

Der Bot unterstützt **manuelle Updates** (Auto-Pull über GitHub Webhooks wurde entfernt):

#### Manuelles Update:

```bash
# Änderungen holen
git pull

# Dependencies aktualisieren (falls nötig)
npm install

# Bot neu starten (PM2 Beispiel)
pm2 restart trs-tickets-bot

# Oder über Discord Command (erfordert Admin)
/update
```

#### Hinweise:

- Führe Updates nur aus vertrauenswürdigen Quellen aus.
- Teste Änderungen idealerweise zunächst in einer Staging-/Dev-Umgebung.

## ⚙️ Konfiguration

**Empfohlen**: Nutze das Web-Dashboard (`/dashboard`) für einfache Konfiguration!

### Multi-Server Support

Der Bot unterstützt unbegrenzt viele Server gleichzeitig:
- Jeder Server hat seine eigene Konfiguration in `configs/{guildId}.json`
- Jeder Server hat eigene Tickets in `configs/{guildId}_tickets.json`
- Jeder Server hat einen eigenen Ticket-Counter in `configs/{guildId}_counter.json`

### Ticket-Kategorien (Topics)

Definiere Ticket-Themen im Web-Dashboard oder direkt in der Server-Config:

```json
"topics": [
  {
    "label": "Bug-Report",
    "value": "bug",
    "emoji": "🐞"
  },
  {
    "label": "Server-Probleme",
    "value": "server",
    "emoji": "🛠️"
  }
]
```

### Priority-based Role Access

Konfiguriere verschiedene Team-Rollen pro Prioritätsstufe im Web-Dashboard:

```json
"priorityRoles": {
  "0": ["ROLE_ID_1", "ROLE_ID_2"],
  "1": ["ROLE_ID_3"],
  "2": ["ROLE_ID_4", "ROLE_ID_5"]
}
```

- **Stufe 0 (🟢 Grün)**: Basis-Support-Team
- **Stufe 1 (🟠 Orange)**: Erweitertes Support-Team
- **Stufe 2 (🔴 Rot)**: Senior-Support / Admins

### Formular-Felder

Konfiguriere dynamische Formular-Felder, die beim Ticket-Erstellen ausgefüllt werden:

```json
"formFields": [
  {
    "label": "Wie heißt du in Minecraft?",
    "id": "mcname",
    "style": "short",
    "required": true
  },
  {
    "label": "Beschreibe dein Anliegen",
    "id": "beschreibung",
    "style": "paragraph",
    "required": true,
    "topic": "bug"
  }
]
```

**Optionen:**
- `style`: `"short"` (Textfeld) oder `"paragraph"` (Textbereich)
- `required`: `true` oder `false`
- `topic`: Optional - Feld nur für bestimmte Topics anzeigen (String oder Array)

### Ticket-Embed Anpassung

Passe das Ticket-Embed im Web-Dashboard an mit folgenden Platzhaltern:
- `{ticketNumber}` - Ticket-Nummer
- `{userMention}` - User-Mention (@User)
- `{userId}` - User-ID
- `{topicLabel}` - Topic-Name
- `{topicValue}` - Topic-Wert

### GitHub Webhook Integration

1. Erstelle einen Webhook in deinem GitHub Repository
2. Webhook URL: `https://yourdomain.com/github/webhook`
3. Content type: `application/json`
4. Events: `push` oder `Just the push event`
5. Konfiguriere den Log-Channel im Web-Dashboard
6. Toggle Commit-Logs mit `/github-commits`

## 📖 Verwendung

### Für Nutzer

1. Öffne den Ticket-Channel mit dem Panel
2. Wähle ein Thema aus dem Dropdown-Menü
3. Fülle das Formular aus (falls konfiguriert)
4. Dein privater Ticket-Channel wird erstellt

**Buttons im Ticket:**
- 🔒 **Schließungsanfrage** - Anfrage zum Schließen an Team senden
- ❓ **Request Close** - Schließung beantragen

### Für Team-Mitglieder

**Ticket-Buttons:**
- ✅ **Claim** - Ticket beanspruchen (nur für Team-Rolle & Priority-Rollen)
- 🔄 **Unclaim** - Claim aufheben (nur Claimer)
- 🔺 **Priorität Hoch** - Priorität erhöhen (0 → 1 → 2)
- 🔻 **Priorität Herab** - Priorität senken (2 → 1 → 0)
- 🔒 **Schließen** - Ticket schließen (nur Team)
- ➕ **Nutzer** - Zusätzlichen Nutzer hinzufügen (nur Team)

**Slash-Befehle:**
- `/dashboard` - Dashboard-Link anzeigen
- `/version` - Bot-Version & Changelog anzeigen
- `/status` - Status-Seite Link
- `/language` - Server-Sprache einstellen (Admin-only)
- `/userlanguage` - Persönliche Web-Panel-Sprache wählen
- `/github-commits` - GitHub Commit Logs toggle
- `/broadcast` - Update an alle Server (Bot-Owner only)
- `/reload` - Config neu laden
- `/restart` - Bot neu starten
- `/update` - Update von GitHub & Neustart

### Web-Dashboard

**Zugriff:** Nutze `/dashboard` Command oder öffne `https://yourdomain.com/panel`

**Features:**
- 🌐 **Server-Auswahl** - Zwischen mehreren Servern wechseln
- ⚙️ **Server-Einstellungen** - Channel-Dropdowns, Role-Management
- 🏷️ **Topics & Kategorien** - Ticket-Kategorien verwalten
- 📝 **Formular-Felder** - Dynamische Felder konfigurieren
- 🎨 **Embed-Design** - Ticket & Panel Embeds anpassen
- 🏆 **Priority Roles** - Team-Rollen pro Priorität zuweisen
- 📡 **GitHub Integration** - Webhook Channel konfigurieren
- 📊 **Ticket-Verlauf** - Alle Tickets mit Usernames ansehen
- 📄 **Transcripts** - HTML & TXT Transcripts direkt im Browser ansehen
- 🌍 **Multi-Language** - Interface in Deutsch, English oder עברית

## 🔐 Berechtigungen

### Bot-Permissions
- View Channels
- Send Messages
- Manage Channels
- Manage Permissions
- Read Message History
- Manage Messages (für Auto-Delete)

### Privileged Intents (Developer Portal)
⚠️ **Wichtig:** Aktiviere im Discord Developer Portal unter "Bot":
- ✅ **Server Members Intent**
- ✅ **Message Content Intent** (für Auto-Delete bei geclaimten Tickets)

### Team-Rollen
Konfigurierbar im Web-Dashboard:
- **teamRoleId** - Basis Team-Rolle (hat immer Zugriff)
- **priorityRoles** - Object mit Rollen pro Priorität (0, 1, 2)

Team-Mitglieder benötigen Admin oder "Manage Guild" Berechtigung für das Web-Dashboard.

## 📁 Projekt-Struktur

```
TRS-Tickets-Bot-1/
├── index.js                    # Hauptdatei (Bot-Logic + Security)
├── panel.js                    # Web-Dashboard (Express + OAuth)
├── auto-update.js              # (Legacy) früheres Auto-Update per Webhook
├── translations.js             # Multi-Language System (de, en, he, ja, ru, pt)
├── version.config.js           # Zentrale VERSION Variable & Konfiguration
├── ecosystem.config.js         # PM2 Konfiguration für Production
├── app.key                     # 🔐 Application Key (NICHT in Git!)
├── config.json                 # Legacy Config (optional)
├── tickets.json                # Legacy Tickets (optional)
├── ticketCounter.json          # Legacy Counter (optional)
├── changelog.json              # Version Changelog
├── update.log                  # 📝 (Legacy) Auto-Update Activity Log
├── configs/                    # Multi-Server Konfigurationen
│   ├── {guildId}.json          # Server-Konfiguration
│   ├── {guildId}_tickets.json  # Server-Tickets
│   └── {guildId}_counter.json  # Server-Counter
├── commands/                   # Slash-Commands
│   ├── dashboard.js            # Dashboard-Link
│   ├── version.js              # Version & Changelog
│   ├── status.js               # Status-Seite Link
│   ├── language.js             # Server-Sprache (renamed from setlanguage.js)
│   ├── userlanguage.js         # User Web-Panel Sprache
│   ├── github-commits.js       # GitHub Commit Logs Toggle
│   ├── broadcast.js            # Update-Broadcast (Owner-only)
│   ├── reload.js               # Config & Commands neu laden
│   ├── restart.js              # Bot neu starten
│   └── update.js               # Git pull & Neustart
├── views/                      # EJS Templates
│   ├── panel.ejs               # Admin-Panel (Multi-Server)
│   ├── tickets.ejs             # Ticket-Übersicht
│   ├── ticketDetail.ejs        # Ticket-Details
│   ├── transcript.ejs          # Transcript Viewer
│   ├── imprint.ejs             # Impressum
│   ├── privacy.ejs             # Datenschutz
│   └── terms.ejs               # Nutzungsbedingungen
├── public/                     # Statische Assets
│   └── flags/                  # SVG Flaggen für Language-Support
├── transcript_*.html           # Generated Transcripts (ignoriert)
├── transcript_*.txt            # Generated Transcripts (ignoriert)
├── .env                        # 🔐 Umgebungsvariablen (NICHT in Git!)
├── .env.example                # Environment Variables Template
├── .gitignore                  # Git Ignore Rules
├── README.md                   # Diese Datei
├── CLAUDE.md                   # Claude Code Dokumentation
├── package.json                # NPM Dependencies
├── package-lock.json           # NPM Lock File
└── logs/                       # PM2 Logs (auto-created)
    ├── error.log               # Error Logs
    ├── out.log                 # Standard Output
    └── combined.log            # Combined Logs
```

## 🛠️ Technologien

- **Discord.js v14** - Discord Bot Framework mit Full Intents
- **Express.js** - Web-Server für Dashboard & Webhooks
- **Passport.js** - Discord OAuth 2.0 Integration
- **EJS** - Template Engine für dynamische Views
- **Node.js 16+** - JavaScript Runtime
- **Express-Session** - Session Management
- **Body-Parser** - Request Parsing

## 📝 Lizenz

**Alle Rechte vorbehalten © Theredstonee**

Dieses Projekt ist urheberrechtlich geschützt. Die Nutzung, Vervielfältigung, Änderung oder Weitergabe des Codes ist ohne ausdrückliche schriftliche Genehmigung des Urhebers untersagt.

**Für Lizenzanfragen kontaktiere:**
- 💬 Discord: [dc.theredstonee.de](https://dc.theredstonee.de)
- 🌐 Website: [theredstonee.de](https://theredstonee.de)

## 🐛 Fehler melden & Contribution

Bei Problemen oder Feature-Wünschen:
1. Erstelle ein Issue im [GitHub Repository](https://github.com/TheRedstoneE/TRS-Tickets-Bot/issues)
2. Nutze `/status` für die Live-Status-Seite
3. Kontaktiere das Entwickler-Team auf Discord

**Pull Requests** sind willkommen! Bitte beachte:
- Teste deine Änderungen gründlich
- Dokumentiere neue Features
- Folge dem bestehenden Code-Style
- Halte den Code sauber und professionell

## 📮 Support & Links

- 🌐 **Website:** [theredstonee.de](https://theredstonee.de)
- 💬 **Discord Server:** [dc.theredstonee.de](https://dc.theredstonee.de)
- 🎫 **Ticket Panel:** [tickets.quantix-bot.de](https://tickets.quantix-bot.de)
- 📊 **Status Page:** [status.theredstonee.de](https://status.theredstonee.de)
- 💻 **GitHub:** [github.com/TheRedstoneE/TRS-Tickets-Bot](https://github.com/TheRedstoneE/TRS-Tickets-Bot)

## ✨ Features Highlights

### Version Beta 0.3.5 (2025-10-13)
- 🌐 **Neue Sprachen** - Japanisch (🇯🇵), Russisch (🇷🇺), Portugiesisch (🇵🇹) hinzugefügt
- 📦 **Zentrales Version-Management** - Alle Versionen verwenden zentrale VERSION Variable
- 🎌 **Sprach-Flaggen** - Verbesserte Sprachauswahl mit Unicode Flaggen
- 🔧 **Code-Struktur verbessert** - Bessere Wartbarkeit und Organisation
- ✨ **Zentrale Konfiguration** - Einfachere Version-Updates durch version.config.js

### Kern-Features
- 🌍 **Multi-Server** - Unbegrenzt viele Server mit einem Bot
- 🌐 **Multi-Language** - Deutsch, English, עברית, 日本語, Русский, Português (6 Sprachen)
- 👥 **Priority Roles** - Team-Rollen basierend auf Ticket-Priorität
- 🔐 **Security System** - Application Key verhindert unbefugte Nutzung
- 📄 **Modern Transcripts** - HTML mit Dark Theme & Mobile Support
- 🔔 **GitHub Webhooks** - Automatische Commit-Benachrichtigungen
- 🗑️ **Auto-Cleanup** - 2-Monats automatische Datenlöschung
- 📋 **Dynamic Forms** - Topic-spezifische Eingabefelder
- 🎨 **Dark Dashboard** - Modernes Schwarz-Grün Design

## 🔄 Changelog

Siehe [changelog.json](./changelog.json) für die vollständige Versionshistorie.

**Latest Changes (Beta 0.3.5):**
- New languages: Japanese, Russian, Portuguese added
- Centralized version management system implemented
- Language flags for improved language selection
- Improved codebase structure and maintainability
- All components now use centralized VERSION variable
- Easier version updates through centralized configuration

---

**Quantix Tickets © 2025 Theredstonee • Alle Rechte vorbehalten**

**Version:** Beta 0.3.5 | **Status:** [status.theredstonee.de](https://status.theredstonee.de)
