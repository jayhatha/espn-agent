# Phase 21: Dynamic Build Archetype Analysis - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Show the user, during a live auction draft, how their roster picks shape their team archetype and what strategic paths remain. Uses FanGraphs leaderboard projections (full stat lines) and auction calculator (dollar values) to compute category ceilings, detect punts, and show build trajectory. Runs in the Chrome extension sidebar alongside the existing draft engine.

</domain>

<decisions>
## Implementation Decisions

### Archetype definition
- Both category-based AND spending pattern define the archetype — e.g. "power stars-and-scrubs" vs "balanced speed build"
- Show the data (category projections, z-scores) but also surface a summary label when the shape clearly matches a known archetype (e.g. "Power Build", "Pitching-First", "Speed Punt")
- Show from pick 1 but with a confidence indicator — low confidence early, high confidence after 5+ picks
- Show both views: current trajectory from drafted picks AND projected full roster if filled optimally. Gap between them shows remaining opportunity

### Constraint expression
- Primary constraint signal is category ceilings — "Given remaining budget + available players, your max achievable HR is ~220"
- Compare ceilings against competitive targets — "HR ceiling: ~220 (top-3 needs ~250)" makes it immediately actionable
- Update on every pick (any team's pick) but only highlight meaningful changes — ceiling dropped, punt status changed, new pivot available
- Show pivot players — name specific available players that would unlock a category ceiling (e.g. "If you grab Player X for $15, your SB ceiling jumps from 80 to 120")

### Projection data usage
- Use both CSV types: leaderboard projections for category-level stat line analysis, auction calculator dollars for budget feasibility
- Bundle CSVs into the extension as JSON assets (like PitcherList rankings) — no backend dependency during draft, fast, static until rebuild
- Greedy fill for optimal roster simulation (or Claude's discretion on approach) — must stay within 300ms performance budget
- Unified budget — one pool across hitting and pitching, system determines best allocation

### Sidebar presentation
- Replace/upgrade the current category gap z-scores in Engine Insights with the richer build analysis — these serve the same purpose, the new version is strictly better
- Collapsed by default — full breakdown available but collapsed. User expands when they want to check strategy. Saves space for recommendations
- Horizontal bars showing current vs ceiling vs target per category — similar visual language to existing Engine Insights z-score bars
- Subtle indicator for punt detection — color the category row or add a small icon. Don't shout, user may be intentionally punting

### Claude's Discretion
- Exact archetype label set (how many archetypes, naming)
- Greedy fill algorithm specifics vs lightweight knapsack
- Confidence indicator design (opacity, badge, text)
- When to suppress/show pivot player suggestions based on relevance
- How to handle rate stats (AVG, ERA, WHIP) in ceiling projections — component-based math required

</decisions>

<specifics>
## Specific Ideas

- User's original framing: "if we go all in on a top tier player at one position, that limits us at another position" — the core insight is showing the trade-off, not just current state
- FanGraphs CSVs are already in the project root: `fangraphs-leaderboard-projections-7.csv` (hitters), `fangraphs-leaderboard-projections-8.csv` (pitchers), `fangraphs-auction-calculator.csv` (hitter $), `fangraphs-auction-calculator-2.csv` (pitcher $)
- Hitter projections include: HR, R, RBI, SB, AVG, OPS, PA, AB, H, BB, HBP, SF, TB, plus WAR, ADP, FanGraphs PlayerId, MLBAMID
- Pitcher projections include: W, SV, ERA, WHIP, SO, IP, H, ER, BB, HR, plus WAR, ADP, FanGraphs PlayerId, MLBAMID
- Auction calculator includes SGP points breakdown (mAVG, mRBI, mR, mSB, mOPS for hitters; mW, mSV, mERA, mWHIP, mSO for pitchers) and final Dollars value
- Existing Engine Insights already has the category gap z-score bars and collapsible sections — this replaces that with a strictly richer version
- Must integrate with existing `computeDraftEngine` pure function architecture — new module in `lib/engine/`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-dynamic-build-archetype-analysis*
*Context gathered: 2026-03-04*
