# Uptime Robot Setup - TRS Tickets Bot

Anleitung zur Einrichtung von Uptime Robot für Bot-Status-Monitoring.

## Features

✅ Health Check Endpoint (`/health`)
✅ Öffentliche Status-Seite (`/status`)
✅ JSON API für Status-Abfragen
✅ Automatische Uptime-Überwachung
✅ Discord-Bot Status (online/offline)
✅ Uptime, Guilds, Ping Metriken

## Endpoints

### 1. `/health` - Health Check (für Uptime Robot)

**URL:** `https://deine-domain.de/health`

**Antwort bei Bot ONLINE (200 OK):**
```json
{
  "status": "online",
  "uptime": 86400,
  "uptimeFormatted": "1d 0h 0m 0s",
  "guilds": 5,
  "ping": 45,
  "version": "Beta 0.3.2",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Antwort bei Bot OFFLINE (503 Service Unavailable):**
```json
{
  "status": "offline",
  "message": "Bot ist offline",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### 2. `/status` - Öffentliche Status-Seite

**URL:** `https://deine-domain.de/status`

Schöne HTML-Seite mit:
- 🟢/🔴 Status Badge (ONLINE/OFFLINE)
- Bot Name und Version
- Uptime (formatiert)
- Server-Anzahl
- Ping zu Discord
- Automatische Aktualisierung alle 30 Sekunden

## Uptime Robot Einrichtung

### Schritt 1: Uptime Robot Account erstellen

1. Gehe zu https://uptimerobot.com
2. Erstelle kostenlosen Account
3. Bestätige E-Mail

### Schritt 2: Monitor erstellen

1. **Dashboard** → **Add New Monitor**
2. **Monitor Type:** HTTP(s)
3. **Friendly Name:** TRS Tickets Bot
4. **URL:** `https://deine-domain.de/health`
5. **Monitoring Interval:** 5 minutes (kostenlos)
6. **Monitor Timeout:** 30 seconds
7. **Alert Contacts:** Deine E-Mail hinzufügen

### Schritt 3: Erweiterte Einstellungen

**HTTP Method:** GET

**Keyword (optional):**
Keyword: `online`
Keyword Type: exists

Das prüft, ob das Wort "online" in der Antwort vorkommt.

**Custom HTTP Headers (optional):**
```
User-Agent: UptimeRobot/2.0
```

### Schritt 4: Alerts konfigurieren

1. **Alert Contacts** → **Add Alert Contact**
2. E-Mail, SMS, Webhook, Discord Webhook, etc.
3. Bei **Discord Webhook**:
   - Erstelle Webhook in Discord Channel
   - Kopiere Webhook URL
   - Füge in Uptime Robot ein

### Schritt 5: Status Badge (optional)

1. **Monitor** öffnen
2. **Badge URL** kopieren
3. Badge in README.md einfügen:

```markdown
![Bot Status](https://img.shields.io/uptimerobot/status/m123456789-abcdef)
![Uptime](https://img.shields.io/uptimerobot/ratio/7/m123456789-abcdef)
```

## Status-Seite in Website einbinden

### Option 1: Link zur Status-Seite

```html
<a href="https://deine-domain.de/status" target="_blank">
  Bot Status prüfen
</a>
```

### Option 2: iFrame einbetten

```html
<iframe
  src="https://deine-domain.de/status"
  width="600"
  height="500"
  frameborder="0"
  style="border-radius: 10px;">
</iframe>
```

### Option 3: Uptime Robot Public Status Page

1. **Dashboard** → **Create Status Page**
2. **Domain:** `status.deine-domain.de` (optional)
3. **Monitors:** TRS Tickets Bot auswählen
4. **Customize:** Logo, Farben, Text
5. **Publish**

Beispiel: https://status.uptimerobot.com/xxxxx

## Benachrichtigungen

### Discord Webhook Alert

1. Discord Server → Channel Settings → Integrations → Webhooks
2. **Create Webhook**
3. Name: "Bot Status"
4. Channel auswählen
5. **Copy Webhook URL**
6. Uptime Robot → Alert Contacts → Add Alert Contact
7. Type: **Webhook**
8. **Webhook URL:** Discord Webhook URL einfügen
9. **POST Value:**
```json
{
  "content": "*monitorFriendlyName* ist *monitorAlertType*!\nURL: *monitorURL*\nZeit: *alertDateTime*"
}
```

### E-Mail Alerts

Standardmäßig aktiviert. Du erhältst E-Mails bei:
- ⬇️ Bot geht offline
- ⬆️ Bot geht wieder online
- ⏱️ Bot antwortet langsam (> 30s)

## API Integration

### Status abfragen mit cURL

```bash
# Health Check
curl https://deine-domain.de/health

# Mit Pretty Print
curl -s https://deine-domain.de/health | jq .
```

### Status abfragen mit JavaScript

```javascript
fetch('https://deine-domain.de/health')
  .then(res => res.json())
  .then(data => {
    console.log('Bot Status:', data.status);
    console.log('Uptime:', data.uptimeFormatted);
    console.log('Guilds:', data.guilds);
    console.log('Ping:', data.ping);
  });
```

### Status abfragen mit Python

```python
import requests

response = requests.get('https://deine-domain.de/health')
data = response.json()

print(f"Bot Status: {data['status']}")
print(f"Uptime: {data['uptimeFormatted']}")
print(f"Guilds: {data['guilds']}")
print(f"Ping: {data['ping']}ms")
```

## Monitoring-Metriken

### Was wird überwacht?

- ✅ **Bot Online/Offline** - Discord Client Status
- ✅ **Uptime** - Wie lange läuft der Bot
- ✅ **Guild Count** - Anzahl Server
- ✅ **Ping** - Latenz zu Discord
- ✅ **Response Time** - API Antwortzeit
- ✅ **HTTP Status** - 200 OK oder 503 Fehler

### Uptime-Statistiken

Uptime Robot zeigt:
- **Last 24 Hours** - Uptime der letzten 24h
- **Last 7 Days** - Wöchentliche Uptime
- **Last 30 Days** - Monatliche Uptime
- **Response Times** - Durchschnittliche Antwortzeiten
- **Downtime Log** - Alle Ausfälle mit Dauer

## Troubleshooting

### Bot zeigt "offline" obwohl er online ist

**Problem:** Health Check Endpoint antwortet mit 503

**Lösungen:**
1. Prüfe, ob Bot wirklich online ist: `/status` im Browser öffnen
2. Prüfe Discord Bot Status im Discord Developer Portal
3. Logs checken: `console.log` in `/health` Endpoint
4. Bot neu starten: `pm2 restart trs-bot`

### Uptime Robot zeigt "Down"

**Mögliche Ursachen:**
- Bot ist wirklich offline
- Server/Hosting ist down
- Firewall blockiert Uptime Robot IPs
- SSL-Zertifikat abgelaufen
- Domain-Name falsch konfiguriert

**Fix:**
1. Status-Seite manuell im Browser öffnen
2. Server-Logs prüfen
3. Firewall-Regeln prüfen
4. SSL erneuern (Let's Encrypt)

### False Positives (Bot online, aber Alert)

**Ursache:** Netzwerk-Probleme oder Timeout zu kurz

**Fix:**
1. Uptime Robot → Monitor Settings
2. **Monitor Timeout:** auf 60 seconds erhöhen
3. **Monitoring Interval:** auf 10 minutes erhöhen (weniger false alerts)

### Alerts kommen nicht an

1. Prüfe Alert Contacts sind aktiv
2. Prüfe E-Mail nicht im Spam
3. Prüfe Discord Webhook URL korrekt
4. Teste Alert: **Monitor → Test Alert**

## Best Practices

### 1. Monitoring Interval

- **5 Minutes** (kostenlos) - Gut für Produktion
- **1 Minute** (bezahlt) - Besser für kritische Bots
- **30 Seconds** (bezahlt) - Enterprise-Level

### 2. Multiple Monitors

Erstelle separate Monitors für:
- `/health` - Bot Status
- `/panel` - Web Panel erreichbar
- `/login` - OAuth funktioniert

### 3. Status-Seite teilen

- Füge Link in Discord Bot Bio hinzu
- Teile mit Server-Admins
- Zeige auf Website

### 4. Maintenance Windows

Bei geplanten Wartungen:
1. Uptime Robot → Monitor
2. **Pause Monitoring**
3. Wartung durchführen
4. **Resume Monitoring**

## Kosten

**Free Plan:**
- 50 Monitors
- 5-Minuten Intervall
- E-Mail Alerts
- 2 Monate Log-Historie

**Pro Plan ($7/Monat):**
- 1-Minuten Intervall
- SMS Alerts
- Mehr Alert Contacts
- Custom Domains für Status-Seiten
- 12 Monate Log-Historie

Für TRS Tickets Bot reicht der **Free Plan** vollkommen aus!

## Support

Bei Fragen:
- Uptime Robot Docs: https://uptimerobot.com/docs
- Discord: Im Support-Kanal fragen
- GitHub Issues: https://github.com/TheRedstoneE/TRS-Tickets-Bot

---

**Status:** ✅ Uptime Robot Integration aktiv
**Version:** Beta 0.3.2
**Letzte Aktualisierung:** 2025-01-15
