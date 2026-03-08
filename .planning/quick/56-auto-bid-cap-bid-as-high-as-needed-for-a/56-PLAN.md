---
phase: 56-auto-bid-cap
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/auto-bid-controller.ts
autonomous: true
requirements: [AUTO-BID-CAP-01]

must_haves:
  truths:
    - "Auto-bid fires for anchor players regardless of engine maxBid, up to 10% over ESPN ASV"
    - "If ESPN ASV is available, autoBidCap = ceil(espnAsv * 1.10)"
    - "If ESPN ASV is not available, autoBidCap falls back to engine maxBid"
    - "shouldBid=false still prevents any auto-bidding"
    - "Log message shows which cap source was used (ESPN ASV or engine maxBid)"
  artifacts:
    - path: "packages/extension/lib/auto-bid-controller.ts"
      provides: "Updated evaluateAndBid() with ESPN ASV-based cap"
      contains: "espnDomAuctionValues"
  key_links:
    - from: "AutoBidController.evaluateAndBid()"
      to: "state.espnDomAuctionValues"
      via: "useDraftStore.getState()"
      pattern: "espnDomAuctionValues\\[playerId\\]"
---

<objective>
Replace the engine `maxBid` cap in `AutoBidController.evaluateAndBid()` with a cap derived from ESPN's market value (ASV) — specifically `Math.ceil(espnAsv * 1.10)`. This lets the auto-bidder compete at full aggression for anchor players while preventing overpaying beyond 10% above market.

Purpose: Anchor players must be won at draft; the engine's SGP-based maxBid is too conservative as a bid cap. ESPN ASV is the correct market reference.
Output: Updated `auto-bid-controller.ts` with ESPN ASV-based cap logic.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@packages/extension/lib/auto-bid-controller.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace maxBid cap with ESPN ASV-based cap in AutoBidController</name>
  <files>packages/extension/lib/auto-bid-controller.ts</files>
  <action>
In `evaluateAndBid()`, after extracting `{ shouldBid, maxBid }` from `this.lastEngineSignals.optimization`:

1. Get the current player ID from `currentAuctionPlayer.playerId`.

2. Look up ESPN ASV with two-source fallback:
   ```ts
   const playerId = currentAuctionPlayer.playerId;
   const espnAsv =
     state.espnDomAuctionValues?.[playerId] ??
     state.auctionValues?.find((p) => p.playerId === playerId)?.espnAuctionValue ??
     null;
   ```

3. Compute the cap and its source label:
   ```ts
   const autoBidCap = espnAsv != null ? Math.ceil(espnAsv * 1.10) : maxBid;
   const capSource = espnAsv != null ? `ESPN ASV $${espnAsv} +10%` : `engine maxBid`;
   ```

4. Replace the existing price-cap guard (which uses `maxBid`) with `autoBidCap`:
   ```ts
   if (currentBid >= autoBidCap) {
     console.log(
       `[AutoBidController] Price $${currentBid} reached cap $${autoBidCap} (${capSource}) — stopping`
     );
     return;
   }
   ```

5. Update the success log line to include the cap and its source:
   ```ts
   console.log(
     `[AutoBidController] Auto-bidding +1 at $${currentBid} (cap: $${autoBidCap} via ${capSource})`
   );
   ```

Do NOT remove the `shouldBid` guard — it must remain before the cap check. The `maxBid` variable is still needed for the fallback; keep destructuring it from `optimization`.

`currentAuctionPlayer.playerId` may be `number | undefined` depending on the store type — add a null guard if needed (return early if `playerId == null`).
  </action>
  <verify>
TypeScript compiles without errors: `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension tsc --noEmit`
  </verify>
  <done>
`evaluateAndBid()` uses `Math.ceil(espnAsv * 1.10)` as the bid cap when ESPN ASV is available, falls back to `maxBid` when not, and the log line identifies the cap source. `tsc --noEmit` passes.
  </done>
</task>

</tasks>

<verification>
Run `pnpm --filter extension tsc --noEmit` from the repo root — must produce no type errors.
</verification>

<success_criteria>
- Auto-bid cap is `ceil(espnAsv * 1.10)` when ESPN ASV is available for the nominated player
- Falls back to engine `maxBid` when ESPN ASV is absent
- `shouldBid=false` still short-circuits before any cap check
- Log message shows `cap: $N via ESPN ASV $X +10%` or `cap: $N via engine maxBid`
- TypeScript build passes
</success_criteria>

<output>
After completion, create `.planning/quick/56-auto-bid-cap-bid-as-high-as-needed-for-a/56-01-SUMMARY.md`
</output>
