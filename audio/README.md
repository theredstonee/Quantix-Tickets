# Voice Support - Wartemusik

Dieses Verzeichnis enthält die Wartemusik für das Voice Support System.

## ⚠️ WICHTIG: Musik-Datei fehlt!

**Der Bot kann keine Musik abspielen, solange keine Audio-Datei vorhanden ist!**

## Standard-Wartemusik

Die Datei `waiting-music.mp3` wird automatisch abgespielt, wenn ein User dem Voice Support Channel beitritt.

### Anforderungen an die Audio-Datei:

- **Dateiname:** `waiting-music.mp3`
- **Format:** MP3, OGG oder WAV (MP3 empfohlen)
- **Bitrate:** 128-192 kbps empfohlen
- **Dauer:** 2-5 Minuten (wird automatisch geloopt)
- **Lautstärke:** Normalisiert (wird automatisch auf 30% gesetzt)

### Installation:

1. **Lade eine lizenzfreie Wartemusik herunter:**
   - [YouTube Audio Library](https://www.youtube.com/audiolibrary) (kostenlos, keine Anmeldung)
   - [Bensound](https://www.bensound.com/) (kostenlos mit Attribution)
   - [FreePD](https://freepd.com/) (Public Domain)

2. **Konvertiere zu MP3** (falls nötig):
   ```bash
   # Mit ffmpeg (Linux/Mac)
   ffmpeg -i input.wav -b:a 192k waiting-music.mp3

   # Oder verwende Online-Tools wie:
   # https://cloudconvert.com/
   ```

3. **Kopiere die Datei hierher:**
   ```bash
   # Linux/Mac
   cp /pfad/zur/musik.mp3 audio/waiting-music.mp3

   # Windows
   copy C:\pfad\zur\musik.mp3 audio\waiting-music.mp3
   ```

4. **Überprüfen:**
   ```bash
   ls -lh audio/waiting-music.mp3
   # Die Datei sollte existieren und > 0 Bytes haben
   ```

### Eigene Musik pro Server:

Im Panel kannst du auch eigene Musik-Dateien hochladen oder einen URL-Pfad zur Musik angeben.

### Schnelltest:

```bash
# Teste ob die Datei existiert
file audio/waiting-music.mp3

# Erwartete Ausgabe:
# audio/waiting-music.mp3: Audio file with ID3 version 2.4.0
```

## Lizenzhinweis

Stelle sicher, dass du die Rechte zur Nutzung der Musik besitzt!

## Troubleshooting

**Bot joint nicht dem Voice-Channel?**
1. Überprüfe ob `waiting-music.mp3` existiert
2. Überprüfe Bot-Berechtigungen:
   - ✅ Channel ansehen
   - ✅ Verbinden
   - ✅ Sprechen
3. Überprüfe die Logs: `journalctl -u quantix-bot -f`
4. Stelle sicher, dass `GuildVoiceStates` Intent aktiviert ist (Discord Developer Portal)
