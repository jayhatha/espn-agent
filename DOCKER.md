# Docker Setup Guide

This guide covers running the ESPN Fantasy Baseball Assistant using Docker and Docker Compose.

## Prerequisites

- **Docker** 20.10+ ([Install Docker](https://docs.docker.com/get-docker/))
- **Docker Compose** 2.0+ ([Install Docker Compose](https://docs.docker.com/compose/install/))

## Quick Start (Development)

The easiest way to get started is using the provided `docker.sh` script:

```bash
# Setup and start everything
./docker.sh dev-up

# View logs
./docker.sh logs

# Run migrations
./docker.sh migrate
```

That's it! The application will be available at:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Manual Setup

### 1. Development Environment

Start all services in development mode with hot-reload:

```bash
# Start services
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Run migrations
docker-compose -f docker-compose.dev.yml exec backend pnpm run migrate

# Stop services
docker-compose -f docker-compose.dev.yml down
```

### 2. Production Environment

Build and run optimized production containers:

```bash
# Create .env file
cp .env.example .env
# Edit .env with your production values

# Build and start services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Docker Services

The stack includes 5 services:

1. **postgres** - PostgreSQL 15 database
   - Port: 5432
   - Data persisted in Docker volume
   - Auto-created database: `espn_fantasy`

2. **redis** - Redis 7 cache/queue
   - Port: 6379
   - Data persisted in Docker volume

3. **backend** - Fastify API server
   - Port: 3001
   - Hot-reload in dev mode
   - Health checks enabled

4. **worker** - Background job processor
   - Processes snapshot jobs
   - Shares database/redis with backend

5. **frontend** - Next.js web app
   - Port: 3000
   - Hot-reload in dev mode

## Using the docker.sh Script

The `docker.sh` script provides convenient commands:

### Development Commands

```bash
./docker.sh setup-dev      # Create .env file
./docker.sh dev-up          # Start dev environment
./docker.sh dev-down        # Stop dev environment
./docker.sh logs            # View all logs
./docker.sh logs backend    # View specific service logs
./docker.sh migrate         # Run database migrations
./docker.sh shell backend   # Open shell in backend container
./docker.sh status          # Show container status
```

### Production Commands

```bash
./docker.sh prod-up         # Start production environment
./docker.sh prod-down       # Stop production environment
```

### Maintenance Commands

```bash
./docker.sh rebuild         # Rebuild all containers from scratch
./docker.sh clean           # Remove all containers, volumes, images
```

## Common Tasks

### Running Database Migrations

```bash
# Dev
./docker.sh migrate

# Or manually
docker-compose -f docker-compose.dev.yml exec backend pnpm run migrate
```

### Accessing Database

```bash
# Using psql
docker-compose -f docker-compose.dev.yml exec postgres psql -U espn_user -d espn_fantasy

# Or
./docker.sh shell postgres
psql -U espn_user -d espn_fantasy
```

### Accessing Redis

```bash
# Using redis-cli
docker-compose -f docker-compose.dev.yml exec redis redis-cli

# Or
./docker.sh shell redis
redis-cli
```

### Viewing Logs

```bash
# All services
./docker.sh logs

# Specific service
./docker.sh logs backend
./docker.sh logs frontend
./docker.sh logs worker

# Follow logs in real-time
docker-compose -f docker-compose.dev.yml logs -f backend
```

### Restarting a Service

```bash
# Restart backend
docker-compose -f docker-compose.dev.yml restart backend

# Restart all services
docker-compose -f docker-compose.dev.yml restart
```

### Rebuilding After Code Changes

In development mode, changes should be picked up automatically via volume mounts. If not:

```bash
# Rebuild specific service
docker-compose -f docker-compose.dev.yml up -d --build backend

# Rebuild everything
./docker.sh rebuild
```

## Environment Variables

### Development (.env not required)

Development uses sensible defaults:

- Database: `postgresql://espn_user:espn_password@postgres:5432/espn_fantasy`
- Redis: `redis://redis:6379`

### Production (.env required)

Create `.env` from `.env.example`:

```env
# PostgreSQL
POSTGRES_DB=espn_fantasy
POSTGRES_USER=espn_user
POSTGRES_PASSWORD=your_secure_password_here

# Application
LOG_LEVEL=info
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Volumes and Data Persistence

Data is persisted in Docker volumes:

- `postgres-data` - Database data
- `redis-data` - Redis data
- `*-node-modules` - Node modules (dev only, for performance)

To backup data:

```bash
# Backup database
docker-compose -f docker-compose.dev.yml exec postgres pg_dump -U espn_user espn_fantasy > backup.sql

# Restore database
docker-compose -f docker-compose.dev.yml exec -T postgres psql -U espn_user espn_fantasy < backup.sql
```

To completely reset:

```bash
./docker.sh clean
# This removes all volumes and data!
```

## Networking

All services run on a custom bridge network `espn-network`. Services can reach each other using their service names:

- Backend → Database: `postgres:5432`
- Backend → Redis: `redis:6379`
- Frontend → Backend: `backend:3001` (internal) or `localhost:3001` (from host)

## Health Checks

Services have health checks configured:

- **postgres**: Checks if database accepts connections
- **redis**: Pings Redis server
- **backend**: Checks `/health` endpoint
- **frontend**: Checks if Next.js responds

View health status:

```bash
./docker.sh status
# or
docker-compose -f docker-compose.dev.yml ps
```

## Troubleshooting

### Port Already in Use

If ports 3000, 3001, 5432, or 6379 are already in use:

```bash
# Find what's using the port
lsof -i :3001

# Kill the process or change Docker port mapping in docker-compose.yml
```

### Container Won't Start

```bash
# Check logs
./docker.sh logs backend

# Check container status
./docker.sh status

# Try rebuilding
./docker.sh rebuild
```

### Database Connection Issues

```bash
# Check if postgres is healthy
docker-compose -f docker-compose.dev.yml ps postgres

# View postgres logs
./docker.sh logs postgres

# Try restarting postgres
docker-compose -f docker-compose.dev.yml restart postgres
```

### Node Modules Issues

If you see module not found errors:

```bash
# Rebuild with fresh install
./docker.sh rebuild
```

### Slow Performance on Mac/Windows

Docker volumes can be slow on Mac/Windows. The dev setup uses named volumes for node_modules to improve performance. If still slow, consider:

1. Allocate more resources to Docker Desktop (CPU/Memory)
2. Use Docker Desktop with VirtioFS (Mac) or WSL2 (Windows)

## Production Deployment

For production deployment:

1. **Use the production docker-compose.yml**:

   ```bash
   docker-compose up -d --build
   ```

2. **Set secure environment variables** in `.env`

3. **Use a reverse proxy** (nginx, Traefik) for SSL/TLS

4. **Set up monitoring** (health checks, logging, metrics)

5. **Configure backups** for database volumes

6. **Use secrets management** for sensitive data

Example nginx config:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Build and Test

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build and test
        run: |
          docker-compose -f docker-compose.dev.yml up -d
          docker-compose -f docker-compose.dev.yml exec -T backend pnpm test
          docker-compose -f docker-compose.dev.yml down
```

## Further Reading

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Multi-stage Builds](https://docs.docker.com/develop/develop-images/multistage-build/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
