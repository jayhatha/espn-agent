# Technology Stack Additions

**Project:** ESPN Fantasy Baseball Assistant — Chrome DevTools MCP, Auto-Nomination Rework, Mobile Draft Command Center
**Researched:** 2026-03-14
**Confidence:** HIGH (official docs + npm registry + verified via multiple sources for all critical choices)

## Executive Summary

This milestone adds three distinct capabilities on top of the existing validated stack:

1. **Chrome DevTools MCP server** — Developer tooling (not shipped code) that gives Claude Code live DOM inspection of the ESPN draft page. Zero new production dependencies. Setup is a single `.mcp.json` file and a `chrome-devtools-mcp@latest` npx invocation.

2. **Auto-nomination selector rework** — No new libraries needed. The fix is architectural: inject a script in the MAIN world (using WXT's `injectScript` utility) to access ESPN's React fiber tree instead of querying opaque CSS classes. The existing `dom-observers.ts` and `auto-bid-controller.ts` are restructured, not replaced.

3. **Mobile draft command center** — The existing Next.js page at `draft/live/page.tsx` gains richer interactive controls. Two additions: `motion` (v12, the renamed Framer Motion) for swipe-dismissible alert cards and smooth state transitions, and the Screen Wake Lock API (browser-native, zero dependencies) to prevent the phone screen from sleeping during a 3-hour draft.

**Net new production packages:** 1 (`motion` in `packages/frontend`)
**Net new dev tooling:** 1 (`chrome-devtools-mcp` via npx, not installed in repo)
**Extension changes:** Architectural refactor (injectScript pattern), no new npm packages

---

## Feature 1: Chrome DevTools MCP Server

### What It Is

`chrome-devtools-mcp` is the official Chrome team MCP server (published by `ChromeDevTools/chrome-devtools-mcp` on GitHub, available as `chrome-devtools-mcp` on npm). It connects Claude Code to a live Chrome browser via the Chrome DevTools Protocol (CDP), exposing DOM snapshots, console output, CSS inspection, and network traffic as MCP tools.

The primary use in this project: **inspecting the live ESPN auction draft page DOM during a real or test draft session** so selector failures in `dom-observers.ts` can be diagnosed and fixed with ground truth rather than guesswork.

### Setup (Developer Tooling Only — Not a Runtime Dependency)

This is configured per-developer via Claude Code's MCP system. Do NOT add to `package.json`.

**Option A: Project-scoped `.mcp.json`** (checked in, available to all contributors)

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

Place `.mcp.json` at the repo root. Claude Code reads this automatically on startup.

**Option B: Claude Code CLI (user-scoped)**

```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

**Option C: With specific Chrome instance** (recommended when ESPN draft page is already open)

```bash
# Start Chrome with remote debugging enabled:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug

# Then configure MCP to connect to it:
claude mcp add --transport stdio chrome-devtools -- \
  npx -y chrome-devtools-mcp@latest --browserUrl=http://127.0.0.1:9222
```

The `--browserUrl` flag is critical for ESPN inspection: it connects to an already-authenticated Chrome session rather than opening a fresh incognito instance that would require ESPN login.

### Requirements

| Requirement | Value | Notes |
|-------------|-------|-------|
| Node.js | 20.19+ (22+ recommended) | The `chrome-devtools-mcp@latest` (v0.20.0 as of March 2026) requires modern Node |
| Chrome | Current stable | Must be the same Chrome where ESPN draft page is open |
| npm/npx | Any current version | Used via `npx -y` — no install needed |

**Verify Node version:**
```bash
node --version  # Must be v20.19 or newer
```

### DOM Inspection Workflow for ESPN Selector Debugging

Once configured, Claude Code can:
- Take a DOM snapshot of the ESPN draft page mid-session
- Read console output for selector query results
- Execute arbitrary JavaScript (`document.querySelector(...)`) against the live page
- Inspect CSS classes, data attributes, and React fiber keys on specific elements

This replaces the current workflow of adding `console.log` statements to `dom-observers.ts`, rebuilding the extension, and reloading — which is destructive to a live draft session.

---

## Feature 2: ESPN DOM Selector Rework (Extension)

### The Core Problem

ESPN's auction draft page is a React SPA. CSS classes like `.draftBoardCell` and `[class*="jsx-XXXXX"]` are either generated at build time (stable but opaque) or dynamic JSX hashes (unstable across ESPN deploys). After ~10 selector iterations, the pattern is clear: querying CSS classes is the wrong primary strategy.

### The Right Strategy: MAIN World Script Injection

ESPN stores draft state in React component state (not the DOM directly). From the extension's current isolated content script world, only the serialized DOM is visible — not React state. The fix is a WXT `injectScript` pattern that places a small probe script in the **page's own JavaScript context** (MAIN world), giving it access to `__reactFiber$*` and `__reactInternalInstance$*` keys attached to DOM nodes by React.

**This requires zero new npm packages.** WXT's `injectScript` utility is already available in the extension package.

### Architecture Change (Extension Package)

**New file:** `packages/extension/entrypoints/espn-probe.ts` (unlisted script — runs in MAIN world)

```typescript
// Runs in page's MAIN world — has access to React internals
export default defineUnlistedScript(() => {
  // Find React fiber key (format: __reactFiber$XXXXXXXX)
  function findFiberKey(el: Element): string | null {
    return Object.keys(el).find(k => k.startsWith('__reactFiber$')) ?? null;
  }

  // Read ESPN's internal auction state from React tree
  function readAuctionState() {
    // Walk fiber tree from a known stable anchor element
    // ESPN's root is typically document.getElementById('espnfitt-root')
  }

  // Expose to content script via custom events
  window.addEventListener('espn-probe:read-auction', () => {
    const state = readAuctionState();
    window.dispatchEvent(new CustomEvent('espn-probe:auction-state', { detail: state }));
  });
});
```

**Modified:** `packages/extension/entrypoints/content.tsx` — calls `injectScript('/espn-probe.js')` on startup, then communicates with it via `CustomEvent`.

**`wxt.config.ts` addition:**
```typescript
manifest: {
  web_accessible_resources: [
    { resources: ['espn-probe.js'], matches: ['*://*.fantasy.espn.com/*'] }
  ]
}
```

### Fallback Selector Hierarchy (Revised Priority Order)

When React fiber access succeeds: use it as the authoritative source.
When it fails (e.g., ESPN rewrites their React root): fall back in this order:

1. `data-player-id` attributes — ESPN does use these on player rows (confirmed by current codebase)
2. `[data-testid]` attributes — More stable than generated class names across ESPN redeploys
3. Text-content matching (player name extraction) — Brittle but universal fallback
4. CSS class patterns — Last resort, expect breakage on ESPN deploys

### Nomination Queue Selector Fix

The current `scrapeESPNNominationQueue()` in `dom-observers.ts` uses `.queue-item` and similar CSS selectors that ESPN may have changed. The MAIN world probe replaces this with direct React state reads where available, eliminating the "selector drift" problem entirely for supported ESPN React components.

---

## Feature 3: Mobile Draft Command Center (Frontend)

### Current State

`packages/frontend/src/app/draft/live/page.tsx` is a ~530-line single-file page with:
- WebSocket connection to backend
- Read-only displays (nomination, win probability, budget, roster, alerts)
- 3 controls in a sticky footer (auto-bid toggle, position filter, pitcher/hitter split)

### New Additions Needed

The redesign adds: swipe-dismissible alerts, animated state transitions when a new nomination arrives, a nomination queue override panel (send nominations from mobile), and screen wake lock so the phone doesn't sleep mid-draft.

#### `motion` (Framer Motion v12)

**Package:** `motion` (NOT `framer-motion` — the package was renamed at v11+)
**Version:** `^12.36.0` (current stable as of March 2026)
**Install location:** `packages/frontend`

```bash
cd packages/frontend
pnpm add motion
```

**Why motion over alternatives:**
- `framer-motion` is the old package name — still works as an alias but installs the same package. Use `motion` for clarity.
- `@use-gesture/react` handles raw gesture math but doesn't integrate with animation. Motion has both gesture recognition AND animation in one package — drag + spring physics in `<motion.div drag="x" onDragEnd={...}>` is 5 lines.
- CSS animations cannot do the spring-physics dismissal feel needed for swipeable alert cards.
- The existing frontend uses React 18 — Motion 12.x is compatible with React 18 (`react@18` is the minimum from Motion v7+).

**Usage in mobile page:**

```typescript
import { motion, AnimatePresence } from 'motion/react';
// Note: import from 'motion/react', not 'framer-motion' or 'motion' directly

// Swipe-to-dismiss alert card
<motion.div
  drag="x"
  dragConstraints={{ left: 0, right: 0 }}
  onDragEnd={(_, info) => {
    if (Math.abs(info.offset.x) > 80) dismissAlert(alert.id);
  }}
  exit={{ x: 200, opacity: 0 }}
>
  {/* alert content */}
</motion.div>
```

**Next.js 14 compatibility note:** Motion components must be in `"use client"` files. The draft live page is already `"use client"` — no change needed.

#### Screen Wake Lock API (No Package — Browser Native)

Keep the phone screen on during a 3-hour auction draft. This is a browser API requiring zero new dependencies.

```typescript
// In useDraftLiveSocket hook or the page component:
useEffect(() => {
  if (!connected) return;
  let wakeLock: WakeLockSentinel | null = null;

  async function acquireWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      // Device denied (low battery, etc.) — non-fatal, draft continues
    }
  }

  acquireWakeLock();

  // Re-acquire when tab regains visibility (lock releases on tab hide)
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') acquireWakeLock();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    wakeLock?.release();
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [connected]);
```

**Browser support:** Chrome 84+, Safari 16.4+, Edge 84+ — covers all mobile browsers used on local network. LOW risk.

**Caveat:** iOS Safari 16.4 added Wake Lock support, but it only works for PWA home-screen installs or full-screen mode in some iOS versions. For in-browser Safari visits, a `<video>` autoplay workaround was historically needed. Since this is a local network tool accessed in mobile Chrome or as a PWA, native Wake Lock is the right approach. Log a warning (not an error) if the API is unavailable.

---

## Complete Dependency Delta

### `packages/frontend`

| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| ADD | `motion` | `^12.36.0` | Swipe gestures + spring animations for mobile alerts panel |

### `packages/extension`

| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| NONE | — | — | WXT `injectScript` is already available in the WXT package. No new npm deps. |

### `packages/backend`

| Action | Package | Version | Reason |
|--------|---------|---------|--------|
| NONE | — | — | WebSocket, backend logic, nomination flow are already implemented |

### Developer Tooling (NOT in package.json)

| Action | Tool | Version | Reason |
|--------|------|---------|--------|
| CONFIGURE | `chrome-devtools-mcp` | `@latest` (0.20.0) | DOM inspection via MCP. Installed via npx, not added to any package.json |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `framer-motion` package | Renamed to `motion` at v11. The old package name still resolves but installs the same code under an alias — confusing. | `motion@^12` |
| `@use-gesture/react` | Handles gesture math only, no animation integration. You'd need both this and a separate animation library. | `motion` (includes both drag gestures and animations) |
| `puppeteer` or `playwright` in the extension | Heavy headless browser automation frameworks — wrong tool for a content script context. Extension content scripts already have DOM access. | WXT `injectScript` + CustomEvent pattern |
| `@types/chrome` version bump | The existing `^0.1.37` covers all APIs used. No MV3 APIs added in this milestone need newer types. | Keep as-is |
| XPath selectors for ESPN DOM | XPath is verbose and breaks on structural changes just as CSS classes do. | React fiber reads via MAIN world script |
| `react-spring` | Older animation library, smaller ecosystem than Motion, no drag gesture support built in. | `motion` |
| `hammerjs` | Unmaintained (last release 2016). `motion`'s drag API covers all needed gestures. | `motion` drag API |
| `react-swipeable` | Single-purpose swipe library, no animation. Redundant if using `motion`. | `motion` onDragEnd pattern |
| Wake Lock polyfill packages | Browser support (Chrome 84+, Safari 16.4+) covers all realistic mobile users of this local network tool. | Native `navigator.wakeLock` API |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| ESPN DOM inspection (dev) | `chrome-devtools-mcp` | Manual console.log + rebuild | Rebuilding extension mid-session destroys draft state. MCP enables live inspection without rebuild. |
| ESPN state reading | MAIN world React fiber probe via `injectScript` | CSS class selectors | Classes have failed ~10 times. React fiber data is stable — ESPN's own code depends on it, so it won't break silently. |
| ESPN state reading | MAIN world React fiber probe via `injectScript` | XHR/network interception | Network interception in MV3 requires `declarativeNetRequest` (blocking) — can't read response bodies in real-time. The React state approach gives parsed data without network overhead. |
| Mobile animations | `motion` v12 | CSS transitions only | CSS `transition` can't do spring physics or gesture-driven drag. The alert dismiss interaction specifically needs drag offset → spring snap. |
| Screen wake lock | Native browser API | `nosleep.js` library | `nosleep.js` uses a silent autoplay video hack — fragile and the API approach is now well-supported. Adding a library for a 3-line API call is unnecessary. |
| DOM inspection MCP | `chrome-devtools-mcp` (official Chrome team) | `playwright-mcp` | Playwright spins up a new browser instance. For ESPN inspection you need the browser instance that is already authenticated and has the draft open. Chrome DevTools MCP connects to an existing Chrome via CDP. |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `motion@^12.36.0` | `react@^18.2.0` | React 18 is the minimum from Motion v7+. No issues with Next.js 14 App Router. Must be in `"use client"` files. Import from `'motion/react'` subpath. |
| `motion@^12.36.0` | `next@14.x` | App Router compatible. No special Next.js config needed — just `"use client"` directive. |
| `chrome-devtools-mcp@latest` | Node.js 20.19+ | `npx` fetches latest. Node 22 is the recommended runtime for the MCP server process itself (separate from the project's Node runtime). |
| WXT `injectScript` | `wxt@^0.20.18` | Already in the extension package. No version bump needed. |

---

## Sources

- [Chrome DevTools MCP — Official Chrome Developers Blog](https://developer.chrome.com/blog/chrome-devtools-mcp) — Setup steps, capabilities, public preview status (September 2025)
- [ChromeDevTools/chrome-devtools-mcp GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp) — Node.js version requirement (v20.19+), Claude Code integration
- [chrome-devtools-mcp npm page](https://www.npmjs.com/package/chrome-devtools-mcp) — Current version 0.20.0, install command
- [How to Set Up Chrome DevTools MCP with Claude Code (raf.dev)](https://raf.dev/blog/chrome-debugging-profile-mcp/) — `--browserUrl` flag for authenticated Chrome sessions, `--` separator syntax
- [WXT Content Scripts — Official Docs](https://wxt.dev/guide/essentials/content-scripts.html) — `injectScript` API, MAIN world vs isolated world, `web_accessible_resources` requirement
- [Motion for React — Official Docs](https://motion.dev/docs/react) — v12.36.0 current stable, React 18 compatibility, import path `'motion/react'`
- [motion npm registry](https://registry.npmjs.org/motion/latest) — Version 12.36.0 confirmed March 2026
- [@use-gesture/react npm registry](https://registry.npmjs.org/@use-gesture/react/latest) — Version 10.3.1, confirmed for alternative comparison
- [Screen Wake Lock API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) — Browser support table, `visibilitychange` re-acquire pattern
- [Chrome Extension MAIN World Access](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/bSKgvG0hipc) — `__reactFiber$` key pattern, isolated world limitation

---

*Stack research for: Chrome DevTools MCP + ESPN DOM rework + mobile draft command center*
*Researched: 2026-03-14*
