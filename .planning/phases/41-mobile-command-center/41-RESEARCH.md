# Phase 41: Mobile Command Center - Research

**Researched:** 2026-03-14
**Domain:** Mobile-first React UI, WebSocket control relay, Screen Wake Lock API, discriminated union typing
**Confidence:** HIGH

## Summary

Phase 41 transforms the existing read-mostly mobile draft page (`packages/frontend/src/app/draft/live/page.tsx`) into a full command center. The current page already has a working WebSocket connection, displays current nomination, win probability, budget/inflation, roster, and alerts, plus a sticky control bar with auto-bid toggle, position filter, and hitter/pitcher split slider. The work is primarily:

1. **Expanding the data relayed from extension to mobile** -- category progress, ideal roster (with tier badges), build archetype, nomination queue, and scarcity alerts are computed by the extension engine but NOT yet included in the `draft-mobile-state` or `draft-engine-signals` payloads written to `chrome.storage.local` by `DraftSidebar.tsx`.

2. **Adding new CONTROL actions** -- FORCE_NOMINATE, SKIP_PLAYER, auto-nominate toggle, and budget override are not handled by `content.tsx`'s message listener. The existing actions (SET_AUTO_MODE, SET_POSITION_FILTER, TOGGLE_SIDEBAR, SET_PITCHER_HITTER_SPLIT) use `action: string` typing -- all must migrate to a TypeScript discriminated union.

3. **Upgrading the mobile UI** -- converting the single-scroll layout to a tabbed/sectioned layout for 375px screens, adding wake lock, connection status banner for extension disconnection, and swipe gestures via `motion@^12.36`.

**Primary recommendation:** Work in three sequential layers: (a) typed CONTROL union + new actions in extension, (b) expand WS relay payloads, (c) rebuild mobile page with tabs and new data panels.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOB-01 | Category progress with targets | `CategoryProgress[]` already computed in `IdealRosterSignal.categoryProgress` -- just needs relay via `draft-engine-signals` |
| MOB-02 | Ideal roster with tier badges and locked indicators | `IdealRosterSignal.players[]` has `tier` and `isDrafted` fields -- relay via engine signals |
| MOB-03 | Win probability, build archetype, scarcity alerts | Win prob already displayed; `BuildArchetypeSignal` exists in engine types; scarcity is `EnhancedScarcitySignal[]` -- both need relay |
| MOB-04 | Auto-bid toggle with risk indicator | Auto-bid toggle exists; risk indicator can use `budgetCurve.budgetPressure` already relayed |
| MOB-05 | Auto-nominate toggle | New CONTROL action needed; currently auto-nominate is coupled to `autoMode` in `AutoBidController` -- needs separate toggle or the mobile toggle must be clearly labeled |
| MOB-06 | Hitter/pitcher split slider | Already implemented in current mobile page |
| MOB-07 | Force-nominate button | New CONTROL action `FORCE_NOMINATE`; calls `autoBidController.forceNominate()` in content.tsx |
| MOB-08 | Skip-player button | New CONTROL action `SKIP_PLAYER`; must add `skippedPlayerIds` to extension Zustand store per prior decision |
| MOB-09 | Nomination queue display + reordering | `espnNominationQueue` exists in store but not relayed; reordering requires new CONTROL action + store mutation |
| MOB-10 | Tabbed/sectioned responsive layout for phones | Replace current single-scroll with tab navigation; `motion@^12.36` for swipe between tabs |
| MOB-11 | Screen Wake Lock API | `navigator.wakeLock.request('screen')` -- supported in all major mobile browsers as of 2025 |
| MOB-12 | Extension connection status + reconnect | Hub already tracks `extensionSocket`; needs `EXTENSION_STATUS` message type broadcast to mobile clients |
| MOB-13 | CONTROL actions as discriminated union | Current `ControlMessage` has `action: string` -- refactor to union type across backend hub, frontend hook, extension content.tsx |
| MOB-14 | Extension relays connection status via EXTENSION_STATUS | New message type from hub to mobile when extension connects/disconnects |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `motion` | ^12.36.0 | Swipe gesture animations for tab navigation | Prior decision -- only new production dep for v3.0 |
| Native `WebSocket` | Browser API | Already in use for mobile-to-hub communication | No change needed |
| `@fastify/websocket` | Already installed | Hub WebSocket server | Already powering `/draft/live` route |
| Screen Wake Lock API | Browser API | Prevent screen dimming during draft | Supported all browsers since early 2025 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | Already in frontend | Mobile layout styling | Existing; use for all mobile UI |
| React `useState`/`useEffect`/`useCallback` | Already in frontend | State management in mobile page | Existing pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| motion swipe gestures | CSS scroll-snap tabs | scroll-snap lacks programmatic control and animated transitions; motion gives drag + spring physics |
| Tab-based navigation | Accordion sections | Tabs are more natural on phones for draft monitoring; accordions hide too much at once |

**Installation:**
```bash
cd packages/frontend && pnpm add motion@^12.36.0
```

## Architecture Patterns

### Current WS Relay Architecture (unchanged)

```
Extension content.tsx
  -> Zustand store change
  -> DraftSidebar.tsx writes to chrome.storage.local
  -> background.ts onChanged listener
  -> WebSocket to Fastify hub (/draft/live?role=extension)
  -> Hub fans out to all mobile clients

Mobile page
  -> WebSocket to Fastify hub (/draft/live?role=mobile)
  -> Receives STATE_SNAPSHOT messages
  -> Sends CONTROL messages
  -> Hub forwards CONTROL to extension
  -> background.ts receives CONTROL
  -> chrome.tabs.sendMessage to content.tsx
  -> content.tsx switch(message.action) mutates Zustand store
```

### Pattern 1: Discriminated Union for CONTROL Actions

**What:** Replace `action: string` with a TypeScript discriminated union shared between frontend, backend, and extension.

**When to use:** Every CONTROL message sent from mobile to extension.

**Example:**
```typescript
// packages/shared/src/control-actions.ts (or inline in each package)

type ControlAction =
  | { type: "CONTROL"; action: "SET_AUTO_MODE"; payload: boolean }
  | { type: "CONTROL"; action: "SET_POSITION_FILTER"; payload: string | null }
  | { type: "CONTROL"; action: "SET_PITCHER_HITTER_SPLIT"; payload: number }
  | { type: "CONTROL"; action: "TOGGLE_SIDEBAR" }
  | { type: "CONTROL"; action: "FORCE_NOMINATE" }
  | { type: "CONTROL"; action: "SKIP_PLAYER"; payload: { playerId: number; playerName: string } }
  | { type: "CONTROL"; action: "SET_BUDGET_OVERRIDE"; payload: number }
  | { type: "CONTROL"; action: "SET_AUTO_NOMINATE"; payload: boolean }
  | { type: "CONTROL"; action: "REORDER_QUEUE"; payload: number[] }; // ordered playerIds
```

**Key decision:** The shared package already exists at `packages/shared/src/types.ts`. The union type can live there or be duplicated (since extension does not import from shared at build time -- WXT bundles separately). Pragmatic approach: define the union in the extension and in the frontend independently, with a comment pointing at the canonical list.

### Pattern 2: EXTENSION_STATUS Hub Broadcast

**What:** When extension connects/disconnects from the hub, the hub sends an `EXTENSION_STATUS` message to all mobile clients.

**Example:**
```typescript
// In draft-live.ts hub
socket.on("close", () => {
  extensionSocket = null;
  broadcastToMobile({ type: "EXTENSION_STATUS", connected: false, ts: Date.now() });
});

// On extension connect:
broadcastToMobile({ type: "EXTENSION_STATUS", connected: true, ts: Date.now() });
```

### Pattern 3: Screen Wake Lock with Visibility Handling

**What:** Acquire wake lock on mount, release on unmount, re-acquire on `visibilitychange` (required because browsers release lock when tab becomes hidden).

**Example:**
```typescript
function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let active = true;
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator && active) {
          sentinelRef.current = await navigator.wakeLock.request("screen");
        }
      } catch { /* user denied or not supported */ }
    };
    acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      sentinelRef.current?.release();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
```

### Pattern 4: Tabbed Mobile Layout with Swipe

**What:** Three tabs for the mobile page: (1) Live (current nomination + bid verdict + controls), (2) Strategy (category progress, ideal roster, build archetype, scarcity), (3) Queue (nomination queue + skip list). Use `motion` for swipe gestures between tabs.

**Recommended structure:**
```
packages/frontend/src/app/draft/live/
  page.tsx                    # Main page with tab container + wake lock
  useDraftLiveSocket.ts       # Existing hook (updated with typed sendControl + new message types)
  useWakeLock.ts              # New: wake lock hook
  tabs/
    LiveTab.tsx               # Current nomination, bid verdict, controls bar
    StrategyTab.tsx           # Category progress, ideal roster, archetype, scarcity
    QueueTab.tsx              # Nomination queue, skip player, force nominate
  components/
    ConnectionBanner.tsx      # Extension disconnected warning banner
    CategoryProgressBar.tsx   # Single category progress row
    IdealRosterList.tsx       # Ideal roster with tier badges
    TabBar.tsx                # Bottom tab navigation
```

### Pattern 5: Expanding Relay Payloads

**What:** Add missing engine signals to `DraftSidebar.tsx`'s `chrome.storage.local` write.

Currently relayed in `draft-engine-signals`:
- inflation (subset)
- budgetCurve (subset)
- alerts (full)
- optimization (subset)
- simulation (full)
- remainingSlots

**Must add:**
- `idealRoster` -- players[], categoryProgress[], anchorCount, coreCount, valueCount
- `buildArchetype` -- projectedStandings already has archetype-adjacent data, but `BuildArchetypeSignal` from `engine/archetype.ts` is the canonical source (if wired into `DraftEngineSignals`)
- `scarcity` -- `EnhancedScarcitySignal[]` is in `DraftEngineSignals.scarcity` but not relayed

Currently relayed in `draft-mobile-state`:
- currentAuctionPlayer, roster, remainingBudget, autoMode, pitcherHitterSplit, draftFormat, currentPick

**Must add:**
- `espnNominationQueue` -- already in Zustand store, just not serialized to storage
- `autoNominateEnabled` -- new field (or clarify that autoMode covers both bid + nominate)
- `skippedPlayerIds` -- new field per prior decision

### Anti-Patterns to Avoid

- **Sending full engine signals to mobile:** The current pattern of selecting only mobile-relevant fields is correct. Don't relay `DraftEngineSignals` wholesale -- it contains large arrays (all scarcity positions, all category gaps) that would bloat WS messages. Select the subset needed.
- **Storing skippedPlayerIds in mobile React state:** Per prior decision, this MUST live in the extension Zustand store so the engine filters before candidates reach WS broadcast. Mobile sends SKIP_PLAYER control; extension stores it.
- **Using `action: string` for new CONTROL messages:** The whole point of MOB-13 is to type these. Every new action must be added to the discriminated union.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swipe gesture detection | Custom touch event handlers | `motion` drag/swipe | Touch physics, inertia, spring animations are surprisingly complex; motion handles edge cases |
| Wake lock lifecycle | Manual wakeLock.request in useEffect | Dedicated `useWakeLock` hook with visibility re-acquire | Re-acquisition on visibility change is required and easy to forget |
| Tab state machine | Manual index tracking with swipe math | `motion.AnimatePresence` + `useState(activeTab)` | Animation exit/enter transitions pair naturally with tab index state |

## Common Pitfalls

### Pitfall 1: Wake Lock Released on Tab Switch
**What goes wrong:** Browser releases wake lock when the tab/page becomes hidden. User switches to another app briefly and screen dims.
**Why it happens:** Spec requires release on visibility hidden.
**How to avoid:** Listen for `visibilitychange` event and re-acquire when `document.visibilityState === "visible"`.
**Warning signs:** Screen dims after user checks a text message.

### Pitfall 2: EXTENSION_STATUS Race Condition
**What goes wrong:** Mobile client connects before extension, never receives initial EXTENSION_STATUS.
**Why it happens:** Hub only sends status on connect/disconnect events, not on mobile join.
**How to avoid:** When a mobile client connects, immediately send the current extension status: `{ type: "EXTENSION_STATUS", connected: extensionSocket !== null }`.
**Warning signs:** Mobile shows "connected" (WS to hub) but no data arrives and no disconnected banner shows.

### Pitfall 3: autoMode vs autoNominate Confusion
**What goes wrong:** User toggles "auto-nominate" on mobile but it also enables auto-bidding, or vice versa.
**Why it happens:** Currently `autoMode` in the Zustand store controls BOTH auto-bid and auto-nominate in `AutoBidController`. They are not separate toggles.
**How to avoid:** Either (a) split into `autoMode` (bid) and `autoNominateMode` (nominate) as separate store fields and controller checks, or (b) keep them coupled but label the mobile toggle honestly as "Autopilot" covering both. The requirements list them as separate toggles (MOB-04 auto-bid, MOB-05 auto-nominate), so option (a) is likely required.
**Warning signs:** User wants auto-nominate but not auto-bid (or vice versa) and cannot achieve it.

### Pitfall 4: Nomination Queue Reorder Serialization
**What goes wrong:** Mobile sends reordered queue but extension has already changed queue since last snapshot.
**Why it happens:** ESPN's nomination queue is scraped every 3 seconds; mobile may be displaying stale state.
**How to avoid:** Send full ordered list of playerIds in REORDER_QUEUE; extension ignores any IDs no longer in the actual ESPN queue. The extension should re-scrape after reorder to confirm.
**Warning signs:** Queue appears to snap back after reorder.

### Pitfall 5: Large Payload Bloat on WS
**What goes wrong:** Adding idealRoster (potentially 25 players with stats) + categoryProgress + scarcity to every WS message significantly increases message size.
**Why it happens:** `chrome.storage.local.onChanged` fires on any field change, and background.ts sends the full cached payload every time.
**How to avoid:** Keep the subset pattern: only relay fields mobile actually renders. For idealRoster, send just `{ name, positions, tier, isDrafted, slot, dollars }` -- omit `sgpValue` and `stats`. For scarcity, send only positions where `myTeamNeeds === true` or `scarcityIndex > 0.5`.
**Warning signs:** Mobile page lags or WS connection drops due to message size.

## Code Examples

### Typed sendControl Hook (Updated)
```typescript
// useDraftLiveSocket.ts - replace sendControl signature

type ControlActionMap = {
  SET_AUTO_MODE: boolean;
  SET_AUTO_NOMINATE: boolean;
  SET_POSITION_FILTER: string | null;
  SET_PITCHER_HITTER_SPLIT: number;
  SET_BUDGET_OVERRIDE: number;
  FORCE_NOMINATE: undefined;
  SKIP_PLAYER: { playerId: number; playerName: string };
  TOGGLE_SIDEBAR: undefined;
  REORDER_QUEUE: number[];
};

type ControlActionName = keyof ControlActionMap;

function sendControl<A extends ControlActionName>(
  action: A,
  ...args: ControlActionMap[A] extends undefined ? [] : [ControlActionMap[A]]
): void {
  const payload = args[0];
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ type: "CONTROL", action, payload }));
  }
}
```

### EXTENSION_STATUS in Hub
```typescript
// draft-live.ts additions

function broadcastToMobile(msg: Record<string, unknown>) {
  const str = JSON.stringify(msg);
  for (const client of mobileClients) {
    if (client.readyState === 1) client.send(str);
  }
}

// In extension connect handler:
broadcastToMobile({ type: "EXTENSION_STATUS", connected: true, ts: Date.now() });

// In extension close/error handler:
broadcastToMobile({ type: "EXTENSION_STATUS", connected: false, ts: Date.now() });

// When mobile client connects, send current status:
socket.send(JSON.stringify({
  type: "EXTENSION_STATUS",
  connected: extensionSocket !== null,
  ts: Date.now(),
}));
```

### Content.tsx New CONTROL Handlers
```typescript
// Add to the switch in content.tsx chrome.runtime.onMessage listener:

case "FORCE_NOMINATE":
  autoBidController.forceNominate();
  break;
case "SKIP_PLAYER": {
  const { playerId, playerName } = message.payload as { playerId: number; playerName: string };
  store.addSkippedPlayer(playerId, playerName);
  break;
}
case "SET_AUTO_NOMINATE":
  store.setAutoNominateMode(message.payload as boolean);
  break;
case "SET_BUDGET_OVERRIDE":
  store.setBudgetOverride(message.payload as number);
  break;
case "REORDER_QUEUE":
  // Reorder ESPN queue is a DOM interaction -- delegate to controller
  autoBidController.reorderQueue(message.payload as number[]);
  break;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| framer-motion | motion (standalone) | 2024 (v11+) | Package renamed; import from `motion/react` not `framer-motion` |
| Wake Lock behind flag | Wake Lock in all browsers | Jan 2025 (Firefox 126) | No feature detection fallback needed for modern phones |
| String-typed WS actions | Discriminated union actions | This phase | Type safety across the entire relay chain |

## Open Questions

1. **autoMode split into bid/nominate**
   - What we know: `autoMode` currently controls both auto-bid and auto-nominate in `AutoBidController`. MOB-04 and MOB-05 list them as separate toggles.
   - What's unclear: Whether the user truly wants independent control or if "Autopilot ON/OFF" covering both is acceptable.
   - Recommendation: Split into `autoMode` (bid) and `autoNominateMode` (nominate) in the Zustand store. AutoBidController checks each independently. This gives maximum flexibility and satisfies both requirements.

2. **Nomination queue reordering mechanism**
   - What we know: ESPN's queue is a DOM list that can be reordered via drag. The extension scrapes it every 3s.
   - What's unclear: Whether ESPN provides a programmatic reorder API or if this requires simulated drag events on the DOM.
   - Recommendation: Start with display-only queue on mobile (satisfies MOB-09 partially). Reordering can be deferred if DOM simulation proves fragile. Force-nominate (MOB-07) is the higher-value feature.

3. **Budget override scope**
   - What we know: `SET_BUDGET_OVERRIDE` is listed in success criteria as a CONTROL action.
   - What's unclear: Does this override the remaining budget for engine calculations, or cap max spending?
   - Recommendation: Implement as an override to `remainingBudget` in Zustand -- the engine already reads this value for all bid calculations.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/backend/src/api/draft-live.ts` -- current WS hub implementation
- Codebase inspection: `packages/frontend/src/app/draft/live/page.tsx` -- current mobile page
- Codebase inspection: `packages/frontend/src/app/draft/live/useDraftLiveSocket.ts` -- current WS hook
- Codebase inspection: `packages/extension/entrypoints/background.ts` -- WS relay + storage listener
- Codebase inspection: `packages/extension/entrypoints/content.tsx` -- CONTROL message handler
- Codebase inspection: `packages/extension/components/DraftSidebar.tsx` (lines 56-143) -- mobile state serialization
- Codebase inspection: `packages/extension/lib/engine/types.ts` -- all engine signal types
- Codebase inspection: `packages/extension/lib/auto-bid-controller.ts` -- nomination/bid automation
- Codebase inspection: `packages/extension/lib/draft-state.ts` -- Zustand store fields

### Secondary (MEDIUM confidence)
- [MDN Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) -- API reference and browser support
- [Can I Use: Wake Lock](https://caniuse.com/wake-lock) -- browser compatibility tables
- [web.dev: Wake Lock supported in all browsers](https://web.dev/blog/screen-wake-lock-supported-in-all-browsers) -- Jan 2025 announcement

### Tertiary (LOW confidence)
- motion@12.36 API for swipe gestures -- not verified against Context7; based on training data for framer-motion/motion package rename

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are either already in use or are prior decisions
- Architecture: HIGH -- the WS hub pattern is fully implemented; this phase extends it
- Pitfalls: HIGH -- derived from direct codebase inspection of current limitations
- UI patterns (tabs/swipe): MEDIUM -- motion API details not verified against latest docs

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable domain, low churn)
