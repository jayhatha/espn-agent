# Quick Start Guide - Docker Edition

Get the ESPN Fantasy Baseball Assistant running in under 5 minutes!

## Prerequisites

- **Docker Desktop** installed and running ([Download](https://www.docker.com/products/docker-desktop))
- **Git** (optional, for cloning)

That's it! No Node.js, PostgreSQL, or Redis installation needed.

## Step 1: Get the Code

If you haven't already:

```bash
cd espn-agent  # or wherever your project is
```

## Step 2: Start Everything

```bash
./docker.sh dev-up
```

This command will:

- ✅ Create a `.env` file with sensible defaults
- ✅ Pull Docker images (postgres, redis, node)
- ✅ Build your backend and frontend containers
- ✅ Start all 5 services (postgres, redis, backend, worker, frontend)
- ✅ Set up networking between services

**First time?** This will take 5-10 minutes while Docker downloads images and installs dependencies. Subsequent starts are much faster (30 seconds).

## Step 3: Run Database Migrations

Once containers are running:

```bash
./docker.sh migrate
```

This creates all database tables.

## Step 4: Verify Everything Works

### Check Service Status

```bash
./docker.sh status
```

You should see all 5 services with "Up" status:

```
NAME                IMAGE                           STATUS
espn-postgres       postgres:15-alpine              Up (healthy)
espn-redis          redis:7-alpine                  Up (healthy)
espn-backend        espn-agent-backend              Up
espn-worker         espn-agent-backend              Up
espn-frontend       espn-agent-frontend             Up
```

### Test the Application

1. **Frontend**: Open http://localhost:3000
   - You should see the home page with 4 feature cards

2. **Backend API**: Open http://localhost:3001/api
   - You should see JSON with app name and version

3. **Health Check**: Open http://localhost:3001/health
   - You should see `{"status":"ok","timestamp":"..."}`

## Step 5: View Logs

To see what's happening:

```bash
# All services
./docker.sh logs

# Specific service
./docker.sh logs backend
./docker.sh logs frontend

# Follow logs in real-time
./docker.sh logs backend | grep -i error
```

## Common Commands

```bash
# View container status
./docker.sh status

# Restart a service
docker-compose -f docker-compose.dev.yml restart backend

# Shell into a container
./docker.sh shell backend

# Stop everything
./docker.sh dev-down

# Start again (much faster after first time)
./docker.sh dev-up

# Clean everything (removes all data!)
./docker.sh clean
```

## What's Running?

| Service    | Purpose         | Port | URL                   |
| ---------- | --------------- | ---- | --------------------- |
| Frontend   | Next.js web app | 3000 | http://localhost:3000 |
| Backend    | Fastify API     | 3001 | http://localhost:3001 |
| Worker     | Background jobs | -    | -                     |
| PostgreSQL | Database        | 5432 | localhost:5432        |
| Redis      | Cache/Queue     | 6379 | localhost:6379        |

## Development Workflow

### Making Code Changes

Changes are automatically detected!

1. **Backend changes**: Edit files in `packages/backend/src/`
   - tsx watch will restart the server automatically

2. **Frontend changes**: Edit files in `packages/frontend/src/`
   - Next.js hot reload will update immediately

3. **Shared changes**: Edit files in `packages/shared/src/`
   - Both backend and frontend will pick up changes

### Database Operations

```bash
# Access PostgreSQL
./docker.sh shell postgres
psql -U espn_user -d espn_fantasy

# Or use psql from host (if installed)
psql postgresql://espn_user:espn_password@localhost:5432/espn_fantasy

# Backup database
docker-compose -f docker-compose.dev.yml exec postgres \
  pg_dump -U espn_user espn_fantasy > backup.sql

# Restore database
docker-compose -f docker-compose.dev.yml exec -T postgres \
  psql -U espn_user espn_fantasy < backup.sql
```

### Redis Operations

```bash
# Access Redis CLI
./docker.sh shell redis
redis-cli

# Check keys
redis-cli KEYS "*"

# Monitor commands
redis-cli MONITOR
```

## Troubleshooting

### Problem: Port already in use

```bash
# Find what's using the port
lsof -i :3001

# Kill the process
kill -9 <PID>

# Or change the port in docker-compose.dev.yml
```

### Problem: Container won't start

```bash
# Check logs
./docker.sh logs backend

# Try rebuilding
./docker.sh rebuild
```

### Problem: Database connection failed

```bash
# Check postgres health
./docker.sh status

# View postgres logs
./docker.sh logs postgres

# Restart postgres
docker-compose -f docker-compose.dev.yml restart postgres
```

### Problem: Changes not showing up

```bash
# For backend (force restart)
docker-compose -f docker-compose.dev.yml restart backend

# For frontend (Next.js cache issue)
./docker.sh shell frontend
rm -rf .next
exit
docker-compose -f docker-compose.dev.yml restart frontend

# Nuclear option (rebuild everything)
./docker.sh rebuild
```

### Problem: Out of disk space

```bash
# Clean up Docker
docker system prune -a --volumes

# This project only
./docker.sh clean
```

## Next Steps

1. **Connect your ESPN league**:
   - Go to http://localhost:3000
   - Click "Leagues" → "Connect League"
   - Enter your ESPN League ID and season

2. **Upload projections**:
   - Download FanGraphs Depth Charts RoS CSV files
   - Go to "Projections" → Upload

3. **Get recommendations**:
   - View waiver wire suggestions
   - Analyze trade impacts
   - See projected standings

## Stopping the Application

```bash
# Stop all containers (keeps data)
./docker.sh dev-down

# Remove everything including data
./docker.sh clean
```

## Production Deployment

For production, use the production compose file:

```bash
# Create .env with secure values
cp .env.example .env
# Edit .env with secure passwords

# Start production
./docker.sh prod-up
```

## Getting Help

- Check logs: `./docker.sh logs`
- View status: `./docker.sh status`
- See all commands: `./docker.sh help`
- Read full docs: [DOCKER.md](./DOCKER.md)

## Success Criteria

You're all set if:

- ✅ All 5 containers show "Up" status
- ✅ http://localhost:3000 shows the home page
- ✅ http://localhost:3001/health returns `{"status":"ok"}`
- ✅ Migrations ran without errors
- ✅ Logs show no critical errors

Happy fantasy baseball managing! ⚾️
