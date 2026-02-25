# ESPN Draft Assistant Chrome Extension

Chrome extension that overlays ESPN's live draft pages with real-time player recommendations, roster tracking, and value analysis for both snake and auction drafts.

**Status:** ✅ Core features complete (v0.1.0)
- Snake draft BPA recommendations with pair analysis
- Auction draft budget pacing and value indicators
- Pick value tracking for competitive intelligence
- Shadow DOM UI with style isolation
- 14 components, 187 kB bundle size

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Chrome browser

### Setup

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development mode with HMR
cd packages/extension
pnpm dev
```

Development mode starts the WXT dev server with hot module reloading. Changes to code will automatically rebuild and reload the extension.

### Building

```bash
# Production build for Chrome
pnpm build

# Build for Firefox
pnpm build:firefox

# Create distributable ZIP for Chrome Web Store
pnpm zip
```

Build output is in `.output/chrome-mv3/` (or `.output/firefox-mv3/` for Firefox).

## Installation

### Chrome Developer Mode

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

### Backend Integration

The extension can optionally connect to the ESPN Agent backend API for custom projections:

**Setup Instructions:**

1. **Start the backend server**
   ```bash
   # From monorepo root, using Docker
   ./docker.sh dev-up

   # Or manually (requires PostgreSQL + Redis)
   cd packages/backend && pnpm dev
   ```
   Backend will run at `http://localhost:3001`

2. **Configure extension**
   - Click the extension icon in Chrome toolbar
   - In the popup settings:
     - Enter Backend URL: `http://localhost:3001`
     - API Token field: Leave empty (session-based auth used instead)
     - Click "Save Settings"

3. **Authenticate** (if using backend)
   - Navigate to `http://localhost:3001` in your browser
   - Sign in with Google OAuth
   - Extension will inherit your browser session cookies automatically

**API Token Generation (Coming Soon)**

A proper API token system is planned for future releases. Current implementation:
- Extension uses session-based authentication via browser cookies
- Works for local development (same-origin requests)
- Production deployment will require API tokens for security

The extension will use backend rankings when available, falling back to bundled baseline rankings if the backend is unreachable.

## Usage

### During Draft

1. Navigate to your ESPN draft page: `https://fantasy.espn.com/baseball/draft?leagueId=<your-league-id>`
2. The extension will automatically inject a sidebar with draft recommendations
3. As picks are made, the extension updates recommendations in real-time
4. Draft state persists across page refreshes via `chrome.storage.local`

### Snake Draft Features

- **Best Player Available (BPA)** - VBD-ranked player recommendations
- **Position Filtering** - Filter by C, 1B, 2B, 3B, SS, OF, SP, RP
- **Positional Needs** - Toggle to show only thin positions (<2 players)
- **Snake Turn Pairs** - Top 3 pair recommendations when it's your turn (back-to-back picks)
- **Roster Summary** - Position breakdown and projected category totals
- **Pick Value Tracking** - See which teams are drafting efficiently vs reaching

### Auction Draft Features

- **Budget Pacing Tracker** - Real-time status (ahead/on-track/behind)
- **Dollar Value Recommendations** - Players sorted by recommended bid value
- **Recommended Max Bid** - 40% of remaining budget calculation
- **Affordability Indicators** - Value badges (⭐) and over-budget warnings
- **Real-time Budget Updates** - Remaining budget and average per player

### Competitive Intelligence

- **Pick Value Analysis** - Overpay/underpay indicators for all picks (not just your team)
- **Team Efficiency Leaderboard** - Top 5 teams ranked by average pick value
- **Recent Picks Feed** - Last 10 picks with value labels (e.g., "5-pick value", "8-pick reach")

## Troubleshooting

### Extension not loading

- Check the browser console for errors (F12 → Console)
- Verify the extension is enabled in `chrome://extensions`
- Ensure you're on an ESPN draft page (not mock draft preview)

### No recommendations appearing

- Check the background service worker logs:
  1. Go to `chrome://extensions`
  2. Find "ESPN Draft Assistant"
  3. Click "service worker" link
  4. Check console for errors
- Verify backend connection in extension popup
- Check that baseline rankings are bundled (should be 25+ players in `assets/baseline-rankings.json`)

### Extension popup won't save settings

- Check console for storage permission errors
- Verify the extension has `storage` permission in `manifest.json`
- Try clearing extension storage: `chrome://extensions` → ESPN Draft Assistant → "Remove" → Reinstall

## Architecture

### Components

**Shared**
- `components/DraftSidebar.tsx` - Main container with conditional rendering (snake vs auction)

**Snake Draft**
- `components/DraftRecommendations.tsx` - BPA list with filters
- `components/PlayerCard.tsx` - Individual player display with stats
- `components/SnakeTurnPairs.tsx` - Pair recommendations at draft turns
- `components/RosterSummary.tsx` - Position breakdown and category totals

**Auction Draft**
- `components/AuctionRecommendations.tsx` - Dollar value-sorted list
- `components/AuctionPlayerCard.tsx` - Player card with bid values
- `components/AuctionBudgetTracker.tsx` - Budget pacing and recommendations

**Pick Tracking**
- `components/PickValueTracker.tsx` - Team efficiency leaderboard and recent picks

### Core Files

- `entrypoints/content.tsx` - Content script with Shadow DOM injection
- `entrypoints/background.ts` - Service worker for message routing
- `entrypoints/popup/` - Extension popup for settings (React)
- `styles/content.css` - Tailwind styles injected into Shadow DOM
- `lib/api-client.ts` - Backend API client with fallback to baseline data
- `lib/draft-state.ts` - Zustand store with chrome.storage persistence
- `lib/dom-observers.ts` - MutationObserver for ESPN draft board monitoring
- `lib/value-calculations.ts` - VBD scoring, snake pairs, auction pacing, pick value
- `assets/baseline-rankings.json` - Bundled fallback rankings
- `wxt.config.ts` - WXT framework configuration

### Data Flow

1. Content script detects ESPN draft page (URL match)
2. Parses league ID and draft format from page
3. Injects Shadow DOM sidebar (400px, fixed right)
4. Fetches rankings/auction values from backend (or uses baseline)
5. MutationObserver watches ESPN DOM for new picks
6. On pick detected → updates Zustand store → triggers re-render
7. Store persists to chrome.storage.local for cross-reload state

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) - Next-gen web extension framework
- **UI**: React 18 + Tailwind CSS
- **State**: Zustand with chrome.storage.local persistence
- **Build**: Vite (via WXT)
- **Manifest**: V3

## Future Enhancements

**UI Components (Partially Complete)**
- Pre-draft ranking overrides editor (infrastructure exists, UI pending)
- ADP display on player cards (types added, display pending)
- Pick countdown timer (logic exists, display pending)

**Draft Intelligence**
- Trade value chart integration during draft
- Mock draft simulation mode
- Historical ADP data integration
- Category scarcity analysis

**User Experience**
- Keyboard shortcuts for quick filtering
- Customizable sidebar width/position
- Audio/visual alerts for user's turn
- Draft recap and performance summary

**ESPN Integration**
- Automatic team detection (currently requires manual config)
- Roster slot requirements parsing
- League settings auto-detection
- Transaction history parsing
