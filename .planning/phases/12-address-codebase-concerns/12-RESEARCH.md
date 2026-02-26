# Phase 12: address codebase concerns - Research

**Researched:** 2026-02-23
**Domain:** Code quality improvement, bug fixing, technical debt reduction
**Confidence:** HIGH

## Summary

Phase 12 addresses 316 lines of documented concerns across 9 categories: tech debt, known bugs, security (deferred), performance bottlenecks, fragile areas, scaling limits, dependencies at risk, missing features, and test coverage gaps. The codebase is a TypeScript monorepo using Turbo + pnpm with three packages (backend/frontend/extension), totaling ~8,180 lines in agents alone.

The research identifies that concerns fall into three complexity tiers: quick wins (wiring existing functions, adding guards), medium complexity (completing partial features), and deep refactors (extracting monolithic agents). Testing infrastructure exists but is minimal — Vitest configured for backend with one test suite, no frontend tests, no extension tests. The codebase uses established patterns (Kysely for DB, Fastify for API, WXT for extension) but has inconsistent application (e.g., retry wrapper not applied universally, API client library unused).

**Primary recommendation:** Start with bug fixes and quick wins to establish momentum, then systematically address tech debt using the progressive depth approach while building targeted test coverage around each fix.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Security concerns deferred** — All security issues (plaintext cookies, weak JWT defaults, Slack OAuth CSRF) are out of scope for this phase. Development-only environment; production hardening happens later. Security items remain documented in CONCERNS.md for future phases.

- **Fix bugs first** — Stabilize existing features before adding new capabilities. Target bugs: injury data always empty, draft recommendations returns placeholder, extension cannot detect user team ID, DOM selectors are placeholders. Bug fixes block new feature work; establish stable baseline before expansion.

- **Mix tech debt and feature gaps based on impact** — Balance cleanup with completion. Tech debt examples: Frontend API client unused, PlayerIdentityResolution not wired. Feature gaps examples: Transaction ingestion missing, free agent pool never populated. Prioritize based on user-facing impact and risk, not just category.

- **Progressive depth approach** — Start with quick fixes, then layer in deeper work. Phase 1: Low-hanging fruit (wire up existing functions, add null checks, consolidate duplicated code). Phase 2: Medium complexity (complete partial features, add missing integrations). Phase 3: Deep refactors (extract monolithic agents, optimize performance bottlenecks). Build momentum with wins before tackling architectural changes.

### Claude's Discretion
- Exact sequencing of fixes within each complexity tier
- Breaking large concerns into sub-tasks vs addressing atomically
- Whether to add tests before, during, or after each fix
- Decision on which concerns can be addressed in parallel vs sequentially

### Deferred Ideas (OUT OF SCOPE)
- Security hardening (plaintext cookies, JWT secrets, OAuth CSRF) — future phase
- Scaling improvements (connection pooling, caching strategy) — address when needed
- Test coverage expansion — add tests strategically, not comprehensively in this phase
- Performance optimization — profile first, optimize later
</user_constraints>

## Standard Stack

### Core (Already in Use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | ^1.1.1 | Backend testing | Modern, fast test runner with globals support, native ESM, TypeScript support |
| Kysely | ^0.27.2 | Type-safe SQL | Industry standard for TypeScript SQL with compile-time safety |
| Fastify | ^4.25.2 | Backend framework | High performance, extensive plugin ecosystem already integrated |
| Next.js | ^14.1.0 | Frontend framework | App Router architecture, SSR/SSG capabilities |
| WXT | ^0.20.18 | Extension framework | Modern Chrome extension development with HMR, TypeScript, cross-browser support |
| Turbo | ^2.0.0 | Monorepo orchestration | Build caching, task pipeline management |
| pnpm | (workspace) | Package management | Efficient disk usage, workspace protocol support |

### Supporting (For New Capabilities)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React Testing Library | Latest | Frontend component testing | When adding Next.js component tests (currently missing) |
| Playwright | Latest | Extension E2E testing | WXT's recommended testing tool for DOM observer validation |
| @vitest/ui | Latest | Test debugging | Optional UI for debugging complex test failures |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest | Jest | Vitest is faster and has better ESM support; Jest has larger ecosystem but requires more config |
| Kysely mocks | Real test DB | Mocking is faster but misses DB-level validation; test DB catches SQL errors but slower |
| Playwright | Puppeteer | Playwright has better multi-browser support and WXT integration; Puppeteer lighter but Chrome-only |

**Installation:**
```bash
# Backend testing enhancements
pnpm add -D @vitest/ui --filter @espn-fantasy/backend

# Frontend testing setup
pnpm add -D @testing-library/react @testing-library/jest-dom @vitejs/plugin-react --filter @espn-fantasy/frontend

# Extension E2E testing
pnpm add -D playwright @playwright/test --filter @espn-agent/extension
```

## Architecture Patterns

### Recommended Project Structure (Current State)
```
packages/
├── backend/src/
│   ├── agents/              # Business logic classes (8 files, 1451 lines max)
│   ├── adapters/            # External API wrappers (espn.ts)
│   ├── api/                 # Fastify route modules
│   ├── db/                  # Kysely schema + migrations
│   ├── utils/               # Shared utilities (encryption, retry)
│   ├── workers/             # BullMQ job handlers
│   └── __tests__/           # Integration tests (minimal)
├── frontend/src/
│   ├── app/                 # Next.js App Router pages
│   └── lib/                 # API client (exists but unused)
└── extension/
    ├── entrypoints/         # WXT entry points (content, background, popup)
    ├── lib/                 # DOM observers, draft state, API client
    └── components/          # React components for sidebar
```

### Pattern 1: Agent Class with Database Dependency Injection
**What:** Isolated business logic classes accepting Kysely DB instance and optional logger
**When to use:** All agent refactoring and new agent creation
**Example:**
```typescript
// Source: packages/backend/src/agents/projections-ingest.ts (lines 47-55)
export class ProjectionsIngestAgent {
  private identityAgent: PlayerIdentityResolutionAgent;

  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {
    this.identityAgent = new PlayerIdentityResolutionAgent(db, logger);
  }
}
```
**Key principles:**
- Single responsibility per agent
- Compose agents via constructor injection (see identityAgent above)
- Never log secrets (ESPN cookies, auth tokens)
- Mark outputs as degraded when data incomplete

### Pattern 2: Empty Array Guard Before WHERE IN
**What:** Runtime check preventing Kysely from generating invalid SQL with empty IN clauses
**When to use:** All dynamic queries with variable-length ID arrays
**Example:**
```typescript
// Based on Kysely issue #709 and CLAUDE.md pattern
const playerIds = [1, 2, 3]; // Could be empty from user input

if (playerIds.length > 0) {
  const results = await db
    .selectFrom("player")
    .selectAll()
    .where("id", "in", playerIds)
    .execute();
}
```
**Why necessary:** Kysely generates `WHERE id IN ()` for empty arrays, which is invalid SQL. Guard prevents runtime query failure.

### Pattern 3: Component-Based Rate Stat Calculation
**What:** Never average rates; always combine components then calculate
**When to use:** All projections, trade analysis, standings calculations
**Example:**
```typescript
// Source: packages/shared/src/formulas.ts (lines 69-94)
import { calculateFinalRate, combineComponents } from "@espn-fantasy/shared";

// CORRECT: Combine components first
const current = { H: 1500, AB: 5000 }; // AVG = 0.300
const projected = { H: 50, AB: 200 };  // AVG = 0.250
const finalAVG = calculateFinalRate("avg", current, projected);
// Result: (1500+50)/(5000+200) = 0.298

// INCORRECT: Averaging rates
const wrongAVG = (0.300 + 0.250) / 2; // 0.275 (wrong!)
```

### Pattern 4: Vitest Test Setup for Kysely Agents
**What:** Mock database pattern for unit testing agent logic without real DB
**When to use:** Agent unit tests, fast feedback loops
**Example:**
```typescript
// Source: packages/backend/src/agents/__tests__/trade-recommendation.test.ts (lines 1-19)
import { describe, it, expect, beforeEach } from "vitest";
import { TradeRecommendationAgent } from "../trade-recommendation.js";

describe("TradeRecommendationAgent", () => {
  let agent: TradeRecommendationAgent;
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockDb(); // Mock Kysely instance
    agent = new TradeRecommendationAgent(mockDb);
  });

  it("should calculate AVG using component math", async () => {
    setupMockForAVGTest(mockDb, leagueId, teamId, snapshotDate);
    const result = await agent.analyzeTradeImpact(/* ... */);
    expect(result.categoryImpacts.find(c => c.categoryId === "AVG")).toBeDefined();
  });
});
```

### Pattern 5: WXT Extension DOM Observer with Debouncing
**What:** MutationObserver with debounced callback to prevent performance issues on dynamic pages
**When to use:** Extension content scripts monitoring ESPN draft board changes
**Example:**
```typescript
// Pattern based on WXT best practices and Chrome MutationObserver docs
let debounceTimer: NodeJS.Timeout;

const observer = new MutationObserver((mutations) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Process DOM changes
    const picks = extractDraftPicks(document);
    updateSidebarRankings(picks);
  }, 800); // 800ms debounce recommended for infinite scroll
});

observer.observe(draftBoardElement, {
  childList: true,
  subtree: true,
});
```

### Pattern 6: Extract Class Refactoring for Large Agents
**What:** Apply Single Responsibility Principle to break down monolithic classes
**When to use:** Agents >1000 lines with multiple concerns (TransactionImpactAgent at 1451 lines)
**Steps:**
1. Identify distinct responsibilities (e.g., replacement player logic, impact scoring, projections)
2. Extract each responsibility to new class
3. Inject extracted classes via constructor
4. Move caching/memoization to extracted classes

**Example extraction:**
```typescript
// Before: TransactionImpactAgent has 1451 lines doing everything

// After: Extract ReplacementPlayerAgent
export class ReplacementPlayerAgent {
  constructor(private db: Kysely<Database>) {}

  async findReplacementPlayers(position: string): Promise<Player[]> {
    // Extracted logic with position-specific caching
  }
}

// TransactionImpactAgent now composes
export class TransactionImpactAgent {
  private replacementAgent: ReplacementPlayerAgent;

  constructor(db: Kysely<Database>) {
    this.replacementAgent = new ReplacementPlayerAgent(db);
  }
}
```

### Anti-Patterns to Avoid
- **Hardcoded API URLs:** Pages should import from `lib/api.ts`, not hardcode localhost:3001
- **Unchecked empty arrays in WHERE IN:** Always guard with `array.length > 0`
- **Rate stat averaging:** Never `(avg1 + avg2) / 2`; use component combination
- **No error boundaries in orchestrators:** Partial failures should mark snapshots degraded, not crash
- **Retry wrapper inconsistency:** Apply retry to all ESPN API calls, not just some

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database mocking | Custom mock factory | `createMockDb()` pattern from existing test | Kysely chaining requires all methods return mock instance; easy to miss methods |
| DOM change detection | Custom polling | MutationObserver with debouncing | Native API is faster, uses callbacks after multiple changes vs polling overhead |
| SQL retry logic | Try-catch loops | `axios-retry` with exponential backoff (already in codebase) | Handles jitter, circuit breaking, network vs server errors correctly |
| Component code splitting | Manual lazy loading | Next.js `lazy()` with Suspense | Framework-integrated, handles SSR edge cases, automatic bundle optimization |
| Extension E2E tests | Custom Puppeteer scripts | Playwright with WXT integration | WXT passes `.output/chrome-mv3` directory; Playwright handles multi-browser, debugging |

**Key insight:** Codebase already has solutions for retry logic, encryption, component formulas — the problem is inconsistent usage, not missing libraries. Focus on wiring up existing utilities before adding new ones.

## Common Pitfalls

### Pitfall 1: Empty Array in Kysely WHERE IN Clause
**What goes wrong:** Query crashes with SQL syntax error `WHERE id IN ()`
**Why it happens:** Dynamic filters build ID arrays that can be empty (e.g., no free agents, no matching players)
**How to avoid:** Always check `array.length > 0` before `.where("id", "in", array)`
**Warning signs:** Functions accepting variable-length arrays as parameters, especially from user input or parsed ESPN data
**Detection:** Grep for `.where(".*", "in",` and verify guards exist
**Source:** [Kysely Issue #709](https://github.com/kysely-org/kysely/issues/709)

### Pitfall 2: Rate Stat Calculation Without Components
**What goes wrong:** Trade impact shows incorrect projected standings; AVG/ERA/WHIP calculations mathematically invalid
**Why it happens:** Intuition says "average the rates" but stats are rate = components / components
**How to avoid:** Always use `calculateFinalRate()` from shared package; combine components first
**Warning signs:** Arithmetic on rate stat values, averaging player stats directly
**Detection:** Grep for `AVG`, `ERA`, `WHIP` with arithmetic operators; verify uses `combineComponents()`
**Verification:** Write test with known components; incorrect approach will fail (see trade-recommendation.test.ts lines 22-27)

### Pitfall 3: Frontend API Client Exists But Unused
**What goes wrong:** API endpoint changes require editing 8+ page files; production build breaks without NEXT_PUBLIC_API_URL
**Why it happens:** `lib/api.ts` exists with typed wrappers but pages were built before it, use hardcoded fetch
**How to avoid:** Import from `lib/api.ts` for all new API calls; refactor existing to use it
**Warning signs:** `fetch("http://localhost:3001")` in page files
**Detection:** Grep for `localhost:3001` outside api.ts; verify imports exist
**Fix scope:** 2 files currently use hardcoded URLs (projections/page.tsx, admin/page.tsx)

### Pitfall 4: Snapshot Orchestrator Missing Error Boundaries
**What goes wrong:** ESPN API timeout causes entire snapshot to fail; no partial data saved; prior successful state overwritten with nothing
**Why it happens:** Sequential steps without try-catch; any failure aborts entire flow
**How to avoid:** Wrap each major step (fetch, parse, write) in try-catch; mark snapshot degraded on partial failure; don't overwrite successful prior state
**Warning signs:** No degraded_reasons in snapshot write; no try-catch around ESPN adapter calls
**Detection:** Review SnapshotOrchestratorAgent.executeSnapshot() for error handling
**Example:** ESPN fetch fails → mark degraded with reason, keep yesterday's data → still compute projections from stale roster

### Pitfall 5: Extension DOM Selectors Fragile to ESPN Changes
**What goes wrong:** ESPN redesigns page → selectors no longer match → extension shows blank sidebar → users report "not working"
**Why it happens:** Hardcoded selectors (`.draftBoardGrid`, `.draft-board-grid-pick-cell`) with no fallback or validation
**How to avoid:** Multiple selector fallbacks (already partially implemented in dom-observers.ts); add runtime validation; log warnings for unknown elements
**Warning signs:** Single selector string, no querySelector fallback array
**Detection:** Extension stops working after ESPN update; check console for selector errors
**Mitigation:** dom-observers.ts already has fallback arrays (lines 3-18) but needs validation to detect new structure

### Pitfall 6: Vitest Test Config Too Minimal
**What goes wrong:** Tests can't import from `@espn-fantasy/shared`; relative imports break; ESM issues
**Why it happens:** `vitest.config.ts` only sets `globals: true`; no path mapping, no shared package resolution
**How to avoid:** Add `resolve.alias` for shared package; configure test environment for Node/jsdom appropriately
**Warning signs:** Import errors in tests, "Cannot find module" for workspace packages
**Example fix:**
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // or 'jsdom' for frontend
  },
  resolve: {
    alias: {
      '@espn-fantasy/shared': '../shared/src',
    },
  },
});
```

## Code Examples

Verified patterns from codebase and official sources:

### Agent Constructor Pattern
```typescript
// Source: packages/backend/src/agents/waiver-recommendation.ts (lines 47-54)
export class WaiverRecommendationAgent {
  constructor(
    private db: Kysely<Database>,
    // @ts-expect-error reserved for future use
    private standingsAgent: StandingsProjectionAgent,
    private espnAdapter: ESPNAdapter,
    private logger?: Logger,
  ) {}
}
```
**Note:** Constructor accepts dependencies, composes other agents, logger optional

### Kysely Empty Array Guard
```typescript
// Pattern from CONCERNS.md and Kysely Issue #709
const playerIds = await getFilteredPlayerIds(); // Could return []

if (playerIds.length > 0) {
  const projections = await db
    .selectFrom("player_projection")
    .selectAll()
    .where("player_id", "in", playerIds)
    .execute();
} else {
  // Handle empty case explicitly
  projections = [];
}
```

### Component-Based Rate Stat Projection
```typescript
// Source: packages/shared/src/formulas.ts (lines 52-64, 69-74)
import { combineComponents, calculateFinalRate } from "@espn-fantasy/shared";

const currentToDate = { H: 1500, AB: 5000 }; // .300 AVG
const restOfSeason = { H: 150, AB: 500 };    // .300 AVG projected

// Combine components first
const combined = combineComponents(currentToDate, restOfSeason);
// combined = { H: 1650, AB: 5500 }

// Then calculate rate
const finalAVG = calculateFinalRate("avg", currentToDate, restOfSeason);
// finalAVG = 1650 / 5500 = 0.300
```

### Encryption Utility Usage
```typescript
// Source: packages/backend/src/utils/encryption.ts (lines 42-56)
import { encryptToken, decryptToken, hasEncryptionKey } from "../utils/encryption.js";

if (!hasEncryptionKey()) {
  // Graceful degradation or fail-fast depending on environment
  throw new Error("ENCRYPTION_KEY required for production");
}

// Encrypt ESPN cookies before storage
const encryptedSwid = encryptToken(espnSwid);
const encryptedS2 = encryptToken(espnS2);

await db.insertInto("league").values({
  espn_swid: encryptedSwid,
  espn_s2: encryptedS2,
});

// Decrypt when needed for API calls
const swid = decryptToken(encryptedSwid);
```
**Note:** Encryption utilities exist and work; just not applied to ESPN cookies yet

### Axios Retry Wrapper Application
```typescript
// Source: packages/backend/src/utils/retry.ts (entire file)
import { createRetryableAxios } from "../utils/retry.js";

const axiosInstance = createRetryableAxios(logger);

// Use retryable instance for all ESPN API calls
const response = await axiosInstance.get(
  "https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/...",
  {
    headers: {
      Cookie: `SWID=${swid}; espn_s2=${s2}`,
    },
  }
);
```
**Current problem:** ESPNAdapter creates retry instance but doesn't consistently use it (line 58 note: "in-memory cache")

### Next.js API Client Pattern
```typescript
// Source: packages/frontend/src/lib/api.ts (lines 1-50)
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies for JWT
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Attempt silent refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry with fresh token
      return fetch(`${API_URL}${endpoint}`, { ...options, credentials: 'include' });
    }
  }

  return res.json();
}
```
**Usage:** `import { api } from "@/lib/api"; const leagues = await api.getLeagues();`

### WXT MutationObserver with Debouncing
```typescript
// Pattern from WXT E2E testing docs and Chrome developer blog
// Source: https://wxt.dev/guide/essentials/e2e-testing
// Source: https://developer.chrome.com/blog/detect-dom-changes-with-mutation-observers

let debounceTimer: NodeJS.Timeout;

const observer = new MutationObserver((mutations) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`Processed ${mutations.length} mutations`);

    // Extract picks from DOM
    const picks = extractDraftPicks(document);

    // Update extension UI
    updateDraftSidebarRankings(picks);
  }, 800); // 800ms works well for infinite scroll pages
});

// Observe draft board element
const draftBoard = findDraftBoardElement();
if (draftBoard) {
  observer.observe(draftBoard, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'], // Only watch relevant attributes
  });
}
```

### Vitest Mock Database Pattern
```typescript
// Based on packages/backend/src/agents/__tests__/trade-recommendation.test.ts
function createMockDb(): any {
  return {
    selectFrom: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    executeTakeFirst: vi.fn().mockResolvedValue(null),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue({}),
  };
}

function setupMockForTest(mockDb: any, leagueId: number, data: any) {
  mockDb.executeTakeFirst.mockResolvedValueOnce(data.league);
  mockDb.execute.mockResolvedValueOnce(data.teams);
  mockDb.execute.mockResolvedValueOnce(data.projections);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest for testing | Vitest with globals | 2024 | Faster tests, better ESM support, native TypeScript |
| Pages Router | Next.js App Router | Next.js 14 (2024) | Server Components, streaming, layouts; requires new testing approach |
| Puppeteer for extensions | Playwright for E2E | 2023-2024 | Better debugging, multi-browser, WXT-integrated |
| Manual Chrome extension dev | WXT framework | 2023 | HMR, cross-browser builds, TypeScript integration |
| TypeORM | Kysely | 2023 | Better TypeScript inference, no decorators, lighter weight |

**Deprecated/outdated:**
- **Jest with Next.js App Router:** React Testing Library now recommended with Vitest for server components (requires React 18.3 canary)
- **Manual axios retry logic:** `axios-retry` library handles exponential backoff, jitter, network vs server error detection
- **Hardcoded test data:** Factory functions with Kysely types generate properly-typed test data (see Type-Safe Test Data Generation with Kysely article)

**Current (2026) best practices:**
- **Progressive enhancement for extensions:** WXT with React for UI, native APIs for performance-critical code
- **Server Components testing:** Requires React canary, Vitest with custom environment setup
- **Kysely testing:** Either mock DB pattern for unit tests OR real test DB with migrations for integration tests
- **Monorepo testing:** Turbo caching with Vitest workspace mode for parallel test execution

## Open Questions

1. **Should we use real test DB or mock Kysely instances?**
   - What we know: Real DB catches SQL errors, migrations, constraints; mocks are faster
   - What's unclear: Tradeoff between test speed and SQL validation coverage
   - Recommendation: Mix both — mock for agent unit tests (fast feedback), real DB for integration tests (migration validation, complex joins)

2. **How aggressively to refactor large agents (1451 lines)?**
   - What we know: TransactionImpactAgent, TradeRecommendationAgent, SnapshotOrchestratorAgent all >1000 lines
   - What's unclear: Breaking them risks introducing bugs; leaving them risks maintainability
   - Recommendation: Extract only when fixing related bugs (e.g., extract ReplacementPlayerAgent when fixing waiver logic); don't refactor for refactoring's sake

3. **Test before, during, or after each fix?**
   - What we know: No tests exist for most bugs (injury data, draft recommendations, team ID detection)
   - What's unclear: Writing tests first is ideal but slows momentum; writing tests after risks regression
   - Recommendation: Write tests during — fix bug, write test proving it's fixed, commit together; builds coverage incrementally

4. **Can frontend pages run in parallel while backend agents are sequential?**
   - What we know: Some concerns are independent (frontend API client vs backend free agent fetch)
   - What's unclear: Risk of merge conflicts, shared types changes
   - Recommendation: Parallel when changes are in different packages and don't touch shared types; sequential when touching Database schema or shared formulas

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `/Users/jay-work/Code/espn-agent/packages/*` — direct file inspection
- `.planning/codebase/CONCERNS.md` — source of truth for all 316 lines of concerns
- CLAUDE.md project instructions — established patterns, component math rules
- packages/backend/src/agents/__tests__/trade-recommendation.test.ts — existing test pattern example
- [Kysely Official Docs](https://kysely.dev/) — type-safe SQL query builder documentation
- [Kysely Issue #709](https://github.com/kysely-org/kysely/issues/709) — empty array WHERE IN bug
- [WXT E2E Testing Guide](https://wxt.dev/guide/essentials/e2e-testing) — Playwright integration for extensions
- [Chrome MutationObserver Blog](https://developer.chrome.com/blog/detect-dom-changes-with-mutation-observers) — DOM change detection patterns

### Secondary (MEDIUM confidence)
- [Next.js Testing Docs](https://nextjs.org/docs/app/guides/testing) — App Router testing guidance
- [Test Strategy in Next.js App Router Era](https://shinagawa-web.com/en/blogs/nextjs-app-router-testing-setup) — Jest, RTL, Playwright setup
- [Wanago NestJS Kysely Unit Tests](https://wanago.io/2023/10/30/api-nestjs-kysely-unit-tests/) — Kysely testing patterns
- [Type-Safe Test Data Generation with Kysely](https://medium.com/@amir.latypov/type-safe-test-data-generation-with-kysely-7a6820aad4e6) — factory pattern for test data
- [Large Class: Extract Class Refactoring](https://codesignal.com/learn/courses/refactoring-by-leveraging-your-tests-with-typescript-jest/lessons/large-class-extract-class) — SRP refactoring patterns
- [Refactoring.guru TypeScript Patterns](https://refactoring.guru/design-patterns/typescript) — design patterns catalog

### Tertiary (LOW confidence)
- WebSearch: "WXT testing patterns 2026" — extension testing ecosystem trends
- WebSearch: "Next.js App Router component testing 2026" — React 18.3 canary requirements

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already in package.json, versions verified, usage patterns observed in codebase
- Architecture: HIGH — Patterns extracted from existing working code (agents, tests, formulas), not theoretical
- Pitfalls: HIGH — All pitfalls documented in CONCERNS.md with file/line references; empty array bug has GitHub issue
- Testing patterns: MEDIUM — Vitest config minimal, only one test suite exists, frontend/extension have no tests yet
- Refactoring approach: MEDIUM — Extract Class pattern well-documented, but application to specific agents requires judgment

**Research date:** 2026-02-23
**Valid until:** 2026-03-25 (30 days — stable ecosystem)

**Concerns coverage:**
- 9 categories researched: tech debt (6 items), bugs (4 items), security (deferred), performance (4 items), fragile areas (5 items), scaling (3 items), dependencies (3 items), missing features (4 items), test gaps (4 items)
- All bugs have identified root causes and fix approaches
- Progressive depth tiers mapped: Phase 1 (wire functions, guards), Phase 2 (complete features), Phase 3 (extract agents)
- Security explicitly deferred per user constraints
