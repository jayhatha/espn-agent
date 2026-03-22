# Phase 63 Context: Mobile Draft Companion

## Decisions (LOCKED)

### Layout
1. **Match the extension sidebar's DraftBoardView layout.** Same cheatsheet-style table: position groups as headers, player rows with FG$/tier badges, drafted players in green, available targets below. Expandable/collapsible.

2. **Include BidVerdict panel.** Show the BID/PASS verdict with pass reason, EV pipeline debug (FG$, ASV, EV, priority score, player tags), and cap chain.

3. **Show budget + surplus in header.** Same "$X left · +$Y banked" format.

### Controls
4. **Manual bid button.** Tap to place a bid at the current price + $1. Only enabled when a player is nominated and price is below our maxBid.

5. **Manual nominate button.** Tap to nominate a player from our board. Show a quick-pick list of available board players sorted by priority score. Tapping a player nominates them on ESPN.

6. **Auto-bid toggle.** Same toggle as extension sidebar — enable/disable auto-bidding from mobile.

### Connection
7. **WebSocket to extension.** The mobile page already connects via WebSocket (phase 41). Reuse that channel — extension sends engine signals, mobile sends bid/nominate commands back.

### Design
8. **Dark mode matching grafana theme.** Same bg-grafana-panel, border-grafana-border, text colors. Mobile-optimized touch targets (min 44px tap areas).

9. **Single scrollable page.** Top: nominated player + verdict. Middle: draft board. Bottom: controls.

## Claude's Discretion

- Whether to reuse existing mobile components or rebuild from scratch
- How to handle the nominate player picker (modal, dropdown, inline list)
- Whether bid/nominate commands go through the auto-bid controller or directly to ESPN DOM

## Deferred Ideas

- Category heatmap on mobile (too dense for phone screen)
- Opponent tracking on mobile
- Full roster view on mobile
