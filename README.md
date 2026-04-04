# Typing Enhanced

A modern typing practice application with solo and multiplayer modes. Test and improve your typing speed and accuracy with curated word lists.

## Features

- **Solo Practice Mode** - 60-second typing tests with real-time WPM and accuracy tracking
- **Multiplayer Rooms** - Create or join rooms to compete with friends in real-time
- **Difficulty Levels** - Choose from Easy, Medium, or Hard word sets
- **Live Leaderboard** - See rankings with WPM and accuracy after each game
- **Dark/Light Theme** - Toggle between themes with keyboard shortcut (Ctrl+J)

## Architecture

```
typing-enhanced/
├── client/next-app/    # Frontend (Next.js)
└── server/             # Backend (Cloudflare Workers)
```

### Client

Modern React frontend built with Next.js 16.

**Tech Stack:**
- [Next.js 16](https://nextjs.org/) - React framework with App Router
- [shadcn/ui](https://ui.shadcn.com/) - UI components (Radix UI primitives)
- TypeScript - Type safety

**Key Components:**
- `TypingTest` - Solo practice mode with timer, WPM, and accuracy
- `MultiplayerRoom` - Real-time multiplayer room orchestration
- `MultiplayerTyping` - Synchronized typing interface for multiplayer
- `Leaderboard` - Post-game rankings display
- `WaitingLobby` - Pre-game lobby with participant list

### Server

Serverless backend deployed on Cloudflare Workers.

**Tech Stack:**
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless edge compute
- [Hono](https://hono.dev/) - Lightweight web framework
- [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite database
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) - WebSocket state management
- TypeScript - Type safety

**API Endpoints:**
- `GET /api/words/random` - Fetch random words (with optional difficulty filter)
- `POST /api/rooms/create` - Create a multiplayer room
- `GET /api/rooms/:code` - Get room details
- `GET /api/rooms/:code/ws` - WebSocket connection for real-time sync
- `GET /api/rooms/:code/leaderboard` - Get room leaderboard

## Getting Started

### Prerequisites

- Node.js 18+
- Bun (for server) or npm
- Cloudflare account (for deployment)

### Client Setup

```bash
cd client/next-app

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Edit .env.local with your server URL

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Server Setup

```bash
cd server

# Install dependencies
bun install  # or npm install

# Run locally
bun run dev

# Deploy to Cloudflare
bun x wrangler deploy
```

### Environment Variables

**Client (.env.local):**
```env
NEXT_PUBLIC_API_URL=https://your-worker.workers.dev
NEXT_PUBLIC_WS_URL=wss://your-worker.workers.dev
SERVER_URL=https://your-worker.workers.dev
```

## Database Schema

The D1 database contains:

- **words** - Word list with difficulty levels (1=Easy, 2=Medium, 3=Hard)
- **rooms** - Multiplayer room metadata
- **room_participants** - Player data for each room

## Multiplayer Flow

1. **Create Room** - Host creates room with time limit and difficulty
2. **Share Code** - 6-character room code is generated
3. **Join Room** - Players enter code and their name
4. **Waiting Lobby** - All players see who's connected
5. **Start Game** - Host starts the game, all players type simultaneously
6. **Live Progress** - See other players' progress in real-time
7. **Leaderboard** - Final rankings by WPM and accuracy

## Development

```bash
# Client
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run lint         # Run ESLint
npm run typecheck    # TypeScript check

# Server
bun run dev          # Local development
bun run deploy       # Deploy to Cloudflare
```

## Deployment

**Client:** Deploy to Vercel, Netlify, or any Node.js hosting

**Server:** Deployed to Cloudflare Workers at:
- https://server.typing-enhanced-eagle.workers.dev

## License

MIT
