# ESPN Fantasy Baseball Assistant

A web app that connects to ESPN Fantasy Baseball leagues and provides:

- Draft assistance (snake + auction)
- Trade advice (impact + candidate generation)
- Waiver wire suggestions (adds/drops + category targeting)
- Rest-of-season (RoS) standings projections per category and overall

## Architecture

This is a monorepo containing:

- **packages/backend**: Node.js/TypeScript backend with Fastify
- **packages/frontend**: Next.js App Router frontend
- **packages/shared**: Shared types and utilities
- **packages/extension**: Chrome extension for live draft assistance

## ESPN Live Draft Assistant (Chrome Extension) 🎯

A Chrome extension that provides real-time draft recommendations directly on the ESPN Fantasy Baseball draft page.

### Features

- **Snake Draft Support**
  - Best Player Available (BPA) rankings with VBD scoring
  - Position-based filtering and positional needs detection
  - Snake turn pair recommendations for back-to-back picks
  - Real-time roster summary with category totals

- **Auction Draft Support**
  - Budget pacing tracker (ahead/on-track/behind)
  - Dollar value recommendations
  - Recommended max bid calculations
  - Affordability indicators and value badges

- **Pick Value Tracking**
  - Overpay/underpay indicators for all teams
  - Team efficiency leaderboard
  - Competitive intelligence on draft performance

- **Shadow DOM UI**
  - Style-isolated sidebar (doesn't conflict with ESPN)
  - Collapsible interface (400px wide, right-aligned)
  - Persistent across page scroll and updates

### Quick Start

1. **Build the Extension**
   ```bash
   cd packages/extension
   pnpm install
   pnpm build
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select `packages/extension/.output/chrome-mv3` directory

3. **Use During Draft**
   - Navigate to any ESPN Fantasy Baseball draft page
   - The assistant sidebar will automatically appear on the right side
   - Rankings load automatically from bundled baseline data
   - Pick detection happens in real-time via DOM observation

### Optional: Connect to Backend

To use custom projections and league-specific rankings:

1. **Start the backend server**
   ```bash
   # Using Docker
   ./docker.sh dev-up

   # Or manually
   cd packages/backend && pnpm dev
   ```

2. **Generate an API token** (Coming soon)
   - Feature is planned but not yet implemented
   - Current workaround: Extension uses session-based auth from browser cookies
   - Navigate to `http://localhost:3001` and sign in
   - Extension will inherit your browser session automatically

3. **Configure extension settings**
   - Click extension icon in Chrome toolbar
   - Set Backend URL (e.g., `http://localhost:3001`)
   - Save settings (API token field optional until token system is implemented)

4. **The extension will fetch:**
   - League-specific rankings based on roster settings
   - Custom player projections from FanGraphs uploads
   - Real-time standings projections

**Note:** Extension works standalone with bundled rankings if backend is not available.

### Development

```bash
cd packages/extension
pnpm dev    # Start development mode with hot reload
pnpm build  # Build for production
```

See `packages/extension/README.md` for detailed extension development instructions.

## Quick Start (Docker) 🐳

The easiest way to run the entire application:

```bash
# Start everything with Docker
./docker.sh dev-up

# Run migrations
./docker.sh migrate

# View logs
./docker.sh logs
```

**That's it!** Visit:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

See [DOCKER.md](./DOCKER.md) for complete Docker documentation.

## Manual Setup (Without Docker)

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- pnpm (recommended) or npm

### Installation

```bash
pnpm install
```

### Database Setup

```bash
# Create PostgreSQL database
createdb espn_fantasy

# Run migrations
cd packages/backend
pnpm run migrate
```

### Development

```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start backend
cd packages/backend && pnpm dev

# Terminal 3: Start frontend
cd packages/frontend && pnpm dev
```

### Environment Variables

Create `.env` files in backend and frontend packages based on `.env.example`.

## Features

- Daily snapshots at 03:00 league timezone
- FanGraphs Depth Charts RoS projections via CSV upload
- Component-based math for AVG/OBP/OPS/ERA/WHIP
- Time series graphs with transaction overlays
- Mobile-first responsive design

## Documentation

- **[Docker Setup](./DOCKER.md)** - Complete Docker/Docker Compose guide
- **[Getting Started](./GETTING_STARTED.md)** - Detailed setup and usage guide
- **[Design Document](./# DESIGN_DOC.md)** - Full system design specification
- **[Agents Architecture](./AGENTS.md)** - Multi-agent system details
- **[Project Structure](./PROJECT_STRUCTURE.md)** - Codebase organization
- **[Roadmap](./ROADMAP.md)** - Development roadmap and future features

## Development Commands

```bash
# Docker
./docker.sh dev-up          # Start dev environment
./docker.sh dev-down        # Stop dev environment
./docker.sh logs [service]  # View logs
./docker.sh shell [service] # Shell into container
./docker.sh migrate         # Run migrations
./docker.sh clean           # Clean everything

# Local (without Docker)
pnpm install                # Install dependencies
pnpm dev                    # Start all services
pnpm build                  # Build all packages
pnpm lint                   # Lint all packages
```

## Technology Stack

- **Backend**: Fastify, Kysely, PostgreSQL, Redis, BullMQ
- **Frontend**: Next.js 14, TanStack Query, Tailwind CSS
- **Database**: PostgreSQL 15+
- **Cache/Queue**: Redis 7+
- **Language**: TypeScript 5+
- **Deployment**: Docker & Docker Compose

## Contributing

This is a personal project, but suggestions and feedback are welcome! Please open an issue to discuss any major changes.

## License

MIT
