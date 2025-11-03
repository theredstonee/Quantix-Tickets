# Native Android App Architecture (Option 3)

## Overview

Die native Android-App ist eine vollständige Kotlin-basierte Implementierung mit MVVM-Architektur, die das Discord Ticket Bot System nativ auf Android bereitstellt.

## Build & Run Commands

```bash
# Build Debug APK
cd android-app
./gradlew assembleDebug

# Build Release APK
./gradlew assembleRelease

# Install auf verbundenem Gerät
./gradlew installDebug

# Run Tests
./gradlew test
./gradlew connectedAndroidTest

# Clean Build
./gradlew clean build
```

**Windows:**
```bash
gradlew.bat assembleDebug
gradlew.bat installDebug
```

## Architecture Pattern: MVVM

### Data Layer (`data/`)

**Models** (`data/model/`):
- `Ticket.kt` - Ticket entity mit utility properties (priorityColor, priorityEmoji, statusEmoji)
- `User.kt` - Discord user mit avatar URL generation
- `Message.kt` - Chat message mit Attachment und Embed support
- `Server.kt` - Discord server/guild mit icon URL
- `Topic.kt` - Ticket topic mit FormField definition
- `ApiResponse.kt` - API response wrappers für alle endpoints

**API Service** (`data/api/`):
- `ApiService.kt` - Retrofit interface mit allen mobile API endpoints
- `RetrofitClient.kt` - Singleton Retrofit client mit:
  - Auth interceptor (session cookies from SharedPreferences)
  - Logging interceptor (HTTP request/response logs)
  - 30s timeout configuration
  - Base URL: `https://trstickets.theredstonee.de/api/mobile/`

**Repository** (`data/repository/`):
- `Resource.kt` - Sealed class für Success/Error/Loading states
- `TicketRepository.kt` - Repository mit suspend functions für:
  - `getTickets(guildId)` - Load all tickets for server
  - `getTicketDetail(guildId, ticketId)` - Load ticket with messages
  - `createTicket(guildId, topicId, formResponses)` - Create new ticket
  - `sendMessage(guildId, ticketId, content)` - Send message to ticket
  - `closeTicket(guildId, ticketId)` - Close ticket
  - `getTopics(guildId)` - Load available topics

### Presentation Layer (TODO)

**ViewModels** (`ui/viewmodel/`):
- `LoginViewModel` - Discord OAuth2 login state
- `TicketListViewModel` - Ticket list with filters (open/closed/all)
- `TicketDetailViewModel` - Ticket detail mit message history
- `CreateTicketViewModel` - Form validation & ticket creation

**Fragments** (`ui/fragment/`):
- `LoginFragment` - Discord OAuth login UI
- `ServerListFragment` - Server selection (RecyclerView)
- `TicketListFragment` - Ticket list (RecyclerView mit SwipeRefreshLayout)
- `TicketDetailFragment` - Ticket detail mit message list
- `CreateTicketFragment` - Dynamic form based on topic formFields

**Adapters** (`ui/adapter/`):
- `TicketAdapter` - RecyclerView adapter for ticket list
- `MessageAdapter` - RecyclerView adapter for message history
- `ServerAdapter` - RecyclerView adapter for server selection

### Security Features (Existing)

**Biometric Auth** (`auth/BiometricAuthActivity.kt`):
- Fingerprint/Face ID/PIN authentication
- Session management via SharedPreferences
- Launcher activity (entry point)

**Discord Login** (`auth/DiscordLoginActivity.kt`):
- Full Discord OAuth2 flow
- WebView for authorization
- Token exchange & session cookie storage

### Push Notifications (Existing)

**Firebase Cloud Messaging** (`fcm/QuantixFirebaseMessagingService.kt`):
- 3 notification channels: tickets, updates, general
- 5 notification types:
  - `ticket_created` - New ticket created
  - `ticket_message` - New message in ticket
  - `ticket_claimed` - Ticket claimed by team member
  - `ticket_closed` - Ticket closed
  - `system_update` - System updates
- Deep linking to specific tickets

## API Integration

### Mobile API Endpoints (`mobile-api.js`)

All endpoints return JSON with authentication via session cookies:

```
GET  /api/mobile/user/me                        - Current user info
GET  /api/mobile/servers                        - User's servers with bot
GET  /api/mobile/tickets/:guildId               - Tickets for server (enriched)
GET  /api/mobile/ticket/:guildId/:ticketId      - Ticket detail with messages
POST /api/mobile/ticket/:guildId/create         - Create new ticket
POST /api/mobile/ticket/:guildId/:ticketId/message - Send message
POST /api/mobile/ticket/:guildId/:ticketId/close   - Close ticket
GET  /api/mobile/topics/:guildId                - Available topics
POST /api/mobile/fcm/register                   - Register FCM token
DELETE /api/mobile/fcm/unregister               - Unregister FCM token
```

### Authentication Flow

1. User opens app → `BiometricAuthActivity` (if enabled)
2. After biometric auth → `DiscordLoginActivity` (if not logged in)
3. Discord OAuth2 flow in WebView
4. Callback with auth code
5. Exchange code for session via `/auth/discord/callback`
6. Store session cookies in SharedPreferences
7. `RetrofitClient` uses cookies for all API requests
8. Navigate to `MainActivity` with server/ticket lists

### Data Enrichment

The mobile API enriches ticket data with:
- Creator user object (username, avatar)
- Claimer user object (if claimed)
- Last message with author info
- Unread count (calculated)
- Form responses
- Permissions (canClose, canMessage, canClaim)

## Key Differences from WebView App

### WebView App (Previous Implementation):
- Single `MainActivity` with WebView
- Loads web panel in embedded browser
- JavaScript bridge for native functions
- Bottom navigation controls WebView URLs
- Minimal native UI

### Native App (Current Implementation):
- Full native UI with Material Design 3
- RecyclerView for lists (better performance)
- Native navigation with Navigation Component
- LiveData for reactive UI updates
- Offline caching with Room (optional)
- Pixel-perfect control over UI

## Dependencies

**Core Libraries:**
- Retrofit 2.9.0 - REST API client
- Gson 2.10.1 - JSON serialization
- OkHttp 4.12.0 - HTTP client with logging
- Glide 4.16.0 - Image loading
- Kotlin Coroutines 1.7.3 - Async operations

**Android Jetpack:**
- Navigation Component 2.7.6 - Fragment navigation
- Lifecycle & ViewModel 2.7.0 - MVVM architecture
- Room 2.6.1 - Local database (optional)
- DataStore 1.0.0 - Settings persistence
- WorkManager 2.9.0 - Background tasks

**UI Components:**
- Material Design 3 (1.11.0)
- RecyclerView 1.3.2
- SwipeRefreshLayout 1.1.0
- ConstraintLayout 2.1.4

**Firebase:**
- Firebase BOM 32.7.0
- Firebase Cloud Messaging

**Security:**
- Biometric 1.1.0

## Material Design 3 Theme

**Color Scheme** (matching web panel):
```xml
<color name="accent_primary">#6366F1</color>
<color name="accent_secondary">#8B5CF6</color>
<color name="accent_tertiary">#D946EF</color>
```

**Gradient Background:**
```xml
<gradient
    android:angle="135"
    android:startColor="#6366F1"
    android:centerColor="#8B5CF6"
    android:endColor="#D946EF"
    android:type="linear" />
```

## Development Status

**✅ Completed:**
- Data models (Ticket, User, Message, Server, Topic, ApiResponse)
- Retrofit API service interface
- RetrofitClient with auth interceptor
- TicketRepository with Resource pattern
- BiometricAuthActivity (from hybrid app)
- DiscordLoginActivity (from hybrid app)
- Firebase Cloud Messaging (from hybrid app)
- Backend mobile API (9 endpoints in mobile-api.js)

**🚧 In Progress:**
- Repository layer completion
- ViewModels creation

**📋 TODO:**
- Login Fragment UI
- Server List Fragment + Adapter
- Ticket List Fragment + Adapter
- Ticket Detail Fragment + Message Adapter
- Create Ticket Fragment with dynamic form
- Navigation graph setup
- All layout XML files
- String resources (multi-language)
- Error handling UI
- Loading states UI

## Critical Implementation Notes

### 1. Session Cookie Management

Session cookies MUST be stored in SharedPreferences and added to every API request:

```kotlin
// Store after Discord login
val cookies = response.headers.values("Set-Cookie")
prefs.edit().putStringSet("session_cookies", cookies.toSet()).apply()

// Retrieve in RetrofitClient
val cookies = prefs.getStringSet("session_cookies", emptySet())
requestBuilder.addHeader("Cookie", cookies.joinToString("; "))
```

### 2. Ticket Priority Colors

Use consistent priority colors across app:
- Priority 0 (Green): `#10B981`
- Priority 1 (Orange): `#F59E0B`
- Priority 2 (Red): `#EF4444`

### 3. RecyclerView Best Practices

Always use:
- `DiffUtil` for efficient updates
- `ViewBinding` for view references
- `ListAdapter` instead of RecyclerView.Adapter
- SwipeRefreshLayout for pull-to-refresh

### 4. Error Handling Pattern

```kotlin
viewModel.tickets.observe(viewLifecycleOwner) { resource ->
    when (resource) {
        is Resource.Loading -> showLoading()
        is Resource.Success -> {
            hideLoading()
            updateUI(resource.data)
        }
        is Resource.Error -> {
            hideLoading()
            showError(resource.message)
        }
    }
}
```

### 5. Coroutine Scopes

- Use `viewModelScope` in ViewModels (auto-cancels on clear)
- Use `lifecycleScope` in Fragments (auto-cancels on destroy)
- Repository functions use `withContext(Dispatchers.IO)` for network calls

## Testing Strategy

**Unit Tests:**
- Repository tests with MockWebServer
- ViewModel tests with LiveData testing utils
- Data model validation tests

**Instrumentation Tests:**
- API integration tests
- Database tests (Room)
- UI tests with Espresso

**Manual Testing Checklist:**
- Discord OAuth flow
- Biometric authentication
- Ticket creation with all field types
- Message sending with attachments
- Push notifications
- Offline behavior
- Session persistence across app restarts

## Deployment

**Debug Build:**
```bash
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

**Release Build:**
```bash
# 1. Configure signing in app/build.gradle
# 2. Build signed APK
./gradlew assembleRelease
# APK: app/build/outputs/apk/release/app-release.apk
```

**Google Play Console:**
1. Generate signed App Bundle: `./gradlew bundleRelease`
2. Upload AAB file to Play Console
3. Configure store listing, screenshots
4. Submit for review

## Troubleshooting

**Issue:** "Unresolved reference: BuildConfig"
- Fix: Use PackageManager instead: `context.packageManager.getPackageInfo(context.packageName, 0).versionName`

**Issue:** "setAppCacheEnabled unresolved"
- Fix: Remove deprecated AppCache APIs, modern WebView handles caching automatically

**Issue:** Session cookies not persisting
- Fix: Ensure cookies are stored as StringSet in SharedPreferences, not String

**Issue:** Retrofit returns 401 Unauthorized
- Fix: Check that auth interceptor is adding cookies correctly, verify session is valid

**Issue:** Images not loading (Glide)
- Fix: Add `android:usesCleartextTraffic="true"` in AndroidManifest for HTTP URLs (or use HTTPS)

## Future Enhancements

- Offline mode with Room database caching
- Dark/Light theme toggle
- Multi-language support (9 languages like web)
- Voice support integration
- File attachment upload
- Ticket rating from mobile
- Advanced search & filters
- Team member availability status
- SLA countdown timers
- Tablet layout optimization
