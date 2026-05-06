# Phase 89: ESPN Adapter Decomposition - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Split the 1200-line `packages/backend/src/adapters/espn.ts` monolith into three focused modules with a thin facade wiring them together for backward compatibility. The three sub-modules are:

- `EspnHttpClient` — owns all HTTP, throttle (global throttledEspnCall), LRU cache, and retry logic
- `EspnDataNormalizer` — converts raw ESPN payloads to canonical types; owns all 7 constant maps (ESPN_STAT_MAP, ESPN_LINEUP_SLOT_MAP, ESPN_POSITION_MAP, ESPN_PRO_TEAM_MAP, ESPN_POSITION_TO_SLOT, ESPN_TRANSACTION_TYPE_MAP, ALL_POSITION_SLOT_IDS)
- `EspnResponseValidator` — validates schema shape, assertEspnCriticalShape, logUnexpectedFields

The existing `ESPNAdapter` class becomes a thin facade that composes these three. All existing callers (SnapshotOrchestratorAgent, WaiverRecommendationAgent, routes, workers) continue to compile without changes.

</domain>

<decisions>
## Implementation Decisions

### Module Structure
- New files live in `packages/backend/src/adapters/espn/` subdirectory: `http-client.ts`, `normalizer.ts`, `validator.ts`, `constants.ts`, `types.ts`
- `packages/backend/src/adapters/espn.ts` becomes the facade that re-exports the `ESPNAdapter` class (backward compat)
- All 7 constant maps move to `adapters/espn/constants.ts`, imported by normalizer only

### Interface Preservation
- All public methods on `ESPNAdapter` remain unchanged: `fetchLeague`, `fetchFreeAgents`, `fetchHistoricalWeek`, `getFinalScoringPeriod`, `normalizeLeagueData`
- All exported interfaces (ESPNAuthCookies, ESPNFetchOptions, ESPNRawResponse, etc.) remain exported from `adapters/espn.ts` for backward compat

### Testing Seams
- `EspnDataNormalizer` and `EspnResponseValidator` are pure classes (no HTTP dependency) — testable without mocking
- `EspnHttpClient` wraps the HTTP concern; tests for it use nock or mock the axios instance

### the agent's Discretion
- Exact internal method split between EspnHttpClient and ESPNAdapter facade
- Whether to expose EspnHttpClient/EspnDataNormalizer/EspnResponseValidator as named exports from the facade for direct testing use

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/backend/src/adapters/espn.ts` — the full source to be split (~1200 lines)
- Throttle wrapper: `throttledEspnCall()` global function + instance-level `lastRequestTime`
- LRU cache: 2000-slot cache with `getCacheKey()`, `getCached()` methods
- Constant maps: 7 maps at module level
- Normalization: `normalizeLeagueData()`, `extractBatterComponents()`, `extractPitcherComponents()`
- Validation: `validateEspnResponse()`, `assertEspnCriticalShape()`, `logUnexpectedFields()`

### Established Patterns
- Backend uses class-based modules with constructor injection: `constructor(private logger: BaseLogger)`
- Kysely db passed to agents; adapters receive logger only
- No IoC container — manual construction in routes/workers

### Integration Points
- `SnapshotOrchestratorAgent` imports `ESPNAdapter` from `adapters/espn.ts`
- `WaiverRecommendationAgent` imports `ESPNAdapter`
- `FreeAgentView` imports `ESPNAdapter`
- API routes (recommendations.ts, leagues.ts) instantiate `new ESPNAdapter(logger)`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — pure refactor with backward-compatible facade.

</specifics>

<deferred>
## Deferred Ideas

- Adding Redis-based cache to replace in-memory LRU (separate concern, post-v8.0)
- Adding retry/backoff with exponential delay (separate concern)

</deferred>
