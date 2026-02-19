# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:** Vitest (configured in backend)
- Declared in `packages/backend/package.json`: `"vitest": "^1.1.1"`
- No explicit vitest config file; uses default configuration
- Vitest reads `tsconfig.json` and infers settings

**Assertion Library:** Vitest built-in (`expect()` API)

**Run Commands:**
```bash
npm run test                 # Run all tests (from packages/backend)
npm run test -- --watch     # Watch mode
npm run test -- --coverage  # Coverage report
```

**Test Script:**
- Backend: `"test": "vitest"` in `packages/backend/package.json`
- Frontend: No test script configured
- Root: No test script (runs per-package)

## Current Test Coverage

**No test files currently exist** in the codebase. Testing infrastructure (Vitest) is installed but unused.

**Recommended file locations:**
```
packages/backend/src/
├── agents/
│   ├── snapshot-orchestrator.ts
│   ├── snapshot-orchestrator.test.ts
│   ├── trade-recommendation.ts
│   └── trade-recommendation.test.ts
├── adapters/
│   ├── espn.ts
│   └── espn.test.ts
├── api/
│   ├── leagues.ts
│   └── leagues.test.ts
```

## Test Structure Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TradeRecommendationAgent } from './trade-recommendation';

describe('TradeRecommendationAgent', () => {
  let agent: TradeRecommendationAgent;
  let mockDb: Kysely<Database>;

  beforeEach(() => {
    // Setup mocks
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeTradeImpact', () => {
    it('should return impact with correct delta', async () => {
      const trade: ProposedTrade = { /* ... */ };
      const result = await agent.analyzeTradeImpact(1, 2, '2026-02-19', trade);
      expect(result.deltaOverallPoints).toBeGreaterThan(0);
    });
  });
});
```

## Mocking Patterns

**Database Mocks:**
```typescript
const mockDb = {
  selectFrom: vi.fn().mockReturnValue({
    selectAll: () => ({
      where: () => ({
        executeTakeFirst: vi.fn().mockResolvedValue({ id: 1 })
      })
    })
  })
};
```

**Logger Mocks:**
```typescript
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};
```

**Adapter Mocks:**
```typescript
vi.mock('../adapters/espn', () => ({
  ESPNAdapter: vi.fn().mockImplementation(() => ({
    fetchLeague: vi.fn().mockResolvedValue({
      data: { /* ... */ },
      fetchedAt: new Date(),
    })
  }))
}));
```

**What to Mock:**
- Database connections (always)
- External API calls (ESPN, Slack, OAuth)
- Logger (to verify logging)
- Current date/time (`vi.useFakeTimers()`)
- Environment variables

**What NOT to Mock:**
- Core algorithm logic (stat formulas, ranking)
- Data validation
- Type definitions
- Kysely query builders

## API Route Testing

```typescript
import { buildServer } from '../index';

it('POST /api/leagues/connect should create league', async () => {
  const app = await buildServer();
  const res = await app.inject({
    method: 'POST',
    url: '/api/leagues/connect',
    payload: { espnLeagueId: 123456, season: 2024 },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toHaveProperty('league');
});
```

## Test Types

| Type | Scope | Mocking | File Pattern | Duration |
|------|-------|---------|--------------|----------|
| Unit | Single class/function | Mock all deps | `*.test.ts` | <100ms |
| Integration | Multiple components | Real DB, mock external | `*.integration.test.ts` | 100ms-1s |
| E2E | Full workflows | None (not set up) | `e2e/` | 1-10s |

## Frontend Testing

**Current Status:** No test framework configured for frontend.

**Recommended Setup:**
- Runner: Vitest (matches backend)
- Component testing: React Testing Library
- E2E: Playwright or Cypress

## Priority Test Targets

1. **Agent business logic** — All public methods on agents (highest value)
2. **Rate stat calculations** — Component math in `packages/shared/src/formulas.ts`
3. **Trade impact simulation** — Fairness scoring, delta calculations
4. **CSV ingestion validation** — Edge cases in projection parsing
5. **ESPN response normalization** — Handling missing/malformed data
6. **Empty array guards** — Kysely `WHERE IN ()` protection
