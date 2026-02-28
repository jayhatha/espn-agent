---
phase: quick-21
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/admin/auction-validation/page.tsx
  - packages/frontend/src/lib/api.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Admin can input validation parameters (numTeams, categories, rosterSlots, ESPN league context) via form"
    - "Admin can submit form and see comparison results with summary statistics"
    - "Results table shows player-by-player value deltas sorted by absolute difference"
  artifacts:
    - path: "packages/frontend/src/app/admin/auction-validation/page.tsx"
      provides: "Auction validation admin UI with form and results table"
      min_lines: 200
    - path: "packages/frontend/src/lib/api.ts"
      provides: "API client method for validation endpoint"
      exports: ["validateAuctionValues"]
  key_links:
    - from: "packages/frontend/src/app/admin/auction-validation/page.tsx"
      to: "/api/draft/auction/validate"
      via: "api.validateAuctionValues(params)"
      pattern: "api\\.validateAuctionValues"
---

<objective>
Create admin UI page for auction value validation that allows admins to compare VBD-based auction values against ESPN's baseline values with configurable draft parameters.

Purpose: Enable testing and validation of auction valuation algorithm against ESPN's established values to identify discrepancies and tune the VBD calculation.

Output: Functional admin page at /admin/auction-validation with form inputs and results display.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

Existing backend endpoint:
@packages/backend/src/api/draft.ts (lines 684-968) — GET /api/draft/auction/validate endpoint

Admin page pattern:
@packages/frontend/src/app/admin/page.tsx — Existing admin dashboard layout and API patterns

API client:
@packages/frontend/src/lib/api.ts — Centralized API client with existing methods
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add validateAuctionValues method to API client</name>
  <files>packages/frontend/src/lib/api.ts</files>
  <action>
Add `validateAuctionValues` method to the `api` object in packages/frontend/src/lib/api.ts:

```typescript
validateAuctionValues: async (params: {
  numTeams: number;
  categories: string; // JSON stringified array
  rosterSlots: string; // JSON stringified object
  budget?: number;
  minBid?: number;
  limit?: number;
  espnLeagueId: number;
  espnSeason: number;
  espnSwid?: string;
  espnS2?: string;
  projectionsRunId?: number;
}) => {
  const queryParams = new URLSearchParams();
  // Add all params to query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  const response = await fetch(`${API_URL}/api/draft/auction/validate?${queryParams}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || 'Failed to validate auction values');
  }

  return response.json();
}
```

Place after existing draft-related methods. No authentication required (endpoint has no auth middleware per backend code).
  </action>
  <verify>Grep confirms method exists: `grep -n "validateAuctionValues" packages/frontend/src/lib/api.ts`</verify>
  <done>api.ts exports validateAuctionValues method that constructs query params and calls GET /api/draft/auction/validate</done>
</task>

<task type="auto">
  <name>Task 2: Create auction validation admin page</name>
  <files>packages/frontend/src/app/admin/auction-validation/page.tsx</files>
  <action>
Create packages/frontend/src/app/admin/auction-validation/page.tsx following admin page patterns from packages/frontend/src/app/admin/page.tsx.

Structure:
1. **"use client"** directive at top
2. Import: `{ useState }`, `{ useQuery }`, `{ api }`, `AdminRoute` wrapper (not ProtectedRoute)
3. State for form inputs: numTeams, categories (textarea JSON), rosterSlots (textarea JSON), budget, minBid, limit, espnLeagueId, espnSeason, espnSwid (optional), espnS2 (optional)
4. State for validation results and error/loading
5. Form with Tailwind styling matching admin page patterns:
   - Number inputs: numTeams (2-30), budget (100-1000, default 260), minBid (1-10, default 1), limit (10-500, default 100)
   - Textarea inputs: categories (JSON array), rosterSlots (JSON object) with monospace font
   - ESPN context: espnLeagueId (number), espnSeason (number), espnSwid (optional text), espnS2 (optional text)
   - Submit button that calls `api.validateAuctionValues(formState)` on click
6. Results display when data exists:
   - Summary card showing: totalCompared, meanDelta, medianDelta, rmse, correlation, ourTopPlayer, espnTopPlayer
   - Comparison table with columns: Player Name, Positions, ESPN Value, Our Value, Delta ($), Delta (%), sorted by absoluteDelta descending
   - Color-code delta column: green if ourValue > espnValue, red if ourValue < espnValue
7. Error display for validation failures with clear messaging
8. Loading spinner during API call

Default form values (for convenience):
- numTeams: 12
- budget: 260
- minBid: 1
- limit: 100
- categories: `[{"category_id":1,"stat_key":"R","name":"R","type":"counting","direction":"high"},{"category_id":2,"stat_key":"HR","name":"HR","type":"counting","direction":"high"},{"category_id":3,"stat_key":"RBI","name":"RBI","type":"counting","direction":"high"},{"category_id":4,"stat_key":"SB","name":"SB","type":"counting","direction":"high"},{"category_id":5,"stat_key":"AVG","name":"AVG","type":"rate","direction":"high"},{"category_id":16,"stat_key":"K","name":"K","type":"counting","direction":"high"},{"category_id":17,"stat_key":"W","name":"W","type":"counting","direction":"high"},{"category_id":18,"stat_key":"SV","name":"SV","type":"counting","direction":"high"},{"category_id":19,"stat_key":"ERA","name":"ERA","type":"rate","direction":"low"},{"category_id":20,"stat_key":"WHIP","name":"WHIP","type":"rate","direction":"low"}]`
- rosterSlots: `{"C":1,"1B":1,"2B":1,"3B":1,"SS":1,"OF":3,"UTIL":1,"SP":3,"RP":2,"P":2,"Bench":5}`

Use AdminRoute wrapper (not ProtectedRoute) to match admin page pattern. Follow Tailwind class patterns from admin page (bg-white shadow rounded-lg p-6, etc).
  </action>
  <verify>
1. File exists: `ls packages/frontend/src/app/admin/auction-validation/page.tsx`
2. Contains AdminRoute wrapper: `grep "AdminRoute" packages/frontend/src/app/admin/auction-validation/page.tsx`
3. Contains api.validateAuctionValues call: `grep "validateAuctionValues" packages/frontend/src/app/admin/auction-validation/page.tsx`
  </verify>
  <done>
Admin page at /admin/auction-validation displays form with all required inputs, calls API on submit, shows summary statistics + comparison table with player-by-player deltas color-coded by direction
  </done>
</task>

<task type="auto">
  <name>Task 3: Add navigation link to admin dashboard</name>
  <files>packages/frontend/src/app/admin/page.tsx</files>
  <action>
Add a new card/section to the admin dashboard (packages/frontend/src/app/admin/page.tsx) that links to the auction validation page.

Insert after the "Player Pool Sync" section (around line 728) and before "Upload History":

```tsx
{/* Auction Value Validation */}
<div className="bg-white shadow rounded-lg p-6 mb-8">
  <h2 className="text-xl font-bold text-gray-900 mb-2">
    Auction Value Validation
  </h2>
  <p className="text-gray-600 mb-4">
    Compare our VBD-based auction values against ESPN's pre-draft baseline values to validate calculation accuracy.
  </p>
  <a
    href="/admin/auction-validation"
    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
  >
    <svg
      className="mr-2 h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
    Validate Auction Values
  </a>
</div>
```

This follows the existing card pattern and uses purple (admin theme color per existing icon on line 289).
  </action>
  <verify>Grep confirms link exists: `grep -n "auction-validation" packages/frontend/src/app/admin/page.tsx`</verify>
  <done>Admin dashboard has "Auction Value Validation" card with link to /admin/auction-validation</done>
</task>

</tasks>

<verification>
1. Navigate to http://localhost:3000/admin (requires admin login)
2. Verify "Auction Value Validation" card appears with purple button
3. Click "Validate Auction Values" button
4. Verify form displays with all inputs pre-filled with defaults
5. Enter ESPN league context (espnLeagueId, espnSeason) for a real auction league
6. Click submit and verify summary statistics appear
7. Verify comparison table shows players sorted by absolute delta
8. Verify delta values are color-coded (green/red)
</verification>

<success_criteria>
- Admin can access /admin/auction-validation page from dashboard
- Form accepts all required parameters with sensible defaults
- API client successfully calls GET /api/draft/auction/validate with query params
- Results display summary statistics (RMSE, correlation, mean/median delta)
- Comparison table shows top N players sorted by absolute value difference
- Visual feedback via color-coding helps identify over/undervalued players
</success_criteria>

<output>
After completion, create `.planning/quick/21-create-admin-ui-page-for-auction-validat/21-SUMMARY.md`
</output>
