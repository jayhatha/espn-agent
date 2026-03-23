# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-03-23
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions

## v6.0 Requirements

Requirements for the In-Season Command Center milestone.

### Dark Mode & Shell

- [x] **SHELL-01**: Dashboard uses Linear-style dark palette (#0B0D10 background, #111318 panels, #1D2128 borders)
- [x] **SHELL-02**: Left nav with icon + label navigation (Dashboard, Standings, Categories, Roster, Waivers, FAAB Market, Pitching Usage, Trades, Settings)
- [x] **SHELL-03**: Top bar shows league name, week, FAAB remaining, GS pace, projected total points
- [x] **SHELL-04**: Right signals panel with contextual daily action items
- [x] **SHELL-05**: Typography uses Inter for text, JetBrains Mono for numbers
- [ ] **SHELL-06**: All existing dashboard pages restyled to dark theme (no light mode remnants)
- [x] **SHELL-07**: 8px base spacing, 16px panel padding, 24px section spacing

### Roto Tracker

- [ ] **ROTO-01**: Projected standings table shows all 13 teams with current points, projected points, and change
- [ ] **ROTO-02**: Roto points computed from live standings (rank my projected totals against all teams' projected totals)
- [ ] **ROTO-03**: Historical category curves used as fallback when live standings unavailable
- [ ] **ROTO-04**: Category opportunity map shows gap to +1 and +2 roto points per category with difficulty rating
- [ ] **ROTO-05**: Marginal gain engine computes cheapest path to next roto point per category
- [ ] **ROTO-06**: "Standings Points at Risk" summary shows categories where points could be gained or lost
- [ ] **ROTO-07**: Category pace bars show current vs target with progress visualization
- [ ] **ROTO-08**: Hover on category row shows teams above/below and exact stat gaps

### Waiver Analysis

- [ ] **WAIVER-01**: Net roto point delta accounts for both added player projection AND dropped player loss
- [ ] **WAIVER-02**: Per-category breakdown shows which categories improve and which get worse
- [ ] **WAIVER-03**: Marginal analysis shows "this move gets you +N roto points in category X"
- [ ] **WAIVER-04**: Fix hardcoded 0.5 deltaOverallPoints in WaiverRecommendationAgent with real computation
- [ ] **WAIVER-05**: Rate stat adjustments (ERA, WHIP, OPS) use component math for add/drop simulation

### FAAB Pacing

- [ ] **FAAB-01**: Show my remaining FAAB budget vs league average remaining
- [ ] **FAAB-02**: Spend-rate projection showing if budget will run out before season ends
- [ ] **FAAB-03**: Bid history with won/lost outcomes per claim
- [ ] **FAAB-04**: ROI scoring (player value gained per FAAB dollar spent)
- [ ] **FAAB-05**: Suggested bid amounts based on remaining budget, weeks left, and player value

### Pitching Usage

- [ ] **PITCH-01**: Season GS tracker showing used vs 200 cap with projected pace
- [ ] **PITCH-02**: Weekly GS usage showing this week's starts and remaining
- [ ] **PITCH-03**: K/GS ratio tracking per pitcher to identify streaming value
- [ ] **PITCH-04**: SP start planner recommending which SPs to start/sit to optimize GS pace
- [ ] **PITCH-05**: Alert when GS pace is burning too fast or leaving starts unused

### Trade Analysis

- [ ] **TRADE-01**: Trade impact shows net roto point delta (same treatment as waiver analysis)
- [ ] **TRADE-02**: Per-category breakdown for proposed trades
- [ ] **TRADE-03**: Automatic trade finder scans all teams for roto-point-positive 1-for-1 swaps
- [ ] **TRADE-04**: Trade finder results ranked by net roto points gained
- [ ] **TRADE-05**: Rate stat adjustments use component math (not counting stats only)

### Trends & Efficiency

- [ ] **TREND-01**: Hot/cold player panel showing 7-day trend for roster players
- [ ] **TREND-02**: Hot players highlighted by OPS surge, HR burst, K spike
- [ ] **TREND-03**: Cold players flagged with declining production
- [ ] **TREND-04**: Lineup efficiency tracks bench production (missed HR, SB, OPS from benched players)
- [ ] **TREND-05**: Warning indicator when significant production is being left on the bench

## Future Requirements

### Advanced Analytics
- **ADV-01**: Injury-adjusted projections (discount players on IL)
- **ADV-02**: Schedule-strength adjustments per category
- **ADV-03**: Opponent schedule tracking for streaming pitcher recommendations
- **ADV-04**: Multi-player trade evaluation (2-for-2, 3-for-2) with roto delta

## Out of Scope

| Feature | Reason |
|---------|--------|
| Points/H2H league support | Different scoring paradigm — roto only |
| Snake draft features | Season is in auction mode only |
| Real-time ESPN updates | ESPN API is read-only, batch snapshot model sufficient |
| Mobile-specific in-season app | Desktop command center first, responsive later |
| AI agent chat interface | Deferred to future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | Phase 65 | Complete |
| SHELL-02 | Phase 65 | Complete |
| SHELL-03 | Phase 65 | Complete |
| SHELL-04 | Phase 65 | Complete |
| SHELL-05 | Phase 65 | Complete |
| SHELL-06 | Phase 65 | Pending |
| SHELL-07 | Phase 65 | Complete |
| ROTO-01 | Phase 66 | Pending |
| ROTO-02 | Phase 66 | Pending |
| ROTO-03 | Phase 66 | Pending |
| ROTO-05 | Phase 66 | Pending |
| ROTO-07 | Phase 66 | Pending |
| ROTO-08 | Phase 66 | Pending |
| ROTO-04 | Phase 67 | Pending |
| ROTO-06 | Phase 67 | Pending |
| WAIVER-01 | Phase 67 | Pending |
| WAIVER-02 | Phase 67 | Pending |
| WAIVER-03 | Phase 67 | Pending |
| WAIVER-04 | Phase 67 | Pending |
| WAIVER-05 | Phase 67 | Pending |
| FAAB-01 | Phase 68 | Pending |
| FAAB-02 | Phase 68 | Pending |
| FAAB-03 | Phase 68 | Pending |
| FAAB-04 | Phase 68 | Pending |
| FAAB-05 | Phase 68 | Pending |
| PITCH-01 | Phase 68 | Pending |
| PITCH-02 | Phase 68 | Pending |
| PITCH-03 | Phase 68 | Pending |
| PITCH-04 | Phase 68 | Pending |
| PITCH-05 | Phase 68 | Pending |
| TRADE-01 | Phase 69 | Pending |
| TRADE-02 | Phase 69 | Pending |
| TRADE-03 | Phase 69 | Pending |
| TRADE-04 | Phase 69 | Pending |
| TRADE-05 | Phase 69 | Pending |
| TREND-01 | Phase 70 | Pending |
| TREND-02 | Phase 70 | Pending |
| TREND-03 | Phase 70 | Pending |
| TREND-04 | Phase 70 | Pending |
| TREND-05 | Phase 70 | Pending |

**Coverage:**
- v6.0 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation — all 35 requirements mapped*
