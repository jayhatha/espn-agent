---
phase: 77-sp-sit-start
verified: 2026-03-26T23:45:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 77: SP Sit/Start Recommendations Verification Report

**Phase Goal:** Scrape SP rankings from Pitcherlist (static HTML) and Rotoballer (graceful degradation for JS-rendered content), match rankings against rostered SPs using fuzzy name matching, and display start/sit verdicts with source links on a new Sit/Start tab in the Pitching Usage page
**Verified:** 2026-03-26T23:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Pitcherlist adapter fetches latest SP Streamer Ranks article and extracts tier-grouped pitcher names | VERIFIED | `parsePitcherlistTiers()` in pitcherlist.ts traverses h2/h3 tier headings, sibling tables; TIER_MAP maps all 4 tier keywords |
| 2  | Rotoballer adapter returns empty array gracefully when JS-rendered content cannot be parsed | VERIFIED | rotoballer.ts: full try/catch returns `[]`; detects no-table case and logs warn; tests confirm empty array on network error and JS-rendered HTML |
| 3  | SitStartAdvisor matches external rankings against rostered SPs using normalized name comparison | VERIFIED | `normalizeName()` exported in sit-start-advisor.ts; NFD decomposition + lowercase + strip non-alpha; used in `getRecommendations()` for both adapter results |
| 4  | API endpoint returns sit/start recommendations for a given team with source URLs | VERIFIED | `GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start` registered in pitching-usage.ts with full auth middleware chain |
| 5  | Adapters cache results with 6-hour TTL to avoid repeated scraping | VERIFIED | Both adapters: `LRUCache<string, CacheEntry>({ max: 10 })` with `expiresAt: Date.now() + CACHE_TTL_MS` (6 * 60 * 60 * 1000) |
| 6  | User sees a "Sit/Start" tab on the Pitching Usage page | VERIFIED | `PitchingTab` type includes `"sit-start"`; tab nav array is `["gs-pacing", "start-plan", "sit-start", "streaming"]` with label "Sit/Start" |
| 7  | Clicking Sit/Start tab shows a table of rostered SPs with verdict badges | VERIFIED | `activeTab === "sit-start"` renders table with Pitcher, Consensus, Pitcherlist, Rotoballer columns |
| 8  | Each SP row shows Pitcherlist verdict badge and Rotoballer verdict badge (if available) | VERIFIED | Both cells conditionally render `<Badge>` with `getVerdictBadgeVariant()` or `"--"` when no data |
| 9  | Each source verdict links to the original article | VERIFIED | Badges wrapped in `<a href={rec.sourceUrl.pitcherlist} target="_blank">` and `<a href={rec.sourceUrl.rotoballer} target="_blank">` |
| 10 | When no external rankings are available, a helpful empty state is shown | VERIFIED | Empty state: "No external SP rankings available. Rankings are scraped from Pitcherlist and Rotoballer when published." |
| 11 | Consensus verdict is prominently displayed with color-coded badge | VERIFIED | Consensus column: `<Badge variant={getVerdictBadgeVariant(rec.consensus)}>` — positive=Start, info=Lean Start, default=Toss-Up, warning=Lean Sit, negative=Sit |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/adapters/pitcherlist.ts` | Pitcherlist scraping adapter | VERIFIED | Exports `PitcherlistAdapter` and `parsePitcherlistTiers`; contains URL discovery selector `starting-pitcher-streamer-rank`; LRUCache; NFD normalization |
| `packages/backend/src/adapters/rotoballer.ts` | Rotoballer scraping adapter with graceful degradation | VERIFIED | Exports `RotoballerAdapter`; returns `[]` on all failure paths; 6-hour LRU cache |
| `packages/backend/src/agents/sit-start-advisor.ts` | Agent merging external rankings with rostered SPs | VERIFIED | Exports `SitStartAdvisor` and `normalizeName`; queries `team_roster_snapshot`; `Promise.all` both adapters |
| `packages/backend/src/api/pitching-usage.ts` | GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start route | VERIFIED | Route registered with authenticate + requireLeagueAccess + requireTeamOwnership |
| `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` | Sit/Start tab rendering with verdict table | VERIFIED | Contains `"sit-start"` in PitchingTab type, tab nav, and "Sit/Start" label; full verdict table rendered |
| `packages/frontend/src/lib/api.ts` | getSitStart API client method | VERIFIED | `async getSitStart(leagueId: number, teamId: number)` calling `pitching/sit-start` at line 414 |
| `packages/backend/src/adapters/__tests__/pitcherlist.test.ts` | Pitcherlist parser unit tests | VERIFIED | 11 tests pass: tier extraction, verdict mapping (all 4 tiers), empty HTML, URL discovery |
| `packages/backend/src/adapters/__tests__/rotoballer.test.ts` | Rotoballer graceful degradation tests | VERIFIED | 5 tests pass: constructor, network error returns [], JS-rendered HTML returns [], 404 returns [], type contract |
| `packages/backend/src/agents/__tests__/sit-start-advisor.test.ts` | SitStartAdvisor unit tests | VERIFIED | 11 tests pass: normalizeName, diacritics, verdict merging, unmatched player, empty recommendations |
| `packages/shared/src/types.ts` | ExternalRankingEntry type | VERIFIED | Interface at line 385 with all required fields |
| `packages/backend/package.json` | cheerio dependency | VERIFIED | `"cheerio": "^1.2.0"` in dependencies |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sit-start-advisor.ts` | `pitcherlist.ts` | `pitcherlistAdapter.getRankings()` | WIRED | Line 122: `this.pitcherlistAdapter.getRankings()` in Promise.all |
| `sit-start-advisor.ts` | `rotoballer.ts` | `rotoballerAdapter.getRankings()` | WIRED | Line 123: `this.rotoballerAdapter.getRankings()` in Promise.all |
| `pitching-usage.ts` | `sit-start-advisor.ts` | `new SitStartAdvisor` | WIRED | Line 104: `const advisor = new SitStartAdvisor(db, request.log)` |
| `streaming/page.tsx` | `/api/leagues/:leagueId/teams/:teamId/pitching/sit-start` | `api.getSitStart()` in useQuery | WIRED | Lines 152-157: useQuery calls `api.getSitStart(parseInt(leagueId, 10), selectedTeamId!)` |
| `streaming/page.tsx` | `packages/frontend/src/lib/api.ts` | `import { api }` | WIRED | Line 6: `import { api } from "@/lib/api"` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `streaming/page.tsx` Sit/Start tab | `sitStartData` | `api.getSitStart()` → `SitStartAdvisor.getRecommendations()` | Yes — queries `team_roster_snapshot` + `player` tables for real roster data; scrapes external URLs | FLOWING |
| `sit-start-advisor.ts` | `rosteredSPs` | `team_roster_snapshot` via Kysely DB queries | Yes — `selectFrom("team_roster_snapshot").innerJoin("player", ...)` | FLOWING |
| `pitcherlist.ts` | `entries` | HTTP fetch to pitcherlist.com archive + article pages | Yes — real HTTP requests; gracefully returns [] on failure | FLOWING |
| `rotoballer.ts` | `entries` | HTTP fetch to rotoballer.com category page | Yes — real HTTP requests; expected to return [] in initial deployment due to JS rendering | FLOWING (degrades to [] by design) |

---

### Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| pitcherlist.test.ts passes | All 11 tests: 4-tier extraction, verdict mapping, empty HTML, URL discovery | PASS (confirmed from test run) |
| rotoballer.test.ts passes | All 5 tests: constructor, network failure, JS-rendered HTML, 404 | PASS (confirmed from test run) |
| sit-start-advisor.test.ts passes | All 11 tests: normalizeName, diacritics, verdict merging, unmatched player | PASS (confirmed from test run) |
| TypeScript compiles | `npx tsc --noEmit` on frontend package | PASS (no errors) |
| API route exists | `GET /api/leagues/:leagueId/teams/:teamId/pitching/sit-start` in pitching-usage.ts | PASS |
| getSitStart in api.ts | Method defined with correct URL pattern | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SITSTART-01 | 77-01 | Pitcherlist adapter scrapes weekly SP Streamer Ranks article and extracts tier-grouped pitcher names into normalized entries | SATISFIED | `PitcherlistAdapter` + `parsePitcherlistTiers()` — full tier extraction with verdict mapping, 11 tests pass |
| SITSTART-02 | 77-01 | Rotoballer adapter returns empty array gracefully when JS-rendered content cannot be parsed | SATISFIED | `RotoballerAdapter` returns [] on all failure paths; tests confirm network error and JS-rendered HTML both return [] without throwing |
| SITSTART-03 | 77-01 | SitStartAdvisor agent matches external rankings against rostered SPs using diacritic-aware normalized name comparison | SATISFIED | `normalizeName()` with NFD decomposition; diacritic tests pass (Sánchez → Sanchez); used in getRecommendations |
| SITSTART-04 | 77-01 | API endpoint returns sit/start recommendations per team at GET /api/.../pitching/sit-start | SATISFIED | Route registered in pitching-usage.ts with auth middleware; returns `{ recommendations[], sources{} }` |
| SITSTART-05 | 77-02 | Frontend Sit/Start tab on Pitching Usage page displays verdict badges with source links and empty state | SATISFIED | Tab added to streaming/page.tsx; verdict badges with color mapping; source attribution links; empty state message |

All 5 SITSTART requirements marked Complete in REQUIREMENTS.md. All 5 verified against actual code.

---

### Anti-Patterns Found

No blockers or warnings found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `sit-start-advisor.ts` | 158-160 | Empty if/else branch `else if (pitcherlistRankings.length === 0 && rotoballerRankings.length === 0)` with no body | Info | Dead code path — no impact on behavior, purely cosmetic |

---

### Human Verification Required

#### 1. Pitcherlist Live Scraping

**Test:** Navigate to `http://localhost:3000/leagues/{leagueId}/streaming`, select your team, click "Sit/Start" tab.
**Expected:** Table appears with rostered SPs. Pitcherlist column shows tier badges (e.g., "Auto-Start", "Probably Start") with links to the current week's article. Source attribution row shows article title at top.
**Why human:** Pitcherlist.com scraping behavior requires a live network call to verify the URL discovery selector `a[href*='starting-pitcher-streamer-rank']` matches the current live archive page structure.

#### 2. Rotoballer Graceful Degradation

**Test:** Same page as above, observe Rotoballer column.
**Expected:** Rotoballer column shows "--" for all pitchers (JS-rendered content). No errors thrown. Network tab shows a request to the backend endpoint that returns 200.
**Why human:** Confirms the expected graceful degradation behavior in a real environment where Rotoballer is JS-rendered.

#### 3. Source Link Navigation

**Test:** If Pitcherlist data is available, click a verdict badge in the Pitcherlist column.
**Expected:** Opens pitcherlist.com article in a new browser tab.
**Why human:** Requires browser interaction to verify `target="_blank"` behavior.

---

### Gaps Summary

No gaps found. All must-haves from both plans (77-01 and 77-02) are verified against the actual codebase.

The only non-automated verification remaining is live Pitcherlist scraping behavior, which cannot be tested without a real network call to pitcherlist.com. All parsing logic is covered by unit tests with HTML fixtures.

Note: 7 failing tests observed in the test suite are pre-existing failures in `src/adapters/__tests__/espn.test.ts` (phase 76 ESPN adapter retry/cache tests) — these are unrelated to phase 77 and were present before this phase began.

---

_Verified: 2026-03-26T23:45:00Z_
_Verifier: Claude (gsd-verifier)_
