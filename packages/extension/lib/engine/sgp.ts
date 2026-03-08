/**
 * sgp.ts
 *
 * Standings Gain Points (SGP) valuation model.
 *
 * Three exported functions:
 *   buildSGPVectors — vectorized SGP computation with dynamic replacement levels
 *   applyScarcityAdjustment — position scarcity multiplier
 *   getPlayerStat — stat value extractor (exported for testing)
 *
 * Pure functions: no Zustand reads, no DOM access, no side effects.
 */

import type { Category } from "@espn-fantasy/shared";
import type { PoolPlayer, CategoryStats, SGPVectors } from "./types";

// ============================================================
// Constants
// ============================================================

/** Position scarcity multipliers — amplify adjustment for thin positions */
const SCARCITY_MULTIPLIERS: Record<string, number> = {
  C: 1.5,
  SS: 1.3,
  "2B": 1.2,
};

/** Pitching stat keys — used to identify pitcher-relevant categories */
const PITCHING_STAT_KEYS = new Set(["W", "SV", "HLD", "ERA", "WHIP", "K", "SO", "QS", "IP", "WPCT"]);

// ============================================================
// getPlayerStat — stat extractor
// ============================================================

/**
 * Extract a category's stat value from a player.
 * For both counting and rate stats, returns the precomputed value from player.stats.
 * Research pitfall 3: do NOT recompute rate stats from components — use FG precomputed rates.
 */
export function getPlayerStat(player: PoolPlayer, category: Category): number {
  return player.stats[category.stat_key] ?? 0;
}

// ============================================================
// buildSGPVectors — vectorized SGP computation
// ============================================================

/**
 * Build SGP vectors for a player pool in a single vectorized pass.
 *
 * Algorithm:
 * 1. For each category, extract stat values into a vector (O(n))
 * 2. Compute population mean and stddev for that vector (O(n))
 * 3. Compute replacement value = value of player at index N (total slots * totalTeams)
 *    Where N = sum(relevant roster slots) * totalTeams
 * 4. Compute per-player SGP = sum over categories of (stat - replacement) / std
 *    For LOWER_BETTER categories: negate the result (lower = better = positive SGP)
 *
 * Complexity: O(n * cats) — no nested loops over players within category loop.
 *
 * @param players      Full player pool (all eligible undrafted players)
 * @param categories   League scoring categories
 * @param rosterSlots  Slot definitions (e.g. { C:1, OF:3, P:6, ... })
 * @param totalTeams   Number of teams in the league
 */
export function buildSGPVectors(
  players: PoolPlayer[],
  categories: Category[],
  rosterSlots: Record<string, number>,
  totalTeams: number,
): SGPVectors {
  const statVectors: Record<string, number[]> = {};
  const categoryStats: Record<string, CategoryStats> = {};

  // Compute total replacement index
  // For hitter categories: use total hitter slots
  // For pitcher categories: use total pitcher slots
  // For simplicity: use total slots (sum all position slots) * totalTeams
  // This is the Nth ranked player across all eligible players
  const totalSlots = Object.values(rosterSlots).reduce((s, v) => s + v, 0);
  const replacementIndex = totalSlots * totalTeams;

  // ------------------------------------------------------------------
  // Phase 1: extract stat vectors and compute category stats
  // ------------------------------------------------------------------
  for (const category of categories) {
    const statKey = category.stat_key;
    const isPitchingCategory = PITCHING_STAT_KEYS.has(statKey);

    // Extract values from eligible players (pitching cats → pitchers, hitting cats → hitters)
    // For broad replacement level: use all players that have this stat
    const values: number[] = [];
    for (const player of players) {
      const isEligible = isPitchingCategory ? player.isPitcher : !player.isPitcher;
      if (isEligible) {
        values.push(getPlayerStat(player, category));
      }
    }

    statVectors[statKey] = values;

    if (values.length === 0) {
      categoryStats[statKey] = { mean: 0, std: 0, replacementValue: 0 };
      continue;
    }

    // Mean
    const mean = values.reduce((s, v) => s + v, 0) / values.length;

    // Population stddev
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    // Replacement value: the value of the player at index N (replacementIndex) in the sorted pool.
    // For HIGHER_BETTER: sort descending — the Nth best player is the replacement level.
    //   All players ranked below N are "below replacement" (negative SGP).
    // For LOWER_BETTER (ERA, WHIP): sort ascending (best = lowest first) — the Nth player
    //   in ascending order is the replacement level. Players worse than this (higher ERA/WHIP)
    //   are below replacement (negative SGP after negation).
    const sortedDesc = category.direction === "LOWER_BETTER"
      ? [...values].sort((a, b) => a - b)   // ascending: best pitcher (low ERA) first
      : [...values].sort((a, b) => b - a);  // descending: best hitter (high HR) first

    // The replacement player is at index (replacementIndex - 1), or last if fewer players
    const replIdx = Math.min(replacementIndex, sortedDesc.length) - 1;
    const replacementValue = replIdx >= 0 ? sortedDesc[Math.max(0, replIdx)] : (sortedDesc[sortedDesc.length - 1] ?? 0);

    categoryStats[statKey] = { mean, std, replacementValue };
  }

  // ------------------------------------------------------------------
  // Phase 2: compute per-player SGP
  // ------------------------------------------------------------------
  const playerSGPs: number[] = new Array(players.length).fill(0);

  for (const category of categories) {
    const statKey = category.stat_key;
    const { std, replacementValue } = categoryStats[statKey];
    const isLowerBetter = category.direction === "LOWER_BETTER";
    const isPitchingCategory = PITCHING_STAT_KEYS.has(statKey);

    // Guard: if std = 0, no contribution for this category
    if (std === 0) continue;

    let playerIdx = 0;
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const isEligible = isPitchingCategory ? player.isPitcher : !player.isPitcher;

      if (!isEligible) {
        // Player not eligible for this category — no contribution
        continue;
      }

      const stat = getPlayerStat(player, category);
      let sgpContribution = (stat - replacementValue) / std;

      // For LOWER_BETTER: negate so that below-mean ERA = positive SGP
      if (isLowerBetter) {
        sgpContribution = -sgpContribution;
      }

      playerSGPs[i] += sgpContribution;
      playerIdx++;
    }
  }

  return {
    statVectors,
    categoryStats,
    playerSGPs,
    computedAt: Date.now(),
  };
}

// ============================================================
// applyScarcityAdjustment — scarcity-aware SGP multiplier
// ============================================================

/**
 * Adjust a player's base SGP by positional scarcity.
 *
 * scarcityFactor = remainingSlots / remainingPlayers
 *   < 1 means supply exceeds demand (players are plentiful)
 *   > 1 means slots exceed supply (position is scarce, amplify value)
 *
 * multiplier = SCARCITY_MULTIPLIERS[position] ?? 1.0
 * result = baseSGP * (1 + (scarcityFactor - 1) * multiplier)
 *
 * @param baseSGP          The unmodified SGP total for this player
 * @param position         Primary position string (e.g. "C", "SS", "OF")
 * @param remainingSlots   How many roster slots remain unfilled at this position across all teams
 * @param remainingPlayers How many eligible undrafted players remain at this position
 */
export function applyScarcityAdjustment(
  baseSGP: number,
  position: string,
  remainingSlots: number,
  remainingPlayers: number,
): number {
  // Guard: avoid division by zero
  if (remainingPlayers === 0) return baseSGP;

  const scarcityFactor = remainingSlots / remainingPlayers;
  const multiplier = SCARCITY_MULTIPLIERS[position] ?? 1.0;

  return baseSGP * (1 + (scarcityFactor - 1) * multiplier);
}
