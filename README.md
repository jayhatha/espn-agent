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
