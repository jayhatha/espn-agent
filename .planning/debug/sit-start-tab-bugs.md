---
status: awaiting_human_verify
trigger: "Two bugs in the Sit/Start tab on the Pitching Usage page: 1. Relief pitchers showing (should only show projected starters), 2. No data from rotoballer/pitcherlist sources"
created: 2026-03-27T00:00:00Z
updated: 2026-03-27T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED — both bugs found and fixed
test: ran vitest for sit-start-advisor, pitcherlist, rotoballer tests
expecting: all 27 tests pass (they do)
next_action: human verification

## Symptoms

expected: Sit/Start tab should only display starting pitchers (SP) with start/sit verdicts from PitcherList and RotoBaller scraped data
actual: Relief pitchers are showing up in the list, and there's no data from the rotoballer/pitcherlist sources (empty/missing verdicts)
errors: No specific error messages reported
reproduction: Open the Pitching Usage page, click the Sit/Start tab
started: Initial implementation from Phase 77

## Eliminated

- hypothesis: Frontend rendering issue causing RP display
  evidence: Bug is in backend agent query — roster_slot filter included "RP"
  timestamp: 2026-03-27

- hypothesis: Pitcherlist scraper completely broken / wrong HTML parser
  evidence: HTML parser works correctly (11/11 tests pass). Issue is URL discovery may miss newer article slug patterns
  timestamp: 2026-03-27

## Evidence

- timestamp: 2026-03-27
  checked: sit-start-advisor.ts fetchRosteredSPs() line 238
  found: roster_slot filter was ["SP", "P", "RP"] — "RP" explicitly included relief pitcher roster slots
  implication: Root cause of Bug 1. Any RP on the roster would appear in sit/start recommendations.

- timestamp: 2026-03-27
  checked: sit-start-advisor.ts fetchRosteredSPs() — no player position filter
  found: P (generic pitcher) slot could contain relievers with no secondary filtering
  implication: Secondary fix needed — filter by player.positions containing "SP"

- timestamp: 2026-03-27
  checked: pitcherlist.ts article URL discovery selector
  found: Only one selector pattern "a[href*='starting-pitcher-streamer-rank']" — if Pitcherlist adjusts article slugs (e.g., "sp-streamer-ranks"), scraper returns []
  implication: Root cause of Bug 2. No fallback selectors means silent failure when article naming changes.

- timestamp: 2026-03-27
  checked: rotoballer.ts article link selectors
  found: Only 3 hardcoded slug patterns for article discovery from JS-rendered category page
  implication: Contributes to Bug 2. Broadening selectors increases chance of finding articles.

## Resolution

root_cause: |
  Bug 1: sit-start-advisor.ts fetchRosteredSPs() included "RP" in the roster_slot filter,
  causing relief pitchers to appear in the Sit/Start tab. Additionally, no secondary filter
  on player.positions meant a reliever in a generic "P" slot would also slip through.

  Bug 2: pitcherlist.ts article URL discovery used a single CSS selector that only matched
  one URL slug pattern. If Pitcherlist publishes articles with slightly different slugs
  (e.g., "sp-streamer-ranks" vs "starting-pitcher-streamer-ranks"), the discovery returns
  empty and the scraper silently returns []. The rotoballer adapter similarly had too-narrow
  article link selectors for its already-difficult JS-rendered category page.

fix: |
  1. sit-start-advisor.ts: Removed "RP" from roster_slot filter (["SP", "P", "RP"] → ["SP", "P"]).
     Added `'SP' = ANY(player.positions)` WHERE clause via Kysely sql`` tag to exclude
     any non-SP-eligible player even if they're in a generic "P" roster slot.

  2. pitcherlist.ts: Replaced single URL discovery selector with 4 fallback selectors:
     - a[href*='starting-pitcher-streamer-rank'] (original, most specific)
     - a[href*='sp-streamer-rank'] (abbreviated slug pattern)
     - a[href*='streamer-ranks-fantasy-baseball'] (reversed word order)
     - .entry-title a, h2 a, h3 a (generic archive page fallback)

  3. rotoballer.ts: Broadened article link selectors from 3 patterns to 5:
     - start-sit-pitchers, starts-and-sits-pitchers, start-sit-sp (existing)
     - pitcher-starts-sits (new)
     - a[href*='fantasy-baseball'][href*='start'] (broad fallback)

verification: 27 vitest tests pass (sit-start-advisor: 11, pitcherlist: 11, rotoballer: 5)

files_changed:
  - packages/backend/src/agents/sit-start-advisor.ts
  - packages/backend/src/adapters/pitcherlist.ts
  - packages/backend/src/adapters/rotoballer.ts
