# TRS Tickets Bot - Python Edition

Discord.js Bot auf Python portiert mit discord.py und Flask.

## Struktur

```
├── main.py                 # Haupteintrag (startet Bot + Web-Panel)
├── bot.py                  # Discord Bot (discord.py)
├── web_panel.py           # Flask Web-Panel (OAuth, Admin)
├── config.py              # Config-Verwaltung (Multi-Server)
├── requirements.txt       # Python Dependencies
├── .env                   # Umgebungsvariablen
├── .env.example          # Beispiel-.env-Datei
├── utils/
│   ├── __init__.py
│   ├── translations.py    # Übersetzungssystem
│   ├── helpers.py         # Helper-Funktionen, Rate-Limiting
│   └── transcripts.py     # Transcript-Generierung
├── templates/            # Jinja2-Templates (für Flask)
│   └── base.html        # Basis-Template
├── translations/        # JSON-Übersetzungen (de, en, he)
├── configs/            # Server-spezifische Configs
└── public/            # Static Files (CSS/JS)
```

## Installation

### 1. Python-Version

Benötigt Python 3.9 oder höher.

```bash
python --version
```

### 2. Virtuelle Umgebung (empfohlen)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 3. Dependencies installieren

```bash
pip install -r requirements.txt
```

### 4. Umgebungsvariablen konfigurieren

Kopiere `.env.example` zu `.env` und fülle die Werte aus:

```bash
cp .env.example .env
```

Bearbeite `.env`:

```env
DISCORD_TOKEN=dein_bot_token
CLIENT_ID=deine_client_id
CLIENT_SECRET=dein_client_secret
SESSION_SECRET=zufälliger_geheimer_schlüssel
PUBLIC_BASE_URL=https://deine-domain.com
PANEL_URL=https://deine-domain.com/panel
PORT=3000
```

### 5. Bot starten

```bash
# Option 1: Bot + Web-Panel zusammen
python main.py

# Option 2: Separat (für Development)
# Terminal 1:
python bot.py

# Terminal 2:
python web_panel.py
```

## Unterschiede zur JavaScript-Version

### Vorteile

- **Type Hints**: Bessere Code-Dokumentation und IDE-Support
- **Async/Await**: Nativ in Python 3.9+
- **Einfachere Syntax**: Python ist oft lesbarer
- **Pathlib**: Moderne Pfadverwaltung
- **Weniger Dependencies**: Python hat viele Features eingebaut

### Anpassungen

1. **Konfiguration**: Weiterhin JSON-basiert, kompatibel mit alter Version
2. **Bot Framework**: discord.py statt discord.js
3. **Web Framework**: Flask statt Express
4. **Templates**: Jinja2 statt EJS
5. **Sessions**: Flask-Session statt express-session

## Wichtige Funktionen

### Bot (bot.py)

- Slash Commands (`/dashboard`, `/setlanguage`)
- Select Menus (Topic-Auswahl)
- Buttons (Close, Claim, Priority, Add User)
- Modals (Formulare für Tickets)
- Ticket-System mit Prioritäten
- Multi-Server-Support
- Rate-Limiting für Kanal-Umbenennungen

### Web-Panel (web_panel.py)

- Discord OAuth2-Login
- Server-Auswahl
- Admin-Panel für Config
- Ticket-History
- Transcript-Anzeige
- Multi-Language-Support

### Helper-Module

- **config.py**: Multi-Server-Config-Verwaltung
- **utils/translations.py**: Übersetzungssystem (de, en, he)
- **utils/helpers.py**: Rate-Limiting, Embed-Builder
- **utils/transcripts.py**: HTML/TXT-Transcript-Generierung

## Kompatibilität

Die Python-Version ist vollständig kompatibel mit den bestehenden Config-Dateien:

- `configs/*.json` (Server-Configs)
- `configs/*_tickets.json` (Ticket-Daten)
- `configs/*_counter.json` (Ticket-Nummern)
- `translations/*.json` (Übersetzungen)

Du kannst die JavaScript- und Python-Version parallel betreiben, solange sie unterschiedliche Bot-Tokens verwenden.

## Migration von JavaScript

1. Kopiere `.env` Datei
2. Kopiere `configs/` Verzeichnis
3. Kopiere `translations/` Verzeichnis
4. Installiere Python-Dependencies
5. Starte Python-Bot

Die Config-Dateien sind kompatibel!

## Troubleshooting

### Bot startet nicht

- Überprüfe `DISCORD_TOKEN` in `.env`
- Stelle sicher, dass alle Dependencies installiert sind
- Überprüfe Python-Version (>= 3.9)

### Web-Panel funktioniert nicht

- Überprüfe `CLIENT_ID`, `CLIENT_SECRET` in `.env`
- Stelle sicher, dass `PUBLIC_BASE_URL` korrekt ist
- OAuth Redirect URL muss in Discord-App konfiguriert sein

### Buttons/Modals funktionieren nicht

- discord.py 2.3.2+ erforderlich
- Überprüfe Bot-Intents in Discord Developer Portal

## Development

### Code-Style

Projekt folgt PEP 8 Python-Stil-Richtlinien.

```bash
# Formatierung
black *.py utils/*.py

# Linting
pylint *.py utils/*.py
```

### Testing

```bash
# Unit-Tests (wenn vorhanden)
pytest

# Bot-Test
python bot.py  # Starte nur Bot
```

## Support

Bei Fragen oder Problemen:
1. Überprüfe README
2. Überprüfe `.env` Konfiguration
3. Überprüfe Discord Developer Portal
4. Erstelle Issue auf GitHub

## Lizenz

Gleiches wie Original-Bot.

---

**Version:** Alpha 1.0 (Python)
**Basiert auf:** TRS Tickets Bot v6.4 (JavaScript)
