# Phase 36: Code Cleanup — CODE_REVIEW.md Verification - Research

**Researched:** 2026-03-09
**Domain:** Multi-package TypeScript codebase audit — extension, backend, frontend, infra
**Confidence:** HIGH (all findings verified by direct source inspection)

## Summary

CODE_REVIEW.md was written 2026-03-08 with 40 findings across extension, backend, frontend, and infrastructure packages. This research verified the current status of every non-security finding against the live codebase. The user explicitly scoped this phase to skip security concerns (app is local dev only, not deployed).

The most important discovery: **several issues listed as P0/P1 have already been partially or fully addressed** since the review was written. Most notably, E-01 (auto-bid stops after one cycle) appears substantially improved — `lastBidPrice` is now set *after* clicking (line 1411), not before, and the dedup guard correctly prevents repeat clicks at the same price. E-07 (worker out-of-order) is also fully fixed with a monotonic request ID model. B-01 (unawaited Promise.all) still exists but is intentional ("fire and forget"). E-02 (module-level caches without league isolation) remains a real issue.

Security-classified items that are excluded from this phase: E-11 (API token plaintext), B-09 (hardcoded dev secrets), B-13 (bcrypt rounds), B-14 (hex validation), F-03 (ESPN credentials as text input). These are intentional local-dev trade-offs.

**Primary recommendation:** Focus the phase on the verified-still-valid issues in priority order: E-02 cache isolation, B-02 UTIL double-count, E-12 normalizer duplication, E-13 console.log volume, B-05 empty-IN guards, B-08 Promise.allSettled gap, F-01 parseInt NaN, F-05 debounce, I-01 @types/node alignment, I-02 Dockerfile fix, B-12 falsy category_id check, and E-10 React error boundaries.

---

## Issue Verification Table

Each CODE_REVIEW.md finding has been verified against the current source. "SKIP (SECURITY)" means the user explicitly excluded it. "FIXED" means resolved since the review. "VALID" means still present and actionable.

### Extension Package

| ID | Severity | Status | Verification Notes |
|----|----------|--------|--------------------|
| E-01 | P0 | **PARTIALLY FIXED** | `lastBidPrice` is now set at line 1411 *after* `button.click()`, not before. The dedup guard at line 1225 is correct. However, the reviewer's concern about DOM staleness between cycles may still apply — if ESPN does not update `currentBid` in state before the next `subscribe` fires, the guard could still block. Needs a targeted test, but the root bug is addressed. |
| E-02 | P0 | **VALID** | Module-level caches (`cachedSGPVectors`, `cachedProjectedStandings`, `cachedSimulation`, `cachedIdealRoster`, `cachedHitterProjMap`, `cachedPitcherProjMap`) still exist at `lib/engine/index.ts:91-108`. Cache keys use only `allPicks.length` (SGP) and `allPicks.length + currentAuctionPlayerId` (simulation). No league ID in key. No `resetEngineCache()` export. **Fix required.** |
| E-03 | P0 | **PARTIALLY ADDRESSED** | `isMyTurnToNominate()` at `auto-bid-controller.ts:279` now has four strategies with strategy-1 checking body text for "nominate a player" / "select a player". Strategy-2 checks pick train for active team. Strategy-3 comment was empty in the review — it now has an actual `Queue` button check. Still heuristic-based and fragile. Acceptable for local dev but not a full fix. |
| E-04 | P0 | **VALID (by design)** | `DEFAULT_ROSTER_SLOTS` still hardcoded at `lib/engine/index.ts:38-50`. CONTEXT.md comment at line 30 says this is "hardcoded per Phase 23 CONTEXT.md locked decision." However, there is no visible warning in the sidebar when defaults are used. The locked decision defers dynamic detection but a warning is still warranted. |
| E-05 | P1 | **VALID** | `draft-state.ts:411-414` deserializes teamRosters from `new Map(teamRostersArray)` inside `migrate()`. `updateTeamRoster()` calls `teamRosters.get()/.set()` but there is no `instanceof Map` guard before use at state access points. The race window is narrow but real. |
| E-06 | P1 | **FIXED** | `background.ts` now clears `keepaliveInterval` in the close handler (lines 60-63) before scheduling reconnect. `draftWs` is not explicitly nulled but the guard at lines 11-17 checks `readyState === OPEN || CONNECTING` before creating a new socket, preventing duplicate connections. Issue is effectively resolved. |
| E-07 | P1 | **FIXED** | `bid-optimizer-worker-client.ts` implements monotonic `nextRequestId`/`latestRequestId` model (lines 29-30). Responses with `response.requestId !== latestRequestId` are discarded at line 73. Fully addressed. |
| E-08 | P1 | **VALID (acknowledged)** | DOM selectors in `dom-observers.ts:29` still include `[style*="grid-template"]` which is broad. `:has()` selectors in `COMPLETED_PICK_SELECTORS` (lines 63-68) still present. CLAUDE.md notes selectors must be verified. This is an ongoing maintenance concern, not newly introduced. |
| E-09 | P1 | **VALID** | `startAuctionTableScraping()` and `startPickTrainBudgetPolling()` both have `if (interval) return` null-check guards at `content.tsx:673,715`. These are all called from a single code path (`if (resolvedDraftFormat === "auction") { ... }`) at line 746-753, so the double-start race is unlikely in practice. However the guard is not atomic. Low practical risk but technically valid. |
| E-10 | P1 | **VALID** | No `ErrorBoundary` component exists anywhere in `packages/extension/components/`. `DraftSidebar` renders all children unwrapped. A single render error will unmount the entire sidebar. **Fix required.** |
| E-11 | P2 | **SKIP (SECURITY)** | `chrome.storage.local.set({ apiToken })` — excluded per user scope. |
| E-12 | P2 | **VALID** | Three separate `normalizePlayerName` implementations confirmed: `draft-state.ts:16` (exported as `normalizeName`, uses NFD, removes Jr/Sr suffix), `content.tsx:37` (NFKD, strips all non-alphanumeric), `AuctionRecommendations.tsx:6` (NFKD, strips all non-alphanumeric). The first diverges from the other two. **Fix required — consolidate to one shared util.** |
| E-13 | P2 | **VALID** | 288 console statements confirmed across extension package (`grep -c` count). Many fire on every store subscription tick, auction player update, and pick event. **Fix required — replace with DEV-gated logger.** |
| E-14 | P2 | **VALID** | `isPopoutOpen` and `popoutWindow` are module-scope mutable variables at `content.tsx:599,780`. Both are mutated from `popoutHeartbeat` and `openPopout()`/`closePopout()`. Not React-managed. Low practical impact but technically a code smell. |
| E-15 | P2 | **VALID** | `refreshHandler` is a plain arrow referencing `refreshAssistantData` (not a throttled closure), so it should be removable correctly. `dockHandler as EventListener` cast at `content.tsx:884` still bypasses type checking. Listener cleanup at cleanup time needs verification. |
| E-16 | P2 | **VALID** | Retry `setTimeout` calls in `content.tsx:288-295` (roster slot retry) use implicit untracked timers. If the user navigates away, these could fire against detached DOM. Low practical risk in a single-page-load content script, but still messy. |

### Backend Package

| ID | Severity | Status | Verification Notes |
|----|----------|--------|--------------------|
| B-01 | P0 | **VALID (intentional)** | `projections.ts:52` — `Promise.all(...)` is not awaited, with comment "Fire and forget - don't wait for snapshots to complete." This is intentional to return 200 immediately. However the `.catch()` is on the outer Promise.all, so individual league rejections *before* the outer catch could be unhandled. The try/catch inside each `async (league)` function (lines 54-73) makes individual failures safe. Real risk is minimal but the code comment should match the intent. |
| B-02 | P0 | **VALID** | `draft-rankings.ts:171` — `batterSlotKeys` includes `"UTIL"` at the end. The UTIL replacement level calculation at line 254 calls `batterSlotKeys.reduce()` which includes UTIL itself, inflating the replacement index. **Fix required — remove "UTIL" from `batterSlotKeys` or use a separate array for the reduce.** |
| B-03 | P1 | **VALID** | Global `throttleEspnCall()` at `adapters/espn.ts:22` and instance `this.lastRequestTime` at line 263 both exist. They are used for different methods, not consolidated. Low real-world impact for local dev but the dual mechanism is a code smell. |
| B-04 | P1 | **VALID** | `player-identity.ts:157` — `selectAll()` with no filter loads entire player table. Character-set overlap algorithm is still used. Pre-filtering with ILIKE would help, but this agent is currently disconnected from the main ingest flow, so impact is limited. |
| B-05 | P1 | **PARTIALLY ADDRESSED** | Guards are inconsistent. `standings-projection.ts:140-149` has a correct `playerIds.length > 0 ? ... : []` guard. `trade-recommendation.ts:170-176` has a correct `receivePlayerIds.length > 0 ? ... : []` guard. `recommendations.ts:156` has a correct `playerIds.length > 0 ? ... : []` guard. The claim that "some call sites do not guard" needs re-verification — the specific flagged lines appear guarded now. A sweep to confirm no remaining unguarded sites is warranted. |
| B-06 | P1 | **VALID** | `snapshot-orchestrator.ts:90-94` uses `executeTakeFirstOrThrow()` (throws, safe). `standings-projection.ts:61-73` uses `executeTakeFirstOrThrow()` (safe). `draft-rankings.ts:59-69` uses `executeTakeFirst()` (can return undefined) with `if (!latestSettings) return []` check (safe). `player-identity.ts:157` uses `selectAll()` not `executeTakeFirst()`. Needs targeted re-verification — several are already safe. |
| B-07 | P1 | **VALID** | `retry.ts:38` — `circuitBreaker` is a module-level singleton. Any failing ESPN call opens the circuit for all ESPN calls. **Low practical impact for local dev but architecturally wrong.** |
| B-08 | P1 | **VALID** | `snapshot-orchestrator.ts:401-411` — `transactionResult.status` IS checked (`if (transactionResult.status === "fulfilled")`). However, a rejected transactionResult only logs a warning and does NOT mark the snapshot as degraded, unlike `freeAgentResult`. The asymmetry is the real issue. **Fix: mark snapshot degraded when transaction fetch fails, or document that transaction failure is intentionally non-degrading.** |
| B-09 | P2 | **SKIP (SECURITY)** | Hardcoded dev secrets in `index.ts:84,89` — excluded per user scope. |
| B-10 | P2 | **VALID** | `leagues.ts:99-119` — sequential `await db.insertInto("team")` in a `for` loop, one insert per team. Could be batched. Low urgency for local dev but straightforward fix. |
| B-11 | P2 | **VALID** | `projections-ingest.ts:333+` — `for (const row of rows)` loop with individual upserts. 400-player CSV = 400 round-trips. Measurable but local dev is not latency-sensitive. |
| B-12 | P2 | **VALID** | `draft.ts:40` — `if (!cat.category_id ...)` uses falsy check. If `category_id` is `0`, the validation incorrectly rejects it. **Fix: use `cat.category_id == null` or `cat.category_id === undefined`.** |
| B-13 | P2 | **SKIP (SECURITY)** | bcrypt rounds — excluded per user scope. |
| B-14 | P2 | **SKIP (SECURITY)** | Hex validation in `encryption.ts:19` — excluded per user scope. |

### Frontend Package

| ID | Severity | Status | Verification Notes |
|----|----------|--------|--------------------|
| F-01 | P1 | **VALID** | `waivers/page.tsx:110` — `setSelectedTeamId(parseInt(stored, 10))` with no NaN guard. `TeamSelector.tsx:48` has the same pattern. If localStorage is corrupted, `NaN` propagates. **Fix: add `|| null` guard or use `Number(stored)` with `isNaN` check.** |
| F-02 | P1 | **VALID** | `page.tsx:167,176,183` — `selectedTeamId!` non-null assertions present. Queries are `enabled: !!selectedTeamId` which prevents execution when null, but TypeScript non-null assertion is still there and masks the type-level concern. **Fix: pass `selectedTeamId as number` conditionally or structure code to not need the assertion.** |
| F-03 | P1 | **SKIP (SECURITY)** | ESPN credentials shown as plaintext `type="text"` — excluded per user scope (local dev only). |
| F-04 | P2 | **VALID** | `TeamSelector.tsx:50` — `// eslint-disable-next-line react-hooks/exhaustive-deps` comment suppresses the `onSelect` dependency. Stale closure risk if parent re-renders with new callback. **Fix: wrap `onSelect` in `useCallback` in the parent, or include it in deps.** |
| F-05 | P2 | **VALID** | `auction/page.tsx:96,115,130` — `budget`, `minBid`, and `position` inputs directly update state included in `queryKey` at line 56. Every keystroke triggers a fresh API call. `position` (a `<select>`) is fine. `budget` and `minBid` number inputs need debounce. **Fix: use `useDebouncedValue` or `useState` + `useEffect` + `setTimeout`.** |
| F-06 | P2 | **VALID** | `page.tsx:362-460` — Modal overlay uses `fixed inset-0` div but no focus trap or `aria-modal`. Tab key escapes to background. **Fix: add focus trap on modal open, restore focus on close.** |

### Infrastructure

| ID | Severity | Status | Verification Notes |
|----|----------|--------|--------------------|
| I-01 | P1 | **VALID** | `shared/package.json` uses `@types/node: ^25.3.0`, `backend/package.json` uses `^20.10.7`, `frontend/package.json` uses `^20.11.5`. Node 25 does not exist as of this writing (LTS is Node 22). The shared package compiles against nonexistent Node types. **Fix: align all three to `^22.x.x` (current LTS) or `^20.x.x` (old LTS).** |
| I-02 | P1 | **VALID** | `frontend/Dockerfile:49` — only copies `packages/frontend/package.json`, not `packages/shared/package.json`. pnpm workspace resolution will fail in the production container. **Fix: add `COPY packages/shared/package.json ./packages/shared/`.** |
| I-03 | P3 | **VALID** | No `.env.example` file exists in the repository. `docker-compose.yml` requires env vars. **Fix: create `.env.example` with required vars and placeholder values.** |
| I-04 | P3 | **VALID** | `backend/Dockerfile:53-54` — copies `packages/backend/src` into production image alongside `dist`. Source code is not needed in production. **Fix: remove `COPY ... /app/packages/backend/src ./packages/backend/src` line.** |

---

## Prioritized Fix List (Security Items Excluded)

Issues ordered by impact × effort, with security items removed:

### Must Fix (Correctness/Functionality)

1. **B-02** — UTIL double-count in replacement level: trivial one-line fix, distorts all auction values
2. **E-02** — Engine cache stale across sessions: add `resetEngineCache()` export, add league ID to keys
3. **E-12** — Three diverging normalizers: consolidate to single shared util in `lib/draft-state.ts`, re-export from there
4. **B-12** — Falsy category_id check: `!cat.category_id` → `cat.category_id == null`
5. **F-01** — parseInt NaN in waivers page and TeamSelector: add NaN guard

### Should Fix (Robustness)

6. **E-10** — No React error boundaries: add `ErrorBoundary` wrapper around `DraftSidebar` children
7. **E-13** — 288 console.log statements: create `lib/logger.ts` DEV-gated logger, replace all `console.*` calls
8. **B-08** — Promise.allSettled asymmetry: mark snapshot degraded when transaction fetch fails (or document decision)
9. **F-05** — No debounce on auction page inputs: debounce budget/minBid inputs (~500ms)
10. **F-04** — Stale closure in TeamSelector: wrap `onSelect` with `useCallback` in parent
11. **I-01** — @types/node mismatch: align all packages to `^22.x.x`
12. **I-02** — Frontend Dockerfile missing shared package: add COPY line

### Nice to Have (P2-P3 Tech Debt)

13. **E-05** — Zustand Map deserialization race: add `instanceof Map` guard in `updateTeamRoster`
14. **F-02** — Non-null assertion on selectedTeamId: remove `!` assertions, use conditional structuring
15. **F-06** — No focus trap in auth modal: add focus management
16. **B-05** — Sweep remaining empty-IN sites: confirm all call sites have length guards
17. **B-10** — N+1 team inserts: batch with `insertInto().values([...])` instead of loop
18. **I-03** — No `.env.example`: create template file
19. **I-04** — Backend Dockerfile copies src: remove src COPY

### Explicitly Out of Scope (Security)

- E-11, B-09, B-13, B-14, F-03 — all security-only concerns, skip per user instruction

---

## Architecture Patterns

### DEV-Gated Logger Pattern (for E-13)

The codebase uses `import.meta.env.DEV` (Vite/WXT) for conditional logic — e.g., `content.tsx:732`. Use the same mechanism for a logger utility.

```typescript
// lib/logger.ts — create this file
const isDev = import.meta.env.DEV;

export const logger = {
  log: isDev ? console.log.bind(console) : () => {},
  warn: isDev ? console.warn.bind(console) : () => {},
  error: console.error.bind(console), // always keep errors
  debug: isDev ? console.debug.bind(console) : () => {},
};
```

Then replace `console.log(...)` with `logger.log(...)` across extension files. `console.error` calls should stay (they indicate real failures).

### Engine Cache Reset Pattern (for E-02)

```typescript
// At the bottom of lib/engine/index.ts, add:
export function resetEngineCache(): void {
  cachedSGPVectors = null;
  sgpCacheKey = -1;
  cachedBidWorkerResult = null;
  bidWorkerCacheKey = '';
  cachedProjectedStandings = null;
  projectedStandingsCacheKey = -1;
  cachedSimulation = null;
  simulationCacheKey = '';
  cachedIdealRoster = null;
  idealRosterCacheKey = '';
  cachedHitterProjMap = null;
  cachedPitcherProjMap = null;
}
```

Call `resetEngineCache()` from `content.tsx` at draft init (when `leagueId` changes or content script initializes).

Cache keys should include `leagueId` from `DraftEngineInput`. Currently `sgpCacheKey = input.allPicks.length` (line 1032) — change to `sgpCacheKey = \`${input.leagueId}_${input.allPicks.length}\``.

### React Error Boundary Pattern (for E-10)

```typescript
// components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ESPN Draft Assistant] Component error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: '8px', color: '#dc2626', fontSize: '12px' }}>
          Panel error. <button onClick={() => this.setState({ hasError: false, error: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap each major section in `DraftSidebar` with `<ErrorBoundary>`.

### Normalizer Consolidation (for E-12)

`draft-state.ts` already exports `normalizeName` (NFD, removes Jr/Sr, collapses whitespace). The other two (`content.tsx:37`, `AuctionRecommendations.tsx:6`) use NFKD + strip all non-alphanumeric, which is more aggressive.

Decision needed: NFKD + strip-all is better for fuzzy ESPN name matching (handles accents, periods, apostrophes). Recommend:

1. Update `normalizeName` in `draft-state.ts` to use NFKD + strip all non-alphanumeric (align to the more aggressive form)
2. Delete the local `normalizePlayerName` in `content.tsx` and `AuctionRecommendations.tsx`
3. Import `normalizeName` from `draft-state` in both files

### parseInt NaN Guard (for F-01)

```typescript
// Before:
setSelectedTeamId(parseInt(stored, 10));

// After:
const parsed = parseInt(stored, 10);
if (!isNaN(parsed)) {
  setSelectedTeamId(parsed);
}
```

Apply this pattern in both `waivers/page.tsx:110` and `TeamSelector.tsx:48`.

### Debounce Pattern for Auction Page (for F-05)

TanStack Query v5 is already in the project. Use a local debounced state approach:

```typescript
// Use local state for display, debounce the query key value
const [budget, setBudget] = useState<number>(260);
const [debouncedBudget, setDebouncedBudget] = useState<number>(260);

useEffect(() => {
  const t = setTimeout(() => setDebouncedBudget(budget), 500);
  return () => clearTimeout(t);
}, [budget]);

// Use debouncedBudget in queryKey instead of budget
```

No new library needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DEV logging | Custom log level system | `import.meta.env.DEV` gate + simple wrapper | Already used in codebase |
| Debounce | Custom timer logic | Local `useState` + `useEffect` with `setTimeout` | Simple, no dep needed |
| Focus trap | Custom focus management | `@radix-ui/react-focus-scope` or native `inert` attr | Browser compat edge cases |
| Error boundaries | Custom error state | React class component `ErrorBoundary` | The React-idiomatic way |

---

## Common Pitfalls

### Pitfall 1: Normalizer Choice Breaks Name Matching
**What goes wrong:** Changing `normalizeName` to NFKD + strip-all may break existing lookups that depend on the NFD form with preserved numbers.
**Why it happens:** Two codebases converged on different normalization strategies.
**How to avoid:** When consolidating, run a quick audit of all call sites. The NFKD + strip-all form is safe because it is more aggressive — any name that matched with NFD will also match with NFKD.
**Warning signs:** Players from external rankings not matching against allPicks after the change.

### Pitfall 2: Cache Key Change Breaks SGP Vector Caching
**What goes wrong:** Changing `sgpCacheKey` from `number` to `string` may require a TypeScript type change.
**Why it happens:** `sgpCacheKey: number = -1` is typed as number. Switching to `string` form `\`${leagueId}_${allPicks.length}\`` needs declaration change too.
**How to avoid:** Change the variable declaration to `let sgpCacheKey: string = '';` simultaneously.

### Pitfall 3: ErrorBoundary Cannot Be a Function Component
**What goes wrong:** `getDerivedStateFromError` requires a class component. Hooks cannot be used.
**Why it happens:** React error boundaries are the one place that still requires class components.
**How to avoid:** Use a class component for ErrorBoundary, wrap it in a functional component if needed for hooks.

### Pitfall 4: Removing console.error Can Hide Real Failures
**What goes wrong:** Bulk-replacing all console.* with logger.* and setting errors to DEV-only will hide actual runtime errors from the console.
**How to avoid:** Keep `console.error` calls (or `logger.error` that always logs). Only gate `console.log`, `console.debug`, `console.warn` calls that are informational.

---

## Code Examples

### B-02 Fix — Remove UTIL from batterSlotKeys reduce

```typescript
// packages/backend/src/agents/draft-rankings.ts

// Before (line 171):
const batterSlotKeys = ["C", "1B", "2B", "SS", "3B", "OF", "CI", "MI", "IF", "UTIL"];

// After:
// UTIL intentionally excluded — computing UTIL replacement separately prevents double-counting
const batterSlotKeys = ["C", "1B", "2B", "SS", "3B", "OF", "CI", "MI", "IF"];
```

### B-12 Fix — category_id falsy check

```typescript
// packages/backend/src/api/draft.ts line 40

// Before:
if (!cat.category_id || !cat.stat_key || !cat.type || !cat.direction) {

// After:
if (cat.category_id == null || !cat.stat_key || !cat.type || !cat.direction) {
```

### I-01 Fix — @types/node alignment

```jsonc
// packages/shared/package.json — change:
"@types/node": "^22.0.0"  // was ^25.3.0 (nonexistent)

// packages/backend/package.json — change:
"@types/node": "^22.0.0"  // was ^20.10.7

// packages/frontend/package.json — change:
"@types/node": "^22.0.0"  // was ^20.11.5
```

### I-02 Fix — Frontend Dockerfile

```dockerfile
# packages/frontend/Dockerfile — production stage, add:
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/shared/package.json ./packages/shared/  # ADD THIS LINE
```

---

## Open Questions

1. **E-01 Auto-bid truly fixed?**
   - What we know: `lastBidPrice` is assigned after click (line 1411), not before. This addresses the described bug.
   - What's unclear: Whether ESPN's DOM updates `currentBid` in state before the controller's next subscribe tick. If ESPN shows the same bid for >1 tick, the controller correctly skips (same price). If state updates before ESPN re-renders, the next bid fires on the new price. Behavior needs live testing.
   - Recommendation: Mark E-01 as "likely fixed, needs live draft validation" — don't spend time on it in this cleanup phase.

2. **B-05 empty-IN sites — are any remaining unguarded?**
   - What we know: The three specific lines cited in the review (`standings-projection.ts:147`, `trade-recommendation.ts:174`, `recommendations.ts:156`) appear guarded in current code.
   - What's unclear: Whether additional call sites were added since the review that are not guarded.
   - Recommendation: Run a targeted grep for `.where(".*", "in",` and confirm each has a `length > 0` guard.

3. **E-04 Hardcoded roster slots — should the warning be added?**
   - What we know: The slots are hardcoded by design (CONTEXT.md locked decision from Phase 23).
   - What's unclear: Whether the "add a visible warning when using defaults" part of the fix is still wanted given the lock.
   - Recommendation: Add a simple console.warn (or sidebar note) when `detectedRosterSlots` is null and the engine falls back to defaults. Doesn't change behavior, just makes the fallback visible.

---

## Sources

### Primary (HIGH confidence)
- Direct source inspection of all cited files and line numbers in CODE_REVIEW.md
  - `packages/extension/lib/auto-bid-controller.ts` — verified E-01, E-03, E-05
  - `packages/extension/lib/engine/index.ts` — verified E-02, E-04
  - `packages/extension/entrypoints/background.ts` — verified E-06
  - `packages/extension/lib/engine/bid-optimizer-worker-client.ts` — verified E-07
  - `packages/extension/lib/dom-observers.ts` — verified E-08
  - `packages/extension/entrypoints/content.tsx` — verified E-09, E-14, E-15, E-16
  - `packages/extension/lib/draft-state.ts` — verified E-05, E-12
  - `packages/extension/components/AuctionRecommendations.tsx` — verified E-12
  - `packages/backend/src/api/projections.ts` — verified B-01
  - `packages/backend/src/agents/draft-rankings.ts` — verified B-02
  - `packages/backend/src/adapters/espn.ts` — verified B-03
  - `packages/backend/src/agents/player-identity.ts` — verified B-04
  - `packages/backend/src/agents/standings-projection.ts` — verified B-05, B-06
  - `packages/backend/src/agents/trade-recommendation.ts` — verified B-05
  - `packages/backend/src/api/recommendations.ts` — verified B-05
  - `packages/backend/src/utils/retry.ts` — verified B-07
  - `packages/backend/src/agents/snapshot-orchestrator.ts` — verified B-06, B-08
  - `packages/backend/src/api/leagues.ts` — verified B-10
  - `packages/backend/src/agents/projections-ingest.ts` — verified B-11
  - `packages/backend/src/api/draft.ts` — verified B-12
  - `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` — verified F-01
  - `packages/frontend/src/components/league/TeamSelector.tsx` — verified F-01, F-04
  - `packages/frontend/src/app/leagues/[id]/page.tsx` — verified F-02, F-06
  - `packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx` — verified F-05
  - `packages/shared/package.json`, `packages/backend/package.json`, `packages/frontend/package.json` — verified I-01
  - `packages/frontend/Dockerfile`, `packages/backend/Dockerfile` — verified I-02, I-04

---

## Metadata

**Confidence breakdown:**
- Issue verification: HIGH — every finding checked against source
- Fix patterns: HIGH — patterns are standard TypeScript/React idioms
- Priority ordering: HIGH — based on impact on local dev functionality

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (codebase is actively changing; re-verify line numbers before implementing)
