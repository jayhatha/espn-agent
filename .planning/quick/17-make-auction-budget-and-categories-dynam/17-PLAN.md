---
phase: quick-17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/draft-config-detector.ts
  - packages/extension/entrypoints/content.tsx
  - packages/extension/lib/draft-state.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Extension detects auction budget from ESPN draft page DOM"
    - "Detected budget (or 260 fallback) is used to initialize draft state"
    - "Budget pacing calculations use actual detected budget instead of hardcoded 260"
  artifacts:
    - path: "packages/extension/lib/draft-config-detector.ts"
      provides: "Budget detection from ESPN DOM"
      exports: ["detectAuctionBudget"]
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Uses detected budget when initializing draft"
      contains: "budget: cachedLeagueConfig?.budget"
    - path: "packages/extension/lib/draft-state.ts"
      provides: "Draft state accepts dynamic budget"
      contains: "budget || 260"
  key_links:
    - from: "packages/extension/lib/draft-config-detector.ts"
      to: "packages/extension/entrypoints/content.tsx"
      via: "DetectionResult.config.budget"
      pattern: "cachedLeagueConfig\\.budget"
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/draft-state.ts"
      via: "initializeDraft({ budget })"
      pattern: "initializeDraft.*budget:"
---

<objective>
Make auction budget and categories dynamic in the Chrome extension by detecting them from ESPN's draft page DOM instead of using hardcoded values.

Purpose: Support leagues with non-standard auction budgets (e.g., $200, $300) and custom scoring categories, providing accurate value calculations for any league configuration.

Output: Extension that auto-detects auction budget and categories from ESPN DOM, falling back to standard 5x5 / $260 defaults on detection failure.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@packages/extension/lib/draft-config-detector.ts
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/draft-state.ts
@packages/extension/lib/value-calculations.ts
@packages/shared/src/types.ts
</context>

<tasks>

<task type="auto">
  <name>Add auction budget detection to draft-config-detector.ts</name>
  <files>packages/extension/lib/draft-config-detector.ts</files>
  <action>
Add `detectAuctionBudget()` function with multiple DOM detection strategies:

**Strategy 1:** Look for budget display in draft settings panel (selectors: `[class*="budget"]`, `[class*="auction"][class*="settings"]`, `.draft-settings`)
- Pattern: "Budget: $260" or "$260 Budget" or "260" near "budget" text
- Extract number, validate range 100-500

**Strategy 2:** Parse from roster display showing remaining budget (e.g., "$243 remaining of $260")
- Pattern: `(\d+)\s*(remaining|left).*of.*\$?(\d+)` or `\$?(\d+)\s*/\s*\$?(\d+)`
- Extract total budget (second number)

**Strategy 3:** URL parameter (some ESPN drafts include `?budget=260`)

**Strategy 4:** Default to 260 if all strategies fail

Update `DetectionResult` interface to include `budget?: number`.

Update `detectLeagueConfig()` to call `detectAuctionBudget()` and include budget in returned config object.

Add budget to default config object (line 216) with value 260.

Log detected budget with confidence level: `console.log('[ESPN Draft Assistant] Auction budget detected: $260')` or warning for fallback.
  </action>
  <verify>
Read modified file and confirm:
- `detectAuctionBudget()` function exists with 4 strategies
- `detectLeagueConfig()` calls budget detection and includes in config
- Default config includes `budget: 260`
  </verify>
  <done>Budget detection integrated into config detector with multi-strategy fallback</done>
</task>

<task type="auto">
  <name>Use detected budget in content script initialization</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
Replace hardcoded budget values with detected budget from cachedLeagueConfig:

**Line 237:** Change `budget: 260` to `budget: cachedLeagueConfig?.budget || 260`

**Line 353:** Change `budget: 260` to `budget: cachedLeagueConfig?.budget || 260`

**Line 589:** Change `budget: latestState.remainingBudget || 260` to `budget: latestState.remainingBudget || cachedLeagueConfig?.budget || 260`

Update default config object (lines 188-215) to include `budget: 260` after categories array.

Verify `cachedLeagueConfig` is populated before `state.initializeDraft()` calls (it is — config detection happens at line 172, init at line 231).

No changes to API calls needed — budget is already passed through state and used in value-calculations.ts.
  </action>
  <verify>
grep -n "budget:" packages/extension/entrypoints/content.tsx

Confirm all 4 instances use detected budget with 260 fallback (3 in initializeDraft calls, 1 in default config).
  </verify>
  <done>Content script uses detected auction budget from config with 260 fallback across all initialization points</done>
</task>

<task type="auto">
  <name>Update draft state comments to reflect dynamic budget</name>
  <files>packages/extension/lib/draft-state.ts</files>
  <action>
Update comments to clarify budget is now dynamic:

**Line 41:** Change comment from `remainingBudget: number; // Auction only` to `remainingBudget: number; // Auction only (detected from ESPN or default 260)`

**Line 78:** Change comment from `budget?: number;` to `budget?: number; // Detected from ESPN DOM (default: 260)`

**Line 110:** Change `remainingBudget: 260,` comment to include "default value, overridden by config"

**Line 131:** Change `remainingBudget: config.budget || 260,` comment to clarify fallback behavior

No logic changes needed — budget parameter already flows through correctly via `initializeDraft({ budget })`.
  </action>
  <verify>
grep -A 1 "remainingBudget" packages/extension/lib/draft-state.ts

Confirm comments clarify budget is detected dynamically with 260 fallback.
  </verify>
  <done>Draft state documentation updated to reflect dynamic budget detection</done>
</task>

</tasks>

<verification>
**Budget Detection:**
```bash
# Verify detectAuctionBudget function exists
grep -n "function detectAuctionBudget" packages/extension/lib/draft-config-detector.ts

# Verify budget included in DetectionResult
grep -n "budget" packages/extension/lib/draft-config-detector.ts | head -20
```

**Content Script Integration:**
```bash
# Verify all budget references use detected value
grep -n "budget:" packages/extension/entrypoints/content.tsx

# Should show 4 instances, all with fallback pattern
```

**Build Test:**
```bash
cd packages/extension && pnpm run build
```

**Manual Test (if ESP draft page available):**
1. Open ESPN auction draft page
2. Check console for "Auction budget detected: $XXX"
3. Verify sidebar shows correct budget in pacing tracker
4. Verify budget pacing calculations use detected value
</verification>

<success_criteria>
1. `detectAuctionBudget()` function exists with 4 DOM detection strategies
2. Detected budget flows through DetectionResult config object
3. All `initializeDraft()` calls use `cachedLeagueConfig?.budget || 260`
4. Default config object includes `budget: 260`
5. Extension build completes without errors
6. Categories already detected and used correctly (no changes needed for categories — they're already dynamic via cachedLeagueConfig)
</success_criteria>

<output>
After completion, create `.planning/quick/17-make-auction-budget-and-categories-dynam/17-SUMMARY.md`
</output>
