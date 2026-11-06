# ESPN Fantasy Baseball Assistant

A web app that connects to ESPN Fantasy Baseball leagues and provides:

- Draft tools (work in progress)
- Trade advice (impact + candidate generation)
- Waiver wire suggestions (adds/drops + category targeting)
- Rest-of-season (RoS) standings projections per category and overall

## Architecture

This is a monorepo containing:

- **packages/backend**: Node.js/TypeScript backend with Fastify
- **packages/frontend**: Next.js App Router frontend
- **packages/shared**: Shared types and utilities
- **packages/scraper**: Scraper utilities

## ESPN Draft Tools (Work in Progress)

Draft support is experimental and not available end-to-end.

- Existing code includes league-specific auction valuations, snake-draft rankings, and a mobile draft companion page.
- There is no `packages/extension` workspace or installable Chrome extension in this repository.
- Live ESPN draft-page detection, pick ingestion, and the extension-to-companion WebSocket client are not implemented here.
- The mobile companion expects a separate `role=extension` WebSocket publisher, so it cannot receive live draft data on its own.
- Treat draft recommendations and draft companion workflows as works in progress; do not rely on them during a live draft.

Pre-draft routes: `/leagues/[id]/draft/rankings` and `/leagues/[id]/draft/auction`. Live companion: `/draft/live`.

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

See [Development Setup](./docs/DEVELOPMENT.md) for setup details.

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

- [Development Setup](./docs/DEVELOPMENT.md)
- [API Reference](./docs/API.md)
- [ESPN API Notes](./docs/ESPN_API.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Database](./docs/DATABASE.md)
- [Frontend](./docs/FRONTEND.md)

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
