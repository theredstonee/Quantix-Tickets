# Session-basierter Login Flow

**Status:** ✅ **IMPLEMENTIERT**

Der User meldet sich **einmal im Web an** und bleibt dann in der App angemeldet!

---

## 🎯 Wie es funktioniert

### 1. Erster App-Start (Nicht angemeldet)

```
App Start
   ↓
BiometricAuthActivity (prüft: is_logged_in)
   ↓ (false)
DiscordLoginActivity
   ↓
Lädt: https://trstickets.theredstonee.de/login
   ↓
User klickt "Login with Discord"
   ↓
Discord OAuth (im Web)
   ↓
Erfolg: Redirect zu /select-server
   ↓
App speichert Session-Cookies
   ↓
MainActivity (Server/Tickets)
```

### 2. Nächster App-Start (Angemeldet)

```
App Start
   ↓
BiometricAuthActivity (prüft: is_logged_in)
   ↓ (true ✅)
Biometric Auth (Fingerprint/Face ID/PIN)
   ↓ (Erfolg)
MainActivity (direkt zur App!)
```

---

## 📦 Was wurde geändert

### 1. DiscordLoginActivity.kt
**Vorher:** Eigener Discord OAuth Flow
**Nachher:** Lädt Web-Panel Login-Seite

```kotlin
// Lädt Web-Panel statt direktem OAuth
private val loginUrl = "$baseUrl/login"

// Erkennt erfolgreichen Login
if (url.contains("/select-server") || url.contains("/panel")) {
    saveCookies()
    navigateToMain()
}

// Speichert Session-Cookies
private fun saveCookies() {
    val cookies = CookieManager.getInstance().getCookie(baseUrl)
    prefs.putStringSet("session_cookies", cookieSet)
    prefs.putBoolean("is_logged_in", true)
}
```

### 2. BiometricAuthActivity.kt
**Keine Änderung nötig!** Prüft bereits `is_logged_in`:

```kotlin
private fun isLoggedIn(): Boolean {
    val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
    return prefs.getBoolean("is_logged_in", false)
}
```

### 3. RetrofitClient.kt
**Keine Änderung nötig!** Fügt bereits Session-Cookies hinzu:

```kotlin
private fun createAuthInterceptor(): Interceptor {
    return Interceptor { chain ->
        val cookies = getCookies()
        if (cookies.isNotEmpty()) {
            requestBuilder.addHeader("Cookie", cookies.joinToString("; "))
        }
        chain.proceed(request)
    }
}
```

---

## 🔐 Session-Management

### Session-Cookies werden gespeichert in:
- **Location:** SharedPreferences (`quantix_prefs`)
- **Key:** `session_cookies` (StringSet)
- **Content:** Alle Cookies von `trstickets.theredstonee.de`

### Session bleibt gültig:
- ✅ Nach App-Restart
- ✅ Nach Gerät-Reboot
- ✅ Solange Backend-Session gültig ist
- ❌ Nach User-Logout im Web
- ❌ Nach Cookie-Ablauf (Backend konfiguriert)

### Session wird verwendet für:
- ✅ Alle API-Requests (`/api/mobile/*`)
- ✅ User-Authentifizierung
- ✅ Server-Zugriff
- ✅ Ticket-Operationen

---

## 🚀 User Experience

### Erster Login:
1. **App öffnen**
2. **Biometric Auth** (optional übersprungen)
3. **Discord Login** (Web-basiert)
   - "Login with Discord" klicken
   - Discord Autorisierung
   - Fertig!
4. **Angemeldet!**

### Danach:
1. **App öffnen**
2. **Fingerprint/Face ID** (optional)
3. **Fertig!** → Direkt in der App

---

## 🔄 Logout implementieren (Optional)

Falls du einen Logout-Button hinzufügen möchtest:

```kotlin
fun logout() {
    val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
    prefs.edit().apply {
        remove("session_cookies")
        putBoolean("is_logged_in", false)
        putBoolean("is_authenticated", false)
        remove("user_id")
        remove("user_username")
        apply()
    }

    // Clear WebView cookies
    CookieManager.getInstance().removeAllCookies(null)
    CookieManager.getInstance().flush()

    // Navigate to login
    val intent = Intent(this, DiscordLoginActivity::class.java)
    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
    startActivity(intent)
    finish()
}
```

---

## 🎨 Vorteile

### ✅ Für den User:
- Nur **einmal** anmelden
- **Native Discord Login** (wie im Web)
- Bleibt angemeldet
- Schneller App-Start nach erstem Login

### ✅ Für die Entwicklung:
- **Keine separate OAuth-Config** in der App
- **Nutzt bestehende Web-Session**
- **Keine Client Secrets** in der App
- **Einfacher zu warten**

### ✅ Für die Sicherheit:
- **Session nur im Backend**
- **Kein Token-Storage** in der App
- **Web-Security-Policies** gelten
- **Einfacher Session-Invalidation**

---

## 🐛 Troubleshooting

### Problem: "is_logged_in" ist false, aber User hat sich angemeldet
**Lösung:** Prüfe, ob Cookies gespeichert wurden:
```kotlin
val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
val cookies = prefs.getStringSet("session_cookies", emptySet())
Log.d("DEBUG", "Cookies: $cookies")
```

### Problem: API gibt 401 Unauthorized
**Lösung:** Session-Cookies abgelaufen, User muss sich neu anmelden

### Problem: Login-Seite lädt nicht
**Lösung:**
- Prüfe Internetverbindung
- Prüfe ob `BASE_URL` korrekt ist
- Prüfe Backend ist erreichbar

---

## 📊 Vergleich Alt vs. Neu

### Vorher (Eigener OAuth):
```
App → Discord OAuth → Token Exchange → API
```
- ❌ Benötigt Client ID in App
- ❌ Benötigt Client Secret Handling
- ❌ Separate OAuth-Flow
- ❌ Token-Storage in App

### Nachher (Web-Session):
```
App → Web-Login → Session-Cookies → API
```
- ✅ Keine Client ID nötig
- ✅ Keine Secrets in App
- ✅ Nutzt Web-Login
- ✅ Cookie-Storage (sicherer)

---

## ✅ Status

**Implementierung:** ✅ Fertig
**Testing:** ⏳ Bereit zum Testen
**Build:** ✅ Kompiliert ohne Fehler

---

## 🎉 Zusammenfassung

Die App nutzt jetzt **Web-Session-Cookies** für die Authentifizierung:
1. ✅ User meldet sich einmal im Web an
2. ✅ Session-Cookies werden gespeichert
3. ✅ App bleibt angemeldet
4. ✅ Alle API-Requests nutzen Session
5. ✅ Keine doppelte OAuth-Config nötig

**Die App ist fertig zum Testen!** 🚀
