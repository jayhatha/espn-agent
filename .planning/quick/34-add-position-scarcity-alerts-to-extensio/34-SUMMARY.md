---
phase: quick-34
plan: 01
subsystem: ui
tags: [chrome-extension, draft, position-scarcity, zustand, react]

requires:
  - phase: 10-espn-live-draft-assistant
    provides: Extension sidebar, draft state store, position tracking
provides:
  - Position scarcity computation engine (position-scarcity.ts)
  - Scarcity alert component with critical/warning severity levels
  - My-team-needs highlighting with accent ring
affects: [extension-draft-sidebar, draft-recommendations]

tech-stack:
  added: []
  patterns: [scarcity-detection-algorithm, severity-badge-pattern]

key-files:
  created:
    - packages/extension/lib/position-scarcity.ts
    - packages/extension/components/PositionScarcityAlerts.tsx
  modified:
    - packages/extension/components/DraftSidebar.tsx

key-decisions:
  - "Top tier size = totalTeams * positionSlots (e.g., 12 teams * 1 C = top 12 catchers) for scarcity threshold"
  - "Teams not in teamRosters default to needing ALL positions (conservative assumption)"
  - "Alert only when teamsNeeding > topPlayersLeft to avoid noisy early-draft alerts"
  - "Critical severity when 0-1 elite players remain, warning otherwise"

patterns-established:
  - "Scarcity detection: compare demand (teams needing) vs supply (elite players left) per position"
  - "Severity badge: negative-* tokens for critical, warning-* tokens for warning, accent ring for user needs"

requirements-completed: []

duration: 2min
completed: 2026-03-04
---

# Quick Task 34: Position Scarcity Alerts Summary

**Real-time position scarcity alerts in draft sidebar showing elite player supply vs team demand with critical/warning severity and my-team-needs highlighting**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T18:45:04Z
- **Completed:** 2026-03-04T18:47:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created position scarcity computation engine that tracks undrafted elite players vs teams needing each position
- Built compact alert badges with critical (red) and warning (amber) severity using design system tokens
- Highlights positions the user's own team still needs with an accent ring for quick identification
- Wired into both auction and snake draft sidebar flows (after budget tracker / roster summary)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create position scarcity computation + component** - `3573f3c` (feat)

## Files Created/Modified
- `packages/extension/lib/position-scarcity.ts` - Computation engine: scarcity detection algorithm comparing top-tier player supply vs team demand per position
- `packages/extension/components/PositionScarcityAlerts.tsx` - React component rendering severity-colored badges with team demand and elite player count
- `packages/extension/components/DraftSidebar.tsx` - Wired PositionScarcityAlerts into both auction and snake draft content areas

## Decisions Made
- Top tier size = totalTeams * positionSlots (e.g., 12 teams * 1 C slot = top 12 catchers) to define "elite" threshold
- Teams not in teamRosters (haven't drafted yet) assumed to need all positions (conservative)
- Alerts only generated when teamsNeeding > topPlayersLeft to avoid noisy false positives early in draft
- Critical = 0-1 elite players left, Warning = fewer elite than teams needing
- UTIL position excluded from scarcity tracking (flex slot, not position-specific)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Scarcity alerts are live and reactive to store state changes
- Could be enhanced with configurable position targets per league settings

---
*Quick Task: 34-add-position-scarcity-alerts*
*Completed: 2026-03-04*
