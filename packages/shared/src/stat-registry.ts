import type { StatComponents } from "./types.js";

/**
 * Central stat classification registry.
 *
 * Single source of truth for pitching/batting stat membership.
 * Agents and formula dispatch import from here instead of maintaining
 * their own copies of PITCHING_STAT_KEYS.
 */

/** All stat keys that belong to pitching categories */
export const PITCHING_STAT_KEYS = new Set([
  // Counting stats
  "IP",
  "K",
  "W",
  "L",
  "SV",
  "HLD",
  "QS",
  "CG",
  "BLSV",
  "SVO",
  "ER",
  "OUTS",
  "HA",
  "BBA",
  "HRA",
  // Rate stats
  "ERA",
  "WHIP",
  "K9",
  "WPCT",
]);

/** All stat keys that belong to batting categories */
export const BATTING_STAT_KEYS = new Set([
  // Counting stats
  "AB",
  "H",
  "R",
  "HR",
  "RBI",
  "SB",
  "BB",
  "HBP",
  "SF",
  "TB",
  "CS",
  "SO",
  // Rate stats
  "AVG",
  "OBP",
  "SLG",
  "OPS",
]);

/**
 * Detect whether a set of stat components belongs to a pitcher.
 * Uses IP > 0 as primary signal, ER defined as secondary signal.
 */
export function isPitcherProjection(components: StatComponents): boolean {
  return (components.IP ?? 0) > 0 || components.ER !== undefined;
}

/**
 * Classify a stat key as "pitching", "batting", or "unknown".
 */
export function classifyStat(
  statKey: string,
): "pitching" | "batting" | "unknown" {
  if (PITCHING_STAT_KEYS.has(statKey)) return "pitching";
  if (BATTING_STAT_KEYS.has(statKey)) return "batting";
  return "unknown";
}
