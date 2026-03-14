# Architecture Research: Chrome DevTools MCP, Auto-Nomination Rework, Mobile Command Center

**Domain:** Chrome extension + Fastify backend integration — DOM inspection tooling, auction automation, mobile remote control
**Researched:** 2026-03-14
**Confidence:** HIGH (existing system fully read) / MEDIUM (Chrome DevTools Protocol integration — see notes)

---

## Executive Summary

This document answers the question: "How do Chrome DevTools MCP, reworked auto-nomination, and full-control mobile integrate with the existing extension/backend/frontend architecture?" It maps every integration point, identifies new vs. modified files, and specifies a build order that respects the existing dependency graph.

The existing system has three layers communicating in a defined topology:

1. **Chrome extension (content script + background SW):** Scrapes ESPN DOM via MutationObserver and polling intervals. Drives `useDraftStore` (Zustand). Relays state to backend via WebSocket (`chrome.storage.local` change → background SW → `ws://localhost:3001/draft/live?role=extension`).
2. **Fastify WS hub (`draft-live.ts`):** Single-server multiplexer. One `extensionSocket`, N `mobileClients`. Fans extension `STATE_SNAPSHOT` out to all mobile clients. Routes mobile `CONTROL` messages back to extension socket.
3. **Next.js mobile page (`/draft/live`):** Connects to hub as `?role=mobile`. Displays read-only draft state. Sends `CONTROL` messages back via the same socket. No direct DOM access.

All three new features slot into this topology without requiring structural changes to the WS hub or the state relay path. The hub is a dumb bus — it does not need to understand the new message types.

---

## Current Architecture (Baseline)

### System Overview

```
ESPN Draft Page (browser tab)
  ├── content.tsx (content script, injected into ESPN page)
  │   ├── dom-observers.ts        — MutationObserver + polling scrapes ESPN DOM
  │   ├── draft-config-detector.ts — Detects league config from DOM
  │   ├── auto-bid-controller.ts  — Zustand subscriber; clicks bid/nominate buttons
  │   └── DraftSidebar (React, Shadow DOM)
  │       └── engine/ (pure functions: inflation, scarcity, simulation, etc.)
  │
  └── background.ts (service worker)
      ├── WS client → ws://localhost:3001/draft/live?role=extension
      ├── chrome.storage.local.onChanged → sends STATE_SNAPSHOT messages
      └── Receives CONTROL messages → chrome.tabs.sendMessage → content script

Fastify backend (localhost:3001)
  └── draft-live.ts (WebSocket route)
      ├── extensionSocket: WebSocket | null   — one extension at a time
      ├── mobileClients: Set<WebSocket>        — N mobile clients
      ├── latestSnapshot: string | null        — cached for reconnects
      └── Fan out: STATE_SNAPSHOT → all mobile clients
          Route back: CONTROL → extensionSocket

Next.js frontend (localhost:3000)
  └── /draft/live page
      ├── useDraftLiveSocket(wsUrl)  — WS consumer
      └── sendControl(action, payload) → CONTROL message to hub
```

### State Relay Flow

```
Zustand store mutation (engine compute, bid detected, pick scraped)
  ↓
content.tsx: chrome.storage.local.set({ 'draft-mobile-state': ..., 'draft-engine-signals': ... })
  ↓
background.ts: storage.onChanged fires → WS send STATE_SNAPSHOT { payload, engineSignals, ts }
  ↓
draft-live.ts hub: caches latestSnapshot, fans out to all mobile clients
  ↓
useDraftLiveSocket: setState(msg.payload), setEngineSignals(msg.engineSignals)
  ↓
Mobile page renders current nomination, win probability, budget, roster, alerts
```

### CONTROL Flow (Mobile → Extension)

```
Mobile user taps "Auto ON" / position filter / split slider
  ↓
sendControl("SET_AUTO_MODE", true) → WS CONTROL message to hub
  ↓
draft-live.ts hub: extensionSocket.send(raw)
  ↓
background.ts: receives CONTROL → chrome.tabs.sendMessage(tab.id, msg)
  ↓
content.tsx: onMessage listener → store.setAutoMode(true) etc.
```

### Existing CONTROL Actions

| Action | Handler in content.tsx |
|--------|------------------------|
| `SET_AUTO_MODE` | `store.setAutoMode(payload)` |
| `SET_POSITION_FILTER` | `store.setPositionFilter(payload)` |
| `TOGGLE_SIDEBAR` | `store.toggleSidebar()` |
| `SET_PITCHER_HITTER_SPLIT` | `store.setPitcherHitterSplit(payload)` |

---

## Feature 1: Chrome DevTools MCP Server

### What It Does

Exposes ESPN page DOM structure to an MCP client (Claude, Cursor, etc.) as tools. Allows inspection of live DOM selectors without opening DevTools manually. Primary use case: debugging and validating DOM selectors that `dom-observers.ts` and `auto-bid-controller.ts` depend on.

### Integration Point

Chrome DevTools Protocol (CDP) is accessible from Node.js via the `chrome-remote-interface` or `puppeteer/playwright` CDP client. In a local dev context, Chrome must be launched with `--remote-debugging-port=9222`. The MCP server exposes CDP primitives as MCP tools callable from Claude Code.

The MCP server is a **standalone Node.js process** — not part of the Fastify backend. It runs on a different port and has no runtime coupling to the extension or Fastify. Its sole job is: accept MCP tool calls → invoke CDP → return DOM data.

### Component Map

#### New Files

| File | Purpose |
|------|---------|
| `tools/espn-devtools-mcp/index.ts` | MCP server entry point — registers tools, starts stdio or HTTP transport |
| `tools/espn-devtools-mcp/cdp-client.ts` | CDP connection management — connect to Chrome on port 9222, reconnect on drop |
| `tools/espn-devtools-mcp/tools/query-selector.ts` | MCP tool: `querySelector(selector)` → returns matching element count + outer HTML |
| `tools/espn-devtools-mcp/tools/get-dom-tree.ts` | MCP tool: `getDOMTree(depth?)` → returns simplified DOM tree JSON |
| `tools/espn-devtools-mcp/tools/evaluate-expression.ts` | MCP tool: `evaluateExpression(expr)` → evaluates JS in page context, returns result |
| `tools/espn-devtools-mcp/tools/get-auction-selectors.ts` | MCP tool: `getAuctionSelectors()` → runs known selector battery, reports which matched |
| `tools/espn-devtools-mcp/package.json` | Standalone package — not part of existing monorepo packages |

#### No-Change Files

The MCP server does not touch:
- `packages/extension/` — no modification to DOM observers or auto-bid controller
- `packages/backend/` — no modification to Fastify routes
- `packages/frontend/` — no modification to mobile page

### Data Flow

```
Claude Code / Cursor (MCP client)
  ↓ MCP tool call: querySelector(".pick-train")
  ↓
tools/espn-devtools-mcp/index.ts (MCP server, stdio transport)
  ↓
cdp-client.ts: Runtime.evaluate({ expression: "document.querySelectorAll(...).length" })
  ↓
Chrome browser (ESPN draft tab, port 9222)
  ↓ returns count, outerHTML sample
  ↓
MCP server → tool response to Claude
```

### Key Constraint: Chrome Must Run with Remote Debugging Enabled

Chrome must be launched with `--remote-debugging-port=9222` for CDP to work. Normal Chrome does not allow external CDP connections. In local dev, this means using a separate Chrome profile launched from the command line. This is a setup prerequisite, not an architectural constraint on the codebase.

Confidence: MEDIUM — CDP target discovery (`/json/list` endpoint) and `Runtime.evaluate` are stable and well-documented APIs. The MCP tool wrapping pattern is straightforward. The risk is that ESPN's draft page may use iframe sandboxing that requires targeting a specific CDP frame — this needs validation against the live ESPN draft page.

### Build Order for Feature 1

1. Install `chrome-remote-interface` (or `@modelcontextprotocol/sdk`) in `tools/espn-devtools-mcp/`
2. Implement `cdp-client.ts` — connect to localhost:9222, list targets, select ESPN draft tab
3. Implement `query-selector` tool — simplest CDP call
4. Implement `get-auction-selectors` tool — runs the full selector battery from `dom-observers.ts` and reports matches
5. Test against live ESPN draft page
6. Implement `evaluate-expression` last (higher security surface area)

---

## Feature 2: Auto-Nomination Rework

### Current State

`AutoBidController.populateQueue()` uses `findActionButton(playerId)` which queries `button.action-btn[data-player-id="${playerId}"]` — a selector that assumes ESPN attaches `data-player-id` to queue buttons. `isMyTurnToNominate()` uses five fallback strategies, several of which match on unstable text content (`"nominate a player"`) or broad structural patterns. `scrapeESPNNominationQueue()` detects queued players by button text containing "dequeue" / "deselect" / "remove" — also fragile against ESPN renaming.

The core problem: selectors are guesses that have never been validated against the live 2026 ESPN auction draft DOM. The MCP DevTools server (Feature 1) is the primary tool for fixing this.

### What Changes

The rework is **inside existing files only**. No new files are created. The architectural pattern (DOM scraping → Zustand store → AutoBidController action) does not change.

#### Modified Files

| File | What Changes |
|------|--------------|
| `packages/extension/lib/dom-observers.ts` | Replace speculative selectors with validated selectors from MCP inspection. Update `scrapeESPNNominationQueue()`, `observeCurrentAuctionPlayer()`, `scrapeESPNAuctionTable()`, and pick-train scraping. |
| `packages/extension/lib/auto-bid-controller.ts` | Update `isMyTurnToNominate()` strategy priority based on what actually works. Potentially replace Strategy 1 (body text match) with a more reliable DOM signal. Update `findActionButton()` if `data-player-id` is not present in the live DOM. |
| `packages/extension/lib/draft-config-detector.ts` | Update position tracker and budget scraping selectors as needed. |

#### No-Change Files

- `packages/extension/entrypoints/content.tsx` — orchestration logic unchanged
- `packages/extension/entrypoints/background.ts` — WS relay unchanged
- `packages/backend/` — no changes
- `packages/frontend/` — no changes

### Key Pattern: Selector Validation Protocol

The rework requires a specific workflow rather than code changes alone:

```
1. Use Feature 1 (MCP DevTools) to inspect live ESPN draft DOM
   → getAuctionSelectors() reports which selectors match
   → querySelector(".pick-train") returns outer HTML sample
   → evaluateExpression("...") extracts exact class names

2. Update dom-observers.ts with validated selectors
   → Replace all "speculative" selectors with confirmed matches
   → Add selector version comment with date

3. Update auto-bid-controller.ts isMyTurnToNominate() strategy order
   → Strategy that reliably matches moves to position 1
   → Unreliable strategies demoted or removed

4. Live test during actual draft
   → NominationDiagnostics panel (already built in phase 33) shows which strategy matched
   → Force Nominate button allows real-time validation
```

### Nomination Flow Architecture (Post-Rework)

The flow remains the same — only selector reliability changes:

```
AutoBidController.evaluateAndNominate()
  ├── isMyTurnToNominate()  ← USES VALIDATED SELECTORS
  │   └── Returns true when confident it's our turn
  ├── Select candidate from nominationStrategy or idealRoster
  ├── findActionButton(playerId)  ← USES VALIDATED SELECTORS
  │   └── May fall through to searchAndQueue()
  └── button.click()
```

### Queue Population Flow (Post-Rework)

```
AutoBidController.populateQueue()  [called on 15s interval + every updateSignals()]
  ├── scrapeESPNNominationQueue()   ← USES VALIDATED SELECTORS
  │   └── Detects which players are already queued by button state
  ├── Build candidate list from nominationStrategy + idealRoster
  ├── findActionButton(playerId) or searchAndQueue()
  └── button.click() to add to queue
```

---

## Feature 3: Mobile Draft Command Center Redesign

### Current State

The mobile page (`/draft/live`) is a **read-mostly** experience. The only controls are:
- Auto-bid toggle (on/off)
- Position filter (dropdown)
- Pitcher/hitter split (slider)

There is no way to force a nomination, view top targets interactively, or override the engine recommendation from mobile. The page layout is a vertical stack of SectionCard components with no navigation.

### What Changes

The redesign adds new CONTROL message types and new UI sections to the mobile page. The WS hub is a transparent bus — it does not need to understand the new message types. The backend does not change.

#### New CONTROL Actions

The mobile page sends these new `CONTROL` messages. The extension content script handles them:

| New Action | Payload | Handler Change Required |
|------------|---------|------------------------|
| `FORCE_NOMINATE` | none | content.tsx: `autoBidController.forceNominate()` |
| `SKIP_PLAYER` | `{ playerName: string }` | content.tsx: marks player as skipped in store → engine re-ranks |
| `SET_BUDGET_OVERRIDE` | `{ amount: number }` | content.tsx: `store.setRemainingBudget(payload)` (already exists) |
| `NAVIGATE_TAB` | `{ tab: "targets" \| "roster" \| "alerts" \| "controls" }` | Mobile-only: changes active tab in mobile UI, no extension handler needed |

#### Modified Files

| File | What Changes | Why |
|------|--------------|-----|
| `packages/frontend/src/app/draft/live/page.tsx` | Redesign from vertical stack to tabbed layout. Add Targets tab, Controls tab. Add Force Nominate button. Add skip player buttons next to target list items. | Full-control command center requires navigation and richer interactions |
| `packages/frontend/src/app/draft/live/useDraftLiveSocket.ts` | Add types for new CONTROL actions. Add `NAVIGATE_TAB` handler (local state only). | New actions need type coverage |
| `packages/extension/entrypoints/content.tsx` | Add `case "FORCE_NOMINATE"` and `case "SKIP_PLAYER"` to the CONTROL message switch. | Extension needs to handle new commands |
| `packages/extension/lib/draft-state.ts` | Add `skippedPlayerIds: Set<number>` to store (or array for serialization). | Skip state must persist in the engine evaluation loop |
| `packages/extension/lib/engine/nomination-strategy.ts` | Filter out `skippedPlayerIds` from nomination candidates. | Skip signal must propagate to engine output |

#### No-Change Files

- `packages/backend/src/api/draft-live.ts` — hub is transparent, no changes
- `packages/extension/entrypoints/background.ts` — CONTROL routing unchanged
- All engine files except `nomination-strategy.ts`

### New Mobile Page Layout

```
Mobile Command Center (/draft/live)
  ├── Header (sticky)
  │   ├── Title + Connection dot
  │   └── Tab nav: [Live] [Targets] [Roster] [Controls]
  │
  ├── [Live tab] — Current nomination card
  │   ├── Player name, positions, nominating team
  │   ├── Current bid + Max bid verdict (BID/PASS in large text)
  │   ├── Value surplus + expected market price
  │   └── Win probability + decision comparison
  │
  ├── [Targets tab] — Top player targets
  │   ├── List of engine topTargets (from RosterOptimizationSignal)
  │   ├── Each row: player name, position, max bid, [Skip] button
  │   └── [Force Nominate top target] button (only when auto mode is ON)
  │
  ├── [Roster tab] — My drafted roster
  │   ├── Roster table with positions and cost
  │   ├── Budget breakdown: remaining / spent / slots left
  │   └── Category progress bars (from categoryProgress if available)
  │
  └── [Controls tab] — Draft controls
      ├── Auto-bid toggle (large button)
      ├── Position filter
      ├── Pitcher/Hitter split slider
      ├── Budget override input
      └── Force Nominate button (bypasses cooldown/attempts)
```

### Data Flow for New Commands

```
Mobile user taps [Force Nominate] in Controls tab
  ↓
sendControl("FORCE_NOMINATE", undefined)
  ↓ WS CONTROL message
draft-live.ts hub: extensionSocket.send(raw)  [no change to hub]
  ↓
background.ts: receives CONTROL → chrome.tabs.sendMessage(tab.id, msg)  [no change to SW]
  ↓
content.tsx: case "FORCE_NOMINATE": autoBidController.forceNominate()
  ↓
AutoBidController.forceNominate(): resets cooldown/attempts, calls evaluateAndNominate()
  ↓
ESPN DOM: button.click() on nominate button
```

```
Mobile user taps [Skip] next to "Juan Soto" in Targets tab
  ↓
sendControl("SKIP_PLAYER", { playerName: "Juan Soto" })
  ↓ WS CONTROL message
hub → background SW → content.tsx
  ↓
content.tsx: case "SKIP_PLAYER": store.addSkippedPlayer(payload.playerName)
  ↓
draft-state.ts: skippedPlayerIds updated
  ↓
engine/nomination-strategy.ts: filters out skipped players from candidates
  ↓
Next useDraftEngine() compute: nomination strategy no longer shows Juan Soto
  ↓
STATE_SNAPSHOT sent back to mobile: topTargets list updated (Juan Soto absent)
```

---

## Component Boundaries Summary

### New Components

| Component | Package | Type | Responsibility |
|-----------|---------|------|----------------|
| `tools/espn-devtools-mcp/` | New standalone package | Node.js MCP server | CDP-based ESPN DOM inspection |
| `tools/espn-devtools-mcp/cdp-client.ts` | New | Module | CDP connection, target discovery |
| `tools/espn-devtools-mcp/tools/*.ts` | New | MCP tools | DOM query, eval, selector battery |

### Modified Components

| Component | Package | Change Type | Change Scope |
|-----------|---------|-------------|--------------|
| `packages/extension/lib/dom-observers.ts` | Extension | Selector update | Replace speculative selectors with validated ones — no API change |
| `packages/extension/lib/auto-bid-controller.ts` | Extension | Strategy update | Reorder/replace `isMyTurnToNominate()` strategies — no API change |
| `packages/extension/entrypoints/content.tsx` | Extension | New CONTROL handlers | Add 2 new switch cases |
| `packages/extension/lib/draft-state.ts` | Extension | New state field | `skippedPlayerIds` set |
| `packages/extension/lib/engine/nomination-strategy.ts` | Extension | Filter | Skip skipped players |
| `packages/frontend/src/app/draft/live/page.tsx` | Frontend | Full redesign | Tabbed layout, new command buttons |
| `packages/frontend/src/app/draft/live/useDraftLiveSocket.ts` | Frontend | Type additions | New CONTROL action types |

### Unchanged Components

| Component | Why Untouched |
|-----------|---------------|
| `packages/backend/src/api/draft-live.ts` | Hub is a transparent bus — does not interpret CONTROL or STATE_SNAPSHOT payload content |
| `packages/extension/entrypoints/background.ts` | WS relay logic is generic — forwards any JSON message |
| `packages/extension/lib/engine/` (except nomination-strategy.ts) | Engine is deterministic — skip list is an input filter, not an engine change |
| `packages/backend/src/api/` (all other routes) | No new backend API surface |
| `packages/shared/src/` | No shared type changes required |

---

## Data Flow Map (All Three Features)

```
MCP Client (Claude Code)
  ↓ MCP tool call
tools/espn-devtools-mcp/        [NEW: Feature 1]
  ↓ Chrome DevTools Protocol
Chrome tab (ESPN draft page)
  ↓ DOM inspection results
MCP Client receives validated selectors
  ↓
Developer updates dom-observers.ts  [MODIFIED: Feature 2]
  ↓
Auto-bid-controller.ts uses validated selectors  [MODIFIED: Feature 2]
  ↓
ESPN DOM: reliable click on correct button


Mobile user (phone, /draft/live)
  ↓ tap Force Nominate / Skip Player
useDraftLiveSocket.sendControl()   [MODIFIED: Feature 3]
  ↓ WS CONTROL
draft-live.ts hub                   [UNCHANGED]
  ↓
background.ts SW                    [UNCHANGED]
  ↓ chrome.tabs.sendMessage
content.tsx CONTROL handler         [MODIFIED: Feature 3]
  ↓
autoBidController or store action   [MODIFIED: Feature 3]
  ↓ state change + engine recompute
chrome.storage.local.set
  ↓
background.ts: STATE_SNAPSHOT       [UNCHANGED]
  ↓
hub → mobile clients                [UNCHANGED]
  ↓
Mobile page shows updated state     [MODIFIED: Feature 3]
```

---

## Architectural Patterns

### Pattern 1: Hub as Transparent Bus

**What:** The Fastify WS hub (`draft-live.ts`) forwards messages byte-for-byte without parsing payload content beyond the `type` field (for PING/PONG). All business logic lives in the extension (content script) and the mobile client.

**When to use:** For all new CONTROL actions and any new STATE_SNAPSHOT fields. Never add payload-specific logic to the hub.

**Trade-off:** The hub cannot validate, rate-limit, or transform messages. For a local dev tool this is acceptable. For production, a validation layer would be needed.

**Example:**
```typescript
// hub (draft-live.ts) — no changes needed for new CONTROL types
if (msg.type === "CONTROL" && extensionSocket?.readyState === 1) {
  extensionSocket.send(raw.toString()); // forwards blindly — correct behavior
}
```

### Pattern 2: Zustand as Single State Authority

**What:** All extension state lives in `useDraftStore`. CONTROL messages translate to store mutations. Engine recomputes from store state. State serialized to `chrome.storage.local` triggers WS relay.

**When to use:** New skip state (`skippedPlayerIds`) follows this pattern. Store → engine input → STATE_SNAPSHOT output.

**Trade-off:** State serialization to `chrome.storage.local` has a 5MB quota and is synchronous on write. Large sets (skipped players) should be stored as arrays (serializable), not `Set` (not JSON-serializable directly).

**Example:**
```typescript
// draft-state.ts
skippedPlayerIds: number[];  // NOT Set<number> — storage requires JSON serialization
addSkippedPlayer: (playerId: number) => set((s) => ({
  skippedPlayerIds: [...new Set([...s.skippedPlayerIds, playerId])]
}));
```

### Pattern 3: MCP Tool = CDP Wrapper

**What:** Each MCP tool is a thin wrapper around a CDP method call. Tools do not contain business logic — they return raw DOM data for the MCP client to interpret.

**When to use:** `getAuctionSelectors()` is the exception — it bundles a selector battery and returns structured results. This bundling is appropriate because running each selector individually would require many round trips.

**Trade-off:** CDP requires Chrome launched with `--remote-debugging-port=9222`. This is a setup constraint that cannot be programmatically bypassed.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding CONTROL Dispatch Logic to the Hub

**What people do:** Add a switch/case inside `draft-live.ts` that handles specific CONTROL action types (e.g., validates `FORCE_NOMINATE`, rate-limits `SKIP_PLAYER`).

**Why it's wrong:** The hub is currently stateless and has zero business logic. Adding per-action logic creates coupling between the hub (a transport layer) and the domain model (nomination strategy, skip lists). Changes to CONTROL actions would require backend deploys.

**Do this instead:** Keep the hub as a transparent forwarder. All CONTROL validation belongs in content.tsx (the actual executor).

### Anti-Pattern 2: Using CDP Runtime.evaluate for DOM Mutations in Production

**What people do:** Use the DevTools MCP server to click buttons or mutate DOM on the live ESPN page during a real draft.

**Why it's wrong:** CDP evaluate runs in the page's main world and bypasses Chrome extension security. This is debugging infrastructure only. Auto-bid should always use `button.click()` from within the content script.

**Do this instead:** Use MCP only for inspection (read-only queries). DOM mutations remain in `auto-bid-controller.ts` running inside the extension content script.

### Anti-Pattern 3: Storing Skip State Only in Mobile UI

**What people do:** Track skipped players as local React state in the mobile page (`const [skipped, setSkipped] = useState([])`).

**Why it's wrong:** The mobile page does not control the nomination engine — the extension does. A skip list in mobile React state cannot prevent the extension from nominating a skipped player. Skip state must round-trip through the CONTROL → content script → store → engine pipeline.

**Do this instead:** `sendControl("SKIP_PLAYER", { playerName })` → store mutation in extension → engine filters. Mobile page reflects the updated `topTargets` from the next `STATE_SNAPSHOT`.

### Anti-Pattern 4: One CDP Connection Per MCP Tool Call

**What people do:** In each MCP tool's `execute()` function, open a new CDP connection, run the query, close it.

**Why it's wrong:** CDP connection setup has ~100-200ms overhead. If multiple tools are called in sequence (a selector battery), this adds seconds of latency.

**Do this instead:** `cdp-client.ts` maintains a singleton CDP connection that reconnects on drop. Tool handlers call into the shared client.

---

## Build Order (Cross-Feature Dependencies)

Dependencies flow strictly. Feature 1 (MCP server) unblocks Feature 2 (selector rework). Feature 3 (mobile redesign) can start independently.

```
Feature 1: Chrome DevTools MCP          [no upstream deps, starts first]
  → tools/espn-devtools-mcp scaffolding
  → cdp-client.ts (singleton connection)
  → querySelector + evaluateExpression tools
  → getAuctionSelectors tool (runs selector battery)
  → Validated: can inspect live ESPN draft DOM

Feature 2: Auto-Nomination Rework       [depends on Feature 1 output]
  → Run MCP against live ESPN draft page
  → Document confirmed selector patterns
  → Update dom-observers.ts selectors
  → Update auto-bid-controller.ts isMyTurnToNominate() strategies
  → Validate: NominationDiagnostics panel shows correct turn detection

Feature 3: Mobile Command Center        [independent of Features 1 & 2]
  → Add skippedPlayerIds to draft-state.ts
  → Add SKIP_PLAYER / FORCE_NOMINATE to nomination-strategy.ts engine filter
  → Add new CONTROL cases to content.tsx
  → Redesign /draft/live page.tsx with tab navigation
  → Add new action types to useDraftLiveSocket.ts
  → Validate: Force Nominate fires from phone, Skip removes from target list
```

**Why this order:** Feature 2 cannot produce reliable selector fixes without Feature 1's inspection results. Feature 3 is self-contained (new UI + new CONTROL types) with no dependency on DOM selector correctness.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Chrome DevTools Protocol | HTTP + WebSocket (`localhost:9222`) | Chrome must be launched with `--remote-debugging-port=9222`. Target discovery at `/json/list`. CDP over WebSocket for Runtime.evaluate. |
| ESPN Draft Page | MutationObserver + polling (existing) | No changes to how extension connects to ESPN — only which selectors it uses. |
| Fastify WS hub | Existing — no changes | Hub is transparent. New CONTROL types flow through unchanged. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP server ↔ Chrome tab | Chrome DevTools Protocol (CDP) | Read-only inspection only. No mutations from MCP server. |
| Mobile page ↔ WS hub | WebSocket (existing) | New CONTROL action types added to protocol. Hub does not need updating. |
| content.tsx ↔ auto-bid-controller | Direct function call (existing) | Two new calls: `autoBidController.forceNominate()` and `store.addSkippedPlayer()` |
| engine/nomination-strategy.ts ↔ draft-state | DraftEngineInput (existing) | `skippedPlayerIds` added to `DraftEngineInput` type — minor type extension |
| MCP DevTools server ↔ developer | Stdio MCP transport | No integration with running app — pure developer tooling |

---

## Sources

- Existing codebase: `packages/extension/entrypoints/background.ts`, `content.tsx`, `lib/auto-bid-controller.ts`, `lib/dom-observers.ts`, `lib/draft-state.ts`, `lib/engine/types.ts` (read 2026-03-14)
- Existing codebase: `packages/backend/src/api/draft-live.ts` (read 2026-03-14)
- Existing codebase: `packages/frontend/src/app/draft/live/page.tsx`, `useDraftLiveSocket.ts` (read 2026-03-14)
- Chrome DevTools Protocol documentation: https://chromedevtools.github.io/devtools-protocol/ (MEDIUM confidence — stable API, but ESPN iframe structure may require additional target selection logic not yet validated)
- Model Context Protocol spec: https://spec.modelcontextprotocol.io/ (HIGH confidence — stdio transport and tool definition patterns are stable)
- `@modelcontextprotocol/sdk` pattern (standard tool definition): HIGH confidence based on existing MCP tooling ecosystem

---

*Architecture research for: Chrome DevTools MCP, auto-nomination rework, mobile command center*
*Researched: 2026-03-14*
