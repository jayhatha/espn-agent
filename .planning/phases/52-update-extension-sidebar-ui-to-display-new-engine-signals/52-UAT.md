---
status: testing
phase: 52-update-extension-sidebar-ui-to-display-new-engine-signals
source: 52-01-SUMMARY.md, 52-02-SUMMARY.md, 52-03-SUMMARY.md
started: 2026-03-16T19:00:00Z
updated: 2026-03-16T19:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Dark Mode Rendering
expected: |
  Sidebar background is dark (#181b1f). Panels/cards are slightly lighter (#22252b). Text is light (#d9dde6). No white backgrounds visible in any auction sidebar section. Overall Grafana dashboard feel.
awaiting: user response

## Tests

### 1. Dark Mode Rendering
expected: Sidebar background is dark (#181b1f). Panels/cards are slightly lighter (#22252b). Text is light (#d9dde6). No white backgrounds visible in any auction sidebar section. Overall Grafana dashboard feel.
result: [pending]

### 2. Header — Budget & Value Captured
expected: Header shows league info, remaining budget as large number (e.g., "$260"), and a value captured running total ("+$X" in green or "-$X" in red). Roster count also visible.
result: [pending]

### 3. Auto-Pilot Defaults ON
expected: Auto-pilot toggle is ON by default when opening a fresh draft session. No hit/pitch split slider visible anywhere.
result: [pending]

### 4. Signal Strip — 4 Badges
expected: Below the bid verdict area, a compact row of 4 badges: (1) "NORMAL" green or "ENDGAME" red badge — always visible, (2) inflation band badge (OVERSPEND/NEUTRAL/BUY WINDOW/STRONG VALUE) with red/gray/green/blue colors, (3) "HIT XX%" budget split, (4) "SP X/Y" tier count.
result: [pending]

### 5. Endgame Badge State Change
expected: When budget drops to $20 or below, the endgame badge switches from green "NORMAL" to red "ENDGAME".
result: [pending]

### 6. Nominated Player Display
expected: When a player is nominated, shows: player name, position, current bid amount, market value from CSV data, and a tier badge (anchor/core/value). Does NOT show: FG value, FG vs market badge, external rank, or "(live)" tag.
result: [pending]

### 7. Bid Verdict Card
expected: Shows BID $X (green/amber border) or PASS (red border) with max bid amount and expected market price. No narrator rationale text below the verdict.
result: [pending]

### 8. Next Nominee Display
expected: Shows the next player to nominate with a strategy tag badge ("Budget Drain", "Own Target", or "Overpriced"). When auto-pilot is actively nominating, shows "Nominating..." with a pulse animation.
result: [pending]

### 9. Category Heatmap — Bars & Toggle
expected: Horizontal color bars for each scoring category (HR, RBI, SB, OPS, R, W, SV, K, ERA, WHIP) plus overall rank. Colors range green (top ranks) to red (bottom ranks). Clicking/tapping toggles between showing rank numbers and projected stat totals. Always visible (not collapsible).
result: [pending]

### 10. Position Supply Heatmap
expected: Grid showing each position (C, 1B, 2B, 3B, SS, OF, SP, RP) with a bar and count (e.g., "3/15") showing how many top players at that position have been drafted. Bar color changes based on depletion (green < 50%, yellow 50-75%, red > 75%).
result: [pending]

### 11. Ideal Roster — Full 28 Slots
expected: Full roster list showing all 28 slots (including bench) with slot label, rank badge, tier badge (anchor/core/value/drafted), player name, and dollar amount. Dark mode styling.
result: [pending]

### 12. Auction Recommendations — Top 10
expected: Player recommendation list shows only top 10 players (not 50). Position filter buttons work. Dark mode styling on filter buttons and player cards.
result: [pending]

### 13. Removed Sections Not Visible
expected: These sections are NOT visible anywhere in the auction sidebar: AI Narrator/Advisor, Budget Pacing, Position Scarcity Alerts, Draft Targets, full Nomination Strategy list.
result: [pending]

## Summary

total: 13
passed: 0
issues: 0
pending: 13
skipped: 0

## Gaps

[none yet]
