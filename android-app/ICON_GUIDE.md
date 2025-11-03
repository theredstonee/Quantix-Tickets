# App Icon Generierung - Quantix Tickets

Dieser Guide erklärt, wie Sie professionelle App-Icons für die Quantix Tickets Android App erstellen.

## Übersicht

Android benötigt Icons in verschiedenen Größen für unterschiedliche Bildschirmauflösungen:

| Typ | Größe | Verwendung |
|-----|-------|-----------|
| mdpi | 48x48 | Baseline (160 DPI) |
| hdpi | 72x72 | High Density (240 DPI) |
| xhdpi | 96x96 | Extra High (320 DPI) |
| xxhdpi | 144x144 | Extra Extra High (480 DPI) |
| xxxhdpi | 192x192 | Extra Extra Extra High (640 DPI) |

## Methode 1: Android Studio Image Asset Studio (Empfohlen)

### Schritt 1: Vorbereitung

Erstellen Sie ein quadratisches Logo (empfohlen: 512x512 PNG) mit:
- **Transparentem Hintergrund** ODER
- **Weißem Hintergrund** (wird später entfernt)

**Design-Empfehlungen**:
- Verwenden Sie die Gradient-Farben: `#6366F1` → `#8B5CF6` → `#D946EF`
- Einfaches, erkennbares Design
- Vermeiden Sie zu viele Details (wirkt klein auf Icons)
- Text sollte groß und lesbar sein

### Schritt 2: Image Asset Studio öffnen

1. In Android Studio, Rechtsklick auf `res` Ordner
2. Wählen Sie **New** → **Image Asset**
3. Das Image Asset Studio öffnet sich

### Schritt 3: Launcher Icon konfigurieren

**Foreground Layer** (Hauptbild):
1. **Asset Type**: Image
2. **Path**: Wählen Sie Ihr 512x512 Logo
3. **Trim**: ✅ Aktivieren (entfernt leeren Raum)
4. **Resize**: 80-100% (je nach Logo)
5. **Shape**: Circle oder Squircle (empfohlen)

**Background Layer** (Hintergrund):
1. **Asset Type**: Color
2. **Color**: `#6366F1` (Quantix Primary Color)

   *Alternative*: Image mit Gradient-Hintergrund

**Options**:
- **Name**: `ic_launcher` (Standard)
- **Generate**: ✅ Mipmap
- ✅ Generate Round Icons
- ✅ Generate Legacy Icons (for older Android versions)

### Schritt 4: Vorschau prüfen

Prüfen Sie die Vorschau auf der rechten Seite:
- Verschiedene Formen (Circle, Squircle, Rounded Square)
- Unterschiedliche Android-Versionen
- Hell/Dunkel-Theme-Varianten

### Schritt 5: Generieren

1. Klicken Sie auf **Next**
2. Prüfen Sie die zu generierenden Dateien
3. Klicken Sie auf **Finish**

Die Icons werden automatisch in den richtigen Ordnern erstellt:
- `mipmap-mdpi/`
- `mipmap-hdpi/`
- `mipmap-xhdpi/`
- `mipmap-xxhdpi/`
- `mipmap-xxxhdpi/`

## Methode 2: Online Icon Generator

Falls Sie Android Studio nicht verwenden möchten, nutzen Sie einen Online-Generator:

### Empfohlene Tools

1. **Android Asset Studio** (Kostenlos)
   - URL: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
   - Features: Vollständige Kontrolle, Batch-Export

2. **Icon Kitchen** (Kostenlos)
   - URL: https://icon.kitchen
   - Features: Einfach, schnell, Material Design 3 Support

3. **App Icon Generator** (Kostenlos)
   - URL: https://www.appicon.co
   - Features: Multi-Plattform (iOS + Android)

### Schritt-für-Schritt (Android Asset Studio)

1. **Website öffnen**: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html

2. **Foreground konfigurieren**:
   - Image: Laden Sie Ihr Logo hoch (512x512 PNG)
   - Scaling: 80-100%
   - Trim: ✅

3. **Background konfigurieren**:
   - Color: `#6366F1`
   - ODER: Image für Gradient-Hintergrund

4. **Shape wählen**:
   - Circle (empfohlen für moderne Apps)
   - Squircle (abgerundetes Quadrat)
   - Square (klassisch)

5. **Download**:
   - Klicken Sie auf **Download .zip**
   - Entpacken Sie die Datei

6. **Installation**:
   ```bash
   # Entpackte Ordner kopieren nach:
   android-app/app/src/main/res/

   # Überschreiben Sie die Platzhalter-Icons
   ```

## Methode 3: Manuelle Erstellung (Photoshop/GIMP)

Für vollständige Kontrolle können Sie Icons manuell erstellen:

### Benötigte Größen

Erstellen Sie folgende PNG-Dateien:

**Launcher Icons** (`ic_launcher.png`):
- `mipmap-mdpi/ic_launcher.png` → 48x48 px
- `mipmap-hdpi/ic_launcher.png` → 72x72 px
- `mipmap-xhdpi/ic_launcher.png` → 96x96 px
- `mipmap-xxhdpi/ic_launcher.png` → 144x144 px
- `mipmap-xxxhdpi/ic_launcher.png` → 192x192 px

**Round Icons** (`ic_launcher_round.png`):
- Gleiche Größen wie oben
- Kreisförmig zugeschnitten

**Foreground** (`ic_launcher_foreground.png`):
- Gleiche Größen
- Transparenter Hintergrund
- Nur das Logo/Symbol

**Background** (`ic_launcher_background.png`):
- Gleiche Größen
- Kann Farbe oder Gradient sein

### Design-Template (Photoshop)

```
Artboard: 512x512 px
Safe Zone: 432x432 px (zentriert)
  ↳ Ihr Logo sollte innerhalb dieser Zone bleiben

Hintergrund:
  - Linearer Gradient: #6366F1 → #8B5CF6 → #D946EF
  - Winkel: 135°

Logo/Text:
  - Weiß (#FFFFFF) oder Komplementärfarbe
  - Zentriert in Safe Zone
  - Schatten für Tiefe (optional)
```

### Batch-Export (Photoshop)

1. Erstellen Sie ein 512x512 Design
2. Verwenden Sie **File** → **Export** → **Export As...**
3. Wählen Sie PNG mit Transparenz
4. Exportieren Sie für jede Größe:
   - 48px, 72px, 96px, 144px, 192px

## Adaptive Icons (Android 8.0+)

Android 8.0+ verwendet **Adaptive Icons** mit zwei Layern:

### Struktur

```xml
<!-- res/mipmap-anydpi-v26/ic_launcher.xml -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
```

### Vorteile

- **Flexibel**: Passt sich verschiedenen Formen an
- **Animiert**: Kann Parallax-Effekte haben
- **Konsistent**: Einheitliches Aussehen über alle Launcher

### Implementierung

Die `Image Asset Studio` (Methode 1) erstellt automatisch:
- `ic_launcher_background.xml` oder PNG
- `ic_launcher_foreground.xml` oder PNG
- `ic_launcher.xml` (Adaptive Icon Definition)

## Farbschema

Verwenden Sie die Quantix Tickets Farben für Konsistenz:

### Primärfarben
```
Indigo:  #6366F1
Purple:  #8B5CF6
Pink:    #D946EF
```

### Gradient-Beispiel
```css
/* CSS (für Online-Tools) */
background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #D946EF 100%);
```

### Figma/Sketch
```
Layer → Fill → Linear Gradient
Stop 1: #6366F1 (0%)
Stop 2: #8B5CF6 (50%)
Stop 3: #D946EF (100%)
Angle: 135°
```

## Logo-Design-Tipps

### Do's ✅
- **Einfach**: Wenige Farben, klare Formen
- **Skalierbar**: Erkennbar bei 48x48 px
- **Kontrast**: Gute Lesbarkeit auf verschiedenen Hintergründen
- **Einheitlich**: Passt zum Web-Panel-Design
- **Professionell**: Hochauflösend, scharfe Kanten

### Don'ts ❌
- **Zu viel Text**: Unleserlich auf kleinen Größen
- **Komplexe Details**: Gehen bei Verkleinerung verloren
- **Niedrige Auflösung**: Pixelige Icons
- **Inkonsistente Farben**: Passen nicht zum Branding
- **Kein Padding**: Logo schneidet an Rändern ab

## Testen der Icons

### Android Studio Preview

1. Nach Icon-Generierung: **Build** → **Rebuild Project**
2. In `AndroidManifest.xml` prüfen:
   ```xml
   <application
       android:icon="@mipmap/ic_launcher"
       android:roundIcon="@mipmap/ic_launcher_round"
   ```
3. App auf Gerät/Emulator installieren
4. Icon im Launcher prüfen

### Verschiedene Launcher testen

Icons sehen unterschiedlich aus auf:
- **Stock Android**: Circle
- **Samsung**: Squircle
- **Xiaomi/MIUI**: Rounded Square
- **OnePlus**: Circle mit Border

Testen Sie auf mehreren Geräten oder nutzen Sie einen Emulator.

## Splash Screen Icon

Für den Splash Screen benötigen Sie zusätzlich:

```xml
<!-- res/values/themes.xml -->
<style name="Theme.Splash" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@color/splash_background</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/ic_splash</item>
</style>
```

**Splash Icon**:
- Größe: 288x288 dp (empfohlen)
- Format: Vector Drawable (XML) oder PNG
- Zentriert, mit Padding
- Kann animiert sein

## Troubleshooting

### Problem: Icons werden nicht angezeigt

**Lösung**:
1. Clean & Rebuild Project
2. Prüfen Sie `AndroidManifest.xml` Referenzen
3. Löschen Sie App vom Gerät und neu installieren
4. Prüfen Sie Ordnernamen: `mipmap-*` (nicht `drawable-*`)

### Problem: Icons sehen pixelig aus

**Lösung**:
- Verwenden Sie höhere Ausgangsauflösung (512x512 minimum)
- Exportieren Sie als PNG mit voller Qualität
- Aktivieren Sie Anti-Aliasing beim Export

### Problem: Adaptive Icons zeigen nur Hintergrund

**Lösung**:
- Prüfen Sie `ic_launcher.xml` Referenzen
- Stellen Sie sicher, dass Foreground PNG existiert
- Foreground muss transparenten Hintergrund haben

### Problem: Icons passen nicht zur App

**Lösung**:
- Verwenden Sie exakt die Farbcodes aus `colors.xml`
- Prüfen Sie Design-Konsistenz mit Web-Panel
- Testen Sie auf Hell- und Dunkel-Theme

## Ressourcen

### Design-Tools (Kostenlos)
- **Figma**: https://figma.com (Icon-Design)
- **Canva**: https://canva.com (Einfache Grafiken)
- **Inkscape**: https://inkscape.org (Vektorgrafik)
- **GIMP**: https://gimp.org (Bildbearbeitung)

### Icon-Inspiration
- **Material Design Icons**: https://fonts.google.com/icons
- **Iconify**: https://icon-sets.iconify.design
- **Flaticon**: https://flaticon.com

### Android Guidelines
- **Material Design**: https://m3.material.io/styles/icons
- **Adaptive Icons**: https://developer.android.com/develop/ui/views/launch/icon_design_adaptive

## Checkliste

Vor dem Release prüfen:

- [ ] Icons für alle Dichten (mdpi bis xxxhdpi) erstellt
- [ ] Adaptive Icons (foreground + background) vorhanden
- [ ] Round Icons generiert
- [ ] Farben konsistent mit App-Branding (`#6366F1`)
- [ ] Icons getestet auf mindestens 2-3 verschiedenen Geräten
- [ ] Splash Screen Icon erstellt
- [ ] Icons sehen professionell aus (scharf, gut skaliert)
- [ ] Foreground hat transparenten Hintergrund
- [ ] Icons sind in `mipmap-*` Ordnern (nicht `drawable-*`)
- [ ] `AndroidManifest.xml` referenziert korrekte Icons

## Support

Bei Fragen oder Problemen:
- Siehe [README.md](README.md) für allgemeine App-Hilfe
- GitHub Issues: [Repository](https://github.com/theredstonee/TRS-Tickets-Bot)

---

**Tipp**: Die schnellste und einfachste Methode ist **Methode 1** (Android Studio Image Asset Studio). Damit bekommen Sie automatisch alle benötigten Größen und Formate in wenigen Minuten!
