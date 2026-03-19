#!/usr/bin/env npx tsx
/**
 * build-combined-csv.ts
 *
 * Fetches ESPN Live Draft Trends auction values and merges with FanGraphs
 * projections + auction values to produce a single combined CSV.
 *
 * Usage: npx tsx tools/build-combined-csv.ts [--output combined-draft-values.csv]
 *
 * Reads from:
 *   - ESPN API: live draft trends (avg auction salary)
 *   - packages/extension/assets/fangraphs-leaderboard-hitters.json
 *   - packages/extension/assets/fangraphs-leaderboard-pitchers.json
 *   - packages/extension/assets/fangraphs-auction-hitters.json
 *   - packages/extension/assets/fangraphs-auction-pitchers.json
 *
 * Outputs:
 *   - combined-draft-values.csv (or custom path via --output)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "packages/extension/assets");

// ESPN position ID → abbreviation
const ESPN_POS: Record<number, string> = {
  0: "C", 1: "1B", 2: "2B", 3: "SS", 4: "3B", 5: "OF",
  6: "MI", 7: "CI", 8: "UTIL", 9: "DH", 10: "OF",
  11: "UTIL", 12: "DL", 13: "SP", 14: "RP",
  15: "P", 16: "BN", 17: "IR", 19: "IF",
};

// Eligible batting positions (exclude bench/IR/DL/generic flex)
const BATTING_SLOTS = new Set([0, 1, 2, 3, 4, 5, 9, 10]);
const PITCHING_SLOTS = new Set([13, 14, 15]);

interface ESPNPlayer {
  id: number;
  fullName: string;
  positions: string[];
  auctionValueAvg: number;
  adp: number;
  isPitcher: boolean;
}

interface FGProjection {
  name: string;
  mlbamId: number;
  [key: string]: unknown;
}

interface FGAuction {
  name: string;
  mlbamId: number;
  dollars: number;
  pos: string;
  [key: string]: unknown;
}

// ============================================================
// ESPN API Fetch
// ============================================================

async function fetchESPNPlayers(): Promise<ESPNPlayer[]> {
  const allPlayers: ESPNPlayer[] = [];
  const batchSize = 250;
  const maxPlayers = 1500; // Fetch up to 1500 to cover full FG pool
  let offset = 0;
  let total = Infinity;

  console.log("Fetching ESPN Live Draft Trends...");

  while (offset < total && offset < maxPlayers) {
    const filter = JSON.stringify({
      players: {
        filterSlotIds: { value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
        sortPercOwned: { sortAsc: false, sortPriority: 1 },
        limit: batchSize,
        offset,
      },
    });

    const url =
      "https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/2026/segments/0/leaguedefaults/1?view=kona_player_info";

    const res = await fetch(url, {
      headers: {
        "x-fantasy-filter": filter,
        "x-fantasy-platform": "kona-PROD-99f498cd9b-v0.47.1",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`ESPN API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const players = data.players || [];

    if (total === Infinity) {
      // ESPN doesn't return total count easily; stop when batch is short
      total = players.length < batchSize ? offset + players.length : offset + batchSize + 1;
    }
    if (players.length < batchSize) {
      total = offset + players.length; // last page
    }

    for (const p of players) {
      const player = p.player;
      if (!player?.fullName) continue;

      const eligibleSlots: number[] = player.eligibleSlots || [];
      const hasBatting = eligibleSlots.some((s: number) => BATTING_SLOTS.has(s));
      const hasPitching = eligibleSlots.some((s: number) => PITCHING_SLOTS.has(s));

      // Derive display positions
      const positions = new Set<string>();
      for (const slot of eligibleSlots) {
        if (BATTING_SLOTS.has(slot) || PITCHING_SLOTS.has(slot)) {
          const pos = ESPN_POS[slot];
          if (pos) positions.add(pos);
        }
      }

      allPlayers.push({
        id: p.id,
        fullName: player.fullName,
        positions: [...positions],
        auctionValueAvg: player.ownership?.auctionValueAverage ?? 0,
        adp: player.ownership?.averageDraftPosition ?? 999,
        isPitcher: hasPitching && !hasBatting,
      });
    }

    console.log(`  Fetched ${offset + players.length} players...`);
    offset += batchSize;

    // Small delay to be nice to the API
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`  Total: ${allPlayers.length} players from ESPN`);
  return allPlayers;
}

// ============================================================
// FanGraphs Data Loading
// ============================================================

function loadJSON<T>(filename: string): T[] {
  const filepath = path.join(ASSETS, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`  WARNING: ${filename} not found — skipping`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filepath, "utf-8"));
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[.\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// Merge & Output
// ============================================================

function main(): void {
  const outputArg = process.argv.indexOf("--output");
  const outputPath = outputArg !== -1 && process.argv[outputArg + 1]
    ? process.argv[outputArg + 1]
    : "combined-draft-values.csv";

  // Load FanGraphs data
  console.log("Loading FanGraphs assets...");
  const fgHitters = loadJSON<FGProjection>("fangraphs-leaderboard-hitters.json");
  const fgPitchers = loadJSON<FGProjection>("fangraphs-leaderboard-pitchers.json");
  const fgAuctionH = loadJSON<FGAuction>("fangraphs-auction-hitters.json");
  const fgAuctionP = loadJSON<FGAuction>("fangraphs-auction-pitchers.json");

  console.log(`  ${fgHitters.length} hitter projections, ${fgPitchers.length} pitcher projections`);
  console.log(`  ${fgAuctionH.length} hitter auctions, ${fgAuctionP.length} pitcher auctions`);

  // Build FG lookup by normalized name
  const fgProjByName = new Map<string, FGProjection>();
  for (const p of [...fgHitters, ...fgPitchers]) {
    fgProjByName.set(normalizeName(p.name), p);
  }

  const fgAuctionByName = new Map<string, FGAuction>();
  for (const p of [...fgAuctionH, ...fgAuctionP]) {
    fgAuctionByName.set(normalizeName(p.name), p);
  }

  // Fetch ESPN data then merge
  fetchESPNPlayers().then((espnPlayers) => {
    // Include all players with any auction value — even $0.01 matters
    // for players in our FG pool who need ASV data
    const relevantPlayers = espnPlayers
      .filter((p) => p.auctionValueAvg > 0)
      .sort((a, b) => b.auctionValueAvg - a.auctionValueAvg);

    console.log(`\nMerging ${relevantPlayers.length} ESPN players with FanGraphs data...`);

    // CSV header
    const hitterCols = "Name,Pos,ESPN_ASV,FG_Dollars,ADP,HR,R,RBI,SB,AVG,OPS,AB,H,BB,HBP,SF,TB";
    const pitcherCols = "Name,Pos,ESPN_ASV,FG_Dollars,ADP,W,SV,HLD,ERA,WHIP,K,IP";

    const hitterRows: string[] = [];
    const pitcherRows: string[] = [];
    let matched = 0;
    let unmatched = 0;

    for (const espn of relevantPlayers) {
      const normName = normalizeName(espn.fullName);
      const fgProj = fgProjByName.get(normName);
      const fgAuction = fgAuctionByName.get(normName);

      const fgDollars = fgAuction ? (fgAuction.dollars ?? 0) : 0;
      const pos = espn.positions.join("/") || "UTIL";

      if (fgProj) matched++;
      else unmatched++;

      if (espn.isPitcher) {
        const p = fgProj || {} as any;
        pitcherRows.push(
          [
            `"${espn.fullName}"`,
            pos,
            espn.auctionValueAvg.toFixed(2),
            fgDollars.toFixed(1),
            espn.adp.toFixed(1),
            p.W ?? "",
            p.SV ?? "",
            p.HLD ?? "",
            p.ERA !== undefined ? Number(p.ERA).toFixed(2) : "",
            p.WHIP !== undefined ? Number(p.WHIP).toFixed(2) : "",
            p.SO ?? p.K ?? "",
            p.IP ?? "",
          ].join(",")
        );
      } else {
        const p = fgProj || {} as any;
        hitterRows.push(
          [
            `"${espn.fullName}"`,
            pos,
            espn.auctionValueAvg.toFixed(2),
            fgDollars.toFixed(1),
            espn.adp.toFixed(1),
            p.HR ?? "",
            p.R ?? "",
            p.RBI ?? "",
            p.SB ?? "",
            p.AVG !== undefined ? Number(p.AVG).toFixed(3) : "",
            p.OPS !== undefined ? Number(p.OPS).toFixed(3) : "",
            p.AB ?? "",
            p.H ?? "",
            p.BB ?? "",
            p.HBP ?? "",
            p.SF ?? "",
            p.TB ?? "",
          ].join(",")
        );
      }
    }

    // Write combined CSV
    const lines = [
      "## HITTERS",
      hitterCols,
      ...hitterRows,
      "",
      "## PITCHERS",
      pitcherCols,
      ...pitcherRows,
    ];

    fs.writeFileSync(outputPath, lines.join("\n"));
    console.log(`\nMatched: ${matched}/${relevantPlayers.length} (${unmatched} ESPN-only)`);
    console.log(`Hitters: ${hitterRows.length}, Pitchers: ${pitcherRows.length}`);
    console.log(`Written to: ${outputPath}`);
  });
}

main();
