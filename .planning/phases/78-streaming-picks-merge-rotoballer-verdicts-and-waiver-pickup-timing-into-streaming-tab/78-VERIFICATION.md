---
phase: 78-streaming-picks
verified: 2026-03-27T00:00:00Z
status: human_needed
score: 8/8 must-haves verified
human_verification:
  - test: "Open streaming tab with a team selected, wait for results to load, and confirm Rotoballer verdict badges appear on candidate cards"
    expected: "Each card shows a colored badge (Start/Lean Start) with grade in parentheses, e.g. 'Start (72)', in the player info line next to the game date"
    why_human: "Rotoballer scraper returns live data; badge rendering can only be confirmed when actual rankings are available from the scraper"
  - test: "Confirm 'Claim by [date]' appears inline on candidate cards next to the verdict badge"
    expected: "Text reads 'Claim by Mar 27' (or appropriate Tue/Fri date) formatted using the existing formatDate helper"
    why_human: "Pickup deadline depends on real game dates from MLB StatsAPI; can only be visually verified against live data"
  - test: "Confirm Rotoballer source attribution link appears above the candidate list when Rotoballer data is available"
    expected: "A text link 'Rotoballer: [article title]' appears above the candidate cards, links to the Rotoballer article URL, and opens in a new tab"
    why_human: "Requires live Rotoballer scraper data to produce rotoballerSource in the API response"
  - test: "Confirm graceful degradation: when Rotoballer is unavailable (scraper returns empty), all candidates still appear without verdict filter"
    expected: "Streaming tab shows all qualified streaming candidates (those with a valid Tue/Fri pickup window) without verdict badges, and no source attribution link appears above the list"
    why_human: "Cannot programmatically simulate Rotoballer scraper failure without mocking the adapter"
---

# Phase 78: Streaming Picks Verification Report

**Phase Goal:** Streaming picks — merge Rotoballer verdicts and waiver pickup timing into streaming tab
**Verified:** 2026-03-27
**Status:** human_needed (all automated checks passed; live data rendering requires human confirmation)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Streaming candidates are filtered to only Rotoballer start/lean_start verdicts | VERIFIED | Lines 260-263 in streaming-pitcher.ts: `filtered = filtered.filter(c => c.rotoballerVerdict === "start" \|\| c.rotoballerVerdict === "lean_start")` guarded by `if (rotoballerRankings.length > 0)` |
| 2 | Candidates without a Tue/Fri pickup window before their game are excluded | VERIFIED | Lines 257 in streaming-pitcher.ts: `let filtered = candidates.filter(c => c.pickupDeadline !== undefined)` — always applied |
| 3 | Each candidate includes a pickupDeadline date string | VERIFIED | `getPickupDeadline` function (lines 56-70) walks backward from game date; result assigned to `pickupDeadline` field in push block (line 252) |
| 4 | When Rotoballer returns empty, all candidates shown without verdict filter | VERIFIED | Lines 259-265 in streaming-pitcher.ts: `if (rotoballerRankings.length > 0)` guard on verdict filter — comment confirms D-05 graceful degradation |
| 5 | Name matching uses NFD decomposition (normalizeName from sit-start-advisor) | VERIFIED | Line 6: `import { normalizeName } from "./sit-start-advisor.js"` — used at lines 227, 343, 346; old inline `normalize` function is absent from the file |
| 6 | Each streaming candidate card shows a Rotoballer verdict badge when available | VERIFIED (code) | Lines 626-636 in streaming/page.tsx: `{candidate.rotoballerVerdict && (<Badge variant={getVerdictBadgeVariant(candidate.rotoballerVerdict)}>...)}` — human needed to confirm live rendering |
| 7 | Each streaming candidate card shows a Claim by date when available | VERIFIED (code) | Lines 637-644 in streaming/page.tsx: `{candidate.pickupDeadline && (<span>Claim by {formatDate(candidate.pickupDeadline)}</span>)}` |
| 8 | Rotoballer source attribution link appears above the candidate list | VERIFIED (code) | Lines 584-595 in streaming/page.tsx: `{data.rotoballerSource && (<div><a href={data.rotoballerSource.articleUrl}>Rotoballer: {data.rotoballerSource.articleTitle}</a></div>)}` |

**Score:** 8/8 truths verified (automated); 4 items require human confirmation with live data

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/agents/streaming-pitcher.ts` | Extended StreamingCandidate with Rotoballer fields + waiver day logic | VERIFIED | Contains `rotoballerVerdict?`, `pickupDeadline?`, `rotoballerSource?` on interfaces; `getPickupDeadline` function with `dow === 2 \|\| dow === 5`; RotoballerAdapter optional constructor param |
| `packages/backend/src/api/streaming.ts` | API route passing Rotoballer data through to frontend | VERIFIED | Contains `import { RotoballerAdapter }`, instantiates `new RotoballerAdapter(request.log)`, passes as 4th arg to StreamingPitcherAgent, maps all 4 new candidate fields plus `rotoballerSource` |
| `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` | Streaming tab with verdict badges, claim-by dates, and source attribution | VERIFIED | Contains extended `StreamingCandidate` and `StreamingData` interfaces; renders verdict badge with grade, claim-by date, and source attribution link |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `streaming-pitcher.ts` | `adapters/rotoballer.ts` | constructor dependency | WIRED | `import { RotoballerAdapter }` at line 7; `private rotoballerAdapter?: RotoballerAdapter` in constructor (line 77); called at line 144 `await this.rotoballerAdapter.getRankings()` |
| `streaming-pitcher.ts` | `agents/sit-start-advisor.ts` | import normalizeName | WIRED | `import { normalizeName } from "./sit-start-advisor.js"` at line 6; used at lines 227, 343, 346 |
| `streaming/page.tsx` | `/api/leagues/:leagueId/streaming-pitchers` | api.getStreamingPitchers TanStack query | WIRED | `api.getStreamingPitchers(parseInt(leagueId, 10), {...})` in useQuery (lines 112-116); response typed as `Promise<StreamingData>` which includes `rotoballerVerdict` and `pickupDeadline` fields |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `streaming/page.tsx` | `data.candidates[].rotoballerVerdict` | `RotoballerAdapter.getRankings()` → matched in agent loop | Real scrape from Rotoballer website (live or empty on degradation) | FLOWING (scraper-dependent) |
| `streaming/page.tsx` | `data.candidates[].pickupDeadline` | `getPickupDeadline(probable.gameDate)` pure function | Deterministic computation from game date — no DB dependency | FLOWING |
| `streaming/page.tsx` | `data.rotoballerSource` | First entry of `rotoballerRankings` array | Set from real scrape results, null when scraper returns empty | FLOWING (scraper-dependent) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend TypeScript compiles | `npx tsc --noEmit --project packages/backend/tsconfig.json` | Zero errors (empty output) | PASS |
| Frontend TypeScript compiles | `npx tsc --noEmit --project packages/frontend/tsconfig.json` | Zero errors (empty output) | PASS |
| Commits from SUMMARY exist in git | `git log --oneline \| grep -E "3bc4a55\|1957c00\|f96a321"` | All 3 commit hashes found | PASS |
| No old inline normalize function present | Grep for `toLowerCase.*replace.*a-z` in streaming-pitcher.ts | No match | PASS |
| Only one definition of getVerdictBadgeVariant in page.tsx | Count definitions | 1 definition (line 171) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STREAM-01 | 78-01-PLAN.md | Not defined in REQUIREMENTS.md | ORPHANED | STREAM-01 through STREAM-06 are referenced in plan frontmatter but do not exist in `.planning/REQUIREMENTS.md` |
| STREAM-02 | 78-01-PLAN.md | Not defined in REQUIREMENTS.md | ORPHANED | Same as above |
| STREAM-03 | 78-01-PLAN.md, 78-02-PLAN.md | Not defined in REQUIREMENTS.md | ORPHANED | Same as above |
| STREAM-04 | 78-02-PLAN.md | Not defined in REQUIREMENTS.md | ORPHANED | Same as above |
| STREAM-05 | 78-01-PLAN.md | Not defined in REQUIREMENTS.md | ORPHANED | Same as above |
| STREAM-06 | 78-01-PLAN.md | Not defined in REQUIREMENTS.md | ORPHANED | Same as above |

**Note on requirement IDs:** The ROADMAP.md entry for Phase 78 states `Requirements: TBD`. The plan files reference STREAM-01 through STREAM-06, but these identifiers are not defined anywhere in REQUIREMENTS.md. This is a documentation gap — the implementation appears complete and correct per the PLAN specs, but requirements were never formally registered. This does not block the phase goal; it is an administrative traceability issue.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `streaming-pitcher.ts` | 244 | `ownership: null` hardcoded | Info | Ownership % is never populated from ESPN data — existing pre-phase limitation, not introduced by this phase |

No stubs, placeholders, or blocking anti-patterns were introduced by this phase.

### Human Verification Required

#### 1. Verdict Badge Rendering

**Test:** With a team selected on the Streaming Picks tab, wait for candidates to load. Check whether each candidate card shows a colored badge in the player info line (after the game date) indicating the Rotoballer verdict.
**Expected:** Badge text shows "Start" or "Lean Start" (no other verdicts appear because the filter excludes them). Grade appears in parentheses next to the verdict text when `rotoballerGrade` is non-null.
**Why human:** Rotoballer scraper returns live data. Badges only appear when the scraper successfully returns rankings; automated tests cannot simulate a live scrape.

#### 2. Claim By Date Rendering

**Test:** In the same candidate cards from Test 1, inspect the player info line (team / opponent / date row) for a "Claim by [date]" element after the verdict badge.
**Expected:** Text "Claim by Mar 28" (or the appropriate Tuesday/Friday formatted as "Mon DD"). The date is the latest Tue or Fri strictly before the pitcher's game date.
**Why human:** Pickup deadline depends on real game dates from MLB StatsAPI. The date logic is correct in code, but the actual dates can only be visually verified against a live API response.

#### 3. Source Attribution Link

**Test:** When Rotoballer data is available, look for a link above the list of candidate cards reading "Rotoballer: [article title]".
**Expected:** A styled link appears above the first candidate card, opens the Rotoballer article in a new tab, and displays the article title from the scraped data.
**Why human:** Requires the Rotoballer scraper to have returned at least one ranking entry.

#### 4. Graceful Degradation

**Test:** Temporarily verify the streaming tab behavior when Rotoballer returns no data (can simulate by checking a time when no rankings are published, or by reviewing logs for "Rotoballer fetch failed" messages).
**Expected:** All streaming candidates that have a valid Tue/Fri pickup window still appear; no verdict badges or source attribution link are shown; the candidate list is unfiltered by verdict.
**Why human:** Requires inducing a Rotoballer scraper failure, which is an external dependency state that cannot be controlled in automated testing.

### Gaps Summary

No gaps blocking goal achievement. All eight observable truths are verified in code. The implementation correctly:

- Filters streaming candidates to start/lean_start Rotoballer verdicts when data is available
- Falls back to showing all candidates (verdict-unfiltered) when Rotoballer is unavailable
- Always filters to candidates with a valid Tue/Fri pickup window before game date
- Enriches each candidate with rotoballerVerdict, rotoballerGrade, rotoballerSourceUrl, pickupDeadline
- Uses normalizeName (NFD decomposition) from sit-start-advisor for name matching
- Renders verdict badges with grade, "Claim by" dates, and source attribution in the frontend
- Reuses existing getVerdictBadgeVariant and formatVerdict helpers (no duplication)

The only documentation issue is that STREAM-01 through STREAM-06 are referenced in plan files but never defined in REQUIREMENTS.md. The ROADMAP.md confirms Phase 78 requirements were listed as TBD. The implementation is functionally complete per CONTEXT.md and the plan acceptance criteria. REQUIREMENTS.md should be updated to formally register these requirement IDs.

---

_Verified: 2026-03-27_
_Verifier: Claude (gsd-verifier)_
