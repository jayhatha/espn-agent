---
status: resolved
trigger: Getting 401s even with single-user mode set
created: 2026-05-06
updated: 2026-05-06
---

## Symptoms

- Expected: all API requests pass through as MOCK_USER when SINGLE_USER_MODE=true
- Actual: 401 Unauthorized on all protected endpoints
- Timeline: never worked (first test after Phase 94)
- Reproduction: any API call via Docker Compose dev stack

## Current Focus

hypothesis: SINGLE_USER_MODE=true in wrong env file
next_action: resolved
reasoning_checkpoint: auth middleware checks process.env.SINGLE_USER_MODE === "true" correctly; issue is env file location mismatch

## Evidence

- timestamp: 2026-05-06
  finding: packages/backend/.env line 6 has SINGLE_USER_MODE=true
  source: grep output
- timestamp: 2026-05-06
  finding: docker-compose.dev.yml loads env_file ./.env (root), not packages/backend/.env
  source: docker-compose.dev.yml env_file block
- timestamp: 2026-05-06
  finding: root .env does NOT contain SINGLE_USER_MODE
  source: grep "SINGLE_USER" .env → "NOT IN ROOT .env"

## Eliminated

- hypothesis: auth middleware code is wrong
  evidence: code correctly checks process.env.SINGLE_USER_MODE === "true"
- hypothesis: .env parse error (missing newline)
  evidence: grep -n shows line 6 is clean; cat -A confirmed value is exactly "true"

## Resolution

root_cause: SINGLE_USER_MODE=true set in packages/backend/.env but docker-compose.dev.yml injects the root ./.env; root .env lacked the variable, so process.env.SINGLE_USER_MODE was undefined in the Docker container
fix: Added SINGLE_USER_MODE=true to root .env; updated packages/backend/package.json dev script to use --env-file .env for non-Docker local dev
verification: auth middleware now receives SINGLE_USER_MODE=true in both Docker and local dev paths
files_changed:

- .env (root) — added SINGLE_USER_MODE=true
- packages/backend/package.json — dev script: tsx watch --env-file .env src/index.ts
