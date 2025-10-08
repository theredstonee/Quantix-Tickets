# 🎫 TRS Tickets - Discord Ticket System

Professional Discord Ticket System with Next.js 14 Admin Panel

## 📦 Monorepo Structure

```
TRS-Tickets-Bot/
├── apps/
│   ├── bot/              # Discord Bot (Node.js)
│   └── web/              # Next.js 14 Admin Panel (TypeScript)
├── packages/
│   └── shared/           # Shared types & utilities
└── pnpm-workspace.yaml   # Workspace configuration
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8 (install: `npm install -g pnpm`)
- Discord Bot Token
- Discord OAuth2 Credentials

### Installation

1. **Install dependencies:**
```bash
# Root directory
pnpm install
```

2. **Configure Bot (.env in apps/bot/):**
```bash
cd apps/bot
cp .env.example .env
```

Edit `.env`:
```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret
SESSION_SECRET=your_session_secret
PUBLIC_BASE_URL=http://localhost:3001
```

3. **Configure Web (.env.local in apps/web/):**
```bash
cd apps/web
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=run_this_openssl_rand_base64_32
BOT_DATA_PATH=../bot
```

### Development

**Start everything:**
```bash
pnpm dev
```

**Start individually:**
```bash
# Bot only (Port 3000)
pnpm dev:bot

# Web only (Port 3001)
pnpm dev:web
```

**Access:**
- Bot Web Panel (Legacy): http://localhost:3000
- Next.js Admin Panel: http://localhost:3001

## 🏗️ Production Build

```bash
# Build everything
pnpm build

# Start production
pnpm start
```

## 📚 Tech Stack

### Bot (apps/bot/)
- **Discord.js** 14
- **Express.js** 4
- **Passport** (Discord OAuth)
- **EJS** Templates

### Web (apps/web/)
- **Next.js** 14 (App Router)
- **TypeScript** 5
- **NextAuth.js** (Discord OAuth)
- **Pico CSS** (Minimal CSS Framework)
- **Font Awesome** 6
- **React** 18

## 🎨 Features

- ✅ **Full-Screen Layout** - Responsive, fills entire viewport
- ✅ **Discord OAuth** - Secure authentication
- ✅ **Multi-Language** - DE, EN, HE support
- ✅ **Dark Mode** - Auto-sync across pages
- ✅ **Font Awesome Icons** - Professional iconography
- ✅ **TypeScript** - Type-safe development
- ✅ **Monorepo** - Clean architecture with pnpm workspaces

## 📖 Migration Status

| Feature | Status | Notes |
|---------|--------|-------|
| Home Page | ✅ Done | Full React, Next.js 14 |
| Authentication | ✅ Done | NextAuth.js with Discord |
| Theme Toggle | ✅ Done | localStorage + Cookie sync |
| Language Selector | ✅ Done | Cookie-based |
| Panel Page | 🚧 In Progress | API routes needed |
| Tickets Page | 📝 Planned | - |
| Legal Pages | 📝 Planned | Imprint, Privacy, Terms |

## 🔧 Configuration

### Bot Configuration
All bot config is stored in `apps/bot/configs/<guildId>.json`

### Next.js Configuration
- `next.config.js` - Next.js settings
- `.env.local` - Environment variables
- `src/app/globals.css` - Global styles

## 🐛 Troubleshooting

**Port conflicts:**
- Bot runs on port 3000
- Next.js runs on port 3001
- Change in `package.json` scripts if needed

**pnpm not installed:**
```bash
npm install -g pnpm
```

**TypeScript errors:**
```bash
cd apps/web
pnpm tsc --noEmit
```

## 📝 License

Private Project - All Rights Reserved

## 👤 Author

**Ohev Tamerin**
- Website: https://trstickets.theredstonee.de
- Email: info@theredstonee.de

---

## 🚀 Next Steps (Migration Continuation)

1. [ ] Migrate Panel Page (`/panel`) with server selection
2. [ ] Create API routes for config management
3. [ ] Migrate Tickets Page (`/tickets`)
4. [ ] Migrate Legal Pages (imprint, privacy, terms)
5. [ ] Add Server-side rendering for ticket data
6. [ ] Implement real-time updates (optional: WebSockets)

**To continue development:**
```bash
cd apps/web
pnpm dev
```

🎉 **Welcome to Next.js 14 + TypeScript!**
