# Quantix Tickets - Android App

Native Android App für das Quantix Tickets Panel. Diese App ist ein WebView-basierter Wrapper, der eine nahtlose mobile Erfahrung für das Ticket-System bietet.

## Features

- 🌐 **WebView Integration**: Vollständig integriertes Web-Panel
- 🔄 **Pull-to-Refresh**: Aktualisierung durch Wischen nach unten
- 📱 **Material Design 3**: Moderne UI mit Gradient-Farbschema
- 🌙 **Dark Mode**: Automatische Anpassung an Systemeinstellungen
- 🔗 **Deep Linking**: Direkte Links zu Panel-Seiten
- 📊 **Progress Bar**: Visuelles Feedback beim Laden
- 🔌 **Offline Detection**: Prüfung der Internetverbindung
- ↩️ **Back Navigation**: Intelligente Zurück-Button-Behandlung
- 💾 **State Preservation**: WebView-Status bleibt erhalten
- 🔒 **HTTPS Only**: Sichere Verbindung zum Panel

## Voraussetzungen

### Software Requirements

- **Android Studio**: Arctic Fox (2020.3.1) oder neuer
- **JDK**: Version 8 oder höher
- **Android SDK**:
  - Minimum SDK: 24 (Android 7.0 Nougat)
  - Target SDK: 34 (Android 14)
  - Compile SDK: 34
- **Gradle**: 8.2.0 (automatisch von Android Studio verwaltet)
- **Kotlin**: 1.9.20

### Hardware Requirements

- Mindestens 8 GB RAM (empfohlen: 16 GB)
- 10 GB freier Speicherplatz
- Android-Gerät oder Emulator mit Android 7.0+

## Installation & Setup

### 1. Repository klonen

```bash
cd TRS-Tickets-Bot-1/android-app
```

Das Projekt ist bereits im Hauptrepository enthalten.

### 2. Android Studio öffnen

1. Starten Sie Android Studio
2. Wählen Sie **File** → **Open**
3. Navigieren Sie zum `android-app` Ordner
4. Klicken Sie auf **OK**

### 3. Gradle Sync

Android Studio führt automatisch einen Gradle-Sync durch. Falls nicht:

1. Klicken Sie auf **File** → **Sync Project with Gradle Files**
2. Warten Sie, bis alle Dependencies heruntergeladen sind

### 4. App Icons generieren

Siehe [ICON_GUIDE.md](ICON_GUIDE.md) für detaillierte Anweisungen zur Icon-Generierung.

**Schnellstart** (Android Studio):
1. Rechtsklick auf `res` → **New** → **Image Asset**
2. Wählen Sie Ihr Logo (512x512 PNG empfohlen)
3. Passen Sie Farbe und Form an (#6366F1 für Hintergrund)
4. Klicken Sie auf **Next** → **Finish**

## Build & Run

### Debug Build (Development)

1. **Über Android Studio**:
   - Wählen Sie ein Gerät oder starten Sie einen Emulator
   - Klicken Sie auf **Run** (▶️) oder drücken Sie `Shift+F10`

2. **Über Command Line**:
   ```bash
   # Windows
   .\gradlew assembleDebug

   # Linux/Mac
   ./gradlew assembleDebug
   ```
   APK-Datei wird erstellt in: `app/build/outputs/apk/debug/app-debug.apk`

### Release Build (Production)

#### 1. Keystore erstellen

Erstellen Sie einen Keystore zum Signieren der App:

```bash
keytool -genkey -v -keystore quantix-tickets.keystore -alias quantix -keyalg RSA -keysize 2048 -validity 10000
```

**Wichtig**: Speichern Sie Keystore-Passwort sicher! Ohne dieses können Sie keine Updates veröffentlichen.

#### 2. Keystore-Konfiguration

Erstellen Sie `keystore.properties` im App-Root (wird von .gitignore ignoriert):

```properties
storeFile=../quantix-tickets.keystore
storePassword=IHR_KEYSTORE_PASSWORT
keyAlias=quantix
keyPassword=IHR_KEY_PASSWORT
```

#### 3. build.gradle anpassen

Fügen Sie in `app/build.gradle` hinzu (vor `android {}`):

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            // ... rest of release config
        }
    }
}
```

#### 4. Release APK bauen

```bash
# Windows
.\gradlew assembleRelease

# Linux/Mac
./gradlew assembleRelease
```

Signierte APK: `app/build/outputs/apk/release/app-release.apk`

#### 5. App Bundle für Google Play

```bash
# Windows
.\gradlew bundleRelease

# Linux/Mac
./gradlew bundleRelease
```

AAB-Datei: `app/build/outputs/bundle/release/app-release.aab`

## Installation auf Gerät

### Via Android Studio

1. Verbinden Sie Ihr Android-Gerät via USB
2. Aktivieren Sie **USB-Debugging** auf dem Gerät:
   - Einstellungen → Über das Telefon → Build-Nummer (7x antippen)
   - Einstellungen → Entwickleroptionen → USB-Debugging aktivieren
3. Klicken Sie auf **Run** in Android Studio

### Via APK-Datei

1. Kopieren Sie die APK auf Ihr Gerät
2. Öffnen Sie die APK-Datei auf dem Gerät
3. Bestätigen Sie die Installation (Unbekannte Quellen müssen erlaubt sein)

### Via ADB

```bash
# APK installieren
adb install app/build/outputs/apk/debug/app-debug.apk

# Bestehende App ersetzen
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Projekt-Struktur

```
android-app/
├── app/
│   ├── src/
│   │   └── main/
│   │       ├── java/com/quantix/tickets/
│   │       │   └── MainActivity.kt          # Haupt-Activity mit WebView
│   │       ├── res/
│   │       │   ├── layout/
│   │       │   │   └── activity_main.xml    # UI Layout
│   │       │   ├── values/
│   │       │   │   ├── colors.xml           # Farbdefinitionen (Gradient)
│   │       │   │   ├── strings.xml          # String-Ressourcen
│   │       │   │   └── themes.xml           # Light Theme
│   │       │   ├── values-night/
│   │       │   │   └── themes.xml           # Dark Theme
│   │       │   ├── xml/
│   │       │   │   ├── backup_rules.xml     # Backup-Regeln
│   │       │   │   └── data_extraction_rules.xml
│   │       │   └── mipmap-*/                # App Icons (zu generieren)
│   │       └── AndroidManifest.xml          # App-Manifest
│   ├── build.gradle                         # App-spezifische Gradle-Config
│   └── proguard-rules.pro                   # ProGuard-Regeln
├── build.gradle                             # Projekt-weite Gradle-Config
├── settings.gradle                          # Gradle-Settings
├── gradle.properties                        # Gradle-Eigenschaften
└── README.md                                # Diese Datei
```

## Konfiguration

### Panel-URL ändern

In `MainActivity.kt` (Zeile 24):

```kotlin
private val baseUrl = "https://trstickets.theredstonee.de"
```

Ändern Sie dies zu Ihrer eigenen Panel-URL.

### App-Name ändern

In `res/values/strings.xml`:

```xml
<string name="app_name">Quantix Tickets</string>
```

### Farben anpassen

In `res/values/colors.xml` können Sie die Gradient-Farben anpassen:

```xml
<color name="accent_primary">#6366F1</color>      <!-- Indigo -->
<color name="accent_secondary">#8B5CF6</color>    <!-- Purple -->
<color name="accent_tertiary">#D946EF</color>     <!-- Pink -->
```

### Version ändern

In `app/build.gradle`:

```gradle
defaultConfig {
    versionCode 1        // Build-Nummer (für Google Play)
    versionName "1.0.0"  // Sichtbare Version
}
```

## Debugging

### Logcat verwenden

In Android Studio → **Logcat** Tab:

**Filter für diese App**:
```
package:com.quantix.tickets
```

**WebView Console Logs**:
```
tag:WebView
```

### Chrome DevTools

1. Öffnen Sie Chrome auf Ihrem Computer
2. Navigieren Sie zu `chrome://inspect`
3. Finden Sie Ihre App in der Liste
4. Klicken Sie auf **Inspect**

Dies ermöglicht Debugging des WebView-Inhalts wie eine normale Webseite.

## Troubleshooting

### Problem: Gradle Sync fehlgeschlagen

**Lösung**:
```bash
# Gradle Cache löschen
rm -rf ~/.gradle/caches/

# Im Projekt-Verzeichnis
./gradlew clean
```

### Problem: App stürzt beim Start ab

**Lösung**:
1. Prüfen Sie Logcat auf Fehlermeldungen
2. Stellen Sie sicher, dass alle Dependencies korrekt sind
3. Führen Sie **Build** → **Clean Project** durch
4. Führen Sie **Build** → **Rebuild Project** durch

### Problem: WebView zeigt leere Seite

**Lösung**:
1. Prüfen Sie Internetverbindung
2. Prüfen Sie Panel-URL in MainActivity.kt
3. Prüfen Sie SSL-Zertifikat der Panel-URL
4. Prüfen Sie Logcat für WebView-Fehler

### Problem: Keine App-Icons sichtbar

**Lösung**: Siehe [ICON_GUIDE.md](ICON_GUIDE.md) für Icon-Generierung

## Features & Implementierung

### WebView-Konfiguration

- **JavaScript**: Aktiviert für volle Funktionalität
- **DOM Storage**: Aktiviert für Web-Storage-APIs
- **Mixed Content**: Erlaubt (nur für HTTPS-Hauptseite)
- **Zoom**: Aktiviert, Zoom-Controls ausgeblendet
- **Safe Browsing**: Aktiviert auf Android 8.0+

### Netzwerk-Features

- **Verbindungsprüfung**: Beim Start und bei Pull-to-Refresh
- **Offline-Dialog**: Zeigt Fehlermeldung wenn keine Verbindung
- **Auto-Retry**: Nutzer kann Verbindung erneut versuchen

### UI-Features

- **Progress Bar**: Zeigt Ladefortschritt oben
- **Swipe-to-Refresh**: 3-farbiger Gradient-Spinner
- **Exit-Bestätigung**: Dialog beim Beenden via Zurück-Button
- **Navigation**: WebView-Historie für Zurück-Button

## Performance-Optimierung

### ProGuard (Release Build)

- Code-Obfuskation aktiviert
- Ressourcen-Shrinking aktiviert
- Logging entfernt in Release-Builds
- WebView-Klassen werden nicht obfuskiert

### WebView-Performance

- Hardware-Beschleunigung aktiviert
- Render-Priorität: HIGH
- Cache-Mode: LOAD_DEFAULT

## Sicherheit

### Permissions

- `INTERNET`: Erforderlich für WebView-Zugriff
- `ACCESS_NETWORK_STATE`: Für Verbindungsprüfung
- `ACCESS_WIFI_STATE`: Für WLAN-Statusprüfung

### SSL/TLS

- Nur HTTPS-Verbindungen erlaubt
- Cleartext-Traffic deaktiviert
- Safe Browsing aktiviert

### Deep Linking

- Domain-Verifizierung aktiviert
- Nur Panel-URLs werden intern geöffnet
- Externe Links öffnen im Browser

## Veröffentlichung

### Google Play Store

1. **Erstellen Sie ein Developer-Konto** bei Google Play Console
2. **Erstellen Sie eine neue App**
3. **Füllen Sie alle erforderlichen Informationen aus**:
   - App-Name, Beschreibung, Screenshots
   - Datenschutzrichtlinie-URL
   - Kategorisierung
4. **Laden Sie die AAB-Datei hoch** (aus Step 5 oben)
5. **Durchlaufen Sie den Review-Prozess**

### Alternative Distribution

- **APK-Download**: Hosten Sie die APK auf Ihrer Website
- **Beta-Testing**: Firebase App Distribution, Google Play Beta
- **Enterprise**: Managed Google Play für Unternehmen

## Support & Kontakt

- **GitHub**: [TRS-Tickets-Bot Repository](https://github.com/theredstonee/TRS-Tickets-Bot)
- **Website**: https://trstickets.theredstonee.de
- **Discord**: [Support Server einladen]

## Lizenz

© 2025 Quantix Tickets by Theredstonee. Alle Rechte vorbehalten.

## Changelog

### Version 1.0.0 (2025-01-03)
- 🎉 Erste Release-Version
- 🌐 WebView-Integration mit Panel
- 🔄 Pull-to-Refresh Funktion
- 🌙 Material Design 3 mit Dark Mode
- 🔗 Deep Linking Support
- 🔌 Offline-Detection
- 📊 Progress Bar für Ladefortschritt
