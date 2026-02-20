---
phase: 03-core-dashboard-recommendations
plan: 02
subsystem: frontend-ui
tags: [ui-components, espn-integration, user-experience]
dependency_graph:
  requires: [league-status-api]
  provides: [espn-deep-links, action-items-component]
  affects: [waiver-page, trade-page]
tech_stack:
  added: [espn-links-utility]
  patterns: [deep-linking, external-navigation]
key_files:
  created:
    - packages/frontend/src/lib/espn-links.ts
    - packages/frontend/src/components/league/ActionItemsList.tsx
  modified:
    - packages/frontend/src/app/leagues/[id]/waivers/page.tsx
    - packages/frontend/src/app/leagues/[id]/trades/page.tsx
decisions: []
metrics:
  duration_minutes: 2
  completed_at: "2026-02-20T06:12:23Z"
  task_count: 2
  file_count: 4
---

# Phase 03 Plan 02: ESPN Deep Links & Action Items Summary

ESPN deep link integration enabling one-click navigation from recommendations to ESPN Fantasy Baseball web app.

## What Was Built

**ESPN Link Utility** (`espn-links.ts`):
- Five URL generator functions covering all major ESPN Fantasy Baseball sections
- League, transactions, free agents, trade, and team URL builders
- All functions accept leagueId and season, generating properly formatted ESPN URLs
- Inline documentation noting URLs are inferred from ESPN web app behavior (not officially documented)

**ActionItemsList Component** (`ActionItemsList.tsx`):
- Generic action items display component for waiver and trade recommendations
- Priority-based visual hierarchy (high=red border, medium=yellow, low=green)
- Renders type badge (WAIVER/TRADE), impact value, title, description
- Dual action buttons: "Analyze" (internal link) and "ESPN" (external deep link with icon)
- Empty state with trophy icon when no recommendations exist
- Configurable maxItems prop with "N more recommendations..." overflow indicator
- Fully responsive design with flex layout adjustments for mobile

**Waiver Page Enhancements**:
- Added `getESPNFreeAgentsUrl` import
- Query league status for espnLeagueId and season (cached by TanStack Query)
- "Add on ESPN" button on each AI recommendation card (green, external link icon)
- "View on ESPN" link on manual evaluation results
- Both links open ESPN free agent page in new tab with rel="noopener noreferrer"

**Trade Page Enhancements**:
- Added `getESPNTradeUrl` import
- Query league status for espnLeagueId and season (cached)
- "Propose on ESPN" button on each AI trade suggestion card (purple, external link icon)
- "Propose on ESPN" link on trade analysis result section
- Both links open ESPN trade page in new tab with rel="noopener noreferrer"

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create ESPN deep link utility and ActionItemsList component | 87a4da3 | espn-links.ts, ActionItemsList.tsx |
| 2 | Add ESPN deep links to waiver and trade pages | f131b1b | waivers/page.tsx, trades/page.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Implementation Notes

**League Status Query Pattern**:
Both waiver and trade pages now query league status to extract `espn_league_id` and `season`. This query is cached by TanStack Query from the league detail page, so it doesn't cause additional network requests in normal navigation flows.

**Conditional Rendering**:
ESPN links only render when `espnLeagueId` and `season` are available. This gracefully handles edge cases where league data might not be loaded yet.

**External Link Security**:
All ESPN links use `target="_blank"` with `rel="noopener noreferrer"` to prevent potential security issues with window.opener access.

**Inline SVG Icons**:
External link icons are inline SVG (not separate components) per the established pattern of keeping simple SVG inline for 4-line icons.

**Button Styling Consistency**:
- Waiver "Add on ESPN" buttons: green (bg-green-600)
- Trade "Propose on ESPN" buttons: purple (bg-purple-600)
- Both use hover states and shadow-md for visual feedback

## User Impact

**Time Savings**: Users can now click directly from AI recommendations to ESPN, eliminating manual navigation (league page → transactions → free agents). Estimated 30-60 seconds saved per waiver claim.

**Reduced Friction**: One-click action buttons remove the mental overhead of "how do I act on this recommendation?" The path from insight to action is now explicit.

**Trust Building**: Providing ESPN links demonstrates the tool's role as a recommendation engine (not trying to replace ESPN), which aligns with user expectations for read-only analysis.

## Verification

✅ TypeScript compilation passes with no errors
✅ espn-links.ts exports 5 URL generation functions
✅ ActionItemsList renders with priority coloring and dual action buttons
✅ Waiver page shows "Add on ESPN" links on AI recommendations
✅ Trade page shows "Propose on ESPN" links on AI suggestions and analysis results
✅ All ESPN links open in new tabs with rel="noopener noreferrer"
✅ League status query uses cached data (no extra network calls)

## Next Steps

- **Phase 03 Plan 03**: Integrate ActionItemsList into league dashboard overview page
- **Future Enhancement**: Consider player-specific deep links (e.g., ESPN player profile pages) when individual player context is available
- **Future Enhancement**: Track ESPN link click-through rates to measure feature adoption

## Self-Check: PASSED

✅ espn-links.ts exists and exports URL generators
✅ ActionItemsList.tsx exists with 180+ lines
✅ waivers/page.tsx modified with ESPN links
✅ trades/page.tsx modified with ESPN links
✅ Commit 87a4da3 exists (Task 1)
✅ Commit f131b1b exists (Task 2)
