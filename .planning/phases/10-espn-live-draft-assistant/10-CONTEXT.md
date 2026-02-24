# Phase 10: ESPN Live Draft Assistant - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time draft assistance during ESPN fantasy baseball drafts. Chrome extension that overlays ESPN's draft page, providing player recommendations, value analysis, and roster tracking throughout the draft. Supports both snake and auction formats with format-specific strategy guidance.

</domain>

<decisions>
## Implementation Decisions

### Architecture: Chrome Extension
- **Chrome extension**, not a web app page — overlays ESPN draft page for seamless UX
- Reads ESPN draft board DOM directly (no separate tab switching)
- Extension communicates with existing backend API for projections and advanced recommendations
- Different architecture from rest of app (requires manifest, content scripts, etc.)

### Draft Mode Support
- Support both **snake and auction** formats
- **Auction strategy:** Full support including budget pacing, value targets, nomination suggestions, optimal spend distribution
- **Snake draft turn handling:** Pair recommendations at the turn (show optimal player pairs for back-to-back picks accounting for both positions)
- **Redraft only** for v1 — keeper/dynasty leagues are future phase

### Draft State Tracking
- **Real-time updates:** MutationObserver on draft board to detect picks as they appear in DOM
- **Backend integration:** Hybrid approach
  - Basic rankings bundled in extension (fast initial load, works offline)
  - Advanced recommendations from backend API (rich features when connected)
- **State persistence:** Full draft state saved to `chrome.storage.local` (persists across browser restarts and page refreshes)
  - **Technical upgrade from original localStorage decision:** chrome.storage.local is the Manifest V3 best practice for extensions (survives service worker restarts, has 10MB quota vs 5MB, better cross-context sync, API-based vs synchronous access). This is a technical implementation upgrade that preserves the user intent of persistent state.

### Recommendation Strategy
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

### Information Display
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
- chrome.storage.local schema and sync logic (note: using chrome.storage.local instead of localStorage per technical best practice for Manifest V3 extensions)
- Sidebar positioning (left vs right) based on ESPN page layout
- Specific scarcity multipliers and value calculation weights

</decisions>

<specifics>
## Specific Ideas

- Chrome extension provides best UX — users stay on ESPN draft page, no tab switching
- Running team projections crucial for strategic drafting — see where your roster stands in real-time
- Overpay/underpay tracking adds competitive intelligence — see which teams are drafting efficiently
- League-specific stat display ensures recommendations match actual scoring system
- Pair recommendations at the turn (snake) add real strategic value for back-to-back picks

</specifics>

<deferred>
## Deferred Ideas

- Keeper/dynasty league support — Future phase (requires multi-year projections, contract values, prospect upside)
- Trade offers during draft — Out of scope for draft assistant

</deferred>

---

*Phase: 10-espn-live-draft-assistant*
*Context gathered: 2026-02-23*
