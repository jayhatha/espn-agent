# ESPN Draft Assistant Chrome Extension

Chrome extension that overlays ESPN's live draft pages with real-time player recommendations, roster tracking, and value analysis for both snake and auction drafts.

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

The extension requires connection to the ESPN Agent backend API:

1. Start the backend server (default: `http://localhost:3001`)
2. Click the extension icon in Chrome toolbar
3. In the popup:
   - Enter your backend URL (e.g., `http://localhost:3001`)
   - Copy your auth token from the web app Settings page
   - Paste the token and click "Save Settings"

The extension will now use backend rankings when available, falling back to bundled baseline rankings if the backend is unreachable.

## Usage

### During Draft

1. Navigate to your ESPN draft page: `https://fantasy.espn.com/baseball/draft?leagueId=<your-league-id>`
2. The extension will automatically inject a sidebar with draft recommendations
3. As picks are made, the extension updates recommendations in real-time
4. Draft state persists across page refreshes via `chrome.storage.local`

### Snake Draft

- View Best Player Available (BPA) recommendations
- See pair recommendations when it's your turn (top 2 picks)
- Track your roster composition

### Auction Draft

- View dollar value recommendations for players
- Track budget pacing (spend vs remaining picks)
- See overpay/underpay indicators

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

### Files

- `entrypoints/background.ts` - Service worker for message routing
- `entrypoints/popup/` - Extension popup for settings (React)
- `entrypoints/content.css` - Styles injected into Shadow DOM
- `lib/api-client.ts` - Backend API client with fallback to baseline data
- `lib/draft-state.ts` - Zustand store for draft state management
- `assets/baseline-rankings.json` - Bundled fallback rankings (25 players)
- `wxt.config.ts` - WXT framework configuration

### Data Flow

1. Content script detects ESPN draft page
2. Injects Shadow DOM sidebar with draft recommendations
3. MutationObserver watches for draft picks (DOM changes)
4. On pick detected, updates Zustand store
5. Store triggers re-render with updated recommendations
6. Background worker fetches rankings from backend (or uses bundled fallback)

## Tech Stack

- **Framework**: [WXT](https://wxt.dev/) - Next-gen web extension framework
- **UI**: React 18 + Tailwind CSS
- **State**: Zustand with chrome.storage.local persistence
- **Build**: Vite (via WXT)
- **Manifest**: V3

## Future Enhancements

- Pre-draft ranking overrides (manual player adjustments)
- ADP (Average Draft Position) display
- Pick countdown timer
- Trade value chart integration
- Mock draft simulation mode
