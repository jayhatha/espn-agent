---
phase: 92-detect-myteamid
plan: 01
subsystem: extension
tags: [team-detection, draft, dom, practice-draft]
dependency_graph:
  requires: []
  provides: [dynamic-team-id-detection]
  affects: [content.tsx, draft-state]
tech_stack:
  added: []
  patterns: [early-detection-with-fallback, late-retry-timeout]
key_files:
  created: []
  modified:
    - packages/extension/entrypoints/content.tsx
decisions:
  - Use detectedTeamId as let variable so all detection stages (early, fallback, late) can update it
  - Three-phase detection: early (before initializeDraft), fallback (after computeMyGridColumn), late (5s timeout)
metrics:
  duration: ~5 minutes
  completed: 2026-03-16
---

# Quick Task 92: Detect myTeamId from ESPN Draft DOM Summary

One-liner: Dynamic team ID detection via detectMyTeam() with DEFAULT_TEAM_ID fallback, using three detection phases and a 5s late re-detection timeout.

## What Was Done

Wired up the existing `detectMyTeam()` function to actually set `myTeamId` in the draft store across all relevant code paths in `content.tsx`. Previously, `detectMyTeam()` existed and worked but was never used to update the team ID — the code always passed `String(DEFAULT_TEAM_ID)` (hardcoded 13) to `initializeDraft()`.

### Changes Made

**1. Early detection before initializeDraft (Change 1):**
- Added `detectMyTeam()` call before `initializeDraft()` to attempt DOM-based team ID detection
- Result stored in `let detectedTeamId` (not `const`) so later stages can update it
- Falls back to `String(DEFAULT_TEAM_ID)` when detection returns null
- `initializeDraft()` now receives `detectedTeamId` instead of `String(DEFAULT_TEAM_ID)`

**2. computeMyGridColumn uses detectedTeamId (Change 2):**
- Changed `entry.teamId === String(DEFAULT_TEAM_ID)` to `entry.teamId === detectedTeamId`
- Grid column lookup now uses the actual detected team ID, not the hardcoded value

**3. Fallback block calls setMyTeamId (Change 3):**
- The existing pick train fallback detection block at ~line 310 now calls `useDraftStore.getState().setMyTeamId()` when detection succeeds
- Also updates `detectedTeamId` variable so subsequent code uses the latest value

**4. Late re-detection at 5s (Change 4):**
- Added new `setTimeout(..., 5000)` after the existing 3s retry block
- Calls `detectMyTeam()` one more time and updates store if team ID has changed
- Also fills in `myGridColumn` if it was not yet detected
- Handles the case where ESPN's `--own` CSS class appears late in the DOM lifecycle (common in practice drafts)

## Deviations from Plan

None - plan executed exactly as written. The plan described 4 changes (labeled as Changes 1-4 with Change 5 noted as no-change-needed), all implemented as specified.

## Verification

- TypeScript compiles without errors introduced by this change (pre-existing unrelated errors in other files unchanged)
- `DEFAULT_TEAM_ID` appears only in fallback expression (line 249) and deferred re-init (line 923), not in `computeMyGridColumn` or `initializeDraft` call
- `setMyTeamId` called in 3 places: fallback detection block, late 5s timeout, and existing pick train polling interval
- `detectMyTeam()` called at 4 points: early detection, fallback block, 3s retry, and 5s late detection

## Self-Check: PASSED

- Modified file exists: packages/extension/entrypoints/content.tsx - FOUND
- Commit ab29825 exists - FOUND
