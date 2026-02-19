# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-02-19
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can create account with email and password
- [ ] **AUTH-02**: User can log in and stay logged in across sessions (JWT)
- [ ] **AUTH-03**: User can log in via Google OAuth
- [ ] **AUTH-04**: User can log in via GitHub OAuth
- [ ] **AUTH-05**: New user sees guided onboarding (connect league → upload projections → view dashboard)

### Data Quality

- [x] **DATA-01**: ESPN auth cookies encrypted at rest in database
- [x] **DATA-02**: PlayerIdentityResolution wired into projections ingest with fuzzy matching
- [x] **DATA-03**: Free agent pool fetched from ESPN and available for recommendations
- [x] **DATA-04**: Rate stat component math works correctly in trade simulations
- [x] **DATA-05**: ESPN API calls retry with exponential backoff on failure
- [x] **DATA-06**: League transactions ingested from ESPN and stored in timeline

### Dashboard

- [ ] **DASH-01**: User sees team dashboard with health overview, strengths, and weaknesses
- [ ] **DASH-02**: User sees category trend charts (Recharts) instead of tables
- [ ] **DASH-03**: User sees daily action items with ESPN deep links
- [ ] **DASH-04**: User sees category scarcity analysis (surplus/deficit per category)
- [ ] **DASH-05**: Frontend uses shared component library (no duplicated UI)
- [x] **DASH-06**: Frontend uses centralized API client (no hardcoded localhost)

### Recommendations

- [ ] **RECC-01**: User sees waiver add/drop recommendations using real free agent pool
- [ ] **RECC-02**: User sees 1-for-1 trade candidates with accurate projected impact
- [ ] **RECC-03**: User sees daily lineup optimization (start/sit recommendations)
- [ ] **RECC-04**: User sees streaming pitcher suggestions for favorable matchups

### Draft

- [ ] **DRFT-01**: User sees pre-draft rankings with positional scarcity analysis
- [ ] **DRFT-02**: User sees auction valuations based on projected stats

### Infrastructure

- [x] **INFR-01**: All API routes enforce authentication and league ownership
- [x] **INFR-02**: API has rate limiting to prevent abuse
- [x] **INFR-03**: Snapshot orchestrator has job locking to prevent concurrent runs

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Historical Analysis

- **HIST-01**: Past season data backfilled from ESPN
- **HIST-02**: Season replay timeline (week-by-week standings evolution)
- **HIST-03**: What-if counterfactual analysis (what if I kept Player X?)
- **HIST-04**: Trade retrospective (how did past trades impact final standings?)

### Advanced Features

- **ADVF-01**: Multi-player trade scenarios (2-for-2, 3-for-1)
- **ADVF-02**: Custom stat category support (QS, K/9, OPS+)
- **ADVF-03**: Points league support
- **ADVF-04**: Player news feed aggregation (injuries, lineup changes)
- **ADVF-05**: Custom alerts (email/push when player hits waivers)
- **ADVF-06**: Keeper/dynasty valuations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated ESPN roster moves | ESPN has no official write API; ToS risk |
| Cross-platform (Yahoo, Fantrax) | ESPN-only keeps scope manageable for v1 |
| Native mobile app | Responsive web covers mobile; PWA sufficient |
| In-app chat / social features | ESPN already has league message boards |
| Real-time live scoring | ESPN doesn't expose real-time feeds reliably |
| Dynasty/keeper features | Different paradigm; defer to v2 if demand exists |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DASH-05 | Phase 1 | Pending |
| DASH-06 | Phase 1 | Complete |
| RECC-01 | Phase 3 | Pending |
| RECC-02 | Phase 3 | Pending |
| RECC-03 | Phase 4 | Pending |
| RECC-04 | Phase 4 | Pending |
| DRFT-01 | Phase 4 | Pending |
| DRFT-02 | Phase 4 | Pending |
| INFR-01 | Phase 1 | Complete |
| INFR-02 | Phase 1 | Complete |
| INFR-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
