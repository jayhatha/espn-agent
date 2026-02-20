---
phase: 04-advanced-features-polish
verified: 2026-02-20T19:43:13Z
status: gaps_found
score: 16/20 must-haves verified
gaps:
  - truth: "User sees daily lineup optimization page with start/sit swap recommendations"
    status: partial
    reason: "Page exists and renders but not linked in navigation - users cannot discover it"
    artifacts:
      - path: "packages/frontend/src/app/leagues/[id]/lineup/page.tsx"
        issue: "Not linked in navigation.tsx - orphaned page"
      - path: "packages/frontend/src/app/navigation.tsx"
        issue: "Missing /lineup route in nav menu"
    missing:
      - "Add lineup route to navigation menu"
  - truth: "User sees streaming pitcher suggestions ranked by matchup favorability"
    status: partial
    reason: "Page exists and renders but not linked in navigation - users cannot discover it"
    artifacts:
      - path: "packages/frontend/src/app/leagues/[id]/streaming/page.tsx"
        issue: "Not linked in navigation.tsx - orphaned page"
      - path: "packages/frontend/src/app/navigation.tsx"
        issue: "Missing /streaming route in nav menu"
    missing:
      - "Add streaming route to navigation menu"
  - truth: "User sees pre-draft rankings page with players sorted by VBD score and positional scarcity tiers"
    status: partial
    reason: "Page exists and renders but not linked in navigation - users cannot discover it"
    artifacts:
      - path: "packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx"
        issue: "Not linked in navigation.tsx - orphaned page"
      - path: "packages/frontend/src/app/navigation.tsx"
        issue: "Missing /draft/rankings route in nav menu"
    missing:
      - "Add draft routes to navigation menu"
  - truth: "User sees auction valuations page with dollar values based on league budget"
    status: partial
    reason: "Page exists and renders but not linked in navigation - users cannot discover it"
    artifacts:
      - path: "packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx"
        issue: "Not linked in navigation.tsx - orphaned page"
      - path: "packages/frontend/src/app/navigation.tsx"
        issue: "Missing /draft/auction route in nav menu"
    missing:
      - "Add auction route to navigation menu (linked from rankings page)"
human_verification:
  - test: "Navigate to /leagues/[id]/draft/rankings directly via URL bar"
    expected: "Page loads, shows VBD-ranked players with tier badges, position filter works, can toggle positions and see table update instantly"
    why_human: "Visual tier badge rendering, responsive table behavior, filter interaction - requires browser testing"
  - test: "Navigate to /leagues/[id]/draft/auction and adjust budget slider"
    expected: "Dollar values recalculate instantly when budget changes from 260 to 300, players re-sort by new values"
    why_human: "Real-time reactivity of TanStack Query, UI responsiveness - requires browser testing"
  - test: "Navigate to /leagues/[id]/lineup and select a team"
    expected: "Shows optimal banner (green) if no swaps OR amber banner with N swaps and projected gain, swap cards show start/sit with visual distinction"
    why_human: "Conditional rendering logic, card layout visual distinction (green vs red borders), requires browser testing"
  - test: "Navigate to /leagues/[id]/streaming and toggle lookahead days (1/3/7)"
    expected: "Date range updates, candidate list refreshes, multi-start badges appear for pitchers with 2+ starts in period"
    why_human: "Button group toggle behavior, badge conditional rendering, requires browser testing"
  - test: "Verify MLB StatsAPI adapter returns real game schedules"
    expected: "Call getSchedule('2026-02-20', '2026-02-20') returns array of MLB games with probable pitchers"
    why_human: "External API integration - requires network call to verify statsapi.mlb.com endpoint works"
---

# Phase 04: Advanced Features & Polish Verification Report

**Phase Goal:** Add engagement features (lineup optimizer, streaming suggestions) and seasonal acquisition tools (draft assistant)

**Verified:** 2026-02-20T19:43:13Z

**Status:** gaps_found

**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | VBD formula calculates positional scarcity score from projected stats and league-specific replacement levels | ✓ VERIFIED | calculateVBD in formulas.ts (line 242), getReplacementLevel uses roster_slots * teams logic |
| 2 | SGP formula converts projected stat values to standings gain points per category | ✓ VERIFIED | calculateTotalSGP in formulas.ts handles COUNTING/RATE/LOWER_BETTER categories with stddev calculation |
| 3 | DraftRankingsAgent produces ranked player list sorted by VBD with position-specific replacement levels | ✓ VERIFIED | getRankings method (line 40-250) loads projections, calculates SGP, determines replacement per position, computes VBD |
| 4 | AuctionValuationAgent converts VBD/SGP to dollar values based on budget constraints | ✓ VERIFIED | getValuations method calls DraftRankingsAgent, calculates spending pool, converts VBD to dollars via proportional formula |
| 5 | MLB StatsAPI adapter fetches game schedules and probable pitchers for a date range | ✓ VERIFIED | getSchedule (line 61), getProbablePitchers (line 99) in mlb-statsapi.ts fetch from statsapi.mlb.com |
| 6 | LineupOptimizerAgent recommends start/sit swaps that maximize projected value per roster slot | ✓ VERIFIED | getRecommendations method (line 65-220) implements greedy slot filling, accounts for no-game-today scenarios |
| 7 | StreamingPitcherAgent ranks available pitchers by matchup favorability using opponent strength and projections | ✓ VERIFIED | getRecommendations method (line 52-200) computes composite score (projection + opponent + multi-start), excludes rostered players |
| 8 | User sees pre-draft rankings page with players sorted by VBD score and positional scarcity tiers | ⚠️ PARTIAL | Page exists at /leagues/[id]/draft/rankings with tier badges and position filter BUT not linked in navigation.tsx |
| 9 | User can filter draft rankings by position | ✓ VERIFIED | Position dropdown (line 84-105) in rankings/page.tsx with TanStack Query re-fetch on change |
| 10 | User sees auction valuations page with dollar values based on league budget | ⚠️ PARTIAL | Page exists at /leagues/[id]/draft/auction with budget controls BUT not linked in navigation.tsx |
| 11 | User can adjust auction budget and see recalculated values | ✓ VERIFIED | Budget/minBid inputs (line 90-120) in auction/page.tsx trigger TanStack Query re-fetch via queryKey |
| 12 | User sees daily lineup optimization page with start/sit swap recommendations | ⚠️ PARTIAL | Page exists at /leagues/[id]/lineup with optimal/swap cards BUT not linked in navigation.tsx |
| 13 | User sees which players should be benched and which bench players should start | ✓ VERIFIED | Swap cards (line 206-260) in lineup/page.tsx show green "Start" (bench player) vs red "Sit" (starter) with projected gain |
| 14 | User sees streaming pitcher suggestions ranked by matchup favorability | ⚠️ PARTIAL | Page exists at /leagues/[id]/streaming with composite score cards BUT not linked in navigation.tsx |
| 15 | User sees multi-start pitcher indicator for weekly planning | ✓ VERIFIED | Multi-start badge (weekStarts >= 2) rendered in streaming/page.tsx candidate cards |
| 16 | Draft rankings API endpoint enforces authentication and returns VBD-ranked players | ✓ VERIFIED | GET /api/leagues/:leagueId/draft/rankings uses requireLeagueAccess middleware (line 59) in draft.ts |
| 17 | Auction API endpoint validates budget ranges and returns dollar valuations | ✓ VERIFIED | GET /api/leagues/:leagueId/draft/auction validates budget 100-1000, minBid 1-10 (line 160) |
| 18 | Lineup API endpoint enforces team ownership and returns swap recommendations | ✓ VERIFIED | GET /api/leagues/:leagueId/teams/:teamId/lineup/recommendations uses requireTeamOwnership (line 48) in lineup.ts |
| 19 | Streaming API endpoint accepts lookahead window and returns matchup-scored candidates | ✓ VERIFIED | GET /api/leagues/:leagueId/streaming-pitchers accepts startDate, lookAheadDays params (line 51) in streaming.ts |
| 20 | All agents follow constructor pattern with Kysely db and optional Pino logger | ✓ VERIFIED | DraftRankingsAgent (line 31), AuctionValuationAgent (line 18), LineupOptimizerAgent (line 50), StreamingPitcherAgent (line 39) all use pattern |

**Score:** 16/20 truths verified (4 partial - pages exist but not discoverable via nav)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| packages/shared/src/formulas.ts | VBD and SGP calculation functions | ✓ VERIFIED | calculateVBD (line 242), calculateTotalSGP, getReplacementLevel, calculateSpendingPool, calculateAuctionDollarValue all exported |
| packages/shared/src/types.ts | VBD/SGP/Draft/Auction type definitions | ✓ VERIFIED | DraftRanking (line 264), AuctionValue (line 276), DraftContext exported |
| packages/backend/src/agents/draft-rankings.ts | DraftRankingsAgent class | ✓ VERIFIED | Exports class with getRankings method, substantive SGP calculation + replacement level logic |
| packages/backend/src/agents/auction-valuation.ts | AuctionValuationAgent class | ✓ VERIFIED | Exports class with getValuations method, delegates to DraftRankingsAgent, converts VBD to dollars |
| packages/backend/src/adapters/mlb-statsapi.ts | MLB schedule and probable pitcher data | ✓ VERIFIED | MLBStatsAPIAdapter with getSchedule, getProbablePitchers, getTeamSchedule, getMultiStartPitchers |
| packages/backend/src/agents/lineup-optimizer.ts | Daily start/sit recommendations | ✓ VERIFIED | LineupOptimizerAgent with greedy optimization, accounts for game schedules, calculates projected gain |
| packages/backend/src/agents/streaming-pitcher.ts | Streaming pitcher matchup analysis | ✓ VERIFIED | StreamingPitcherAgent with composite scoring, multi-start detection, excludes rostered players |
| packages/backend/src/api/draft.ts | Draft rankings and auction valuation API endpoints | ✓ VERIFIED | Exports draftRoutes with GET /rankings and GET /auction, auth middleware applied |
| packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx | Draft rankings UI with VBD scores and position filters | ⚠️ ORPHANED | File exists with tier badges, position filter, TanStack Query BUT not in navigation.tsx |
| packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx | Auction valuations UI with budget adjustment | ⚠️ ORPHANED | File exists with budget controls, dollar value highlighting BUT not in navigation.tsx |
| packages/backend/src/api/lineup.ts | Lineup optimization API endpoint | ✓ VERIFIED | Exports lineupRoutes with GET /lineup/recommendations, team ownership auth |
| packages/backend/src/api/streaming.ts | Streaming pitcher API endpoint | ✓ VERIFIED | Exports streamingRoutes with GET /streaming-pitchers, league access auth |
| packages/frontend/src/app/leagues/[id]/lineup/page.tsx | Lineup optimizer UI with start/sit recommendations | ⚠️ ORPHANED | File exists with optimal banner, swap cards, TeamSelector BUT not in navigation.tsx |
| packages/frontend/src/app/leagues/[id]/streaming/page.tsx | Streaming pitcher suggestions UI | ⚠️ ORPHANED | File exists with candidate cards, lookahead controls, composite score badges BUT not in navigation.tsx |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| packages/backend/src/agents/draft-rankings.ts | packages/shared/src/formulas.ts | import calculateVBD, calculateSGP | ✓ WIRED | Lines 9-13 import calculateTotalSGP, getReplacementLevel, calculateVBD from shared/dist/index.js |
| packages/backend/src/agents/auction-valuation.ts | packages/backend/src/agents/draft-rankings.ts | import DraftRankingsAgent for VBD scores | ✓ WIRED | Line 9 imports, line 21 accepts in constructor, line 56 calls getRankings |
| packages/backend/src/agents/lineup-optimizer.ts | packages/backend/src/adapters/mlb-statsapi.ts | schedule data for game detection | ✓ WIRED | Line 5 imports MLBStatsAPIAdapter, line 53 accepts in constructor, line 136 calls getSchedule |
| packages/backend/src/agents/streaming-pitcher.ts | packages/backend/src/adapters/mlb-statsapi.ts | probable pitchers and schedule for matchup scoring | ✓ WIRED | Line 5 imports, line 42 accepts in constructor, lines 91-103 call getProbablePitchers and getMultiStartPitchers |
| packages/frontend/src/app/leagues/[id]/draft/rankings/page.tsx | /api/leagues/:leagueId/draft/rankings | TanStack Query fetch | ✓ WIRED | Lines 67-73 useQuery with api.get('/api/leagues/${leagueId}/draft/rankings') |
| packages/frontend/src/app/leagues/[id]/draft/auction/page.tsx | /api/leagues/:leagueId/draft/auction | TanStack Query fetch | ✓ WIRED | useQuery with api.get including budget and minBid params |
| packages/backend/src/api/draft.ts | packages/backend/src/agents/draft-rankings.ts | agent instantiation in route handler | ✓ WIRED | Line 3 imports, line 65 instantiates new DraftRankingsAgent(db, request.log) |
| packages/frontend/src/app/leagues/[id]/lineup/page.tsx | /api/leagues/:leagueId/teams/:teamId/lineup/recommendations | TanStack Query fetch | ✓ WIRED | Lines 64-73 useQuery with api.getLineupRecommendations |
| packages/frontend/src/app/leagues/[id]/streaming/page.tsx | /api/leagues/:leagueId/streaming-pitchers | TanStack Query fetch | ✓ WIRED | useQuery with api.getStreamingPitchers including lookAheadDays param |
| packages/backend/src/api/lineup.ts | packages/backend/src/agents/lineup-optimizer.ts | agent instantiation | ✓ WIRED | Line 3 imports, line 53 instantiates new LineupOptimizerAgent(db, mlbAdapter, request.log) |
| packages/backend/src/api/streaming.ts | packages/backend/src/agents/streaming-pitcher.ts | agent instantiation | ✓ WIRED | Line 3 imports, line 56 instantiates new StreamingPitcherAgent(db, mlbAdapter, request.log) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RECC-03 | 04-02, 04-04 | User sees daily lineup optimization (start/sit recommendations) | ⚠️ BLOCKED | LineupOptimizerAgent implemented, API endpoint exists, frontend page exists BUT page not in navigation menu - users cannot discover feature |
| RECC-04 | 04-02, 04-04 | User sees streaming pitcher suggestions for favorable matchups | ⚠️ BLOCKED | StreamingPitcherAgent implemented, API endpoint exists, frontend page exists BUT page not in navigation menu - users cannot discover feature |
| DRFT-01 | 04-01, 04-03 | User sees pre-draft rankings with positional scarcity analysis | ⚠️ BLOCKED | DraftRankingsAgent implemented with VBD/SGP, API endpoint exists, frontend page exists with tier badges BUT page not in navigation menu - users cannot discover feature |
| DRFT-02 | 04-01, 04-03 | User sees auction valuations based on projected stats | ⚠️ BLOCKED | AuctionValuationAgent implemented, API endpoint exists, frontend page exists with budget controls BUT page not in navigation menu - users cannot discover feature |

**Orphaned Requirements:** None - all Phase 4 requirements from REQUIREMENTS.md are covered by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| packages/backend/src/agents/morning-report.ts | 162 | TODO: Fetch injuries from injury_event table | ℹ️ Info | Unrelated to Phase 4 - pre-existing tech debt |
| packages/backend/src/agents/waiver-recommendation.ts.bak | 196 | Placeholder delta calculation (0.5) | ℹ️ Info | Backup file not in use - no impact |
| packages/frontend/src/app/navigation.tsx | N/A | Missing draft/lineup/streaming routes | 🛑 Blocker | Users cannot discover Phase 4 features - all pages are orphaned |

**Critical Gap:** All four Phase 4 frontend pages (draft rankings, auction, lineup, streaming) are fully implemented and functional BUT not linked in the navigation menu. Users have no way to discover these features unless they manually type URLs.

### Human Verification Required

#### 1. Draft Rankings Page Visual Rendering

**Test:** Navigate to `/leagues/[id]/draft/rankings` (replace [id] with actual league ID), verify tier badges render with correct colors, position filter dropdown shows all positions, clicking filter updates table instantly

**Expected:**
- Tier 1 players have green badge labeled "T1"
- Tier 2 players have blue badge labeled "T2"
- Tier 3 players have yellow badge labeled "T3"
- Tier 4 players have gray badge labeled "T4"
- Position filter dropdown populates with ALL, C, 1B, 2B, 3B, SS, OF, SP, RP, DH
- Selecting position triggers TanStack Query re-fetch, table updates without page reload
- VBD scores display to 2 decimal places, sorted descending

**Why human:** Visual tier badge colors, responsive filter behavior, table re-render without reload - requires browser-based verification

#### 2. Auction Valuations Budget Adjustment

**Test:** Navigate to `/leagues/[id]/draft/auction`, adjust budget input from 260 to 300, then to 200, verify dollar values recalculate instantly, meta display updates

**Expected:**
- Budget input accepts values 100-500, min bid accepts 1-5
- When budget changes, TanStack Query queryKey changes, triggers automatic re-fetch
- Dollar values recalculate proportionally (higher budget = higher values)
- Meta display shows "Spending pool: $X" with updated value
- Players above $20 show in green bold, $10-19 in dark gray, <$10 in light gray
- No "apply" button needed - instant reactivity

**Why human:** Real-time budget reactivity, conditional dollar value styling, requires observing state changes in browser

#### 3. Lineup Optimizer Swap Cards

**Test:** Navigate to `/leagues/[id]/lineup`, select a team with suboptimal lineup (or test with mock data), verify swap cards show two-column layout with green "Start" and red "Sit" sections

**Expected:**
- If lineup optimal: green banner with checkmark icon and "Your Lineup is Optimal!" message
- If swaps needed: amber banner with "N Recommended Swaps" and projected gain
- Swap cards display in grid with:
  - Left column (green border): bench player to start, projected value in bold green
  - Right column (red border): current starter to sit, projected value dimmed
  - Arrow icon between columns indicating swap direction
  - Reason text below explaining why (e.g., "No game today" or "Higher projected value")
  - Projected gain badge: "+X.XX SGP"

**Why human:** Visual card layout distinction (colors, borders, icons), conditional rendering based on isOptimal flag, requires browser testing

#### 4. Streaming Pitchers Lookahead Controls

**Test:** Navigate to `/leagues/[id]/streaming`, toggle lookahead button group between 1 day, 3 days, 7 days, verify date range updates and candidate list refreshes

**Expected:**
- Button group shows three options: "1 day", "3 days", "7 days" with 7 days initially selected
- Clicking different option updates TanStack Query queryKey, triggers re-fetch
- Date range display updates: "Showing matchups: Feb 20 - Feb 27" (for 7 days)
- Candidate cards show:
  - Rank number (large, left side)
  - Player name, MLB team
  - Matchup: "vs. NYY" or "@ NYY" with home/away indicator
  - Composite score with color coding: green >30, yellow 15-30, gray <15
  - Score breakdown pills: "Projection: X | Matchup: X | Multi-start: +X"
  - "2-Start Week" blue badge for pitchers with weekStarts >= 2

**Why human:** Button toggle interaction, badge conditional rendering, composite score color logic, requires browser testing

#### 5. MLB StatsAPI Integration

**Test:** Backend integration test - instantiate MLBStatsAPIAdapter, call `getSchedule('2026-02-20', '2026-02-20')`, verify response contains real MLB games

**Expected:**
- API call to `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=2026-02-20&endDate=2026-02-20` succeeds
- Response contains array of games with teams.home.team.name, teams.away.team.name
- Probable pitchers populated if announced (probablePitcher.fullName exists)
- Graceful degradation if API returns empty or errors (returns empty array, no crash)

**Why human:** External API dependency - requires network call to verify statsapi.mlb.com endpoint is accessible and returns expected structure, cannot mock in automated test

### Gaps Summary

**Primary Gap: Navigation Links Missing**

All four Phase 4 frontend pages are fully implemented with:
- Substantive rendering logic (tier badges, swap cards, composite scores)
- Proper TanStack Query integration with loading/error/empty states
- Correct API endpoint calls with auth
- Responsive Tailwind styling

**BUT:** None of these pages are linked in `packages/frontend/src/app/navigation.tsx`. Users have no way to discover:
- `/leagues/[id]/draft/rankings`
- `/leagues/[id]/draft/auction`
- `/leagues/[id]/lineup`
- `/leagues/[id]/streaming`

This is a **UX blocker** that prevents the phase goal from being achieved. The features exist and work, but users cannot access them through normal navigation.

**Impact:**
- DRFT-01: Pre-draft rankings exist but are not discoverable ⚠️
- DRFT-02: Auction valuations exist but are not discoverable ⚠️
- RECC-03: Lineup optimization exists but is not discoverable ⚠️
- RECC-04: Streaming pitchers exist but are not discoverable ⚠️

**Technical Depth:**

All backend agents are substantive:
- DraftRankingsAgent: 250+ lines with SGP calculation, replacement level per position, VBD ranking logic
- AuctionValuationAgent: 100+ lines with spending pool calculation, dollar value conversion
- LineupOptimizerAgent: 300+ lines with greedy slot optimization, game schedule integration
- StreamingPitcherAgent: 300+ lines with composite scoring, multi-start detection, fuzzy name matching
- MLBStatsAPIAdapter: 200+ lines with schedule/probable pitcher fetching from statsapi.mlb.com

All API routes are wired:
- draft.ts: Both endpoints registered, auth middleware applied, agents instantiated
- lineup.ts: Endpoint registered, team ownership enforced
- streaming.ts: Endpoint registered, league access enforced

All frontend pages have substantive rendering:
- No "placeholder" or "coming soon" messages
- No console.log-only implementations
- Proper component structure with loading/error/empty states
- TanStack Query integration with queryKey reactivity

**Root Cause:** Plans 04-03 and 04-04 created pages but did not update navigation.tsx. Summaries marked implementation complete without verifying discoverability.

**Fix Needed:** Add four navigation links to `packages/frontend/src/app/navigation.tsx` in the league detail navigation section.

---

_Verified: 2026-02-20T19:43:13Z_
_Verifier: Claude (gsd-verifier)_
