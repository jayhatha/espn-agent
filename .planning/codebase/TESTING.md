# Testing Patterns

**Analysis Date:** 2026-03-13

## Test Framework

**Runner:**
- Vitest (configured in `packages/backend/vitest.config.ts` and `packages/extension/vitest.config.ts`)
- Global test utilities enabled: `globals: true`
- Backend: `test: { globals: true }` (no environment specified, defaults to Node)
- Extension: `test: { globals: true, environment: "node" }` (explicit Node)

**Assertion Library:**
- Vitest built-in assertions: `expect()` from vitest
- No separate assertion library; uses Vitest's expect API

**Run Commands:**
```bash
# All packages
npm run test                          # Run all tests
turbo run test                        # Via Turbo monorepo

# Per package
cd packages/backend && npm run test   # Backend tests
cd packages/extension && npm run test # Extension tests
```

## Test File Organization

**Location:**
- Backend: `packages/backend/src/__tests__/` for shared test helpers
- Backend agents: `packages/backend/src/agents/__tests__/` (co-located per agent)
- Backend adapters: `packages/backend/src/adapters/__tests__/` (co-located per adapter)
- Backend API: `packages/backend/src/api/__tests__/` (co-located per route)
- Extension: `packages/extension/lib/__tests__/` (co-located per feature)
- Frontend: No tests found (Next.js linting only, via ESLint)

**Naming:**
- Test file: `[feature-name].test.ts`
- Examples:
  - `packages/backend/src/agents/__tests__/trade-recommendation.test.ts`
  - `packages/backend/src/api/__tests__/auth.test.ts`
  - `packages/extension/lib/__tests__/sgp.test.ts`

**Structure:**
```
packages/backend/src/
├── agents/
│   ├── trade-recommendation.ts
│   └── __tests__/
│       └── trade-recommendation.test.ts
├── api/
│   ├── leagues.ts
│   └── __tests__/
│       └── auth.test.ts
└── adapters/
    ├── espn.ts
    └── __tests__/
        └── espn.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Feature Name (DEBT-XX)", () => {
  let adapter: ESPNAdapter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = createMockLogger();
    adapter = new ESPNAdapter(mockLogger);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("Specific behavior", () => {
    it("should do something specific", () => {
      const result = adapter.someMethod();
      expect(result).toBe(expectedValue);
    });
  });
});
```

**Patterns:**
- Nested `describe()` blocks: high-level feature, then specific sub-behaviors
- One assertion per test (or tightly related assertions)
- Test names read as specifications: "should do X when Y"
- Reference plan/debt: `describe("Feature Name (DEBT-03)", ...)`

**Setup/Teardown:**
- `beforeEach()`: create fixtures, reset mocks, set up fake timers
- `afterEach()`: restore all mocks, use real timers if faked
- No `before()` or `after()` (once-per-suite) in codebase; per-test setup preferred

## Test Structure Examples

**Backend validation test (auth.test.ts):**
```typescript
describe("Auth validation (DEBT-03)", () => {
  describe("SignupSchema", () => {
    it("should validate correct signup data", () => {
      const valid = { email: "test@example.com", password: "password123" };
      const result = SignupSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
      }
    });

    it("should reject invalid email format", () => {
      const invalid = { email: "not-an-email", password: "password123" };
      const result = SignupSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].path).toContain("email");
      }
    });
  });
});
```

**Trade recommendation test structure:**
```typescript
describe("Multi-player trade component math accuracy", () => {
  describe("validateTradeSize", () => {
    it("should reject trades with >3 give players", () => {
      const trade: ProposedTrade = { ... };
      const result = TradeRecommendationAgent.validateTradeSize(trade);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot give more than 3 players");
    });
  });
});
```

## Mocking

**Framework:** Vitest's built-in `vi` object (mirrors Jest API)

**Patterns:**
```typescript
// Spy on method
const mockClient = vi.spyOn(adapter["client"], "get").mockResolvedValue(mockResponse);
expect(mockClient).toHaveBeenCalledTimes(1);
vi.restoreAllMocks();

// Create mock logger
const mockLogger = createMockLogger(); // helper in test-helpers.ts

// Fake timers for async operations
vi.useFakeTimers();
await vi.advanceTimersByTimeAsync(2000);
vi.useRealTimers();
```

**From espn.test.ts:**
```typescript
beforeEach(() => {
  mockLogger = createMockLogger();
  adapter = new ESPNAdapter(mockLogger);
  vi.useFakeTimers();
});

const mockResponse = {
  data: { id: 123, teams: [], members: [] },
  status: 200,
  statusText: "OK",
  headers: {},
  config: {} as any
};

const mockClient = vi.spyOn(adapter["client"], "get").mockResolvedValue(mockResponse);
const promise1 = adapter.fetchLeague({ leagueId: 123, season: 2026 });
await vi.advanceTimersByTimeAsync(0);
expect(mockClient).toHaveBeenCalledTimes(1);
```

**What to Mock:**
- External API clients (ESPNAdapter.client)
- Database calls (via Kysely, if testing orchestration)
- Logger (optional, but recommended for cleanliness)
- Timers for rate limiting tests

**What NOT to Mock:**
- Validation schemas (test against real Zod schemas)
- Stat calculation functions (test real math, not stubs)
- Database query builders (integration tests use real schema)
- Component-based formulas (always use actual formula implementations)

## Fixtures and Factories

**Test Data:**
```typescript
function makeHitter(
  name: string,
  stats: Record<string, number> = {},
  dollars = 20,
  positions: string[] = ["OF"],
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: false,
    positions,
    stats: {
      HR: 20, R: 75, RBI: 75, SB: 5, AVG: 0.27,
      AB: 480, H: 130, BB: 45, HBP: 4, SF: 4, TB: 200, PA: 530,
      ...stats, // Allow override
    },
  };
}

function makePitcher(
  name: string,
  stats: Record<string, number> = {},
  dollars = 15,
  positions: string[] = ["SP"],
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: true,
    positions,
    stats: {
      W: 12, SV: 0, ERA: 3.80, WHIP: 1.20, K: 180,
      IP: 180, HA: 165, ER: 76, BBA: 51, QS: 20, HRA: 20,
      ...stats,
    },
  };
}
```

**Location:**
- Fixture functions defined inline in test files (not shared libraries)
- For shared helpers: `packages/backend/src/__tests__/test-helpers.ts`
- Contains `createMockLogger()` function (used across test suites)

**Convention:**
- Factory names match type: `makeHitter()`, `makePitcher()`, `makePlayer()`
- Default parameters cover happy path (meaningful values)
- Allow override via `...stats` spread for test-specific tweaks
- Section tests with comments: `// ============ Fixtures ============`

## Coverage

**Requirements:** Not detected (no coverage configuration in vitest.config.ts)

**View Coverage:**
- Not configured in codebase; would require coverage plugin
- Manual coverage review: examine test files vs. agent/adapter responsibilities

## Test Types

**Unit Tests:**
- Scope: Single function or method in isolation
- Approach: Mock dependencies, focus on business logic
- Examples:
  - `validateTradeSize()` static method (no DB)
  - Schema validation with Zod
  - Stat formula calculations (`calculateAVG()`, `calculateERA()`)

**Integration Tests:**
- Scope: Multiple components working together (agents, adapters, formulas)
- Approach: Test against real Vitest/Zod behavior, mock only external APIs
- Examples:
  - `trade-recommendation.test.ts`: agent methods with mocked DB responses
  - `espn.test.ts`: adapter rate limiting with spied HTTP client
  - `sgp.test.ts`: SGP calculation with real pool data and category definitions

**E2E Tests:**
- Framework: Not used (local development app, no E2E harness)
- Extension tests are functional (test draft logic against mock draft states)

## Common Patterns

**Async Testing:**
```typescript
it("should throttle consecutive calls with 2-second delay", async () => {
  const mockClient = vi.spyOn(adapter["client"], "get")
    .mockResolvedValue(mockResponse);

  const promise1 = adapter.fetchLeague({ leagueId: 123, season: 2026 });
  await vi.advanceTimersByTimeAsync(0);

  const promise2 = adapter.fetchLeague({ leagueId: 456, season: 2026 });

  expect(mockClient).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(2000);
  await promise1;
  await promise2;

  expect(mockClient).toHaveBeenCalledTimes(2);
}, 10000); // Timeout override
```

**Error Testing:**
```typescript
it("should handle 429 errors with Retry-After header", async () => {
  const error = {
    response: {
      status: 429,
      headers: { "retry-after": "30" }
    },
    isAxiosError: true
  };

  vi.spyOn(adapter["client"], "get").mockRejectedValue(error);

  // Test retry behavior or error propagation
  const promise = adapter.fetchLeague({ leagueId: 123, season: 2026 });
  // Advance timers through retry attempts, then assert
});
```

**Validation Testing:**
```typescript
it("should reject displayName that is too short", () => {
  const invalid = {
    email: "test@example.com",
    password: "password123",
    displayName: "ab"  // < 3 chars
  };

  const result = SignupSchema.safeParse(invalid);

  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.errors[0].path).toContain("displayName");
  }
});
```

**Static Method Testing:**
```typescript
it("should accept valid 3-for-2 trade", () => {
  const trade: ProposedTrade = {
    givePlayers: [{ playerId: 1, playerName: "P1" }, ...],
    receivePlayers: [{ playerId: 4, playerName: "P4" }, ...]
  };

  const result = TradeRecommendationAgent.validateTradeSize(trade);

  expect(result.valid).toBe(true);
  expect(result.error).toBeUndefined();
});
```

---

*Testing analysis: 2026-03-13*
