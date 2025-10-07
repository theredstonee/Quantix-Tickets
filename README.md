# 🎫 TRS Tickets Bot

Ein professioneller Discord-Ticket-Bot mit Web-Dashboard und dynamischen Formularen für Discord-Server.

## ✨ Features

### Ticket-System
- 📋 **Dynamische Formulare** - Konfigurierbare Eingabefelder pro Ticket-Kategorie
- 🎨 **Prioritätssystem** - 3 Stufen (🟢 Grün, 🟠 Orange, 🔴 Rot)
- ✅ **Claim-System** - Team-Mitglieder können Tickets beanspruchen
- 📄 **Automatische Transcripts** - HTML & TXT Export bei Ticket-Schließung
- 🔒 **Berechtigungssystem** - Automatische Channel-Permissions für Ersteller & Team
- 🏷️ **Themen/Topics** - Mehrere konfigurierbare Ticket-Kategorien

### Web-Dashboard
- 🌐 **Admin-Panel** - Webbasierte Konfiguration
- 🔐 **Discord OAuth** - Sichere Anmeldung über Discord
- 📊 **Ticket-Übersicht** - Alle Tickets mit Filter & Sortierung
- 🎨 **Dark Theme** - Modernes Schwarz-Grün Design
- 📱 **Responsive** - Funktioniert auf Desktop & Mobile

### Management-Befehle
- `/dashboard` - Link zum Web-Dashboard anzeigen
- `/reload` - Bot-Konfiguration neu laden
- `/restart` - Bot neu starten
- `/update` - Neueste Version von GitHub ziehen & neu starten

## 🚀 Installation

### Voraussetzungen
- Node.js 16.x oder höher
- Git
- Discord Bot Application ([Discord Developer Portal](https://discord.com/developers/applications))

### Setup

1. **Repository klonen**
   ```bash
   git clone <repository-url>
   cd TRS-Tickets-Bot-1
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren**

   Erstelle eine `.env` Datei:
   ```env
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_client_id
   CLIENT_SECRET=your_client_secret
   PUBLIC_BASE_URL=https://your-domain.com
   SESSION_SECRET=random_secret_string
   ```

4. **Bot-Konfiguration anpassen**

   Bearbeite `config.json`:
   ```json
   {
     "guildId": "YOUR_GUILD_ID",
     "ticketCategoryId": "CATEGORY_ID",
     "logChannelId": "LOG_CHANNEL_ID",
     "transcriptChannelId": "TRANSCRIPT_CHANNEL_ID"
   }
   ```

5. **Bot starten**
   ```bash
   node index.js
   ```

   Der Bot startet auf Port 3000 (Web-Panel).

## ⚙️ Konfiguration

### Ticket-Kategorien (Topics)

Definiere Ticket-Themen im Web-Dashboard oder direkt in `config.json`:

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
- `topic`: Optional - Feld nur für bestimmte Topics anzeigen

### Ticket-Embed Anpassung

Passe das Ticket-Embed im Web-Dashboard an mit folgenden Platzhaltern:
- `{ticketNumber}` - Ticket-Nummer
- `{userMention}` - User-Mention (@User)
- `{userId}` - User-ID
- `{topicLabel}` - Topic-Name
- `{topicValue}` - Topic-Wert

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
- ✅ **Claim** - Ticket beanspruchen
- 🔄 **Unclaim** - Claim aufheben (nur Claimer)
- 🔺 **Priorität Hoch** - Priorität erhöhen
- 🔻 **Priorität Herab** - Priorität senken
- 🔒 **Schließen** - Ticket schließen
- ➕ **Nutzer** - Zusätzlichen Nutzer hinzufügen

**Slash-Befehle:**
- `/dashboard` - Dashboard-Link anzeigen
- `/reload` - Config neu laden
- `/restart` - Bot neu starten
- `/update` - Update von GitHub & Neustart

### Web-Dashboard

**Zugriff:** `https://your-domain.com/panel`

**Features:**
- ⚙️ Topics & Kategorien verwalten
- 📝 Formular-Felder konfigurieren
- 🎨 Embed-Design anpassen
- 📊 Ticket-Verlauf ansehen
- 📄 Transcripts herunterladen

## 🔐 Berechtigungen

### Bot-Permissions
- View Channels
- Send Messages
- Manage Channels
- Manage Permissions
- Read Message History

### Team-Rolle
Definiert in `index.js` - Konstante `TEAM_ROLE`:
```javascript
const TEAM_ROLE = 'YOUR_TEAM_ROLE_ID';
```

## 📁 Projekt-Struktur

```
TRS-Tickets-Bot-1/
├── index.js              # Hauptdatei (Bot-Logic)
├── panel.js              # Web-Dashboard (Express Router)
├── config.json           # Bot-Konfiguration
├── tickets.json          # Ticket-Datenbank
├── ticketCounter.json    # Ticket-Zähler
├── commands/             # Slash-Commands
│   ├── dashboard.js
│   ├── reload.js
│   ├── restart.js
│   └── update.js
├── views/                # EJS Templates
│   ├── panel.ejs         # Admin-Panel
│   └── tickets.ejs       # Ticket-Übersicht
└── .env                  # Umgebungsvariablen
```

## 🛠️ Technologien

- **Discord.js v14** - Discord Bot Framework
- **Express.js** - Web-Server
- **Passport.js** - Discord OAuth
- **EJS** - Template Engine
- **Node.js** - Runtime

## 📝 Lizenz

Dieses Projekt ist für den privaten/Server-internen Gebrauch bestimmt.

## 🐛 Fehler melden

Bei Problemen oder Feature-Wünschen erstelle ein Issue im Repository oder kontaktiere das Entwickler-Team.

## 📮 Support

- Discord: [Server-Link]
- Website: [Website-Link]

---

**Dingnator TRS Tickets ©️**
