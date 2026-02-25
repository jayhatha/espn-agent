# Phase 11: Draft Assistant Enhancements - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the draft assistant extension with:
1. Automated player pool synchronization from ESPN
2. Value-based recommendations (identifying bargain players vs overpays)
3. Refactored projection architecture that works across any league configuration (league-agnostic)
4. Fixed refresh functionality

This phase improves existing draft assistant features. New draft modes or capabilities belong in other phases.

</domain>

<decisions>
## Implementation Decisions

### Projection Architecture
- **League config source**: Auto-detect from ESPN draft page DOM (parse league settings, categories, roster slots)
- **Detection fallback**: Use standard 5x5 roto defaults + show warning banner if auto-detection fails
- **API endpoint**: Claude's discretion — choose between generic POST endpoint with config in body vs league-specific endpoint
- **Parameter design**: Claude's discretion — full config each time vs minimal + config ID pattern

### UI Refresh Behavior
- **Refresh scope**: Rankings and projections only (keep league config cached, don't re-detect)
- **Refresh trigger**: Auto-refresh after each pick detection (not manual-only or time-based)
- **Loading state**: Claude's discretion — choose loading UI pattern (spinner, banner, skeleton)
- **Error handling**: Automatic retry on failure (2-3 retries with exponential backoff), then keep stale data

### Value Detection Logic
- **Value definition**: Format-aware — snake drafts use ADP delta, auction drafts use price delta
- **Thresholds**: Moderate (clear value) — Snake: 10+ ADP positions better, Auction: 15%+ discount
- **Display approach**: Color-code players by value degree (how much of a steal or overpay)
- **Color scheme**: Red/yellow/green scale — red = overpay, yellow = fair value, green = steal

### Player Pool Sync Strategy
- **Sync location**: Backend cron job (not extension-side) — syncs ESPN player data to shared database table
- **Shared table**: Non-league-specific data (stats, ESPN player ID, positions, rostered%) used across application
- **Sync frequency**: Once daily at 4 AM (after ESPN updates, before draft times)
- **Data synced**: Core + current stats — ESPN ID, name, team, positions, rostered%, current season counting stats
- **Error handling**: Claude's discretion — choose between keep stale, retry with backoff, or alert admin

### Claude's Discretion
- Exact API endpoint design for draft projected standings
- Parameter optimization (full config vs config ID pattern)
- Loading state UI implementation
- Player pool sync error handling and monitoring strategy

</decisions>

<specifics>
## Specific Ideas

- "Should update potentially changed values after each new pick" — refresh triggered by pick detection, not user action
- "This player pool will be used throughout the application, so we'll need current player info daily" — justifies daily sync schedule
- Shared player table stores non-league-specific data that multiple features can reference

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-draft-assistant-enhancements-player-pool-sync-value-detection-and-league-agnostic-projections*
*Context gathered: 2026-02-25*
