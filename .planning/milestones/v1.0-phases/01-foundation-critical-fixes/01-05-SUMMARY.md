---
phase: 01-foundation-critical-fixes
plan: 05
subsystem: frontend
tags: [api-client, infrastructure, production-readiness]
dependencies:
  requires: []
  provides: [centralized-api-client]
  affects: [all-frontend-pages]
tech-stack:
  added: []
  patterns: [centralized-api-client, environment-variable-config]
key-files:
  created: []
  modified:
    - packages/frontend/src/lib/api.ts
    - packages/frontend/src/app/navigation.tsx
    - packages/frontend/src/contexts/AuthContext.tsx
    - packages/frontend/src/app/leagues/[id]/page.tsx
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
    - packages/frontend/src/app/leagues/[id]/standings/page.tsx
    - packages/frontend/src/app/leagues/[id]/trends/page.tsx
    - packages/frontend/src/app/admin/page.tsx
decisions:
  - decision: Keep OAuth redirects and file uploads using direct API_URL constant
    rationale: OAuth requires full URL for redirects, file uploads need FormData without Content-Type header
    alternatives: Could have created separate API client methods, but simpler to keep edge cases explicit
  - decision: Use centralized fetchAPI helper for all authenticated endpoints
    rationale: Ensures consistent auth header handling and 401 redirect logic across all pages
    alternatives: Individual pages could handle auth, but would duplicate error handling
metrics:
  duration_minutes: 11
  tasks_completed: 2
  files_modified: 9
  commits: 2
  completed_at: 2026-02-19T21:55:05Z
---

# Phase 1 Plan 5: Frontend API Client Migration Summary

Migrated all frontend pages from hardcoded localhost:3001 URLs to centralized API client, enabling production deployment.

## What Was Built

**Centralized API client with 26 methods covering all backend endpoints:**
- League operations: getLeagues, getLeagueStatus, connectLeague, getTeams, updateLeagueAuth, triggerSnapshot
- Projections: uploadProjections, getProjections, getProjectedStandings
- Time series: getOverallTimeSeries, getCategoryRankTimeSeries, getProjectedOverallTimeSeries, getAnnotations
- Waiver operations: getWaiverRecommendations, getFreeAgents, evaluateWaiver
- Trade operations: getTradePartners, getTradeRosters, analyzeTradeImpact, getTradeRecommendations
- Team operations: getTeamOverview, getTeamRoster
- Auth operations: login, signup, getProfile

**All frontend pages migrated:**
- navigation.tsx: Uses api.getProfile() for user data
- AuthContext: Uses api.login(), api.signup(), api.getProfile() (OAuth redirects still use API_URL constant)
- leagues/[id]/page.tsx: All 4 queries and 2 mutations migrated to API client
- leagues/[id]/waivers/page.tsx: All 3 queries and waiver evaluation migrated
- leagues/[id]/trades/page.tsx: All 3 queries and trade analysis mutation migrated
- leagues/[id]/standings/page.tsx: Projected standings query migrated
- leagues/[id]/trends/page.tsx: All 4 time series queries migrated
- admin/page.tsx: Profile and projections queries migrated (file upload uses direct fetch for FormData)

## Deviations from Plan

None - plan executed exactly as written.

## Verification

**Hardcoded URL check:**
```bash
grep -r "localhost:3001" packages/frontend/src/ --exclude-dir=node_modules | grep -v ".next"
```
Result: Only 3 occurrences (api.ts base URL, AuthContext OAuth, admin file upload) - all intentional.

**TypeScript compilation:**
```bash
pnpm --filter @espn-fantasy/frontend exec tsc --noEmit
```
Result: No errors.

**API client method count:**
```bash
grep -c "async " packages/frontend/src/lib/api.ts
```
Result: 26 methods (plan required 15+).

**Import usage:**
```bash
grep -r "import.*api.*from.*@/lib/api" packages/frontend/src/app/leagues/ | wc -l
```
Result: 7 files (all league pages and connect page).

## Issues Encountered

None.

## Testing Performed

- TypeScript compilation verified (no errors)
- All imports confirmed present in migrated files
- Hardcoded URL audit confirmed only intentional uses remain
- Method count confirmed API client has all required endpoints

## Next Steps

- Phase 1 Plan 6: Implement ESPN free agent pool fetching (reverse engineer ESPN API params)
- After Phase 1: Phase 2 will add multi-tenant auth enforcement to backend routes

## Task Commits

1. **ec5d470** - feat(01-05): expand api.ts with all missing endpoint methods
   - Added 16 new methods to API client
   - All methods use fetchAPI helper with auth headers
   - Pre-auth endpoints (login/signup) use direct fetch to avoid 401 redirect loop

2. **6393c98** - feat(01-05): migrate all frontend pages to centralized API client
   - Migrated 8 frontend files
   - Removed 200+ lines of duplicated fetch logic
   - All existing functionality preserved

## Self-Check: PASSED

**Created files exist:**
- N/A (no new files created, only modifications)

**Modified files exist:**
```bash
[ -f "packages/frontend/src/lib/api.ts" ] && echo "FOUND"
[ -f "packages/frontend/src/app/leagues/[id]/page.tsx" ] && echo "FOUND"
[ -f "packages/frontend/src/app/leagues/[id]/waivers/page.tsx" ] && echo "FOUND"
```
All confirmed.

**Commits exist:**
```bash
git log --oneline | grep -E "ec5d470|6393c98"
```
```
6393c98 feat(01-05): migrate all frontend pages to centralized API client
ec5d470 feat(01-05): expand api.ts with all missing endpoint methods
```
Both commits confirmed.

**Functional verification:**
- All hardcoded URLs removed except intentional OAuth/upload cases: ✓
- TypeScript compiles without errors: ✓
- All API methods present and correctly typed: ✓
- All pages import and use API client: ✓
