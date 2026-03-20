# Draft Simulation Design

## Fantasy Baseball AI Engine

This document defines the architecture and algorithms for the **draft simulation engine** used by the Fantasy Baseball AI system.

The simulator models the remainder of a fantasy draft to estimate how different choices affect final standings.

It supports both:

- **Auction drafts**
- **Snake drafts**

The simulation engine is the core component that converts static player valuations into **forward-looking strategy decisions**.

---

# Goals of the Simulator

The simulator answers questions like:

- If we draft Player A, how does the rest of the draft likely unfold?
- Which available player maximizes our **expected standings points**?
- What is the **risk profile** of each draft decision?
- What are the **probabilities of finishing 1st / top 3 / top 6**?

The system should run **hundreds to thousands of draft simulations** quickly enough to provide real-time advice during a live draft.

Target performance:

```
1000 simulations
< 1 second runtime
```

---

# High-Level Architecture

```
Current Draft State
        ↓
Draft Simulation Engine
        ↓
Monte Carlo Runs
        ↓
Standings Evaluation
        ↓
Expected Outcomes
```

Each simulation represents a **plausible remainder of the draft**.

---

# Draft State Representation

The simulator operates on a complete snapshot of the draft.

DraftState:

```
{
  teams: Team[],
  availablePlayers: Player[],
  draftedPlayers: Player[],
  leagueSettings: LeagueSettings,
  currentPick: number
}
```

Team:

```
{
  id
  budgetRemaining
  roster
  categoryTotals
  needs
}
```

Player:

```
{
  id
  name
  position
  projections
  value
}
```

---

# Simulation Overview

Each simulation performs the following steps:

```
clone draft state
simulate remaining draft picks
complete all rosters
calculate final standings
record results
```

This process repeats hundreds or thousands of times.

---

# Core Simulation Loop

Pseudo-code:

```
for simulation in 1..N:

    state = clone(currentDraftState)

    while draft_not_complete:

        team = team_on_clock(state)

        candidate_players = getCandidatePlayers(state)

        player = choosePlayer(team, candidate_players)

        draftPlayer(state, team, player)

    standings = calculateStandings(state)

    recordResult(standings)
```

---

# Candidate Player Selection

Teams do not consider the entire player pool.

Instead they evaluate a **shortlist of reasonable options**.

Typical shortlist size:

```
top 10–20 players by value
```

Candidate generation:

```
top_value_players
+
players filling positional needs
+
category fit players
```

Example:

```
candidatePlayers =
  topValuePlayers
  ∪ positionalNeeds
  ∪ categoryTargets
```

---

# Team Behavior Model

Each simulated team behaves according to a probabilistic strategy.

Team priorities:

```
player value
roster needs
category balance
positional scarcity
budget constraints
```

Each factor contributes to a **selection score**.

---

# Player Selection Model

Each candidate player receives a score.

Example scoring model:

```
score =
    base_value
  + need_weight
  + scarcity_weight
  + randomness
```

Components:

Base Value:

```
SGP or projected standings impact
```

Need Weight:

```
boost categories team lacks
```

Scarcity Weight:

```
boost positions running out
```

Randomness:

```
introduces variability
```

---

# Probabilistic Player Selection

Instead of deterministic selection, teams pick probabilistically.

Example:

```
P(select player) ∝ score
```

Implementation:

```
softmax(score)
```

This creates realistic variation between simulations.

---

# Auction Draft Simulation

Auction drafts require modeling **bidding behavior**.

Each team determines:

```
maximum willingness to pay
```

Formula:

```
maxBid = playerValue
       × teamNeedMultiplier
       × inflation
```

Teams participate in bidding until price exceeds their max bid.

Auction process:

```
teams enter bidding
price increases incrementally
teams drop out when maxBid reached
highest remaining bidder wins
```

---

# Budget Awareness

Teams must preserve money for remaining roster spots.

Budget constraint:

```
minBudgetReserve = rosterSpotsRemaining × $1
```

Maximum bid:

```
maxBid = min(
    theoreticalPlayerValue,
    budgetRemaining - minBudgetReserve
)
```

This prevents unrealistic spending.

---

# Positional Run Modeling

When positions begin to thin out, teams react.

Example:

```
remainingSS = 3
teamsNeedingSS = 5
```

Scarcity factor increases.

Adjustment:

```
scarcityMultiplier = teamsNeeding / remainingPlayers
```

This produces realistic **position runs**.

---

# Category Balance Model

Teams track projected category totals.

Example:

```
teamSB = 40
targetSB = 120
```

Deficit:

```
SB_deficit = 80
```

Players contributing to weak categories receive score boosts.

Category weight:

```
categoryWeight = deficit / target
```

Adjusted player value:

```
adjustedValue = baseValue × categoryWeight
```

---

# Draft Completion

The simulation continues until all teams have full rosters.

End condition:

```
all roster slots filled
```

or

```
no eligible players remain
```

---

# Standings Calculation

After a simulated draft completes:

1. Aggregate each team's projected stats.
2. Rank teams by category.
3. Assign roto points.

Example:

```
1st place HR → 12 points
2nd place HR → 11 points
...
12th place HR → 1 point
```

Total standings score:

```
sum(category_points)
```

---

# Simulation Output Metrics

Each candidate player produces aggregated metrics.

Example:

```
Draft Player X

Average Finish: 3.4
Win Probability: 21%
Top 3 Probability: 59%
Top 6 Probability: 82%
```

These values guide the draft recommendation.

---

# Decision Selection

The AI compares outcomes across candidate players.

Example:

```
Player A → avg finish 3.4
Player B → avg finish 3.1
Player C → avg finish 3.6
```

Best choice:

```
Player B
```

Because it produces the highest expected standings finish.

---

# Performance Optimizations

To ensure real-time performance:

Use:

```
parallel simulations
cached player valuations
reduced candidate player pools
incremental draft state updates
```

Typical configuration:

```
300–1000 simulations
10–15 candidate players
~200–400 ms runtime
```

---

# Opponent Modeling (Future Enhancement)

More advanced simulations can model specific opponents.

Example parameters:

```
risk tolerance
positional preference
rookie bias
spending aggressiveness
```

Opponent profiles create more realistic simulations.

---

# Reinforcement Learning Extension

Future versions may train AI agents using reinforcement learning.

Process:

```
simulate thousands of full seasons
optimize draft strategies
learn bidding patterns
```

This could eventually produce **self-improving draft strategies**.

---

# Key Design Principles

The draft simulator should emphasize:

```
speed
realistic team behavior
probabilistic outcomes
strategic forecasting
```

The simulator transforms the system from a **static ranking tool** into a **forward-looking decision engine**.

This is the core advantage of the Fantasy Baseball AI system.
