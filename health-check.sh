#!/bin/bash

# Health check script for ESPN Fantasy Baseball Assistant
# Verifies all services are running correctly

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

function print_check() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_fail() {
    echo -e "${RED}✗${NC} $1"
}

function print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

echo "========================================="
echo "ESPN Fantasy Baseball Assistant"
echo "Health Check"
echo "========================================="
echo ""

# Check if Docker is running
print_info "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    print_fail "Docker is not running"
    exit 1
fi
print_check "Docker is running"

# Check if containers are running
print_info "Checking containers..."
CONTAINERS=$(docker-compose -f docker-compose.dev.yml ps -q 2>/dev/null | wc -l)
if [ "$CONTAINERS" -eq 0 ]; then
    print_fail "No containers running"
    echo "Run: ./docker.sh dev-up"
    exit 1
fi
print_check "Found $CONTAINERS containers"

# Check each service
print_info "Checking service health..."

# PostgreSQL
if docker-compose -f docker-compose.dev.yml ps postgres | grep -q "Up"; then
    print_check "PostgreSQL: Running"
else
    print_fail "PostgreSQL: Not running"
    exit 1
fi

# Redis
if docker-compose -f docker-compose.dev.yml ps redis | grep -q "Up"; then
    print_check "Redis: Running"
else
    print_fail "Redis: Not running"
    exit 1
fi

# Backend
if docker-compose -f docker-compose.dev.yml ps backend | grep -q "Up"; then
    print_check "Backend: Running"
else
    print_fail "Backend: Not running"
    exit 1
fi

# Frontend
if docker-compose -f docker-compose.dev.yml ps frontend | grep -q "Up"; then
    print_check "Frontend: Running"
else
    print_fail "Frontend: Not running"
    exit 1
fi

# Worker
if docker-compose -f docker-compose.dev.yml ps worker | grep -q "Up"; then
    print_check "Worker: Running"
else
    print_fail "Worker: Not running"
    exit 1
fi

# Check API health endpoint
print_info "Checking API endpoints..."
sleep 2  # Give services a moment to fully start

# Backend health check
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    print_check "Backend health check: OK"
else
    print_fail "Backend health check: Failed"
    echo "Check logs: ./docker.sh logs backend"
    exit 1
fi

# Backend API endpoint
if curl -sf http://localhost:3001/api > /dev/null 2>&1; then
    print_check "Backend API: Responding"
else
    print_fail "Backend API: Not responding"
    echo "Check logs: ./docker.sh logs backend"
    exit 1
fi

# Frontend
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    print_check "Frontend: Accessible"
else
    print_fail "Frontend: Not accessible"
    echo "Check logs: ./docker.sh logs frontend"
    exit 1
fi

# Check database connectivity
print_info "Checking database..."
if docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U espn_user -d espn_fantasy > /dev/null 2>&1; then
    print_check "PostgreSQL: Accepting connections"
else
    print_fail "PostgreSQL: Not accepting connections"
    exit 1
fi

# Check Redis connectivity
print_info "Checking cache..."
if docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    print_check "Redis: Responding"
else
    print_fail "Redis: Not responding"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}All checks passed!${NC}"
echo "========================================="
echo ""
echo "Services accessible at:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:3001"
echo "  API Docs:  http://localhost:3001/api"
echo ""
echo "Useful commands:"
echo "  ./docker.sh logs        - View logs"
echo "  ./docker.sh status      - Check status"
echo "  ./docker.sh shell       - Open shell"
echo ""
