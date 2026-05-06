import type { ESPNTransaction } from "./types.js";

/**
 * ESPN Baseball stat ID → canonical stat key mapping
 * Source: https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/constant.py
 */
export const ESPN_STAT_MAP: Record<
  number,
  {
    key: string;
    name: string;
    type: "COUNTING" | "RATE";
    formulaId?: string;
    requiredComponents?: string[];
  }
> = {
  // Batting
  0: { key: "AB", name: "At Bats", type: "COUNTING" },
  1: { key: "H", name: "Hits", type: "COUNTING" },
  2: {
    key: "AVG",
    name: "Batting Average",
    type: "RATE",
    formulaId: "avg",
    requiredComponents: ["H", "AB"],
  },
  3: { key: "2B", name: "Doubles", type: "COUNTING" },
  4: { key: "3B", name: "Triples", type: "COUNTING" },
  5: { key: "HR", name: "Home Runs", type: "COUNTING" },
  6: { key: "XBH", name: "Extra Base Hits", type: "COUNTING" },
  7: { key: "1B", name: "Singles", type: "COUNTING" },
  8: { key: "TB", name: "Total Bases", type: "COUNTING" },
  9: {
    key: "SLG",
    name: "Slugging Pct",
    type: "RATE",
    formulaId: "slg",
    requiredComponents: ["TB", "AB"],
  },
  10: { key: "BB", name: "Walks", type: "COUNTING" },
  11: { key: "IBB", name: "Intentional Walks", type: "COUNTING" },
  12: { key: "HBP", name: "Hit By Pitch", type: "COUNTING" },
  13: { key: "SF", name: "Sacrifice Flies", type: "COUNTING" },
  14: { key: "SH", name: "Sacrifice Hits", type: "COUNTING" },
  16: { key: "PA", name: "Plate Appearances", type: "COUNTING" },
  17: {
    key: "OBP",
    name: "On Base Pct",
    type: "RATE",
    formulaId: "obp",
    requiredComponents: ["H", "BB", "HBP", "AB", "SF"],
  },
  18: {
    key: "OPS",
    name: "OPS",
    type: "RATE",
    formulaId: "ops",
    requiredComponents: ["H", "BB", "HBP", "AB", "SF", "TB"],
  },
  20: { key: "R", name: "Runs", type: "COUNTING" },
  21: { key: "RBI", name: "RBI", type: "COUNTING" },
  23: { key: "SB", name: "Stolen Bases", type: "COUNTING" },
  24: { key: "CS", name: "Caught Stealing", type: "COUNTING" },
  27: { key: "SO", name: "Strikeouts", type: "COUNTING" },
  // Pitching
  33: { key: "GS", name: "Games Started", type: "COUNTING" },
  34: { key: "OUTS", name: "Outs", type: "COUNTING" },
  37: { key: "HA", name: "Hits Allowed", type: "COUNTING" },
  39: { key: "BBA", name: "Walks Allowed", type: "COUNTING" },
  41: {
    key: "WHIP",
    name: "WHIP",
    type: "RATE",
    formulaId: "whip",
    requiredComponents: ["H", "BB", "IP"],
  },
  45: { key: "ER", name: "Earned Runs", type: "COUNTING" },
  46: { key: "HRA", name: "Home Runs Allowed", type: "COUNTING" },
  47: {
    key: "ERA",
    name: "ERA",
    type: "RATE",
    formulaId: "era",
    requiredComponents: ["ER", "IP"],
  },
  48: { key: "K", name: "Strikeouts", type: "COUNTING" },
  49: {
    key: "K9",
    name: "K/9",
    type: "RATE",
    formulaId: "k9",
    requiredComponents: ["K", "IP"],
  },
  53: { key: "W", name: "Wins", type: "COUNTING" },
  54: { key: "L", name: "Losses", type: "COUNTING" },
  55: { key: "WPCT", name: "Win Pct", type: "RATE" },
  56: { key: "SVO", name: "Save Opportunities", type: "COUNTING" },
  57: { key: "SV", name: "Saves", type: "COUNTING" },
  58: { key: "BLSV", name: "Blown Saves", type: "COUNTING" },
  60: { key: "HLD", name: "Holds", type: "COUNTING" },
  62: { key: "CG", name: "Complete Games", type: "COUNTING" },
  63: { key: "QS", name: "Quality Starts", type: "COUNTING" },
};

/** ESPN lineup slot ID → position label
 * Source: https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/constant.py */
export const ESPN_LINEUP_SLOT_MAP: Record<number, string> = {
  0: "C",
  1: "1B",
  2: "2B",
  3: "3B",
  4: "SS",
  5: "OF",
  6: "MI",
  7: "CI",
  8: "LF",
  9: "CF",
  10: "RF",
  11: "DH",
  12: "UTIL",
  13: "P",
  14: "SP",
  15: "RP",
  16: "BE",
  17: "IL",
  19: "IF",
};

/** ESPN eligible position slot ID → position label (for player eligibility) */
export const ESPN_POSITION_MAP: Record<number, string> = {
  0: "C",
  1: "1B",
  2: "2B",
  3: "3B",
  4: "SS",
  5: "OF",
  6: "MI",
  7: "CI",
  8: "LF",
  9: "CF",
  10: "RF",
  11: "DH",
  12: "UTIL",
  13: "P",
  14: "SP",
  15: "RP",
  16: "BE",
  17: "IL",
  19: "IF",
};

/** ESPN pro team ID → MLB team abbreviation */
export const ESPN_PRO_TEAM_MAP: Record<number, string> = {
  1: "BAL",
  2: "BOS",
  3: "LAA",
  4: "CWS",
  5: "CLE",
  6: "DET",
  7: "KC",
  8: "MIL",
  9: "MIN",
  10: "NYY",
  11: "OAK",
  12: "SEA",
  13: "TEX",
  14: "TOR",
  15: "ATL",
  16: "CHC",
  17: "CIN",
  18: "HOU",
  19: "LAD",
  20: "WSH",
  21: "NYM",
  22: "PHI",
  23: "PIT",
  24: "STL",
  25: "SD",
  26: "SF",
  27: "COL",
  28: "MIA",
  29: "ARI",
  30: "TB",
};

/** Position name → ESPN slot ID (for free agent filtering) */
export const ESPN_POSITION_TO_SLOT: Record<string, number> = {
  C: 0,
  "1B": 1,
  "2B": 2,
  "3B": 3,
  SS: 4,
  LF: 5,
  CF: 6,
  RF: 7,
  OF: 5,
  DH: 9,
  UTIL: 12,
  SP: 13,
  RP: 14,
  P: 13,
};

/** All position slot IDs for unfiltered free agent queries */
export const ALL_POSITION_SLOT_IDS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 24,
];

/** ESPN transaction type ID → canonical type */
export const ESPN_TRANSACTION_TYPE_MAP: Record<
  number,
  ESPNTransaction["type"]
> = {
  1: "ADD",
  2: "DROP",
  3: "TRADE",
  4: "WAIVER",
};
