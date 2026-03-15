/**
 * csv-parser.ts
 *
 * Client-side CSV parsing for FanGraphs projections and ESPN auction values.
 * Parses pasted CSV text into PlayerRanking[] and AuctionValue[] formats
 * compatible with the extension's Zustand store.
 */

import type { PlayerRanking, AuctionValue } from "./api-client";
import { normalizeName } from "./engine/normalizer";

// ============================================================
// CSV parsing utilities
// ============================================================

/**
 * Parse a CSV string into rows of key-value objects.
 * Handles quoted fields, commas within quotes, and various line endings.
 */
function parseCSVRows(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || "").trim();
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields with commas.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function toNumber(val: string | undefined): number {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// ============================================================
// FanGraphs hitter positions detection
// ============================================================

const PITCHER_POSITIONS = new Set(["SP", "RP", "P"]);

function isPitcherPosition(pos: string): boolean {
  return pos.split("/").some((p) => PITCHER_POSITIONS.has(p.trim()));
}

// ============================================================
// Public parse functions
// ============================================================

export interface ParseResult {
  rankings: PlayerRanking[];
  auctionValues: AuctionValue[];
  playerCount: number;
  errors: string[];
}

/**
 * Parse FanGraphs Depth Charts RoS hitter CSV.
 *
 * Expected columns: Name, Team, G, AB, PA, H, 2B, 3B, HR, R, RBI, BB, SO, SB, CS,
 *                   AVG, OBP, SLG, OPS, wOBA, wRC+, WAR, playerid
 *
 * Also handles the FanGraphs Auction Calculator CSV which has:
 *   Name, Team, POS, Dollars, playerid  (and stat columns)
 */
export function parseFanGraphsBatterCSV(csvText: string): ParseResult {
  const rows = parseCSVRows(csvText);
  const errors: string[] = [];
  const rankings: PlayerRanking[] = [];
  const auctionValues: AuctionValue[] = [];

  if (rows.length === 0) {
    return { rankings, auctionValues, playerCount: 0, errors: ["No data rows found in CSV"] };
  }

  // Detect column names (FanGraphs uses various capitalizations)
  const sample = rows[0];
  const hasName = "Name" in sample || "name" in sample;
  if (!hasName) {
    errors.push("Missing 'Name' column in CSV header");
    return { rankings, auctionValues, playerCount: 0, errors };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row["Name"] || row["name"] || "";
    if (!name) continue;

    const team = row["Team"] || row["team"] || "";
    // POS column from auction calculator, or infer from positions
    const posStr = row["POS"] || row["Pos"] || row["pos"] || "UT";

    // Skip pitchers in hitter CSV
    if (isPitcherPosition(posStr)) continue;

    const positions = posStr.split("/").map((p) => p.trim()).filter(Boolean);
    if (positions.length === 0) positions.push("UT");

    // Dollar value from FG Auction Calculator
    const dollars = toNumber(row["Dollars"] || row["dollars"]);

    // Stat components for projectedStats
    const projectedStats: Record<string, number> = {};
    const statKeys = ["AB", "H", "HR", "R", "RBI", "SB", "BB", "HBP", "SF", "TB",
      "2B", "3B", "PA", "SO", "CS", "G"];
    for (const key of statKeys) {
      const val = toNumber(row[key] || row[key.toLowerCase()]);
      if (val) projectedStats[key] = val;
    }

    // Rate stats
    for (const key of ["AVG", "OBP", "SLG", "OPS"]) {
      const val = toNumber(row[key] || row[key.toLowerCase()]);
      if (val) projectedStats[key] = val;
    }

    const war = toNumber(row["WAR"] || row["war"]);
    const playerId = toNumber(row["playerid"] || row["PlayerId"] || row["MLBAMID"] || row["mlbamid"]);
    // Use negative index as fallback ID
    const resolvedId = playerId || -(i + 1);

    const vbdScore = dollars || war || 0;

    rankings.push({
      playerId: resolvedId,
      playerName: name,
      positions,
      primaryPosition: positions[0],
      vbdScore,
      tier: 99,
      projectedStats,
    });

    auctionValues.push({
      playerId: resolvedId,
      playerName: name,
      dollarValue: Math.round(dollars || Math.max(1, war)),
      vbdScore,
      positions,
    });
  }

  return { rankings, auctionValues, playerCount: rankings.length, errors };
}

/**
 * Parse FanGraphs Depth Charts RoS pitcher CSV.
 *
 * Expected columns: Name, Team, W, L, ERA, GS, G, SV, HLD, IP, H, ER, HR, BB, SO,
 *                   WHIP, K/9, BB/9, FIP, WAR, playerid
 */
export function parseFanGraphsPitcherCSV(csvText: string): ParseResult {
  const rows = parseCSVRows(csvText);
  const errors: string[] = [];
  const rankings: PlayerRanking[] = [];
  const auctionValues: AuctionValue[] = [];

  if (rows.length === 0) {
    return { rankings, auctionValues, playerCount: 0, errors: ["No data rows found in CSV"] };
  }

  const sample = rows[0];
  const hasName = "Name" in sample || "name" in sample;
  if (!hasName) {
    errors.push("Missing 'Name' column in CSV header");
    return { rankings, auctionValues, playerCount: 0, errors };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row["Name"] || row["name"] || "";
    if (!name) continue;

    const posStr = row["POS"] || row["Pos"] || row["pos"] || "";
    // Determine position from columns or default to SP/RP based on GS
    let positions: string[];
    if (posStr) {
      positions = posStr.split("/").map((p) => p.trim()).filter(Boolean);
    } else {
      const gs = toNumber(row["GS"] || row["gs"]);
      const sv = toNumber(row["SV"] || row["sv"]);
      positions = gs > 0 ? ["SP"] : sv > 0 ? ["RP"] : ["SP"];
    }

    const dollars = toNumber(row["Dollars"] || row["dollars"]);

    const projectedStats: Record<string, number> = {};
    const statKeys = ["W", "L", "SV", "HLD", "GS", "G", "IP", "H", "ER", "HR", "BB", "SO", "K", "QS"];
    for (const key of statKeys) {
      const val = toNumber(row[key] || row[key.toLowerCase()]);
      if (val) projectedStats[key] = val;
    }
    // Alias K -> SO for consistency
    if (projectedStats["K"] && !projectedStats["SO"]) {
      projectedStats["SO"] = projectedStats["K"];
    }

    for (const key of ["ERA", "WHIP", "K/9", "BB/9", "FIP"]) {
      const val = toNumber(row[key] || row[key.toLowerCase()]);
      if (val) projectedStats[key] = val;
    }

    const war = toNumber(row["WAR"] || row["war"]);
    const playerId = toNumber(row["playerid"] || row["PlayerId"] || row["MLBAMID"] || row["mlbamid"]);
    const resolvedId = playerId || -(10000 + i + 1);

    const vbdScore = dollars || war || 0;

    rankings.push({
      playerId: resolvedId,
      playerName: name,
      positions,
      primaryPosition: positions[0],
      vbdScore,
      tier: 99,
      projectedStats,
    });

    auctionValues.push({
      playerId: resolvedId,
      playerName: name,
      dollarValue: Math.round(dollars || Math.max(1, war)),
      vbdScore,
      positions,
    });
  }

  return { rankings, auctionValues, playerCount: rankings.length, errors };
}

/**
 * Parse ESPN auction values from a simple CSV format.
 * Expected: Name, Value (or Name, Dollars, or any two-column CSV with name + number)
 * Also handles FanGraphs auction calculator output with Name, POS, Dollars columns.
 *
 * Returns a map of normalized name -> dollar value for merging into espnDomAuctionValues.
 */
export function parseESPNAuctionCSV(csvText: string): {
  values: Record<string, number>;
  count: number;
  errors: string[];
} {
  const rows = parseCSVRows(csvText);
  const errors: string[] = [];
  const values: Record<string, number> = {};

  if (rows.length === 0) {
    return { values, count: 0, errors: ["No data rows found in CSV"] };
  }

  // Auto-detect value column
  const sample = rows[0];
  const valueKey = Object.keys(sample).find((k) =>
    /^(value|dollars|price|cost|auction|bid|\$)$/i.test(k)
  );
  const nameKey = Object.keys(sample).find((k) =>
    /^(name|player|playername)$/i.test(k)
  );

  if (!nameKey) {
    errors.push("Could not find a 'Name' or 'Player' column");
    return { values, count: 0, errors };
  }

  if (!valueKey) {
    errors.push("Could not find a value column (expected: Value, Dollars, Price, or Cost)");
    return { values, count: 0, errors };
  }

  for (const row of rows) {
    const name = row[nameKey];
    const val = toNumber(row[valueKey]);
    if (name && val > 0) {
      values[normalizeName(name)] = val;
    }
  }

  return { values, count: Object.keys(values).length, errors };
}
