# 🔄 Migration Guide: Express/EJS → Next.js 14

## ✅ Completed

### 1. Project Structure
- ✅ Monorepo setup with pnpm workspaces
- ✅ `/apps/bot/` - Original Discord Bot
- ✅ `/apps/web/` - New Next.js App
- ✅ TypeScript configuration

### 2. Core Pages
- ✅ **Home Page** (`/`)
  - EJS → React Component
  - Full-screen layout
  - Pico CSS integration
  - Font Awesome icons

### 3. Authentication
- ✅ **Discord OAuth**
  - Passport → NextAuth.js
  - Session management
  - Type-safe user session

### 4. Components
- ✅ **ThemeToggle** - Dark/Light mode with localStorage
- ✅ **LanguageSelector** - DE/EN/HE support
- ✅ **Full-Screen Layout** - Responsive, fills viewport

### 5. Styling
- ✅ **Pico CSS** - Minimal framework kept
- ✅ **Custom CSS** - Full-screen layout
- ✅ **Font Awesome** - Icon library
- ✅ **5rem padding** - Consistent spacing

## 🚧 In Progress

### Panel Page (`/select-server` + `/panel`)
**Old:** `panel.js` Express Router + `panel.ejs`
**New:** Need to create:
1. `/apps/web/src/app/select-server/page.tsx`
2. `/apps/web/src/app/panel/page.tsx`
3. API Routes:
   - `/api/guilds` - Fetch user guilds
   - `/api/config/[guildId]` - Get/Update config
   - `/api/panel/send` - Send panel message
   - `/api/panel/edit` - Edit panel message

**Data Access:**
- Read/Write to `../bot/configs/<guildId>.json`
- Node.js `fs` module in API routes

## 📝 TODO

### Tickets Page (`/tickets`)
**Old:** `tickets.ejs` with client-side table
**New:**
1. `/apps/web/src/app/tickets/page.tsx`
2. API Route: `/api/tickets/[guildId]`
3. Server-side rendering for performance
4. Real-time updates (optional)

### Legal Pages
**Old:** `imprint.ejs`, `privacy-policy.ejs`, `terms-of-service.ejs`
**New:**
1. `/apps/web/src/app/imprint/page.tsx`
2. `/apps/web/src/app/privacy-policy/page.tsx`
3. `/apps/web/src/app/terms-of-service/page.tsx`
4. Shared layout component

### API Routes Structure
```
/apps/web/src/app/api/
├── auth/
│   └── [...nextauth]/
│       └── route.ts ✅
├── guilds/
│   └── route.ts 📝 TODO
├── config/
│   └── [guildId]/
│       └── route.ts 📝 TODO
├── tickets/
│   └── [guildId]/
│       └── route.ts 📝 TODO
└── panel/
    ├── send/
    │   └── route.ts 📝 TODO
    └── edit/
        └── route.ts 📝 TODO
```

## 🔍 Key Differences

| Feature | Old (Express/EJS) | New (Next.js) |
|---------|-------------------|---------------|
| Routing | Express Router | File-based |
| Templates | EJS | React Components |
| Auth | Passport | NextAuth.js |
| State | Session + Cookies | React State + Cookies |
| API | Express routes | Next.js API Routes |
| Build | Node.js runtime | Optimized builds |
| Deploy | Any Node server | Vercel or Node server |

## 🎯 Migration Steps (Continue)

### Step 1: Server Selection
```bash
# Create page
touch apps/web/src/app/select-server/page.tsx

# Create API
mkdir -p apps/web/src/app/api/guilds
touch apps/web/src/app/api/guilds/route.ts
```

### Step 2: Panel Page
```bash
# Create page
mkdir -p apps/web/src/app/panel
touch apps/web/src/app/panel/page.tsx

# Create config API
mkdir -p apps/web/src/app/api/config/[guildId]
touch apps/web/src/app/api/config/[guildId]/route.ts
```

### Step 3: Tickets Page
```bash
# Create page
mkdir -p apps/web/src/app/tickets
touch apps/web/src/app/tickets/page.tsx

# Create API
mkdir -p apps/web/src/app/api/tickets/[guildId]
touch apps/web/src/app/api/tickets/[guildId]/route.ts
```

## 💡 Best Practices

1. **File System Access** - Use Node.js `fs` only in API Routes (server-side)
2. **Type Safety** - Create shared types in `/packages/shared/`
3. **Error Handling** - Use try/catch in API routes
4. **Loading States** - Show loading spinners in React components
5. **SEO** - Use Next.js metadata for each page
6. **Performance** - Use React Server Components when possible

## 🔒 Security

- ✅ NextAuth.js handles CSRF tokens
- ✅ Environment variables for secrets
- ✅ API routes check authentication
- ✅ Guild membership verification

## 📊 Performance

- ⚡ Next.js optimized builds
- ⚡ Automatic code splitting
- ⚡ Static generation where possible
- ⚡ Server-side rendering for dynamic data

## 🐛 Known Issues

1. **Port Conflict** - Bot (3000) vs Next.js (3001)
   - Solution: Run on different ports
2. **Shared Data** - Bot writes files, Next.js reads
   - Solution: File system access in API routes
3. **Session Sync** - Passport vs NextAuth
   - Solution: Keep separate, share cookies

## 📖 Resources

- [Next.js 14 Docs](https://nextjs.org/docs)
- [NextAuth.js](https://next-auth.js.org/)
- [Pico CSS](https://picocss.com/)
- [TypeScript](https://www.typescriptlang.org/)

---

**Last Updated:** 2025-01-08
**Migration Progress:** ~40% Complete
