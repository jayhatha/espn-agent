# Phase 31: Mobile WebSocket Draft Companion - Research

**Researched:** 2026-03-07
**Domain:** Chrome Extension WebSocket architecture, real-time state relay, mobile web UI
**Confidence:** HIGH

## Summary

The goal is to serve a mobile-friendly page (phone on the local network) that shows the same draft engine signals the desktop extension sidebar shows — and lets the user trigger control actions (toggle auto-bid, set position filters, etc.) from their phone.

The fundamental constraint is that **Chrome extensions cannot run a WebSocket server**. The extension is a browser context (service worker + content script), not a Node.js process. It can only act as a **WebSocket client** that connects to an external server. The WebSocket server must live somewhere the phone can reach — the Fastify backend at `http://localhost:3001` is the natural home since it already runs on `0.0.0.0` and is reachable from the local network.

The recommended architecture is:

1. **Fastify backend** grows a `/draft/live` WebSocket route (using `@fastify/websocket`). This is the hub.
2. **Extension background service worker** opens a WebSocket *client* connection to that route, subscribing to `chrome.storage.local` changes and forwarding Zustand state snapshots to the server every time state updates. A 20-second keepalive ping prevents the service worker from sleeping.
3. **Mobile page** (a new Next.js route or static page) opens its own WebSocket *client* connection to the same Fastify route. The server fans out any state snapshot it receives from the extension to all mobile clients.
4. **Control actions** from the phone travel the reverse path: phone -> WebSocket -> Fastify -> WebSocket -> extension background service worker -> `chrome.runtime.sendMessage` -> content script -> Zustand `setState`.

The mobile page itself is a new Next.js page under `packages/frontend/src/app/draft/live/page.tsx` that renders a touch-optimized read-only view of engine signals plus a compact set of control toggles.

**Primary recommendation:** WebSocket hub in Fastify backend (`@fastify/websocket`), extension background SW as client, mobile page as second client — all connected to the same `/draft/live` hub endpoint.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fastify/websocket` | ^11.2.0 | WebSocket server route in existing Fastify app | Official Fastify plugin, built on `ws@8`, minimal footprint, route-based API matches existing codebase style |
| Native `WebSocket` API | Browser-native | Extension background SW client + mobile page client | No extra dependency, supported in Chrome 116+ service workers and all modern mobile browsers |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `chrome.storage.local.onChanged` | Browser API | Detect Zustand state changes in background SW | Required to know when extension state updates so the SW can push to the WS hub |
| `chrome.runtime.sendMessage` | Browser API | SW-to-content-script command relay for control actions | Required to bridge WS commands from phone back into the content script |
| Tailwind CSS | Already in frontend | Mobile layout for the companion page | Already installed; use existing classes |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/websocket | socket.io | socket.io adds fallback transport complexity, reconnect logic, and a heavier client bundle not needed for same-LAN use; ws/fastify-websocket is simpler |
| @fastify/websocket | Standalone ws server on a different port | Would require a second process and CORS/port complexity; embedding in Fastify is cleaner |
| Next.js page | Standalone HTML file served by backend | Next.js gives access to existing Tailwind design tokens and components; no extra server |
| chrome.storage.local.onChanged | Polling chrome.storage.local every N seconds | Event-driven is more efficient and has lower latency |
| chrome.runtime.sendMessage | chrome.storage.local writes as command queue | Messages are lower latency and bidirectional; storage writes require polling |

**Installation (backend only):**

```bash
cd packages/backend && pnpm add @fastify/websocket
```

No new deps needed in the extension (native WebSocket) or frontend (native WebSocket).

## Architecture Patterns

### Recommended Project Structure

```
packages/backend/src/api/
└── draft-live.ts          # New: WebSocket hub route (/draft/live)

packages/extension/entrypoints/
└── background.ts          # Modified: add WS client + chrome.storage.local subscription

packages/frontend/src/app/draft/live/
└── page.tsx               # New: mobile companion page
```

### Pattern 1: Fastify WebSocket Hub (Fan-Out Relay)

**What:** One Fastify route (`/draft/live`) accepts WebSocket upgrades from both the extension SW and mobile clients. It categorizes clients by their `?role=extension` or `?role=mobile` query param. State snapshots received from `role=extension` are broadcast to all `role=mobile` clients. Control commands received from `role=mobile` are forwarded to the `role=extension` client.

**When to use:** Always — this is the single hub model.

**Example:**

```typescript
// packages/backend/src/api/draft-live.ts
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";

interface DraftStateSnapshot {
  type: "STATE_SNAPSHOT";
  payload: Record<string, unknown>;
  ts: number;
}

interface ControlCommand {
  type: "CONTROL";
  action: "SET_AUTO_MODE" | "SET_POSITION_FILTER" | "TOGGLE_SIDEBAR";
  payload?: unknown;
}

export async function draftLiveRoutes(app: FastifyInstance) {
  let extensionSocket: WebSocket | null = null;
  const mobileClients = new Set<WebSocket>();

  app.get("/draft/live", { websocket: true }, (socket, req) => {
    const url = new URL(req.url, "http://localhost");
    const role = url.searchParams.get("role"); // "extension" or "mobile"

    if (role === "extension") {
      extensionSocket = socket;

      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as DraftStateSnapshot | { type: "PING" };
        if (msg.type === "PING") {
          socket.send(JSON.stringify({ type: "PONG" }));
          return;
        }
        if (msg.type === "STATE_SNAPSHOT") {
          // Fan out to all mobile clients
          for (const client of mobileClients) {
            if (client.readyState === 1) {
              client.send(raw.toString());
            }
          }
        }
      });

      socket.on("close", () => { extensionSocket = null; });
    } else {
      mobileClients.add(socket);

      socket.on("message", (raw) => {
        const cmd = JSON.parse(raw.toString()) as ControlCommand;
        if (cmd.type === "CONTROL" && extensionSocket?.readyState === 1) {
          extensionSocket.send(raw.toString());
        }
      });

      socket.on("close", () => { mobileClients.delete(socket); });
    }
  });
}
```

### Pattern 2: Extension Background Service Worker as WebSocket Client

**What:** The background service worker opens a WebSocket to `ws://localhost:3001/draft/live?role=extension`. It subscribes to `chrome.storage.local.onChanged` to detect Zustand state changes and sends a `STATE_SNAPSHOT` message. It also listens for incoming `CONTROL` commands and relays them to the content script via `chrome.runtime.sendMessage`. A 20-second ping interval prevents service worker sleep.

**When to use:** Always — this is the extension's side of the relay.

**Key consideration:** The background SW must handle reconnects. If the backend is restarted, the SW will lose its connection. Add exponential backoff reconnect logic.

**Example:**

```typescript
// In background.ts — append to the existing defineBackground() body

let draftWs: WebSocket | null = null;
let keepaliveInterval: number | null = null;

function connectDraftRelay() {
  if (draftWs?.readyState === WebSocket.OPEN) return;

  draftWs = new WebSocket("ws://localhost:3001/draft/live?role=extension");

  draftWs.addEventListener("open", () => {
    console.log("[Draft Relay] Connected to WS hub");
    keepaliveInterval = setInterval(() => {
      if (draftWs?.readyState === WebSocket.OPEN) {
        draftWs.send(JSON.stringify({ type: "PING" }));
      }
    }, 20_000) as unknown as number;
  });

  draftWs.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "PONG") return;
    if (msg.type === "CONTROL") {
      // Forward control command to content script on ESPN tab
      chrome.tabs.query({ url: "https://fantasy.espn.com/baseball/draft*" }, (tabs) => {
        for (const tab of tabs) {
          if (tab.id) chrome.tabs.sendMessage(tab.id, msg);
        }
      });
    }
  });

  draftWs.addEventListener("close", () => {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    // Reconnect after 3 seconds
    setTimeout(connectDraftRelay, 3000);
  });
}

// Subscribe to Zustand state changes via chrome.storage.local.onChanged
chrome.storage.local.onChanged.addListener((changes) => {
  const stateChange = changes["espn-draft-assistant-state"];
  if (!stateChange?.newValue || draftWs?.readyState !== WebSocket.OPEN) return;

  try {
    const state = JSON.parse(stateChange.newValue);
    draftWs.send(JSON.stringify({
      type: "STATE_SNAPSHOT",
      payload: state,
      ts: Date.now(),
    }));
  } catch {}
});

// Connect when background starts
connectDraftRelay();
```

### Pattern 3: Mobile Companion Page (Next.js)

**What:** A dedicated Next.js page at `/draft/live` that opens a WebSocket to `ws://{localIP}:3001/draft/live?role=mobile`. Renders engine signals in a touch-friendly layout. Sends control commands back to the extension via WebSocket.

**Key consideration:** The phone must reach the backend at the host machine's LAN IP (not `localhost`). The page should prompt the user to enter the backend WS URL, or default to a configurable env var. Since this is local-network only, a simple input for `ws://192.168.x.x:3001/draft/live?role=mobile` on first load is sufficient.

**Mobile UI design:**

- Full-width single-column layout
- Large touch targets (min 44px) for all interactive controls
- Sticky header showing: current player being auctioned, suggested max bid, auto-bid status
- Scrollable section for: budget remaining, top targets, position alerts
- Floating bottom bar: auto-bid toggle, position filter dropdown

**Example WebSocket hook:**

```typescript
// packages/frontend/src/app/draft/live/useDraftLiveSocket.ts
"use client";

import { useEffect, useRef, useState } from "react";

export function useDraftLiveSocket(wsUrl: string) {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => setConnected(true));
    ws.addEventListener("close", () => setConnected(false));
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "STATE_SNAPSHOT") setState(msg.payload);
    });

    return () => ws.close();
  }, [wsUrl]);

  const sendControl = (action: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CONTROL", action, payload }));
    }
  };

  return { state, connected, sendControl };
}
```

### Pattern 4: Content Script Control Command Handler

**What:** The content script already listens for DOM custom events. Add a `chrome.runtime.onMessage` listener to receive `CONTROL` commands relayed by the background SW and apply them to the Zustand store.

**Example:**

```typescript
// In content.tsx — add to the defineContentScript body
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "CONTROL") return;
  const store = useDraftStore.getState();

  switch (message.action) {
    case "SET_AUTO_MODE":
      store.setAutoMode(message.payload as boolean);
      break;
    case "SET_POSITION_FILTER":
      store.setPositionFilter(message.payload as string | null);
      break;
    case "TOGGLE_SIDEBAR":
      store.toggleSidebar();
      break;
  }
});
```

### Anti-Patterns to Avoid

- **Running the WS server inside the extension:** Not possible — extensions are browser contexts, not Node.js processes. They can only be WS clients.
- **Putting WS logic in the content script:** Content scripts are unstable for long-lived connections (unloaded when the ESPN page navigates). Background SW is the right place.
- **Sending the full Zustand state on every change:** `espnDomAuctionValues` and `rankings` can be large (300+ players). Send a **partial snapshot** with only the data the phone needs: `currentAuctionPlayer`, `myRoster`, `remainingBudget`, `allTeamBudgets`, `autoMode`, and the computed engine signals. Engine signals are computed in the content script, not available in the SW, so see the open question below.
- **Assuming `localhost` works from the phone:** The phone cannot reach `localhost` on the desktop. The page must use the host machine's LAN IP (e.g., `192.168.1.42`).
- **Skipping reconnect logic:** Both the extension SW WS client and the mobile page WS client must reconnect automatically on disconnect.
- **No auth on the WebSocket:** For local network use, auth is fine to skip initially. But the WS endpoint should at minimum not be accessible from the public internet (already handled since the backend binds to local dev only in practice, or Docker maps port to `127.0.0.1`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server | Custom `ws` server setup | `@fastify/websocket` | Plugin handles upgrade handshake, route encapsulation, TypeScript types, and client set management |
| Service worker keepalive | Complex token-refresh logic | 20-second ping interval | Sending WS messages resets the SW idle timer (Chrome 116+); one setInterval is all that's needed |
| Mobile layout system | Custom CSS grid | Tailwind responsive classes | Already installed, consistent with existing design tokens |

**Key insight:** The entire relay is ~150 lines of new code if you use the right primitives. The hard part is the architecture decision (extension = WS client, Fastify = hub), not the implementation.

## Common Pitfalls

### Pitfall 1: Engine Signals Not Available in Background Service Worker

**What goes wrong:** The engine signals (`useDraftEngineSignals`) are computed in the content script's React context using `useMemo`. The background service worker only has access to `chrome.storage.local` — which stores *raw Zustand state* (picks, roster, budget, etc.) but **not** the computed engine output (win probability, max bid, top targets, etc.).

**Why it happens:** `computeDraftEngine` runs Web Workers and complex math in the content script context. It is not stored in `chrome.storage.local`.

**How to avoid:** Two options:
1. **Re-compute engine signals in the background SW** using the raw Zustand state from storage. This requires importing the engine computation into the background entry point, which brings in Web Workers that may not run in a service worker context. **Risky.**
2. **Have the content script write engine signals to `chrome.storage.local` after each computation**, then the background SW picks them up from storage and relays them alongside the raw state. **Recommended.** Add a new `chrome.storage.local.set({ "draft-engine-signals": signals })` call in `useDraftEngineSignals` or in the content script that calls it.

**Warning signs:** Phone shows picks/budget/roster fine but has no win probability or max bid recommendations. Means raw state is flowing but engine signals are not.

### Pitfall 2: Service Worker Sleeping Mid-Draft

**What goes wrong:** If the ESPN draft page is idle (no picks for several minutes), no Zustand state changes occur, and the background SW has no natural keepalive from storage events. After 30 seconds of no WebSocket activity, the SW terminates and the WS connection drops.

**Why it happens:** Chrome MV3 service workers are ephemeral by design.

**How to avoid:** The 20-second WS ping interval in the background SW serves dual purpose: it keeps the SW alive AND the Fastify hub can detect dead extension connections (no ping = connection stale).

**Warning signs:** Mobile page shows "disconnected" after a few minutes of draft inactivity. Extension WS reconnect logic kicks in but causes a state snapshot gap.

### Pitfall 3: Phone Cannot Reach localhost

**What goes wrong:** Mobile page is hardcoded to `ws://localhost:3001/draft/live` and fails to connect.

**Why it happens:** `localhost` resolves to the phone itself, not the desktop machine.

**How to avoid:** The mobile page UI must accept a configurable WS URL. Persist it to `localStorage`. On first load, show a prominent URL input field. Document that the user should enter `ws://192.168.x.x:3001/draft/live?role=mobile` (their desktop's LAN IP). Alternatively, run the frontend (`next dev --hostname 0.0.0.0`) and have the page auto-detect the WS URL from the page's own origin.

**Warning signs:** WebSocket connection fails immediately on the phone. Chrome DevTools Network tab on desktop shows no incoming connections.

### Pitfall 4: Zustand `chrome.storage.local` Serialization of Map and Non-JSON Types

**What goes wrong:** `teamRosters` is a `Map` that gets serialized to an array in `chrome.storage.local` (via the Zustand `partialize` function). If the background SW reads `newValue` and tries to use it directly, `teamRosters` will be an array, not a Map.

**Why it happens:** The Zustand persist middleware's `partialize` converts Map to array. The background SW gets the raw JSON string.

**How to avoid:** The background SW should treat the storage value as opaque JSON and relay it as-is to the mobile page. The mobile page's state parsing should handle the array form. If the mobile page needs Map behavior, it re-hydrates from the array after receiving the snapshot.

### Pitfall 5: CORS on the WebSocket Endpoint

**What goes wrong:** `@fastify/websocket` routes respect the same CORS plugin as the rest of Fastify. The mobile page's origin (`http://192.168.x.x:3000`) might not match the allowed origins list.

**Why it happens:** The Fastify CORS config allows `http://localhost:3000` and `https://fantasy.espn.com` but not LAN IP origins.

**How to avoid:** For local network use, either add a wildcard origin to the CORS allowed list for the WS route specifically, or register the `/draft/live` route in a Fastify plugin scope that bypasses the CORS check. Since this is local-network-only, a relaxed CORS on this specific route is acceptable.

### Pitfall 6: `@fastify/websocket` Registration Must Precede Route Registration

**What goes wrong:** `app.get("/draft/live", { websocket: true }, ...)` throws because `@fastify/websocket` was not registered before the route definition.

**Why it happens:** Fastify plugin registration order matters. The WebSocket plugin decorates the app before routes can use `{ websocket: true }`.

**How to avoid:** Register `@fastify/websocket` in `buildServer()` in `src/index.ts` before `draftLiveRoutes`. Add to the existing plugin registration block near the top.

## Code Examples

### Backend: Register Plugin and Route

```typescript
// packages/backend/src/index.ts — add near top plugin registrations
import fastifyWebsocket from "@fastify/websocket";

await server.register(fastifyWebsocket);

// Then register the new route module
await server.register(draftLiveRoutes);
```

### Backend: Full Hub Route

```typescript
// packages/backend/src/api/draft-live.ts
import type { FastifyInstance } from "fastify";

export async function draftLiveRoutes(app: FastifyInstance) {
  let extensionSocket: import("@fastify/websocket").WebSocket | null = null;
  const mobileClients = new Set<import("@fastify/websocket").WebSocket>();

  app.get("/draft/live", { websocket: true }, (socket, req) => {
    const params = new URLSearchParams(req.url.split("?")[1] ?? "");
    const role = params.get("role");

    if (role === "extension") {
      extensionSocket = socket;
      app.log.info("[DraftLive] Extension connected");

      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "PING") {
          socket.send(JSON.stringify({ type: "PONG" }));
          return;
        }
        // Fan-out to mobile clients
        const str = raw.toString();
        for (const client of mobileClients) {
          if (client.readyState === 1) client.send(str);
        }
      });

      socket.on("close", () => {
        extensionSocket = null;
        app.log.info("[DraftLive] Extension disconnected");
      });
    } else {
      mobileClients.add(socket);
      app.log.info(`[DraftLive] Mobile client connected (total: ${mobileClients.size})`);

      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "CONTROL" && extensionSocket?.readyState === 1) {
          extensionSocket.send(raw.toString());
        }
      });

      socket.on("close", () => {
        mobileClients.delete(socket);
        app.log.info(`[DraftLive] Mobile client disconnected (total: ${mobileClients.size})`);
      });
    }
  });
}
```

### Extension: Storage Change Listener + WS Client

```typescript
// In background.ts — inside defineBackground()

// Persist engine signals alongside raw state
// (This lives in content.tsx, triggered after useDraftEngineSignals computes)
// In content script after engine signals are computed:
chrome.storage.local.set({
  "draft-engine-signals": JSON.stringify(signals),
});

// In background.ts:
chrome.storage.local.onChanged.addListener((changes) => {
  const rawState = changes["espn-draft-assistant-state"];
  const engineSignals = changes["draft-engine-signals"];

  if (!rawState?.newValue && !engineSignals?.newValue) return;
  if (draftWs?.readyState !== WebSocket.OPEN) return;

  const snapshot: Record<string, unknown> = { type: "STATE_SNAPSHOT", ts: Date.now() };

  if (rawState?.newValue) {
    const state = JSON.parse(rawState.newValue);
    // Only send the mobile-relevant subset
    snapshot.payload = {
      currentAuctionPlayer: state.currentAuctionPlayer,
      myRoster: state.myRoster,
      remainingBudget: state.remainingBudget,
      allTeamBudgets: state.allTeamBudgets,
      autoMode: state.autoMode,
      draftFormat: state.draftFormat,
      currentPick: state.currentPick,
      allPicks: state.allPicks,
    };
  }

  if (engineSignals?.newValue) {
    snapshot.engineSignals = JSON.parse(engineSignals.newValue);
  }

  draftWs.send(JSON.stringify(snapshot));
});
```

### Mobile Page: Connection Setup with LAN URL Input

```typescript
// packages/frontend/src/app/draft/live/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";

const WS_URL_KEY = "draft-live-ws-url";

export default function DraftLivePage() {
  const [wsUrl, setWsUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(WS_URL_KEY) ??
        `ws://${window.location.hostname}:3001/draft/live?role=mobile`;
    }
    return "";
  });
  // ... rest of component
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Background page (persistent) | Service worker (ephemeral, Chrome 116+ WS support) | MV3 transition (2022), Chrome 116 fix (2023) | Service workers now survive with active WebSocket + keepalive ping |
| Custom ws server (separate process) | @fastify/websocket embedded in existing Fastify | Fastify ecosystem matured | Single process, shared auth middleware, no port juggling |
| Content script WS connections | Background SW WS connections | Best practice established | Content scripts unload on page nav; SW is stable |

**Deprecated/outdated:**
- `background.persistent: true` in manifest: Removed in MV3. Cannot use.
- Offscreen documents for WebSocket: Valid workaround but unnecessary now that Chrome 116+ supports WS in service workers with keepalive pings.

## Open Questions

1. **Engine signals storage in content script**
   - What we know: `computeDraftEngine` runs in the content script (React context). `useDraftEngineSignals` computes synchronously for base signals and async for simulation/bid optimizer via Web Workers.
   - What's unclear: The cleanest hook point to write computed signals to `chrome.storage.local` without causing a render loop or excessive writes.
   - Recommendation: Add a `useEffect` in the component that renders `DraftSidebar` (or in `useDraftEngineSignals` itself) that writes signals to storage when they change, debounced to ~1 second. Or have the content script subscribe to store changes and write signals there.

2. **State snapshot size**
   - What we know: `rankings` is ~300 players * ~15 stats each. `espnDomAuctionValues` grows during draft. Both are large.
   - What's unclear: Whether mobile needs full player pool or just top-20 targets.
   - Recommendation: Only send mobile-relevant fields (listed in pattern 2 above). Exclude `rankings`, `auctionValues`, `espnDomAuctionValues` from the relay payload. Engine signals (which summarize these) are sufficient.

3. **Control scope for v1**
   - What we know: The user wants to "control" the draft from their phone.
   - What's unclear: How deep the control surface should go. Auto-bid toggle + position filter covers the highest-value controls without being dangerous.
   - Recommendation for v1: Auto-bid on/off toggle, position filter, sidebar visibility toggle. Explicitly exclude: direct bid submission (too risky from phone), ranking overrides.

4. **QR code or URL sharing for easy phone access**
   - What we know: The user will need to open the mobile page URL on their phone manually.
   - What's unclear: Whether to add a QR code on the desktop sidebar or the frontend admin page.
   - Recommendation: Out of scope for phase 31. A simple URL displayed in the draft sidebar is sufficient for now.

## Sources

### Primary (HIGH confidence)
- [Chrome WebSocket in Service Workers - Official Docs](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) — Chrome 116+ WS support, keepalive pattern, 30s window
- [fastify/fastify-websocket GitHub README](https://github.com/fastify/fastify-websocket) — Plugin API, route registration, `fastify.websocketServer.clients` for broadcast
- Codebase inspection — `background.ts`, `draft-state.ts`, `content.tsx`, `auto-bid-controller.ts`, `use-draft-engine.ts`, `wxt.config.ts`, backend `index.ts`

### Secondary (MEDIUM confidence)
- [DEV.to: WebSocket Communication Between Chrome Extension and Node.js](https://dev.to/orieasy1/how-to-set-up-websocket-communication-between-a-chrome-extension-and-a-nodejs-server-1ad2) — Background SW WS client pattern; verified consistent with official Chrome docs
- [VideoSDK: Fastify WebSocket 2025](https://www.videosdk.live/developer-hub/websocket/fastify-websocket) — @fastify/websocket v11+ API, route registration
- [DEV.to: Offscreen Documents](https://dev.to/notearthian/how-to-create-offscreen-documents-in-chrome-extensions-a-complete-guide-3ke2) — Considered and ruled out; SW+keepalive is simpler

### Tertiary (LOW confidence)
- WebSearch results on Next.js WebSocket route handlers — confirmed Next.js App Router does NOT natively support WS upgrades; Fastify backend is the right home for the WS server

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — @fastify/websocket is the obvious fit, native WS API is built-in
- Architecture: HIGH — extension=WS client, Fastify=hub is the only viable pattern given browser extension constraints; validated against Chrome official docs
- Pitfalls: HIGH — all identified pitfalls are grounded in actual constraints (service worker lifecycle, Map serialization, localhost from phone) with direct evidence from codebase inspection and Chrome docs

**Research date:** 2026-03-07
**Valid until:** 2026-06-07 (Chrome extension WS behavior is stable since Chrome 116)
