# ESPN Auction Draft DOM Selector Map

**Phase 39 — Generated: 2026-03-14**
**Status: VERIFIED via Chrome DevTools MCP (2026-03-14 live draft)**

> Selectors verified against a live ESPN auction draft (Practice Draft, leagueId 1662791746).
> Status key: CONFIRMED = verified present in live DOM, FAILED = selector returned 0 matches, NEW = discovered during live verification.

## iframe Status

**Draft content is NOT in an iframe.** All draft selectors work on the main frame.
Iframes found: Disney ID auth (`oneid-iframe`), Nielsen tracking (`lsframe`) — none contain draft content.

## Selector Groups

---

### GROUP 1: Draft Board Container
**Purpose:** Root element for MutationObserver attachment in bootstrapDraftObserver()
**Source:** dom-observers.ts lines 18-31, 360-364
**Criticality:** HIGH — if this fails, no draft observation occurs

| Selector | Status | Notes |
|----------|--------|-------|
| `.draft-content-wrapper` | CONFIRMED | `<div class="draft-content-wrapper flex flex-column">` — 4 children |
| `[class*="draftBoard"]` | CONFIRMED | 3 matches: `.draftBoard`, `.draftBoardGrid__container`, `.draftBoardGrid` |
| `.players-table` | CONFIRMED | 5 matches |
| `[class*="draft-columns"]` | CONFIRMED | 1 match |
| `.draftBoardContainer` | FAILED | Does not exist |
| `[class*="DraftBoard"]` | FAILED | Does not exist |
| `[id*="draftBoard"]` | FAILED | Does not exist |
| `[data-testid*="draft"]` | CONFIRMED | But points to pick-train (`draft-order-set`), NOT the board |
| `.draft-board` | FAILED | Does not exist |
| `#draft-content` | FAILED | Does not exist |

**Best root selectors:** `.draft-content-wrapper` (unique, stable) or `[class*="draftBoard"]` (matches board grid).

---

### GROUP 2: Pick Cells & Rows
**Purpose:** Identify individual pick cells in the draft board grid
**Source:** dom-observers.ts lines 36-52
**Criticality:** HIGH — parsing completed picks depends on this

| Selector | Status | Notes |
|----------|--------|-------|
| `[style*="grid-area"]` | CONFIRMED | 377 matches — ESPN uses CSS Grid for board positioning |
| `.draft-board-grid-pick-cell` | NEW CONFIRMED | 364 matches — actual pick cell class |
| `[data-player-id]` | CONFIRMED | 15 matches (on buttons, not cells directly) |
| `[data-testid="auction-pick"]` | NEW CONFIRMED | 13 matches — pick entries in pick train |
| `[data-pick-number]` | CONFIRMED | 1 match (sparse) |
| `.draftBoardCell` | FAILED | Does not exist |
| `.pickCell` | FAILED | Does not exist |

**Best pick cell selector:** `.draft-board-grid-pick-cell` (structural, unique to board).

---

### GROUP 3: Completed Picks
**Purpose:** Distinguish completed picks from empty cells
**Source:** dom-observers.ts lines 57-69
**Criticality:** MEDIUM — draft state tracking

| Selector | Status | Notes |
|----------|--------|-------|
| `.completedPick` | CONFIRMED | Class on completed pick cells |
| `.winningPrice` | CONFIRMED | Auction price child element |
| `[class*="winningPrice"]` | CONFIRMED | Wildcard also works |
| `[data-player-id]:not([data-player-id=""])` | CONFIRMED | Non-empty player-id |
| `[data-completed="true"]` | FAILED | Does not exist |
| `[data-status="completed"]` | FAILED | Does not exist |

**Completed pick HTML structure:**
```html
<div class="draft-board-grid-pick-cell completedPick" style="grid-area: 8 / 1; --position-color: 223, 132, 255;">
  <div class="pickCellTop">
    <div class="rosterSlot">OF</div>
    <div class="winningPrice">$76</div>
  </div>
  <div class="pickCellMiddle">
    <span class="playerFirstName">Aaron</span>
    <span class="playerLastName">Judge</span>
  </div>
  <div class="pickCellBottom">
    <span class="playerProTeam">NYY</span>
    <span class="positionPill">OF</span>
  </div>
</div>
```

**New structural selectors:** `.pickCellTop`, `.pickCellMiddle`, `.pickCellBottom`, `.rosterSlot` — all CONFIRMED.

---

### GROUP 4: Current Auction Player (Live Bidding)
**Purpose:** Extract the currently nominated player's name, position, team, bid amount
**Source:** dom-observers.ts lines 998-1062
**Criticality:** CRITICAL — drives all engine signals for the active nomination

| Selector | Status | Notes |
|----------|--------|-------|
| `[data-testid="player-selected"]` | CONFIRMED | Primary — ESPN test ID |
| `.player-selected` | CONFIRMED | Class fallback |
| `.pickArea` | CONFIRMED | Container for auction UI |
| `.playerinfo__playername` | CONFIRMED | Player name text (20 matches across page) |
| `.playerinfo__playerpos` | CONFIRMED | Player position text (20 matches) |
| `.playerinfo__playerteam` | CONFIRMED | MLB team abbreviation (20 matches) |
| `.current-amount` | CONFIRMED | Current bid dollar amount |
| `img[src*="/players/full/"]` | CONFIRMED | Headshot URL → ESPN player ID extraction |
| `[class*="currentPlayer"]` | FAILED | Does not exist |
| `[class*="activePlayer"]` | FAILED | Does not exist |

**Headshot URL format:** `https://a.espncdn.com/combiner/i?img=/i/headshots/mlb/players/full/{espnPlayerId}.png&w=188&h=140&cb=1`

---

### GROUP 5: Auction Value Table (fixedDataTable)
**Purpose:** Scrape ESPN's player table for auction values, names, positions, queue buttons
**Source:** dom-observers.ts lines 1132-1220
**Criticality:** HIGH — feeds auction value data and queue button detection

| Selector | Status | Notes |
|----------|--------|-------|
| `.fixedDataTableLayout_rowsContainer` | CONFIRMED | 5 matches (multiple table sections) |
| `.fixedDataTableRowLayout_main[role="row"]` | CONFIRMED | 49 rows |
| `.public_fixedDataTableCell_cellContent` | CONFIRMED | 384 cell content wrappers |
| `a.player-news[title]` | CONFIRMED | 23 player name anchors |
| `.positionPill` | CONFIRMED | 23 position badges |
| `.playerinfo__playerteam` | CONFIRMED | MLB team in table row |
| `button[data-player-id]` | CONFIRMED | 15 action buttons |
| `.fixedDataTableCellGroupLayout_cellGroupWrapper` | CONFIRMED | Cell groups |

All selectors CONFIRMED. fixedDataTable BEM classes are stable (third-party library).

---

### GROUP 6: Nomination Queue (CRITICAL)
**Purpose:** Detect queued players, find queue/select/dequeue buttons, populate nomination queue
**Source:** auto-bid-controller.ts lines 6-25, dom-observers.ts lines 1278-1329
**Criticality:** CRITICAL — ROOT CAUSE OF 10+ PRIOR REGRESSIONS

| Selector | Status | Notes |
|----------|--------|-------|
| `button.action-btn[data-player-id]` | CONFIRMED | 15 matches — primary action button |
| `button[data-player-id]` | CONFIRMED | Same 15 (no extra matches in this draft) |
| `button.Button--select[data-player-id]:not([disabled])` | UNVERIFIED | 0 during non-turn state (expected) — needs turn-state verification |

**Button text values (LIVE VERIFIED):**
- `"queue"` → CONFIRMED (player not queued, not user's turn). Class: `Button Button--sm Button--alt ttu Button--queue action-btn`
- `"select"` → UNVERIFIED (missed turn window — draft auto-advanced)
- `"dequeue"` / `"deselect"` / `"remove"` → UNVERIFIED (no players were queued during test)

**Button class pattern:** `Button--queue` class present when text is "queue". Likely `Button--select` when text is "select".

**Queue sidebar:** `.pick-queue` container (class `pick-queue w-100 ph4 empty` when no players queued).

---

### GROUP 7: Player Info Sub-selectors
**Purpose:** Extract player name, team, position from pick cells and cards
**Source:** dom-observers.ts lines 431-498
**Criticality:** MEDIUM — fallback chains handle most cases

| Selector | Status | Notes |
|----------|--------|-------|
| `.playerFirstName` | CONFIRMED | 2 matches (inside `.pickCellMiddle`) |
| `.playerLastName` | CONFIRMED | 2 matches |
| `.playerProTeam` | NEW CONFIRMED | 4 matches — MLB team in pick cells (replaces `.teamAbbrev`) |
| `.positionPill` | CONFIRMED | 23 matches (shared with GROUP 5) |
| `.playerName` | FAILED | Does not exist |
| `[class*="playerName"]` | FAILED | Does not exist |
| `.player-name` | FAILED | Does not exist |
| `.teamAbbrev` | FAILED | Does not exist |
| `[class*="teamAbbrev"]` | FAILED | Does not exist |

**Key discovery:** Player names in pick cells use `.playerFirstName` + `.playerLastName` (split), NOT `.playerName`. MLB team uses `.playerProTeam`, NOT `.teamAbbrev`.

---

### GROUP 8: Turn Detection (My Turn to Nominate)
**Purpose:** Determine when auto-nomination should fire
**Source:** auto-bid-controller.ts lines 319-493
**Criticality:** CRITICAL — false positives nominate at wrong time, false negatives miss turns

**Strategy 1 — Body text scan:**
- Status: PARTIALLY VERIFIED — during observed turn window, pickArea contained "Your turn to nominate a player!" and "Select a player below to nominate"
- `document.body.innerText` search should match these strings

**Strategy 2 — Pick train active team:**
| Selector | Status | Notes |
|----------|--------|-------|
| `.pick-train` | FAILED | Direct class does not exist |
| `[class*="pick-train"]` | CONFIRMED | 2 matches (`pick-train__content`, `pick-train__content__picks-container`) |
| `.auction-pick-component--own` | NEW CONFIRMED | Marks OUR team in pick train |
| `.auction-pick-component--selecting` | NEW CONFIRMED | Marks currently-nominating team |
| `.picklist--item.picklist--pick` | NEW CONFIRMED | Individual pick entries in train |

**Strategy 3 — Pick area text:**
| Selector | Status | Notes |
|----------|--------|-------|
| `.pickArea` | CONFIRMED | Container |
| `[data-testid="player-selected"]` | CONFIRMED | Player already in area (bidding active) |
- During our turn: `<h3>Your turn to nominate a player!</h3><p>Select a player below to nominate</p>`
- During others' turn: Shows nominated player info + bid form

**Strategy 4 — Select buttons exist (MOST RELIABLE per code comments):**
| Selector | Status | Notes |
|----------|--------|-------|
| `button.Button--select[data-player-id]:not([disabled])` | UNVERIFIED | 0 during non-turn (expected) |
- Could not catch during the brief turn window

**Strategy 5 — Queue buttons + no bidding form:**
| Selector | Status | Notes |
|----------|--------|-------|
| `button[data-player-id]` | CONFIRMED | Queue buttons exist |
| `form.bidding-form__default` | CONFIRMED | Present during bidding, absent otherwise |

**Recommendation:** Strategies 3 + 5 are fully CONFIRMED. Strategy 2 has new reliable selectors (`--own`, `--selecting`). Strategy 4 structurally sound but unverified timing-wise.

---

### GROUP 9: Player Search (Auto-Queue & Auto-Nominate)
**Purpose:** Type into ESPN search, find results, click to queue/nominate
**Source:** auto-bid-controller.ts lines 947-1021, 1148-1285
**Criticality:** HIGH — search-and-queue is the fallback when player isn't visible in table

| Selector | Status | Notes |
|----------|--------|-------|
| `.playersSearch input.form__control` | CONFIRMED | Search input field |
| `input[placeholder="Player Name"]` | CONFIRMED | Placeholder text verified: "Player Name" |
| `.player--search--matches` | CONFIRMED | Search dropdown container (0 when no search active) |
| `button.player--search--match` | CONFIRMED | Individual search result |
| `button.player--search--match[data-player-search-playerid="${id}"]` | CONFIRMED | Result by player ID |
| `[data-player-search-playername]` | CONFIRMED | Name attribute on result |
| `.player--search--clear` | CONFIRMED | Clear search button |
| `div.player--search--clear svg` | CONFIRMED | SVG child — 1 match |

All search selectors CONFIRMED.

---

### GROUP 10: Nomination/Bid Confirmation Buttons
**Purpose:** Click to confirm nomination or place bid after selecting a player
**Source:** auto-bid-controller.ts lines 1336-1362
**Criticality:** HIGH — final step in nomination and bidding flows

| Selector | Status | Notes |
|----------|--------|-------|
| `button.bid-player__button` | CONFIRMED | 2 matches during bidding: quick offer + manual offer |
| `form.bidding-form__default button.bid-player__button` | CONFIRMED | Scoped to bidding form — 1 match |
| `.pickArea button` | CONFIRMED | 2 matches (same as bid-player__button) |
| `button.nominate-button` | FAILED | Does not exist |
| `button[class*="nominate"]` | FAILED | Does not exist |

**Bid button details:**
- Quick offer: `Button Button--default bid-player__button` → "Offer $59" (enabled, red bg)
- Manual offer: `Button Button--default Button--disabled bid-player__button ttu` → "Offer" (disabled until manual amount entered)

---

## Verified Stable Selectors (Primary Targets)

| Group | Selector | Purpose |
|-------|----------|---------|
| 1 | `.draft-content-wrapper` | Draft board root container |
| 1 | `[class*="draftBoard"]` | Board grid elements |
| 2 | `[style*="grid-area"]` | Pick cells in draft board |
| 2 | `.draft-board-grid-pick-cell` | Pick cell class (NEW) |
| 3 | `.completedPick` | Completed pick marker |
| 3 | `.winningPrice` | Auction price on completed picks |
| 3 | `.playerFirstName` / `.playerLastName` | Player name in pick cells |
| 3 | `.playerProTeam` | MLB team in pick cells (NEW) |
| 4 | `[data-testid="player-selected"]` | Current auction player root |
| 4 | `.playerinfo__playername` | Nominated player name |
| 4 | `.playerinfo__playerpos` | Nominated player position |
| 4 | `.playerinfo__playerteam` | Nominated player MLB team |
| 4 | `.current-amount` | Current bid amount |
| 4 | `img[src*="/players/full/"]` | Player headshot → ESPN ID |
| 5 | `.fixedDataTableLayout_rowsContainer` | Auction table body |
| 5 | `.fixedDataTableRowLayout_main[role="row"]` | Table rows |
| 5 | `.public_fixedDataTableCell_cellContent` | Cell content |
| 5 | `a.player-news[title]` | Player name in table |
| 5 | `.positionPill` | Position badge |
| 6 | `button.action-btn[data-player-id]` | Queue/Select action button |
| 8 | `.pickArea` | Auction pick area container |
| 8 | `.auction-pick-component--own` | Our team in pick train (NEW) |
| 8 | `.auction-pick-component--selecting` | Nominating team (NEW) |
| 8 | `form.bidding-form__default` | Bidding form presence |
| 9 | `.playersSearch input.form__control` | Search input |
| 9 | `input[placeholder="Player Name"]` | Search input fallback |
| 9 | `.player--search--matches` | Search dropdown |
| 9 | `button.player--search--match` | Search result button |
| 9 | `.player--search--clear` | Clear search |
| 10 | `button.bid-player__button` | Nominate/bid confirm |

## data-testid Values Found

```
draft-order-set, clock, auction-pick, croppable-image, auto-pick,
nominationTimeDropdown, bidTimeDropdown, message-filter-radio-group,
player-selected
```

## Live Verification Checklist

- [x] GROUP 1: Found actual draft board root element (`.draft-content-wrapper`, `[class*="draftBoard"]`)
- [x] GROUP 2: Confirmed `[style*="grid-area"]` (377 matches), discovered `.draft-board-grid-pick-cell` (364)
- [x] GROUP 3: `.completedPick` CONFIRMED, full HTML structure documented
- [x] GROUP 4: All primary selectors CONFIRMED, `currentPlayer`/`activePlayer` FAILED
- [x] GROUP 5: All selectors CONFIRMED (fixedDataTable BEM stable)
- [x] GROUP 6: Button text "queue" CONFIRMED, `Button--queue` class CONFIRMED
- [ ] GROUP 6: Button text "select" / `Button--select` class — UNVERIFIED (missed turn window)
- [x] GROUP 7: `.playerFirstName`/`.playerLastName` CONFIRMED, `.playerProTeam` NEW, `.playerName`/`.teamAbbrev` FAILED
- [x] GROUP 8: Pick train `--own`/`--selecting` NEW, `form.bidding-form__default` CONFIRMED
- [x] GROUP 9: All selectors CONFIRMED including placeholder text
- [x] GROUP 10: `button.bid-player__button` CONFIRMED (2 buttons), `button.nominate-button` FAILED
- [x] iframe: Draft NOT in iframe — CONFIRMED
