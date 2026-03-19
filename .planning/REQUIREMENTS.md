# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-03-15
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.

## v5.0 Requirements

Requirements for v5.0 Draft Engine Spec Alignment. Each maps to roadmap phases.

### Endgame & Budget

- [ ] **END-01**: Engine activates endgame mode when budget_remaining ≤ $20, switching to value_per_dollar scoring
- [ ] **END-02**: Budget allocation bands enforced: Hitters $185-205, Pitchers $55-70, Bench $5
- [ ] **END-03**: Endgame prioritizes breakout hitters, cheap OF, and K pitchers; avoids backup C and weak OPS

### Nomination

- [x] **NOM-07**: Nomination strategy uses espn_price - model_value to nominate overpriced players early
- [x] **NOM-08**: Nomination strategy goal is to force league overspending and increase inflation

### Positional & Pitching

- [x] **POS-01**: Positional priority weights applied: SS +4, OF +3, 3B +3, 1B +2, 2B +2, C +1
- [x] **POS-02**: SP tier caps enforced: SP1 $12-18, SP2 $8-12, SP3 $6-10, SP4 $3-5, SP5 $1-3
- [x] **POS-03**: 200 GS cap awareness in pitching strategy (limit SP spending)

### Phase 60: SP Logic Audit

- [x] **SP-TIER**: SP tier cap determined by PitcherList rank (1-20→$18, 21-30→$12, 31-40→$10, 41-60→$5, 61+→$3)
- [x] **SP-SAVINGS**: SP savings reallocation uses per-SP rank-based tier caps, not slot-position ideal
- [x] **SP-COMP**: Target 7SP+5RP composition in draft strategy
- [x] **RP-CAP**: RP hard cap $15 even with SP savings reallocation
- [x] **PITCHER-SGP**: No pitcher SGP multiplier in bid pipeline
- [x] **HIT-PITCH-CONFLICT**: Pitching vs hitting conflict audit documented with recommendations

### Inflation & Signals

- [x] **INF-01**: Inflation interpretation bands: <1.00 overspending, 1.00-1.05 neutral, 1.05-1.15 buying window, >1.15 strong value
- [x] **INF-02**: Bid ceiling adjusts based on inflation bands (+2 when inflation > 1.10)
- [x] **INF-03**: Category targets: OPS top 3, HR top 3, SB top 4, Saves top 4, K top 5

### Data Pipeline

- [ ] **DATA-01**: Easy way to load FanGraphs projections into the extension (CSV upload or paste)
- [ ] **DATA-02**: Easy way to load ESPN auction values into the extension (scrape from DOM or CSV)

## Previous Requirements (Completed)

### v4.0 (Completed)
- [x] **SIMP-01** through **SIMP-03**: Auth stripped, env var ESPN creds
- [x] **CONF-01** through **CONF-04**: League 112523 hardcoded, OPS math
- [x] **DFIX-01** through **DFIX-03**: Draft detection fixed
- [x] **SEAS-01** through **SEAS-04**: In-season pipeline verified

### v3.0 (Completed)
- [x] **DEV-01** through **DEV-03**: DevTools MCP
- [x] **NOM-01** through **NOM-06**: Auto-nomination rework
- [x] **MOB-01** through **MOB-14**: Mobile command center

## Future Requirements

- **AGT-01** through **AGT-03**: Mastra AI agent
- **MULTI-01** through **MULTI-03**: Multi-user re-enablement
- **FMT-01**, **FMT-02**: Snake draft, Points/H2H

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replace simulation-based BID/PASS | Win probability approach is more sophisticated than spec's formula |
| Replace SGP bid optimizer | Binary search SGP-based is more accurate than model_value - 2 |
| Auction simulator test harness | Nice-to-have but not needed for live draft use |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| END-01 | Phase 47 | Pending |
| END-02 | Phase 47 | Pending |
| END-03 | Phase 47 | Pending |
| NOM-07 | Phase 48 | Complete |
| NOM-08 | Phase 48 | Complete |
| POS-01 | Phase 49 | Complete |
| POS-02 | Phase 49 | Complete |
| POS-03 | Phase 49 | Complete |
| INF-01 | Phase 50 | Complete |
| INF-02 | Phase 50 | Complete |
| INF-03 | Phase 50 | Complete |
| DATA-01 | Phase 51 | Pending |
| DATA-02 | Phase 51 | Pending |
| SP-TIER | Phase 60 | Complete |
| SP-SAVINGS | Phase 60 | Complete |
| SP-COMP | Phase 60 | Complete |
| RP-CAP | Phase 60 | Complete |
| PITCHER-SGP | Phase 60 | Complete |
| HIT-PITCH-CONFLICT | Phase 60 | Complete |

**Coverage:**
- v5.0 requirements: 13 total
- Phase 60 requirements: 6 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
