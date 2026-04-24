#!/usr/bin/env node
/**
 * convert.js — Parse FanGraphs CSV files into trimmed JSON for the auction builder.
 * Run: node convert.js
 * Reads from repo root / Downloads, writes to ./data/
 */
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "../..");
const DOWNLOADS = path.join(require("os").homedir(), "Downloads");
const OUT = path.join(__dirname, "data");

// ── CSV parsing (handles quoted fields with commas) ──────────────────
function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h.trim()] = (vals[i] || "").trim()));
    return obj;
  });
}

function parseLine(line) {
  const fields = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      fields.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ── Hitters (projections-7) ──────────────────────────────────────────
function convertHitters() {
  const src = path.join(DOWNLOADS, "fangraphs-leaderboard-projections-7.csv");
  if (!fs.existsSync(src)) { console.error("Missing:", src); process.exit(1); }
  const rows = parseCSV(fs.readFileSync(src, "utf-8"));
  const out = rows.map((r) => ({
    name: r.Name || r.NameASCII,
    team: r.Team,
    PA: num(r.PA), AB: num(r.AB), H: num(r.H),
    "2B": num(r["2B"]), "3B": num(r["3B"]),
    HR: num(r.HR), R: num(r.R), RBI: num(r.RBI),
    BB: num(r.BB), HBP: num(r.HBP), SF: num(r.SF),
    SB: num(r.SB), OPS: num(r.OPS),
    playerId: r.PlayerId || "",
  }));
  fs.writeFileSync(path.join(OUT, "hitters.json"), JSON.stringify(out, null, 0));
  console.log(`Hitters: ${out.length} rows → data/hitters.json`);
}

// ── Pitchers (projections-8) ─────────────────────────────────────────
function convertPitchers() {
  const src = path.join(DOWNLOADS, "fangraphs-leaderboard-projections-8.csv");
  if (!fs.existsSync(src)) { console.error("Missing:", src); process.exit(1); }
  const rows = parseCSV(fs.readFileSync(src, "utf-8"));
  const out = rows.map((r) => ({
    name: r.Name || r.NameASCII,
    team: r.Team,
    W: num(r.W), SV: num(r.SV), IP: num(r.IP),
    H: num(r.H), BB: num(r.BB), SO: num(r.SO), ER: num(r.ER),
    ERA: num(r.ERA), WHIP: num(r.WHIP), HLD: num(r.HLD),
    GS: num(r.GS), G: num(r.G),
    playerId: r.PlayerId || "",
  }));
  fs.writeFileSync(path.join(OUT, "pitchers.json"), JSON.stringify(out, null, 0));
  console.log(`Pitchers: ${out.length} rows → data/pitchers.json`);
}

// ── FG Auction Hitters ───────────────────────────────────────────────
function convertFGAuctionHitters() {
  const src = path.join(REPO, "fangraphs-auction-calculator.csv");
  if (!fs.existsSync(src)) { console.warn("Skipping FG auction hitters (not found):", src); return; }
  const rows = parseCSV(fs.readFileSync(src, "utf-8"));
  const out = rows.map((r) => ({
    name: (r.Name || "").trim(),
    pos: r.POS || "",
    dollars: num(r.Dollars),
  }));
  fs.writeFileSync(path.join(OUT, "fg-auction-hitters.json"), JSON.stringify(out, null, 0));
  console.log(`FG Auction Hitters: ${out.length} rows → data/fg-auction-hitters.json`);
}

// ── FG Auction Pitchers ──────────────────────────────────────────────
function convertFGAuctionPitchers() {
  const src = path.join(REPO, "fangraphs-auction-calculator-2.csv");
  if (!fs.existsSync(src)) { console.warn("Skipping FG auction pitchers (not found):", src); return; }
  const rows = parseCSV(fs.readFileSync(src, "utf-8"));
  const out = rows.map((r) => ({
    name: (r.Name || "").trim(),
    pos: r.POS || "",
    dollars: num(r.Dollars),
  }));
  fs.writeFileSync(path.join(OUT, "fg-auction-pitchers.json"), JSON.stringify(out, null, 0));
  console.log(`FG Auction Pitchers: ${out.length} rows → data/fg-auction-pitchers.json`);
}

// ── Run ──────────────────────────────────────────────────────────────
convertHitters();
convertPitchers();
convertFGAuctionHitters();
convertFGAuctionPitchers();
console.log("Done.");
