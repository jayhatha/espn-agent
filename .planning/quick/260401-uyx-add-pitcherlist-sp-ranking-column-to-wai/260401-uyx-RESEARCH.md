# Quick Task: Add PitcherList SP Ranking Column to Waiver Page

**Researched:** 2026-03-31
**Domain:** PitcherList adapter + waiver page free agents table
**Confidence:** HIGH

---

## What the PitcherList Adapter Already Does

`packages/backend/src/adapters/pitcherlist.ts` is fully functional. It exposes one public method:

```typescript
adapter.getRankings(): Promise<ExternalRankingEntry[]>
```

The flow: archive page discovery → fetch latest article → `parsePitcherlistTiers()` → `ExternalRankingEntry[]`. Has 6-hour LRU cache. Delegates to `SCRAPER_URL` microservice when set, falls back to direct scrape.

**What it does NOT return: a numeric rank.** `ExternalRankingEntry` has:
- `playerName: string`
- `verdict: "start" | "lean_start" | "neutral" | "lean_sit" | "sit"`
- `tier?: string` (e.g., "Auto-Start", "Probably Start", "Questionable Start", "Do Not Start")
- `source`, `sourceUrl`, `articleTitle`, `scrapedAt`

There is no `rank: number` field. The adapter returns tier groupings, not an ordered top-100 list.

**Implication:** "PitcherList SP ranking" in this task likely means the tier/verdict, not a numeric rank 1-100. The adapter does not scrape a numbered ranking list — it scrapes weekly start/sit articles. Confirm with user whether they want the tier label or a numeric position within the tier (e.g., position 3 among "Auto-Starts").

---

## Integration Point: Where to Add Ranking Data

**Best approach: enrich `/api/leagues/:id/free-agents` response** (not a separate endpoint).

Rationale:
- The waiver manual eval view already fetches free agents in one query and builds `faRows` from the result
- The PitcherlistAdapter already has caching — calling it server-side on each `/free-agents` request has negligible overhead (6-hour LRU)
- A separate frontend API call would require a second query and client-side join logic
- The sit-start advisor (`agents/sit-start-advisor.ts`) already calls `pitcherlistAdapter.getRankings()` — the same pattern applies here

**Modification to `/api/leagues/:id/free-agents`:**
1. Instantiate `PitcherlistAdapter` inside the handler
2. Call `getRankings()` (cached, fast)
3. Build a `Map<normalizedName, ExternalRankingEntry>` using `normalizePitcherName()` (already exported from adapter)
4. After building `enriched`, add `pitcherlistVerdict` and `pitcherlistTier` fields to each SP/P player

---

## Player Name Matching

`normalizePitcherName()` is already exported from `pitcherlist.ts`:

```typescript
export function normalizePitcherName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}
```

This strips diacritics and non-alpha characters (e.g., "Sánchez" → "sanchez"). Apply the same normalization to both the free agent `playerName` and the `ExternalRankingEntry.playerName` for the lookup.

No ESPN ID matching is possible — PitcherList has no ESPN IDs. Name normalization is the only available match key, which is what the sit-start advisor already uses.

---

## Current Free Agents Table (Manual Eval View)

The free agents table renders in `viewMode === "manual"`, inside the "Add from Waiver Wire" section (lines 722-774 of waivers/page.tsx).

**Current columns:**
| Name | Pos | % Own | % Start | [stat columns by position filter] |

Stat columns are driven by `showPitcherStats` / `showHitterStats` / `showAllStats` (based on `positionFilter`). When SP is selected: W, SV, K, ERA, WHIP.

**Where to insert the rank column:**
After "Pos" and before "% Own" — or after "% Start" — for SP-filtered view. Since it only applies to pitchers, the cleanest approach is:
- Add `plRank` field to `faRows` (the flat row data in `useMemo`)
- Render it as a sortable column that only appears when `showPitcherStats || showAllStats`
- Display the tier badge ("Auto-Start", "Probably Start", etc.) or a short label ("Start", "Lean", "Qstn", "Sit")

**Sort key:** `plRank` as a numeric value (tier priority: start=4, lean_start=3, neutral=2, lean_sit=1, sit=0, null=-1) so the column is sortable.

---

## Data Flow Summary

```
Backend (/free-agents handler)
  └── PitcherlistAdapter.getRankings()         [6hr LRU cache]
        └── Map<normalizedName, entry>
  └── freeAgentData.map(fa => {
        ...existing fields,
        pitcherlistVerdict: map.get(normalizePitcherName(fa.name))?.verdict ?? null,
        pitcherlistTier: map.get(normalizePitcherName(fa.name))?.tier ?? null,
      })

Frontend (FreeAgent interface + faRows useMemo)
  └── Add pitcherlistVerdict and pitcherlistTier to FreeAgent interface
  └── faRows: add plRank (numeric tier priority) and plTier (display string)
  └── Table: add sortable "PL" column (show tier badge) in pitcher stat section
```

---

## Key Constraints

- `normalizePitcherName` already handles diacritics — reuse it, don't reinvent
- PitcherList only covers SP starters in weekly articles — RPs will have no match, which is correct
- The `pitcherlistVerdict` field is nullable — column should show "--" gracefully when no match
- Graceful degradation: if `getRankings()` returns empty (scrape failure), all `pitcherlistVerdict` values are null; column shows "--" without breaking the table
- Don't add the column to the Roster (drop) table — PitcherList rankings are for add candidates, not drop decisions

---

## Sources

- `packages/backend/src/adapters/pitcherlist.ts` — adapter implementation (HIGH)
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx` — current table structure (HIGH)
- `packages/backend/src/api/recommendations.ts` — `/free-agents` endpoint (HIGH)
- `packages/shared/src/types.ts:384` — `ExternalRankingEntry` type definition (HIGH)
