---
phase: quick-16
plan: 01
subsystem: security
tags: [security, encryption, credentials, extension-security]
dependency_graph:
  requires: [encryption utilities, ESPN adapter, extension background worker]
  provides: [encrypted-only credential storage, validated message handlers]
  affects: [all API routes, extension message handlers, database schema]
tech_stack:
  added: [sender origin validation, encrypted credential enforcement]
  patterns: [encrypted-at-rest credentials, domain whitelist validation]
key_files:
  created:
    - packages/backend/src/db/migrations/015_remove_plaintext_espn_cookies.sql
  modified:
    - packages/backend/src/api/leagues.ts
    - packages/backend/src/api/projections.ts
    - packages/backend/src/api/recommendations.ts
    - packages/backend/src/api/admin.ts
    - packages/backend/src/agents/player-pool-sync.ts
    - packages/extension/entrypoints/background.ts
decisions:
  - decision: "Require ENCRYPTION_KEY at startup (fail if missing)"
    rationale: "Prevents accidental plaintext credential storage in production"
    alternatives: ["Allow plaintext fallback in dev mode"]
    trade_offs: "Stricter but prevents security regression"
  - decision: "Return 500 on decryption errors (no silent fallback)"
    rationale: "Forces operators to fix encryption issues instead of silently degrading to plaintext"
    alternatives: ["Log warning and continue with plaintext"]
    trade_offs: "May cause temporary outages but ensures security compliance"
  - decision: "Validate sender.url AND sender.id in extension message handler"
    rationale: "Prevents both malicious webpage attacks and extension spoofing"
    alternatives: ["Only validate sender.url"]
    trade_offs: "More robust security with minimal performance impact"
metrics:
  duration: 4
  tasks_completed: 2
  files_modified: 7
  completed_date: "2026-02-27"
---

# Quick Task 16: Fix Security Issues - Encrypt API Tokens & Validate Sender

**One-liner:** Removed all plaintext ESPN credential storage and added sender origin validation to extension message handlers, closing critical security vulnerabilities.

## What Was Done

### Task 1: Remove Plaintext ESPN Credential Storage ✅

**Created migration 015:**
- Drops plaintext columns `espn_swid` and `espn_s2` from league table
- Adds schema comments documenting encrypted-only storage format

**Updated all credential storage points:**
- `leagues.ts` POST `/api/leagues/connect` - writes only to encrypted columns
- `leagues.ts` PATCH `/api/leagues/:leagueId/auth` - writes only to encrypted columns
- Both endpoints require ENCRYPTION_KEY (return 500 if missing)

**Updated all credential read points:**
- `leagues.ts` POST `/api/leagues/:leagueId/snapshot` - reads only from encrypted columns
- `projections.ts` triggerDegradedLeagueResnapshots - reads only from encrypted columns
- `recommendations.ts` GET `/api/leagues/:leagueId/free-agents` - reads only from encrypted columns
- `admin.ts` backfill and debug endpoints - read only from encrypted columns
- `player-pool-sync.ts` sync worker - reads only from encrypted columns

**Removed all plaintext fallback logic:**
- No `else if (league.espn_swid && league.espn_s2)` branches
- Decryption failures return 500 errors (no silent fallback)
- ENCRYPTION_KEY required for all credential operations

### Task 2: Validate Extension Message Sender Origin ✅

**Added sender validation to chrome.runtime.onMessage handler:**
- Validates sender.url against ESPN domain whitelist (`fantasy.espn.com`, `lm-api-reads.fantasy.espn.com`)
- Validates sender.id matches chrome.runtime.id to prevent extension spoofing
- Rejects unauthorized messages with error response and console warning
- Allows extension internal pages when sender.url is undefined

**Security improvements:**
- Prevents malicious webpages from sending fake messages to extension
- Prevents other extensions from impersonating this extension
- All rejections logged to console for monitoring

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Additional plaintext credential references found**
- **Found during:** Task 1 verification
- **Issue:** Grep found plaintext column references in projections.ts, recommendations.ts, admin.ts, and player-pool-sync.ts that would break after migration 015
- **Fix:** Updated all 4 files to use encrypted-only credentials with same pattern as leagues.ts (no plaintext fallback, require ENCRYPTION_KEY, return 500 on errors)
- **Files modified:** projections.ts, recommendations.ts, admin.ts, player-pool-sync.ts
- **Commit:** 42fdb77

**Why this was necessary:** Migration 015 drops the plaintext columns, so these references would cause runtime errors. This is a blocking issue (Rule 3) - cannot complete the task without fixing them.

## Commits

| Hash    | Type | Message                                                      |
|---------|------|--------------------------------------------------------------|
| 7d49951 | feat | remove plaintext ESPN credential storage                     |
| 3ff95bd | feat | validate extension message sender origin                     |
| 42fdb77 | fix  | remove plaintext credential references in remaining files    |

## Files Changed

**Created (1):**
- `packages/backend/src/db/migrations/015_remove_plaintext_espn_cookies.sql` - Migration to drop plaintext columns

**Modified (6):**
- `packages/backend/src/api/leagues.ts` - Encrypted-only credential storage, no plaintext writes/reads
- `packages/backend/src/api/projections.ts` - Encrypted-only in degraded league re-snapshots
- `packages/backend/src/api/recommendations.ts` - Encrypted-only in free agents endpoint
- `packages/backend/src/api/admin.ts` - Encrypted-only in backfill/debug endpoints
- `packages/backend/src/agents/player-pool-sync.ts` - Encrypted-only in player pool sync worker
- `packages/extension/entrypoints/background.ts` - Sender origin validation in message handler

## Testing Notes

**Migration not yet run:**
- Migration 015 exists but was not executed due to database connection auth error
- Migration will be run when database credentials are configured
- All code changes are complete and TypeScript compiles successfully

**Security validations passed:**
- No plaintext column writes: `grep -E "espn_(swid|s2):\s" leagues.ts` → zero matches ✅
- No plaintext fallback reads: `grep "league.espn_swid[^_]" backend/src/**/*.ts` → zero matches ✅
- Sender validation present: `grep "allowedDomains" background.ts` → found ✅
- Extension ID validation present: `grep "sender.id.*chrome.runtime.id" background.ts` → found ✅
- TypeScript compiles: `npm run build` → success ✅
- Extension builds: `npm run build` (extension package) → success ✅

## Impact

**Security improvements:**
1. **No plaintext credentials in database** - migration 015 drops plaintext columns completely
2. **No plaintext credentials in code** - all references use encrypted columns only
3. **No plaintext credentials in logs** - decrypted values never logged
4. **Extension message handlers protected** - sender validation prevents malicious webpage attacks
5. **Extension spoofing prevented** - sender.id validation prevents other extensions from impersonating

**Operational requirements:**
- ENCRYPTION_KEY environment variable now **required** (backend returns 500 if missing)
- Operators must fix encryption issues (no silent fallback to plaintext)
- Extension only accepts messages from ESPN domains

**Backward compatibility:**
- Migration 015 is safe to run (drops columns that are no longer referenced)
- Code changes are backward compatible until migration runs (encrypted columns take precedence)
- After migration, all credential storage requires ENCRYPTION_KEY

## Self-Check: PASSED

**Migration file exists:**
```bash
[ -f "packages/backend/src/db/migrations/015_remove_plaintext_espn_cookies.sql" ] && echo "FOUND"
```
✅ FOUND: packages/backend/src/db/migrations/015_remove_plaintext_espn_cookies.sql

**Commits exist:**
```bash
git log --oneline --all | grep -E "(7d49951|3ff95bd|42fdb77)"
```
✅ FOUND: 7d49951 feat(quick-16): remove plaintext ESPN credential storage
✅ FOUND: 3ff95bd feat(quick-16): validate extension message sender origin
✅ FOUND: 42fdb77 fix(quick-16): remove plaintext credential references in remaining files

**Code changes verified:**
✅ All files compile without errors
✅ No plaintext column references in backend code
✅ Sender validation present in extension background worker
