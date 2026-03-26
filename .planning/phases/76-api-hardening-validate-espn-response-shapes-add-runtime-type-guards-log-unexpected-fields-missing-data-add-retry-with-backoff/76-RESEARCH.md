# Phase 76: API Hardening — Research

**Researched:** 2026-03-26
**Domain:** ESPN API validation, Zod runtime schemas, retry/circuit-breaker, schema drift detection
**Confidence:** HIGH

## Summary

Phase 76 hardens the ESPN adapter — the single file responsible for all ESPN API communication. Critically, most of the infrastructure this phase targets **already exists** but is incomplete or inconsistently applied. Zod schemas in `espn-schemas.ts` exist for 3 of the 5+ fetch methods. `retry.ts` already implements exponential backoff with circuit breaker using `axios-retry`. The job for this phase is to **close the gaps**, not build from scratch.

The core problem is that `validateEspnResponse()` in `espn-schemas.ts` degrades silently — it logs a warning but returns the raw unvalidated data on schema failure. This means schema mismatches are logged but the normalization code still receives potentially malformed data and proceeds with unsafe `as any` casts. Additionally, `fetchGlobalDraftData()` and `fetchHistoricalWeek` (partially) skip Zod validation entirely.

The retry infrastructure is sound but `fetchHistoricalWeek` has a manual try/catch for 429 that partially duplicates `axios-retry`'s built-in 429 handling. The circuit breaker pattern is correctly implemented.

**Primary recommendation:** Strengthen existing Zod schemas to cover the roster/stat fields that normalization logic relies on, add a `strictValidateEspnResponse()` variant that throws on critical fields missing (vs warn-and-continue), and wire `fetchGlobalDraftData` into the validation framework.

## Standard Stack

### Core (already installed — no new dependencies needed)

| Library | Version (installed) | Version (current) | Purpose |
|---------|--------------------|--------------------|---------|
| zod | ^3.22.4 | 3.24.x | Runtime schema validation |
| axios | ^1.6.5 | 1.8.x | HTTP client |
| axios-retry | ^4.5.0 | 4.5.0 | Retry with exponential backoff |
| pino | ^8.17.2 | 8.21.x | Structured logging |

**No new packages required.** Zod 3.x is fully sufficient. The `z.object().passthrough()` pattern used in existing schemas is the correct approach for forward-compatibility with ESPN API additions.

**Version note:** Zod 4 was released in early 2025 but the project is on Zod 3 — do not upgrade. Zod 4 has breaking API changes and migration is out of scope.

### Supporting Patterns Already In Use

| Pattern | Location | Status |
|---------|----------|--------|
| `validateEspnResponse()` helper | `utils/espn-schemas.ts` | Exists, logs warning on mismatch, returns raw data |
| `createRetryableAxios()` | `utils/retry.ts` | Fully implemented, used in ESPNAdapter constructor |
| `computeSchemaFingerprint()` | `adapters/espn.ts` | Implemented, called after fetchLeague and fetchHistoricalWeek |
| Zod schemas (league, freeAgents, transactions) | `utils/espn-schemas.ts` | Exist but shallow — passthrough on most nested fields |

## Architecture Patterns

### Current Validation Flow (gaps identified)

```
fetchLeague()           → validateEspnResponse(ESPNLeagueResponseSchema)  ✓
fetchHistoricalWeek()   → validateEspnResponse(ESPNLeagueResponseSchema)  ✓
fetchFreeAgents()       → validateEspnResponse(ESPNFreeAgentsResponseSchema)  ✓
fetchTransactions()     → validateEspnResponse(ESPNTransactionsResponseSchema)  ✓
fetchPreDraftAuctionValues() → validateEspnResponse(ESPNFreeAgentsResponseSchema)  ✓
fetchGlobalDraftData()  → NO validation — raw `data as any` cast  ✗
getFinalScoringPeriod() → NO validation — direct field access on raw data  ✗
normalizeLeagueData()   → Pure `as any` casts throughout  ✗ (downstream consumer)
```

### Gap 1: `validateEspnResponse()` returns unvalidated data on failure

Current behavior:
```typescript
// utils/espn-schemas.ts — line 82-93
if (!result.success) {
  logger?.warn({ context, errors: result.error.errors.slice(0, 5) }, "ESPN response schema mismatch");
  return data as T;  // ← returns raw unvalidated data, T cast is a lie
}
```

The type `T` becomes a lie — callers assume they have a validated `T` but may have raw unknown. This is correct for forward-compatibility (don't break on new ESPN fields) but wrong for critical required fields (e.g., `teams` array).

**Pattern to add:** A two-tier validation approach:
- `validateEspnResponse()` — existing behavior, warn-and-continue for additive changes (new fields, optional fields)
- `assertEspnCriticalFields()` — throw if required structural fields are absent (e.g., `teams` array missing entirely, `settings` missing)

### Gap 2: `fetchGlobalDraftData()` uses raw `as any`

Lines 1064-1065:
```typescript
const data = response.data as any;
const batch = (data?.players as any[]) || [];
```

This needs Zod validation wired in. The `ESPNFreeAgentsResponseSchema` already covers the `players` array structure and can be reused here.

### Gap 3: `getFinalScoringPeriod()` accesses nested fields without type guards

Line 317:
```typescript
if (response.status === 200 && response.data?.currentScoringPeriod?.id) {
  return response.data.currentScoringPeriod.id as number;
}
```

Optional chaining provides runtime safety here but no schema validates the shape. Low risk, but a `z.object({ currentScoringPeriod: z.object({ id: z.number() }).passthrough().optional() }).passthrough()` schema would make the intent explicit.

### Gap 4: `normalizeLeagueData()` has no field-level validation

The normalization function is the highest-risk consumer — it accesses deeply nested ESPN fields with `as any` casts. If ESPN changes a field name (e.g., `valuesByStat` → `statsByStat`), normalization silently returns empty/zeroed data with no log.

The correct fix is NOT to add Zod to normalizeLeagueData (it only processes already-fetched data). The fix is to strengthen the Zod schemas at fetch time so the structure normalizeLeagueData relies on is validated before it's consumed.

### Recommended Project Structure (no changes)

No new directories needed. All changes are within:
```
packages/backend/src/
├── utils/
│   ├── espn-schemas.ts    # Strengthen existing schemas + add assertCriticalFields
│   └── retry.ts           # Already complete — minor cleanup only
├── adapters/
│   └── espn.ts            # Wire validation into uncovered fetch methods
└── agents/__tests__/
    └── espn-schemas.test.ts  # New — unit tests for schema validation logic
```

### Retry Architecture (already complete)

`retry.ts` is fully implemented. Key properties:
- 3 retries with exponential backoff (1s → 2s → 4s + jitter via `axiosRetry.exponentialDelay`)
- 429 Rate-limit: uses `Retry-After` header if present, falls back to exponential
- 5xx: retried via `axiosRetry.isNetworkOrIdempotentRequestError` + explicit `>= 500` check
- Circuit breaker: opens after 5 consecutive failures, resets after 60s cooldown
- `ESPNAdapter` constructor already calls `createRetryableAxios(logger)`

The only cleanup needed: `fetchHistoricalWeek` has a redundant manual try/catch for 429 at line 391-396 that duplicates `axios-retry`'s handling. This should be removed to avoid double-handling.

### Anti-Patterns to Avoid

- **Zod `.strict()` on ESPN responses:** ESPN regularly adds new fields. `.strict()` would break on any ESPN API addition. Always use `.passthrough()` on outermost objects.
- **Throwing on schema mismatch for non-critical fields:** New optional fields from ESPN should log a debug/info, not throw or warn.
- **Re-validating in `normalizeLeagueData()`:** Normalization runs on already-fetched data. Validation belongs at the HTTP boundary (fetch methods), not downstream.
- **Replacing `as any` with typed casts without Zod:** TypeScript casts don't protect at runtime. The point is Zod schemas at the fetch boundary, not type assertions in normalization code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential backoff | Custom sleep/retry loop | `axios-retry` (already installed) | Handles jitter, Retry-After headers, axios error detection |
| Schema validation | Manual `typeof` checks | Zod (already installed) | Composable, generates TypeScript types, clear error messages |
| Circuit breaker | Custom state machine | `CircuitBreaker` class in `retry.ts` | Already implemented correctly |

**Key insight:** The full stack is already in place. This phase is integration and gap-closing work, not infrastructure building.

## Common Pitfalls

### Pitfall 1: `validateEspnResponse()` return type is misleading
**What goes wrong:** The function is typed `T` but returns `data as T` on failure — callers don't know if they have validated or raw data.
**Why it happens:** Graceful degradation was prioritized over type safety at the boundary.
**How to avoid:** For critical fields (teams, settings), add a separate assertion function that throws rather than returning raw data. The warn-and-continue is correct for unknown extra fields but wrong for missing required fields.
**Warning signs:** Downstream normalization code producing `NaN` or empty arrays without any logged errors.

### Pitfall 2: Schema fingerprinting only covers 2 of 5 fetch methods
**What goes wrong:** `computeSchemaFingerprint` is called in `fetchLeague` and `fetchHistoricalWeek` but not in `fetchTransactions`, `fetchFreeAgents`, or `fetchGlobalDraftData`. ESPN API drift in those endpoints produces no fingerprint record in `league_raw_payload`.
**How to avoid:** Call `computeSchemaFingerprint` consistently after every successful fetch that archives data.

### Pitfall 3: `fetchHistoricalWeek` 429 handling conflicts with `axios-retry`
**What goes wrong:** Manual catch at line 391-396 logs a warning for 429 but then rethrows — axios-retry will catch the rethrown error and retry. The log fires before the retry, which is confusing.
**How to avoid:** Remove the manual 429 block entirely. `createRetryableAxios` already handles 429 with Retry-After support.

### Pitfall 4: Zod `z.unknown()` arrays don't validate item shapes
**What goes wrong:** `ESPNLeagueResponseSchema` uses `z.array(z.unknown())` for schedule and `z.array(z.unknown())` for scoringItems. This passes validation even if array items are completely wrong.
**Why it happens:** The schema was written defensively to avoid over-specification.
**How to avoid:** For arrays that normalization code iterates and accesses by field name (e.g., scoringItems), define the item schema minimally: `z.object({ statId: z.number(), isReverseItem: z.boolean().optional() }).passthrough()`. This catches the breaking case (statId disappears) without locking in ESPN's full item structure.

### Pitfall 5: Logging unexpected fields is noisy unless rate-limited
**What goes wrong:** If ESPN adds a new field to every team object, the adapter logs a warning per team per request — potentially 12+ warnings on every snapshot.
**How to avoid:** Log schema drift at INFO level with field names, not at WARN. Aggregate: "ESPN response has 3 unexpected fields: [field1, field2, field3]" once per response, not per item.

## Code Examples

### Pattern 1: Zod schema with minimal item validation (recommended upgrade)

```typescript
// Source: Zod docs — https://zod.dev (official)
// Instead of z.array(z.unknown()):
const scoringItemSchema = z.object({
  statId: z.number(),
  isReverseItem: z.boolean().optional(),
}).passthrough(); // Allow future ESPN additions

export const ESPNLeagueResponseSchema = z.object({
  id: z.number(),
  settings: z.object({
    name: z.string(),
    scoringPeriodId: z.number(),
    scoringSettings: z.object({
      scoringItems: z.array(scoringItemSchema)  // Validated item shape
    }).passthrough(),
    rosterSettings: z.object({
      lineupSlotCounts: z.record(z.string(), z.number())
    }).passthrough().optional(),
  }).passthrough(),
  teams: z.array(z.object({
    id: z.number(),
    valuesByStat: z.record(z.string(), z.number()).optional(),
    roster: z.object({
      entries: z.array(z.object({
        playerId: z.number(),
        lineupSlotId: z.number().optional(),
        playerPoolEntry: z.object({
          player: z.object({
            fullName: z.string().optional(),
            proTeamId: z.number().optional(),
            eligibleSlots: z.array(z.number()).optional(),
          }).passthrough()
        }).passthrough().optional()
      }).passthrough())
    }).passthrough().optional()
  }).passthrough()),
}).passthrough();
```

### Pattern 2: Two-tier validation (warn vs throw)

```typescript
// Warn-and-continue for non-critical fields (existing behavior — keep)
export function validateEspnResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string,
  logger?: Logger
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger?.warn({ context, errors: result.error.errors.slice(0, 5) }, "ESPN schema mismatch");
    return data as T; // Graceful degradation
  }
  return result.data;
}

// Throw on missing critical structure (add this)
export function assertEspnCriticalShape(
  data: unknown,
  context: string,
  logger?: Logger
): asserts data is Record<string, unknown> {
  if (typeof data !== "object" || data === null) {
    const msg = `ESPN returned non-object for ${context}`;
    logger?.error({ context, dataType: typeof data }, msg);
    throw new Error(msg);
  }
  const raw = data as Record<string, unknown>;
  // Check the teams array — if absent, snapshot is broken
  if (!Array.isArray(raw.teams)) {
    const msg = `ESPN response missing 'teams' array for ${context}`;
    logger?.error({ context, keys: Object.keys(raw).slice(0, 10) }, msg);
    throw new Error(msg);
  }
}
```

### Pattern 3: Logging unexpected top-level fields (schema drift detection)

```typescript
// Log new ESPN fields at INFO — useful for knowing when ESPN changes
export function logUnexpectedFields(
  data: Record<string, unknown>,
  knownFields: string[],
  context: string,
  logger?: Logger
): void {
  const unexpected = Object.keys(data).filter(k => !knownFields.includes(k));
  if (unexpected.length > 0) {
    logger?.info({ context, unexpectedFields: unexpected }, "ESPN response contains new unknown fields");
  }
}
```

### Pattern 4: Remove duplicate 429 handling from fetchHistoricalWeek

Current (problematic — line 391-396):
```typescript
// REMOVE this block — axios-retry handles it
} catch (error: any) {
  if (error.response?.status === 429) {
    const retryAfter = error.response.headers['retry-after'] || 60;
    this.logger?.warn({ scoringPeriodId, retryAfter }, "ESPN rate limit hit - backing off");
  }
  throw error;
}
```

After: Let `createRetryableAxios` (already wired) handle all retry logic. The retry.ts implementation already logs retries via `onRetry` callback.

## State of the Art

| Old Approach | Current Approach | Status |
|--------------|------------------|--------|
| Manual retry with sleep() | axios-retry with exponential backoff | Already implemented in retry.ts |
| No validation | Zod schemas at fetch boundary | Partially implemented (3/5 methods covered) |
| TypeScript-only types | Zod + inferred TypeScript types | Partially — schemas exist but inferred types not exported |

**Current approach:** Export `z.infer<typeof ESPNLeagueResponseSchema>` as TypeScript types so the validated output type is the source of truth, not hand-written interfaces. This replaces `ESPNLeagueData` interface with a Zod-inferred type for the fields that matter.

**Deprecated/outdated:**
- CLAUDE.md Known Issue #8 ("No retry/backoff on ESPN API calls") — this is ALREADY FIXED in retry.ts. The known issue is stale. Phase 76 should remove it from CLAUDE.md.

## Open Questions

1. **Should `normalizeLeagueData()` receive the Zod-validated type or raw `Record<string, unknown>`?**
   - What we know: Currently receives raw data, uses `as any` throughout
   - What's unclear: Whether to export Zod-inferred types and refactor normalizeLeagueData to use them
   - Recommendation: Phase 76 should strengthen schemas and wire validation, but leave normalizeLeagueData signature unchanged. A full type-safe refactor of normalizeLeagueData is a separate concern and high risk.

2. **`getFinalScoringPeriod()` — add schema or leave as optional-chaining?**
   - What we know: `response.data?.currentScoringPeriod?.id` is runtime-safe via optional chaining
   - Recommendation: Add a minimal inline schema or explicit type check; this is a one-liner and consistent with the rest of the adapter.

3. **Fingerprint archiving for non-league-fetch methods?**
   - What we know: fingerprints only computed for `fetchLeague` and `fetchHistoricalWeek`
   - Recommendation: Out of scope for this phase — `fetchTransactions` and `fetchFreeAgents` don't write to `league_raw_payload`, so there's nowhere to store a fingerprint.

## Environment Availability

Step 2.6: SKIPPED — Phase 76 is code/config changes only. No external tool dependencies beyond the running PostgreSQL and Redis that are already required by the project.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^1.1.1 |
| Config file | packages/backend/vitest.config.ts (or package.json test script) |
| Quick run command | `cd packages/backend && pnpm test --run` |
| Full suite command | `cd packages/backend && pnpm test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| 76-VAL-01 | Zod schemas catch missing required fields | unit | `pnpm test --run espn-schemas` | Wave 0 |
| 76-VAL-02 | Zod schemas pass on valid ESPN-shaped data | unit | `pnpm test --run espn-schemas` | Wave 0 |
| 76-VAL-03 | Unexpected fields logged at INFO, not thrown | unit | `pnpm test --run espn-schemas` | Wave 0 |
| 76-RET-01 | axios-retry retries 5xx responses | unit | `pnpm test --run retry` | Wave 0 |
| 76-RET-02 | Circuit breaker opens after 5 failures | unit | `pnpm test --run retry` | Wave 0 |
| 76-INT-01 | fetchGlobalDraftData validates response with Zod | unit | `pnpm test --run espn-adapter` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/backend && pnpm test --run`
- **Per wave merge:** `cd packages/backend && pnpm test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/backend/src/utils/__tests__/espn-schemas.test.ts` — covers 76-VAL-01, 76-VAL-02, 76-VAL-03
- [ ] `packages/backend/src/utils/__tests__/retry.test.ts` — covers 76-RET-01, 76-RET-02
- [ ] `packages/backend/src/adapters/__tests__/espn-adapter.test.ts` — covers 76-INT-01

## Project Constraints (from CLAUDE.md)

- **Backend stack:** Fastify 4, TypeScript, Kysely, BullMQ — no framework changes
- **Agents:** Accept Kysely `db` instance and optional Pino `logger` — maintain signature
- **Never log secrets:** ESPN cookies (SWID, espn_s2) must never appear in logs — maintain this in any new logging
- **Degraded snapshots:** Use `is_degraded` + `degraded_reasons` JSONB pattern — if ESPN validation fails critically, the snapshot should be marked degraded, not silently corrupted
- **Empty array guard:** Check `array.length > 0` before `WHERE col IN (...)` — not directly relevant to this phase but maintain in any new array processing

**Known issues this phase closes:**
- CLAUDE.md Known Issue #8 ("No retry/backoff") — already fixed in retry.ts. Phase 76 should verify the wiring is correct and remove the stale entry.

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `packages/backend/src/adapters/espn.ts` — full file reviewed
- Codebase direct read: `packages/backend/src/utils/espn-schemas.ts` — full file reviewed
- Codebase direct read: `packages/backend/src/utils/retry.ts` — full file reviewed
- `npm view zod version` → 3.24.x current; `npm view axios-retry version` → 4.5.0 current

### Secondary (MEDIUM confidence)
- Zod 3.x official docs pattern: `.passthrough()` for forward-compatible object schemas — consistent with existing codebase usage

### Tertiary (LOW confidence — not needed, existing codebase is authoritative)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, versions verified against npm registry
- Architecture: HIGH — full adapter and utility files read, gaps identified from actual code
- Pitfalls: HIGH — derived from direct code analysis, not speculation
- Retry completeness: HIGH — retry.ts fully implements the spec; CLAUDE.md Known Issue #8 is stale

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable domain — ESPN API patterns and Zod 3.x are not fast-moving)
