# Phase 29 Context: Ideal Roster Optimizer

## Decisions

### Anchor player classification
The optimizer must classify output players by spend tier to show the user how many expensive vs cheap players their budget supports:
- **Anchor** (>$20 ASV/dollar): Elite cornerstone players the strategy revolves around
- **Core** ($5-20): Solid contributors filling key roster spots
- **Value** (<$5): Cheap fills rounding out the roster

The UI should show a summary like "2 anchors + 5 core + 11 value" so the user knows their budget shape.

### Use existing optimizeRoster() greedy knapsack
The `roster-optimizer.ts` already does greedy SGP/$ efficiency fill with position-aware slot assignment. Phase 29 calls it with the current remaining budget/slots and displays the result — no new optimizer algorithm needed.

### Lock already-drafted players
Pass `input.myRoster` as locked players to `optimizeRoster()` so the ideal roster shows what to do with REMAINING budget and slots, not a from-scratch build.

### External rank boost in optimizer scoring
Apply `computeExternalRankBoost()` to SGP values before passing to the optimizer, consistent with how top targets and shopping list already use it. Expert-ranked players should be preferred in the ideal roster too.

### Show in sidebar as collapsible section
Display as a collapsible `<details>` section in EngineInsights, collapsed by default. Shows the ideal roster grouped by position with player name, dollar value, and anchor/core/value tier tag.

### Recompute on pick count change only
Cache the ideal roster keyed on `allPicks.length` — same invalidation pattern as SGP vectors. No need to recompute on nomination changes.

## Claude's Discretion

- Exact dollar thresholds for anchor/core/value tiers (suggested $20/$5 but can adjust)
- Whether to show total projected SGP for the ideal roster vs current roster
- Layout details within the collapsible section
- Whether anchor count summary appears in the `<summary>` line or inside the expanded content

## Deferred Ideas

- Multiple roster strategies (e.g., "balanced" vs "stars and scrubs") — just show the single greedy-optimal roster
- Category-aware optimization (tilting toward weak categories) — greedy SGP/$ is sufficient for v1
- Opponent-aware optimization (avoiding players opponents will outbid) — too complex for initial version
