---
phase: 94-simplify-nomination-overpriced-first
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
  - packages/extension/entrypoints/content.tsx
  - packages/extension/components/NominationDiagnostics.tsx
autonomous: true
requirements: [NOM-SIMPLIFY]

must_haves:
  truths:
    - "When it is our turn to nominate, the controller selects the most overpriced player (highest espn_price - model_value)"
    - "Queue population logic no longer runs — no Queue button clicks, no 15s interval"
    - "Nomination diagnostics no longer reference queue fields"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Overpriced-first nomination, no queue logic"
      contains: "nominationScore"
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "No populateQueue calls or interval"
    - path: "packages/extension/components/NominationDiagnostics.tsx"
      provides: "Clean diagnostics without queue fields"
  key_links:
    - from: "auto-bid-controller.ts evaluateAndNominate()"
      to: "state.auctionValues + state.rankings"
      via: "nomination_score = espnPrice - modelValue"
      pattern: "nominationScore.*espnPrice.*modelValue"
---

<objective>
Simplify nomination strategy to nominate the most overpriced player (espn_price - model_value) on our turn. Remove all queue population logic entirely.

Purpose: The queue system adds complexity without clear benefit. The spec says: nominate overpriced players to force league overspending. Simple is better.
Output: Cleaner auto-bid-controller with single-strategy nomination, no queue code.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
@packages/extension/entrypoints/content.tsx
@packages/extension/components/NominationDiagnostics.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace nomination candidate selection with overpriced-first logic and remove populateQueue call</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
  In `auto-bid-controller.ts`, make these changes:

  1. **Remove `this.populateQueue()` call at line 246** in `updateSignals()`. Keep the `this.evaluateAndNominate()` call. The else branch with `evaluateAndBid()` stays unchanged.

  2. **Rewrite candidate selection in `evaluateAndNominate()`** — replace everything from line 873 ("Queue-first candidate selection") through line 963 (the "no candidates available" return) with overpriced-first logic:

     ```typescript
     // ── Overpriced-first candidate selection ──
     const draftedIds = new Set(state.allPicks.map(p => p.playerId));
     const candidates = state.auctionValues
       .filter(av => !draftedIds.has(av.playerId) && av.dollarValue > 0)
       .map(av => {
         const ranking = state.rankings.find(r => r.playerId === av.playerId);
         const modelValue = ranking?.vbdScore ?? av.dollarValue;
         const espnPrice = av.dollarValue;
         return { ...av, nominationScore: espnPrice - modelValue, modelValue };
       })
       .sort((a, b) => b.nominationScore - a.nominationScore);

     const topCandidate = candidates[0];
     if (!topCandidate) {
       this.lastAttemptResult = "no candidates available";
       logger.log("[AutoNominate] No nomination candidates available — skipping");
       return;
     }

     const candidateName = topCandidate.playerName;
     const candidateReason = `overpriced: ESPN $${topCandidate.dollarValue} vs model $${topCandidate.modelValue.toFixed(0)} (score=${topCandidate.nominationScore.toFixed(1)})`;
     this.lastCandidateName = candidateName;
     this.lastCandidateSource = "overpriced";

     logger.log(
       `[AutoNominate] Candidate source=overpriced: ${candidateName} (espnPrice=$${topCandidate.dollarValue}, modelValue=$${topCandidate.modelValue.toFixed(1)}, nominationScore=${topCandidate.nominationScore.toFixed(1)})`,
     );
     ```

     Keep the existing name-to-ESPN-ID mapping code below (lines 965-1017) that does `normalizeName`, `matchedRanking` lookup, `findActionButton`, and `searchAndNominate` — those still apply. The variables `candidateName` and `candidateReason` feed directly into that existing code.

     **IMPORTANT:** The `playerId` from the overpriced candidate (`topCandidate.playerId`) is already the ESPN player ID. After setting `candidateName`, try `findActionButton(topCandidate.playerId)` directly FIRST before falling through to the name-based ranking lookup. This avoids unnecessary name normalization when we already have the ID:

     ```typescript
     // Try direct ID lookup first (we already have the ESPN playerId)
     const directButton = findActionButton(topCandidate.playerId);
     if (directButton && !directButton.disabled) {
       this.clickPlayerButton(directButton, candidateName, topCandidate.playerId, candidateReason);
       return;
     }
     ```

     Then fall through to the existing `normalizeName` -> `matchedRanking` -> `findActionButton` -> `searchAndNominate` path as fallback.

  3. **Update `lastCandidateSource` type** — change the type from `"simulation" | "idealRoster" | "queue" | null` to `"overpriced" | null` in both the instance field (line 102) and the `NominationDiagnostics` interface `lastCandidateSource` field (around line 40).

  4. **Remove `scrapeESPNNominationQueue` import** at line 4 — it is no longer used after removing queue logic from `evaluateAndNominate`.

  5. **Update the class docstring** (lines 55-77) — replace the "Nomination strategy" section to say:
     ```
     * Nomination strategy:
     * - Overpriced-first: nomination_score = espn_price - model_value, highest score wins
     * - Goal: force league overspending, increase inflation, preserve value in remaining pool
     ```
  </action>
  <verify>
  Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension exec tsc --noEmit` to verify no type errors. Grep for `populateQueue` in auto-bid-controller.ts — should only appear in the method definition (which Task 2 removes), NOT in `updateSignals()`. Grep for `scrapeESPNNominationQueue` — should not appear in auto-bid-controller.ts.
  </verify>
  <done>
  - `evaluateAndNominate()` selects the most overpriced player using `nomination_score = espn_price - model_value`
  - No queue-first candidate selection (no `scrapeESPNNominationQueue` call in nomination path)
  - No `this.populateQueue()` call in `updateSignals()`
  - `lastCandidateSource` type updated to `"overpriced" | null`
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove dead queue code from controller, content script, and diagnostics UI</name>
  <files>
    packages/extension/lib/auto-bid-controller.ts
    packages/extension/entrypoints/content.tsx
    packages/extension/components/NominationDiagnostics.tsx
  </files>
  <action>
  **In `auto-bid-controller.ts`:**

  1. **Delete the entire `populateQueue()` method** (lines 589-791) — the async method with all queue population logic.

  2. **Delete the `searchAndQueue()` method** (starts at line 1119) — only called by `populateQueue`.

  3. **Remove queue-related instance fields** (lines 94-97):
     - `private lastQueuePopulateTime: number | null = null;`
     - `private queuedPlayerIds: Set<number> = new Set();`
     - `private queueStrategy: "poison-pills" | "own-targets" | null = null;`

  4. **Remove queue-related static constants** (lines 121-123):
     - `TARGET_QUEUE_SIZE`
     - `QUEUE_POPULATE_COOLDOWN_MS`

  5. **Also remove `TARGET_ROSTER_SIZE`** (line 135) — only used by `populateQueue` for draft phase calculation.

  6. **Clean up `clearNominationState()`** (lines 289-292) — remove the three queue-related lines:
     ```
     this.lastQueuePopulateTime = null;
     this.queuedPlayerIds.clear();
     this.queueStrategy = null;
     ```

  7. **Clean up `getNominationDiagnostics()`** return object (lines 323-325) — remove:
     ```
     queuePopulationCount: this.queuedPlayerIds.size,
     lastQueuePopulateTime: this.lastQueuePopulateTime,
     queueStrategy: this.queueStrategy,
     ```

  8. **Clean up `NominationDiagnostics` interface** (lines 48-50) — remove:
     ```
     queuePopulationCount: number;
     lastQueuePopulateTime: number | null;
     queueStrategy: "poison-pills" | "own-targets" | null;
     ```

  **In `content.tsx`:**

  1. **Remove `populateQueue` from dev tools** (line 132): delete `populateQueue: () => autoBidController.populateQueue(),`

  2. **Remove queue population interval** — delete:
     - The `queuePopulateInterval` variable declaration (line 771)
     - The entire `startQueuePopulating` function (lines 819-831)
     - Both calls to `startQueuePopulating()` (lines 924 and 960)
     - The `clearInterval(queuePopulateInterval)` cleanup (lines 1055-1056)

  **In `NominationDiagnostics.tsx`:**

  1. **Remove the "Queue population" diagnostic row** (lines 146-159) — the div that displays `queuePopulationCount` and `lastQueuePopulateTime`.
  </action>
  <verify>
  Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension exec tsc --noEmit` — no type errors.
  Grep for `populateQueue|queuedPlayerIds|queueStrategy|lastQueuePopulateTime|TARGET_QUEUE_SIZE|QUEUE_POPULATE_COOLDOWN|searchAndQueue|queuePopulateInterval|startQueuePopulating|queuePopulationCount` across all three files — zero matches.
  </verify>
  <done>
  - `populateQueue()` method deleted from auto-bid-controller
  - `searchAndQueue()` method deleted from auto-bid-controller
  - All queue-related fields, constants, and diagnostic properties removed
  - content.tsx no longer has queue population interval or dev tool binding
  - NominationDiagnostics.tsx no longer displays queue info
  - TypeScript compiles clean
  </done>
</task>

</tasks>

<verification>
1. `pnpm --filter extension exec tsc --noEmit` passes
2. No references to `populateQueue`, `queuedPlayerIds`, `queueStrategy`, `searchAndQueue`, `queuePopulateInterval`, or `scrapeESPNNominationQueue` remain in auto-bid-controller.ts
3. No references to queue interval in content.tsx
4. `evaluateAndNominate` contains `nominationScore` calculation
5. `lastCandidateSource` type is `"overpriced" | null`
</verification>

<success_criteria>
- Nomination strategy uses overpriced-first: nomination_score = espn_price - model_value, highest wins
- All queue population code removed (methods, fields, constants, intervals, UI)
- TypeScript compiles without errors
- Existing nomination infrastructure intact (turn detection, cooldowns, button clicking, search fallback)
</success_criteria>

<output>
After completion, create `.planning/quick/94-simplify-nomination-overpriced-first-on-/94-SUMMARY.md`
</output>
