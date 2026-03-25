# Phase 73: Show Current and Projected Stats for Each Player on Waivers and Roster Pages — Research

**Researched:** 2026-03-24
**Domain:** Frontend player stat display + backend API enrichment
**Confidence:** HIGH

## Summary

Phase 73 adds per-player stat rows to the waivers page (free agent list and drop-player roster) and a dedicated roster view. Both pages already receive player data from the backend with a `projections` field (`stat_components_json` from `player_projection`) but do not render any stats. The `PlayerRow` component has an unused `stats` prop slot. This phase wires the existing data through to visible UI.

Two data sources exist for player stats. **Projected rest-of-season stats** come from `player_projection.stat_components_json` and are already returned by the `/free-agents` and `/teams/:teamId/roster` endpoints as `player.projections`. **Current season to-date stats** come from `player.current_season_stats_json`, which is populated by `PlayerPoolSyncAgent` but is NOT currently returned by either endpoint — the roster endpoint selects only from `team_roster_snapshot` joined to `player` without pulling `current_season_stats_json`.

The stat display must be position-aware: hitters show counting stats (HR, R, RBI, SB) and rate stats (AVG/OBP/OPS), pitchers show ERA, WHIP, K, W, SV. The `formulas.ts` functions `calculateAVG`, `calculateOBP`, `calculateOPS`, `calculateERA`, `calculateWHIP` handle rate-stat computation from components and are already imported in shared.

Rate stats require computing from components, not directly displaying raw values. The `stat_components_json` stores AB, H, BB, HBP, SF, TB (batting) and IP, ER, HA, BBA, K (pitching) — the same components used by `formulas.ts`.

**Primary recommendation:** Extend both API endpoints to include `current_season_stats_json` from the player table, then add an expandable stats row to each player card on waivers and roster pages, with a shared `PlayerStatLine` frontend component that renders computed rates from components.

## Standard Stack

### Core (already in use — no new installs required)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@shared/formulas.ts` | local | Rate stat computation from components | Already in project — AVG, OBP, OPS, ERA, WHIP functions |
| Next.js App Router | 14 | Frontend pages | Already in use |
| TanStack Query v5 | 5.x | Data fetching | Already in use |
| Tailwind CSS | 3.x | Styling | Already in use |
| Kysely | current | DB queries | Already in use |

No new packages required for this phase.

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are additive within existing files:

```
packages/
  backend/src/api/
    recommendations.ts        # extend /free-agents and /roster endpoints
  frontend/src/
    components/league/
      PlayerRow.tsx            # extend with stat display (or create PlayerStatLine)
      PlayerStatLine.tsx       # NEW: shared stat display component
    app/leagues/[id]/
      waivers/page.tsx         # render stat lines in free agent and roster lists
```

### Pattern 1: Position-Aware Stat Column Selection

**What:** Determine whether to show hitter stats or pitcher stats based on player positions array.
**When to use:** Always, before rendering any stat line.

```typescript
// Source: project types.ts — positions[] is string[]
function isPitcher(positions: string[]): boolean {
  return positions.some(p => ["SP", "RP", "P"].includes(p));
}

// Hitter stat line: HR, R, RBI, SB, AVG, OBP (or OPS depending on league cats)
// Pitcher stat line: ERA, WHIP, K, W, SV
```

### Pattern 2: Compute Rate Stats from Components (DO NOT display raw rate values)

**What:** Always derive rates from components using `formulas.ts` functions.
**When to use:** Any time AVG, OBP, OPS, ERA, WHIP needs to be shown.

```typescript
// Source: packages/shared/src/formulas.ts
import { calculateAVG, calculateOBP, calculateOPS, calculateERA, calculateWHIP } from "@shared/formulas";

// For projected stat_components_json:
const proj = player.projections; // StatComponents from player_projection
if (proj) {
  const avg = calculateAVG(proj);         // H / AB
  const era = calculateERA(proj);         // 9 * ER / IP
  const whip = calculateWHIP(proj);       // (HA + BBA) / IP
}

// For current stats (current_season_stats_json), same approach
```

### Pattern 3: Backend — Include current_season_stats_json in Roster/Free Agent Responses

**What:** The `/roster` endpoint joins `team_roster_snapshot` + `player` but does not select `player.current_season_stats_json`. The `/free-agents` endpoint similarly omits it.
**Change required:** Add `current_season_stats_json` to the `select()` list and include it in the response shape.

```typescript
// Source: packages/backend/src/api/recommendations.ts — existing roster query
// Currently:
.select([
  "roster.player_id",
  "player.name as player_name",
  "player.mlb_team",
  "player.positions",
  "roster.roster_status",
  "roster.roster_slot",
])
// Add:
  "player.current_season_stats_json",
```

### Pattern 4: Graceful Null Handling — Stats May Be Missing

**What:** `current_season_stats_json` is null for players not synced by `PlayerPoolSyncAgent`. `projections` is null for players not in the latest projection run.
**When to use:** Always. Never assume either field is populated.

```typescript
// Display "--" for missing stats, not 0 or NaN
function formatStat(value: number | null | undefined, decimals = 0): string {
  if (value == null || isNaN(value)) return "--";
  return value.toFixed(decimals);
}
```

### Pattern 5: Collapsible Stat Row — Don't Expand the Player List by Default

**What:** The waivers page uses a dense scrollable list. A default-open stats row would double the height for every player, making the list unusable. Stats should be accessible but secondary.
**Options (Claude's discretion):**
- Expandable `<details>` per player (matches the existing category breakdown pattern on the page)
- Inline one-line stat summary (e.g., "HR: 22 R: 88 RBI: 91 SB: 12 AVG: .278") below the player name
- A separate dedicated `/roster` page (not inline in waivers)

**Recommendation:** For the waivers free-agent and drop-roster picker, use a single-line compact stat summary below the player name. For a dedicated roster page (if desired), show a full stat table. The waivers page is a selection picker — it needs quick scannability, not a stats deep-dive.

### Anti-Patterns to Avoid

- **Averaging rate stats directly:** Never average ERA or AVG across players. Always compute from components.
- **Treating pitcher positions as a whitelist only:** Some players (DH-eligible pitchers) could have both. Check `positions.some(...)` not strict equality.
- **Rendering 0.000 for missing projections:** Display "--" when IP=0 to avoid ERA=0.00 looking legitimate.
- **Fetching a new API endpoint for stats:** Current season stats live in `player.current_season_stats_json`. The roster and free-agents endpoints already query the player table — just add the column to the select.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate stat computation | Custom AVG/ERA formula | `formulas.ts` existing functions | Already battle-tested, handles division-by-zero |
| Position detection | Custom regex or string parsing | `positions.some(p => ["SP","RP","P"].includes(p))` | Simple array check — positions[] already normalized |
| Stat formatting | Per-component formatters | Single `formatStat(value, decimals)` helper | Eliminates NaN/null edge cases in one place |

## Common Pitfalls

### Pitfall 1: current_season_stats_json May Be Null for Most Players
**What goes wrong:** The `PlayerPoolSyncAgent` only syncs ESPN's top ~500 rostered players. Newly rostered fringe players or free agents far down the list may have null `current_season_stats_json`.
**Why it happens:** `player-pool-sync.ts` is a periodic job, not triggered by roster changes. A player picked up today may not be in the sync window.
**How to avoid:** Always guard with `?? null` and render "--" for null stats. Treat projected stats (from projection CSV) as the primary stat source; current stats as bonus context.
**Warning signs:** Many players showing "--" in current stats is expected and not a bug.

### Pitfall 2: stat_components_json Uses Different Keys for Pitcher Stats
**What goes wrong:** The pitcher pitching keys in WHIP calculation are `HA` (hits allowed) and `BBA` (walks allowed), not `H` and `BB`. The `calculateWHIP` function handles this via `components.HA ?? components.H` but raw key access (`proj.H`) will be wrong for pitchers.
**Why it happens:** Batters and pitchers share a JSONB column but use distinct field names for what would otherwise collide (batter `H` vs pitcher `HA`).
**How to avoid:** Always use `formulas.ts` functions for rate stats. Never directly access `proj.H` for pitchers.
**Warning signs:** WHIP showing 0 or wildly wrong values for pitchers.

### Pitfall 3: Projected Stats Are Rest-of-Season, Not Full-Season
**What goes wrong:** Displaying projected HR=22 next to current HR=8 without a label makes it ambiguous whether "22" is total or remaining.
**Why it happens:** `player_projection.stat_components_json` is the FanGraphs RoS (rest of season) projection CSV, not full-season.
**How to avoid:** Label stat columns clearly: "Proj RoS" vs "YTD". The label is important for fantasy managers making add/drop decisions.
**Warning signs:** User confusion ("this player only has 3 HR projected but it's May and he already has 8").

### Pitfall 4: IP=0 Causes ERA/WHIP Division-by-Zero
**What goes wrong:** For projected pitchers with 0 projected IP (e.g., closers with no projected IP in the CSV), `calculateERA` and `calculateWHIP` return 0, not infinity or NaN.
**Why it happens:** `formulas.ts` explicitly returns 0 when IP=0.
**How to avoid:** When ERA=0 and IP=0, display "--" not "0.00". Check `IP > 0` before displaying rate stats.
**Warning signs:** Free agents showing ERA: 0.00 — these are players with no projected IP, not pitchers with a perfect ERA.

### Pitfall 5: Free Agent Stats Are Live-Fetched Then DB-Cached
**What goes wrong:** The `/free-agents` endpoint upserts ESPN free agent data into the `player` table. But `current_season_stats_json` is populated by `PlayerPoolSyncAgent`, not by the free-agent fetch. Adding `player.current_season_stats_json` to the select will return it only if the player was previously synced.
**Why it happens:** Two separate write paths: player-pool-sync (stats) vs free-agent upsert (name/team/positions only).
**How to avoid:** Accept that most free agents will show "--" for current stats. The projected stats (from player_projection) are the higher-value data for decision-making.

## Code Examples

### Render Hitter Stat Summary (Frontend)

```typescript
// Source: packages/shared/src/formulas.ts + project conventions
function renderHitterStats(components: Record<string, number> | null, label: string) {
  if (!components) return null;
  const { HR = 0, R = 0, RBI = 0, SB = 0 } = components;
  const avg = calculateAVG(components);
  const ip = components.IP ?? 0;
  if (HR === 0 && R === 0 && RBI === 0 && ip > 0) return null; // pitcher

  return (
    <div className="text-data text-content-secondary font-mono mt-0.5">
      <span className="text-content-tertiary text-caption mr-1">{label}</span>
      HR: {HR} R: {R} RBI: {RBI} SB: {SB} AVG: {avg > 0 ? avg.toFixed(3) : "--"}
    </div>
  );
}

function renderPitcherStats(components: Record<string, number> | null, label: string) {
  if (!components) return null;
  const { W = 0, SV = 0, K = 0 } = components;
  const ip = components.IP ?? 0;
  const era = ip > 0 ? calculateERA(components) : null;
  const whip = ip > 0 ? calculateWHIP(components) : null;

  return (
    <div className="text-data text-content-secondary font-mono mt-0.5">
      <span className="text-content-tertiary text-caption mr-1">{label}</span>
      W: {W} SV: {SV} K: {K}
      {era !== null ? ` ERA: ${era.toFixed(2)}` : ""}
      {whip !== null ? ` WHIP: ${whip.toFixed(3)}` : ""}
    </div>
  );
}
```

### Backend — Adding current_season_stats_json to Roster Response

```typescript
// Source: packages/backend/src/api/recommendations.ts, line ~261
// In the GET /api/leagues/:leagueId/teams/:teamId/roster handler:
.select([
  "roster.player_id",
  "player.name as player_name",
  "player.id as espn_player_id",
  "player.mlb_team",
  "player.positions",
  "roster.roster_status",
  "roster.roster_slot",
  "player.current_season_stats_json",  // ADD THIS
])

// In the enrichedRoster map:
const enrichedRoster = roster.map((player) => ({
  playerId: player.player_id,
  espnPlayerId: player.espn_player_id,
  playerName: player.player_name,
  mlbTeam: player.mlb_team,
  positions: player.positions,
  rosterStatus: player.roster_status,
  rosterSlot: player.roster_slot,
  projections: projectionMap.get(player.player_id) || null,
  currentStats: player.current_season_stats_json || null,  // ADD THIS
}));
```

### Frontend Interface Updates

```typescript
// Update FreeAgent interface in waivers/page.tsx:
interface FreeAgent {
  playerId: number;
  espnPlayerId: number;
  playerName: string;
  mlbTeam: string | null;
  positions: string[];
  projections: Record<string, number> | null;
  currentStats: Record<string, number> | null;  // ADD
  pctOwned: number;
}

// Update RosterPlayer interface in waivers/page.tsx:
interface RosterPlayer {
  // ... existing fields ...
  projections: Record<string, number> | null;
  currentStats: Record<string, number> | null;  // ADD
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Player list shows name + position only | Player list shows stats inline | Phase 73 | Waivers page becomes a functional scouting view |
| `stat_components_json` returned but not displayed | Stats computed and rendered | Phase 73 | Managers can scan expected production without leaving the page |

**Currently present but unused:**
- `PlayerRow.tsx` has a `stats?: Record<string, number>` prop that is accepted but never rendered — the rendering logic needs to be added or the component extended.
- `player.current_season_stats_json` column exists and is populated by player-pool-sync but never surfaced to the frontend.

## Open Questions

1. **Which pages get stat display?**
   - What we know: Phase description says "waivers and roster pages". The waivers page has two modes (AI Picks + Manual Eval). The "roster page" is ambiguous — it could mean the waivers manual-eval drop list, the dashboard `_sections/RosterSection`, or a dedicated `/roster` route.
   - What's unclear: Is there a dedicated `/leagues/[id]/roster` page? The nav includes "Roster" — it currently maps to the lineup optimizer (`/lineup`). A true roster page might need creating.
   - Recommendation: Planner should define scope as (a) waivers free-agent picker list, (b) waivers drop-from-roster list, and optionally (c) a new `/roster` page if the nav entry should serve that purpose.

2. **Full-season or rest-of-season projected stats?**
   - What we know: `player_projection` stores RoS projections from FanGraphs CSV. Current season YTD stats are in `player.current_season_stats_json`.
   - What's unclear: Whether managers want to see combined (current + RoS) projected final totals, or RoS projections only.
   - Recommendation: Show RoS projections labeled "Proj RoS" and current stats labeled "YTD" as two separate lines. This matches how the data is stored and avoids confusing players with different amounts of the season completed.

3. **How many stat columns to show inline vs in expanded view?**
   - What we know: The waivers picker is already dense. Showing 8+ stats inline per player could make the list hard to scan.
   - Recommendation: Show 4-5 most important stats in a compact single line. A player's position array determines which stats are relevant (hitter vs pitcher).

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond the project's own codebase — this is a pure frontend/backend code change using already-installed packages).

## Validation Architecture

`nyquist_validation` is not explicitly set in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend) + TypeScript compile check |
| Config file | packages/backend/src/agents/__tests__/ |
| Quick run command | `pnpm --filter backend test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (none assigned) | Backend roster endpoint returns currentStats field | unit | `pnpm --filter backend test` | ❌ Wave 0 |
| (none assigned) | Backend free-agents endpoint returns currentStats field | unit | `pnpm --filter backend test` | ❌ Wave 0 |
| (none assigned) | isPitcher() correctly classifies positions | unit | `pnpm --filter backend test` | ❌ Wave 0 |
| (none assigned) | formatStat handles null/NaN/0 correctly | unit | `pnpm --filter backend test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter backend type-check` (TypeScript compile)
- **Per wave merge:** `pnpm --filter backend test`
- **Phase gate:** Full compile + test green before `/gsd:verify-work`

### Wave 0 Gaps
- No new test files need to be created for this phase if planner scopes it as frontend-only (UI changes). Backend endpoint changes should have integration tests added.

## Project Constraints (from CLAUDE.md)

- **Rate stats:** Never average rates directly. Use component math: AVG = H/AB, OBP = (H+BB+HBP)/(AB+BB+HBP+SF), ERA = 9*ER/IP, WHIP = (HA+BBA)/IP. Functions live in `packages/shared/src/formulas.ts`.
- **Empty array guard:** Always check `array.length > 0` before using `.where("col", "in", array)` — Kysely generates invalid SQL otherwise.
- **PlayerRow** component exists and accepts a `stats` prop but does not render it — extending this component is the right approach.
- **Dark mode:** All new UI must use semantic token classes (`text-content`, `dark:text-shell-text`, `text-content-secondary`, `dark:text-shell-muted`, `font-mono` for numbers per SHELL-05).
- **Typography:** Numbers must use `font-mono` (JetBrains Mono per SHELL-05). Text uses Inter.
- **Agent architecture:** Any new data-fetching logic in the backend belongs in an agent class or inside the existing API route handlers. No business logic in route handlers beyond calling agents.
- **Degraded snapshots:** If projections are missing, the API already returns `projections: null`. The UI must handle null gracefully with "--" display.
- **No shared frontend components:** CLAUDE.md calls this out as known tech debt (#4). For this phase, creating `PlayerStatLine.tsx` as a shared component is the correct direction (aligns with fixing this debt).

## Sources

### Primary (HIGH confidence)
- Direct code inspection — `packages/backend/src/api/recommendations.ts` — verified exact select() calls and response shapes
- Direct code inspection — `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` — verified interface definitions and data flow
- Direct code inspection — `packages/shared/src/formulas.ts` — verified all rate stat functions available
- Direct code inspection — `packages/backend/src/db/schema.ts` — verified `current_season_stats_json` column exists in player table
- Direct code inspection — `packages/backend/src/agents/player-pool-sync.ts` — verified `current_season_stats_json` is written

### Secondary (MEDIUM confidence)
- `packages/shared/src/types.ts` — `StatComponents` interface confirms field names (H, AB, HA, BBA, IP, ER, etc.)
- `packages/backend/src/adapters/espn.ts` `ESPN_STAT_MAP` — confirms mapping between ESPN stat IDs and canonical keys

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all required libraries are already in the project
- Architecture: HIGH — exact files, functions, and DB columns verified by direct code inspection
- Pitfalls: HIGH — sourced from actual code paths, not theory

**Research date:** 2026-03-24
**Valid until:** 60 days (stable codebase, no external dependencies)
