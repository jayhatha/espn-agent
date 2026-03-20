---
phase: 95-wire-shouldbid-from-monte-carlo-into-aut
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [SHOULDBID-GATE]

must_haves:
  truths:
    - "Auto-bid controller stops bidding when Monte Carlo shouldBid is explicitly false"
    - "Auto-bid controller continues bidding normally when shouldBid is true or not yet available"
    - "Log messages clearly indicate when shouldBid=false causes a pass"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "shouldBid gate in evaluateAndBid"
      contains: "shouldBid"
  key_links:
    - from: "packages/extension/lib/auto-bid-controller.ts"
      to: "this.lastEngineSignals.optimization.shouldBid"
      via: "property access in evaluateAndBid"
      pattern: "shouldBid.*false"
---

<objective>
Wire the Monte Carlo simulation's shouldBid signal into the auto-bid controller so it respects the simulation-based EV decision, not just the price cap.

Purpose: Currently the controller only checks currentBid < autoBidCap. The bid optimizer worker computes shouldBid (bidEV > passEV) but the controller ignores it. When shouldBid is false, the simulation says passing has higher expected value than bidding -- the controller should respect that.

Output: Updated evaluateAndBid() method that gates on shouldBid.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/auto-bid-controller.ts
@packages/extension/lib/use-draft-engine.ts
@packages/extension/lib/engine/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add shouldBid gate to evaluateAndBid</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
In the evaluateAndBid() method, add a shouldBid check AFTER the autoBidCap is computed (after line 1253 where capSource is set) and BEFORE the price-vs-cap comparison (line 1263).

The logic:
1. Read shouldBid from `this.lastEngineSignals?.optimization?.shouldBid`
2. If shouldBid is explicitly `false` (not null, not undefined -- the worker has returned and says don't bid):
   - Log: `[AutoBidController] Monte Carlo shouldBid=false (passEV > bidEV) -- passing on ${nominatedName} at $${currentBid}`
   - Also log the simulationEV and simulationStdDev if available from `this.lastEngineSignals?.optimization` for debugging
   - Return (skip bidding)
3. If shouldBid is `true`, `null`, or `undefined`: continue with existing price-vs-cap logic unchanged. This means the controller bids normally while waiting for the async worker result, and only stops if the worker explicitly says no.

Do NOT change any other behavior. The existing price cap check remains as a hard ceiling regardless of shouldBid. The shouldBid gate is an additional filter that can cause a pass even when the price is under cap.

Place this check after the GS cap awareness log (after line 1260) and before the `if (currentBid >= autoBidCap)` check on line 1263. This ordering means:
- Strategy caps are computed (needed for logging context)
- shouldBid is checked (may cause early return)
- Price vs cap is checked (hard ceiling still enforced if shouldBid didn't trigger)
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` to verify no type errors.

Grep for `shouldBid` in auto-bid-controller.ts to confirm the new check exists. Verify the check uses `=== false` (strict equality, not falsy check) so null/undefined fall through to normal bidding.
  </verify>
  <done>
evaluateAndBid() has a shouldBid gate that:
- Passes (skips bid) when shouldBid === false with descriptive log
- Falls through to normal cap-based bidding when shouldBid is true/null/undefined
- Does not affect any other controller behavior
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation succeeds with no errors
- `shouldBid === false` check exists in evaluateAndBid between cap computation and price comparison
- Log message includes player name, current bid, and simulation EV values
- No other methods or behavior in the controller are modified
</verification>

<success_criteria>
The auto-bid controller respects Monte Carlo shouldBid=false by passing on players where simulation EV says passing is better, while continuing to bid normally when the signal hasn't arrived yet or says to bid.
</success_criteria>

<output>
After completion, create `.planning/quick/95-wire-shouldbid-from-monte-carlo-into-aut/95-SUMMARY.md`
</output>
