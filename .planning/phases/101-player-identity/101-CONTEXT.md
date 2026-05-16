# Phase 101: Player Identity Consolidation — Context

**Gathered:** 2026-05-15
**Status:** Ready
**Milestone:** v10.0 Architecture Improvements

<domain>
## Phase Boundary

Move all identity resolution logic — threshold constant, `player_identity_map` cache lookup, and cache write — from `projections-ingest.ts` into `PlayerIdentityResolutionAgent`, exposing a single `resolve()` method.

## Evidence

- `FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.95` defined at line 83 in `projections-ingest.ts` (not in `player-identity.ts` where it belongs)
- `player_identity_map` cache lookup at lines 123-126 of `projections-ingest.ts` — inline DB query bypassing `PlayerIdentityResolutionAgent`
- `identityAgent.findBestMatch()` called at line 139 of `projections-ingest.ts` after manual cache check
- `player_identity_map` write at line 162 of `projections-ingest.ts` — duplicates what `PlayerIdentityResolutionAgent` already does
- `PlayerIdentityResolutionAgent.findBestMatch()` at line 119 has `fuzzyNameMatch()` exported standalone at line 214

## Result After Fix

`projections-ingest.ts` calls:

```ts
const match = await identityAgent.resolve(
  fangraphsKey,
  playerName,
  team,
  positions,
);
```

`PlayerIdentityResolutionAgent.resolve()` internally handles:

1. Cache lookup in `player_identity_map`
2. If miss: `findBestMatch()` with Levenshtein
3. Threshold check against `FUZZY_MATCH_CONFIDENCE_THRESHOLD`
4. Cache write on match
   </domain>

<decisions>
## Implementation Strategy

1. Move `FUZZY_MATCH_CONFIDENCE_THRESHOLD = 0.95` to `player-identity.ts`
2. Add `resolve(fangraphsKey, playerName, team?, positions?)` method to `PlayerIdentityResolutionAgent`
   - Wraps: cache-check → fuzzy-match → threshold → cache-write
   - Returns: `{ playerId, confidence, method }` or `null`
3. Remove inline cache-check block and DB write from `projections-ingest.ts` (lines 123-162)
4. Replace `identityAgent.findBestMatch()` call with `identityAgent.resolve()`

## Files to Modify

- `packages/backend/src/agents/player-identity.ts` — add `resolve()`, accept `FUZZY_MATCH_CONFIDENCE_THRESHOLD`
- `packages/backend/src/agents/projections-ingest.ts` — remove duplicate cache/threshold/write logic
  </decisions>
