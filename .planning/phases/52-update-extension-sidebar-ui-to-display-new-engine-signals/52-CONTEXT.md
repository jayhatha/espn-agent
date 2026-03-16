# Phase 52: Extension Sidebar UI Update - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Display all v5.0 engine signals in the Chrome extension auction draft sidebar: endgame mode indicator, inflation band, budget allocation, SP tier progress, category targets, nomination reason. Includes a visual redesign to Grafana-inspired dark mode and removal of unused UI sections.

</domain>

<decisions>
## Implementation Decisions

### Cleanup / Removals
- Remove snake draft UI entirely (preserve code for future version, don't delete files — just don't render)
- Remove AI Narrator section completely
- Remove bid vs pass decision comparison from win probability
- Remove draft targets section
- Remove full nomination strategy list (replace with single "next nominee" display)
- Remove position scarcity alerts section
- Remove budget pacing section entirely (engine handles internally; $remaining already in header)
- Remove hit/pitch budget split slider — default to 75% hitters / 25% pitchers in nomination strategy
- Reduce auction recommendations from 50 players to top 10
- Always use preloaded ESPN values from Live Draft Trends page CSV — stop trying to detect/scrape from ESPN DOM

### Section Order (top to bottom)
1. **Header** — League info + $remaining + value captured running total
2. **Auto-pilot toggle** — Moved to top, defaults to ON
3. **Nominated player + bid verdict** — Player name, position, current bid, market value, tier badge; verdict shows BID $X / PASS + max bid + market price (green/amber/red)
4. **Signal strip** — Compact badge row: endgame mode (NORMAL green / ENDGAME red, always visible), inflation band, budget split (75/25 tracking), SP tier count
5. **Next nominee** — Single player with strategy tag (Budget Drain, Own Target, Overpriced); shows active "Nominating..." state when auto-pilot is acting
6. **Category heatmap** — Horizontal bar per category (HR, RBI, SB, OPS, R, W, SV, K, ERA, WHIP) + overall rank at end. Color = green/yellow/orange/red gradient across 13 teams. Click toggles between projected rank points and projected stat totals. Always visible (not collapsible). Replaces separate win probability and category targets sections.
7. **Position supply heatmap** — Shows how many of the top players at each position have been drafted (top 15 per position, top 50 for OF, top 30 for SP). Placed near ideal roster.
8. **Ideal roster** — Full 28-slot list (including bench) with slot, rank badge, tier badge, player name, dollar amount
9. **Auction recommendations** — Top 10 players with position filters

### Visual Design — Grafana-Inspired Dark Mode
- Pure Grafana dark palette: #181b1f background, #22252b panels
- Dashboard panels: dark cards with thin borders, metric values in large font, subtle grids
- Stat widgets: big number displays with sparklines, colored thresholds, minimal chrome
- Heatmap/gauge style: color-saturated data on dark canvas
- Bright data on dark background throughout

### Signal Strip Colors
- Endgame: Green badge = NORMAL, Red badge = ENDGAME (always shown, never hidden)
- Inflation bands: Red (<1.00 overspending), Gray (1.00-1.05 neutral), Green (1.05-1.15 buying window), Blue (>1.15 strong value)
- Bid verdict: Green (BID), Amber (BID but risky), Red (PASS) — unchanged

### Category Heatmap Colors
- Green/yellow/orange/red gradient based on projected rank across 13 teams
- Green = top ranks, Red = bottom ranks

### Nominated Player Display
- Show: player name, position, current bid, market value, tier badge
- Remove: FG value, FG vs market badge, external rank

### Nomination Reason Display
- Single "next nominee" display instead of full list
- Strategy tag only: "Budget Drain", "Own Target", "Overpriced" — no additional context
- Active state when auto-pilot is nominating: "Nominating: [Player Name]" with loading indicator

### Claude's Discretion
- Exact Grafana color values for secondary/accent colors
- Sparkline implementation details
- Loading skeleton design
- Error state handling
- Exact spacing and typography within Grafana aesthetic
- Position supply heatmap visual format (bars vs badges vs grid)
- How to handle edge cases (no data loaded, mid-draft reconnection)

</decisions>

<specifics>
## Specific Ideas

- Grafana dashboard aesthetic: dark panels, bright data, gauges, stat widgets — "all three" aspects
- Category heatmap: click to toggle between rank points view and stat totals view
- Value captured: running total in header area, always visible (like a Grafana big number widget)
- Position supply: top 15 per position, top 50 for OF, top 30 for SP as the pool sizes

</specifics>

<deferred>
## Deferred Ideas

- Simplify auto-nominator to just nominate the next best player when it's our turn (no queuing) — separate phase
- Fix bug where "Nominate Player" button isn't being clicked when it's our turn — separate phase
- Snake draft UI restoration — future version

</deferred>

---

*Phase: 52-update-extension-sidebar-ui-to-display-new-engine-signals*
*Context gathered: 2026-03-16*
