# Phase 78: Streaming Picks — Rotoballer Verdicts + Waiver Timing - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning
**Source:** Inline from conversation (scraper debugging session)

<domain>
## Phase Boundary

Enhance the Streaming Picks tab so that candidates are filtered to only those with a favorable Rotoballer verdict (start/lean_start) who can be claimed on a Tuesday or Friday waiver processing day before their start. Display the Rotoballer verdict badge, grade, and "Claim by" date on each candidate card.

</domain>

<decisions>
## Implementation Decisions

### Verdict Filtering
- Only show streaming candidates with Rotoballer verdict of "start" or "lean_start"
- If Rotoballer data is unavailable (scraper down), skip verdict filter — show all candidates without badges
- Waiver day filter always applies regardless of Rotoballer availability

### Waiver Day Logic
- ESPN waiver processing runs on Tuesdays and Fridays (hardcoded, not league-specific)
- A candidate is only shown if there exists a Tuesday or Friday strictly before their game date
- The "Claim by" date is the latest such Tue/Fri before the game
- Example: pitcher starting Wednesday → claim by Tuesday. Pitcher starting Tuesday → claim by previous Friday.

### Name Matching
- Use `normalizeName()` from sit-start-advisor.ts (NFD decomposition, strip diacritics, lowercase)
- Replace the simpler inline `normalize()` in streaming-pitcher.ts

### Backend Integration
- RotoballerAdapter passed to StreamingPitcherAgent as optional constructor dependency
- StreamingCandidate extended with: rotoballerVerdict, rotoballerGrade, rotoballerSourceUrl, pickupDeadline
- StreamingResult extended with: rotoballerSource metadata

### Frontend Display
- Reuse existing getVerdictBadgeVariant() and formatVerdict() helpers from sit/start tab
- Show Rotoballer badge with grade in parentheses on each candidate card
- Show "Claim by [date]" in player info line
- Add Rotoballer source attribution link above candidate list

### Claude's Discretion
- Exact placement of verdict badge and claim-by date within the card layout
- Whether to boost composite score based on Rotoballer grade

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend Agent
- `packages/backend/src/agents/streaming-pitcher.ts` — Current StreamingPitcherAgent to extend
- `packages/backend/src/agents/sit-start-advisor.ts` — normalizeName() export to reuse
- `packages/backend/src/adapters/rotoballer.ts` — RotoballerAdapter.getRankings() returns ExternalRankingEntry[]

### API Route
- `packages/backend/src/api/streaming.ts` — GET /api/leagues/:leagueId/streaming-pitchers endpoint

### Frontend
- `packages/frontend/src/app/leagues/[id]/streaming/page.tsx` — Streaming page with 4 tabs, verdict helpers already defined

### Types
- `packages/shared/src/types.ts` — ExternalRankingEntry interface

</canonical_refs>

<specifics>
## Specific Ideas

- Rotoballer CSV data includes a "Grade" column (0-100) which can be shown alongside the verdict badge
- The Rotoballer scraper extracts from a Google Sheets CSV (not HTML) — data is clean and structured
- The scraper caches until 6 AM ET next day when results are found, 30 min when empty

</specifics>

<deferred>
## Deferred Ideas

- League-specific waiver processing days (read from league_settings_version.settings_json.acquisition_rules)
- Boosting composite score based on Rotoballer grade
- Incorporating Pitcherlist/FanGraphs verdicts into streaming picks

</deferred>

---

*Phase: 78-streaming-picks-merge-rotoballer-verdicts-and-waiver-pickup-timing-into-streaming-tab*
*Context gathered: 2026-03-27 via inline conversation*
