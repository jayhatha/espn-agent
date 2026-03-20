# Fantasy Baseball AI Engine

## Algorithms & Modeling Guide

This document defines the mathematical and simulation models that power the Fantasy Baseball AI decision engine.

These algorithms operate independently of the orchestration layer (Mastra).
Mastra coordinates workflows and agent reasoning, but these models provide the **core quantitative inputs**.

---

# Overview

The system converts raw projections into actionable draft decisions using the following pipeline:

```
Player Projections
      ↓
Category Z-Scores
      ↓
Standings Gain Points (SGP)
      ↓
Positional Scarcity Adjustment
      ↓
Auction Inflation Adjustment
      ↓
Monte Carlo Draft Simulation
      ↓
Expected Standings Impact
```

Each step transforms raw projections into progressively more realistic value estimates.

---

# Player Projection Model

Input projections should include at minimum:

### Hitters

```
R
HR
RBI
SB
AVG
PA
```

### Pitchers

```
W
SV
K
ERA
WHIP
IP
```

Projection sources may include:

- Steamer
- ATC
- ZiPS
- blended projections

The system should support **projection blending**.

Example:

```
blended_projection = (0.5 * ATC) + (0.3 * Steamer) + (0.2 * ZiPS)
```

---

# Z-Score Calculation

Z-scores normalize player performance relative to the league.

Formula:

```
z = (player_stat − league_mean) / league_std_dev
```

Example:

```
HR_mean = 18
HR_std = 9

Player HR = 36

z = (36 − 18) / 9 = 2.0
```

Interpretation:

```
z = 2.0 → elite category contribution
z = 0 → league average
z < 0 → below replacement
```

Total hitter value:

```
z_total = z_R + z_HR + z_RBI + z_SB + z_AVG
```

Pitcher value:

```
z_total = z_W + z_SV + z_K + z_ERA + z_WHIP
```

Rate stats must be **weighted by playing time**.

Example:

```
AVG contribution = (player_AVG − league_AVG) * PA
```

---

# Standings Gain Points (SGP)

SGP translates raw statistics into **expected movement in league standings**.

Instead of evaluating raw stats, we measure:

```
How many stats equal 1 standings point?
```

Example roto league results might show:

```
10 HR = +1 standings point
12 SB = +1 standings point
40 RBI = +1 standings point
```

Player contribution:

```
SGP_HR = player_HR / HR_per_point
SGP_SB = player_SB / SB_per_point
```

Example:

```
Player HR = 30
HR_per_point = 10

SGP_HR = 3.0
```

Total hitter value:

```
SGP_total = SGP_R + SGP_HR + SGP_RBI + SGP_SB + SGP_AVG
```

This produces a **league-context value metric**.

---

# Replacement Level

Replacement level defines the baseline value of a roster slot.

Example:

```
12 teams
1 catcher each
```

Replacement catcher ≈ 12th best catcher.

Calculation:

```
replacement_value = value of last rostered player at position
```

Player marginal value:

```
marginal_value = player_value − replacement_value
```

Scarcity emerges naturally from this calculation.

---

# Positional Scarcity Adjustment

Scarcity changes during the draft.

Track:

```
remaining players
remaining roster slots
```

Scarcity score:

```
scarcity = remaining_slots / remaining_players
```

Adjusted player value:

```
adjusted_value = base_value * scarcity_multiplier
```

Example multiplier logic:

```
if position nearing depletion:
    multiplier = 1.1 – 1.3
else:
    multiplier = 1.0
```

This prevents being locked out of scarce positions.

---

# Auction Inflation

During auctions, the remaining money may exceed the remaining player value.

Inflation formula:

```
inflation = remaining_money / remaining_player_value
```

Example:

```
remaining money = $1600
remaining player value = $1400

inflation = 1.14
```

Adjusted prices:

```
inflated_price = base_price * inflation
```

Inflation should update after every purchase.

---

# Team Category Balance Model

Teams must balance category contributions.

Define category targets:

```
target_HR
target_SB
target_RBI
target_R
target_AVG
```

Team deficits:

```
deficit = target − current_team_projection
```

Category weight:

```
weight = deficit / target
```

Players contributing to weak categories gain value.

Example:

```
team weak in SB

SB weight = 1.3
```

Adjusted SGP:

```
weighted_SGP_SB = SGP_SB * weight
```

---

# Draft Simulation (Monte Carlo)

The simulator estimates the outcome of future draft decisions.

Process:

```
simulate remaining draft
fill rosters
compute standings outcomes
repeat many times
```

Typical run:

```
1000 simulations
```

---

# Simulation Algorithm

Pseudo-code:

```
for i in simulations:

    clone draft state

    while draft not complete:

        determine team on clock
        determine candidate players
        evaluate value + team need
        select player probabilistically

    compute standings
    record team finish
```

Probability model:

```
P(select player) ∝ player_value
```

---

# Expected Standings Value

After simulations, measure:

```
average final standings
probability of finishing 1st
probability of top 3
```

Example output:

```
Draft Player A

Expected Finish: 3.1
Win Probability: 22%
Top 3 Probability: 61%
```

Compare across candidate players.

---

# Nomination Strategy Model

Goal:

```
force opponents to spend money
```

Identify:

```
teams needing specific positions
high hype players
closer runs
```

Nominate players likely to trigger bidding wars.

Heuristics:

```
expensive players we don't want
positions opponents need
rookies with hype
```

---

# Trade Evaluation Model

Simulate roster with trade applied.

Steps:

```
apply trade
recalculate projections
recompute SGP
simulate rest-of-season
```

Output:

```
expected standings change
```

Example:

```
Trade improves standings by +1.8 points
```

---

# Performance Optimization

Simulation must be fast enough for live drafts.

Target:

```
decision latency < 1 second
```

Techniques:

```
parallel simulations
precomputed player values
cached roster projections
reduced player pool
```

Typical configuration:

```
1000 simulations
~200ms runtime
```

---

# Model Validation

Evaluate accuracy using historical drafts.

Procedure:

```
replay historical drafts
run AI decisions
compare final standings
```

Metrics:

```
expected vs actual standings
player ROI
draft efficiency
```

---

# Future Enhancements

Possible improvements:

```
injury risk modeling
prospect volatility modeling
playing time uncertainty
opponent behavior modeling
```

Advanced feature:

```
reinforcement learning draft agents
```

These models could learn optimal draft strategies over thousands of simulated seasons.

---

# Design Philosophy

The system should combine:

```
statistical modeling
economic modeling
game simulation
strategic reasoning
```

Math determines **value**.

Simulation determines **future impact**.

Agents determine **strategy**.
