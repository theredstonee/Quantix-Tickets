# 🚀 TRS Tickets - Komplette Setup-Anleitung

## 📋 Übersicht

Diese Anleitung führt dich Schritt für Schritt durch die Installation und Konfiguration von TRS Tickets.

**Architektur:**
- **Frontend**: Vite + Vue.js (moderne SPA)
- **Backend**: PHP 8+ (REST API)
- **Bot**: Python 3.10+ (discord.py)

---

## 🔧 Schritt 1: Voraussetzungen installieren

### Windows

1. **Node.js** (für Frontend-Build)
   - Download: https://nodejs.org/ (LTS Version empfohlen)
   - Installation prüfen: `node --version`

2. **PHP 8+**
   - Download: https://windows.php.net/download/
   - Zu PATH hinzufügen
   - Installation prüfen: `php -v`

3. **Python 3.10+**
   - Download: https://www.python.org/downloads/
   - Bei Installation "Add to PATH" ankreuzen
   - Installation prüfen: `python --version`

### Linux/Mac

\`\`\`bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PHP
sudo apt-get install php8.1 php8.1-curl php8.1-mbstring

# Python
sudo apt-get install python3.10 python3-pip
\`\`\`

---

## 📥 Schritt 2: Projekt vorbereiten

### 2.1 Repository klonen

\`\`\`bash
cd E:\Claude\TRS-Tickets-Bot\TRS-Tickets-Bot-main\TRS-Tickets-Bot-1
\`\`\`

### 2.2 Frontend Dependencies installieren

\`\`\`bash
cd frontend
npm install
\`\`\`

**Erwartete Ausgabe:**
\`\`\`
added 150 packages in 25s
\`\`\`

### 2.3 Python Dependencies installieren

\`\`\`bash
cd ../bot
pip install -r requirements.txt
\`\`\`

**Erwartete Ausgabe:**
\`\`\`
Successfully installed discord.py-2.3.2 aiohttp-3.9.0 ...
\`\`\`

### 2.4 PHP Backend vorbereiten

\`\`\`bash
cd ../backend
# Erstelle vendor Ordner (falls benötigt)
mkdir -p vendor
\`\`\`

---

## 🔑 Schritt 3: Discord Bot erstellen

### 3.1 Developer Portal öffnen

1. Gehe zu: https://discord.com/developers/applications
2. Klicke auf **"New Application"**
3. Name: `TRS Tickets` (oder beliebig)
4. Klicke auf **"Create"**

### 3.2 Bot erstellen

1. Gehe zu **"Bot"** im Menü
2. Klicke auf **"Add Bot"** → **"Yes, do it!"**
3. Deaktiviere **"Public Bot"** (optional)
4. Aktiviere **"Message Content Intent"** (wichtig!)
5. Aktiviere **"Server Members Intent"** (wichtig!)
6. Klicke auf **"Reset Token"** → Kopiere den Token

⚠️ **Token niemals teilen oder committen!**

### 3.3 OAuth2 konfigurieren

1. Gehe zu **"OAuth2"** → **"General"**
2. Kopiere die **Client ID**
3. Klicke auf **"Reset Secret"** → Kopiere das **Client Secret**
4. Unter **"Redirects"** füge hinzu:
   \`\`\`
   http://localhost:3000/auth/discord/callback
   \`\`\`
5. **Save Changes**

### 3.4 Bot einladen

1. Gehe zu **"OAuth2"** → **"URL Generator"**
2. Wähle **Scopes**:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Wähle **Bot Permissions**:
   - ✅ `Manage Channels`
   - ✅ `Send Messages`
   - ✅ `Manage Messages`
   - ✅ `Embed Links`
   - ✅ `Read Message History`
   - ✅ `Add Reactions`
4. Kopiere die generierte URL und öffne sie im Browser
5. Wähle deinen Server und klicke **"Authorize"**

---

## ⚙️ Schritt 4: Umgebungsvariablen konfigurieren

### 4.1 .env Datei erstellen

\`\`\`bash
# Im Hauptverzeichnis
cd E:\Claude\TRS-Tickets-Bot\TRS-Tickets-Bot-main\TRS-Tickets-Bot-1
cp .env.example .env
\`\`\`

### 4.2 .env bearbeiten

Öffne `.env` in einem Texteditor und füge ein:

\`\`\`env
# Bot Token (von Schritt 3.2)
DISCORD_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.AbCdEf.GhIjKlMnOpQrStUvWxYz

# OAuth2 Credentials (von Schritt 3.3)
CLIENT_ID=1234567890123456789
CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz123456

# Public URL (während Entwicklung)
PUBLIC_BASE_URL=http://localhost:3000
PANEL_URL=http://localhost:3000

# Session Secret (generiere einen zufälligen String)
SESSION_SECRET=mein_super_geheimer_schlüssel_12345

# Port
PHP_PORT=3000
\`\`\`

**Session Secret generieren:**
\`\`\`bash
# Linux/Mac
openssl rand -hex 32

# Windows (PowerShell)
[System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
\`\`\`

---

## 🎬 Schritt 5: System starten

### 5.1 Development Mode (3 Terminals)

**Terminal 1 - Frontend (Vite Dev Server):**
\`\`\`bash
cd frontend
npm run dev
\`\`\`

✅ Läuft auf: http://localhost:5173

**Terminal 2 - Backend (PHP Server):**
\`\`\`bash
cd ..
php -S localhost:3000 -t backend
\`\`\`

✅ Läuft auf: http://localhost:3000

**Terminal 3 - Discord Bot:**
\`\`\`bash
cd bot
python main.py
\`\`\`

✅ Output:
\`\`\`
TRSTicketsBot#1234 is ready!
Servers: 1
------
\`\`\`

### 5.2 Zugriff auf die Website

Öffne Browser: **http://localhost:5173**

---

## 🏗️ Schritt 6: Production Build

### 6.1 Frontend bauen

\`\`\`bash
cd frontend
npm run build
\`\`\`

Output wird nach `../public/` geschrieben.

### 6.2 Production starten

**Terminal 1 - PHP Server (serviert gebaute App):**
\`\`\`bash
php -S localhost:3000 -t backend
\`\`\`

**Terminal 2 - Discord Bot:**
\`\`\`bash
cd bot
python main.py
\`\`\`

Zugriff: **http://localhost:3000** (PHP serviert die gebaute Vite-App)

---

## 🧪 Schritt 7: Funktionen testen

### 7.1 Discord Bot testen

1. Gehe zu deinem Discord Server
2. Befehl eingeben: `/dashboard`
3. ✅ Bot sollte antworten mit Link zum Admin Panel

### 7.2 Web Panel testen

1. Öffne http://localhost:5173 (oder :3000 in Production)
2. Klicke auf **"Mit Discord anmelden"**
3. Autorisiere die App
4. ✅ Du solltest zur Server-Auswahl weitergeleitet werden

### 7.3 Admin Panel testen

1. Wähle deinen Server
2. ✅ Admin Panel sollte laden mit Config-Formular
3. Füge ein Topic hinzu:
   - Label: `Bug-Report`
   - Emoji: `🐞`
4. Klicke **"Speichern"**
5. ✅ Erfolgsmeldung sollte erscheinen

### 7.4 Ticket erstellen (in Discord)

1. Im Admin Panel: Klicke **"Panel senden"**
2. Wähle einen Channel
3. ✅ Panel-Message wird gesendet
4. In Discord: Klicke auf das Dropdown und wähle "Bug-Report"
5. ✅ Ticket-Channel wird erstellt

---

## 📂 Verzeichnisstruktur nach Setup

\`\`\`
TRS-Tickets-Bot-1/
├── frontend/               ← Vue.js Frontend
│   ├── node_modules/      (nach npm install)
│   ├── src/
│   └── dist/ → ../public/ (nach Build)
│
├── backend/               ← PHP API
│   ├── routes/
│   ├── index.php
│   └── config.php
│
├── bot/                   ← Python Discord Bot
│   ├── main.py
│   └── requirements.txt
│
├── configs/              ← Server Configs (automatisch erstellt)
│   └── 1234567890.json
│
├── data/                 ← Ticket Data (automatisch erstellt)
│   └── 1234567890_tickets.json
│
├── transcripts/          ← Ticket Transcripts (automatisch erstellt)
│
├── public/               ← Vite Build Output
│   ├── index.html
│   └── assets/
│
├── .env                  ← Deine Config (nicht committen!)
├── .env.example
└── package.json
\`\`\`

---

## 🔍 Troubleshooting

### Problem: Bot startet nicht

**Fehler**: `DISCORD_TOKEN not found`
- **Lösung**: Prüfe `.env` Datei im Hauptverzeichnis
- Token muss korrekt kopiert sein (kein Leerzeichen)

**Fehler**: `Missing Intents`
- **Lösung**: Aktiviere "Message Content Intent" im Discord Developer Portal

### Problem: Frontend lädt nicht

**Fehler**: `ECONNREFUSED localhost:3000`
- **Lösung**: PHP Backend muss laufen (`php -S localhost:3000 -t backend`)

**Fehler**: `404 Not Found` beim Login
- **Lösung**: Prüfe Redirect URI im Discord Developer Portal

### Problem: PHP Fehler

**Fehler**: `Call to undefined function curl_init`
- **Lösung**: PHP cURL Extension installieren:
  \`\`\`bash
  # Windows: php.ini bearbeiten, ;extension=curl auskommentieren
  # Linux: sudo apt-get install php-curl
  \`\`\`

### Problem: Python Fehler

**Fehler**: `ModuleNotFoundError: No module named 'discord'`
- **Lösung**: `pip install -r requirements.txt` im bot/ Ordner

---

## 🎨 Anpassungen

### Theme Farben ändern

Bearbeite `frontend/src/style.css`:

\`\`\`css
:root {
  --color-primary: #00b894;     /* Hauptfarbe */
  --color-primary-hover: #00a077;
}
\`\`\`

### Übersetzungen anpassen

Bearbeite `frontend/src/translations/index.js`

---

## 📊 Nächste Schritte

1. ✅ Bot funktioniert → Konfiguriere Topics und Formulare
2. ✅ Tickets erstellen → Teste Claim, Close, Priorität
3. ✅ Design anpassen → Ändere Farben und Texte
4. ✅ Production Deployment → Siehe `DEPLOYMENT.md`

---

## 🆘 Support

Bei Problemen:
1. Prüfe Console/Terminal auf Fehler
2. Öffne ein Issue: https://github.com/yourusername/trs-tickets/issues
3. Discord Support Server: [Link einfügen]

---

Made with ❤️ by Ohev Tamerin | TRS Tickets © 2025
