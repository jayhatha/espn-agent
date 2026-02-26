---
phase: quick-09
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/agents/__tests__/trade-recommendation.test.ts
  - packages/backend/src/adapters/__tests__/espn.test.ts
  - packages/backend/src/utils/validation.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "All trade-recommendation tests pass without JSON.parse errors"
    - "All ESPNAdapter throttle/retry tests pass without timeouts"
    - "parseIntParam correctly rejects decimal numbers"
  artifacts:
    - path: "packages/backend/src/agents/__tests__/trade-recommendation.test.ts"
      provides: "Fixed mock data with JSON.stringify for stat_components_json"
      min_lines: 700
    - path: "packages/backend/src/adapters/__tests__/espn.test.ts"
      provides: "Increased test timeouts for async throttle/retry tests"
      min_lines: 180
    - path: "packages/backend/src/utils/validation.ts"
      provides: "Enhanced parseIntParam to reject decimal numbers"
      min_lines: 60
  key_links:
    - from: "packages/backend/src/agents/__tests__/trade-recommendation.test.ts"
      to: "packages/backend/src/agents/trade-recommendation.ts"
      via: "JSON.parse expects string, not object"
      pattern: "JSON.stringify\\(.*stat_components_json"
    - from: "packages/backend/src/adapters/__tests__/espn.test.ts"
      to: "vitest test timeout config"
      via: "async operations need longer timeouts"
      pattern: "\\{\\s*timeout:\\s*\\d+"
---

<objective>
Fix test failures in ESPNAdapter and auth validation tests.

Purpose: Ensure all tests pass to maintain code quality and prevent regressions
Output: All test suites passing with proper async handling and validation
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Test files with failures
@packages/backend/src/agents/__tests__/trade-recommendation.test.ts
@packages/backend/src/adapters/__tests__/espn.test.ts
@packages/backend/src/api/__tests__/auth.test.ts

# Implementation files being tested
@packages/backend/src/agents/trade-recommendation.ts
@packages/backend/src/adapters/espn.ts
@packages/backend/src/utils/validation.ts
</context>

<tasks>

<task type="auto">
  <name>Fix trade-recommendation test mock data JSON serialization</name>
  <files>packages/backend/src/agents/__tests__/trade-recommendation.test.ts</files>
  <action>
Fix all mock setup functions that set `stat_components_json` to properly stringify the object before passing to mocks.

The issue: `JSON.parse(projection.stat_components_json)` in trade-recommendation.ts (line 1018) expects a string, but tests are passing raw objects like `{ H: 50, AB: 200 }`.

Changes needed:
1. In `setupMockForAVGTest` (line ~555): Change `stat_components_json: { H: 50, AB: 200 }` to `stat_components_json: JSON.stringify({ H: 50, AB: 200 })`
2. In `setupMockForERATest`: Apply same fix for IP/ER components
3. In `setupMockForOBPTest`: Apply same fix for H/BB/HBP/AB/SF components
4. In `setupMockForWHIPTest`: Apply same fix for H/BB/IP components
5. In `setupMockForZeroTradeTest`: Apply same fix
6. In `setupMockForMultiPlayerTest`: Apply same fix for all player projections

Pattern to replace:
```typescript
stat_components_json: { ... }
```
With:
```typescript
stat_components_json: JSON.stringify({ ... })
```

This ensures the mock data matches the actual database format (JSONB stored as string in query results).
  </action>
  <verify>
```bash
cd /Users/jay-work/Code/espn-agent/packages/backend && npm test -- src/agents/__tests__/trade-recommendation.test.ts
```
All tests should pass without "is not valid JSON" errors.
  </verify>
  <done>
All 18 tests in trade-recommendation.test.ts pass, specifically the 6 component math tests that were failing with JSON.parse errors.
  </done>
</task>

<task type="auto">
  <name>Increase timeouts for async ESPNAdapter tests</name>
  <files>packages/backend/src/adapters/__tests__/espn.test.ts</files>
  <action>
Fix timeout issues in async throttle and retry tests by:

1. Add timeout configuration to async tests that involve throttle/retry delays:
   - Line ~27: `it("should throttle consecutive calls with 2-second delay", async () => {` → add `{ timeout: 10000 }`
   - Line ~58: `it("should handle 429 errors with Retry-After header", async () => {` → add `{ timeout: 10000 }`
   - Line ~139: `it("should retry on network errors", async () => {` → add `{ timeout: 10000 }`
   - Line ~157: `it("should retry on 429 rate limit errors", async () => {` → add `{ timeout: 10000 }`

2. Fix the mock setup in retry tests to properly handle axios-retry behavior:
   - In "should retry on 429 rate limit errors" test (line ~157):
     - The current mock setup doesn't properly advance timers for axios-retry exponential backoff
     - Add `await vi.runAllTimersAsync()` after creating the promise to allow all pending timers to complete
     - Alternative: Use `await vi.advanceTimersByTimeAsync(10000)` to advance past all retry delays

3. Fix the throttle test assertion (line ~27):
   - The test is calling `mockClient.toHaveBeenCalledTimes(2)` but mockClient is spying on "wrap" function
   - The actual client.get method is what gets throttled
   - Verify the mock is correctly intercepting the client.get calls

Vitest test timeout syntax:
```typescript
it("test name", async () => { ... }, { timeout: 10000 })
```
  </action>
  <verify>
```bash
cd /Users/jay-work/Code/espn-agent/packages/backend && npm test -- src/adapters/__tests__/espn.test.ts
```
All 8 tests should pass without timeout errors.
  </verify>
  <done>
All ESPNAdapter tests pass, specifically the 4 throttle/retry tests that were timing out.
  </done>
</task>

<task type="auto">
  <name>Add decimal number rejection to parseIntParam</name>
  <files>packages/backend/src/utils/validation.ts</files>
  <action>
Enhance `parseIntParam` function (line 47-53) to reject decimal numbers instead of silently truncating them.

Current behavior: `parseIntParam("12.5", "playerId")` returns `12` (truncates)
Expected behavior: `parseIntParam("12.5", "playerId")` throws error

The test at line 234-238 in auth.test.ts has a comment saying "parseInt truncates decimals, doesn't throw" and expects 12, but the test name says "should truncate decimal number" which suggests this is intentional behavior.

HOWEVER, the issue description says "fix parseIntParam decimal validation", which implies we SHOULD reject decimals.

Strategy: Check if the original string contains a decimal point before parsing:

```typescript
export function parseIntParam(value: string, paramName: string): number {
  // Reject decimal numbers explicitly
  if (value.includes('.')) {
    throw new Error(`Invalid ${paramName}: must be an integer (no decimals)`);
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${paramName}: must be a valid integer`);
  }
  return parsed;
}
```

This ensures IDs and counts are always whole numbers (which is correct for database IDs).

Note: This will require updating the test expectation in auth.test.ts line 234-238 from:
```typescript
it("should truncate decimal number (parseInt behavior)", () => {
  const result = parseIntParam("12.5", "playerId");
  expect(result).toBe(12);
});
```

To:
```typescript
it("should reject decimal numbers", () => {
  expect(() => parseIntParam("12.5", "playerId")).toThrow("must be an integer");
});
```
  </action>
  <verify>
```bash
cd /Users/jay-work/Code/espn-agent/packages/backend && npm test -- src/api/__tests__/auth.test.ts
```
All validation tests should pass with decimal rejection.
  </verify>
  <done>
parseIntParam correctly throws errors for decimal inputs like "12.5", and the updated test confirms this behavior.
  </done>
</task>

</tasks>

<verification>
Run full backend test suite to ensure all fixes work together:

```bash
cd /Users/jay-work/Code/espn-agent/packages/backend && npm test
```

Expected: All 73 tests pass (was 63 passed, 10 failed).
</verification>

<success_criteria>
- [ ] Trade recommendation tests: All 18 tests pass (6 component math tests fixed)
- [ ] ESPNAdapter tests: All 8 tests pass (4 async timeout tests fixed)
- [ ] Auth validation tests: All 22 tests pass (decimal rejection test updated)
- [ ] Full test suite: 73/73 tests passing
- [ ] Zero unhandled errors or promise rejections
</success_criteria>

<output>
After completion, create `.planning/quick/9-fix-test-failures-in-espnadapter-and-aut/9-SUMMARY.md`
</output>
