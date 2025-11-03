# Push Notifications & Biometric Authentication - Setup Guide

## 🎉 Neue Features

Die Android-App hat jetzt zwei professionelle Security- und UX-Features:
1. **🔔 Push Notifications** - Firebase Cloud Messaging
2. **🔐 Biometric Authentication** - Fingerabdruck/Face ID/PIN

---

## 🔔 Push Notifications

### Was wurde implementiert

#### **Firebase Cloud Messaging Service**
`QuantixFirebaseMessagingService.kt` - Vollständiger FCM-Service mit:
- ✅ Token Management
- ✅ 3 Notification Channels (Tickets, Messages, System)
- ✅ Auto-Registration beim Start
- ✅ Custom Notification Handling
- ✅ Deep Linking zu spezifischen Tickets

#### **Notification Types**
Die App unterstützt folgende Benachrichtigungstypen:

1. **🎫 ticket_created**
   ```json
   {
     "type": "ticket_created",
     "ticketId": "12345",
     "topic": "Support"
   }
   ```

2. **💬 ticket_message**
   ```json
   {
     "type": "ticket_message",
     "ticketId": "12345",
     "username": "John",
     "message": "Hallo, ich brauche Hilfe"
   }
   ```

3. **👤 ticket_claimed**
   ```json
   {
     "type": "ticket_claimed",
     "ticketId": "12345",
     "claimer": "Team Member"
   }
   ```

4. **✅ ticket_closed**
   ```json
   {
     "type": "ticket_closed",
     "ticketId": "12345"
   }
   ```

5. **📢 mention**
   ```json
   {
     "type": "mention",
     "ticketId": "12345",
     "username": "Admin"
   }
   ```

#### **Notification Channels**

| Channel | Name | Wichtigkeit | LED | Vibration |
|---------|------|-------------|-----|-----------|
| quantix_tickets | Tickets | HIGH | #6366F1 | 250-250-250 |
| quantix_messages | Nachrichten | HIGH | #8B5CF6 | 200-100-200 |
| quantix_system | System | DEFAULT | #D946EF | - |

### Firebase Setup (Erforderlich!)

#### **Schritt 1: Firebase Project erstellen**

1. Gehen Sie zu https://console.firebase.google.com/
2. Klicken Sie auf "Projekt hinzufügen"
3. Geben Sie einen Namen ein: "Quantix Tickets"
4. Google Analytics: Optional (kann deaktiviert werden)
5. Projekt erstellen

#### **Schritt 2: Android App hinzufügen**

1. Im Firebase Console → Projektübersicht
2. Klicken Sie auf das Android-Symbol
3. **Android-Paketname**: `com.quantix.tickets`
4. **App-Spitzname**: Quantix Tickets
5. **Debug-Signaturzertifikat (SHA-1)**: Optional (für spätere Features)
6. App registrieren

#### **Schritt 3: google-services.json herunterladen**

1. Firebase Console → Projekteinstellungen
2. Tab "Ihre Apps" → Android-App
3. `google-services.json` herunterladen
4. Datei speichern unter:
   ```
   android-app/app/google-services.json
   ```

#### **Schritt 4: Build.gradle anpassen**

Fügen Sie in `android-app/build.gradle` (Project-level) hinzu:
```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

Fügen Sie in `android-app/app/build.gradle` (App-level) am Ende hinzu:
```gradle
apply plugin: 'com.google.gms.google-services'
```

#### **Schritt 5: Server Key für Backend**

1. Firebase Console → Projekteinstellungen
2. Tab "Cloud Messaging"
3. Kopieren Sie den **Server Key**
4. Fügen Sie in `.env` hinzu:
   ```env
   FIREBASE_SERVER_KEY=your_server_key_here
   ```

### Backend Integration

#### **API Endpunkte**

**Register FCM Token:**
```http
POST /api/mobile/fcm/register
Content-Type: application/json
Authorization: Bearer <session_cookie>

{
  "token": "fcm_token_from_device",
  "deviceId": "optional_device_id"
}
```

**Unregister FCM Token:**
```http
DELETE /api/mobile/fcm/unregister
Authorization: Bearer <session_cookie>
```

#### **Token Speicherung**

Tokens werden gespeichert in: `configs/fcm_tokens.json`
```json
{
  "user_id_123": {
    "token": "fcm_device_token",
    "deviceId": "Pixel 6",
    "registeredAt": 1704067200000,
    "lastUpdated": 1704067200000
  }
}
```

#### **Push Notification senden**

Verwendung im Bot-Code:
```javascript
const { sendPushNotification } = require('./mobile-api');

// Beispiel: Neues Ticket
await sendPushNotification(
  userId,
  '🎫 Neues Ticket',
  'Ticket #12345 wurde erstellt',
  {
    type: 'ticket_created',
    ticketId: '12345',
    guildId: 'guild_id_here'
  }
);
```

### Testing Push Notifications

#### **Option 1: Firebase Console (Manuell)**

1. Firebase Console → Cloud Messaging
2. "Erste Kampagne" → "Notifications"
3. Titel & Text eingeben
4. Target App: "Quantix Tickets"
5. Senden

#### **Option 2: cURL (API Test)**

```bash
curl -X POST https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=YOUR_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "DEVICE_FCM_TOKEN",
    "notification": {
      "title": "Test Notification",
      "body": "Dies ist ein Test"
    },
    "data": {
      "type": "system",
      "message": "Test Data"
    }
  }'
```

#### **Option 3: Postman Collection**

Importieren Sie diese Collection:
```json
{
  "info": {
    "name": "Quantix FCM",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Send Notification",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "key={{FIREBASE_SERVER_KEY}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "url": "https://fcm.googleapis.com/fcm/send",
        "body": {
          "mode": "raw",
          "raw": "{\n  \"to\": \"{{DEVICE_TOKEN}}\",\n  \"notification\": {\n    \"title\": \"Test\",\n    \"body\": \"Test Message\"\n  }\n}"
        }
      }
    }
  ]
}
```

---

## 🔐 Biometric Authentication

### Was wurde implementiert

#### **BiometricAuthActivity**
Vollständige Biometric Login Screen mit:
- ✅ Fingerabdruck-Authentifizierung
- ✅ Face ID Support
- ✅ PIN/Pattern Fallback
- ✅ Skip-Option für erste Verwendung
- ✅ Session Management
- ✅ Gradient-Design

#### **Features**

**Unterstützte Authentifizierungsmethoden:**
- 🔒 Fingerabdruck (alle Android-Geräte mit Sensor)
- 📱 Face ID (Android 10+)
- 🔢 Geräte-PIN
- 📲 Pattern Lock

**Security:**
- Biometric Prompt mit Strong Authenticator
- Device Credential Fallback
- Auto-Lockout nach zu vielen Versuchen
- Session-basierte Authentifizierung

### Wie es funktioniert

#### **App-Flow**

```
App Start
    ↓
BiometricAuthActivity (Launcher)
    ↓
Ist bereits authentifiziert?
    ├─ JA → MainActivity (direkt)
    └─ NEIN → Biometric Prompt
        ├─ Erfolgreich → Session speichern → MainActivity
        ├─ Fehlgeschlagen → Erneut versuchen
        └─ Abgebrochen → Skip-Option
```

#### **Session Management**

Sessions werden in SharedPreferences gespeichert:
```kotlin
// Check if authenticated
val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
val isAuthenticated = prefs.getBoolean("is_authenticated", false)

// Set authenticated
prefs.edit().putBoolean("is_authenticated", true).apply()
```

**Session Reset:**
- Bei App-Neuinstallation
- Bei Logout (manuell)
- Optional: Nach X Stunden Inaktivität

### Customization

#### **Prompt Text anpassen**

In `BiometricAuthActivity.kt` (Zeile 140-148):
```kotlin
promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("Ihr App-Name")
    .setSubtitle("Ihr Subtitle")
    .setDescription("Ihre Beschreibung")
    .setAllowedAuthenticators(
        BiometricManager.Authenticators.BIOMETRIC_STRONG or
        BiometricManager.Authenticators.DEVICE_CREDENTIAL
    )
    .build()
```

#### **Skip-Option deaktivieren**

In `BiometricAuthActivity.kt`:
```kotlin
// Option 1: Skip-Button verstecken
skipButton.visibility = View.GONE

// Option 2: Skip-Button deaktivieren
skipButton.isEnabled = false
```

#### **Automatischer Prompt**

Biometric Prompt wird automatisch gezeigt, wenn:
- Biometrie verfügbar ist (`biometricButton.isEnabled`)
- User hat noch nicht übersprungen (`!getSkippedOnce()`)

Deaktivieren in `BiometricAuthActivity.kt` (Zeile 97-99):
```kotlin
// Kommentieren Sie diese Zeilen aus:
// if (biometricButton.isEnabled && !getSkippedOnce()) {
//     biometricPrompt.authenticate(promptInfo)
// }
```

### Design Anpassen

#### **Gradient-Hintergrund**

`gradient_background.xml`:
```xml
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <gradient
        android:angle="135"
        android:startColor="#6366F1"
        android:centerColor="#8B5CF6"
        android:endColor="#D946EF"
        android:type="linear" />
</shape>
```

Ändern Sie die Farben nach Belieben!

#### **Logo ändern**

In `activity_biometric_auth.xml` (Zeile 11):
```xml
<ImageView
    android:id="@+id/logoImageView"
    android:src="@mipmap/ic_launcher" <!-- Ändern Sie dies -->
```

### Biometric Verfügbarkeit prüfen

```kotlin
val biometricManager = BiometricManager.from(context)

when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
    BiometricManager.BIOMETRIC_SUCCESS ->
        // Biometrie verfügbar

    BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
        // Gerät hat keine Biometrie

    BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
        // Biometrie momentan nicht verfügbar

    BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
        // User hat keine Biometrie eingerichtet
}
```

---

## 🚀 Build & Test

### Build Commands

```bash
cd android-app

# Clean Build
./gradlew clean

# Build Debug APK
./gradlew assembleDebug

# Build Release APK
./gradlew assembleRelease

# Install on device
./gradlew installDebug
```

### Testing Checklist

#### **Push Notifications:**
- [ ] App installiert auf Gerät
- [ ] Firebase `google-services.json` vorhanden
- [ ] FCM Token wird generiert (Check Logcat)
- [ ] Token wird an Backend gesendet
- [ ] Test-Notification via Firebase Console
- [ ] Notification erscheint in Notification Drawer
- [ ] Tap auf Notification öffnet App
- [ ] Deep Link funktioniert (öffnet richtiges Ticket)

#### **Biometric Auth:**
- [ ] Biometric Auth Screen erscheint beim Start
- [ ] Fingerabdruck-Authentifizierung funktioniert
- [ ] PIN-Fallback funktioniert
- [ ] Skip-Button funktioniert
- [ ] Session bleibt erhalten (App-Neustart ohne erneute Auth)
- [ ] Error Messages werden angezeigt
- [ ] Lockout nach zu vielen Versuchen

---

## 📱 Permissions

Stellen Sie sicher, dass diese Permissions in `AndroidManifest.xml` vorhanden sind:

```xml
<!-- Push Notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Biometric -->
<uses-permission android:name="android.permission.USE_BIOMETRIC" />

<!-- Optional: für bessere UX -->
<uses-permission android:name="android.permission.VIBRATE" />
```

---

## 🐛 Troubleshooting

### Push Notifications

**Problem: Keine Notifications**
- ✅ `google-services.json` vorhanden?
- ✅ Firebase Plugin in build.gradle?
- ✅ FCM Token wird generiert? (Check Logcat: "New FCM Token")
- ✅ Server Key korrekt in Backend?
- ✅ Notification Permission erteilt? (Android 13+)

**Problem: Notifications werden nicht angezeigt**
- ✅ Notification Channels erstellt?
- ✅ App läuft im Hintergrund? (Foreground-Handling ist anders)
- ✅ Notification Icon vorhanden? (`ic_notification.xml`)
- ✅ Logcat prüfen auf Fehler

**Problem: Deep Linking funktioniert nicht**
- ✅ Intent-Filter in Manifest korrekt?
- ✅ Ticket ID/Guild ID in notification data?
- ✅ MainActivity öffnet richtigen Link?

### Biometric Authentication

**Problem: Biometric Prompt erscheint nicht**
- ✅ Biometric Hardware vorhanden?
- ✅ Biometric Dependency in build.gradle?
- ✅ User hat Biometrie eingerichtet?
- ✅ `USE_BIOMETRIC` Permission?

**Problem: "Too many attempts"**
- Normal: Android sperrt nach 5 Fehlversuchen
- Lösung: Warten oder PIN verwenden

**Problem: Session bleibt nicht erhalten**
- ✅ SharedPreferences werden korrekt gespeichert?
- ✅ App wird nicht vom System gekilled? (Background Restrictions)

---

## 📚 Weitere Ressourcen

- **Firebase Cloud Messaging**: https://firebase.google.com/docs/cloud-messaging
- **Biometric API**: https://developer.android.com/training/sign-in/biometric-auth
- **Material Design 3**: https://m3.material.io/

---

**Entwickelt für Quantix Tickets**
Version 1.0.0 | Januar 2025
