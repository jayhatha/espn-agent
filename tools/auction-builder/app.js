/* ═══════════════════════════════════════════════════════════════
   $260 Auction Builder — app.js
   ═══════════════════════════════════════════════════════════════ */

// ── Constants ────────────────────────────────────────────────────
const BUDGET = 260;

const TARGETS = [
  { key: "R",    a: 1224, b: 1152, type: "counting", dir: "higher" },
  { key: "HR",   a: 350,  b: 345,  type: "counting", dir: "higher" },
  { key: "RBI",  a: 1156, b: 1108, type: "counting", dir: "higher" },
  { key: "SB",   a: 245,  b: 249,  type: "counting", dir: "higher" },
  { key: "OPS",  a: 0.772,b: 0.805,type: "rate",     dir: "higher" },
  { key: "K",    a: 1614, b: 1623, type: "counting", dir: "higher" },
  { key: "W",    a: 107,  b: 107,  type: "counting", dir: "higher" },
  { key: "SV",   a: 133,  b: 131,  type: "counting", dir: "higher" },
  { key: "ERA",  a: 3.16, b: 3.56, type: "rate",     dir: "lower"  },
  { key: "WHIP", a: 1.04, b: 1.17, type: "rate",     dir: "lower"  },
];

const SLOT_DEFS = [
  { id: "C",     label: "C",   section: "hitters", eligible: (p) => p.positions.includes("C") },
  { id: "1B",    label: "1B",  section: "hitters", eligible: (p) => p.positions.includes("1B") },
  { id: "2B",    label: "2B",  section: "hitters", eligible: (p) => p.positions.includes("2B") },
  { id: "3B",    label: "3B",  section: "hitters", eligible: (p) => p.positions.includes("3B") },
  { id: "SS",    label: "SS",  section: "hitters", eligible: (p) => p.positions.includes("SS") },
  { id: "MI",    label: "MI",  section: "hitters", eligible: (p) => p.positions.includes("2B") || p.positions.includes("SS") },
  { id: "CI",    label: "CI",  section: "hitters", eligible: (p) => p.positions.includes("1B") || p.positions.includes("3B") },
  { id: "OF1",   label: "OF",  section: "hitters", eligible: (p) => hasOF(p) },
  { id: "OF2",   label: "OF",  section: "hitters", eligible: (p) => hasOF(p) },
  { id: "OF3",   label: "OF",  section: "hitters", eligible: (p) => hasOF(p) },
  { id: "OF4",   label: "OF",  section: "hitters", eligible: (p) => hasOF(p) },
  { id: "UTIL1", label: "UTIL",section: "hitters", eligible: (p) => !p.isPitcher },
  { id: "UTIL2", label: "UTIL",section: "hitters", eligible: (p) => !p.isPitcher },
  { id: "UTIL3", label: "UTIL",section: "hitters", eligible: (p) => !p.isPitcher },
  { id: "P1",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P2",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P3",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P4",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P5",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P6",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P7",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P8",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "P9",    label: "P",   section: "pitchers",eligible: (p) => p.isPitcher },
  { id: "BN1",   label: "BN",  section: "bench",   eligible: () => true },
  { id: "BN2",   label: "BN",  section: "bench",   eligible: () => true },
  { id: "BN3",   label: "BN",  section: "bench",   eligible: () => true },
  { id: "BN4",   label: "BN",  section: "bench",   eligible: () => true },
  { id: "BN5",   label: "BN",  section: "bench",   eligible: () => true },
];

function hasOF(p) {
  return p.positions.some((pos) => ["OF", "LF", "CF", "RF"].includes(pos));
}

const ESPN_SLOT_MAP = {
  0:"C",1:"1B",2:"2B",3:"3B",4:"SS",5:"OF",6:"MI",7:"CI",
  8:"LF",9:"CF",10:"RF",11:"DH",12:"UTIL",14:"SP",15:"RP",
};

// ── State ────────────────────────────────────────────────────────
const state = {
  roster: {},       // slotId → { player, cost } | null
  players: [],      // merged player pool
  search: "",
  posFilter: "ALL",
  poolToggle: "all", // all | hitters | pitchers
  sortCol: "espnAvgSalary",
  sortDir: "desc",
  lockedSlots: new Set(),
  rosteredNames: new Set(),
  modalPlayer: null,
  modalSlot: null,
};

SLOT_DEFS.forEach((s) => (state.roster[s.id] = null));

// ── Name normalization ───────────────────────────────────────────
function normalizeName(n) {
  return n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)$/, "").trim();
}

// ── Data Loading ─────────────────────────────────────────────────
async function loadData() {
  const loading = document.getElementById("loading-overlay");
  const loadText = document.getElementById("loading-text");
  loading.classList.remove("hidden");

  // Load local JSON
  loadText.textContent = "Loading FanGraphs projections...";
  const [hitters, pitchers, fgAucH, fgAucP] = await Promise.all([
    fetch("data/hitters.json").then((r) => r.json()),
    fetch("data/pitchers.json").then((r) => r.json()),
    fetch("data/fg-auction-hitters.json").then((r) => r.json()).catch(() => []),
    fetch("data/fg-auction-pitchers.json").then((r) => r.json()).catch(() => []),
  ]);

  // Build FG auction lookup
  const fgAucMap = new Map();
  for (const p of [...fgAucH, ...fgAucP]) {
    fgAucMap.set(normalizeName(p.name), p.dollars);
  }

  // Build FG projection lookups
  const fgHitterMap = new Map();
  for (const h of hitters) {
    fgHitterMap.set(normalizeName(h.name), h);
  }
  const fgPitcherMap = new Map();
  for (const p of pitchers) {
    fgPitcherMap.set(normalizeName(p.name), p);
  }

  // Fetch ESPN data
  loadText.textContent = "Fetching ESPN average salaries...";
  const espnPlayers = await fetchESPN(loadText);

  // Merge
  loadText.textContent = "Merging player data...";
  const merged = [];
  const usedFgNames = new Set();

  for (const ep of espnPlayers) {
    const nn = normalizeName(ep.name);
    const fgH = fgHitterMap.get(nn);
    const fgP = fgPitcherMap.get(nn);
    const fg = fgH || fgP || null;
    const isPitcher = ep.positions.some((p) => ["SP", "RP"].includes(p))
                   && !ep.positions.some((p) => ["C","1B","2B","3B","SS","OF","LF","CF","RF","DH"].includes(p));

    if (fg) usedFgNames.add(nn);

    merged.push({
      name: ep.name,
      team: fg ? fg.team : ep.team,
      positions: ep.positions,
      isPitcher,
      fg: fg || null,
      espnAvgSalary: Math.round(ep.avgSalary * 10) / 10,
      espnAuctionValue: ep.auctionValue,
      fgDollars: Math.round((fgAucMap.get(nn) || 0) * 10) / 10,
    });
  }

  // Add FG-only players not in ESPN
  for (const [nn, h] of fgHitterMap) {
    if (!usedFgNames.has(nn)) {
      merged.push({
        name: h.name, team: h.team,
        positions: guessPositions(h),
        isPitcher: false, fg: h,
        espnAvgSalary: 0, espnAuctionValue: 0,
        fgDollars: Math.round((fgAucMap.get(nn) || 0) * 10) / 10,
      });
    }
  }
  for (const [nn, p] of fgPitcherMap) {
    if (!usedFgNames.has(nn)) {
      merged.push({
        name: p.name, team: p.team,
        positions: p.GS > 0 ? ["SP"] : ["RP"],
        isPitcher: true, fg: p,
        espnAvgSalary: 0, espnAuctionValue: 0,
        fgDollars: Math.round((fgAucMap.get(nn) || 0) * 10) / 10,
      });
    }
  }

  state.players = merged;
  console.log(`Loaded: ${hitters.length} hitters, ${pitchers.length} pitchers, ${espnPlayers.length} ESPN, ${merged.length} merged`);

  loading.classList.add("hidden");
}

function guessPositions(hitter) {
  // Without ESPN data, we can't know positions — default to UTIL-eligible
  return ["DH"];
}

async function fetchESPN(loadText) {
  const ESPN_BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/2025/segments/0/leaguedefaults/1";
  const batchSize = 50;
  const maxBatches = 10;
  const all = [];

  for (let i = 0; i < maxBatches; i++) {
    const offset = i * batchSize;
    if (loadText) loadText.textContent = `Fetching ESPN batch ${i + 1}/${maxBatches}...`;

    try {
      const resp = await fetch(`${ESPN_BASE}?view=kona_player_info&scoringPeriodId=0`, {
        headers: {
          "x-fantasy-filter": JSON.stringify({
            players: {
              limit: batchSize, offset,
              sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "STANDARD" },
            },
          }),
        },
      });

      if (!resp.ok) { console.warn("ESPN batch failed:", resp.status); break; }
      const data = await resp.json();
      const batch = data.players || [];
      if (batch.length === 0) break;

      for (const entry of batch) {
        const p = entry.player;
        if (!p) continue;
        const ranks = p.draftRanksByRankType || {};
        const std = ranks.STANDARD || {};
        const ownership = p.ownership || {};
        const auctionValue = std.auctionValue ?? 0;

        if (auctionValue <= 0 && (std.rank ?? 9999) >= 9999) continue;

        const positions = [...new Set(
          (p.eligibleSlots || [])
            .filter((s) => s <= 15 && s !== 12 && s !== 6 && s !== 7)
            .map((s) => ESPN_SLOT_MAP[s])
            .filter(Boolean)
        )];

        all.push({
          name: p.fullName || "",
          team: "", // we'll use FG team
          positions,
          avgSalary: ownership.auctionValueAverage ?? 0,
          auctionValue,
        });
      }
    } catch (err) {
      console.warn("ESPN fetch error:", err);
      break;
    }
  }

  console.log(`ESPN: fetched ${all.length} players`);
  return all;
}

// ── Stat Computation ─────────────────────────────────────────────
function computeTeamStats() {
  const t = {
    R:0, HR:0, RBI:0, SB:0, K:0, W:0, SV:0,
    AB:0, H:0, BB_h:0, HBP:0, SF:0, d2B:0, d3B:0,
    IP:0, ER:0, HA:0, BBA:0,
  };

  for (const slotId of Object.keys(state.roster)) {
    const entry = state.roster[slotId];
    if (!entry || !entry.player.fg) continue;
    const p = entry.player.fg;
    if (entry.player.isPitcher) {
      t.K  += p.SO || 0;
      t.W  += p.W  || 0;
      t.SV += p.SV || 0;
      t.IP += p.IP || 0;
      t.ER += p.ER || 0;
      t.HA += p.H  || 0;
      t.BBA+= p.BB || 0;
    } else {
      t.R   += p.R   || 0;
      t.HR  += p.HR  || 0;
      t.RBI += p.RBI || 0;
      t.SB  += p.SB  || 0;
      t.AB  += p.AB  || 0;
      t.H   += p.H   || 0;
      t.BB_h+= p.BB  || 0;
      t.HBP += p.HBP || 0;
      t.SF  += p.SF  || 0;
      t.d2B += p["2B"] || 0;
      t.d3B += p["3B"] || 0;
    }
  }

  const TB = (t.H - t.d2B - t.d3B - t.HR) + 2 * t.d2B + 3 * t.d3B + 4 * t.HR;
  const OBP = t.AB > 0 ? (t.H + t.BB_h + t.HBP) / (t.AB + t.BB_h + t.HBP + t.SF) : 0;
  const SLG = t.AB > 0 ? TB / t.AB : 0;

  return {
    R: Math.round(t.R), HR: Math.round(t.HR), RBI: Math.round(t.RBI),
    SB: Math.round(t.SB), K: Math.round(t.K), W: Math.round(t.W), SV: Math.round(t.SV),
    OPS: Math.round((OBP + SLG) * 1000) / 1000,
    ERA: t.IP > 0 ? Math.round(9 * t.ER / t.IP * 100) / 100 : 0,
    WHIP: t.IP > 0 ? Math.round((t.HA + t.BBA) / t.IP * 100) / 100 : 0,
    _components: t,
  };
}

// ── Rendering ────────────────────────────────────────────────────
function render() {
  renderRoster();
  renderPool();
  renderTargets();
  renderBudget();
}

function renderBudget() {
  let spent = 0;
  let filled = 0;
  for (const entry of Object.values(state.roster)) {
    if (entry) { spent += entry.cost; filled++; }
  }
  const remaining = BUDGET - spent;
  const el = document.getElementById("budget-amount");
  el.textContent = `$${remaining}`;
  el.className = remaining < 0 ? "over" : "amount";
  document.getElementById("slots-filled").textContent = `${filled}`;
}

function renderRoster() {
  const panel = document.getElementById("roster-panel");
  let html = "";
  let lastSection = "";

  for (const slot of SLOT_DEFS) {
    if (slot.section !== lastSection) {
      lastSection = slot.section;
      const labels = { hitters: "Hitters", pitchers: "Pitchers", bench: "Bench" };
      html += `<div class="roster-section-label">${labels[slot.section]}</div>`;
    }

    const entry = state.roster[slot.id];
    const locked = state.lockedSlots.has(slot.id);

    if (entry) {
      html += `<div class="roster-slot filled" data-slot="${slot.id}">
        <span class="pos-tag">${slot.label}</span>
        <span class="player-name">${entry.player.name}</span>
        <span class="player-cost">$${entry.cost}</span>
        <button class="lock-btn ${locked ? "locked" : ""}" data-action="lock" data-slot="${slot.id}" title="Lock/unlock">${locked ? "🔒" : "🔓"}</button>
        <button class="remove-btn" data-action="remove" data-slot="${slot.id}" title="Remove">×</button>
      </div>`;
    } else {
      html += `<div class="roster-slot empty" data-slot="${slot.id}">
        <span class="pos-tag">${slot.label}</span>
        <span class="player-name">Empty</span>
        <button class="lock-btn ${locked ? "locked" : ""}" data-action="lock" data-slot="${slot.id}" title="Lock/unlock">${locked ? "🔒" : "🔓"}</button>
      </div>`;
    }
  }

  html += `<div class="roster-actions">
    <button class="optimize-btn" id="btn-optimize">Optimize</button>
    <button id="btn-clear">Clear Unlocked</button>
  </div>`;

  panel.innerHTML = html;
}

function handleRosterClick(e) {
  const action = e.target.dataset.action;
  const slotId = e.target.dataset.slot || e.target.closest("[data-slot]")?.dataset.slot;

  if (action === "lock" && slotId) {
    if (state.lockedSlots.has(slotId)) state.lockedSlots.delete(slotId);
    else state.lockedSlots.add(slotId);
    render();
    return;
  }
  if (action === "remove" && slotId) {
    const entry = state.roster[slotId];
    if (entry) {
      state.rosteredNames.delete(normalizeName(entry.player.name));
      state.roster[slotId] = null;
    }
    render();
    return;
  }
  if (e.target.id === "btn-optimize") {
    runOptimizer();
    return;
  }
  if (e.target.id === "btn-clear") {
    for (const slot of SLOT_DEFS) {
      if (!state.lockedSlots.has(slot.id) && state.roster[slot.id]) {
        state.rosteredNames.delete(normalizeName(state.roster[slot.id].player.name));
        state.roster[slot.id] = null;
      }
    }
    render();
    return;
  }
}

// ── Player Pool Table ────────────────────────────────────────────
const HITTER_COLS = [
  { key: "name",           label: "Name",  cls: "col-name" },
  { key: "pos",            label: "Pos",   cls: "col-pos" },
  { key: "team",           label: "Team",  cls: "col-team" },
  { key: "fgDollars",      label: "FG$",   cls: "col-num" },
  { key: "espnAvgSalary",  label: "ESPN$", cls: "col-num" },
  { key: "R",              label: "R",     cls: "col-num", fg: true },
  { key: "HR",             label: "HR",    cls: "col-num", fg: true },
  { key: "RBI",            label: "RBI",   cls: "col-num", fg: true },
  { key: "SB",             label: "SB",    cls: "col-num", fg: true },
  { key: "OPS",            label: "OPS",   cls: "col-num", fg: true },
];

const PITCHER_COLS = [
  { key: "name",           label: "Name",  cls: "col-name" },
  { key: "pos",            label: "Pos",   cls: "col-pos" },
  { key: "team",           label: "Team",  cls: "col-team" },
  { key: "fgDollars",      label: "FG$",   cls: "col-num" },
  { key: "espnAvgSalary",  label: "ESPN$", cls: "col-num" },
  { key: "SO",             label: "K",     cls: "col-num", fg: true },
  { key: "W",              label: "W",     cls: "col-num", fg: true },
  { key: "SV",             label: "SV",    cls: "col-num", fg: true },
  { key: "ERA",            label: "ERA",   cls: "col-num", fg: true },
  { key: "WHIP",           label: "WHIP",  cls: "col-num", fg: true },
  { key: "IP",             label: "IP",    cls: "col-num", fg: true },
];

function getVisibleCols() {
  if (state.poolToggle === "pitchers") return PITCHER_COLS;
  if (state.poolToggle === "hitters") return HITTER_COLS;
  // "all": show a combined set
  return [
    { key: "name",           label: "Name",  cls: "col-name" },
    { key: "pos",            label: "Pos",   cls: "col-pos" },
    { key: "team",           label: "Team",  cls: "col-team" },
    { key: "fgDollars",      label: "FG$",   cls: "col-num" },
    { key: "espnAvgSalary",  label: "ESPN$", cls: "col-num" },
    { key: "R",              label: "R",     cls: "col-num", fg: true, hitter: true },
    { key: "HR",             label: "HR",    cls: "col-num", fg: true, hitter: true },
    { key: "SB",             label: "SB",    cls: "col-num", fg: true, hitter: true },
    { key: "OPS",            label: "OPS",   cls: "col-num", fg: true, hitter: true },
    { key: "SO",             label: "K",     cls: "col-num", fg: true, pitcher: true },
    { key: "W",              label: "W",     cls: "col-num", fg: true, pitcher: true },
    { key: "SV",             label: "SV",    cls: "col-num", fg: true, pitcher: true },
    { key: "ERA",            label: "ERA",   cls: "col-num", fg: true, pitcher: true },
  ];
}

function getFilteredPlayers() {
  let players = state.players;

  // Pool toggle
  if (state.poolToggle === "hitters") players = players.filter((p) => !p.isPitcher);
  if (state.poolToggle === "pitchers") players = players.filter((p) => p.isPitcher);

  // Position filter
  if (state.posFilter !== "ALL") {
    players = players.filter((p) => p.positions.includes(state.posFilter));
  }

  // Search
  if (state.search) {
    const q = state.search.toLowerCase();
    players = players.filter((p) => p.name.toLowerCase().includes(q));
  }

  // Sort
  players = [...players].sort((a, b) => {
    let va = getSortValue(a, state.sortCol);
    let vb = getSortValue(b, state.sortCol);
    if (typeof va === "string") {
      const cmp = va.localeCompare(vb);
      return state.sortDir === "asc" ? cmp : -cmp;
    }
    return state.sortDir === "asc" ? va - vb : vb - va;
  });

  return players;
}

function getSortValue(player, col) {
  if (col === "name") return player.name;
  if (col === "pos") return player.positions.join("/");
  if (col === "team") return player.team;
  if (col === "fgDollars") return player.fgDollars;
  if (col === "espnAvgSalary") return player.espnAvgSalary;
  if (player.fg && col in player.fg) return player.fg[col] || 0;
  return 0;
}

function renderPool() {
  const cols = getVisibleCols();
  const players = getFilteredPlayers();

  // Header
  const thead = document.getElementById("pool-thead");
  thead.innerHTML = `<tr>${cols.map((c) => {
    const arrow = state.sortCol === c.key
      ? `<span class="sort-arrow">${state.sortDir === "asc" ? "▲" : "▼"}</span>` : "";
    return `<th data-sort="${c.key}" class="${c.cls}">${c.label}${arrow}</th>`;
  }).join("")}</tr>`;

  // Body — limit to 200 rows for performance
  const tbody = document.getElementById("pool-tbody");
  const show = players.slice(0, 200);
  tbody.innerHTML = show.map((p) => {
    const rostered = state.rosteredNames.has(normalizeName(p.name));
    const cls = rostered ? "rostered" : "";
    return `<tr class="${cls}" data-pname="${escHtml(p.name)}">
      ${cols.map((c) => cellHtml(p, c)).join("")}
    </tr>`;
  }).join("");

  document.getElementById("pool-count").textContent = `${players.length} players`;
}

function cellHtml(player, col) {
  if (col.key === "name") return `<td class="${col.cls}">${escHtml(player.name)}</td>`;
  if (col.key === "pos") return `<td class="${col.cls}">${player.positions.join("/")}</td>`;
  if (col.key === "team") return `<td class="${col.cls}">${player.team}</td>`;
  if (col.key === "fgDollars") {
    const v = player.fgDollars;
    return `<td class="${col.cls}">${v > 0 ? "$" + v.toFixed(1) : "—"}</td>`;
  }
  if (col.key === "espnAvgSalary") {
    const v = player.espnAvgSalary;
    const cls2 = player.fgDollars > 0 && v > 0
      ? (v < player.fgDollars ? "bargain" : v > player.fgDollars * 1.2 ? "overpay" : "")
      : "";
    return `<td class="${col.cls} ${cls2}">${v > 0 ? "$" + v.toFixed(1) : "—"}</td>`;
  }
  // FG stat
  if (col.fg && player.fg) {
    let v = player.fg[col.key];
    if (v === undefined || v === null) return `<td class="${col.cls}">—</td>`;
    if (col.key === "OPS" || col.key === "ERA" || col.key === "WHIP") {
      return `<td class="${col.cls}">${v.toFixed(3)}</td>`;
    }
    return `<td class="${col.cls}">${Math.round(v)}</td>`;
  }
  return `<td class="${col.cls}">—</td>`;
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Targets Bar ──────────────────────────────────────────────────
function renderTargets() {
  const stats = computeTeamStats();
  const grid = document.getElementById("targets-grid");

  grid.innerHTML = TARGETS.map((tgt) => {
    const val = stats[tgt.key];
    const avgTarget = (tgt.a + tgt.b) / 2;
    const bestTarget = tgt.dir === "higher" ? Math.max(tgt.a, tgt.b) : Math.min(tgt.a, tgt.b);
    const worstTarget = tgt.dir === "higher" ? Math.min(tgt.a, tgt.b) : Math.max(tgt.a, tgt.b);

    let pct, color;
    if (tgt.dir === "higher") {
      pct = bestTarget > 0 ? Math.min(val / bestTarget, 1.5) : 0;
      color = val >= worstTarget ? (val >= bestTarget ? "green" : "yellow") : "red";
    } else {
      // Lower is better — invert
      if (val === 0) { pct = 0; color = "red"; }
      else {
        // pct: 1.0 means we hit the best target, >1 means we're even better
        pct = val <= bestTarget ? 1.0 : bestTarget / val;
        color = val <= bestTarget ? "green" : val <= worstTarget ? "yellow" : "red";
      }
    }

    const dispVal = tgt.type === "rate" ? val.toFixed(3) : val;
    const barPct = Math.min(Math.max(pct * 100, 0), 100);

    return `<div class="target-card">
      <div class="cat-name">${tgt.key}</div>
      <div class="cat-value">${dispVal}</div>
      <div class="cat-targets">${tgt.a} / ${tgt.b}</div>
      <div class="progress-bar"><div class="progress-fill ${color}" style="width:${barPct}%"></div></div>
    </div>`;
  }).join("");
}

// ── Slot Assignment Modal ────────────────────────────────────────
function showModal(player) {
  state.modalPlayer = player;
  const overlay = document.getElementById("modal-overlay");
  const title = document.getElementById("modal-title");
  const slotsDiv = document.getElementById("modal-slots");
  const costInput = document.getElementById("modal-cost");

  title.textContent = `Assign: ${player.name}`;
  costInput.value = Math.max(1, Math.round(player.espnAvgSalary || player.fgDollars || 1));

  // Find eligible empty slots
  const eligible = SLOT_DEFS.filter((s) =>
    !state.roster[s.id] && s.eligible(player)
  );

  if (eligible.length === 0) {
    slotsDiv.innerHTML = `<p style="color:#f85149;font-size:12px">No eligible empty slots for this player.</p>`;
    document.getElementById("modal-confirm").style.display = "none";
  } else {
    state.modalSlot = eligible[0].id;
    slotsDiv.innerHTML = eligible.map((s) =>
      `<button class="slot-option" data-slot="${s.id}">${s.label} (${s.id})</button>`
    ).join("");
    document.getElementById("modal-confirm").style.display = "";
  }

  overlay.classList.remove("hidden");
}

function hideModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  state.modalPlayer = null;
  state.modalSlot = null;
}

function assignPlayer(slotId, player, cost) {
  state.roster[slotId] = { player, cost };
  state.rosteredNames.add(normalizeName(player.name));
  render();
}

// ── Optimizer ────────────────────────────────────────────────────
function runOptimizer() {
  const currentStats = computeTeamStats();
  let spent = 0;
  for (const entry of Object.values(state.roster)) {
    if (entry) spent += entry.cost;
  }
  let budget = BUDGET - spent;

  // Count empty unlocked slots
  const emptySlots = SLOT_DEFS.filter((s) =>
    !state.roster[s.id] && !state.lockedSlots.has(s.id)
  );

  if (emptySlots.length === 0) return;

  // Scarcity order: C, SS, 2B, 3B, 1B, MI, CI, OF, P, UTIL, BN
  const scarcityOrder = ["C","SS","2B","3B","1B","MI","CI",
    "OF1","OF2","OF3","OF4",
    "P1","P2","P3","P4","P5","P6","P7","P8","P9",
    "UTIL1","UTIL2","UTIL3",
    "BN1","BN2","BN3","BN4","BN5"];

  const slotsToFill = scarcityOrder.filter((id) =>
    !state.roster[id] && !state.lockedSlots.has(id)
  );

  const available = () => state.players.filter((p) =>
    p.fg && !state.rosteredNames.has(normalizeName(p.name))
  );

  // Phase 1: Greedy fill
  for (const slotId of slotsToFill) {
    const slotDef = SLOT_DEFS.find((s) => s.id === slotId);
    if (!slotDef) continue;

    const remainingAfterThis = slotsToFill.filter((id) => !state.roster[id]).length - 1;
    const maxBid = Math.max(1, budget - remainingAfterThis);

    const candidates = available()
      .filter((p) => slotDef.eligible(p))
      .filter((p) => {
        const cost = Math.max(1, Math.round(p.espnAvgSalary || p.fgDollars || 1));
        return cost <= maxBid;
      });

    if (candidates.length === 0) continue;

    // Score each candidate
    const teamStats = computeTeamStats();
    const scored = candidates.map((p) => ({
      player: p,
      cost: Math.max(1, Math.round(p.espnAvgSalary || p.fgDollars || 1)),
      score: scorePlayer(p, teamStats),
    }));

    scored.sort((a, b) => b.score - a.score);
    const pick = scored[0];

    state.roster[slotId] = { player: pick.player, cost: pick.cost };
    state.rosteredNames.add(normalizeName(pick.player.name));
    budget -= pick.cost;
  }

  // Phase 2: Swap improvement (2 passes)
  for (let pass = 0; pass < 2; pass++) {
    let improved = false;
    for (const slotId of slotsToFill) {
      if (state.lockedSlots.has(slotId)) continue;
      const entry = state.roster[slotId];
      if (!entry) continue;

      const slotDef = SLOT_DEFS.find((s) => s.id === slotId);
      const teamStats = computeTeamStats();
      const currentScore = totalTeamScore(teamStats);

      const candidates = available()
        .filter((p) => slotDef.eligible(p))
        .slice(0, 100); // limit for performance

      for (const cand of candidates) {
        const candCost = Math.max(1, Math.round(cand.espnAvgSalary || cand.fgDollars || 1));
        const costDelta = candCost - entry.cost;

        // Check budget
        let totalSpent = 0;
        for (const e of Object.values(state.roster)) { if (e) totalSpent += e.cost; }
        if (totalSpent + costDelta > BUDGET) continue;

        // Try swap
        const oldPlayer = entry.player;
        state.roster[slotId] = { player: cand, cost: candCost };
        state.rosteredNames.delete(normalizeName(oldPlayer.name));
        state.rosteredNames.add(normalizeName(cand.name));

        const newStats = computeTeamStats();
        const newScore = totalTeamScore(newStats);

        if (newScore > currentScore) {
          improved = true;
          budget -= costDelta;
          break; // move to next slot
        } else {
          // Revert
          state.roster[slotId] = entry;
          state.rosteredNames.add(normalizeName(oldPlayer.name));
          state.rosteredNames.delete(normalizeName(cand.name));
        }
      }
    }
    if (!improved) break;
  }

  render();
}

function scorePlayer(player, teamStats) {
  if (!player.fg) return 0;
  let score = 0;
  const fg = player.fg;

  for (const tgt of TARGETS) {
    const avgTarget = (tgt.a + tgt.b) / 2;
    if (avgTarget === 0) continue;

    if (tgt.type === "counting") {
      let stat = 0;
      if (tgt.key === "K" && player.isPitcher) stat = fg.SO || 0;
      else if (tgt.key === "W" && player.isPitcher) stat = fg.W || 0;
      else if (tgt.key === "SV" && player.isPitcher) stat = fg.SV || 0;
      else if (!player.isPitcher) stat = fg[tgt.key] || 0;

      const current = teamStats[tgt.key] || 0;
      const need = Math.max(0, avgTarget - current);
      const weight = need / avgTarget;
      score += (stat / avgTarget) * (1 + weight);
    } else if (tgt.key === "OPS" && !player.isPitcher) {
      // What would team OPS be with this player?
      const c = teamStats._components;
      const newAB = c.AB + (fg.AB || 0);
      const newH = c.H + (fg.H || 0);
      const newBB = c.BB_h + (fg.BB || 0);
      const newHBP = c.HBP + (fg.HBP || 0);
      const newSF = c.SF + (fg.SF || 0);
      const new2B = c.d2B + (fg["2B"] || 0);
      const new3B = c.d3B + (fg["3B"] || 0);
      const newHR = c.HR + (fg.HR || 0);
      const newTB = (newH - new2B - new3B - newHR) + 2*new2B + 3*new3B + 4*newHR;

      if (newAB > 0) {
        const newOBP = (newH+newBB+newHBP) / (newAB+newBB+newHBP+newSF);
        const newSLG = newTB / newAB;
        const newOPS = newOBP + newSLG;
        const delta = newOPS - (teamStats.OPS || 0);
        score += delta * 50;
      }
    } else if (tgt.key === "ERA" && player.isPitcher) {
      const c = teamStats._components;
      const newIP = c.IP + (fg.IP || 0);
      const newER = c.ER + (fg.ER || 0);
      if (newIP > 0) {
        const newERA = 9 * newER / newIP;
        const delta = (teamStats.ERA || 5) - newERA;
        score += delta * 20;
      }
    } else if (tgt.key === "WHIP" && player.isPitcher) {
      const c = teamStats._components;
      const newIP = c.IP + (fg.IP || 0);
      const newHA = c.HA + (fg.H || 0);
      const newBBA = c.BBA + (fg.BB || 0);
      if (newIP > 0) {
        const newWHIP = (newHA + newBBA) / newIP;
        const delta = (teamStats.WHIP || 2) - newWHIP;
        score += delta * 50;
      }
    }
  }

  // Cost efficiency
  const cost = Math.max(1, player.espnAvgSalary || player.fgDollars || 1);
  score = score / Math.sqrt(cost);

  return score;
}

function totalTeamScore(stats) {
  let score = 0;
  for (const tgt of TARGETS) {
    const val = stats[tgt.key] || 0;
    const avgTarget = (tgt.a + tgt.b) / 2;
    if (avgTarget === 0) continue;
    if (tgt.dir === "higher") {
      score += Math.min(val / avgTarget, 1.5);
    } else {
      score += val > 0 ? Math.min(avgTarget / val, 1.5) : 0;
    }
  }
  return score;
}

// ── Event Wiring ─────────────────────────────────────────────────
function init() {
  // Roster panel delegation (once, not per render)
  document.getElementById("roster-panel").addEventListener("click", handleRosterClick);

  // Search
  document.getElementById("search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderPool();
  });

  // Position filter
  document.getElementById("pos-filter").addEventListener("change", (e) => {
    state.posFilter = e.target.value;
    renderPool();
  });

  // Pool toggle
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.poolToggle = btn.dataset.pool;
      state.sortCol = "espnAvgSalary"; // reset sort
      renderPool();
    });
  });

  // Table header sort
  document.getElementById("pool-thead").addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (!th) return;
    const col = th.dataset.sort;
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortCol = col;
      state.sortDir = col === "name" ? "asc" : "desc";
    }
    renderPool();
  });

  // Table row click → assign
  document.getElementById("pool-tbody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr || tr.classList.contains("rostered")) return;
    const pname = tr.dataset.pname;
    const player = state.players.find((p) => p.name === pname);
    if (player) showModal(player);
  });

  // Modal slot selection
  document.getElementById("modal-slots").addEventListener("click", (e) => {
    const btn = e.target.closest(".slot-option");
    if (!btn) return;
    document.querySelectorAll(".slot-option").forEach((b) => b.style.borderColor = "#30363d");
    btn.style.borderColor = "#58a6ff";
    state.modalSlot = btn.dataset.slot;
  });

  // Modal confirm
  document.getElementById("modal-confirm").addEventListener("click", () => {
    if (!state.modalPlayer || !state.modalSlot) return;
    const cost = parseInt(document.getElementById("modal-cost").value) || 1;
    assignPlayer(state.modalSlot, state.modalPlayer, cost);
    hideModal();
  });

  // Modal cancel
  document.getElementById("modal-cancel").addEventListener("click", hideModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) hideModal();
  });
}

// ── Bootstrap ────────────────────────────────────────────────────
(async () => {
  init();
  await loadData();
  render();
})();
