---
phase: quick-57
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/engine/index.ts
autonomous: true
requirements: []
---

<objective>
Fix nameToAsv map not populating when auctionValues is empty (practice drafts). Currently nameToAsv only iterates auctionValues to join playerId→name with espnDomAuctionValues. In practice drafts, auctionValues is empty so ESPN ASV is never used for expected market price. Fix by also iterating rankings and allPicks to build a comprehensive playerId→name mapping.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Build nameToAsv from all available playerId sources</name>
  <files>
    packages/extension/lib/engine/index.ts
  </files>
  <action>
    **Problem:** Lines 257-265 and 508-516 both build nameToAsv by iterating only `input.auctionValues`. In practice drafts (no backend), auctionValues is empty, so nameToAsv is always empty even though espnDomAuctionValues has real data.

    **Fix both nameToAsv blocks** (lines 257-265 and 508-516) to build a playerId→name index from ALL available sources:

    Replace the nameToAsv block (lines 254-265) with:
    ```typescript
    // Build normalizedName → ASV lookup for market price override.
    // When ESPN ASV is available, use it directly as expected market price
    // instead of the SGP-based estimateMarketPrice() computation.
    // Build playerId→normalizedName from all sources (auctionValues may be empty in practice drafts).
    const nameToAsv = new Map<string, number>();
    if (input.espnDomAuctionValues && Object.keys(input.espnDomAuctionValues).length > 0) {
      const idToName = new Map<number, string>();
      for (const av of input.auctionValues) {
        idToName.set(av.playerId, normalizeName(av.playerName));
      }
      for (const r of input.rankings) {
        if (!idToName.has(r.playerId)) {
          idToName.set(r.playerId, normalizeName(r.playerName));
        }
      }
      for (const pick of input.allPicks) {
        if (!idToName.has(pick.playerId)) {
          idToName.set(pick.playerId, normalizeName(pick.playerName));
        }
      }
      for (const [id, asv] of Object.entries(input.espnDomAuctionValues)) {
        if (asv > 0) {
          const name = idToName.get(Number(id));
          if (name) {
            nameToAsv.set(name, asv);
          }
        }
      }
    }
    ```

    Apply the same fix to the `nameToAsvIdeal` block (lines 508-516) — replace with the same logic but using `nameToAsvIdeal` as the variable name.

    This ensures ESPN ASV is used for market price even when auctionValues is empty (practice drafts use rankings from bundled data + allPicks from DOM detection).
  </action>
  <verify>
    Run `npx tsc --noEmit -p packages/extension/tsconfig.json` — passes. Verify `grep -c "input.rankings" packages/extension/lib/engine/index.ts` shows the new sources being used.
  </verify>
  <done>nameToAsv and nameToAsvIdeal both use rankings, allPicks, and auctionValues as playerId→name sources, ensuring ESPN ASV works in practice drafts.</done>
</task>

</tasks>
