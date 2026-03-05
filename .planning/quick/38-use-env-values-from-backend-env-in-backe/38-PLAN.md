---
phase: quick-38
title: Use .env values from /backend/.env in backend docker container
type: quick
---

# Quick Task 38: Load backend .env in Docker

## Problem
The backend Docker container (via `docker-compose.dev.yml`) has hardcoded environment variables but doesn't load `packages/backend/.env`. This means secrets like `OPENAI_API_KEY` aren't available inside the container.

## Solution
Add `env_file: ./packages/backend/.env` to both the `backend` and `worker` services in `docker-compose.dev.yml`. Docker Compose's `env_file` directive loads variables directly into the container environment, which `process.env` reads natively — no dotenv library needed.

## Tasks

### Task 1: Add env_file to backend service in docker-compose.dev.yml
- File: `docker-compose.dev.yml`
- Add `env_file: ./packages/backend/.env` to the backend service
- Add same to the worker service (shares same env needs)

### Task 2: Add .env to .dockerignore if not already present
- Ensure `.env` files aren't baked into images (they should only be mounted at runtime via env_file)

## Verification
- `docker compose -f docker-compose.dev.yml config` shows OPENAI_API_KEY in backend environment
