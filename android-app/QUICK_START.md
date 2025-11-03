# Quick Start - Quantix Tickets Android App

⚡ Schnellanleitung zum Bauen und Testen der App in 5 Minuten!

## Voraussetzungen

- ✅ Android Studio installiert (Arctic Fox oder neuer)
- ✅ Android SDK (API 34) installiert
- ✅ Android-Gerät oder Emulator verfügbar

## Schritt 1: Projekt öffnen

```bash
# Im TRS-Tickets-Bot Hauptverzeichnis
cd android-app
```

1. Öffnen Sie Android Studio
2. **File** → **Open**
3. Wählen Sie den `android-app` Ordner
4. Klicken Sie **OK**

Android Studio führt automatisch Gradle Sync durch (1-2 Minuten).

## Schritt 2: App Icons generieren (Optional, aber empfohlen)

### Schnellste Methode:

1. Rechtsklick auf `res` Ordner
2. **New** → **Image Asset**
3. **Icon Type**: Launcher Icons (Adaptive and Legacy)
4. **Foreground Layer**:
   - **Asset Type**: Clipart ODER Image (Ihr eigenes Logo)
   - **Clipart**: Wählen Sie ein Icon (z.B. "ticket", "support")
   - **Resize**: 80%
5. **Background Layer**:
   - **Asset Type**: Color
   - **Color**: `#6366F1`
6. **Next** → **Finish**

**Fertig!** Icons wurden generiert.

> 💡 Für detaillierte Anleitung siehe [ICON_GUIDE.md](ICON_GUIDE.md)

## Schritt 3: App bauen und testen

### Option A: Mit Android-Gerät

1. **USB-Debugging aktivieren**:
   - Einstellungen → Über das Telefon
   - Build-Nummer **7x antippen**
   - Zurück → Entwickleroptionen
   - **USB-Debugging** aktivieren

2. **Gerät verbinden** via USB

3. **In Android Studio**:
   - Gerät im Dropdown oben auswählen
   - Auf **Run** ▶️ klicken (oder `Shift+F10`)

4. **App öffnet sich automatisch** auf Ihrem Gerät!

### Option B: Mit Emulator

1. **Emulator erstellen**:
   - **Tools** → **Device Manager**
   - **Create Device**
   - Wählen Sie z.B. "Pixel 6"
   - System Image: **API 34** (Android 14)
   - **Finish**

2. **Emulator starten**:
   - Emulator im Dropdown auswählen
   - Auf **Run** ▶️ klicken

3. **App läuft im Emulator!**

## Schritt 4: App testen

Die App sollte jetzt:
- ✅ Quantix Tickets Panel laden (https://trstickets.theredstonee.de)
- ✅ Pull-to-Refresh funktioniert (nach unten wischen)
- ✅ Zurück-Button navigiert in WebView
- ✅ Exit-Dialog beim Verlassen zeigen

## Fertig! 🎉

Die App ist jetzt:
- ✅ Installiert und lauffähig
- ✅ Mit Panel verbunden
- ✅ Bereit zum Testen

## Nächste Schritte

### Anpassungen vornehmen

**Panel-URL ändern**:
```kotlin
// MainActivity.kt, Zeile 24
private val baseUrl = "https://ihre-domain.de"
```

**App-Name ändern**:
```xml
<!-- res/values/strings.xml -->
<string name="app_name">Ihr App Name</string>
```

**Farben anpassen**:
```xml
<!-- res/values/colors.xml -->
<color name="accent_primary">#6366F1</color>
```

### Release-Build erstellen

Für Veröffentlichung siehe [README.md → Release Build](README.md#release-build-production)

## Troubleshooting

### Gradle Sync fehlgeschlagen?

```bash
# In Android Studio Terminal:
./gradlew clean
```

Dann: **File** → **Sync Project with Gradle Files**

### App stürzt ab?

1. Prüfen Sie **Logcat** (unten in Android Studio)
2. Suchen Sie nach roten Fehlermeldungen
3. Häufigster Fehler: Internetverbindung fehlt

### WebView zeigt nichts?

1. Prüfen Sie Internetverbindung
2. Öffnen Sie `chrome://inspect` in Chrome Desktop
3. Finden Sie Ihr Gerät → **Inspect** (für Web-Debugging)

### Icons fehlen?

Führen Sie Schritt 2 erneut aus. Icons sind optional für Testing, aber empfohlen.

## Hilfreiche Befehle

```bash
# Build nur (ohne Installation)
./gradlew assembleDebug

# Installieren auf verbundenem Gerät
adb install app/build/outputs/apk/debug/app-debug.apk

# Logs anzeigen
adb logcat | grep "QuantixTickets"

# Cache löschen
./gradlew clean
```

## Ressourcen

- 📖 [Vollständige Dokumentation](README.md)
- 🎨 [Icon-Generierung Guide](ICON_GUIDE.md)
- 🌐 [Quantix Tickets Panel](https://trstickets.theredstonee.de)

## Support

Probleme? Siehe [README.md → Troubleshooting](README.md#troubleshooting)

---

**Viel Erfolg! 🚀**
