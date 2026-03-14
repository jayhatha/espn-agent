# Pitfalls Research

**Domain:** Chrome Extension DOM Automation + Chrome DevTools MCP + WebSocket Mobile Companion
**Researched:** 2026-03-14
**Confidence:** HIGH (project history, official Chrome DevTools MCP docs, GitHub repo) / MEDIUM (MCP failure modes from community)

---

## Critical Context

This document covers pitfalls specific to **adding three features to an existing system**:

1. **Chrome DevTools MCP** — development-time tool for ESPN DOM inspection (not a runtime dependency)
2. **Auto-nomination rework** — `auto-bid-controller.ts` + `dom-observers.ts`, which have accumulated 10+ selector-fix iterations (quick tasks 60, 79, 80, 85–90). Each fix introduced its own regression.
3. **Mobile draft companion expansion** — `draft/live` page + `draft-live.ts` WebSocket relay. Currently 3 control messages. Adding full-control means more message types, more state to relay, more surface area for desync.

**Existing system facts that shape every pitfall:**
- Auto-bid controller: ~900 lines, Zustand store subscription, polling loops, in-memory nomination state
- WebSocket relay: single-module `draftLiveRoutes`, one extension socket, N mobile clients, no authentication
- Extension: Chrome MV3, content script on `fantasy.espn.com/baseball/draft*`
- ESPN frontend: React-controlled inputs, JSX-generated class names, dynamic DOM re-renders
- Chrome DevTools MCP: dev-only, connects to a separate Chrome profile via remote debugging

---

## Critical Pitfalls

### Pitfall 1: ESPN React Inputs Silently Ignore Programmatic `Event('input')` Dispatch

**What goes wrong:**
Auto-nomination code dispatches a JavaScript `Event('input')` to populate ESPN's search input. The input element's visible value changes but ESPN's React state doesn't update — the search returns no results. The selector logic then fails to find the Queue button, treats the nomination attempt as failed, and backs off. No error is thrown.

**Why it happens:**
ESPN's draft page is a React app using controlled inputs. React's synthetic event system reads `data` and `inputType` from `InputEvent` to reconcile value changes. A plain `Event('input', { bubbles: true })` provides neither field — React ignores it silently. The browser DOM accepts the event but React's virtual DOM never updates. This was root-caused in quick task 86 and required switching to `InputEvent` with `{ data: searchTerm, inputType: 'insertText' }` plus `focus()` before dispatch and `nativeInputValueSetter` to bypass React's read-only value setter.

**How to avoid:**
Any time the rework dispatches synthetic events to ESPN inputs, use the established pattern:
```typescript
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value'
)?.set;
nativeInputValueSetter?.call(input, searchTerm);
input.focus();
input.dispatchEvent(new InputEvent('input', { data: searchTerm, inputType: 'insertText', bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
```
Never simplify to `input.value = x; input.dispatchEvent(new Event('input'))`.

**Warning signs:**
- Search input shows text but dropdown/results don't appear
- Nomination flow falls through to "no button found" with correct player name in logs
- Quick tasks targeting `searchAndNominate` or `clearPlayerSearch` that look like "just add `focus()` calls"

**Phase to address:** Auto-nomination rework phase — document the React input dispatch pattern as an invariant in the method header comment. Add a test fixture that confirms `InputEvent` type (not `Event`) is used.

---

### Pitfall 2: ESPN DOM Render Timing Is Non-Deterministic — Single Delays Break Under Load

**What goes wrong:**
After clicking a search result or triggering a nomination, the code waits a fixed delay (e.g., 800ms) then queries for the Queue/Select button. During a fast draft with many simultaneous bidders, ESPN's server-round-trip and React re-render takes longer than 800ms. The button isn't in the DOM yet. The nomination attempt fails. The cooldown fires, and 5 seconds later the nomination window has closed.

**Why it happens:**
Fixed delays are cargo-culted from the first working attempt and never adjusted when ESPN's load characteristics change. This is the root cause of the quick task 86 → 87 → 88 → 89 regression chain: each fix added 200–400ms to a delay, then the next failure prompted another delay increase. Quick task 89 finally replaced delays with `pollForQueueButton` (300ms polling, 3000ms max), which handles variable render latency correctly.

**How to avoid:**
Replace every fixed `setTimeout` delay that waits for a DOM element with a polling loop:
```typescript
function pollForElement(
  selector: () => Element | null,
  onFound: (el: Element) => void,
  intervalMs = 300,
  maxMs = 3000,
): void {
  const start = Date.now();
  function attempt() {
    const el = selector();
    if (el) { onFound(el); return; }
    if (Date.now() - start >= maxMs) { /* log timeout + DOM snapshot */ return; }
    setTimeout(attempt, intervalMs);
  }
  attempt();
}
```
The `pollForDropdown` and `pollForQueueButton` patterns already in `auto-bid-controller.ts` are the correct model. When reworking nomination, extend them — do not add new fixed delays.

**Warning signs:**
- Magic numbers like `1200`, `1500`, `2000` in setTimeout calls waiting for DOM elements
- "Button not found" in nomination logs on the first attempt, followed by success on retry
- Nomination reliability degrades on slow draft days vs. fast ones

**Phase to address:** Auto-nomination rework — audit all `setTimeout` calls in `auto-bid-controller.ts`; replace any that wait for ESPN DOM elements with polling loops. Keep fixed delays only for inter-nomination pacing (the 1s cooldown after an auction ends is intentional).

---

### Pitfall 3: Auto-Nomination State Machine Has No Single Source of Truth

**What goes wrong:**
The nomination controller tracks state across multiple private fields (`nominationAttempts`, `lastNominationTime`, `lastCandidateSource`, `nominationDelayTimer`, `queuedPlayerIds`) that are reset in three different places: `clearNominationState()`, `stop()`, and inline within `evaluateAndNominate()`. When a new feature adds a reset path (e.g., "force re-populate queue on reconnect"), it calls one reset path but not another. Nomination attempts start from a stale counter, the cooldown doesn't clear, or the queued player set is out of sync with actual ESPN queue state.

**Why it happens:**
The controller grew incrementally over 10 quick tasks. Each task added a new state field and reset it in the obvious place. No single method owns all state lifecycle. The `clearNominationState()` already exists to address this, but it doesn't include `queuedPlayerIds` — that was added later and resets only in `stop()`, not in `clearNominationState()`.

**How to avoid:**
Before adding any new nomination-related state field:
1. Add it to the `NominationDiagnostics` interface immediately (forces it to be observable)
2. Reset it in `clearNominationState()` — the one canonical reset path
3. Verify `stop()` calls `clearNominationState()` (it does — preserve this)
4. Never reset nomination state inline in `evaluateAndNominate()` except for `nominationAttempts = 0` on player-appeared events (that's a deliberate design, not a reset)

**Warning signs:**
- Nomination works after page reload but breaks mid-draft without a reload
- `getNominationDiagnostics()` shows stale data that doesn't match observed behavior
- `queuedPlayerIds.size` non-zero after `clearNominationState()` is called

**Phase to address:** Auto-nomination rework phase — consolidate all state resets into `clearNominationState()` as the first task before adding new features.

---

### Pitfall 4: Chrome DevTools MCP Requires a Separate Chrome Profile — Cannot Use the Live Draft Profile

**What goes wrong:**
Developer connects Chrome DevTools MCP to their default Chrome profile to inspect ESPN's live draft DOM. Starting with Chrome 136, remote debugging is blocked on default profiles as a security measure. The MCP server fails to connect or connects to a stale, non-draft page. The developer then installs an `--allow-remote-debugging` workaround that enables remote debugging on their actual session — now their ESPN cookies, draft state, and any other open tabs are fully accessible to the MCP client (which may include AI agents reading the entire browser context).

**Why it happens:**
The documentation says "current stable Chrome" but Chrome 136 added a profile-level restriction on remote debugging that requires a separate `--user-data-dir`. Many setup guides predate Chrome 136 and show the simple `--remote-debugging-port=9222` without a separate profile.

**How to avoid:**
Use a dedicated Chrome profile for MCP inspection, never the live draft profile:
```bash
# Correct — separate profile, separate port
google-chrome --remote-debugging-port=9223 \
  --user-data-dir=/tmp/espn-devtools-profile \
  "https://fantasy.espn.com/baseball/draft?..."
```
In Claude Code MCP config, use `--wsEndpoint` to connect to the debug port, not `--autoConnect` (which expects the default profile). Document this in a repo-level note so any developer can reproduce the setup.

**Warning signs:**
- `chrome-devtools-mcp` fails to launch or immediately disconnects
- Chrome shows a "remote debugging is not enabled for this profile" error
- The MCP connects but page content is not the ESPN draft page

**Phase to address:** Chrome DevTools MCP setup phase — document the exact launch command and MCP config before any DOM inspection tasks. Treat this as a dev environment setup step, not a runtime dependency.

---

### Pitfall 5: chrome-devtools-mcp Node.js Minor Version Constraint Is Enforced Strictly

**What goes wrong:**
Developer runs `npx chrome-devtools-mcp@latest` on Node.js 20.18.0. The process exits immediately with a version error. This is not `node: >= 20` — it requires `^20.19.0 || ^22.12.0 || >=23`. Minor version matters. If the repo's `.nvmrc` is set to `20.x` (which resolves to 20.18 on some systems), every developer who runs `nvm use` will hit this.

**Why it happens:**
chrome-devtools-mcp enforces version validation at startup via an explicit check — it exits before any server code runs. The `^20.19.0` constraint is about a specific API stabilization in Node 20 LTS. Developers who see `>=20` in README text (if any) or assume LTS is compatible get surprised.

**How to avoid:**
Document the required Node version in the project's development setup notes. If `.nvmrc` is pinned to `20`, update it to `20.19.0` minimum. Run `node -v` and confirm before any chrome-devtools-mcp session.

The extension and backend do not need chrome-devtools-mcp at runtime — this constraint only affects developers doing DOM inspection. Keep it out of the main `package.json` dependencies; run via `npx` only.

**Warning signs:**
- `npx chrome-devtools-mcp` exits immediately with no error visible (process exit code non-zero but no output to stderr if terminal isn't showing it)
- Works on CI (newer Node) but not on local dev

**Phase to address:** Chrome DevTools MCP setup phase — check and document Node version before running any inspection sessions.

---

### Pitfall 6: Adding New CONTROL Message Types Without Validating in Extension Content Script Causes Silent Failures

**What goes wrong:**
A new mobile control is added (e.g., `FORCE_NOMINATE`, `QUEUE_PLAYER`, `NOMINATE_FROM_QUEUE`). The mobile page sends `{ type: "CONTROL", action: "FORCE_NOMINATE" }`. The WebSocket relay in `draft-live.ts` forwards it to the extension background worker. The background worker forwards it via `chrome.runtime.sendMessage`. The content script's `switch` statement has no `case "FORCE_NOMINATE"` — it falls through silently. No error is thrown, no response is different, the mobile UI gets `{ ok: true }` back, and the user thinks the action executed.

**Why it happens:**
The relay layer in `draft-live.ts` is transport-only — it forwards any `CONTROL` message without validation. The content script is the action executor, but TypeScript doesn't enforce that the switch is exhaustive because the action is typed as `string` (not a discriminated union). The `sendResponse({ ok: true })` fires unconditionally regardless of whether any action matched.

**How to avoid:**
1. Define a typed union for all CONTROL actions in a shared type file:
```typescript
export type ControlAction =
  | "SET_AUTO_MODE"
  | "SET_POSITION_FILTER"
  | "SET_PITCHER_HITTER_SPLIT"
  | "TOGGLE_SIDEBAR"
  | "FORCE_NOMINATE";
```
2. Use this type in the content script's message listener and in the mobile page's `sendControl` call.
3. Add a `default` case that logs a warning: `logger.warn('[Control] Unknown action:', message.action)`.
4. In the relay, consider echoing `{ ok: false, error: 'unknown action' }` for unrecognized actions to surface gaps during development.

**Warning signs:**
- Mobile button appears to work (no error) but extension takes no action
- Console in extension shows no log for an action that should have fired
- "Missing case" TypeScript error not appearing because `action` is typed as `string`

**Phase to address:** Mobile companion expansion phase — type the CONTROL action union before adding any new message types.

---

### Pitfall 7: WebSocket Relay Has No Extension-Connected Guard — Mobile Controls Fire Into the Void

**What goes wrong:**
The mobile page is connected to the WebSocket relay. The extension tab is closed or the draft ends. The mobile user taps "Force Nominate" or "Auto ON". The relay receives the CONTROL message, checks `extensionSocket?.readyState === 1`, finds it `null`, and silently drops the message. The mobile UI shows no feedback — no error, no "extension disconnected" state.

**Why it happens:**
`draft-live.ts` correctly does `if (msg.type === "CONTROL" && extensionSocket?.readyState === 1)` before forwarding. This is the right guard, but the mobile client doesn't know the extension is disconnected — `STATE_SNAPSHOT` messages stop arriving, but the mobile page's `connected` flag (which reflects WebSocket connection to the relay, not extension presence) stays `true`. The user keeps tapping controls thinking they're working.

**How to avoid:**
Add extension presence to the state snapshot relay: when the extension connects or disconnects, send a `{ type: "EXTENSION_STATUS", connected: bool }` message to all mobile clients. The mobile page should display a clear "Extension disconnected" banner and disable all control buttons when this arrives.

In `draft-live.ts`:
```typescript
// When extension connects
for (const client of mobileClients) {
  if (client.readyState === 1) {
    client.send(JSON.stringify({ type: "EXTENSION_STATUS", connected: true }));
  }
}
// When extension disconnects
for (const client of mobileClients) {
  if (client.readyState === 1) {
    client.send(JSON.stringify({ type: "EXTENSION_STATUS", connected: false }));
  }
}
```

**Warning signs:**
- Mobile controls send successfully to relay but extension takes no action
- Mobile `connected` state stays green while draft state stops updating
- User reports "tapping buttons does nothing" after extension tab was closed

**Phase to address:** Mobile companion expansion phase — implement EXTENSION_STATUS message before adding any new control actions.

---

### Pitfall 8: Nomination Turn Detection Has 5 Competing Strategies — A New Rework Can Break the Strategy That Actually Works

**What goes wrong:**
`isMyTurnToNominate()` has at least 5 detection strategies, each added when a previous one failed. Strategy 4 (`button.Button--select[data-player-id]`) is the current primary match, added in quick task 80. A rework that modifies how the player table is scraped, or changes the MutationObserver target, breaks the DOM context that Strategy 4 relies on — without breaking the TypeScript build. The function now returns false when it's genuinely the user's turn.

**Why it happens:**
Each strategy was added at an inflection point where ESPN changed its DOM or the previous strategy had edge-case failures. The strategies have no test coverage against real ESPN DOM snapshots. There is no regression test that says "given this DOM state, `isMyTurnToNominate()` must return `true`."

**How to avoid:**
Before any rework of nomination, run `window.espnDraftAssistant.nominationDiag()` in a live draft to record which strategy currently matches. Document it at the top of `isMyTurnToNominate()`. If the rework changes DOM observation scope, re-verify the winning strategy still finds its elements.

When Chrome DevTools MCP is available, use it to snapshot the exact DOM state during "it's your turn to nominate" and save it as a test fixture for `isMyTurnToNominate()`. This allows offline regression testing before deploying.

**Warning signs:**
- Nomination diagnostics panel shows "Not detected (checked 5 strategies)" when it should be detecting a turn
- Turn detection worked before and stopped working after an unrelated DOM observer change
- `lastTurnDetectionResult.matched` is false but the user can manually see the "Select" button in ESPN

**Phase to address:** Auto-nomination rework — capture a DOM snapshot with Chrome DevTools MCP, write a unit test for `isMyTurnToNominate()` against that snapshot before touching any turn detection code.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Adding another selector fallback instead of using Chrome DevTools MCP to find the stable one | Quick fix, unblocks draft | Selector list grows to 10+ entries; true match is buried; first-match logging gets noisy | Never during rework — acceptable only as emergency hotfix |
| Fixed `setTimeout` delays for ESPN DOM readiness | Simple to write | Breaks under different network/load conditions; each "fix" just increases the delay | Never for DOM presence checks — use polling loops |
| `action: string` for WebSocket CONTROL messages | Faster to prototype | TypeScript can't catch typos or missing handler cases; mobile sends valid JSON that silently does nothing | Never — add the union type before the first new action |
| Using default Chrome profile for DevTools MCP inspection | Less setup | Chrome 136+ blocks this; if it works, your actual ESPN cookies are exposed to MCP client | Never for any ESPN-auth profile |
| Resetting nomination state in multiple places instead of `clearNominationState()` | Appears obvious at the call site | State gets partially reset; fields added later are only reset in some paths | Never — always go through `clearNominationState()` |
| Adding mobile controls before implementing EXTENSION_STATUS relay message | Controls work when both are connected | User taps controls with no extension → silent failure, confusing UX | Never — implement EXTENSION_STATUS first |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Chrome DevTools MCP + ESPN draft page | Running `npx chrome-devtools-mcp` against default Chrome profile | Use `--user-data-dir=/tmp/espn-mcp-profile` with a fresh profile; log in to ESPN in that profile first |
| Chrome DevTools MCP + MV3 extension | Inspecting extension background worker through DevTools MCP | DevTools MCP targets pages, not extension service workers; use `chrome://extensions` debug panel for service worker logs |
| WebSocket relay + multiple mobile clients | Assuming `latestSnapshot` is always current when mobile connects | Snapshot is only from last extension message; if extension restarts during draft, mobile gets stale snapshot until next STATE_SNAPSHOT push |
| CONTROL messages + background service worker | Mobile sends CONTROL → relay → extension content script (one hop) | Relay → background worker → content script (two hops via `chrome.runtime.sendMessage`); both legs must be open |
| Nomination controller + page reload | Expecting nomination state to persist across reload | All nomination state is in-memory class fields; `stop()` + `start()` is called on each content script initialization; cooldowns reset on reload (intentional) |
| Chrome DevTools MCP + headless mode | Running MCP in headless for CI/automated inspection | Headless viewport is capped at 3840x2160 internally; ESPN's responsive breakpoints may render differently than headed; always use headed Chrome for DOM selector discovery |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling loops that don't have a max timeout | `pollForElement` runs indefinitely if ESPN never renders the element | Always pair `intervalMs` with `maxMs`; log diagnostic on timeout with DOM snapshot | On any ESPN render failure or navigation away from draft page |
| Nomination diagnostics panel polling at 500ms | 500ms polling creates 2 timer firings/sec for the entire draft session | The 500ms poll is intentional and cheap (just reads from class fields); acceptable. Do not increase frequency. | Not a performance issue at this scale |
| Zustand store subscription in AutoBidController without `subscribeWithSelector` | Full store diff on every state change, including unrelated fields | The current manual diffing pattern is correct; do not switch to subscription middleware without profiling first | Only affects performance if store state is very large; acceptable |
| STATE_SNAPSHOT messages fanout to N mobile clients | If N clients connect, every snapshot gets sent N times | For local-network use case, N is always 1–2; no fanout concern. Would matter at scale. | Not relevant for local-network draft companion use case |
| Chrome DevTools MCP sequential tool execution | Tools run through a mutex — one at a time | For DOM inspection this is fine; don't expect parallel `querySelectorAll` calls to run concurrently | Never a real issue for the inspection use case |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using live ESPN profile for Chrome DevTools MCP | Entire browser session (ESPN cookies, other tabs, credentials) exposed to MCP client | Always use isolated profile with `--user-data-dir=/tmp/...` |
| WebSocket relay with no authentication | Any device on the local network can send CONTROL messages to the extension | Acceptable for local-network draft day use; add a shared secret before any internet exposure |
| Mobile page sending CONTROL messages over `ws://` (plain WebSocket) | No encryption on local network; adjacent devices can intercept | Acceptable for local-network; use `wss://` if exposing over internet |
| `window.espnDraftAssistant.forceNominate()` available in DEV builds | If a DEV build is accidentally loaded in production, force nomination is exposed to browser console | Confirm `import.meta.env.DEV` guard is active; never distribute DEV builds |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Mobile shows "Connected" (to relay) but extension is disconnected | User taps Auto ON / Force Nominate with no effect; assumes extension is working | Implement EXTENSION_STATUS relay message; show distinct "Extension disconnected" banner |
| Adding too many control buttons to mobile UI | Mobile screen is small; too many controls make fat-finger errors likely during a live draft | Group controls; keep the sticky footer to max 3–4 touch targets; put secondary controls behind a drawer |
| Control feedback only through extension state changes (async) | User taps "Force Nominate", waits 5s for feedback; unclear if tap registered | Show immediate optimistic feedback on mobile ("Nominating...") then reconcile with next STATE_SNAPSHOT |
| Nomination diagnostics only visible in extension sidebar | During fast auction, user can't alt-tab to check nomination state | The mobile companion should show last nomination attempt result in the STATE_SNAPSHOT relay |

---

## "Looks Done But Isn't" Checklist

- [ ] **Chrome DevTools MCP setup:** Confirm it connects to a non-default profile (`--user-data-dir=/tmp/espn-mcp-profile`); confirm Node version is `^20.19.0 || ^22.12.0+`; confirm ESPN draft page loads in the MCP-connected Chrome instance
- [ ] **New CONTROL action added:** Confirm action is in the typed union; confirm `case` exists in content script switch; confirm mobile page sends exactly the same action string; confirm `default` case logs warning
- [ ] **EXTENSION_STATUS message implemented:** Confirm mobile page shows disconnected state when extension tab is closed mid-draft; confirm control buttons are disabled when disconnected
- [ ] **Nomination turn detection preserved:** Run `nominationDiag()` before and after any DOM observer changes; confirm `lastTurnDetectionResult.matched` is true when manually observing "Select" buttons in ESPN
- [ ] **React input dispatch pattern:** Confirm any code interacting with ESPN inputs uses `InputEvent` with `data`/`inputType`, not plain `Event('input')`; confirm `focus()` is called before dispatch
- [ ] **Polling not delays:** Confirm no new `setTimeout(fn, N)` calls were added that wait for ESPN DOM elements; all DOM-wait logic uses polling loops with max-timeout fallback
- [ ] **`clearNominationState()` covers all fields:** Confirm any new nomination state field is reset in `clearNominationState()` and appears in `NominationDiagnostics` interface

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ESPN React input dispatch broken | LOW | Add `focus()` + switch to `InputEvent`; the pattern is documented in quick task 86 |
| Fixed delay causing nomination miss | LOW | Replace with `pollForQueueButton` pattern from quick task 89 |
| New CONTROL action silently dropped | LOW | Add case to content script switch + action to typed union |
| Extension disconnected but mobile shows connected | LOW | Implement EXTENSION_STATUS message; state is already tracked in `extensionSocket` ref |
| Chrome DevTools MCP won't connect | LOW | Verify separate Chrome profile + Node version; try `npx chrome-devtools-mcp@latest --isolated` to confirm it launches |
| Nomination turn detection broken by DOM change | MEDIUM | Use `window.espnDraftAssistant.nominationDiag()` to see which strategies are being checked; capture DOM state with DevTools MCP; add failing strategy back or update selector |
| State machine desync mid-draft | MEDIUM | `autoBidController.stop()` then `.start()` resets all state; same as page reload effect; user loses nomination attempt count but cooldowns clear |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ESPN React input dispatch | Auto-nomination rework | `grep -n "new InputEvent\|new Event.*input"` confirms InputEvent is used; no plain `Event('input')` |
| Fixed delays for DOM readiness | Auto-nomination rework | `grep -n "setTimeout.*[0-9][0-9][0-9][0-9]"` in auto-bid-controller; each match is either pacing (justified) or a polling loop entry point |
| Nomination state machine gaps | Auto-nomination rework | All fields in `clearNominationState()` match all fields in `NominationDiagnostics`; review both side-by-side |
| DevTools MCP profile isolation | Chrome DevTools MCP setup | `chrome://version` in MCP-connected Chrome shows non-default profile path |
| Node version enforcement | Chrome DevTools MCP setup | `node -v` shows `^20.19.0 || ^22.12.0+`; document in project dev notes |
| Missing CONTROL action handler | Mobile companion expansion | TypeScript: `action` typed as union; switch has default warn case; integration test sends each action and checks store state |
| Extension status not relayed | Mobile companion expansion | Close extension tab mid-session; mobile shows "Extension disconnected" banner within 2 seconds |
| Turn detection broken by rework | Any nomination-touching phase | `window.espnDraftAssistant.nominationDiag().lastTurnDetectionResult.matched` is `true` when "Select" buttons visible in live draft |

---

## Sources

- Project quick task history (tasks 60, 79, 80, 85–90) — direct regression evidence from nomination iteration chain. Confidence: HIGH (first-party).
- `packages/extension/lib/auto-bid-controller.ts` — current implementation, nomination state machine, polling patterns. Confidence: HIGH (first-party).
- `packages/extension/lib/dom-observers.ts` — current selector approach, fallback chains. Confidence: HIGH (first-party).
- `packages/backend/src/api/draft-live.ts` — WebSocket relay, extension socket guard. Confidence: HIGH (first-party).
- `packages/frontend/src/app/draft/live/` — mobile page, current 3 control messages, `useDraftLiveSocket`. Confidence: HIGH (first-party).
- [Chrome DevTools MCP GitHub repository](https://github.com/ChromeDevTools/chrome-devtools-mcp) — Node version enforcement, profile requirements, `--autoConnect` needing Chrome 144+, sequential mutex execution. Confidence: HIGH (official).
- [Chrome DevTools MCP blog post](https://developer.chrome.com/blog/chrome-devtools-mcp) — Chrome 136 default profile debugging restriction, telemetry defaults. Confidence: HIGH (official Google).
- [DeepWiki: chrome-devtools-mcp getting started](https://deepwiki.com/ChromeDevTools/chrome-devtools-mcp/2-getting-started) — concurrent instance collision, `--isolated` flag, conflicting flag validation. Confidence: MEDIUM (derived from source code analysis).
- Quick task 86 summary — React input dispatch pattern (`InputEvent` vs `Event`), `nativeInputValueSetter`. Confidence: HIGH (first-party, battle-tested).
- Quick task 89 summary — polling loop pattern replacing fixed delays. Confidence: HIGH (first-party).
- Quick task 80 plan — `button.Button--select` and `button.bid-player__button` as stable ESPN class names (verified against live ESPN DOM during quick task execution). Confidence: MEDIUM (ESPN may change at any time).
- Quick task 90 summary — `button.action-btn` as preferred selector prefix for Queue/Select/Dequeue buttons. Confidence: MEDIUM.

---

*Pitfalls research for: Chrome DevTools MCP setup + auto-nomination rework + mobile draft companion expansion*
*Researched: 2026-03-14*
