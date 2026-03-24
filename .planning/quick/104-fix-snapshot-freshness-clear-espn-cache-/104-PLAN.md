---
phase: quick-104
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/adapters/espn.ts
  - packages/backend/src/agents/snapshot-orchestrator.ts
autonomous: true
requirements: [QUICK-104]
must_haves:
  truths:
    - "Manual snapshot with forceFresh bypasses ESPN adapter in-memory cache"
    - "Automated/scheduled snapshots still benefit from cache (no regression)"
    - "Cache clearing is logged so stale-data debugging is visible"
  artifacts:
    - path: "packages/backend/src/adapters/espn.ts"
      provides: "clearCache() public method on ESPNAdapter"
      contains: "clearCache"
    - path: "packages/backend/src/agents/snapshot-orchestrator.ts"
      provides: "Cache clearing before ESPN fetch when forceFresh is true"
      contains: "clearCache"
  key_links:
    - from: "packages/backend/src/agents/snapshot-orchestrator.ts"
      to: "packages/backend/src/adapters/espn.ts"
      via: "this.espnAdapter.clearCache() call before fetchLeague"
      pattern: "espnAdapter\\.clearCache"
---

<objective>
Fix stale ESPN data on manual snapshot refresh by clearing the ESPN adapter's in-memory cache when `forceFresh` is true.

Purpose: When a user triggers "Refresh Snapshot" from the dashboard, the orchestrator correctly skips the DB dedup check but the ESPN adapter's 5-minute LRU cache may still serve stale data from a prior fetch. This means roster moves, FAAB spend, and standings changes don't appear until the cache expires naturally.

Output: Two file modifications that ensure forceFresh snapshots always hit ESPN's API directly.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/backend/src/adapters/espn.ts
@packages/backend/src/agents/snapshot-orchestrator.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add clearCache method to ESPNAdapter and wire into forceFresh snapshot</name>
  <files>
    packages/backend/src/adapters/espn.ts
    packages/backend/src/agents/snapshot-orchestrator.ts
  </files>
  <action>
**In `packages/backend/src/adapters/espn.ts`:**

Add a public `clearCache()` method to the `ESPNAdapter` class. Place it after the constructor (around line 305), before the `fetchFinalScoringPeriod` method.

```typescript
/**
 * Clear the in-memory response cache.
 * Called by SnapshotOrchestratorAgent when forceFresh is true
 * to ensure manual snapshots always hit ESPN's API directly.
 */
clearCache(): void {
  const size = this.cache.size;
  this.cache.clear();
  this.logger?.info({ entriesCleared: size }, "ESPN adapter cache cleared");
}
```

The `LRUCache` from the `lru-cache` package already has a `.clear()` method, so this is just a public wrapper with logging.

**In `packages/backend/src/agents/snapshot-orchestrator.ts`:**

In the `executeSnapshot` method, after the `forceFresh` dedup skip block (after line 82) and before the ESPN fetch (line 104), add cache clearing when `forceFresh` is true AND we are not using prefetched data:

```typescript
// Clear ESPN adapter cache when forceFresh to ensure we get live data
if (forceFresh && !prefetchedData) {
  this.espnAdapter.clearCache();
}
```

Place this right before the comment `// 2. Fetch ESPN data (with error boundary)` (line 104). This ensures:
- Manual "Refresh" from UI (forceFresh=true, no prefetchedData) clears cache before fetch
- Backfill runs (prefetchedData provided) skip cache clearing since they already have data
- Scheduled snapshots (forceFresh=false) continue to benefit from cache
  </action>
  <verify>
1. `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/backend/tsconfig.json` compiles without errors
2. Grep confirms clearCache exists: `grep -n "clearCache" packages/backend/src/adapters/espn.ts packages/backend/src/agents/snapshot-orchestrator.ts`
3. Verify the method is public (no `private` keyword) and uses `this.cache.clear()`
  </verify>
  <done>
ESPNAdapter has a public clearCache() method that clears the LRU cache and logs the count of cleared entries. SnapshotOrchestratorAgent calls clearCache() before fetching ESPN data when forceFresh is true and no prefetched data is provided. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation passes for backend package
2. `clearCache` method exists on ESPNAdapter class
3. `clearCache` is called in snapshot-orchestrator.ts only when `forceFresh && !prefetchedData`
4. No changes to scheduled/automated snapshot behavior (forceFresh defaults to undefined/false)
</verification>

<success_criteria>
- Manual snapshot refresh (POST /api/leagues/:id/snapshot) clears ESPN cache before fetching, guaranteeing fresh roster/FAAB/standings data
- Scheduled and initial snapshots continue to use cache normally
- No TypeScript compilation errors
</success_criteria>

<output>
After completion, create `.planning/quick/104-fix-snapshot-freshness-clear-espn-cache-/104-SUMMARY.md`
</output>
