# Roadmap: ESPN Fantasy Baseball Command Center

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-02-21)
- ✅ **v2.0 Position Shopping List** - Phases 6-38 (shipped 2026-03-14)
- 🚧 **v3.0 Draft Automation & Mobile Command Center** - Phases 39-41 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-02-21</summary>

Phase 1: Foundation, Phase 2: Auth, Phase 3: Team Dashboard, Phase 4: Draft Assistant, Phase 5: Admin Dashboard — 18 plans completed.

</details>

<details>
<summary>✅ v2.0 Position Shopping List (Phases 6-38) - SHIPPED 2026-03-14</summary>

Phases 6-38 covering v1.1 trade upgrades, history backfill, Chrome extension, deterministic draft engine, AI narrator, Monte Carlo optimization, projected standings, position shopping list, forward-looking simulation, mobile companion, site redesign, and code/perf/UX audits — 108 plans completed.

</details>

### 🚧 v3.0 Draft Automation & Mobile Command Center (In Progress)

**Milestone Goal:** Make auto-nomination reliable with verified ESPN selectors and upgrade the mobile draft companion into a full command-and-control terminal.

- [ ] **Phase 39: DevTools Setup** - Chrome DevTools MCP configured, selector battery validated against live ESPN draft DOM
- [ ] **Phase 40: Auto-Nomination Rework** - Nomination state machine consolidated using MCP-verified selectors with polling-based reliability
- [ ] **Phase 41: Mobile Command Center** - Mobile page redesigned with all engine signals, full draft controls, and phone-optimized layout

## Phase Details

### Phase 39: DevTools Setup
**Goal**: Developer can inspect live ESPN auction draft DOM via Chrome DevTools MCP and produce a verified selector map
**Depends on**: Nothing (first v3.0 phase)
**Requirements**: DEV-01, DEV-02, DEV-03
**Success Criteria** (what must be TRUE):
  1. Developer can run `chrome-devtools-mcp` against an ESPN draft tab in an isolated Chrome profile and execute querySelector/evaluateExpression calls without errors
  2. Every selector constant in `dom-observers.ts` has been evaluated against the live ESPN page and documented as matched, failed, or replaced
  3. A stable selector map document exists recording the confirmed ESPN DOM targets (data-*, aria-*, structural selectors) for use in Phase 40
  4. The Chrome profile isolation requirement (separate `--user-data-dir`) is documented so ESPN auth cookies are never exposed to the MCP process
**Plans**: 2 plans
Plans:
- [ ] 39-01-PLAN.md — Configure chrome-devtools-mcp in .mcp.json and write Chrome profile isolation guide
- [ ] 39-02-PLAN.md — Run selector battery via MCP against live ESPN draft DOM and produce SELECTOR-MAP.md

### Phase 40: Auto-Nomination Rework
**Goal**: Auto-nomination reliably finds, queues, and nominates players using selectors confirmed against the live 2026 ESPN draft DOM
**Depends on**: Phase 39
**Requirements**: NOM-01, NOM-02, NOM-03, NOM-04, NOM-05, NOM-06
**Success Criteria** (what must be TRUE):
  1. Extension uses only selectors from the Phase 39 verified selector map — no speculative CSS class selectors remain in `dom-observers.ts`
  2. Turn detection correctly identifies user's nomination turn using the consolidated strategy, not parallel competing checks
  3. Search-and-queue flow reliably types into ESPN's search input (using `InputEvent` + `nativeInputValueSetter` pattern, not plain `Event`) and clicks the queue button within the polling timeout
  4. `clearNominationState()` is the single reset path for all nomination state fields, called by both `stop()` and error recovery paths
  5. Nomination diagnostics panel in the extension sidebar shows live, accurate state matching the reworked flow
**Plans**: 4 plans
Plans:
- [ ] 40-01-PLAN.md — Reorganize dom-observers.ts selector constants with CONFIRMED-first ordering and fallback hierarchy
- [ ] 40-02-PLAN.md — Consolidate isMyTurnToNominate() to primary/fallback tiers and establish clearNominationState() as single reset path
- [ ] 40-03-PLAN.md — Extract typeIntoSearchInput() helper and add named search polling timeout constants
- [ ] 40-04-PLAN.md — Update NominationDiagnostics panel with turnStrategyType, fallback warning badge, and queue state

### Phase 41: Mobile Command Center
**Goal**: Mobile page is a full draft control terminal showing all engine signals and accepting queue, autopilot, and nomination commands from the phone
**Depends on**: Phase 39
**Requirements**: MOB-01, MOB-02, MOB-03, MOB-04, MOB-05, MOB-06, MOB-07, MOB-08, MOB-09, MOB-10, MOB-11, MOB-12, MOB-13, MOB-14
**Success Criteria** (what must be TRUE):
  1. Mobile page shows extension connection status — disconnected state triggers a visible banner, not a silent void — and the `EXTENSION_STATUS` relay message is in the WS state payload before any control buttons are wired
  2. All WebSocket CONTROL actions (FORCE_NOMINATE, SKIP_PLAYER, SET_BUDGET_OVERRIDE, hitter/pitcher split) are typed as a TypeScript discriminated union, not `action: string`
  3. User can trigger Force Nominate, Skip Player, toggle auto-bid, toggle auto-nominate, and adjust hitter/pitcher split from the phone without touching the laptop
  4. Mobile page displays category progress with targets, ideal roster with tier badges, win probability, build archetype, and scarcity alerts using data already flowing through the WS relay
  5. Screen wake lock prevents phone screen from dimming during a live draft, and the page uses a tabbed/sectioned layout legible on a 375px phone screen
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 39 → 40 → 41

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 39. DevTools Setup | v3.0 | 0/TBD | Not started | - |
| 40. Auto-Nomination Rework | 3/4 | In Progress|  | - |
| 41. Mobile Command Center | v3.0 | 0/TBD | Not started | - |
