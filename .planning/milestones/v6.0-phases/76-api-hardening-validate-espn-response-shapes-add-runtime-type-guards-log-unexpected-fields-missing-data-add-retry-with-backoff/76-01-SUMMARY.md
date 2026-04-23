---
phase: 76-api-hardening
plan: 01
subsystem: backend/utils
tags: [zod, validation, api-hardening, espn, type-guards]
dependency_graph:
  requires: []
  provides: [ESPNRosterEntrySchema, assertEspnCriticalShape, logUnexpectedFields]
  affects: [packages/backend/src/adapters/espn.ts]
tech_stack:
  added: []
  patterns: [zod-schema-strengthening, tdd-red-green, graceful-degradation]
key_files:
  created:
    - packages/backend/src/utils/__tests__/espn-schemas.test.ts
  modified:
    - packages/backend/src/utils/espn-schemas.ts
decisions:
  - "ESPNRosterEntrySchema uses .passthrough() at entry level to allow ESPN to add fields without breaking validation"
  - "logUnexpectedFields only logs at INFO — never throws — preserving graceful degradation pattern"
  - "assertEspnCriticalShape is a TypeScript assertion function (asserts data is Record<string, unknown>) to narrow types after the check"
  - "ESPNScoringItemSchema kept as module-private const (not exported) — only ESPNRosterEntrySchema is exported per plan spec"
metrics:
  duration: "2 min"
  completed_date: "2026-03-26"
  tasks_completed: 1
  files_modified: 2
requirements_satisfied: [HARD-01, HARD-02, HARD-03]
---

# Phase 76 Plan 01: ESPN Schema Strengthening Summary

Strengthened ESPN Zod schemas to validate nested fields normalizeLeagueData relies on, added assertEspnCriticalShape for hard-fail on structural breakage, and added logUnexpectedFields for schema drift detection — all backed by 18 unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for schema strengthening | f6fd359 | packages/backend/src/utils/__tests__/espn-schemas.test.ts |
| 1 (GREEN) | Strengthen schemas + new functions | a24ffec | packages/backend/src/utils/espn-schemas.ts |

## What Was Built

### ESPNRosterEntrySchema
Replaces `z.unknown()` in `teams.roster.entries` with a typed schema validating:
- `playerId: z.number()` (required)
- `lineupSlotId: z.number().optional()`
- `playerPoolEntry.player.{fullName, proTeamId, eligibleSlots, stats}` (all optional, passthrough)

### ESPNScoringItemSchema
Replaces `z.unknown()` in `settings.scoringSettings.scoringItems`:
- `statId: z.number()` (required)
- `isReverseItem: z.boolean().optional()`

### assertEspnCriticalShape
TypeScript assertion function that throws when ESPN returns a non-object or an object missing `teams` array. Logs at error level before throwing. Use this before normalization to fail fast on structurally broken responses.

### logUnexpectedFields
Logs at INFO level when ESPN response contains keys not in the `knownFields` allowlist. Never throws — preserves graceful degradation. Use this to detect ESPN API schema drift in production without causing outages.

## Test Coverage

18 tests across 4 describe blocks:
- `ESPNLeagueResponseSchema` — accepts valid data, rejects missing playerId, rejects missing statId
- `ESPNRosterEntrySchema` — accepts valid entry, rejects missing playerId, accepts optional lineupSlotId absent
- `assertEspnCriticalShape` — throws on null, throws on non-object, throws on missing teams, passes on empty teams array, calls logger.error
- `logUnexpectedFields` — calls logger.info with unexpected keys, silent when all known, silent on empty object
- `validateEspnResponse` — returns raw data on failure (graceful degradation), warns on mismatch, returns parsed on success

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functions are fully implemented and tested.

## Self-Check: PASSED
