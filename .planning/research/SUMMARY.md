# Project Research Summary

**Project:** ESPN Fantasy Baseball Assistant — Chrome DevTools MCP, Auto-Nomination Rework, Mobile Draft Command Center
**Domain:** Chrome Extension DOM Automation + WebSocket Mobile Companion + Developer Tooling
**Researched:** 2026-03-14
**Confidence:** MEDIUM overall (ESPN DOM specifics LOW; architecture and stack HIGH)

## Executive Summary

This milestone adds three capabilities to a mature, already-functioning auction draft assistant: developer tooling (Chrome DevTools MCP) to diagnose selector failures without disrupting a live draft, a rework of the auto-nomination selector strategy to eliminate the CSS-class guessing game that has caused 10+ regression cycles, and an upgrade to the mobile draft page from a read-only viewer into a full command-and-control terminal. The overarching theme is reliability: the existing system has been patched through 10+ quick tasks (60, 79, 80, 85–90) that each introduced regressions, and the root cause every time was unvalidated ESPN DOM selectors combined with fixed timing delays.

The recommended approach treats Feature 1 (Chrome DevTools MCP) as foundational infrastructure that unblocks Feature 2 (auto-nomination rework). Selectors must be inspected against the live 2026 ESPN auction DOM before any selector code is changed — writing selector code against unverified assumptions reproduces the exact failure pattern from the past 10 quick tasks. Feature 3 (mobile command center) is architecturally independent and can proceed in parallel. The WS relay hub is a transparent bus and requires no changes. The entire scope requires exactly one new production npm package (`motion@^12` for swipe animations in the mobile page).

The key risk across all three features is the ESPN DOM itself: class names and React fiber structure can change on any ESPN deploy, and no public documentation exists. The MCP server mitigates this at development time, but a runtime fallback selector hierarchy (React fiber → data attributes → ARIA attributes → text content → CSS classes) must be established to survive future ESPN deploys. The second major risk is the WebSocket state desync between the mobile UI and the extension — the mobile page currently has no way to know the extension is disconnected. Implementing the `EXTENSION_STATUS` relay message is a prerequisite to shipping any new mobile control buttons.

## Key Findings

### Recommended Stack

The existing stack requires exactly one net-new production dependency. `motion@^12.36.0` (the package formerly known as `framer-motion`) provides both gesture-based drag and spring-physics animations in one package, needed for swipe-dismissible alert cards on the mobile page. Screen wake lock uses the native browser `navigator.wakeLock` API (Chrome 84+, Safari 16.4+) with no new dependencies. Chrome DevTools MCP is developer tooling only, installed via `npx chrome-devtools-mcp@latest` and never added to any `package.json`.

For the extension selector rework, WXT's `injectScript` utility (already in the extension package) enables placing a probe script in the page's MAIN world to access ESPN's React fiber tree (`__reactFiber$*` keys). This eliminates the CSS-class guessing entirely when it works, with `data-player-id`, `[data-testid]`, text content, then CSS class as the ordered fallback hierarchy for when fiber access fails.

**Core technology additions:**
- `motion@^12.36.0` (frontend): Swipe gesture + spring animation for mobile alert cards — import from `'motion/react'`, must be in `"use client"` files, compatible with React 18 and Next.js 14 App Router
- `chrome-devtools-mcp@latest` (dev tooling, npx only): Official Chrome team MCP server exposing CDP DOM inspection as MCP tools; requires Node.js `^20.19.0 || ^22.12.0+`
- WXT `injectScript` + MAIN world probe (extension): Access to ESPN React fiber tree, zero new npm packages, requires `web_accessible_resources` entry in `wxt.config.ts`

### Expected Features

**Must have (table stakes — this milestone):**
- Chrome DevTools MCP configured and connected to ESPN draft tab — unblocks all selector validation work
- ESPN selector test harness (evaluate_script probing each selector constant from dom-observers.ts against the live page)
- Auto-nomination rework: queue-sourced nomination path with MCP-verified selectors replacing speculative CSS classes
- Nomination status broadcast to mobile (wire NominationDiagnostics into WS state payload)
- EXTENSION_STATUS relay message — prerequisite to any mobile controls so users know when extension is disconnected
- Mobile nomination autopilot status section — answers "is it working?" anxiety during live drafts
- Mobile top targets list — nominationStrategy data already computed, WS plumbing only
- Mobile category progress bars — categoryGaps already in engine signals

**Should have (add after P1 items validated in 2-3 real drafts):**
- Mobile ideal roster snapshot — data exists, adds targeting context without new computation
- Mobile build archetype badge — single line alongside win probability
- Per-player bid limit override from mobile — SET_PLAYER_BID_LIMIT WS control, MEDIUM complexity
- DOM-independent turn detection fallback (budget-change detection) — add if queue-based nomination still shows reliability issues

**Defer (v2+):**
- Mobile queue management (view and reorder from mobile) — HIGH complexity, ESPN queue DOM relay required; only viable after queue selectors confirmed stable across multiple real drafts
- Selector candidate discovery via DOM snapshot diff — valuable for long-term maintenance automation
- ESPN network API shape inspection for DOM-free turn detection — could eliminate DOM dependency entirely if ESPN API exposes nomination state

### Architecture Approach

The existing three-layer topology (Chrome extension content script → Fastify WS hub → Next.js mobile page) requires no structural changes. The WS hub in `draft-live.ts` is a transparent byte forwarder and must stay that way — new CONTROL message types (FORCE_NOMINATE, SKIP_PLAYER, SET_BUDGET_OVERRIDE) flow through unchanged. All business logic validation belongs in content.tsx, not the hub. The Chrome DevTools MCP server is a fourth entirely independent process existing only at development time with zero runtime coupling. The key architectural constraint for skip state: `skippedPlayerIds` must live in the extension Zustand store (not mobile React state) so it actually filters the nomination engine before candidates reach the WS broadcast.

**Major components:**
1. `tools/espn-devtools-mcp/` (new standalone package): CDP-based ESPN DOM inspection server — singleton CDP client + 4 MCP tools: querySelector, getDOMTree, evaluateExpression, getAuctionSelectors (selector battery)
2. `packages/extension/lib/dom-observers.ts` + `auto-bid-controller.ts` (modified): Selector updates using MCP-validated patterns; all nomination state resets consolidated into `clearNominationState()`; MAIN world probe via WXT `injectScript`
3. `packages/frontend/src/app/draft/live/page.tsx` (redesigned): Tabbed layout (Live / Targets / Roster / Controls) with Force Nominate, Skip Player buttons, autopilot status section, category progress bars, swipe-dismissible alerts via `motion`

### Critical Pitfalls

1. **ESPN React inputs silently ignore plain `Event('input')`** — must use `InputEvent` with `data`/`inputType` fields plus `nativeInputValueSetter` and `focus()` before dispatch. Documented and battle-tested in quick task 86. Any reversion to `input.value = x; dispatchEvent(new Event('input'))` will fail without an error.

2. **Fixed `setTimeout` delays break under variable ESPN server load** — the quick task 86→89 regression chain was entirely caused by cascading delay increases. Every DOM-readiness wait must use a polling loop (300ms interval, 3000ms max). The existing `pollForQueueButton` and `pollForDropdown` patterns are the correct models — extend them, never add new fixed delays.

3. **Nomination state machine has no single reset owner** — `queuedPlayerIds` currently only resets in `stop()`, not in `clearNominationState()`. Before adding any new nomination state field: add it to NominationDiagnostics, reset it in `clearNominationState()`, and verify `stop()` calls `clearNominationState()`.

4. **Mobile shows "Connected" when extension is disconnected** — the mobile `connected` flag reflects WS relay connection only, not extension presence. Controls tap silently into the void. `EXTENSION_STATUS` relay message must be implemented before any new control buttons are added to the mobile page.

5. **Chrome DevTools MCP requires a separate Chrome profile** — Chrome 136+ blocks remote debugging on default profiles. Always use `--user-data-dir=/tmp/espn-devtools-profile`. Using the live draft profile exposes ESPN auth cookies and all browser state to the MCP client.

## Implications for Roadmap

The dependency graph is clear from research: MCP setup unblocks selector rework; mobile redesign is independent but gains more value when autopilot is reliable. Three phases emerge naturally from these dependencies.

### Phase 1: Chrome DevTools MCP Setup and Selector Validation

**Rationale:** This is the only feature that unblocks Feature 2. Selector code written against unverified assumptions reproduces the exact failure pattern from 10 prior quick tasks. The MCP server's `getAuctionSelectors()` tool is the exit criterion for Phase 1 and the entry criterion for Phase 2.
**Delivers:** Working `chrome-devtools-mcp` configuration documented for the repo, selector battery tool reporting which selector constants in dom-observers.ts match the live ESPN page, and a DOM snapshot fixture for regression testing isMyTurnToNominate().
**Addresses:** Chrome DevTools MCP table stakes (attach, snapshot, evaluate, screenshot, console capture), ESPN-specific selector test harness
**Avoids:** Pitfall 4 (Chrome profile isolation — documented in dev setup notes), Pitfall 5 (Node.js `^20.19.0` version constraint — verified before first use)

### Phase 2: Auto-Nomination Rework

**Rationale:** Depends strictly on Phase 1 output (validated selectors and DOM snapshot). The 10+ regression history makes this the highest-risk code area in the project — inspection first, code second is non-negotiable. Must not begin until Phase 1 produces a confirmed selector map.
**Delivers:** Reliable queue-sourced nomination using selectors confirmed to work against the 2026 ESPN draft DOM. Consolidated nomination state machine with `clearNominationState()` as the single reset path. NominationDiagnostics wired into WS state payload. MAIN world React fiber probe as primary selector strategy.
**Implements:** WXT `injectScript` pattern for React fiber access; fallback hierarchy: React fiber → data-player-id → [data-testid] → text content → CSS class
**Avoids:** Pitfall 1 (React input dispatch pattern), Pitfall 2 (polling loops, not fixed delays), Pitfall 3 (state machine consolidation), Pitfall 8 (turn detection regression — capture DOM snapshot and verify strategies before touching isMyTurnToNominate())

### Phase 3: Mobile Command Center Redesign

**Rationale:** Architecturally independent of Phases 1 and 2 at the code level. The WS hub does not change. Skip state requires only a store field and engine filter. EXTENSION_STATUS and CONTROL action type union must be implemented first within this phase before any control buttons.
**Delivers:** Tabbed mobile page (Live / Targets / Roster / Controls), Force Nominate and Skip Player controls, category progress bars, autopilot status section, extension disconnection banner, swipe-dismissible alerts via `motion@^12`, screen wake lock via native browser API.
**Uses:** `motion@^12.36.0` (new, install in packages/frontend), typed CONTROL action union (replace `string` type), EXTENSION_STATUS relay message
**Avoids:** Pitfall 6 (CONTROL action union type — typed before adding any new action), Pitfall 7 (EXTENSION_STATUS before any control buttons), Anti-pattern of storing skip state in mobile React state

### Phase Ordering Rationale

- Phase 1 before Phase 2 is a hard dependency: selector code without inspection reproduces known failures. Phase 1's `getAuctionSelectors()` output IS the input for Phase 2's selector work.
- Phase 3 is code-independent of Phases 1 and 2 but should be shipped after Phase 2 if end-to-end reliability matters. Shipping FORCE_NOMINATE before the nomination rework means the button fires nomination attempts that may still fail for selector reasons. Consider sequencing Phase 3 after Phase 2.
- Mobile queue management (view/reorder from mobile) is deliberately deferred to v2. ESPN queue DOM relay for mutations requires selector stability validated across multiple real drafts.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1 (MCP Setup):** ESPN draft page iframe structure under CDP — the draft page may use iframes requiring targeting a specific CDP frame rather than the top-level page. Must be validated during initial MCP setup session; document the exact `list targets` → `select target` sequence.
- **Phase 2 (Auto-Nomination):** ESPN React fiber tree path to auction state — the `__reactFiber$` probe approach is confirmed viable but the specific fiber traversal to nomination state, queue state, and current bids is unknown until inspected. Phase 1's DOM snapshot must be the primary input for Phase 2 fiber design.

Phases with standard patterns (skip research-phase):
- **Phase 3 (Mobile):** All patterns are well-documented. `motion` library drag + AnimatePresence usage is straightforward. WS CONTROL message extension follows the established hub-as-bus pattern. `navigator.wakeLock` has clear MDN documentation. TypeScript discriminated union enforcement is standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | One new production package (`motion@^12`), verified against npm registry March 2026. All other additions are browser-native APIs or existing packages. No version conflicts. |
| Features | MEDIUM | Chrome DevTools MCP features are HIGH confidence (official Google tooling, 29 tools confirmed). ESPN DOM specifics are LOW — no public documentation, must be inspected live. Mobile features are MEDIUM — data already flows through engine, only WS plumbing is the gap. |
| Architecture | HIGH | Existing codebase fully read. Three-layer topology well-understood. Hub-as-transparent-bus confirmed correct for all new features. Zustand-as-state-authority pattern established. The MCP server is a fully isolated process with no runtime coupling. |
| Pitfalls | HIGH | 7 of 8 pitfalls come from direct first-party evidence (quick tasks 60, 79, 80, 85–90, existing code). Chrome 136 profile restriction from official Google documentation. Only MCP community failure modes (MEDIUM confidence). |

**Overall confidence:** MEDIUM — HIGH on architecture and known code behavior, LOW on ESPN DOM specifics (inherently unverifiable without live inspection), which is exactly why Phase 1 exists as a prerequisite.

### Gaps to Address

- **ESPN iframe structure under CDP:** Whether the ESPN draft page uses iframes that require CDP frame targeting is unknown. Phase 1 must document the exact target selection sequence and confirm whether an iframe-specific approach is needed for evaluate_script calls.
- **ESPN React fiber path to auction state:** The MAIN world probe pattern is confirmed but the fiber traversal to find nomination state, queue state, and current bid must be discovered during Phase 1 inspection and documented before any Phase 2 probe code is written.
- **Chrome M144 session attach availability:** The `chrome-devtools-mcp --autoConnect` flag (attaches to existing sessions without `--remote-debugging-port`) depends on Chrome M144, which was in Beta as of the research date. Use the `--remote-debugging-port=9222 --user-data-dir=/tmp/...` approach as the documented path until M144 reaches stable channel.
- **Per-player bid limit serialization design:** `SET_PLAYER_BID_LIMIT` requires a per-player cap map in `useDraftStore`. Deferred to v1.x — needs explicit design for JSON serialization in `chrome.storage.local` before implementation (the 5MB quota and synchronous write constraints apply).

## Sources

### Primary (HIGH confidence)
- `packages/extension/lib/auto-bid-controller.ts` — nomination state machine, polling patterns, NominationDiagnostics struct
- `packages/extension/lib/dom-observers.ts` — current selector approach, fallback chains
- `packages/backend/src/api/draft-live.ts` — WebSocket relay, extension socket guard, hub-as-bus pattern
- `packages/frontend/src/app/draft/live/page.tsx` + `useDraftLiveSocket.ts` — mobile page, current 3 control messages
- Project quick tasks 60, 79, 80, 85–90 — direct regression evidence establishing nomination pitfall patterns
- [Chrome DevTools MCP GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp) — Node version requirements, 29 tools confirmed, profile constraints
- [Chrome DevTools MCP blog post](https://developer.chrome.com/blog/chrome-devtools-mcp) — Chrome 136 profile restriction, official setup steps
- [Motion docs](https://motion.dev/docs/react) — v12.36.0, React 18 compatibility, `'motion/react'` import path
- [Screen Wake Lock API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) — browser support table, visibilitychange re-acquire pattern
- [WXT Content Scripts docs](https://wxt.dev/guide/essentials/content-scripts.html) — injectScript, MAIN world vs isolated world, web_accessible_resources requirement

### Secondary (MEDIUM confidence)
- [Chrome DevTools MCP session attach M144](https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session) — M144 Beta feature as of research date
- [RotoWire Live Draft Sync](https://www.rotowire.com/football/article/live-draft-assistant-sync-explained-95417) — two-way queue sync pattern as industry standard
- [DeepWiki: chrome-devtools-mcp getting started](https://deepwiki.com/ChromeDevTools/chrome-devtools-mcp/2-getting-started) — concurrent instance behavior, `--isolated` flag behavior
- [Draft Punk mobile features](https://play.google.com/store/apps/details?id=com.joshclemm.android.draftpunk) — competitor mobile feature comparison

### Tertiary (LOW confidence, needs live validation)
- ESPN DOM structure — no public documentation; all selector patterns require live validation during Phase 1 before any are treated as stable or used in code

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
