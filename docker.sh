#!/bin/bash

# Docker management script for ESPN Fantasy Baseball Assistant

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

function print_error() {
    echo -e "${RED}✗${NC} $1"
}

function print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

function check_requirements() {
    print_info "Checking requirements..."

    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    print_success "All requirements met"
}

function setup_dev() {
    print_info "Setting up development environment..."

    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env file from .env.example"
        print_info "You may want to edit .env with your own values"
    fi

    print_success "Development environment setup complete"
}

function dev_up() {
    print_info "Starting development environment..."
    docker-compose -f docker-compose.dev.yml up -d
    print_success "Development environment started"
    print_info "Backend API: http://localhost:3001"
    print_info "Frontend: http://localhost:3000"
    print_info "PostgreSQL: localhost:5432"
    print_info "Redis: localhost:6379"
    echo ""
    print_info "Run './docker.sh logs' to view logs"
    print_info "Run './docker.sh dev-down' to stop"
}

function dev_down() {
    print_info "Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    print_success "Development environment stopped"
}

function prod_up() {
    print_info "Starting production environment..."

    if [ ! -f .env ]; then
        print_error ".env file not found. Please create it from .env.example"
        exit 1
    fi

    docker-compose up -d --build
    print_success "Production environment started"
    print_info "Backend API: http://localhost:3001"
    print_info "Frontend: http://localhost:3000"
}

function prod_down() {
    print_info "Stopping production environment..."
    docker-compose down
    print_success "Production environment stopped"
}

function migrate() {
    print_info "Running database migrations..."
    docker-compose -f docker-compose.dev.yml exec backend pnpm run migrate
    print_success "Migrations complete"
}

function logs() {
    SERVICE=${1:-}
    if [ -z "$SERVICE" ]; then
        docker-compose -f docker-compose.dev.yml logs -f
    else
        docker-compose -f docker-compose.dev.yml logs -f "$SERVICE"
    fi
}

function shell() {
    SERVICE=${1:-backend}
    print_info "Opening shell in $SERVICE container..."
    docker-compose -f docker-compose.dev.yml exec "$SERVICE" sh
}

function clean() {
    print_info "Cleaning up Docker resources..."
    read -p "This will remove all containers, volumes, and images. Continue? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose -f docker-compose.dev.yml down -v
        docker-compose down -v
        print_success "Cleanup complete"
    else
        print_info "Cleanup cancelled"
    fi
}

function rebuild() {
    print_info "Rebuilding containers..."
    docker-compose -f docker-compose.dev.yml down
    docker-compose -f docker-compose.dev.yml build --no-cache
    docker-compose -f docker-compose.dev.yml up -d
    print_success "Rebuild complete"
}

function status() {
    print_info "Container status:"
    docker-compose -f docker-compose.dev.yml ps
}

function help() {
    cat << EOF
ESPN Fantasy Baseball Assistant - Docker Management Script

Usage: ./docker.sh [command]

Commands:
  setup-dev     Setup development environment (create .env)
  dev-up        Start development environment
  dev-down      Stop development environment

  prod-up       Start production environment
  prod-down     Stop production environment

  migrate       Run database migrations
  logs [svc]    View logs (optionally for specific service)
  shell [svc]   Open shell in container (default: backend)
  status        Show container status

  rebuild       Rebuild containers from scratch
  clean         Remove all containers, volumes, and images

  help          Show this help message

Examples:
  ./docker.sh dev-up              # Start dev environment
  ./docker.sh logs backend        # View backend logs
  ./docker.sh shell postgres      # Open postgres shell
  ./docker.sh migrate             # Run migrations

Services: backend, frontend, worker, postgres, redis
EOF
}

# Main script
case "$1" in
    setup-dev)
        check_requirements
        setup_dev
        ;;
    dev-up)
        check_requirements
        setup_dev
        dev_up
        ;;
    dev-down)
        dev_down
        ;;
    prod-up)
        check_requirements
        prod_up
        ;;
    prod-down)
        prod_down
        ;;
    migrate)
        migrate
        ;;
    logs)
        logs "$2"
        ;;
    shell)
        shell "$2"
        ;;
    status)
        status
        ;;
    rebuild)
        rebuild
        ;;
    clean)
        clean
        ;;
    help|--help|-h)
        help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        help
        exit 1
        ;;
esac
