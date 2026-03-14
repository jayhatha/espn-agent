# ESPN Auction Draft DOM Selector Map

**Phase 39 — Generated: 2026-03-14**
**Status: PARTIAL — NEEDS LIVE VERIFICATION**

> This map was generated from codebase analysis (dom-observers.ts, auto-bid-controller.ts, content.tsx).
> Selectors marked CONFIRMED have inline "verified 2026" comments in source. All others are UNTESTED
> against the current ESPN draft page and must be verified via Chrome DevTools MCP before Phase 40 ships.

## How to Use

Phase 40 implementation should:
1. Use CONFIRMED selectors as primary targets
2. Replace FAILED selectors with alternatives from the fallback list
3. Verify all UNTESTED selectors before shipping — do not guess
4. Prefer selector stability order: `data-testid` > `aria-*` > `data-*` > BEM class > dynamic class

## Selector Groups

---

### GROUP 1: Draft Board Container
**Purpose:** Root element for MutationObserver attachment in bootstrapDraftObserver()
**Source:** dom-observers.ts lines 18-31, 360-364
**Criticality:** HIGH — if this fails, no draft observation occurs

| Selector | Status | Notes |
|----------|--------|-------|
| `.draftBoardContainer` | UNTESTED | Primary placeholder |
| `[class*="draftBoard"]` | UNTESTED | Wildcard fallback |
| `[class*="DraftBoard"]` | UNTESTED | CamelCase variant |
| `[id*="draftBoard"]` | UNTESTED | ID-based fallback |
| `.draft-content-wrapper` | UNTESTED | Content wrapper |
| `[class*="draft-columns"]` | UNTESTED | Column layout |
| `[style*="grid-template"]` | UNTESTED | Grid-based detection |
| `[data-testid*="draft"]` | UNTESTED | Test ID (preferred if exists) |
| `.draft-board` | UNTESTED | Bootstrap narrower target |
| `.players-table` | UNTESTED | Bootstrap fallback |
| `#draft-content` | UNTESTED | ID fallback |

**Recommendation:** Use MCP to find the actual root container. Run `document.querySelector('[data-testid*="draft"]')` first — ESPN React apps often use data-testid. Fall back to grid-template detection.

---

### GROUP 2: Pick Cells & Rows
**Purpose:** Identify individual pick cells in the draft board grid
**Source:** dom-observers.ts lines 36-52
**Criticality:** HIGH — parsing completed picks depends on this

| Selector | Status | Notes |
|----------|--------|-------|
| `[style*="grid-area"]` | CONFIRMED | ESPN uses inline grid-area styles for positioning |
| `.draftBoardCell` | UNTESTED | Class-based |
| `.pickCell` | UNTESTED | Class-based |
| `[data-player-id]` | CONFIRMED | Data attribute on cells with drafted players |
| `[data-pick-number]` | UNTESTED | May exist for pick ordering |
| `[data-testid*="pick"]` | UNTESTED | Test ID preferred if exists |

**Recommendation:** `[style*="grid-area"]` is confirmed and structurally stable (ESPN uses CSS Grid for the board). Use as primary.

---

### GROUP 3: Completed Picks
**Purpose:** Distinguish completed picks from empty cells
**Source:** dom-observers.ts lines 57-69
**Criticality:** MEDIUM — draft state tracking

| Selector | Status | Notes |
|----------|--------|-------|
| `.completedPick` | UNTESTED | Class marker |
| `[data-completed="true"]` | UNTESTED | Data attribute |
| `[data-status="completed"]` | UNTESTED | Status attribute |
| `[data-player-id]:not([data-player-id=""])` | CONFIRMED | Non-empty player-id = completed pick |
| `.winningPrice` | CONFIRMED | Auction price element (only on completed picks) |
| `[class*="winningPrice"]` | UNTESTED | Wildcard fallback |

**Recommendation:** `[data-player-id]:not([data-player-id=""])` combined with `.winningPrice` child detection. Both confirmed.

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
| `.playerinfo__playername` | CONFIRMED | Player name text |
| `.playerinfo__playerpos` | CONFIRMED | Player position text |
| `.playerinfo__playerteam` | CONFIRMED | MLB team abbreviation |
| `.current-amount` | CONFIRMED | Current bid dollar amount |
| `img[src*="/players/full/"]` | CONFIRMED | Headshot URL → ESPN player ID extraction |
| `[class*="currentPlayer"]` | UNTESTED | Generic fallback |
| `[class*="activePlayer"]` | UNTESTED | Generic fallback |

**Recommendation:** All primary selectors CONFIRMED. This is the most reliable group. Use `[data-testid="player-selected"]` as root, then child queries for info fields.

---

### GROUP 5: Auction Value Table (fixedDataTable)
**Purpose:** Scrape ESPN's player table for auction values, names, positions, queue buttons
**Source:** dom-observers.ts lines 1132-1220
**Criticality:** HIGH — feeds auction value data and queue button detection

| Selector | Status | Notes |
|----------|--------|-------|
| `.fixedDataTableLayout_rowsContainer` | CONFIRMED | Table body container |
| `.fixedDataTableRowLayout_main[role="row"]` | CONFIRMED | Individual rows (skip aria-rowindex="1" header) |
| `.public_fixedDataTableCell_cellContent` | CONFIRMED | Cell content wrapper (first = dollar value) |
| `a.player-news[title]` | CONFIRMED | Player name anchor with title attr |
| `.positionPill` | CONFIRMED | Position badge element |
| `.playerinfo__playerteam` | CONFIRMED | MLB team in table row |
| `button[data-player-id]` | CONFIRMED | Action button per player |
| `.fixedDataTableCellGroupLayout_cellGroupWrapper` | CONFIRMED | Cell group (fixed vs scrollable columns) |

**Recommendation:** All selectors CONFIRMED. ESPN's fixedDataTable uses stable BEM-style class names. This is likely a third-party table library with consistent naming.

---

### GROUP 6: Nomination Queue (CRITICAL)
**Purpose:** Detect queued players, find queue/select/dequeue buttons, populate nomination queue
**Source:** auto-bid-controller.ts lines 6-25, dom-observers.ts lines 1278-1329
**Criticality:** CRITICAL — ROOT CAUSE OF 10+ PRIOR REGRESSIONS

| Selector | Status | Notes |
|----------|--------|-------|
| `button.action-btn[data-player-id]` | CONFIRMED | Primary action button selector |
| `button[data-player-id]` | CONFIRMED | Fallback (matches non-action buttons too) |
| `button.Button--select[data-player-id]:not([disabled])` | CONFIRMED | Turn detection: enabled Select buttons |

**Button text values (from code analysis, NEEDS LIVE VERIFICATION):**
- `"dequeue"` / `"deselect"` / `"remove"` → player IS queued
- `"queue"` → player not queued (not user's turn)
- `"select"` → player not queued (IS user's turn to nominate)

**Known issues:**
- `button[data-player-id]` without `.action-btn` matched player name links and stat cells (quick task 90 fix)
- Button text detection is case-insensitive toLowerCase() comparison
- Queue state scraping walks `.fixedDataTableRowLayout_main[role='row']` rows and checks button text

**Recommendation:** `button.action-btn[data-player-id]` is CONFIRMED primary. Always prefer over bare `button[data-player-id]`. **MUST verify actual button text values against live draft** — ESPN may change text between seasons.

---

### GROUP 7: Player Info Sub-selectors
**Purpose:** Extract player name, team, position from pick cells and cards
**Source:** dom-observers.ts lines 431-498
**Criticality:** MEDIUM — fallback chains handle most cases

| Selector | Status | Notes |
|----------|--------|-------|
| `.playerName` | UNTESTED | Primary name class |
| `[class*="playerName"]` | UNTESTED | Wildcard |
| `.player-name` | UNTESTED | Kebab-case |
| `.playerFirstName` / `.playerLastName` | UNTESTED | Split name fields |
| `.teamAbbrev` | UNTESTED | MLB team abbreviation |
| `[class*="teamAbbrev"]` | UNTESTED | Wildcard |
| `.positionPill` | CONFIRMED | Position badge (shared with GROUP 5) |

**Recommendation:** These selectors are used inside completed pick cells. Many are placeholders. Use MCP to inspect a completed pick cell and find actual class names. `.positionPill` is the only confirmed one.

---

### GROUP 8: Turn Detection (My Turn to Nominate)
**Purpose:** Determine when auto-nomination should fire
**Source:** auto-bid-controller.ts lines 319-493
**Criticality:** CRITICAL — false positives nominate at wrong time, false negatives miss turns

**Strategy 1 — Body text scan:**
- `document.body.innerText` contains "nominate a player" or "select a player"
- Status: UNTESTED against current ESPN text

**Strategy 2 — Pick train active team:**
| Selector | Status | Notes |
|----------|--------|-------|
| `.pick-train` | UNTESTED | Container |
| `[class*="pickTrain"]` | UNTESTED | Wildcard |
| `.active` / `[class*="active"]` / `[class*="current"]` | UNTESTED | Active team indicator |
- Checks active element text for "your" or "my turn"

**Strategy 3 — Pick area text:**
| Selector | Status | Notes |
|----------|--------|-------|
| `.pickArea` | CONFIRMED | Container |
| `[data-testid="player-selected"]` | CONFIRMED | Player already in area |
- Checks pickArea text for "nominate" or "select a player"
- Aborts if `[data-testid="player-selected"]` exists (player already nominated)

**Strategy 4 — Select buttons exist (MOST RELIABLE per code comments):**
| Selector | Status | Notes |
|----------|--------|-------|
| `button.Button--select[data-player-id]:not([disabled])` | CONFIRMED | Primary indicator |
- If these buttons exist in the table, it's user's turn

**Strategy 5 — Queue buttons + no bidding form:**
| Selector | Status | Notes |
|----------|--------|-------|
| `button[data-player-id]` | CONFIRMED | Queue buttons exist |
| `form.bidding-form__default` | UNTESTED | No active bidding |
- Combines enabled queue buttons with absence of bidding form

**Recommendation:** Strategy 4 is CONFIRMED and most reliable. Strategy 3 uses confirmed selectors. Strategies 1, 2, 5 need live verification. Phase 40 should consolidate to strategies 3+4 as primary, with others as fallback.

---

### GROUP 9: Player Search (Auto-Queue & Auto-Nominate)
**Purpose:** Type into ESPN search, find results, click to queue/nominate
**Source:** auto-bid-controller.ts lines 947-1021, 1148-1285
**Criticality:** HIGH — search-and-queue is the fallback when player isn't visible in table

| Selector | Status | Notes |
|----------|--------|-------|
| `.playersSearch input.form__control` | CONFIRMED | Search input field |
| `input[placeholder="Player Name"]` | UNTESTED | Placeholder-based fallback |
| `.player--search--matches` | CONFIRMED | Search dropdown container |
| `button.player--search--match` | CONFIRMED | Individual search result |
| `button.player--search--match[data-player-search-playerid="${id}"]` | CONFIRMED | Result by player ID |
| `[data-player-search-playername]` | CONFIRMED | Name attribute on result |
| `.player--search--clear` | CONFIRMED | Clear search button |
| `div.player--search--clear svg` | UNTESTED | SVG child fallback |

**Recommendation:** Search selectors are largely CONFIRMED. The `player--search--*` BEM naming is stable. Verify `input[placeholder="Player Name"]` text hasn't changed.

---

### GROUP 10: Nomination/Bid Confirmation Buttons
**Purpose:** Click to confirm nomination or place bid after selecting a player
**Source:** auto-bid-controller.ts lines 1336-1362
**Criticality:** HIGH — final step in nomination and bidding flows

| Selector | Status | Notes |
|----------|--------|-------|
| `button.bid-player__button` | CONFIRMED | Primary nominate/bid confirm |
| `button.nominate-button` | UNTESTED | Alternative |
| `button[class*="nominate"]` | UNTESTED | Wildcard |
| `.pickArea button` | UNTESTED | Defensive: any button in pick area |
| `form.bidding-form__default button.bid-player__button` | UNTESTED | Scoped to bidding form |

**Recommendation:** `button.bid-player__button` is CONFIRMED. Verify it still works for both nomination and bid confirmation.

---

## Stable Selector Recommendations for Phase 40

These are CONFIRMED selectors only, ordered by group. Phase 40 should use these as primary targets.

| Group | Selector | Purpose |
|-------|----------|---------|
| 2 | `[style*="grid-area"]` | Pick cells in draft board |
| 3 | `[data-player-id]:not([data-player-id=""])` | Completed picks |
| 3 | `.winningPrice` | Auction price on completed picks |
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
| 5 | `button[data-player-id]` | Player action button |
| 6 | `button.action-btn[data-player-id]` | Queue/Select action button (primary) |
| 6 | `button.Button--select[data-player-id]:not([disabled])` | Turn detection |
| 8 | `.pickArea` | Auction pick area container |
| 9 | `.playersSearch input.form__control` | Search input |
| 9 | `.player--search--matches` | Search dropdown |
| 9 | `button.player--search--match` | Search result button |
| 9 | `[data-player-search-playerid]` | Result player ID attr |
| 9 | `.player--search--clear` | Clear search |
| 10 | `button.bid-player__button` | Nominate/bid confirm |

## iframe Notes

**Is draft content in an iframe?** UNKNOWN — needs live verification via MCP.

ESPN's main fantasy pages typically render in the main frame, but the draft room may use an iframe for the auction interface. During the first MCP session:

1. Run `document.querySelectorAll('iframe')` on the main frame
2. If iframes exist, check their `src` attributes for draft-related URLs
3. If selectors return 0 matches on main frame, switch CDP target to the draft iframe
4. Document the exact frame targeting sequence here

## Live Verification Checklist

Before Phase 40 ships, verify these against a real ESPN auction draft:

- [ ] GROUP 1: Find the actual draft board root element
- [ ] GROUP 2: Confirm `[style*="grid-area"]` still used for pick positioning
- [ ] GROUP 6: Capture actual button text values (queue/select/dequeue)
- [ ] GROUP 7: Find actual player name/team selectors inside completed picks
- [ ] GROUP 8: Verify turn detection text strings ("nominate a player", etc.)
- [ ] iframe: Determine if draft uses iframes
- [ ] Overall: Run full selector battery via MCP and update Status columns
