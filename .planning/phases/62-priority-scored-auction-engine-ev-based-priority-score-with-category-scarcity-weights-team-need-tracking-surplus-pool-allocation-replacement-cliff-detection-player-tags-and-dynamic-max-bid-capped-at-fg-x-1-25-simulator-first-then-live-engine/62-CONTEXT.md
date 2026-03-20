# Phase 62 Context: Priority-Scored Auction Engine

## Decisions (LOCKED)

### Core Scoring Model
1. **Replace SGP blend with EV-based priority scoring.** The new bid formula is: `priority_score = EV × category_weight × scarcity_weight × team_need_weight`. EV = FG_Dollars - ESPN_ASV. This replaces the current 60/40 SGP/ASV blend entirely.

2. **Max bid = inflated FG$ + EV buffer + category bonus, hard capped at FG$ × 1.25.** Never bid more than 125% of FanGraphs value. The EV buffer rewards market inefficiency; the category bonus rewards scarce-category contributors.

3. **Category weights: SB=1.5, SV=1.4, SP_efficiency=1.3, OPS=1.2, HR/RBI/R=1.0.** These reflect our league's scarcity profile. SB and SV are hardest to acquire; OPS is our rate stat.

4. **Scarcity weight updates dynamically:** `scarcity_weight = 1 + (1 - remaining_supply_ratio)` where remaining_supply_ratio = remaining pool stat total / initial pool stat total. As SB contributors get drafted, SB scarcity weight increases.

5. **Team need weight updates per pick:** `team_need_weight = 1 + max(0, (target - current_projection) / target)`. If we're behind pace on SB, SB contributors get bid up.

### Player Tags
6. **Tag players for quick identification:**
   - `is_SB_anchor`: SB >= 20 projected
   - `is_OPS_anchor`: OPS >= .850
   - `is_SP_anchor`: high K rate AND ERA < league avg AND WHIP < league avg
   - `is_closer`: SV > 20 projected
   - `is_replaceable_bat`: SB < 5 AND OPS < .800

### Surplus Pool
7. **Track surplus from bargain purchases.** When we win a player below FG$, the savings go into a surplus pool. Allocate 30-50% of surplus toward the next 2-3 highest priority targets.

### Replacement Cliff Detection
8. **Detect when the next-best player at a position/category drops off sharply.** `dropoff = player_value - next_best_value`. If dropoff is large, add a cliff bonus to max bid — this player is worth reaching for.

### Category Pace Tracking
9. **Track pace vs targets for each category.** `pace = current_total / target_total`. Below 85% → increase category weight. Above 105% → decrease weight. Below 80% mid-draft → force acquisition trigger.

### Hard Caps (preserved from previous work)
10. **SP max $18, RP max $15.** These hard caps remain regardless of priority score.
11. **Hitter budget cap $200.** Total hitter spend cannot exceed $200.
12. **Per-player hitter cap at FG$ × 1.25.** Replaces the old flat $30 cap.

### Build Target: Engine Only
13. **Implement in the live extension engine only.** Do NOT touch the simulator. Write thorough unit and integration tests instead. Simulator will be rebuilt afterward to match.

### Data Sources
14. **FG$ from fangraphs-auction-hitters.json and fangraphs-auction-pitchers.json.** ESPN ASV from combined-draft-values.csv / espn-predraft-values.json (take max of ASV and pre-draft). These are already loaded by the extension.

## Claude's Discretion

- How to structure the priority score computation (new module vs extending existing bid-optimizer.ts)
- Whether to compute EV in bid-optimizer or in a pre-processing step
- How to persist category pace tracking across picks (store state vs recompute)
- Test structure — whether to extend existing bid-ceiling.test.ts or create new test files
- How many plans to split this into (suggest 3-4: core scoring, category tracking, surplus/cliffs, tests)

## Deferred Ideas

- Simulator rebuild (separate future phase)
- UI changes for category tracker/alerts (separate future phase)
- Opponent modeling (out of scope)
