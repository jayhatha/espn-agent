/**
 * Hardcoded league defaults for ESPN league 112523.
 *
 * Single source of truth consumed by both the backend API and
 * the Chrome extension when no league-specific config is available.
 */

import type { Category, DraftConfiguration } from "./types.js";

// ── League identity ───────────────────────────────────────────
export const DEFAULT_ESPN_LEAGUE_ID = 112523;
export const DEFAULT_TEAM_ID = 13;
export const DEFAULT_TOTAL_TEAMS = 13;
export const DEFAULT_BUDGET = 260;

// ── Scoring categories (5x5: OPS league) ─────────────────────
export const DEFAULT_CATEGORIES: Category[] = [
  // Hitting
  {
    category_id: "R",
    stat_key: "R",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: "Runs",
  },
  {
    category_id: "RBI",
    stat_key: "RBI",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: "RBI",
  },
  {
    category_id: "HR",
    stat_key: "HR",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: "Home Runs",
  },
  {
    category_id: "SB",
    stat_key: "SB",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: "Stolen Bases",
  },
  {
    category_id: "OPS",
    stat_key: "OPS",
    type: "RATE",
    direction: "HIGHER_BETTER",
    name: "OPS",
    formula_id: "ops",
    required_components: ["AB", "H", "BB", "HBP", "SF", "TB"],
  },
  // Pitching
  {
    category_id: "K",
    stat_key: "K",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: "Strikeouts",
  },
  {
    category_id: "W",
    stat_key: "W",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: "Wins",
  },
  {
    category_id: "SV",
    stat_key: "SV",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    name: "Saves",
  },
  {
    category_id: "ERA",
    stat_key: "ERA",
    type: "RATE",
    direction: "LOWER_BETTER",
    name: "ERA",
    formula_id: "era",
    required_components: ["ER", "IP"],
  },
  {
    category_id: "WHIP",
    stat_key: "WHIP",
    type: "RATE",
    direction: "LOWER_BETTER",
    name: "WHIP",
    formula_id: "whip",
    required_components: ["IP", "H", "BB"],
  },
];

// ── Roster slots ──────────────────────────────────────────────
export const DEFAULT_ROSTER_SLOTS: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  OF: 3,
  UTIL: 1,
  SP: 4,
  RP: 2,
  P: 2,
  BN: 3,
};

// ── Composite config ──────────────────────────────────────────
export const DEFAULT_DRAFT_CONFIG: DraftConfiguration = {
  categories: DEFAULT_CATEGORIES,
  rosterSlots: DEFAULT_ROSTER_SLOTS,
  totalTeams: DEFAULT_TOTAL_TEAMS,
  budget: DEFAULT_BUDGET,
};
