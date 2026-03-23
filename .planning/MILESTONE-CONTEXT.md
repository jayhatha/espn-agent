# v6.0 Milestone Context

## Vision

In-season command center — a Linear-style dark trading terminal for fantasy baseball. Single command-center screen with left navigation, top summary, center decision tools, right contextual signals.

## Features

1. **On-Pace Tracker** — Standings-driven roto point projections. Live standings as primary, historical curves as fallback. Per-category projected totals, expected roto points, marginal gains needed to move up. "Standings Points at Risk" summary.
2. **Category Opportunity Map** — Strategic brain: gap to next roto point per category, difficulty rating, priority stars. Hover shows teams above/below + exact stat gaps.
3. **FAAB Pacing** — Budget vs league avg, spend-rate projection, bid history + ROI, suggested bid amounts based on remaining budget and weeks left.
4. **GS Pacing** — Weekly + season GS usage, projected pace vs 200 cap, SP start planner (which SPs to start/sit to optimize pace).
5. **Improved Waiver Analysis** — Net roto point delta (add player minus drop player), per-category breakdown, marginal analysis ("this move gets you +1 roto point in SB"). Accounts for lost rankings points from dropped player.
6. **Trade Analysis Rework** — Same roto-point treatment as waivers + automatic trade finder that scans all teams for beneficial swaps.
7. **Full Dark Restyle** — Rip out editorial DM Serif design, go full Linear-style dark dashboard across all pages.
8. **Hot/Cold Players** — 7-day trend panel showing roster players trending up/down.
9. **Lineup Efficiency** — Bench production tracking (missed HR, SB, OPS from benched players).

## UI Concept

### Layout
```
┌──────────────────────────────────────────────────────────────────────┐
│ Top Bar: League | Date | FAAB Remaining | GS Pace | Projected Points │
├──────────────┬─────────────────────────────────────────────────────┬─────────┤
│              │                                                     │         │
│ Left Nav     │ Main Dashboard Area                                │ Right   │
│              │   1. Projected Standings                            │ Signals │
│              │   2. Category Opportunity Map                      │ Panel   │
│              │   3. Category Pace                                 │         │
└──────────────┴─────────────────────────────────────────────────────┴─────────┘
```

### Color Palette (Linear-style dark)
- Background: #0B0D10
- Panel: #111318
- Border: #1D2128
- Primary text: #E6EDF3
- Secondary text: #9DA7B3
- Accent: #7C9CFF
- Positive: #3FB950
- Negative: #F85149
- Warning: #E3B341

### Typography
- Headers: Inter / 16-18px
- Body: Inter / 13-14px
- Numbers: JetBrains Mono (monospace for readability)

### Spacing
- 8px base, 16px panel padding, 24px section spacing

### Left Nav Pages
Dashboard, Standings, Categories, Roster, Waivers, FAAB Market, Pitching Usage, Trades, Settings

### Interaction
- Hover expansion on category rows (teams above/below, stat gaps)
- Click drilldown (SB → leaderboard + ROS projections + recommended pickups)
- Player hover anywhere (ROS projection, recent trend, waiver replacement)

## Scope Decisions
- Tracker and recommendations are **separate views** (tracker informs but doesn't drive recs)
- Live standings primary, historical curves fallback for roto point conversion
- v5.0 phases 47 (Endgame Mode) and 51 (Data Pipeline) **dropped entirely**
