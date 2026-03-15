# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-03-15
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.

## v4.0 Requirements

Requirements for v4.0 Personal Season Setup. Each maps to roadmap phases.

### Simplification

- [x] **SIMP-01**: API routes respond without authentication (no JWT, no cookie check)
- [x] **SIMP-02**: Frontend pages load without login redirect (no auth guard)
- [x] **SIMP-03**: ESPN credentials loaded from env vars (ESPN_SWID, ESPN_S2) with DB fallback

### League Configuration

- [x] **CONF-01**: League 112523, team 13, 13 teams hardcoded as default config
- [x] **CONF-02**: Categories hardcoded: R, RBI, HR, SB, OPS / K, W, SV, ERA, WHIP
- [x] **CONF-03**: OPS wired as rate stat in component math (OBP + SLG)
- [ ] **CONF-04**: Extension uses hardcoded league config as primary, DOM detection as validation

### Draft Fixes

- [ ] **DFIX-01**: Extension correctly detects user's own picks (myRoster populated accurately)
- [ ] **DFIX-02**: Team detection works on page load (not race-condition dependent)
- [ ] **DFIX-03**: Config detection (team count, categories, roster slots) succeeds reliably

### In-Season Pipeline

- [x] **SEAS-01**: Daily snapshot pipeline runs and produces projected standings for league 112523
- [x] **SEAS-02**: Waiver recommendations return ranked add/drop suggestions
- [x] **SEAS-03**: Trade analysis evaluates proposed trades with accurate projected impact
- [x] **SEAS-04**: Frontend dashboard shows standings, trends, and recommendations without auth

## v3.0 Requirements (Completed)

### DevTools & Tooling
- [x] **DEV-01**: Chrome DevTools MCP server configured
- [x] **DEV-02**: ESPN draft DOM inspection via MCP
- [x] **DEV-03**: Documented selector map of stable ESPN DOM targets

### Auto-Nomination
- [x] **NOM-01** through **NOM-06**: Verified selectors, turn detection, search-and-queue, diagnostics

### Mobile Command Center
- [x] **MOB-01** through **MOB-14**: Full mobile draft controls, engine signals, tabbed layout

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### AI Agent
- **AGT-01**: Mastra AI agent with tools for draft engine signals
- **AGT-02**: Agent memory for draft session context
- **AGT-03**: Streaming agent responses in extension sidebar

### Multi-User
- **MULTI-01**: Re-enable JWT auth with multi-user support
- **MULTI-02**: League configuration UI (replace hardcoded settings)
- **MULTI-03**: User onboarding wizard

### Draft Formats
- **FMT-01**: Snake draft support
- **FMT-02**: Points/H2H league support

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user auth | Stripped for v4.0 personal use — re-enable in future |
| League config UI | Hardcoded for now — add when going multi-user |
| React fiber probe | CSS/data-attr selectors proven sufficient via MCP |
| Mobile authentication | App is local-network only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIMP-01 | Phase 43 | Complete |
| SIMP-02 | Phase 43 | Complete |
| SIMP-03 | Phase 43 | Complete |
| CONF-01 | Phase 44 | Complete |
| CONF-02 | Phase 44 | Complete |
| CONF-03 | Phase 44 | Complete |
| CONF-04 | Phase 45 | Pending |
| DFIX-01 | Phase 45 | Pending |
| DFIX-02 | Phase 45 | Pending |
| DFIX-03 | Phase 45 | Pending |
| SEAS-01 | Phase 46 | Complete |
| SEAS-02 | Phase 46 | Complete |
| SEAS-03 | Phase 46 | Complete |
| SEAS-04 | Phase 46 | Complete |

**Coverage:**
- v4.0 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-15*
