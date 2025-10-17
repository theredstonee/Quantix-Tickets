# Frontend/Backend Architektur

Dieses Dokument beschreibt die neue Frontend/Backend-Architektur des TRS Tickets Bot Web-Panels.

## Überblick

Das Web-Panel wurde in eine moderne Frontend/Backend-Architektur umstrukturiert:

- **Backend**: REST API mit Express.js (`/api/*` Routen)
- **Frontend**: Moderne JavaScript-Module mit Fetch API
- **Trennung**: Klare Schichten-Architektur mit State Management

## Verzeichnisstruktur

```
TRS-Tickets-Bot-1/
├── api/
│   └── routes.js              # Backend REST API Routes
├── public/
│   ├── css/
│   │   └── app.css            # Frontend CSS Styles
│   └── js/
│       └── app/
│           ├── api.js         # API Service Layer
│           ├── state.js       # State Management
│           ├── panel.js       # Panel UI Module
│           ├── tickets.js     # Tickets UI Module
│           └── main.js        # App Entry Point
├── panel.js                   # Main Server File (mit API Integration)
└── index.js                   # Discord Bot
```

## Backend API

### API Endpoints

**Basis-URL**: `/api`

#### Authentifizierung & User

- `GET /api/user` - Aktuellen User abrufen
- `POST /api/select-guild` - Server auswählen
- `GET /api/guilds` - User's Guilds mit Admin-Rechten

#### Konfiguration

- `GET /api/config` - Guild-Konfiguration abrufen
- `POST /api/config` - Guild-Konfiguration aktualisieren

#### Tickets

- `GET /api/tickets` - Alle Tickets abrufen
- `GET /api/tickets/:id` - Spezifisches Ticket abrufen

#### Analytics

- `GET /api/analytics` - Analytics-Daten abrufen (Pro Feature)

#### Premium

- `GET /api/premium` - Premium-Informationen abrufen

#### Transcript

- `GET /api/transcript/:id` - Transcript HTML abrufen

### Middleware

- `isAuthenticated` - Prüft OAuth-Authentifizierung
- `isAdmin` - Prüft Administrator-Rechte
- `isAdminOrTeam` - Prüft Admin ODER Team-Rolle

### Beispiel API Request

```javascript
// Konfiguration abrufen
const { config } = await fetch('/api/config', {
  method: 'GET',
  credentials: 'include'
}).then(r => r.json());

// Konfiguration aktualisieren
const { config } = await fetch('/api/config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ language: 'de' }),
  credentials: 'include'
}).then(r => r.json());
```

## Frontend Architektur

### Module

#### 1. API Service (`public/js/app/api.js`)

Zentrale API-Kommunikationsschicht mit Fetch API.

**Klasse**: `APIService`

**Methoden**:
- `get(endpoint)` - GET Request
- `post(endpoint, data)` - POST Request
- `getCurrentUser()` - User abrufen
- `getConfig()` - Konfiguration abrufen
- `updateConfig(updates)` - Konfiguration aktualisieren
- `getAllTickets()` - Tickets abrufen
- `getAnalytics()` - Analytics abrufen
- `getPremiumInfo()` - Premium-Info abrufen

**Verwendung**:
```javascript
const api = new APIService('/api');

// Config laden
const { config } = await api.getConfig();

// Config updaten
const { config } = await api.updateConfig({ language: 'de' });
```

#### 2. State Management (`public/js/app/state.js`)

Reaktives State Management System.

**Klasse**: `StateManager`

**State-Objekt**:
```javascript
{
  user: null,
  guilds: [],
  currentGuild: null,
  config: null,
  tickets: [],
  analytics: null,
  premium: null,
  loading: false,
  error: null
}
```

**Methoden**:
- `getState(key)` - State abrufen
- `setState(updates)` - State aktualisieren
- `subscribe(key, callback)` - State-Änderungen abonnieren
- `setLoading(loading, message)` - Loading-State setzen
- `setError(error)` - Error-State setzen

**Verwendung**:
```javascript
const state = new StateManager();

// State setzen
state.setState({ config: newConfig });

// State abonnieren
state.subscribe('config', (newConfig, oldConfig) => {
  console.log('Config changed:', newConfig);
});

// Globale Änderungen abonnieren
state.subscribe('*', (newState, oldState) => {
  console.log('State changed');
});
```

#### 3. Panel UI (`public/js/app/panel.js`)

UI-Modul für das Admin-Panel.

**Klasse**: `PanelUI`

**Methoden**:
- `init()` - Panel initialisieren
- `populateForm(config)` - Formular mit Daten füllen
- `handleSubmit(e)` - Formular-Submit
- `addTopic()` - Thema hinzufügen
- `removeTopic(index)` - Thema entfernen
- `showSuccessMessage(msg)` - Erfolg-Toast anzeigen
- `showErrorMessage(msg)` - Fehler-Toast anzeigen

**Verwendung**:
```javascript
const panel = new PanelUI(api, state);
await panel.init();
```

#### 4. Tickets UI (`public/js/app/tickets.js`)

UI-Modul für Tickets-Anzeige.

**Klasse**: `TicketsUI`

**Methoden**:
- `init()` - Tickets-Seite initialisieren
- `render()` - Tickets rendern
- `filterTickets(tickets)` - Tickets filtern
- `renderTableView(tickets)` - Tabellenansicht
- `renderCardView(tickets)` - Kartenansicht
- `toggleView()` - Ansicht wechseln
- `viewTranscript(ticketId)` - Transcript anzeigen

**Verwendung**:
```javascript
const tickets = new TicketsUI(api, state);
await tickets.init();
```

#### 5. Main App (`public/js/app/main.js`)

Haupt-Einstiegspunkt der Anwendung.

**Globales Objekt**: `window.TRSApp`

```javascript
{
  api: APIService,
  state: StateManager,
  panel: PanelUI,
  tickets: TicketsUI,
  initialized: boolean
}
```

**Funktionen**:
- `initApp()` - App initialisieren
- `detectCurrentPage()` - Aktuelle Seite erkennen
- `initPanelPage()` - Panel-Seite initialisieren
- `initTicketsPage()` - Tickets-Seite initialisieren
- `showLoadingIndicator(msg)` - Loading anzeigen
- `hideLoadingIndicator()` - Loading verstecken
- `showErrorNotification(msg)` - Fehler anzeigen
- `showSuccessNotification(msg)` - Erfolg anzeigen

**Verwendung**:
```javascript
// Wird automatisch beim Laden initialisiert

// Zugriff auf API
window.TRSApp.api.getConfig();

// Zugriff auf State
window.TRSApp.state.getState('user');

// Event Listener für App-Ready
window.addEventListener('trs-app-ready', () => {
  console.log('App is ready!');
});
```

## Integration in HTML-Templates

Um die neue Architektur zu nutzen, fügen Sie diese Skripte in Ihre EJS-Templates ein:

```html
<!-- CSS -->
<link rel="stylesheet" href="/css/app.css">

<!-- JavaScript Module (in dieser Reihenfolge!) -->
<script src="/js/app/api.js"></script>
<script src="/js/app/state.js"></script>
<script src="/js/app/panel.js"></script>
<script src="/js/app/tickets.js"></script>
<script src="/js/app/main.js"></script>
```

### Beispiel: Panel-Seite

```html
<!DOCTYPE html>
<html>
<head>
  <title>Panel</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <div id="panel-container">
    <form id="panelForm">
      <!-- Formular-Felder -->
    </form>
  </div>

  <!-- Scripts -->
  <script src="/js/app/api.js"></script>
  <script src="/js/app/state.js"></script>
  <script src="/js/app/panel.js"></script>
  <script src="/js/app/main.js"></script>
</body>
</html>
```

### Beispiel: Tickets-Seite

```html
<!DOCTYPE html>
<html>
<head>
  <title>Tickets</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <div class="tickets-header">
    <div class="tickets-filters">
      <select id="filterStatus">
        <option value="all">Alle</option>
        <option value="open">Offen</option>
        <option value="closed">Geschlossen</option>
      </select>
      <input type="text" id="searchTickets" placeholder="Suchen...">
    </div>
    <button id="viewToggle">Ansicht wechseln</button>
  </div>

  <div class="tickets-stats">
    <div class="stat-card">
      <div class="stat-value" id="statTotal">0</div>
      <div class="stat-label">Gesamt</div>
    </div>
    <!-- Weitere Stats -->
  </div>

  <div id="tableView">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Thema</th>
          <th>Ersteller</th>
          <th>Erstellt</th>
          <th>Geschlossen</th>
          <th>Status</th>
          <th>Aktionen</th>
        </tr>
      </thead>
      <tbody id="ticketsTableBody">
        <!-- Tickets werden hier gerendert -->
      </tbody>
    </table>
  </div>

  <div id="cardView" style="display: none;">
    <div id="ticketsCardsContainer">
      <!-- Ticket-Karten werden hier gerendert -->
    </div>
  </div>

  <!-- Scripts -->
  <script src="/js/app/api.js"></script>
  <script src="/js/app/state.js"></script>
  <script src="/js/app/tickets.js"></script>
  <script src="/js/app/main.js"></script>
</body>
</html>
```

## Vorteile der neuen Architektur

### 1. Klare Trennung
- Backend API ist unabhängig vom Frontend
- Frontend kann einfach ausgetauscht werden
- API kann von anderen Clients genutzt werden

### 2. Moderne Patterns
- RESTful API Design
- State Management
- Service Layer Pattern
- Module Pattern

### 3. Bessere Wartbarkeit
- Klare Verantwortlichkeiten
- Modularer Code
- Einfaches Testen
- Dokumentierbar

### 4. Performance
- Lazy Loading möglich
- Caching möglich
- Progressive Web App (PWA) möglich

### 5. Skalierbarkeit
- API kann horizontal skaliert werden
- Frontend kann auf CDN gehostet werden
- Microservices-Architektur möglich

## Sicherheit

### Backend
- Session-basierte Authentifizierung
- CSRF-Schutz durch `sameSite` Cookies
- Rate Limiting (empfohlen)
- Input Validation
- SQL Injection Prevention (JSON-basiert)

### Frontend
- Credentials: 'include' für Cookies
- XSS-Prävention durch DOM-Manipulation
- Content Security Policy (empfohlen)

## Migration von alten Templates

### Schritt 1: API-Calls identifizieren
Finden Sie alle Stellen, wo Daten vom Server geladen werden.

### Schritt 2: API Service verwenden
Ersetzen Sie direkte Fetch-Calls durch API Service.

**Alt**:
```javascript
fetch('/panel', { credentials: 'include' })
  .then(r => r.json())
  .then(data => console.log(data));
```

**Neu**:
```javascript
const { config } = await api.getConfig();
console.log(config);
```

### Schritt 3: State Management integrieren
Nutzen Sie State Manager für reaktive Updates.

**Alt**:
```javascript
let config = null;

function loadConfig() {
  fetch('/api/config')
    .then(r => r.json())
    .then(data => {
      config = data.config;
      updateUI();
    });
}
```

**Neu**:
```javascript
// Config laden
const { config } = await api.getConfig();
state.setState({ config });

// UI aktualisiert sich automatisch durch Subscription
state.subscribe('config', (newConfig) => {
  updateUI(newConfig);
});
```

## Fehlerbehandlung

### Backend
```javascript
try {
  // API Operation
} catch (err) {
  res.status(500).json({ error: 'Fehler-Nachricht' });
}
```

### Frontend
```javascript
try {
  const data = await api.getConfig();
} catch (error) {
  state.setError(error);
  // Error wird automatisch als Toast angezeigt
}
```

## Best Practices

1. **Immer credentials: 'include' verwenden** für Session-Cookies
2. **Error Handling** in allen API-Calls
3. **Loading States** für bessere UX
4. **State Management** für konsistente Daten
5. **Modularer Code** - jede Komponente in eigener Datei
6. **Kommentare** für komplexe Logik
7. **Type Checks** mit JSDoc (optional)

## Nächste Schritte

### Empfohlene Erweiterungen:

1. **TypeScript Migration** - Typ-Sicherheit
2. **Testing** - Unit & Integration Tests
3. **WebSocket** - Real-time Updates
4. **PWA** - Offline-Funktionalität
5. **i18n** - Mehrsprachigkeit im Frontend
6. **Dark Mode API** - Systemweite Dark Mode Erkennung

## Support

Bei Fragen zur Architektur:
- Siehe `CLAUDE.md` für Projektübersicht
- Backend API: `api/routes.js`
- Frontend: `public/js/app/`
- Hauptserver: `panel.js`

---

**Version**: 1.0.0
**Erstellt**: 2025-10-17
**Autor**: Theredstonee
