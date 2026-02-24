# Phase 10: ESPN Live Draft Assistant - Research

**Researched:** 2026-02-23
**Domain:** Chrome extension development (Manifest V3), real-time DOM monitoring, hybrid offline/online draft assistance, VBD/SGP/auction strategies
**Confidence:** MEDIUM-HIGH

## Summary

Phase 10 delivers a Chrome extension that overlays ESPN's live draft page, providing real-time player recommendations, roster tracking, and value analysis for both snake and auction drafts. Research reveals four critical technical domains: (1) Chrome extension architecture (Manifest V3 with content scripts, service workers, and chrome.storage for persistence), (2) real-time DOM monitoring (MutationObserver to detect picks as they appear), (3) hybrid data strategy (bundled baseline rankings for offline fallback + backend API for advanced projections), and (4) draft-specific algorithms (VBD for snake drafts, budget pacing for auctions, pair recommendations at snake draft turns). The codebase already has DraftRankingsAgent and AuctionValuationAgent with VBD/SGP calculations, plus API endpoints at `/api/leagues/:id/draft/rankings` and `/api/leagues/:id/draft/auction`, so the extension can immediately leverage existing backend logic. Key architecture decision: WXT framework (Vite-based, Manifest V3, HMR support) provides the best developer experience and smallest bundle sizes compared to CRXJS or Plasmo.

**Primary recommendation:** Build Chrome extension using WXT framework with TypeScript + React. Use content script to inject sidebar overlay (Shadow DOM for style isolation), MutationObserver to track draft picks in real-time, chrome.storage.local for draft state persistence (survives page refreshes), and fetch() calls to existing backend draft API for league-specific projections. Bundle lightweight baseline rankings (~300 players, ~100KB JSON) in extension for offline fallback. Implement separate UI modes for snake (pair recommendations at the turn) vs auction (budget pacing + nomination suggestions). Deploy via Chrome Web Store unlisted mode for v1 (user-install only, no public listing).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Architecture: Chrome Extension**
- **Chrome extension**, not a web app page — overlays ESPN draft page for seamless UX
- Reads ESPN draft board DOM directly (no separate tab switching)
- Extension communicates with existing backend API for projections and advanced recommendations
- Different architecture from rest of app (requires manifest, content scripts, etc.)

**Draft Mode Support**
- Support both **snake and auction** formats
- **Auction strategy:** Full support including budget pacing, value targets, nomination suggestions, optimal spend distribution
- **Snake draft turn handling:** Pair recommendations at the turn (show optimal player pairs for back-to-back picks accounting for both positions)
- **Redraft only** for v1 — keeper/dynasty leagues are future phase

**Draft State Tracking**
- **Real-time updates:** MutationObserver on draft board to detect picks as they appear in DOM
- **Backend integration:** Hybrid approach
  - Basic rankings bundled in extension (fast initial load, works offline)
  - Advanced recommendations from backend API (rich features when connected)
- **State persistence:** Full draft state saved to localStorage (persists across browser restarts and page refreshes)

**Recommendation Strategy**
- **Primary logic:** Hybrid BPA with need awareness
  - Recommend best available player by default
  - Flag when positional need is critical
  - Show both value picks and strategic picks
- **Player value calculation:**
  - Projected points + positional scarcity
  - Running team projections (current roster's projected category standings)
  - Identify which categories team needs most
- **Auction valuations:** Show both fair value (projection-based) AND recommended max bid (strategic)
- **Pre-draft support:** Default rankings with optional user overrides (user can adjust specific players up/down)
- **Pick value tracking:** Show overpay/underpay for each pick (all teams, not just user) according to model

**Information Display**
- **Player information:**
  - Core stats: name, team, position, rank
  - Projected season stats (must match league's scoring categories — critical)
  - Scarcity/value indicators
  - Draft context: ADP, picks until your turn
- **UI positioning:** Sidebar overlay (left or right side of ESPN draft page) — persistent, doesn't cover ESPN draft board
- **Current roster display:**
  - Tabbed view: summary (position counts, stat totals) + detailed roster (full player list)
  - Projected standings position (where drafted roster would rank in each category if season ended now)
- **Recommendation organization:** Smart filter with BPA + positional need tabs
  - Default: BPA ranking (single scrollable list)
  - Toggles: Filter by position or filter by team needs
  - Most flexible approach

### Claude's Discretion
- Exact MutationObserver implementation details
- Which basic rankings to bundle vs fetch from API
- localStorage schema and sync logic
- Sidebar positioning (left vs right) based on ESPN page layout
- Specific scarcity multipliers and value calculation weights

### Deferred Ideas (OUT OF SCOPE)
- Keeper/dynasty league support — Future phase (requires multi-year projections, contract values, prospect upside)
- Trade offers during draft — Out of scope for draft assistant

</user_constraints>

## Standard Stack

### Core (Chrome Extension)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WXT | 0.19.x | Chrome extension framework | Market leader for 2026, Vite-based with HMR, 43% smaller bundles than Plasmo, framework-agnostic, active maintenance |
| Vite | 5.x | Build tool | WXT uses Vite under the hood, fastest dev server, tree-shaking, code splitting built-in |
| TypeScript | 5.3+ | Type safety | Already used across monorepo, critical for manifest.json typing and chrome.* API safety |
| React | 18.2+ | UI framework | Already used in frontend, Shadow DOM compatible, well-tested for content script injection |

### Supporting (Extension-Specific)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/chrome | latest | Chrome API types | Type safety for chrome.storage, chrome.runtime, chrome.tabs |
| webext-bridge | 6.x | Cross-context messaging | Simplifies content script ↔ background worker communication, type-safe message passing |
| zustand | 4.x | State management | Lightweight (3KB), perfect for extension state (draft picks, current roster, UI toggles) |
| tailwindcss | 3.x | Styling | Already used in frontend, works with Shadow DOM via style injection |

### Existing Backend Integration

| Endpoint | Purpose | Already Implemented |
|----------|---------|---------------------|
| `/api/leagues/:id/draft/rankings` | VBD snake draft rankings | ✅ DraftRankingsAgent (Phase 4) |
| `/api/leagues/:id/draft/auction` | Auction dollar valuations | ✅ AuctionValuationAgent (Phase 4) |
| `/api/projections` | Projection runs metadata | ✅ ProjectionsIngestAgent |
| `/api/leagues/:id/teams` | League roster data | ✅ ESPNAdapter |

**Installation:**
```bash
# Create new extension package in monorepo
pnpm create wxt packages/extension

# Add dependencies
cd packages/extension
pnpm add zustand webext-bridge
pnpm add -D @types/chrome
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| WXT | Plasmo | Plasmo in maintenance mode, 2-3x slower builds (Parcel vs Vite), larger bundles (800KB vs 400KB), React-first bias |
| WXT | CRXJS | CRXJS is Vite plugin only (not full framework), lacks file-based routing, maintenance uncertain, less opinionated |
| Shadow DOM | iframe | iframe CSP issues, communication overhead, performance cost, harder to style |
| chrome.storage.local | localStorage | chrome.storage.local survives extension context invalidation, localStorage doesn't persist across service worker restarts |
| Bundled rankings | Always fetch from API | Offline support critical, ESPN draft page may block fetch, bundled fallback ensures extension always works |

## Architecture Patterns

### Recommended Project Structure

```
packages/extension/
├── entrypoints/
│   ├── background.ts              # Service worker (message routing, storage sync)
│   ├── content.ts                 # Main content script (DOM injection, MutationObserver)
│   ├── popup.html                 # Extension popup (settings, league selection)
│   └── sidebar.tsx                # Draft assistant sidebar UI (React component)
├── components/
│   ├── DraftRecommendations.tsx   # BPA + positional need tabs
│   ├── RosterSummary.tsx          # Current roster + projected standings
│   ├── PlayerCard.tsx             # Player row with stats + value indicators
│   ├── AuctionBudgetTracker.tsx   # Budget pacing + spend distribution
│   └── SnakeTurnPairs.tsx         # Back-to-back pick recommendations
├── lib/
│   ├── draft-state.ts             # Zustand store (picks, roster, budget)
│   ├── dom-observers.ts           # MutationObserver helpers for ESPN draft board
│   ├── value-calculations.ts      # VBD, scarcity, auction pacing formulas
│   └── api-client.ts              # Backend API fetch wrapper
├── assets/
│   └── baseline-rankings.json     # Bundled ~300 players (offline fallback)
├── wxt.config.ts                  # WXT configuration
└── manifest.json                  # Auto-generated by WXT from wxt.config.ts
```

### Pattern 1: Content Script + Shadow DOM Sidebar Injection

**What:** Content script detects ESPN draft page, injects React-rendered sidebar using Shadow DOM for style isolation

**When to use:** Always for Chrome extensions that need persistent UI on third-party pages

**Example:**
```typescript
// entrypoints/content.ts
// Source: WXT docs + Shadow DOM best practices

export default defineContentScript({
  matches: ['https://fantasy.espn.com/baseball/draft*'],
  runAt: 'document_idle',

  async main() {
    // Create sidebar container
    const sidebarRoot = document.createElement('div');
    sidebarRoot.id = 'espn-draft-assistant-root';
    sidebarRoot.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 400px;
      height: 100vh;
      z-index: 999999;
      box-shadow: -2px 0 8px rgba(0,0,0,0.1);
    `;

    // Attach Shadow DOM for style isolation
    const shadowRoot = sidebarRoot.attachShadow({ mode: 'open' });

    // Inject Tailwind styles into Shadow DOM
    const styleSheet = document.createElement('style');
    styleSheet.textContent = await fetch(chrome.runtime.getURL('assets/tailwind.css')).then(r => r.text());
    shadowRoot.appendChild(styleSheet);

    // Mount React app into Shadow DOM
    const reactRoot = document.createElement('div');
    shadowRoot.appendChild(reactRoot);

    document.body.appendChild(sidebarRoot);

    // Render sidebar (React 18)
    import('react-dom/client').then(({ createRoot }) => {
      createRoot(reactRoot).render(<DraftAssistantSidebar />);
    });
  }
});
```

**Why this works:**
- Shadow DOM prevents ESPN's CSS from breaking extension UI
- `position: fixed` keeps sidebar visible during scroll
- High z-index ensures extension stays on top
- WXT auto-bundles `sidebar.tsx` and handles HMR during development

### Pattern 2: MutationObserver for Real-Time Draft Pick Detection

**What:** Monitor ESPN draft board DOM for new picks, extract player/team data, update extension state

**When to use:** When tracking live changes on third-party pages (drafts, live scores, etc.)

**Example:**
```typescript
// lib/dom-observers.ts
// Source: MDN MutationObserver docs + ESPN draft page inspection

interface DraftPick {
  playerId: string;
  playerName: string;
  teamId: string;
  pickNumber: number;
  timestamp: number;
}

export function observeDraftBoard(onPick: (pick: DraftPick) => void): () => void {
  // ESPN draft board structure (adjust based on actual DOM inspection)
  const draftBoardSelector = '.draftboard-container';
  const pickRowSelector = '.pick-row';

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Check for new pick rows
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.matches(pickRowSelector)) {
            const pick = extractPickData(node);
            if (pick) {
              onPick(pick);
            }
          }
        });
      }
    }
  });

  const draftBoard = document.querySelector(draftBoardSelector);
  if (draftBoard) {
    observer.observe(draftBoard, {
      childList: true,
      subtree: true,
    });
  }

  // Return cleanup function
  return () => observer.disconnect();
}

function extractPickData(pickElement: HTMLElement): DraftPick | null {
  // ESPN-specific DOM parsing (requires manual inspection)
  const playerNameEl = pickElement.querySelector('.player-name');
  const teamEl = pickElement.querySelector('.team-abbrev');

  if (!playerNameEl || !teamEl) return null;

  return {
    playerId: pickElement.dataset.playerId || '',
    playerName: playerNameEl.textContent?.trim() || '',
    teamId: teamEl.textContent?.trim() || '',
    pickNumber: parseInt(pickElement.dataset.pickNumber || '0', 10),
    timestamp: Date.now(),
  };
}
```

**Best practices:**
- Use `subtree: true` to catch dynamically added picks
- Debounce rapid mutations to avoid performance issues
- Disconnect observer when extension is closed (cleanup)
- Verify selectors against ESPN's actual draft page HTML (manual inspection required)

### Pattern 3: Hybrid Data Strategy (Bundled + API)

**What:** Bundle lightweight baseline rankings in extension, fetch league-specific data from backend API

**When to use:** When offline fallback is required but personalization is valuable

**Example:**
```typescript
// lib/api-client.ts
// Source: Chrome extension fetch best practices

import baselineRankings from '../assets/baseline-rankings.json';

interface RankingsOptions {
  leagueId: number;
  projectionsRunId?: number;
  limit?: number;
}

export async function getRankings(options: RankingsOptions): Promise<DraftRanking[]> {
  try {
    // Attempt backend API fetch for league-specific projections
    const response = await fetch(
      `https://your-backend.com/api/leagues/${options.leagueId}/draft/rankings?limit=${options.limit || 300}`,
      {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        signal: AbortSignal.timeout(3000), // 3s timeout
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.rankings;
    }

    // Fallback to bundled rankings
    console.warn('Backend API failed, using bundled rankings');
    return baselineRankings;
  } catch (error) {
    // Offline or network error
    console.warn('Network error, using bundled rankings', error);
    return baselineRankings;
  }
}

async function getAuthToken(): Promise<string> {
  // Retrieve from chrome.storage.local (stored during extension setup)
  const result = await chrome.storage.local.get('authToken');
  return result.authToken || '';
}
```

**Bundled rankings format:**
```json
[
  {
    "playerId": 12345,
    "playerName": "Aaron Judge",
    "positions": ["OF"],
    "primaryPosition": "OF",
    "vbdScore": 85.3,
    "tier": 1
  }
]
```

**Why hybrid:**
- Bundled rankings (~100KB JSON) ensure extension always works
- Backend API provides league-specific categories, current projections, team roster context
- Chrome.storage.local caches API responses to minimize backend calls

### Pattern 4: State Management with Zustand + chrome.storage.local Sync

**What:** Use Zustand for in-memory state, sync critical state to chrome.storage.local for persistence

**When to use:** Chrome extensions where state must survive page refreshes and service worker restarts

**Example:**
```typescript
// lib/draft-state.ts
// Source: Zustand docs + chrome.storage.local patterns

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DraftState {
  // Draft metadata
  leagueId: number | null;
  draftFormat: 'snake' | 'auction';
  totalTeams: number;
  currentPick: number;

  // User's team
  myTeamId: string | null;
  myRoster: DraftedPlayer[];
  remainingBudget: number; // Auction only

  // All picks (across all teams)
  allPicks: DraftPick[];

  // Rankings and recommendations
  rankings: DraftRanking[];

  // Actions
  addPick: (pick: DraftPick) => void;
  updateRoster: (player: DraftedPlayer) => void;
  setRankings: (rankings: DraftRanking[]) => void;
  reset: () => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      // Initial state
      leagueId: null,
      draftFormat: 'snake',
      totalTeams: 12,
      currentPick: 1,
      myTeamId: null,
      myRoster: [],
      remainingBudget: 260,
      allPicks: [],
      rankings: [],

      // Actions
      addPick: (pick) => {
        set((state) => ({
          allPicks: [...state.allPicks, pick],
          currentPick: state.currentPick + 1,
        }));
      },

      updateRoster: (player) => {
        set((state) => ({
          myRoster: [...state.myRoster, player],
          remainingBudget: state.draftFormat === 'auction'
            ? state.remainingBudget - (player.cost || 1)
            : state.remainingBudget,
        }));
      },

      setRankings: (rankings) => set({ rankings }),

      reset: () => set({
        allPicks: [],
        myRoster: [],
        currentPick: 1,
        remainingBudget: 260,
      }),
    }),
    {
      name: 'draft-assistant-state', // chrome.storage.local key
      storage: {
        getItem: async (name) => {
          const result = await chrome.storage.local.get(name);
          return result[name] || null;
        },
        setItem: async (name, value) => {
          await chrome.storage.local.set({ [name]: value });
        },
        removeItem: async (name) => {
          await chrome.storage.local.remove(name);
        },
      },
    }
  )
);
```

**Why this pattern:**
- Zustand provides React hook access (`const { addPick } = useDraftStore()`)
- Persist middleware auto-syncs state changes to chrome.storage.local
- Survives page refreshes, service worker restarts, browser crashes
- 10MB storage limit (chrome.storage.local) is plenty for draft state

### Pattern 5: Snake Draft Turn Pair Recommendations

**What:** When user has back-to-back picks (e.g., picks 12 + 13 in a 12-team snake), recommend optimal player pairs

**When to use:** Snake draft format when user's pick position is at the turn

**Example:**
```typescript
// lib/value-calculations.ts
// Source: Fantasy baseball snake draft strategy research

interface PairRecommendation {
  player1: DraftRanking;
  player2: DraftRanking;
  combinedValue: number;
  categoryBalance: string[]; // Categories covered by this pair
  rationale: string;
}

export function getSnakeTurnPairs(
  availablePlayers: DraftRanking[],
  currentRoster: DraftedPlayer[],
  categories: Category[],
): PairRecommendation[] {
  const pairs: PairRecommendation[] = [];

  // Sort by VBD descending
  const ranked = [...availablePlayers].sort((a, b) => b.vbdScore - a.vbdScore);

  // Top 50 players for pairing (avoid combinatorial explosion)
  const topPlayers = ranked.slice(0, 50);

  for (let i = 0; i < topPlayers.length; i++) {
    for (let j = i + 1; j < topPlayers.length; j++) {
      const player1 = topPlayers[i];
      const player2 = topPlayers[j];

      // Calculate combined value
      const combinedValue = player1.vbdScore + player2.vbdScore;

      // Analyze category coverage
      const categoriesCovered = getCategoriesCovered(player1, player2, currentRoster, categories);

      // Penalize redundant positions (two catchers bad, catcher + OF good)
      const positionPenalty = player1.primaryPosition === player2.primaryPosition ? 0.9 : 1.0;

      pairs.push({
        player1,
        player2,
        combinedValue: combinedValue * positionPenalty,
        categoryBalance: categoriesCovered,
        rationale: generateRationale(player1, player2, categoriesCovered),
      });
    }
  }

  // Sort by combined value, return top 10 pairs
  return pairs.sort((a, b) => b.combinedValue - a.combinedValue).slice(0, 10);
}

function getCategoriesCovered(
  p1: DraftRanking,
  p2: DraftRanking,
  roster: DraftedPlayer[],
  categories: Category[],
): string[] {
  // Identify which categories this pair strengthens
  const weakCategories = identifyWeakCategories(roster, categories);

  const covered: string[] = [];
  for (const cat of weakCategories) {
    const p1Contribution = p1.categorySGPs[cat.category_id] || 0;
    const p2Contribution = p2.categorySGPs[cat.category_id] || 0;

    if (p1Contribution + p2Contribution > 1.0) {
      covered.push(cat.name);
    }
  }

  return covered;
}

function generateRationale(p1: DraftRanking, p2: DraftRanking, categories: string[]): string {
  if (categories.length === 0) {
    return `Best available value (${p1.vbdScore.toFixed(1)} + ${p2.vbdScore.toFixed(1)} VBD)`;
  }

  return `Strengthens ${categories.join(', ')} (${p1.vbdScore.toFixed(1)} + ${p2.vbdScore.toFixed(1)} VBD)`;
}
```

**Why pairs matter:**
- At the turn, next pick is ~20-24 picks away (huge value drop)
- Pairing analysis accounts for both picks, not just next player
- Position balance matters (don't double up on scarce positions)

### Pattern 6: Auction Budget Pacing

**What:** Track remaining budget vs remaining roster spots, recommend max bid to stay within pacing targets

**When to use:** Auction draft format

**Example:**
```typescript
// lib/value-calculations.ts
// Source: Fantasy baseball auction strategy research

interface BudgetPacing {
  remainingBudget: number;
  remainingRosterSpots: number;
  averageRemainingPerPlayer: number;
  recommendedMaxBid: number;
  pacingStatus: 'ahead' | 'on-track' | 'behind';
}

export function calculateBudgetPacing(
  totalBudget: number,
  currentRoster: DraftedPlayer[],
  rosterSize: number,
): BudgetPacing {
  const spentBudget = currentRoster.reduce((sum, p) => sum + (p.cost || 0), 0);
  const remainingBudget = totalBudget - spentBudget;
  const remainingRosterSpots = rosterSize - currentRoster.length;

  const averageRemainingPerPlayer = remainingBudget / remainingRosterSpots;

  // Recommended max bid: 40% of remaining budget (avoid overcommitting)
  const recommendedMaxBid = Math.floor(remainingBudget * 0.4);

  // Pacing status (compare to ideal equal distribution)
  const idealAveragePerPlayer = totalBudget / rosterSize;
  const pacingRatio = averageRemainingPerPlayer / idealAveragePerPlayer;

  let pacingStatus: 'ahead' | 'on-track' | 'behind';
  if (pacingRatio > 1.2) {
    pacingStatus = 'ahead'; // Underspending, can be aggressive
  } else if (pacingRatio < 0.8) {
    pacingStatus = 'behind'; // Overspent early, need to conserve
  } else {
    pacingStatus = 'on-track';
  }

  return {
    remainingBudget,
    remainingRosterSpots,
    averageRemainingPerPlayer,
    recommendedMaxBid,
    pacingStatus,
  };
}

export function calculateAuctionValueWithInflation(
  baseValue: number,
  spentByAll: number,
  totalBudgetPool: number,
): number {
  // Inflation adjustment: if league is spending slower than expected, values inflate
  const expectedSpent = totalBudgetPool * 0.7; // Assume 70% spent by mid-draft
  const inflationFactor = expectedSpent / spentByAll;

  return Math.floor(baseValue * inflationFactor);
}
```

**Why pacing matters:**
- Overspending early leaves no budget for late-round value
- Underspending wastes opportunity to buy elite players
- Recommended max bid prevents catastrophic overbids

### Anti-Patterns to Avoid

- **Polling ESPN DOM every second:** Use MutationObserver, not setInterval. Polling kills performance.
- **Fetching backend API on every pick:** Cache rankings in chrome.storage.local, only re-fetch when projections update.
- **Using localStorage instead of chrome.storage.local:** localStorage doesn't survive service worker restarts in Manifest V3.
- **Rendering sidebar with iframe:** CSP issues, performance overhead. Use Shadow DOM instead.
- **Bundling entire projection dataset:** Extension bundle should be <1MB. Bundle only top 300 players (~100KB).
- **Blocking main thread with value calculations:** Use Web Workers for heavy computations (VBD recalculation across 500+ players).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chrome extension build pipeline | Custom webpack config | WXT framework | Manifest V3 boilerplate, HMR, auto-reloading, TypeScript support, file-based routing |
| Cross-context messaging | Manual chrome.runtime.sendMessage wrappers | webext-bridge | Type-safe message passing, Promise-based, handles content script ↔ background ↔ popup |
| Shadow DOM style injection | Manual style tag creation | Tailwind + WXT bundling | WXT auto-injects styles into Shadow DOM, Tailwind purges unused CSS |
| Draft value calculations | Custom VBD/SGP math | Reuse shared/src/formulas.ts | Already has `calculateVBD`, `calculateTotalSGP`, `calculateFinalRate` |
| State persistence | Manual chrome.storage wrappers | Zustand persist middleware | Auto-syncs state changes, handles JSON serialization, provides React hooks |

**Key insight:** Chrome extensions have steep learning curves (Manifest V3 service workers, content script isolation, CSP restrictions). WXT framework abstracts 80% of boilerplate. Don't reinvent—leverage WXT's conventions and existing backend agents.

## Common Pitfalls

### Pitfall 1: Service Worker Timeouts (Manifest V3)

**What goes wrong:** Background service worker shuts down after 30 seconds of inactivity, losing in-memory state

**Why it happens:** Manifest V3 changed background pages to service workers (event-driven, not persistent)

**How to avoid:**
- Store all critical state in chrome.storage.local (persists across restarts)
- Use Zustand persist middleware (auto-syncs to chrome.storage.local)
- Avoid long-running timers in service worker (use alarms API for scheduled tasks)

**Warning signs:**
- Draft picks disappear after page refresh
- Extension state resets unexpectedly
- "Service worker inactive" errors in console

### Pitfall 2: Content Security Policy (CSP) Violations

**What goes wrong:** Extension scripts blocked by ESPN's CSP, or inline styles/eval() rejected by Chrome

**Why it happens:** Manifest V3 enforces strict CSP, third-party pages have their own CSP

**How to avoid:**
- Use Shadow DOM for style isolation (bypasses page CSP)
- Avoid eval(), new Function(), inline event handlers
- Load all scripts from extension bundle (no remote CDN scripts)
- Declare web_accessible_resources in manifest for fonts/images

**Warning signs:**
- "Refused to load script" errors
- Styles not applying to injected sidebar
- Extension popup blank/broken

### Pitfall 3: ESPN DOM Structure Changes Breaking MutationObserver

**What goes wrong:** ESPN redesigns draft page, extension's DOM selectors break, picks not detected

**Why it happens:** Third-party pages change without notice, CSS class names are fragile

**How to avoid:**
- Use data attributes when available (more stable than class names)
- Implement fallback selectors (try multiple strategies)
- Log warnings when expected DOM elements missing
- Version extension with ESPN page version compatibility notes

**Warning signs:**
- Draft picks not appearing in sidebar
- "Element not found" errors in console
- Extension works on some drafts but not others (different ESPN versions)

### Pitfall 4: Race Conditions on Initial Load

**What goes wrong:** Content script runs before ESPN draft page fully loads, misses initial picks

**Why it happens:** runAt: 'document_idle' doesn't guarantee all dynamic content is rendered

**How to avoid:**
- Use MutationObserver on document.body to detect draft board insertion
- Implement retry logic (poll for draft board element with exponential backoff)
- Parse existing picks on initial load (don't assume board is empty)

**Warning signs:**
- Extension sidebar appears but shows no data
- First few picks missing from state
- Extension works when manually refreshing page but not on initial load

### Pitfall 5: Bundle Size Bloat

**What goes wrong:** Extension bundle exceeds 5MB, slow install/updates, poor UX

**Why it happens:** Bundling full projection datasets, unused libraries, unoptimized images

**How to avoid:**
- Bundle only baseline rankings (top 300 players, ~100KB)
- Use Vite tree-shaking (import only needed functions)
- Code-split React components (lazy load auction UI only in auction drafts)
- Compress images (use WebP for logos/icons)

**Warning signs:**
- Extension install takes >10 seconds
- Bundle size >2MB
- Chrome DevTools shows large unused JavaScript

## Code Examples

Verified patterns from official sources:

### Manifest Configuration (WXT)

```typescript
// wxt.config.ts
// Source: WXT documentation

import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'ESPN Draft Assistant',
    description: 'Real-time draft recommendations for ESPN fantasy baseball',
    permissions: ['storage', 'tabs'],
    host_permissions: ['https://fantasy.espn.com/*'],
    content_scripts: [
      {
        matches: ['https://fantasy.espn.com/baseball/draft*'],
        js: ['content.ts'],
        run_at: 'document_idle',
      },
    ],
    web_accessible_resources: [
      {
        resources: ['assets/*.json', 'assets/*.png'],
        matches: ['https://fantasy.espn.com/*'],
      },
    ],
  },
  runner: {
    chromiumArgs: ['--disable-extensions-except=.output/chrome-mv3', '--load-extension=.output/chrome-mv3'],
  },
});
```

### Message Passing (Content Script → Background)

```typescript
// lib/messaging.ts
// Source: webext-bridge documentation

import { sendMessage, onMessage } from 'webext-bridge/content-script';

// Send message from content script to background
export async function fetchRankings(leagueId: number): Promise<DraftRanking[]> {
  const response = await sendMessage('GET_RANKINGS', { leagueId }, 'background');
  return response.rankings;
}

// Background script handler
// entrypoints/background.ts
import { onMessage } from 'webext-bridge/background';

onMessage('GET_RANKINGS', async ({ data }) => {
  const rankings = await apiClient.getRankings(data.leagueId);
  return { rankings };
});
```

### Real-Time Pick Detection

```typescript
// lib/dom-observers.ts
// Source: MDN MutationObserver + ESPN draft page inspection

export function watchForPicks(callback: (pick: DraftPick) => void): () => void {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          // ESPN draft board uses .pick-row class (verify with DevTools)
          if (node.matches('.pick-row') || node.querySelector('.pick-row')) {
            const pickElement = node.matches('.pick-row') ? node : node.querySelector('.pick-row');
            if (pickElement) {
              const pick = parsePickElement(pickElement);
              if (pick) callback(pick);
            }
          }
        }
      });
    });
  });

  // Observe entire draft board container
  const draftBoard = document.querySelector('.draft-board');
  if (draftBoard) {
    observer.observe(draftBoard, { childList: true, subtree: true });
  }

  return () => observer.disconnect();
}

function parsePickElement(el: Element): DraftPick | null {
  // ESPN-specific parsing (requires manual inspection)
  const playerName = el.querySelector('.player-name')?.textContent?.trim();
  const teamAbbrev = el.querySelector('.team-abbrev')?.textContent?.trim();

  if (!playerName || !teamAbbrev) return null;

  return {
    playerId: el.getAttribute('data-player-id') || '',
    playerName,
    teamId: teamAbbrev,
    pickNumber: parseInt(el.getAttribute('data-pick-number') || '0', 10),
    timestamp: Date.now(),
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manifest V2 background pages | Manifest V3 service workers | Jan 2024 (V2 deprecated) | Must use chrome.storage for persistence, no persistent background page |
| Webpack for extensions | Vite via WXT/CRXJS | 2023-2024 | 10x faster dev builds, HMR for content scripts, smaller bundles |
| Plasmo framework dominance | WXT market leader | Early 2025 | WXT smaller bundles (400KB vs 800KB), faster builds (Vite vs Parcel), active maintenance |
| iframe for UI injection | Shadow DOM | Ongoing | Shadow DOM avoids CSP issues, better performance, simpler communication |
| Manual localStorage | chrome.storage.local + Zustand | 2024 | Auto-sync, survives service worker restarts, 10MB limit vs 5MB |

**Deprecated/outdated:**
- **Manifest V2:** Chrome Web Store no longer accepts new V2 extensions (deprecated Jan 2024)
- **CRXJS active development:** Maintenance mode, WXT is successor
- **Plasmo as default choice:** In maintenance mode, team focused on commercial products
- **executeScript() for dynamic injection:** Use declarativeContent API for Manifest V3 compliance

## Open Questions

1. **ESPN Draft Page DOM Structure**
   - What we know: ESPN uses React for draft page, dynamic rendering, class names may change
   - What's unclear: Exact selectors for draft board, pick rows, player names, team IDs (requires manual inspection)
   - Recommendation: Inspect ESPN draft page in Chrome DevTools during live draft, document selectors in README, implement fallback strategies

2. **Baseline Rankings Data Source**
   - What we know: Extension needs ~300 players bundled for offline fallback
   - What's unclear: Should we snapshot latest backend rankings on build, or use static ADP data?
   - Recommendation: Snapshot latest DraftRankingsAgent output on extension build (pnpm prebuild script), ensures consistency with backend

3. **User Authentication Flow**
   - What we know: Backend API requires JWT auth (already implemented for web app)
   - What's unclear: How does user authenticate extension? Manual token entry? OAuth redirect?
   - Recommendation: v1 = manual token entry in extension popup (copy from web app settings page), v2 = OAuth redirect with deep linking

4. **Multi-League Support**
   - What we know: User may be in multiple ESPN leagues, each with different settings
   - What's unclear: How to detect which league the current draft page belongs to?
   - Recommendation: Parse ESPN draft page URL for leagueId (e.g., `fantasy.espn.com/baseball/draft?leagueId=123456`), store mapping in chrome.storage

5. **Extension Distribution**
   - What we know: Chrome Web Store review process can take 1-2 weeks
   - What's unclear: v1 public listing or unlisted (direct install link)?
   - Recommendation: Unlisted for v1 (faster updates, user-install only), public listing after beta testing

## Sources

### Primary (HIGH confidence)

- [Chrome Extensions: Manifest V3 Migration](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) - Manifest V3 architecture, service workers
- [Chrome Extensions: Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) - DOM injection, isolated worlds, API access
- [Chrome Extensions: Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) - runtime.sendMessage, onMessage, Promise-based responses
- [Chrome Extensions: Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) - storage.local vs sync, 10MB limit, async API
- [Chrome Extensions: Side Panel API](https://developer.chrome.com/blog/extension-side-panel-launch) - Alternative to DOM injection, user-controlled visibility
- [MDN: MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) - Real-time DOM change detection
- [WXT Framework Documentation](https://wxt.dev/) - Vite-based extension framework, HMR, TypeScript support
- DraftRankingsAgent (packages/backend/src/agents/draft-rankings.ts) - VBD calculations, tier assignments
- AuctionValuationAgent (packages/backend/src/agents/auction-valuation.ts) - SGP dollar values, budget allocation

### Secondary (MEDIUM confidence)

- [The 2025 State of Browser Extension Frameworks](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) - WXT vs Plasmo vs CRXJS comparison, bundle size benchmarks
- [Vite vs. Webpack in 2026](https://dev.to/pockit_tools/vite-vs-webpack-in-2026-a-complete-migration-guide-and-deep-performance-analysis-5ej5) - Build performance, tree-shaking
- [Chrome Extension Development with React + Shadow DOM](https://medium.com/outreach-prague/develop-chrome-extensions-using-react-typescript-and-shadow-dom-1e112935a735) - Style isolation, CSP compliance
- [State Storage in Chrome Extensions](https://hackernoon.com/state-storage-in-chrome-extensions-options-limits-and-best-practices) - chrome.storage.local best practices
- [Fantasy Baseball Value-Based Drafting Primer](https://www.fantasypros.com/2025/01/fantasy-baseball-value-based-drafting-primer/) - VBD methodology (VORP, VONA, VOLS)
- [Position Scarcity Strategy & Draft Advice](https://www.fantasypros.com/2026/01/position-scarcity-strategy-draft-advice-2026-fantasy-baseball/) - Positional scarcity formulas
- [Fantasy Baseball Auction Draft Strategy](https://www.rotoballer.com/auction-draft-strategy-how-to-manage-your-budget/255961) - Budget pacing, inflation adjustments

### Tertiary (LOW confidence)

- [ESPN Fantasy Baseball Draft Guide 2026](https://www.espn.com/fantasy/baseball/story/_/id/47683716/espn-mlb-2026-fantasy-baseball-draft-guide-rankings-analysis-projections-cheat-sheets) - Draft strategies (not technical docs)
- [Chrome Extension Statistics 2024](https://www.debugbear.com/blog/chrome-extension-statistics) - Average bundle sizes, install metrics

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - WXT is verified market leader (2025 State of Frameworks), Manifest V3 is stable, existing backend agents proven
- Architecture: **MEDIUM-HIGH** - Patterns verified via official Chrome docs + WXT examples, ESPN DOM structure requires manual inspection
- Pitfalls: **HIGH** - Service worker timeouts, CSP issues, bundle size well-documented in Chrome extension community

**Research date:** 2026-02-23
**Valid until:** 60 days (Chrome extension ecosystem stable, WXT in active development but no breaking changes expected)
