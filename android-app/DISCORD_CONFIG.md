# Discord OAuth Konfiguration - Anleitung

**Problem:** `{"client_id": ["Value \"YOUR_CLIENT_ID\" is not snowflake."]}`

**Lösung:** Discord Application Client ID eintragen

---

## 🔧 Schritt-für-Schritt Anleitung

### 1. Discord Application erstellen

1. **Gehe zu:** https://discord.com/developers/applications
2. **Login** mit deinem Discord Account
3. **Klick auf:** "New Application" (oben rechts)
4. **Name eingeben:** z.B. "Quantix Tickets"
5. **Erstellen**

### 2. OAuth2 konfigurieren

1. **Klick auf "OAuth2"** in der linken Sidebar
2. **Gehe zu "General"**
3. **Kopiere die Client ID:**
   ```
   Beispiel: 1234567890123456789 (18 Stellen)
   ```
4. **Kopiere das Client Secret:**
   ```
   Beispiel: abcdefghijklmnopqrstuvwxyz123456
   ```

### 3. Redirect URIs hinzufügen

1. **Unter "Redirects"** klick auf "Add Redirect"
2. **Füge hinzu:**
   ```
   https://trstickets.theredstonee.de/auth/discord/callback
   ```
3. **Klick auf "Save Changes"**

---

## 📱 Android App konfigurieren

### Option 1: strings.xml (Einfach)

**Datei:** `android-app/app/src/main/res/values/strings.xml`

Ersetze Zeile 25:
```xml
<!-- VORHER (FALSCH): -->
<string name="discord_client_id">YOUR_CLIENT_ID</string>

<!-- NACHHER (RICHTIG): -->
<string name="discord_client_id">1234567890123456789</string>
```

**Wo:** Zeile 25 in `strings.xml`

**Beispiel:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- ... andere strings ... -->

    <!-- Discord OAuth Configuration -->
    <string name="discord_client_id">1234567890123456789</string>
    <string name="discord_redirect_uri">https://trstickets.theredstonee.de/auth/discord/callback</string>
    <string name="discord_oauth_scopes">identify email guilds</string>
</resources>
```

### Option 2: gradle.properties (Sicherer)

**Datei:** `android-app/gradle.properties`

```properties
DISCORD_CLIENT_ID=1234567890123456789
```

**Datei:** `android-app/app/build.gradle`

```gradle
android {
    defaultConfig {
        // ...
        buildConfigField "String", "DISCORD_CLIENT_ID", "\"${DISCORD_CLIENT_ID}\""
    }
}
```

**Dann in DiscordLoginActivity:**
```kotlin
private val clientId = BuildConfig.DISCORD_CLIENT_ID
```

---

## 🖥️ Backend konfigurieren

### .env Datei

**Datei:** `.env` (im Hauptverzeichnis)

```env
# Discord Bot Configuration
DISCORD_TOKEN=dein_bot_token_hier
CLIENT_ID=1234567890123456789
CLIENT_SECRET=abcdefghijklmnopqrstuvwxyz123456

# Web Panel Configuration
PUBLIC_BASE_URL=https://trstickets.theredstonee.de
SESSION_SECRET=ein_zufälliger_langer_string_hier
```

### Wo bekomme ich die Werte?

1. **DISCORD_TOKEN:**
   - Discord Developer Portal → Bot → Token
   - Falls nicht sichtbar: "Reset Token" klicken

2. **CLIENT_ID:**
   - Discord Developer Portal → OAuth2 → General → Client ID

3. **CLIENT_SECRET:**
   - Discord Developer Portal → OAuth2 → General → Client Secret

4. **SESSION_SECRET:**
   - Beliebiger langer zufälliger String
   - Generiere mit: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## ✅ Testen

### 1. Backend starten

```bash
npm start
```

**Erwartete Ausgabe:**
```
[Discord Bot] Logged in as: Quantix Tickets#1234
[Web Panel] Server running on http://localhost:3000
[Mobile API] All mobile endpoints registered
```

### 2. Android App neu bauen

```bash
cd android-app
./gradlew clean build
./gradlew installDebug
```

### 3. App testen

1. **App öffnen**
2. **Biometric Auth** (falls aktiviert)
3. **Discord Login Screen** sollte erscheinen
4. **Keine Fehler mehr!** ✅

---

## 🐛 Troubleshooting

### Fehler: "client_id is not snowflake"
**Problem:** Client ID ist noch "YOUR_CLIENT_ID"
**Lösung:** Ersetze in `strings.xml` mit echter Discord Client ID

### Fehler: "Invalid redirect_uri"
**Problem:** Redirect URI nicht in Discord Application eingetragen
**Lösung:** Füge `https://trstickets.theredstonee.de/auth/discord/callback` hinzu

### Fehler: "Invalid OAuth2 redirect"
**Problem:** Domain stimmt nicht überein
**Lösung:**
- Entweder: Ändere `PUBLIC_BASE_URL` in `.env`
- Oder: Ändere Redirect URI in Discord Application

### Fehler: "Unauthorized"
**Problem:** Client Secret falsch oder fehlt
**Lösung:** Prüfe `.env` Datei, CLIENT_SECRET korrekt?

---

## 📝 Checkliste

- [ ] Discord Application erstellt
- [ ] Client ID kopiert (18 Stellen)
- [ ] Client Secret kopiert
- [ ] Redirect URI hinzugefügt
- [ ] `strings.xml` aktualisiert (Android)
- [ ] `.env` konfiguriert (Backend)
- [ ] Backend neu gestartet
- [ ] Android App neu gebaut
- [ ] App getestet - Login funktioniert ✅

---

## 🎉 Fertig!

Nach dem Eintragen der Discord Client ID sollte der Login funktionieren!

**Bei Fragen:** Discord Developer Portal Dokumentation
https://discord.com/developers/docs/topics/oauth2
