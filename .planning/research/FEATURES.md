# Feature Research

**Domain:** Chrome DevTools MCP + ESPN DOM Automation + Mobile Draft Command Center
**Researched:** 2026-03-14
**Confidence:** MEDIUM overall — Chrome DevTools MCP ecosystem is HIGH (official Google tooling, verified), ESPN DOM specifics are LOW (no public documentation, must be inspected live), mobile feature patterns are MEDIUM (verified against existing code and competitor analysis)

---

## Context: What Already Exists

This is a subsequent milestone. The following features are already built and must NOT be re-scoped:

**Auto-nomination:** 5 turn-detection strategies, search-and-queue flow, `.action-btn` selectors, 15s queue population cooldown, `NominationDiagnostics` panel.

**Mobile (`/draft/live`):** WebSocket page showing current nomination, budget, roster, alerts. Controls: auto-bid toggle, position filter, pitcher/hitter split slider.

**Extension sidebar:** inflation, scarcity, category gaps, budget curves, ideal roster, win probability, AI narrator, build archetype.

**Key pain points this milestone addresses:**
1. Auto-nomination breaks when ESPN updates its DOM (class names, button structure) — selectors become stale silently
2. Mobile page is a read-only viewer; user cannot control queue or review what the engine is recommending to nominate next
3. No tooling for a developer to inspect the live ESPN draft page and verify/update selectors without manually opening DevTools

---

## Feature Landscape

### Table Stakes (Users Expect These)

#### Chrome DevTools MCP Server

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Attach to active ESPN draft tab | MCP is useless without live page access; needed to inspect real ESPN DOM | LOW | `chrome-devtools-mcp` exposes `list_pages` + `select_page` (HIGH confidence — official Google tooling, 29 tools confirmed). Chrome M144+ also supports attaching to existing sessions without separate launch. |
| DOM snapshot of live draft page | Need to capture current ESPN HTML structure so Claude can identify what selectors are available | LOW | `take_snapshot` tool confirmed in `chrome-devtools-mcp`. Returns full DOM structure. Use as the primary discovery mechanism. |
| Evaluate JavaScript in live tab | Must run `document.querySelector(...)` probes to test selectors against real ESPN DOM | LOW | `evaluate_script` tool confirmed (HIGH confidence — official Google). This is how you test selector candidates without modifying extension code. |
| Screenshot of draft overlay | Visual confirmation that extension overlay is rendering correctly | LOW | `take_screenshot` tool confirmed (HIGH confidence). No extra work. |
| Console log capture | Extension logs all selector failures (`[ESPN Draft Assistant] All X selectors failed`) — need to surface these during debugging | LOW | `list_console_messages` confirmed. Filter by `[ESPN Draft Assistant]` prefix. |

#### Auto-Nomination Rework

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Selector health check report on page load | Selectors silently fail today; user only knows after a wasted nomination turn | MEDIUM | `validateAndFindElement` fallback chain already exists in `dom-observers.ts`. Add structured health check that runs once on load and broadcasts result to mobile. |
| Queue-sourced nomination (from ESPN's nomination queue, not search-click) | Search-click flow races ESPN's DOM; queue-based is deterministic and uses ESPN's primary affordance | MEDIUM | Phase 35 in planning already identifies this as the fix. Confirmed pattern — RotoWire, DraftPunk all use two-way queue sync. Requires verifying ESPN queue DOM selectors before coding. |
| Turn detection that survives ESPN DOM changes | 5 strategies exist; need at least one that does not depend on ESPN class names | HIGH | ESPN React class names churn. Only `data-*` attributes, `aria-*` attributes, or budget-change detection are stable candidates. DevTools MCP inspection required to find stable anchors. |
| Cooldown/backoff on failed nomination attempts | Runaway click loops are a real failure mode (max 3 attempts, 5s cooldown exists but needs validation) | LOW | Already implemented in `auto-bid-controller.ts`. Keep, but surface failures to mobile via WS. |

#### Mobile Draft Command Center

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Current nomination card (player, bid, positions) | Core table stakes for any draft companion | LOW | Already exists. Keep prominent. |
| Max bid and BID/PASS verdict | Primary decision support — user needs a number to type into ESPN | LOW | Already exists via `optimization` signal. Keep. |
| Remaining budget display | Table stakes — know how much you have left | LOW | Already exists. |
| Auto-bid on/off toggle | Users expect remote control of automation from phone | LOW | Already exists. |
| Win probability indicator | All serious competitor tools surface this (Draft Punk, FantasyPros Draft Wizard) | LOW | Already exists via simulation signal. |
| Connection status indicator | Must know if phone is still synced to desktop | LOW | Already exists as `ConnectionDot`. |

---

### Differentiators (Competitive Advantage)

#### Chrome DevTools MCP Server

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| ESPN-specific selector test harness | Claude can be asked "test all nomination selectors against the live ESPN page" and get structured pass/fail per selector constant | MEDIUM | Custom workflow wrapping `evaluate_script`: probe each selector in `NOMINATION_BUTTON_SELECTORS`, `SEARCH_INPUT_SELECTORS`, etc. from `dom-observers.ts` and return which indices pass/fail. Enables safe selector verification before any code changes. |
| DOM snapshot diff (before/after nomination event) | Attach to ESPN draft, capture snapshot before nominating and after, diff to identify stable attributes on nomination button | HIGH | Requires two snapshots plus structural diff. Implement as a Claude Code workflow (two `take_snapshot` calls + JSON diff analysis), not as a built tool. Identifies `data-*` and `aria-*` candidates for robust selectors. |
| Console error stream for regression detection | Stream `[ESPN Draft Assistant] All X selectors failed` lines to surface selector regressions during live drafts without opening a laptop | LOW | Filter `list_console_messages` by extension prefix. Trivial wrapper. Lets Claude detect that selectors broke before the user knows. |
| Network request inspection for ESPN API shape | Inspect ESPN API calls during a nomination to determine if turn detection can be DOM-free | LOW | `list_network_requests` already in `chrome-devtools-mcp`. Filter for `fantasy.espn.com` / `lm-api-reads`. Could reveal a signal (e.g., nomination available state) not reflected in DOM. |

#### Auto-Nomination Rework

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Nomination status broadcast to mobile | Mobile user knows if autopilot is stuck before the 30-second nomination timer expires — can intervene manually | LOW | `NominationDiagnostics` struct already exists in `auto-bid-controller.ts`. Wire it into the WS state payload. High value, low effort. |
| DOM-independent turn detection fallback (budget change) | Survives ESPN class name reshuffles entirely | MEDIUM | Track remaining budget display as a numeric value. A reduction indicates my team spent money = it is now my turn (or I won an auction). Scrape as secondary signal. |
| Selector version fingerprint | Extension logs which selector index (primary vs fallback) is being used per field, enabling early detection of ESPN DOM drift before complete breakage | LOW | Already partially exists via `validateAndFindElement` fallback warnings. Aggregate into a structured health object. |

#### Mobile Draft Command Center

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Top targets list (what to nominate next) | Tells user what the engine recommends bidding on — no competitors expose this on mobile | MEDIUM | Nomination strategy trap scores and ideal roster are already computed in extension. Add `topTargets` field to WS state payload. No new computation needed. |
| Category progress bars | See which categories are winning/losing at a glance — inform what position to target next | MEDIUM | `categoryGaps` signal already exists in engine output. Add mobile section for it. Data is already in WS payload structure, just not rendered. |
| Nomination autopilot status section | Know if autopilot is running, waiting, jammed, or in cooldown — and why | LOW | Wire `NominationDiagnostics` into WS state payload. Render last attempt result, candidate source, cooldown remaining. |
| Ideal roster snapshot on mobile | Know what the engine thinks you should be targeting without opening the laptop | MEDIUM | `idealRoster` data exists in engine signals. Add condensed position-slot list to mobile page. |
| Build archetype status badge | Confirm strategy has not drifted mid-draft | LOW | `archetype` signal exists in engine output. Single-line display alongside win probability. |
| Nomination queue management (view and reorder) | Competitors (Draft Punk, RotoWire) all expose queue sync; lets user prioritize players from phone | HIGH | Requires bidirectional WS commands (`GET_QUEUE`, `REORDER_QUEUE`, `ADD_TO_QUEUE`, `REMOVE_FROM_QUEUE`). Extension must relay mutations to ESPN queue DOM. Selector verification required first. HIGH risk — treat as P2 after queue selectors confirmed stable. |
| Per-player bid limit override from mobile | Hard cap a specific player mid-draft from the phone (e.g., "never pay more than $30 for this guy") | MEDIUM | Add `SET_PLAYER_BID_LIMIT` WS control. Store per-player overrides in extension `useDraftStore`. Auto-bid controller already respects bid caps — just needs per-player storage. |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full bid automation with zero human confirmation | "Set it and forget it" experience | ESPN ToS risk; if DOM changes and extension fires bids on wrong player, expensive mistake with no recourse; auto-nomination after DOM change is already causing silent failures | Keep auto-bid with max-cap safety. Require human re-activation each session. Show what would have been bid before enabling. |
| Direct ESPN API calls from mobile page (bypassing extension) | Seems like simpler architecture | ESPN auth (SWID + espn_s2 cookies) lives in the browser session; cannot be replicated from a Node.js server without manual extraction and re-injection. Any ESPN auth rotation breaks it. | Extension is the single source of truth. Mobile page is a display + control terminal only. |
| DOM polling every 100ms | Catch every possible state change | CPU-saturating in Chrome tab; service worker sleeps and cannot sustain this rate; causes sidebar jank | MutationObserver on the auction container only. Poll budget display at 2s interval maximum. |
| Auto-submit nominations without queue validation | Faster autopilot — skip queue population step | ESPN queue population is the safest nomination path. Skipping it means falling back to search-click which is exactly what breaks. Queue validation confirms player is nominatable before touching DOM. | Keep queue population as mandatory pre-step. Improve queue population reliability instead of bypassing it. |
| Persist auto-bid mode across page reloads | Convenience for multi-day drafts | Auto-bid can fire before extension is fully initialized after page load; player pool data and ideal roster may be stale on reload; silent errors with no user awareness | Explicit re-activation each session. Add session-active indicator. Current behavior (reset on load) is a safety feature. |
| MCP server that writes to ESPN DOM directly | Seems powerful for AI-driven automation | Claude operating on live auction data with direct DOM mutation is a footgun. MCP should be read-only — inspect and diagnose. All writes go through extension content script which has guard rails (cooldowns, attempt limits, bid caps). | MCP = read and inspect only. Claude uses MCP to discover correct selectors, then updates extension constants. Extension executes writes. |
| Real-time opponent roster tracking via ESPN API calls in hot path | Richer context for AI decisions | ESPN API rate limiting during a live auction would cause failures at the worst moment. Adds latency to nomination path. | Use `opponentPressure` data already computed by `opponent-model.ts`. No ESPN API calls in the live bid path. |

---

## Feature Dependencies

```
[Chrome DevTools MCP]
    └──requires──> chrome-devtools-mcp package installed in Claude Code env
    └──requires──> Chrome launched with --remote-debugging-port=9222 OR M144 session attach
    └──enables──> ESPN Selector Test Harness (evaluate_script probe workflow)
                      └──requires──> ESPN draft tab open in browser during inspection
                      └──produces──> Verified selector constants → update dom-observers.ts
                      └──unblocks──> Auto-Nomination Queue Rework

[Auto-Nomination Queue Rework]
    └──requires──> Verified queue button selectors from DevTools MCP inspection
    └──requires──> NominationDiagnostics struct (already exists in auto-bid-controller.ts)
    └──enables──> Nomination Status Broadcast to Mobile
    └──enables──> Queue Management from Mobile (after queue selectors confirmed stable)

[Nomination Status Broadcast to Mobile]
    └──requires──> NominationDiagnostics wired into WS state payload
    └──requires──> WebSocket relay in background.ts (already exists)

[Mobile Top Targets List]
    └──requires──> nominationStrategy signals already computed in extension
    └──requires──> topTargets field added to WS payload schema
    └──low effort — data exists, gap is only WS plumbing

[Mobile Category Progress]
    └──requires──> categoryGaps already in DraftEngineSignals
    └──requires──> categoryGaps included in WS state broadcast
    └──low effort — same pattern as budgetCurve which already works

[Mobile Ideal Roster]
    └──requires──> idealRoster already in engine signals
    └──requires──> idealRoster field added to WS payload schema

[Mobile Queue Management]
    └──requires──> Auto-Nomination Queue Rework complete
    └──requires──> ESPN queue DOM selectors verified and stable
    └──requires──> Bidirectional WS control protocol extended with queue commands
    └──HIGH RISK — do not implement until queue selector verification is complete

[Per-Player Bid Limit Override]
    └──requires──> useDraftStore extended with per-player bid limit map
    └──requires──> AutoBidController reads per-player cap before firing bid
    └──requires──> SET_PLAYER_BID_LIMIT WS control command handled in content script
```

### Dependency Notes

- **DevTools MCP inspection must come before queue rework code**: Writing queue-based nomination code against unverified selectors reproduces the existing breakage pattern. Inspection first, code second.
- **Mobile queue management is the highest risk item**: It requires ESPN DOM relay for queue mutations. Treat as P2 and only implement after queue selectors are verified stable across at least one draft session.
- **Mobile category progress, top targets, and ideal roster are low-risk**: Data already flows through the engine. The gap is adding fields to the WS broadcast payload and rendering them on the mobile page.
- **Chrome M144 session attach**: As of 2026-03-14, M144 is in Beta channel per the Chrome developer blog. Stable channel may not have this feature yet. Fallback: launch Chrome with `--remote-debugging-port=9222` flag (HIGH confidence, works in all Chrome versions).

---

## MVP Definition

### Launch With (v1 — this milestone)

Minimum set that fixes the auto-nomination regression and upgrades mobile from viewer to command center.

- [ ] Chrome DevTools MCP configured in Claude Code environment — unblocks all inspection work
- [ ] ESPN selector test harness workflow (Claude uses `evaluate_script` to probe selector constants against live ESPN page) — enables safe selector verification
- [ ] Auto-nomination rework: queue-sourced nomination path with verified selectors — fixes the primary breakage
- [ ] Nomination status broadcast to mobile (wire `NominationDiagnostics` into WS payload) — lets user know if autopilot is jammed
- [ ] Mobile: nomination autopilot status section — low effort, directly addresses "is it working?" anxiety
- [ ] Mobile: top targets list — `nominationStrategy` is computed, WS plumbing only
- [ ] Mobile: category progress bars — `categoryGaps` exists, WS plumbing only

### Add After Validation (v1.x)

Add once P1 items work across 2-3 real draft sessions.

- [ ] Mobile: ideal roster snapshot — data exists, adds useful context
- [ ] Mobile: build archetype badge — trivial, pairs with win probability
- [ ] Per-player bid limit override — useful mid-draft control, MEDIUM complexity
- [ ] DOM-independent turn detection fallback (budget change detection) — add if queue-sourced nomination still shows reliability issues after initial fix

### Future Consideration (v2+)

Defer until queue selectors confirmed stable and queue management pattern validated.

- [ ] Mobile queue management (view and reorder) — HIGH complexity, requires ESPN queue DOM relay; only viable after queue selectors are confirmed across multiple drafts
- [ ] Selector candidate discovery via DOM snapshot diff — complex Claude workflow; valuable for long-term maintenance automation
- [ ] ESPN network API shape inspection for DOM-free turn detection — research-heavy; could eliminate DOM dependency entirely if ESPN API exposes nomination state

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chrome DevTools MCP setup | HIGH | LOW | P1 |
| ESPN selector test harness | HIGH | LOW | P1 |
| Auto-nomination queue rework | HIGH | MEDIUM | P1 |
| Nomination status to mobile | HIGH | LOW | P1 |
| Mobile autopilot status section | MEDIUM | LOW | P1 |
| Mobile top targets list | HIGH | LOW | P1 |
| Mobile category progress bars | MEDIUM | LOW | P1 |
| Mobile ideal roster snapshot | MEDIUM | LOW | P2 |
| Mobile build archetype badge | LOW | LOW | P2 |
| Per-player bid limit override | MEDIUM | MEDIUM | P2 |
| DOM-independent turn detection | MEDIUM | MEDIUM | P2 |
| Mobile queue management | HIGH | HIGH | P2 |
| Selector snapshot diff workflow | LOW | HIGH | P3 |
| ESPN network API shape inspection | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for this milestone — fixes the regression and delivers command center MVP
- P2: Should have — add once P1 items are working in production
- P3: Nice to have — defer until explicit user demand

---

## Competitor Feature Analysis

| Feature | Draft Punk (mobile) | RotoWire Live Sync | FantasyPros Draft Wizard | Our Approach |
|---------|---------------------|--------------------|--------------------------|--------------|
| Current nomination display | Yes | Yes | Yes | Exists, keep |
| Max bid recommendation | Yes | No | Yes | Exists, keep |
| BID/PASS verdict | No | No | Yes | Exists, differentiator |
| Queue management from mobile | Yes | Yes (two-way) | No | P2 — after selector verification |
| Win probability | No | No | No | Exists, unique differentiator |
| Category gap progress | No | No | No | New — P1 |
| Top targets from engine | Partial (position scarcity) | No | No | New — P1 |
| Autopilot status | N/A | N/A | N/A | New — P1 |
| Build archetype status | No | No | No | New — P2 |

---

## Sources

- [Chrome DevTools MCP official announcement](https://developer.chrome.com/blog/chrome-devtools-mcp) — HIGH confidence (Google official)
- [chrome-devtools-mcp GitHub (29 tools confirmed)](https://github.com/ChromeDevTools/chrome-devtools-mcp) — HIGH confidence
- [Chrome DevTools MCP session attach (M144)](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session) — MEDIUM confidence (M144 is Beta as of research date)
- [chrome-inspector-mcp (DOM inspection via CDP)](https://github.com/devtoolcss/chrome-inspector-mcp) — MEDIUM confidence
- [chrome.debugger API reference](https://developer.chrome.com/docs/extensions/reference/api/debugger) — HIGH confidence (official)
- [MutationObserver MDN](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) — HIGH confidence
- [RotoWire Live Draft Sync (queue two-way pattern)](https://www.rotowire.com/football/article/live-draft-assistant-sync-explained-95417) — MEDIUM confidence
- [Draft Punk mobile features](https://play.google.com/store/apps/details?id=com.joshclemm.android.draftpunk) — MEDIUM confidence
- Existing codebase: `packages/extension/lib/auto-bid-controller.ts` — HIGH confidence (ground truth)
- Existing codebase: `packages/extension/lib/dom-observers.ts` — HIGH confidence (ground truth)
- Existing codebase: `packages/frontend/src/app/draft/live/page.tsx` — HIGH confidence (ground truth)
- Existing codebase: `packages/extension/entrypoints/background.ts` — HIGH confidence (ground truth)

---

*Feature research for: Chrome DevTools MCP + ESPN DOM Automation Rework + Mobile Draft Command Center*
*Researched: 2026-03-14*
