---
phase: quick-26
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/admin/auction-validation/page.tsx
  - packages/frontend/src/lib/api.ts
autonomous: true
requirements: [QUICK-26]

must_haves:
  truths:
    - "Auction validation form submits without requiring League ID, SWID, or S2"
    - "BB appears in batting categories section"
    - "K9, WPCT, and L appear in pitching categories section"
    - "API client validateAuctionValues no longer sends espnLeagueId, espnSwid, or espnS2"
  artifacts:
    - path: "packages/frontend/src/app/admin/auction-validation/page.tsx"
      provides: "Auction validation page with cleaned ESPN fields and extended categories"
    - path: "packages/frontend/src/lib/api.ts"
      provides: "validateAuctionValues with league-agnostic params interface"
  key_links:
    - from: "page.tsx handleSubmit"
      to: "api.validateAuctionValues"
      via: "params object"
      pattern: "api\\.validateAuctionValues\\(params\\)"
---

<objective>
Clean up the auction validation admin page and API client to match the league-agnostic backend endpoint. Remove three unused ESPN auth fields (League ID, SWID, S2) and add four missing scoring categories (BB, K9, WPCT, L).

Purpose: The backend `GET /api/draft/auction/validate` uses `fetchGlobalDraftData({ season })` which calls ESPN's `leaguedefaults` endpoint — no league ID or auth cookies are needed. The UI currently asks for them and validates their presence, which blocks form submission unnecessarily. Four categories supported by the backend are also missing from the category checkboxes.

Output: A cleaner validation form (ESPN Season only, no auth fields) and a complete category list including BB, K9, WPCT, and L.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove unused ESPN auth state and fields from auction validation page</name>
  <files>packages/frontend/src/app/admin/auction-validation/page.tsx</files>
  <action>
    Make the following targeted changes to the file:

    1. Remove state declarations (lines 113, 115, 116):
       - Remove: `const [espnLeagueId, setEspnLeagueId] = useState<string>("");`
       - Remove: `const [espnSwid, setEspnSwid] = useState<string>("");`
       - Remove: `const [espnS2, setEspnS2] = useState<string>("");`

    2. Remove espnLeagueId validation in handleSubmit (lines 159-162):
       - Remove the entire block: `if (!espnLeagueId || espnLeagueId.trim() === "") { throw new Error("ESPN League ID is required"); }`

    3. Remove espnLeagueId, espnSwid, espnS2 from the params object (lines 186-189):
       - Remove: `espnLeagueId: parseInt(espnLeagueId, 10),`
       - Remove: `...(espnSwid && espnSwid.trim() !== "" && { espnSwid }),`
       - Remove: `...(espnS2 && espnS2.trim() !== "" && { espnS2 }),`

    4. Update the ESPN Context section (lines 268-320):
       - Change the grid from `grid-cols-1 md:grid-cols-2` to `grid-cols-1 md:grid-cols-1` (single column since only one field remains)
       - Remove the ESPN League ID Input div (lines 270-281)
       - Remove the ESPN SWID Input div (lines 297-308)
       - Remove the ESPN S2 Input div (lines 309-319)
       - Keep only the ESPN Season Input div

    5. Add four new categories to AVAILABLE_CATEGORIES array (after line 73, in the correct positions):
       After `{ category_id: 4, stat_key: "SB" ... }` add:
       `{ category_id: 9, stat_key: "BB", name: "BB", type: "COUNTING", direction: "HIGHER_BETTER" },`

       After `{ category_id: 20, stat_key: "WHIP" ... }` add:
       `{ category_id: 23, stat_key: "K9", name: "K9", type: "RATE", direction: "HIGHER_BETTER", formula_id: "k9" },`
       `{ category_id: 24, stat_key: "WPCT", name: "WPCT", type: "RATE", direction: "HIGHER_BETTER", formula_id: "wpct" },`

       After `{ category_id: 17, stat_key: "W" ... }` add:
       `{ category_id: 25, stat_key: "L", name: "L", type: "COUNTING", direction: "LOWER_BETTER" },`

    6. Update the batting categories filter array (line 350):
       Change: `["R", "HR", "RBI", "SB", "AVG", "OBP", "SLG", "OPS"]`
       To: `["R", "HR", "RBI", "SB", "BB", "AVG", "OBP", "SLG", "OPS"]`

    7. Update the pitching categories filter array (line 374):
       Change: `["K", "W", "SV", "HLD", "QS", "ERA", "WHIP"]`
       To: `["K", "W", "L", "WPCT", "SV", "HLD", "QS", "ERA", "WHIP", "K9"]`

    Also remove the `Input` import if it is no longer used anywhere else in the file after removing the ESPN fields. Check all other uses of `Input` first — if the roster slot count inputs and the numeric fields (numTeams, budget, minBid, limit, espnSeason) still use it, keep the import.
  </action>
  <verify>
    `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/frontend/tsconfig.json 2>&1 | head -30`
    Should produce zero TypeScript errors related to this file.
    Visually confirm: no `espnLeagueId`, `espnSwid`, `espnS2` identifiers remain in the file.
  </verify>
  <done>
    Form no longer has League ID, SWID, or S2 fields. handleSubmit no longer validates or sends those params. AVAILABLE_CATEGORIES includes BB (after SB), L (after W), WPCT (after W or WHIP area), and K9 (after WHIP). Both batting and pitching filter arrays show the new categories in their respective checkbox sections.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove unused ESPN auth params from api.ts validateAuctionValues</name>
  <files>packages/frontend/src/lib/api.ts</files>
  <action>
    Update the `validateAuctionValues` params interface (around line 449) by removing three fields:
    - Remove: `espnLeagueId: number;`
    - Remove: `espnSwid?: string;`
    - Remove: `espnS2?: string;`

    Keep all other fields intact: `numTeams`, `categories`, `rosterSlots`, `budget`, `minBid`, `limit`, `espnSeason`, `projectionsRunId`.

    The rest of the function body (URLSearchParams construction using Object.entries) does not need to change — it already handles the params generically.
  </action>
  <verify>
    `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/frontend/tsconfig.json 2>&1 | head -30`
    Should produce zero TypeScript errors. Confirm the three removed fields no longer appear in the interface.
  </verify>
  <done>
    `validateAuctionValues` params interface has no `espnLeagueId`, `espnSwid`, or `espnS2` fields. TypeScript compilation passes with no errors from either file.
  </done>
</task>

</tasks>

<verification>
1. `cd /Users/jay-work/Code/espn-agent && npx tsc --noEmit -p packages/frontend/tsconfig.json 2>&1 | head -30` — zero errors
2. Grep confirms no remaining references to espnLeagueId/espnSwid/espnS2 in the two changed files
3. AVAILABLE_CATEGORIES array contains entries for BB, L, WPCT, K9
4. Batting filter includes "BB", pitching filter includes "L", "WPCT", "K9"
</verification>

<success_criteria>
- Auction validation form renders with ESPN Season field only (no League ID, SWID, S2 inputs)
- Form submission no longer requires or sends league auth fields
- BB visible in Batting Categories checkbox list
- L, WPCT, K9 visible in Pitching Categories checkbox list
- TypeScript compilation passes with zero errors
</success_criteria>

<output>
After completion, create `.planning/quick/26-clean-up-auction-validation-frontend-rem/26-SUMMARY.md`
</output>
