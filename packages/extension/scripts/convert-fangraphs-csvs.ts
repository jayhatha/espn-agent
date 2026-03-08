/**
 * convert-fangraphs-csvs.ts
 *
 * One-shot script that converts FanGraphs CSV exports to bundled JSON assets
 * for the Chrome extension. Run with: npx tsx packages/extension/scripts/convert-fangraphs-csvs.ts
 *
 * Reads from project root CSVs, writes to packages/extension/assets/.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// CSV Parser
// ============================================================

/**
 * Parse a CSV string into an array of row objects.
 * Handles:
 * - UTF-8 BOM (\uFEFF) stripping
 * - Quoted fields with embedded commas
 * - Quoted fields with embedded newlines (skipped — not needed for FG CSVs)
 */
function parseCsv(raw: string): Record<string, string>[] {
  // Strip BOM if present (confirmed present in FanGraphs exports)
  const content = raw.replace(/^\uFEFF/, "");

  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseRow(lines[0]);

  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length !== headers.length) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j];
    }
    records.push(row);
  }

  return records;
}

/**
 * Parse a single CSV row, handling quoted fields with embedded commas.
 */
function parseRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

function num(val: string | undefined): number {
  if (!val || val === "") return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// ============================================================
// Paths
// ============================================================

const ROOT = path.resolve(__dirname, "../../..");
const ASSETS_DIR = path.resolve(__dirname, "../assets");

const CSV_HITTER_LEADERBOARD = path.join(ROOT, "fangraphs-leaderboard-projections-7.csv");
const CSV_PITCHER_LEADERBOARD = path.join(ROOT, "fangraphs-leaderboard-projections-8.csv");
const CSV_HITTER_AUCTION = path.join(ROOT, "fangraphs-auction-calculator.csv");
const CSV_PITCHER_AUCTION = path.join(ROOT, "fangraphs-auction-calculator-2.csv");

const OUT_HITTER_LEADERBOARD = path.join(ASSETS_DIR, "fangraphs-leaderboard-hitters.json");
const OUT_PITCHER_LEADERBOARD = path.join(ASSETS_DIR, "fangraphs-leaderboard-pitchers.json");
const OUT_HITTER_AUCTION = path.join(ASSETS_DIR, "fangraphs-auction-hitters.json");
const OUT_PITCHER_AUCTION = path.join(ASSETS_DIR, "fangraphs-auction-pitchers.json");

// ============================================================
// Converters
// ============================================================

function convertHitterLeaderboard(): void {
  console.log("Converting hitter leaderboard projections...");
  const raw = fs.readFileSync(CSV_HITTER_LEADERBOARD, "utf-8");
  const rows = parseCsv(raw);

  const output = rows
    .filter((r) => r["Name"] && r["MLBAMID"])
    .map((r) => ({
      name: r["Name"],
      team: r["Team"],
      mlbamId: num(r["MLBAMID"]),
      fgId: r["PlayerId"] || "",
      HR: num(r["HR"]),
      R: num(r["R"]),
      RBI: num(r["RBI"]),
      SB: num(r["SB"]),
      AVG: num(r["AVG"]),
      OPS: num(r["OPS"]),
      AB: num(r["AB"]),
      H: num(r["H"]),
      BB: num(r["BB"]),
      HBP: num(r["HBP"]),
      SF: num(r["SF"]),
      TB: num(r["TB"]),
      PA: num(r["PA"]),
    }));

  fs.writeFileSync(OUT_HITTER_LEADERBOARD, JSON.stringify(output));
  console.log(`  -> ${output.length} hitters written to fangraphs-leaderboard-hitters.json`);

  // Spot-check
  const judge = output.find((p) => p.name.toLowerCase().includes("aaron judge"));
  if (judge) {
    console.log(`  -> Spot check: Aaron Judge HR=${judge.HR}, AVG=${judge.AVG.toFixed(3)}`);
  } else {
    console.warn("  -> WARNING: Aaron Judge not found in hitter leaderboard");
  }
}

function convertPitcherLeaderboard(): void {
  console.log("Converting pitcher leaderboard projections...");
  const raw = fs.readFileSync(CSV_PITCHER_LEADERBOARD, "utf-8");
  const rows = parseCsv(raw);

  // CRITICAL: Store pitcher H/BB/HR as HA/BBA/HRA to avoid collision with hitter
  // stat keys when used with calculateFinalRate from shared formulas.
  // The shared WHIP formula uses HA (hits allowed) and BBA (walks allowed).
  const output = rows
    .filter((r) => r["Name"] && r["MLBAMID"])
    .map((r) => ({
      name: r["Name"],
      team: r["Team"],
      mlbamId: num(r["MLBAMID"]),
      fgId: r["PlayerId"] || "",
      W: num(r["W"]),
      L: num(r["L"]),
      SV: num(r["SV"]),
      HLD: num(r["HLD"]),
      ERA: num(r["ERA"]),
      WHIP: num(r["WHIP"]),
      SO: num(r["SO"]),
      IP: num(r["IP"]),
      HA: num(r["H"]),      // Hits allowed (renamed from H to avoid collision)
      ER: num(r["ER"]),
      BBA: num(r["BB"]),    // Walks allowed (renamed from BB to avoid collision)
      QS: num(r["QS"]),
      HRA: num(r["HR"]),    // Home runs allowed (renamed from HR to avoid collision)
    }));

  fs.writeFileSync(OUT_PITCHER_LEADERBOARD, JSON.stringify(output));
  console.log(`  -> ${output.length} pitchers written to fangraphs-leaderboard-pitchers.json`);

  // Spot-check
  const skubal = output.find((p) => p.name.toLowerCase().includes("tarik skubal"));
  if (skubal) {
    console.log(`  -> Spot check: Tarik Skubal ERA=${skubal.ERA.toFixed(2)}, HA=${skubal.HA}, BBA=${skubal.BBA}`);
  } else {
    console.warn("  -> WARNING: Tarik Skubal not found in pitcher leaderboard");
  }
}

function convertHitterAuction(): void {
  console.log("Converting hitter auction values...");
  const raw = fs.readFileSync(CSV_HITTER_AUCTION, "utf-8");
  const rows = parseCsv(raw);

  const output = rows
    .filter((r) => r["Name"] && r["MLBAMID"])
    .map((r) => ({
      name: r["Name"].trim(),
      team: r["Team"],
      pos: r["POS"],
      mlbamId: num(r["MLBAMID"]),
      fgId: r["PlayerId"] || "",
      dollars: num(r["Dollars"]),
      mAVG: num(r["mAVG"]),
      mRBI: num(r["mRBI"]),
      mR: num(r["mR"]),
      mSB: num(r["mSB"]),
      mOPS: num(r["mOPS"]),
      pts: num(r["PTS"]),
    }));

  fs.writeFileSync(OUT_HITTER_AUCTION, JSON.stringify(output));
  console.log(`  -> ${output.length} hitter auction values written to fangraphs-auction-hitters.json`);

  // Spot-check
  const judge = output.find((p) => p.name.toLowerCase().includes("aaron judge"));
  if (judge) {
    console.log(`  -> Spot check: Aaron Judge dollars=$${judge.dollars.toFixed(1)}`);
  } else {
    console.warn("  -> WARNING: Aaron Judge not found in hitter auction values");
  }
}

function convertPitcherAuction(): void {
  console.log("Converting pitcher auction values...");
  const raw = fs.readFileSync(CSV_PITCHER_AUCTION, "utf-8");
  const rows = parseCsv(raw);

  const output = rows
    .filter((r) => r["Name"] && r["MLBAMID"])
    .map((r) => ({
      name: r["Name"].trim(),
      team: r["Team"],
      pos: r["POS"],
      mlbamId: num(r["MLBAMID"]),
      fgId: r["PlayerId"] || "",
      dollars: num(r["Dollars"]),
      mW: num(r["mW"]),
      mSV: num(r["mSV"]),
      mERA: num(r["mERA"]),
      mWHIP: num(r["mWHIP"]),
      mSO: num(r["mSO"]),
      pts: num(r["PTS"]),
      ip: num(r["IP"]),
    }));

  fs.writeFileSync(OUT_PITCHER_AUCTION, JSON.stringify(output));
  console.log(`  -> ${output.length} pitcher auction values written to fangraphs-auction-pitchers.json`);

  // Spot-check
  const skubal = output.find((p) => p.name.toLowerCase().includes("tarik skubal"));
  if (skubal) {
    console.log(`  -> Spot check: Tarik Skubal dollars=$${skubal.dollars.toFixed(1)}`);
  } else {
    console.warn("  -> WARNING: Tarik Skubal not found in pitcher auction values");
  }
}

// ============================================================
// Main
// ============================================================

function main(): void {
  console.log("FanGraphs CSV -> JSON converter");
  console.log("================================");

  // Ensure output directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  convertHitterLeaderboard();
  convertPitcherLeaderboard();
  convertHitterAuction();
  convertPitcherAuction();

  console.log("================================");
  console.log("Done. All 4 JSON files written to packages/extension/assets/");
}

main();
