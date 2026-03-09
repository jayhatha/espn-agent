/**
 * category-floor.ts
 *
 * Category floor enforcement utilities for the ideal roster optimizer.
 *
 * Detects active scoring categories with zero projected contribution from drafted
 * players and selects the best available contributor to force-lock into the roster.
 *
 * Pure functions: no Zustand reads, no DOM access, no side effects.
 */

import type { DraftedPlayer, Category } from "@espn-fantasy/shared";
import type { PoolPlayer } from "./types";
import type { FgPitcherProjection, FgHitterProjection } from "../fangraphs-data";
import { normalizeName } from "./archetype";

// ============================================================
// Stat key mapping: ESPN category stat_key -> FanGraphs projection field
// ============================================================

/**
 * Map an ESPN league stat_key to the corresponding FanGraphs projection field name.
 * Returns { source: "pitcher" | "hitter", field: string } or null if not a counting stat.
 *
 * NOTE: ESPN uses "K" for strikeouts but FanGraphs pitcher data uses "SO".
 * The PoolPlayer.stats object stores BOTH K and SO (see buildFgPlayerPool in archetype.ts).
 */
function getProjectionField(statKey: string): { source: "pitcher" | "hitter"; field: string } | null {
  switch (statKey) {
    case "SV":  return { source: "pitcher", field: "SV" };
    case "HLD": return { source: "pitcher", field: "HLD" };
    case "W":   return { source: "pitcher", field: "W" };
    case "K":   return { source: "pitcher", field: "SO" };
    case "SO":  return { source: "pitcher", field: "SO" };
    case "QS":  return { source: "pitcher", field: "QS" };
    case "HR":  return { source: "hitter", field: "HR" };
    case "R":   return { source: "hitter", field: "R" };
    case "RBI": return { source: "hitter", field: "RBI" };
    case "SB":  return { source: "hitter", field: "SB" };
    case "BB":  return { source: "hitter", field: "BB" };
    default:    return null;
  }
}

// ============================================================
// Safe field accessors for projection types
// ============================================================

/** Safely access a pitcher projection field by string key */
function getPitcherStat(proj: FgPitcherProjection, field: string): number {
  switch (field) {
    case "SV":  return proj.SV;
    case "HLD": return proj.HLD;
    case "W":   return proj.W;
    case "SO":  return proj.SO;
    case "QS":  return proj.QS;
    default:    return 0;
  }
}

/** Safely access a hitter projection field by string key */
function getHitterStat(proj: FgHitterProjection, field: string): number {
  switch (field) {
    case "HR":  return proj.HR;
    case "R":   return proj.R;
    case "RBI": return proj.RBI;
    case "SB":  return proj.SB;
    case "BB":  return proj.BB;
    default:    return 0;
  }
}

// ============================================================
// getZeroCoverageCategories
// ============================================================

/**
 * Identify active scoring categories with zero projected contribution from the
 * user's drafted roster. Only checks COUNTING stats with direction HIGHER_BETTER.
 *
 * Rate stats (ERA, WHIP, AVG, OPS) are skipped because they're averages and
 * can't meaningfully be "zero coverage" in the same way.
 *
 * Also verifies that at least one player in the optimizer pool can contribute
 * to the category before flagging it -- no point forcing a pick that doesn't exist.
 *
 * @param myRoster - User's already-drafted players
 * @param leagueCategories - Active scoring categories for this league
 * @param pitcherProjMap - FanGraphs pitcher projections keyed by normalized name
 * @param hitterProjMap - FanGraphs hitter projections keyed by normalized name
 * @param optimizerPlayers - Available players in the optimizer pool
 * @returns Array of stat_keys with zero coverage that have available contributors
 */
export function getZeroCoverageCategories(
  myRoster: DraftedPlayer[],
  leagueCategories: Category[],
  pitcherProjMap: Map<string, FgPitcherProjection>,
  hitterProjMap: Map<string, FgHitterProjection>,
  optimizerPlayers: PoolPlayer[],
): string[] {
  const zeroCoverage: string[] = [];

  // Filter to COUNTING + HIGHER_BETTER categories only
  const countingCategories = leagueCategories.filter(
    cat => cat.type === "COUNTING" && cat.direction === "HIGHER_BETTER"
  );

  for (const cat of countingCategories) {
    const mapping = getProjectionField(cat.stat_key);
    if (!mapping) continue; // Unknown stat key, skip

    // Sum projected contribution from all drafted players
    let totalContribution = 0;

    for (const player of myRoster) {
      const nName = normalizeName(player.playerName);

      if (mapping.source === "pitcher") {
        const proj = pitcherProjMap.get(nName);
        if (proj) {
          totalContribution += getPitcherStat(proj, mapping.field);
        }
      } else {
        const proj = hitterProjMap.get(nName);
        if (proj) {
          totalContribution += getHitterStat(proj, mapping.field);
        }
      }
    }

    // If drafted roster has any contribution, category is covered
    if (totalContribution > 0) continue;

    // Check if ANY player in the optimizer pool can contribute to this category.
    // Handle K/SO aliasing: PoolPlayer.stats may use either key.
    const hasContributor = optimizerPlayers.some(p => {
      const val = p.stats[cat.stat_key]
        ?? (cat.stat_key === "K" ? p.stats["SO"] : undefined)
        ?? (cat.stat_key === "SO" ? p.stats["K"] : undefined)
        ?? 0;
      return val > 0;
    });

    if (hasContributor) {
      zeroCoverage.push(cat.stat_key);
    }
  }

  return zeroCoverage;
}

// ============================================================
// findBestFloorPick
// ============================================================

/**
 * Find the best available player who contributes to a specific stat category,
 * within a budget constraint.
 *
 * Selects the player with the highest projected stat value for the given
 * category who costs no more than maxCost.
 *
 * Handles K/SO aliasing: if statKey is "K", also checks player.stats["SO"]
 * and vice versa.
 *
 * @param statKey - The stat category to find a contributor for (e.g., "SV", "HLD")
 * @param availablePlayers - Pool of available players to choose from
 * @param maxCost - Maximum auction cost the floor pick can use
 * @returns Best contributing player within budget, or null if none found
 */
export function findBestFloorPick(
  statKey: string,
  availablePlayers: PoolPlayer[],
  maxCost: number,
): PoolPlayer | null {
  // Helper to get stat value with K/SO aliasing
  const getStatValue = (player: PoolPlayer): number => {
    const direct = player.stats[statKey] ?? 0;
    if (direct > 0) return direct;

    // K/SO alias fallback
    if (statKey === "K") return player.stats["SO"] ?? 0;
    if (statKey === "SO") return player.stats["K"] ?? 0;

    return 0;
  };

  // Filter to players who contribute to this stat and are affordable
  const candidates = availablePlayers
    .filter(p => getStatValue(p) > 0 && p.dollars <= maxCost)
    .sort((a, b) => getStatValue(b) - getStatValue(a)); // Best contributor first

  return candidates.length > 0 ? candidates[0] : null;
}
