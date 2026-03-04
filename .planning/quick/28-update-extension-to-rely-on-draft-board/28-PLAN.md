---
phase: 28-update-extension-to-rely-on-draft-board
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/assets/pitcherlist-rankings.json
  - packages/extension/lib/api-client.ts
autonomous: true
requirements: [EXT-DRAFTBOARD-01]

must_haves:
  truths:
    - "Extension fetches player data from /api/draft/espn endpoint (same as draft board page)"
    - "Extension merges ESPN data with bundled PitcherList rankings (SP, RP, Hitter)"
    - "Extension falls back to VBD endpoints if draft board endpoint unavailable"
    - "Extension falls back to baseline-rankings.json as last resort"
  artifacts:
    - path: "packages/extension/assets/pitcherlist-rankings.json"
      provides: "Bundled PitcherList rankings for offline/fast merging"
      contains: "PITCHER_RANKINGS"
    - path: "packages/extension/lib/api-client.ts"
      provides: "getDraftBoardData function and updated getRankings/getAuctionValues"
      exports: ["getDraftBoardData", "getRankings", "getAuctionValues"]
  key_links:
    - from: "packages/extension/lib/api-client.ts"
      to: "/api/draft/espn"
      via: "fetch in getDraftBoardData"
      pattern: "api/draft/espn"
    - from: "packages/extension/lib/api-client.ts"
      to: "packages/extension/assets/pitcherlist-rankings.json"
      via: "import for PitcherList merge"
      pattern: "pitcherlist-rankings"
---

<objective>
Update the Chrome extension to fetch draft data from the /api/draft/espn endpoint (same data source as the admin draft board page) and merge with PitcherList rankings, instead of relying on the VBD /api/draft/rankings and /api/draft/auction endpoints.

Purpose: The draft board page shows better data by combining ESPN global ADP/auction values with curated PitcherList tier rankings. The extension should use this same data source for consistency and because the VBD endpoints require league config that may not be available.

Output: Updated api-client.ts with getDraftBoardData() and bundled PitcherList rankings JSON.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/lib/api-client.ts
@packages/frontend/src/app/admin/draft-board/rankings-data.ts
@packages/frontend/src/app/admin/draft-board/page.tsx (lines 92-260: normalizeName + matchPlayers functions)
@packages/backend/src/api/draft.ts (lines 1025-1075: GET /api/draft/espn endpoint)
@packages/extension/assets/baseline-rankings.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create bundled PitcherList rankings JSON and getDraftBoardData function</name>
  <files>packages/extension/assets/pitcherlist-rankings.json, packages/extension/lib/api-client.ts</files>
  <action>
1. **Create `packages/extension/assets/pitcherlist-rankings.json`**: Export the three PitcherList ranking arrays from `packages/frontend/src/app/admin/draft-board/rankings-data.ts` as a single JSON file:
   ```json
   {
     "pitchers": [ { "rank": 1, "playerName": "Garrett Crochet", "tier": 1, "tierName": "STUD" }, ... ],
     "hitters": [ ... ],
     "relievers": [ ... ]
   }
   ```
   Include all fields from ExternalRanking (rank, playerName, tier, tierName, handedness, team). Copy data from PITCHER_RANKINGS (441 entries ending at line 441), HITTER_RANKINGS (starting line 442, ~152 entries), RELIEVER_RANKINGS (starting line 595, ~300 entries).

2. **Add getDraftBoardData() to `packages/extension/lib/api-client.ts`**:

   - Import the pitcherlist-rankings.json at the top alongside baseline-rankings.json:
     ```typescript
     import pitcherlistRankings from "../assets/pitcherlist-rankings.json";
     ```

   - Define ESPNPlayer interface (matches the draft board page's type):
     ```typescript
     interface ESPNDraftPlayer {
       playerId: number;
       playerName: string;
       positions: string[];
       mlbTeam: string;
       espnAuctionValue: number;
       rotoAuctionValue: number;
       averageDraftPosition: number;
       averageAuctionValue: number;
       percentOwned: number;
       rank: number;
     }
     ```

   - Define the PitcherList ranking type:
     ```typescript
     interface PitcherListRanking {
       rank: number;
       playerName: string;
       tier: number;
       tierName: string;
       handedness: string;
       team: string;
     }
     ```

   - Add a `normalizeName` function (reuse the same logic from the draft board page):
     ```typescript
     function normalizeName(name: string): string {
       return name
         .normalize("NFD")
         .replace(/[\u0300-\u036f]/g, "")
         .replace(/[^a-zA-Z\s]/g, "")
         .toLowerCase()
         .trim();
     }
     ```
     NOTE: The existing `normalizeText` in the file uses NFKD and preserves digits. The draft board's `normalizeName` uses NFD and strips everything except letters+spaces. Use NFD to match the draft board's behavior for PitcherList matching. Keep `normalizeText` for its existing usages (league name matching).

   - Create `getDraftBoardData()`:
     ```typescript
     export async function getDraftBoardData(): Promise<{
       rankings: PlayerRanking[];
       auctionValues: AuctionValue[];
     } | null>
     ```
     Implementation:
     a. Get backendUrl from chrome.storage.local
     b. Fetch from `${backendUrl}/api/draft/espn?limit=500` with REQUEST_TIMEOUT_MS timeout
     c. Parse response as `{ players: ESPNDraftPlayer[], meta: {...} }`
     d. If fetch fails or returns empty, return null
     e. Build PitcherList lookup maps (same approach as draft board page matchPlayers):
        - pitcherMap: Map<normalizedName, PitcherListRanking> from pitcherlistRankings.pitchers
        - hitterMap: Map<normalizedName, PitcherListRanking> from pitcherlistRankings.hitters
        - relieverMap: Map<normalizedName, PitcherListRanking> from pitcherlistRankings.relievers
     f. For each ESPN player, match against maps (exact first, then lastName fallback - same logic as draft board):
        - Map to PlayerRanking: { playerId, playerName, positions, primaryPosition: positions[0] || "UT", vbdScore: espnAuctionValue (use as proxy score), tier: matched PitcherList tier or 99 for unranked, projectedStats: {} }
        - Map to AuctionValue: { playerId, playerName, dollarValue: espnAuctionValue, vbdScore: espnAuctionValue, positions }
     g. Return { rankings, auctionValues }
     h. Wrap in dedupedRequest with key "draftBoardData"

3. **Update `getRankings()`**: At the start of the dedupedRequest callback (before the existing try block):
   - Try getDraftBoardData() first
   - If it returns non-null and rankings.length > 0, return the rankings
   - If it fails/returns null, fall through to existing VBD endpoint logic
   - Keep existing baseline-rankings.json fallback as last resort
   - Log: "[API Client] Using draft board data for rankings" on success, "[API Client] Draft board data unavailable, falling back to VBD" on fallback

4. **Update `getAuctionValues()`**: Same pattern:
   - Try getDraftBoardData() first
   - If it returns non-null and auctionValues.length > 0, return the auctionValues
   - If it fails/returns null, fall through to existing VBD endpoint logic
   - Keep existing generateBaselineAuctionValues() is NOT called here (current code returns []), so no change to fallback behavior
   - Log similarly

  </action>
  <verify>
    - `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/extension/tsconfig.json` passes (no type errors)
    - `cat packages/extension/assets/pitcherlist-rankings.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('SP:', d.pitchers.length, 'Hitters:', d.hitters.length, 'RP:', d.relievers.length)"` shows expected counts (~441 SP, ~152 Hitters, ~300 RP)
    - Grep confirms getDraftBoardData is exported and called in getRankings and getAuctionValues
  </verify>
  <done>
    - pitcherlist-rankings.json exists with all three ranking arrays (SP/Hitter/RP)
    - getDraftBoardData() fetches from /api/draft/espn and merges with PitcherList data
    - getRankings() tries draft board data first, falls back to VBD endpoint, then baseline JSON
    - getAuctionValues() tries draft board data first, falls back to VBD endpoint
    - No TypeScript errors
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation passes for extension package
- pitcherlist-rankings.json contains all three ranking lists with correct structure
- getRankings and getAuctionValues both call getDraftBoardData as first data source
- Fallback chain: draft board -> VBD endpoints -> baseline JSON (rankings) / empty (auction)
</verification>

<success_criteria>
- Extension fetches from /api/draft/espn (same as draft board page) as primary data source
- PitcherList rankings bundled and merged with ESPN data using name normalization
- Graceful fallback to existing VBD endpoints when draft board endpoint unavailable
- Baseline rankings JSON preserved as last-resort fallback
</success_criteria>

<output>
After completion, create `.planning/quick/28-update-extension-to-rely-on-draft-board/28-SUMMARY.md`
</output>
