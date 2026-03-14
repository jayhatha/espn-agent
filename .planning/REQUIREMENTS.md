# Requirements: ESPN Fantasy Baseball Command Center

**Defined:** 2026-03-14
**Core Value:** Give fantasy baseball managers an information edge that saves time and leads to better decisions — see things other managers don't, act faster, finish higher.

## v3.0 Requirements

Requirements for v3.0 Draft Automation & Mobile Command Center. Each maps to roadmap phases.

### DevTools & Tooling

- [ ] **DEV-01**: User can configure Chrome DevTools MCP server in `.mcp.json` for live ESPN DOM inspection
- [ ] **DEV-02**: User can inspect ESPN draft page DOM elements and attributes via MCP tools during development
- [ ] **DEV-03**: User can produce a documented selector map of stable ESPN DOM targets (data-*, aria-*, structural selectors)

### Auto-Nomination

- [x] **NOM-01**: Extension uses verified ESPN selectors from DEV-03 for all nomination DOM interactions
- [x] **NOM-02**: Turn detection correctly identifies when it's user's turn to nominate using consolidated strategy
- [x] **NOM-03**: Search-and-queue flow reliably finds players, types into ESPN search, and clicks queue button
- [x] **NOM-04**: Nomination state machine is consolidated with clear state transitions and cooldown management
- [x] **NOM-05**: Selector fallback hierarchy gracefully degrades when primary selectors fail
- [x] **NOM-06**: Nomination diagnostics panel reflects reworked flow with accurate status reporting

### Mobile Command Center

- [ ] **MOB-01**: Mobile page displays category progress with targets for all scoring categories
- [ ] **MOB-02**: Mobile page displays ideal roster with tier badges and locked player indicators
- [ ] **MOB-03**: Mobile page displays win probability, build archetype, and scarcity alerts
- [ ] **MOB-04**: Mobile page has auto-bid toggle with visual risk indicator
- [x] **MOB-05**: Mobile page has auto-nominate toggle control
- [ ] **MOB-06**: Mobile page has hitter/pitcher split slider control
- [ ] **MOB-07**: Mobile page has force-nominate button to trigger immediate nomination from phone
- [x] **MOB-08**: Mobile page has skip-player button to exclude current player from engine recommendations
- [ ] **MOB-09**: Mobile page displays current nomination queue and allows reordering
- [ ] **MOB-10**: Mobile page uses tabbed/sectioned responsive layout optimized for phone screens
- [ ] **MOB-11**: Mobile page uses Screen Wake Lock API to prevent screen dimming during draft
- [x] **MOB-12**: Mobile page shows extension connection status with reconnect handling
- [x] **MOB-13**: WebSocket CONTROL actions are typed as a union (not `action: string`)
- [x] **MOB-14**: Extension relays connection status to mobile via EXTENSION_STATUS message type

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### AI Agent

- **AGT-01**: Mastra AI agent with tools for draft engine signals, player data, and league state
- **AGT-02**: Agent memory for draft session context
- **AGT-03**: Streaming agent responses in extension sidebar

### In-Season

- **SEA-01**: Trade retrospectives (actual vs projected outcomes)
- **SEA-02**: Interactive trade builder with live impact preview

### Draft Formats

- **FMT-01**: Snake draft support
- **FMT-02**: Points/H2H league support

## Out of Scope

| Feature | Reason |
|---------|--------|
| React fiber probe for ESPN state | High complexity, uncertain stability — defer until CSS/data-attr selectors proven insufficient |
| Per-player bid limits from mobile | Adds complexity to engine; auto-bid strategies already handle this |
| Strategy anchor editing from mobile | Too complex for phone UX; set anchors on desktop before draft |
| ESPN write API integration | ESPN has no official write API |
| Mobile authentication | App is local-network only; auth adds unnecessary friction |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEV-01 | Phase 39 | Pending |
| DEV-02 | Phase 39 | Pending |
| DEV-03 | Phase 39 | Pending |
| NOM-01 | Phase 40 | Complete |
| NOM-02 | Phase 40 | Complete |
| NOM-03 | Phase 40 | Complete |
| NOM-04 | Phase 40 | Complete |
| NOM-05 | Phase 40 | Complete |
| NOM-06 | Phase 40 | Complete |
| MOB-01 | Phase 41 | Pending |
| MOB-02 | Phase 41 | Pending |
| MOB-03 | Phase 41 | Pending |
| MOB-04 | Phase 41 | Pending |
| MOB-05 | Phase 41 | Complete |
| MOB-06 | Phase 41 | Pending |
| MOB-07 | Phase 41 | Pending |
| MOB-08 | Phase 41 | Complete |
| MOB-09 | Phase 41 | Pending |
| MOB-10 | Phase 41 | Pending |
| MOB-11 | Phase 41 | Pending |
| MOB-12 | Phase 41 | Complete |
| MOB-13 | Phase 41 | Complete |
| MOB-14 | Phase 41 | Complete |

**Coverage:**
- v3.0 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-14*
*Last updated: 2026-03-14 after roadmap creation*
