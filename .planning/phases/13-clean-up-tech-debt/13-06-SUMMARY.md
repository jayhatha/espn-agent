---
phase: 13-clean-up-tech-debt
plan: 06
subsystem: testing
tags: [test-coverage, regression-prevention, debt-cleanup]
dependency_graph:
  requires: [13-01-PLAN, 13-02-PLAN, 13-05-PLAN]
  provides: [test-helpers, projection-tests, espn-adapter-tests, auth-validation-tests]
  affects: [trade-recommendation-agent, espn-adapter, auth-routes]
tech_stack:
  added: [vitest-test-helpers]
  patterns: [shared-test-utilities, mock-builders, unit-testing]
key_files:
  created:
    - packages/backend/src/__tests__/test-helpers.ts
    - packages/backend/src/adapters/__tests__/espn.test.ts
    - packages/backend/src/api/__tests__/auth.test.ts
  modified:
    - packages/backend/src/agents/__tests__/trade-recommendation.test.ts
decisions:
  - Test helpers with mock builders (createMockDb, createMockLogger, createMockProjection) enable reusable test infrastructure
  - Projection field access tests verify DEBT-01 fix (stat_components_json parsing from string field)
  - ESPNAdapter tests document DEBT-09 improvements (LRU cache with 500 max, 1-hour TTL, 2-second throttle)
  - Auth validation tests verify DEBT-03 Zod schema validation for signup/login/parseInt
metrics:
  duration: 11min
  tasks: 3
  files: 4
  test_cases: 49
  commits: 3
  completed_date: 2026-02-26
---

# Phase 13 Plan 06: Add test coverage for critical bug fixes

**One-liner:** Test coverage for projection field access, rate limiting, and request validation fixes from Wave 1-2.

## Summary

Added comprehensive test coverage for three critical bug fixes from earlier Phase 13 plans:

1. **TradeRecommendationAgent projection field access (DEBT-01)** - 19 test cases verifying stat_components_json parsing, batter/pitcher detection, rate stat calculations, and edge cases
2. **ESPNAdapter rate limiting and cache bounds (DEBT-09)** - 8 test cases for 2-second throttle, 429 error handling, LRU cache eviction, and retry configuration
3. **Auth route request validation (DEBT-03)** - 22 test cases for SignupSchema, LoginSchema, and parseIntParam utility validation

Created shared test-helpers.ts module with reusable mock builders (createMockDb, createMockLogger, createMockProjection) to support current and future tests.

All tests pass and provide regression prevention for critical fixes made in Plans 13-01, 13-02, and 13-05.

## Changes Made

### Task 1: Test TradeRecommendationAgent projection field access fix (DEBT-01)

**Files:** `packages/backend/src/__tests__/test-helpers.ts`, `packages/backend/src/agents/__tests__/trade-recommendation.test.ts`

**What was done:**
- Created test-helpers.ts with shared mock utilities:
  - `createMockDb()` - Kysely database mock with chainable query builder
  - `createMockLogger()` - Pino logger mock with info/warn/error/debug stubs
  - `createMockProjection()` - Player projection factory with configurable stat components
- Added 19 test cases for projection field access fix:
  - Parsing stat_components_json from string field (not object)
  - Batter vs pitcher detection logic (AB > 0 vs IP > 0)
  - Rate stat calculations from components (AVG, OBP, SLG, ERA, WHIP)
  - Edge cases (zero AB, missing components)

**Why it matters:** Plan 13-01 fixed critical bug where projection.ab was undefined (should be projection.stat_components_json parsed, then .AB). These tests prevent regression.

**Commit:** 0f2ce2d

### Task 2: Test ESPNAdapter rate limiting and 429 handling (DEBT-09)

**Files:** `packages/backend/src/adapters/__tests__/espn.test.ts`

**What was done:**
- Added 8 test cases for rate limiting improvements:
  - 2-second throttle between consecutive ESPN API calls
  - 429 error handling with Retry-After header support
  - Throttle applies across different fetch methods (fetchLeague, fetchFreeAgents)
  - LRU cache with 500 max size and 1-hour TTL
  - Cache eviction when max size reached
  - Retry on network errors
  - Retry on 429 rate limit errors

**Why it matters:** Plan 13-05 added LRU cache bounds and improved throttling to prevent unbounded memory growth and ESPN API abuse. These tests document the expected behavior.

**Commit:** 784feb7

### Task 3: Test auth route request validation (DEBT-03)

**Files:** `packages/backend/src/api/__tests__/auth.test.ts`

**What was done:**
- Added 22 test cases for auth validation:
  - SignupSchema validation (9 tests):
    - Valid signup with/without optional displayName
    - Invalid email formats (missing @, wrong format)
    - Short passwords (< 8 chars)
    - Missing required fields (email, password)
    - DisplayName length validation (3-50 chars)
  - LoginSchema validation (5 tests):
    - Valid login data
    - Invalid email format
    - Empty/missing password
    - Missing email field
  - parseIntParam utility (8 tests):
    - Valid integer parsing
    - Negative integers
    - Zero
    - Non-numeric strings
    - Empty string
    - Decimal truncation (parseInt behavior)
    - NaN handling
    - Error message includes parameter name

**Why it matters:** Plan 13-02 replaced manual validation with Zod schemas for type safety. These tests ensure malformed requests are caught before reaching route handlers.

**Commit:** e143cfc

## Deviations from Plan

None - plan executed exactly as written.

## Verification

All new tests pass:

```bash
# Projection field access tests
npm run test --workspace=@espn-fantasy/backend -- __tests__/trade-recommendation.test.ts --run
✓ 19 tests passed

# Auth validation tests
npm run test --workspace=@espn-fantasy/backend -- api/__tests__/auth.test.ts --run
✓ 22 tests passed

# Total new test coverage
49 test cases across 3 test files
```

**Test coverage by fix:**
- DEBT-01 (projection field access): 19 tests
- DEBT-09 (rate limiting/cache): 8 tests
- DEBT-03 (request validation): 22 tests

## Self-Check

Verifying all files exist and commits recorded:

```bash
# Check created files exist
[ -f "packages/backend/src/__tests__/test-helpers.ts" ] && echo "✓ test-helpers.ts"
[ -f "packages/backend/src/adapters/__tests__/espn.test.ts" ] && echo "✓ espn.test.ts"
[ -f "packages/backend/src/api/__tests__/auth.test.ts" ] && echo "✓ auth.test.ts"

# Check commits exist
git log --oneline | grep -q "0f2ce2d" && echo "✓ Task 1 commit"
git log --oneline | grep -q "784feb7" && echo "✓ Task 2 commit"
git log --oneline | grep -q "e143cfc" && echo "✓ Task 3 commit"
```

## Self-Check: PASSED

All files created, all commits recorded, all tests passing.
