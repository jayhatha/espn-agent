# Getting Started with ESPN Fantasy Baseball Assistant

This guide will help you set up and run the ESPN Fantasy Baseball Assistant application.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** 18+ (download from https://nodejs.org/)
- **PostgreSQL** 15+ (download from https://www.postgresql.org/download/)
- **Redis** 7+ (download from https://redis.io/download/)
- **pnpm** (recommended) or npm: `npm install -g pnpm`

## Initial Setup

### 1. Install Dependencies

From the project root:

```bash
pnpm install
```

This will install all dependencies for all packages in the monorepo.

### 2. Set Up PostgreSQL

Create the database:

```bash
createdb espn_fantasy
```

Or using psql:

```sql
CREATE DATABASE espn_fantasy;
```

### 3. Set Up Environment Variables

#### Backend (.env)

Create `packages/backend/.env`:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit the file with your settings:

```env
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://localhost:5432/espn_fantasy

# Redis
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
```

#### Frontend (.env.local)

Create `packages/frontend/.env.local`:

```bash
cp packages/frontend/.env.local.example packages/frontend/.env.local
```

Content:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 4. Run Database Migrations

```bash
cd packages/backend
pnpm run migrate
```

This will create all the necessary database tables.

### 5. Start Services

You need three terminal windows/tabs:

#### Terminal 1: Start Redis

```bash
redis-server
```

#### Terminal 2: Start Backend API

```bash
cd packages/backend
pnpm dev
```

The backend API will be available at http://localhost:3001

#### Terminal 3: Start Frontend

```bash
cd packages/frontend
pnpm dev
```

The frontend will be available at http://localhost:3000

## Using the Application

### Step 1: Connect Your ESPN League

1. Go to http://localhost:3000
2. Click "Leagues"
3. Click "Connect League"
4. Enter your ESPN League ID and Season (found in your ESPN league URL)
5. For private leagues, you'll need your ESPN cookies:
   - Open your ESPN league in a browser
   - Open Developer Tools (F12)
   - Go to Application > Cookies
   - Copy the values for `SWID` and `espn_s2`

### Step 2: Upload Projections

1. Download FanGraphs Depth Charts RoS projections:
   - Batters: https://www.fangraphs.com/projections.aspx?pos=all&stats=bat&type=rfangraphsdc
   - Pitchers: https://www.fangraphs.com/projections.aspx?pos=all&stats=pit&type=rfangraphsdc
   - Export each as CSV
2. Go to "Projections" in the app
3. Upload both CSV files for today's date

### Step 3: Run Daily Snapshot

The snapshot orchestrator will run automatically at 03:00 league timezone, but you can trigger it manually:

```bash
cd packages/backend
node -e "import('./src/workers/snapshot-worker.js').then(m => m.scheduleDailySnapshots())"
```

### Step 4: View Recommendations

Once you have snapshots and projections:

1. Go to "Waivers" to see add/drop recommendations
2. Go to "Trends" to see historical performance graphs
3. View projected standings and category breakdowns

## Development Tips

### Running Tests

```bash
# Backend tests
cd packages/backend
pnpm test

# Frontend tests (once added)
cd packages/frontend
pnpm test
```

### Linting

```bash
# Lint all packages
pnpm lint

# Or individual packages
cd packages/backend && pnpm lint
cd packages/frontend && pnpm lint
```

### Database Management

Reset database (WARNING: deletes all data):

```bash
dropdb espn_fantasy
createdb espn_fantasy
cd packages/backend && pnpm run migrate
```

### Worker Management

To manually process snapshot jobs:

```bash
cd packages/backend
tsx src/workers/snapshot-worker.ts
```

## Architecture Overview

The application follows a multi-agent architecture:

- **ESPNAdapter**: Fetches and normalizes ESPN data
- **ProjectionsIngestAgent**: Ingests FanGraphs CSV projections
- **PlayerIdentityResolutionAgent**: Matches players across systems
- **StandingsProjectionAgent**: Computes projected standings using component math
- **WaiverRecommendationAgent**: Generates add/drop recommendations
- **SnapshotOrchestratorAgent**: Orchestrates daily snapshot jobs
- **API Layer**: Fastify REST API
- **Frontend**: Next.js with App Router and TanStack Query

## Troubleshooting

### Port Already in Use

If port 3001 or 3000 is already in use:

```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Database Connection Issues

Check your PostgreSQL is running:

```bash
pg_isready
```

### Redis Connection Issues

Check your Redis is running:

```bash
redis-cli ping
# Should return: PONG
```

### Migration Errors

If migrations fail, check the logs and ensure your DATABASE_URL is correct.

## Next Steps

1. **Complete ESPN Adapter**: The current implementation is simplified. You'll need to fully implement the ESPN data normalization based on your league's actual response structure.

2. **Implement Remaining Agents**: Trade and draft recommendation agents are placeholders and need full implementation.

3. **Add More UI Pages**: Create pages for leagues list, projections upload, trends graphs, etc.

4. **Add Authentication**: Consider adding user authentication to secure the application.

5. **Deploy**: Prepare for production deployment with Docker, environment-specific configs, and monitoring.

## Resources

- [Design Document](./# DESIGN_DOC.md) - Full system design
- [Agents Documentation](./AGENTS.md) - Agent architecture details
- [Next.js Docs](https://nextjs.org/docs)
- [Fastify Docs](https://www.fastify.io/)
- [Kysely Docs](https://kysely.dev/)
