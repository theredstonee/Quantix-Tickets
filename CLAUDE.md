# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TRS-Tickets-Bot is a Discord.js v14 ticket bot with an Express-based web admin panel. Users create tickets via a Discord select menu (topics), fill out optional dynamic forms, and interact with tickets using buttons. The bot supports priority levels, claiming, transcripts, and a web dashboard for configuration and viewing ticket history.

## Key Commands

**Start the bot:**
```bash
node index.js
```

**Install dependencies:**
```bash
npm install
```

The bot starts an Express server on port 3000 and logs in to Discord.

## Architecture

### Core Files

- **`index.js`** (main bot entry point)
  - Discord client with Gateway intents (Guilds, GuildMessages, GuildMembers)
  - Slash command registration (`/dashboard`)
  - Interaction handlers for select menus, buttons, and modals
  - Ticket lifecycle: creation, priority updates, claiming, closing, transcripts
  - Channel rename queue with debouncing to handle Discord rate limits (index.js:160-179)

- **`panel.js`** (Express router module)
  - Passport + Discord OAuth for authentication
  - Routes: `/`, `/login`, `/panel`, `/tickets`, `/transcript/:id`
  - Admin panel for editing topics, form fields, embeds, sending/editing panel messages
  - Fetches member data to display usernames instead of IDs in ticket history
  - Must be passed the Discord client instance: `app.use('/', require('./panel')(client))`

- **`commands/dashboard.js`**
  - Slash command definition for `/dashboard` (provides panel link)

### Data Files

- **`config.json`** - All bot configuration (guildId, ticketCategoryId, topics, formFields, embeds, panel message IDs)
- **`ticketCounter.json`** - Simple counter (`{ "last": N }`) for ticket numbering
- **`tickets.json`** - Array of ticket objects with id, channelId, userId, topic, status, priority, timestamp, formData, claimer
- **`transcript_<id>.txt`** and **`transcript_<id>.html`** - Generated transcripts when tickets close

### Views (EJS Templates)

- **`views/panel.ejs`** - Admin configuration panel (topics, form fields, embeds)
- **`views/tickets.ejs`** - Ticket history view with member names
- **`views/ticketDetail.ejs`** - (if used) Individual ticket detail

### Configuration Structure (config.json)

```json
{
  "guildId": "...",
  "ticketCategoryId": "...",
  "logChannelId": "...",
  "transcriptChannelId": "...",
  "topics": [
    { "label": "Bug‑Report", "value": "bug", "emoji": "🐞" }
  ],
  "formFields": [
    { "label": "Wie heißt du?", "id": "name", "style": "short", "required": true, "topic": "bug" }
  ],
  "ticketEmbed": {
    "title": "🎫 Ticket #{ticketNumber}",
    "description": "Hallo {userMention}\n**Thema:** {topicLabel}",
    "color": "#2b90d9",
    "footer": "Ticket #{ticketNumber}"
  },
  "panelEmbed": {
    "title": "Ticket System",
    "description": "Wähle dein Thema",
    "color": "#5865F2",
    "footer": "Support"
  },
  "panelMessageId": "...",
  "panelChannelId": "..."
}
```

**Form fields:**
- Can be global or topic-specific (`"topic": "bug"` or `"topic": ["bug","server"]`)
- Max 5 fields per modal (Discord limit)
- `style`: "short" or "paragraph"
- Answers stored in `ticket.formData` and displayed as embed fields

### Environment Variables (.env)

Required:
- `DISCORD_TOKEN` - Bot token
- `CLIENT_ID` - OAuth2 client ID
- `CLIENT_SECRET` - OAuth2 client secret

Optional:
- `SESSION_SECRET` - Express session secret (default: 'ticketbotsecret')
- `PUBLIC_BASE_URL` - Base URL for OAuth callback (e.g., `https://trstickets.theredstonee.de`)
- `PANEL_URL` - Dashboard URL shown in `/dashboard` command

### Ticket Flow

1. User clicks select menu (topic selector) in panel channel
2. If form fields configured for topic → modal shown → user fills out → ticket created
3. If no form fields → ticket created immediately
4. Ticket channel created with permissions: deny @everyone, allow user + TEAM_ROLE
5. Embed sent with ticket info + form answers as fields
6. Buttons: Close, Claim/Unclaim, Priority Up/Down, Add User, Request Close

### Priority System

- 3 levels: Green (0), Orange (1), Red (2)
- Priority stored in `ticket.priority`
- Channel name format: `🎫│🟢ticket-00001`
- Rename uses debounced queue to avoid rate limits (min 3s interval, max 8s delay)

### Transcripts

- Generated on ticket close (createTranscript function in index.js:188-278)
- Fetches up to 1000 messages
- Resolves mentions to readable names if `resolveMentions: true`
- Saves `.txt` and `.html` files locally
- Uploads to `transcriptChannelId` (or falls back to `logChannelId`)

### Authentication & Permissions

Panel routes protected by `isAuth` middleware (panel.js:54-61):
- User must be authenticated via Discord OAuth
- User must be in the configured guild
- User must have Admin (0x8) or Manage Guild (0x20) permissions

### Constants

- `TEAM_ROLE` = '1387525699908272218' (hardcoded in index.js:42)
- `PREFIX` = '🎫│' (channel name prefix)
- Panel port: 3000

## Important Implementation Notes

- **Channel renaming:** Uses a queue system to handle Discord rate limits. Never rename channels directly; always use `scheduleChannelRename()` or `renameChannelIfNeeded()`
- **Safe JSON helpers:** Use `safeRead()` and `safeWrite()` for all file operations (index.js:56-59)
- **Panel message reset:** After ticket creation, the panel select menu is reset by re-editing the panel message (index.js:482-503)
- **Form field limits:** Discord modals support max 5 text inputs. Extra fields are sliced off (index.js:289)
- **Embed placeholders:** `{ticketNumber}`, `{userMention}`, `{userId}`, `{topicLabel}`, `{topicValue}` are replaced in embed strings (index.js:141-146)
- **Member fetching:** Panel uses `GuildMembers` intent to fetch member display names for ticket history
