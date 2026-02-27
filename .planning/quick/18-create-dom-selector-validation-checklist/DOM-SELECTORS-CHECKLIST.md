# ESPN Draft DOM Selector Validation Checklist

**Purpose:** Manual testing and validation of the extension's DOM selectors during actual ESPN drafts to identify when ESPN changes their DOM structure and provides a systematic approach to debugging selector failures.

**When to Use:** Before releasing new versions, after ESPN updates, when users report pick detection issues, or during live draft testing.

---

## Pre-Test Setup

### 1. Access Browser Console
- **Chrome:** Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
- **Navigate to Console tab**
- **Clear console:** Click the 🚫 icon or type `clear()`

### 2. Load Extension in Development Mode
1. Open `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select `packages/extension/.output/chrome-mv3`
5. Verify extension appears in list and is enabled

### 3. Access ESPN Draft Page
**Practice Drafts (Recommended for Testing):**
- Navigate to: `https://fantasy.espn.com/baseball/draft?leagueId=YOUR_LEAGUE_ID`
- **Advantage:** Can repeat tests, safe environment, no real draft impact

**Live Drafts (Final Validation):**
- Use actual draft URL from your league
- **Warning:** Limited time window, cannot repeat, affects real draft

### 4. Access Diagnostic Functions
Once the extension loads on the draft page, check console for:
```
[ESPN Draft Assistant] Diagnostic tools available at window.espnDraftAssistant
```

**Available diagnostic functions:**
```javascript
// Run complete DOM health check
window.espnDraftAssistant.diagnose()

// Test parsing a specific pick element
window.espnDraftAssistant.testPick(element)

// Check roster parsing
window.espnDraftAssistant.diagnoseRosters()

// Check version
window.espnDraftAssistant.version
```

---

## Core Selector Testing

### Draft Board Selectors

**Purpose:** Locate the main draft board container element.

**Primary Selectors (Preferred):**
```javascript
document.querySelector('.draftBoardContainer')
document.querySelector('[class*="draftBoard"]')
document.querySelector('[class*="DraftBoard"]')
document.querySelector('[id*="draftBoard"]')
```

**Manual Verification Steps:**
1. Open Elements panel in DevTools
2. Look for main draft grid container
3. Right-click container → Copy → Copy selector
4. Test in console:
```javascript
const board = document.querySelector('YOUR_COPIED_SELECTOR');
console.log('Board found:', !!board);
console.log('Board classes:', board?.className);
console.log('Board children count:', board?.children.length);
```

**Expected Results:**
- ✅ Board found: true
- ✅ Board children count: Should match total picks (e.g., 12 teams × 25 rounds = 300)
- ❌ Board found: false → ESPN changed structure, proceed to fallback testing

**Fallback Selectors Testing:**
```javascript
// Test each fallback in order
const fallbacks = [
  '[class*="draft"][class*="board"]',
  '[class*="draft"][class*="container"]',
  '.draft-content-wrapper',
  '[class*="draft-columns"]',
  '[style*="grid-template"]',
  '[data-testid*="draft"]'
];

fallbacks.forEach((selector, index) => {
  const element = document.querySelector(selector);
  console.log(`Fallback ${index + 1} (${selector}):`, !!element);
});
```

**Troubleshooting:**
- All selectors fail → Check if draft page fully loaded (wait 5 seconds, retry)
- Fallback succeeds but primary fails → Document which fallback worked for bug report
- Grid-template fallback succeeds → ESPN likely changed class names but kept grid layout

---

### Pick Row Selectors

**Purpose:** Identify individual pick cells within the draft board.

**Primary Selector (Grid-Based):**
```javascript
// ESPN uses inline grid-area styles for pick positioning
const pickCells = document.querySelectorAll('[style*="grid-area"]');
console.log('Pick cells found:', pickCells.length);
console.log('Sample grid-area:', pickCells[0]?.getAttribute('style'));
```

**Expected Results:**
- ✅ Pick cells count matches total picks (12 teams × 25 rounds = 300)
- ✅ Sample grid-area format: `grid-area: 1 / 2` or similar

**Grid Area Validation:**
```javascript
// Test parseGridArea logic manually
const sampleCell = pickCells[0];
const styleValue = (sampleCell.getAttribute('style') || '').toLowerCase();
const match = styleValue.match(/grid-area\s*:\s*(\d+)\s*\/\s*(\d+)/);

console.log('Grid area match:', match);
console.log('Row:', match?.[1], 'Column:', match?.[2]);
```

**Secondary Selectors Testing:**
```javascript
const secondarySelectors = [
  '.draftBoardCell',
  '.pickCell',
  '[class*="pickCell"]',
  '[class*="PickCell"]',
  '[class*="draftCell"]',
  '[data-player-id]',
  '[data-pick-number]',
  '[data-testid*="pick"]'
];

secondarySelectors.forEach(selector => {
  const count = document.querySelectorAll(selector).length;
  console.log(`${selector}: ${count} elements`);
});
```

**Testing During Different Draft States:**

**Pre-Draft (No Picks Yet):**
```javascript
const cells = document.querySelectorAll('[style*="grid-area"]');
console.log('Empty cells:', cells.length);
// Should show full grid of empty cells
```

**Active Draft (Some Picks Made):**
```javascript
const completedPicks = document.querySelectorAll('[class*="completed"]');
console.log('Completed picks:', completedPicks.length);
console.log('Empty cells:', cells.length - completedPicks.length);
```

**Completed Draft:**
```javascript
const allCells = document.querySelectorAll('[style*="grid-area"]');
const completedCells = document.querySelectorAll('[class*="completed"]');
console.log('Total cells:', allCells.length);
console.log('Completed cells:', completedCells.length);
console.log('All cells filled:', allCells.length === completedCells.length);
```

**Troubleshooting:**
- No grid-area elements found → ESPN changed from grid layout (major DOM change)
- Pick count doesn't match expected → Check for hidden picks, lazy loading, or pagination
- Grid positioning incorrect → Verify grid-area regex pattern matches ESPN's format

---

### Completed Pick Selectors

**Purpose:** Identify which pick cells contain completed picks (not upcoming empty picks).

**Primary Selectors:**
```javascript
const completedSelectors = [
  '.completedPick',
  '[class*="completed"]',
  '[data-completed="true"]',
  '[data-status="completed"]',
  '[data-player-id]:not([data-player-id=""])',
  '[style*="grid-area"]:has(.playerCard)',
  '[style*="grid-area"]:has([class*="player"])'
];

completedSelectors.forEach(selector => {
  const count = document.querySelectorAll(selector).length;
  console.log(`${selector}: ${count} picks`);
});
```

**Verify Pick Data Extraction:**

**Player Name Extraction:**
```javascript
const firstPick = document.querySelector('[class*="completed"]');
if (!firstPick) {
  console.error('No completed picks found');
} else {
  // Test primary name selector
  const playerName = firstPick.querySelector('.playerName, [class*="playerName"]');
  console.log('Player name element:', playerName);
  console.log('Player name text:', playerName?.textContent);

  // Test first/last name split pattern
  const firstName = firstPick.querySelector('.playerFirstName, .firstName, [class*="firstName"]');
  const lastName = firstPick.querySelector('.playerLastName, .lastName, [class*="lastName"]');
  console.log('First name:', firstName?.textContent);
  console.log('Last name:', lastName?.textContent);
  console.log('Combined:', [firstName?.textContent, lastName?.textContent].filter(Boolean).join(' '));
}
```

**Position Parsing:**
```javascript
const positionEl = firstPick?.querySelector('.positionPill, .position, [class*="position"]');
console.log('Position element:', positionEl);
console.log('Position text:', positionEl?.textContent);

// Test position splitting (comma vs slash separation)
const positionText = positionEl?.textContent?.trim() || '';
const positions = positionText
  .split('/')
  .flatMap(part => part.split(','))
  .map(part => part.trim())
  .filter(Boolean);
console.log('Parsed positions:', positions);
```

**Team ID and Fantasy Team Detection:**
```javascript
// ESPN displays the fantasy team making the pick
const teamName = firstPick?.querySelector('.teamName, .ownerName, [class*="teamName"]');
console.log('Team name element:', teamName);
console.log('Team name text:', teamName?.textContent);

// Check for team data attributes
const teamId = firstPick?.getAttribute('data-team-id');
const parentTeam = firstPick?.closest('[data-team-name], [data-team-id]');
console.log('Team ID:', teamId);
console.log('Parent team element:', parentTeam);
console.log('Parent team name:', parentTeam?.getAttribute('data-team-name'));
```

**Cost Extraction (Auction Only):**
```javascript
const costEl = firstPick?.querySelector('.winningPrice, .cost, [class*="winningPrice"], [class*="cost"]');
console.log('Cost element:', costEl);
console.log('Cost text:', costEl?.textContent);

// Test cost parsing (remove $ and non-digits)
const costText = costEl?.textContent || '';
const cost = parseInt(costText.replace(/\D/g, '') || '0', 10);
console.log('Parsed cost:', cost);
```

**Full Pick Parsing Test:**
```javascript
// Use the extension's diagnostic function
const firstPickElement = document.querySelector('[class*="completed"]');
if (firstPickElement) {
  window.espnDraftAssistant.testPick(firstPickElement);
}
```

**Expected Output:**
```javascript
{
  playerId: 123456,
  playerName: "Mike Trout",
  teamId: "1",
  teamName: "Team 1",
  pickNumber: 1,
  timestamp: 1234567890,
  cost: 45, // auction only
  positions: ["OF"]
}
```

**Troubleshooting:**
- Player name missing → Check for first/last name split, inspect element structure
- Positions empty → ESPN may use different position selectors, check for pills/badges
- Team ID incorrect → Verify grid column corresponds to team, check data attributes
- Cost parsing fails → Inspect cost element, check for currency symbols or formatting

---

### Current Auction Player Selectors (Auction Only)

**Purpose:** Identify the player currently up for auction and extract bid information.

**Primary Selectors:**
```javascript
const currentPlayerSelectors = [
  '.currentPlayer',
  '[class*="currentPlayer"]',
  '[class*="CurrentPlayer"]',
  '.activePlayer',
  '[class*="activePlayer"]',
  '[data-testid*="current-player"]',
  '.auctionHeader',
  '[class*="auctionHeader"]'
];

currentPlayerSelectors.forEach(selector => {
  const element = document.querySelector(selector);
  console.log(`${selector}:`, !!element);
  if (element) {
    console.log('  Inner text:', element.textContent?.slice(0, 100));
  }
});
```

**Verify Current Player Detection:**
```javascript
const currentPlayerContainer = document.querySelector('.currentPlayer, [class*="currentPlayer"]');
if (!currentPlayerContainer) {
  console.warn('No current player container found - auction may not be active');
} else {
  // Extract player name
  const playerName = currentPlayerContainer.querySelector('.playerName, [class*="playerName"]');
  console.log('Current player:', playerName?.textContent);

  // Extract current bid
  const bidElement = currentPlayerContainer.querySelector('.currentBid, .bid, [class*="bid"]');
  console.log('Current bid element:', bidElement);
  console.log('Current bid text:', bidElement?.textContent);

  // Parse bid amount
  const bidText = bidElement?.textContent || '';
  const bidAmount = parseInt(bidText.replace(/\D/g, '') || '0', 10);
  console.log('Parsed bid amount:', bidAmount);
}
```

**Test Player Change Detection:**
```javascript
// Monitor current player changes
let lastPlayer = null;
const checkInterval = setInterval(() => {
  const container = document.querySelector('.currentPlayer, [class*="currentPlayer"]');
  const playerName = container?.querySelector('.playerName, [class*="playerName"]')?.textContent;

  if (playerName !== lastPlayer) {
    console.log(`Player changed: ${lastPlayer} → ${playerName}`);
    lastPlayer = playerName;
  }
}, 1000);

// Stop after 30 seconds
setTimeout(() => clearInterval(checkInterval), 30000);
```

**Troubleshooting:**
- No current player found → Check if auction is active, verify selectors
- Bid amount incorrect → Inspect bid element, check for min bid vs current bid
- Player changes not detected → ESPN may update without DOM mutations, verify observer setup

---

## Diagnostic Tool Usage

### window.espnDraftAssistant.diagnose()

**Purpose:** Complete DOM health check with automated selector testing.

**Usage:**
```javascript
const report = window.espnDraftAssistant.diagnose();
console.log('Diagnostic Report:', report);
```

**Expected Output:**
```javascript
{
  draftBoardFound: true,
  pickRowsCount: 300,
  completedPicksCount: 15,
  selectorHealth: {
    draftBoard: true,
    pickRows: true,
    completedPicks: true,
    gridLayout: true
  },
  recommendations: []
}
```

**Interpreting Results:**

**Healthy State (All Green):**
```javascript
{
  draftBoardFound: true,
  pickRowsCount: > 0,
  completedPicksCount: > 0,
  selectorHealth: { all true },
  recommendations: []
}
```
✅ All selectors working - DOM structure healthy

**Draft Not Started:**
```javascript
{
  draftBoardFound: true,
  pickRowsCount: 300,
  completedPicksCount: 0,
  selectorHealth: { all true },
  recommendations: ["Pick rows found but no completed picks - draft may not have started"]
}
```
⚠️ Expected state - wait for draft to start

**Major DOM Change:**
```javascript
{
  draftBoardFound: false,
  pickRowsCount: 0,
  completedPicksCount: 0,
  selectorHealth: { all false },
  recommendations: ["Draft board not found - page may not be fully loaded or ESPN changed structure", ...]
}
```
❌ Critical failure - ESPN changed DOM structure

**Layout Change:**
```javascript
{
  draftBoardFound: true,
  pickRowsCount: 300,
  completedPicksCount: 0,
  selectorHealth: { gridLayout: false },
  recommendations: ["Picks found but no grid layout detected - ESPN may have changed to different layout system"]
}
```
⚠️ ESPN changed from grid layout - selectors need update

### window.espnDraftAssistant.testPick(element)

**Purpose:** Test pick parsing on a specific DOM element.

**Usage:**
```javascript
// Get a pick element
const pickElement = document.querySelector('[style*="grid-area"]');

// Test parsing
window.espnDraftAssistant.testPick(pickElement);
```

**Expected Console Output:**
```
[ESPN Draft Assistant] Testing pick element parsing...
Element: {tag: "DIV", classes: "pick-cell completed", id: ""}
[ESPN Draft Assistant] Parse successful: {playerId: 123, playerName: "Mike Trout", ...}
```

**On Parse Failure:**
```
[ESPN Draft Assistant] Parse failed - check console warnings above for details
```
Look for specific warnings about missing elements (player name, position, etc.)

### window.espnDraftAssistant.diagnoseRosters()

**Purpose:** Verify team roster parsing from DOM.

**Usage:**
```javascript
window.espnDraftAssistant.diagnoseRosters();
```

**Expected Output:**
```
[ESPN Draft Assistant] Roster Diagnostic Report:
  Total teams: 12
  Team "Team 1" (ID: 1): 15 players
  Team "Team 2" (ID: 2): 15 players
  ...

  Sample roster (first team):
    Team: Team 1
    Players: 15
    Player IDs: 123, 456, 789, 1011, 1213...
```

**Troubleshooting:**
- No teams found → Draft not started or picks not detected
- Player counts incorrect → Verify pick deduplication logic
- Team IDs inconsistent → Check grid column mapping

---

## Test Scenarios

### Snake Draft Testing

#### Pre-Draft State (No Picks Yet)
**Checklist:**
- [ ] Draft board found: `window.espnDraftAssistant.diagnose()` shows `draftBoardFound: true`
- [ ] Empty pick cells visible in UI
- [ ] Grid-area elements present: `document.querySelectorAll('[style*="grid-area"]').length > 0`
- [ ] No completed picks: `document.querySelectorAll('[class*="completed"]').length === 0`
- [ ] No parse errors in console

#### First Pick Made
**Trigger:** Wait for first player to be drafted

**Checklist:**
- [ ] Console log shows: `[ESPN Draft Assistant] Detected pick: {...}`
- [ ] Pick data includes: playerId, playerName, teamId, pickNumber
- [ ] Grid position correct (row: 1, column: team)
- [ ] Player name matches ESPN UI display
- [ ] Position(s) extracted correctly
- [ ] No duplicate pick warnings

**Verification Command:**
```javascript
const picks = useDraftStore.getState().picks;
console.log('Stored picks:', picks.length);
console.log('First pick:', picks[0]);
```

#### Turn Completion (2 Picks by Same Team)
**Context:** In snake draft, team picks twice in a row at turn boundaries

**Trigger:** Wait for team's second consecutive pick

**Checklist:**
- [ ] Both picks detected as separate events
- [ ] Both picks have same teamId
- [ ] Pick numbers sequential (e.g., pick 12 and 13 in 12-team league)
- [ ] Grid positions correct (consecutive rows)
- [ ] No deduplication conflicts

**Verification Command:**
```javascript
const state = useDraftStore.getState();
const teamPicks = state.picks.filter(p => p.teamId === '1'); // Adjust team ID
console.log('Team 1 picks:', teamPicks.length);
console.log('Consecutive picks:', teamPicks.slice(-2));
```

#### Mid-Draft State
**Context:** 50+ picks completed

**Checklist:**
- [ ] All picks detected: Compare UI pick count to stored picks
- [ ] No missing picks: Scan pick numbers for gaps
- [ ] Player names accurate across all positions (C, 1B, 2B, SS, 3B, OF, SP, RP)
- [ ] Team rosters balanced (all teams have similar pick counts)
- [ ] Performance acceptable: No lag or slowdown

**Verification Commands:**
```javascript
const state = useDraftStore.getState();
console.log('Total picks:', state.picks.length);

// Check for gaps in pick numbers
const pickNumbers = state.picks.map(p => p.pickNumber).sort((a, b) => a - b);
const gaps = pickNumbers.filter((num, i) => i > 0 && num !== pickNumbers[i - 1] + 1);
console.log('Missing pick numbers:', gaps.length > 0 ? gaps : 'None');

// Check team distribution
const teamCounts = {};
state.picks.forEach(p => {
  teamCounts[p.teamId] = (teamCounts[p.teamId] || 0) + 1;
});
console.log('Picks per team:', teamCounts);
```

#### Near-Completion State
**Context:** 250+ picks in 300-pick draft

**Checklist:**
- [ ] Full draft board visible and parseable
- [ ] Late-round picks still detected
- [ ] No performance degradation
- [ ] Memory usage acceptable (check DevTools Performance monitor)
- [ ] All team rosters complete

### Auction Draft Testing

#### Pre-Auction State
**Checklist:**
- [ ] Auction format detected: `detectDraftFormat()` returns `"auction"`
- [ ] Draft store initialized with auction mode
- [ ] Budget tracking initialized
- [ ] No current player detected (auction not started)

**Verification:**
```javascript
const state = useDraftStore.getState();
console.log('Draft format:', state.draftFormat); // Should be "auction"
console.log('Remaining budget:', state.remainingBudget);
console.log('Current player:', state.currentAuctionPlayer); // Should be null
```

#### First Player Nomination
**Trigger:** Wait for first player to be nominated

**Checklist:**
- [ ] Current player detected: `state.currentAuctionPlayer !== null`
- [ ] Player name displayed in sidebar
- [ ] Current bid shows initial bid or minimum
- [ ] Positions extracted correctly

**Verification:**
```javascript
const currentPlayer = useDraftStore.getState().currentAuctionPlayer;
console.log('Current auction player:', currentPlayer);
console.log('Player name:', currentPlayer?.playerName);
console.log('Current bid:', currentPlayer?.currentBid);
console.log('Positions:', currentPlayer?.positions);
```

#### Bidding In Progress
**Trigger:** Wait for bids to be placed

**Checklist:**
- [ ] Bid amount updates in real-time
- [ ] No excessive console warnings
- [ ] UI reflects current bid
- [ ] Player doesn't change unexpectedly

**Verification (monitor for 10 seconds):**
```javascript
let bidHistory = [];
const interval = setInterval(() => {
  const currentBid = useDraftStore.getState().currentAuctionPlayer?.currentBid;
  bidHistory.push(currentBid);
  console.log('Current bid:', currentBid);
}, 1000);

setTimeout(() => {
  clearInterval(interval);
  console.log('Bid history:', bidHistory);
}, 10000);
```

#### Player Won/Assigned
**Trigger:** Wait for player to be assigned to a team

**Checklist:**
- [ ] Pick detected with cost: `pick.cost` is defined
- [ ] Current auction player cleared: `state.currentAuctionPlayer === null`
- [ ] Winning team identified correctly
- [ ] Cost matches final bid
- [ ] Budget updated for winning team (if myTeam)

**Verification:**
```javascript
const state = useDraftStore.getState();
const lastPick = state.picks[state.picks.length - 1];
console.log('Last pick:', lastPick);
console.log('Cost:', lastPick?.cost);
console.log('Team:', lastPick?.teamName);
console.log('Current player after win:', state.currentAuctionPlayer); // Should be null
```

#### Budget Tracking
**Context:** After multiple picks by your team

**Checklist:**
- [ ] Remaining budget decreases with each pick
- [ ] Budget calculation accurate: `initial - sum(costs)`
- [ ] Budget warnings appear when low (<10%)
- [ ] No negative budget values

**Verification:**
```javascript
const state = useDraftStore.getState();
const myPicks = state.myRoster;
const totalSpent = myPicks.reduce((sum, p) => sum + (p.cost || 0), 0);
const expectedRemaining = 260 - totalSpent; // Assuming $260 budget

console.log('My picks:', myPicks.length);
console.log('Total spent:', totalSpent);
console.log('Remaining budget (state):', state.remainingBudget);
console.log('Expected remaining:', expectedRemaining);
console.log('Budget matches:', state.remainingBudget === expectedRemaining);
```

---

## Failure Modes & Troubleshooting

### Draft Board Not Found

**Symptoms:**
- `diagnose()` shows `draftBoardFound: false`
- Sidebar empty or shows "Loading..."
- No pick detection

**Diagnostic Steps:**

1. **Check page load state:**
```javascript
console.log('Document ready state:', document.readyState);
console.log('Body children:', document.body?.children.length);
```

2. **Wait and retry:**
```javascript
setTimeout(() => {
  console.log('Retrying after 5 seconds...');
  window.espnDraftAssistant.diagnose();
}, 5000);
```

3. **Inspect page structure:**
```javascript
// Log all divs with "draft" in class or id
const draftElements = Array.from(document.querySelectorAll('*'))
  .filter(el => el.className?.toLowerCase().includes('draft') || el.id?.toLowerCase().includes('draft'))
  .slice(0, 10);

draftElements.forEach(el => {
  console.log({
    tag: el.tagName,
    class: el.className,
    id: el.id,
    children: el.children.length
  });
});
```

4. **Check for SPA route changes:**
```javascript
console.log('Current URL:', window.location.href);
console.log('Expected pattern:', 'https://fantasy.espn.com/baseball/draft?leagueId=*');
```

**Solutions:**
- Wait for page to fully load (15 second timeout in extension)
- Refresh page if stuck
- Clear browser cache and reload
- Check if ESPN changed URL structure

### Picks Not Detected

**Symptoms:**
- Board found but no picks logged
- `picks.length` stays at 0
- UI shows completed picks but extension doesn't detect them

**Diagnostic Steps:**

1. **Check completed pick selectors:**
```javascript
const completedCount = document.querySelectorAll('[class*="completed"]').length;
console.log('Completed picks in DOM:', completedCount);

const storedCount = useDraftStore.getState().picks.length;
console.log('Picks in state:', storedCount);
console.log('Mismatch:', completedCount !== storedCount);
```

2. **Manually trigger parse:**
```javascript
const pickElements = document.querySelectorAll('[style*="grid-area"]');
console.log('Pick elements found:', pickElements.length);

// Try parsing first element
if (pickElements[0]) {
  window.espnDraftAssistant.testPick(pickElements[0]);
}
```

3. **Check for parsing errors:**
```javascript
// Look for parse warnings in console
// Should see: "[ESPN Draft Assistant] Failed to parse player name from pick element"
```

4. **Inspect pick element structure:**
```javascript
const firstPick = document.querySelector('[class*="completed"]');
if (firstPick) {
  console.log('Pick element HTML:', firstPick.innerHTML);
  console.log('Pick element classes:', firstPick.className);
  console.log('Pick element attributes:', Array.from(firstPick.attributes).map(a => ({name: a.name, value: a.value})));
}
```

**Solutions:**
- ESPN changed completed pick class names → Update `COMPLETED_PICK_SELECTORS`
- Player data moved to different elements → Update parsing logic in `parsePickElement()`
- Picks not marked as "completed" → Add fallback selector for picks with player data

### Player Names Missing

**Symptoms:**
- Picks detected but `playerName` is empty or null
- Console warnings: `"Failed to parse player name from pick element"`

**Diagnostic Steps:**

1. **Inspect name element structure:**
```javascript
const pickWithPlayer = document.querySelector('[data-player-id]:not([data-player-id=""])');
if (pickWithPlayer) {
  console.log('Pick HTML:', pickWithPlayer.innerHTML);

  // Test all name selectors
  const nameSelectors = [
    '.playerName',
    '[class*="playerName"]',
    '.player-name',
    '.name',
    '[class*="name"]'
  ];

  nameSelectors.forEach(selector => {
    const element = pickWithPlayer.querySelector(selector);
    console.log(`${selector}:`, element?.textContent);
  });
}
```

2. **Check first/last name split:**
```javascript
const firstName = pickWithPlayer?.querySelector('.playerFirstName, .firstName');
const lastName = pickWithPlayer?.querySelector('.playerLastName, .lastName');
console.log('First name:', firstName?.textContent);
console.log('Last name:', lastName?.textContent);
```

3. **Look for alternative text containers:**
```javascript
// ESPN may use different structure
console.log('All text content:', pickWithPlayer?.textContent);
console.log('Inner text (first 100 chars):', pickWithPlayer?.innerText.slice(0, 100));
```

**Solutions:**
- ESPN changed name class → Add new selector to `playerNameSelectors` array
- Name split into multiple elements → Update firstName/lastName logic
- Name in unexpected location → Inspect DOM and add fallback selector

### Positions Incorrect

**Symptoms:**
- Positions array empty when should have values
- Multi-position players showing only one position
- Positions not split correctly (e.g., "1B/OF" instead of ["1B", "OF"])

**Diagnostic Steps:**

1. **Check position element:**
```javascript
const pickWithPlayer = document.querySelector('[data-player-id]:not([data-player-id=""])');
const positionEl = pickWithPlayer?.querySelector('.positionPill, .position, [class*="position"]');

console.log('Position element:', positionEl);
console.log('Position text:', positionEl?.textContent);
console.log('Position HTML:', positionEl?.innerHTML);
```

2. **Test position splitting logic:**
```javascript
const positionText = positionEl?.textContent?.trim() || '';
console.log('Raw position text:', positionText);

// Test slash splitting
const slashSplit = positionText.split('/');
console.log('Slash split:', slashSplit);

// Test comma splitting
const commaSplit = positionText.split(',');
console.log('Comma split:', commaSplit);

// Full parsing logic
const positions = positionText
  .split('/')
  .flatMap(part => part.split(','))
  .map(part => part.trim())
  .filter(Boolean);
console.log('Parsed positions:', positions);
```

3. **Check for position badges/pills:**
```javascript
const positionBadges = pickWithPlayer?.querySelectorAll('.position, [class*="position"]');
console.log('Position badges:', positionBadges?.length);
positionBadges?.forEach((badge, i) => {
  console.log(`Badge ${i}:`, badge.textContent);
});
```

**Solutions:**
- ESPN changed separator → Update split logic to handle new format
- Positions in multiple elements → Query all position elements and combine
- Position class changed → Add new selector to `positionSelectors` array

---

## Selector Health Verification

### Complete Health Check Script

**Run this script to verify all selectors:**

```javascript
// Complete selector health check
const healthCheck = {
  draftBoard: {
    pass: false,
    selector: null,
    count: 0
  },
  pickRows: {
    pass: false,
    selector: null,
    count: 0
  },
  completedPicks: {
    pass: false,
    selector: null,
    count: 0
  },
  playerNames: {
    pass: false,
    missingCount: 0
  },
  positions: {
    pass: false,
    missingCount: 0
  },
  teamIds: {
    pass: false,
    missingCount: 0
  }
};

// Test draft board
const board = document.querySelector('.draftBoardContainer, [class*="draftBoard"]');
healthCheck.draftBoard.pass = !!board;
healthCheck.draftBoard.count = board ? 1 : 0;

// Test pick rows
const pickRows = document.querySelectorAll('[style*="grid-area"]');
healthCheck.pickRows.pass = pickRows.length > 0;
healthCheck.pickRows.count = pickRows.length;

// Test completed picks
const completedPicks = document.querySelectorAll('[class*="completed"], [data-player-id]:not([data-player-id=""])');
healthCheck.completedPicks.pass = completedPicks.length > 0;
healthCheck.completedPicks.count = completedPicks.length;

// Test player name extraction
let missingNames = 0;
completedPicks.forEach(pick => {
  const name = pick.querySelector('.playerName, [class*="playerName"]')?.textContent?.trim();
  if (!name) missingNames++;
});
healthCheck.playerNames.pass = missingNames === 0;
healthCheck.playerNames.missingCount = missingNames;

// Test position extraction
let missingPositions = 0;
completedPicks.forEach(pick => {
  const pos = pick.querySelector('.positionPill, .position, [class*="position"]')?.textContent?.trim();
  if (!pos) missingPositions++;
});
healthCheck.positions.pass = missingPositions < completedPicks.length * 0.1; // Allow 10% failure
healthCheck.positions.missingCount = missingPositions;

// Test team ID extraction
let missingTeams = 0;
completedPicks.forEach(pick => {
  const teamId = pick.getAttribute('data-team-id');
  const gridArea = pick.getAttribute('style')?.match(/grid-area\s*:\s*(\d+)\s*\/\s*(\d+)/);
  if (!teamId && !gridArea) missingTeams++;
});
healthCheck.teamIds.pass = missingTeams < completedPicks.length * 0.1;
healthCheck.teamIds.missingCount = missingTeams;

// Print report
console.log('=== SELECTOR HEALTH CHECK ===');
Object.entries(healthCheck).forEach(([key, value]) => {
  const status = value.pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} - ${key}:`, value);
});

// Overall health
const allPass = Object.values(healthCheck).every(v => v.pass);
console.log('\n' + (allPass ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'));
```

### Pass/Fail Criteria

**PASS Criteria:**
- ✅ Draft board found: `draftBoardFound === true`
- ✅ Pick rows count > 0
- ✅ Completed picks count > 0 (if draft started)
- ✅ Player names: 100% extraction success
- ✅ Positions: >90% extraction success (some players may lack positions)
- ✅ Team IDs: >90% extraction success

**FAIL Criteria:**
- ❌ Draft board not found after 15 seconds
- ❌ Pick rows count === 0 when picks visible in UI
- ❌ Player name extraction < 100%
- ❌ Position extraction < 90%
- ❌ Team ID extraction < 90%

---

## Edge Cases to Test

### Players with Jr/Sr Suffixes

**Test Players:** Fernando Tatis Jr., Cal Ripken Jr., Vladimir Guerrero Jr.

**Verification:**
```javascript
// After Jr/Sr player drafted
const jrPlayers = useDraftStore.getState().picks.filter(p =>
  p.playerName.toLowerCase().includes('jr') ||
  p.playerName.toLowerCase().includes('sr')
);

console.log('Jr/Sr players:', jrPlayers.length);
jrPlayers.forEach(p => {
  console.log('Name:', p.playerName);
  console.log('Normalized:', normalizePlayerName(p.playerName));
});
```

**Expected:** Suffix preserved in playerName, removed in matching logic

### Players with Accented Characters

**Test Players:** José Ramírez, Freddy Galvis, Andrés Giménez

**Verification:**
```javascript
const accentedPlayers = useDraftStore.getState().picks.filter(p =>
  /[áéíóúñü]/i.test(p.playerName)
);

console.log('Accented players:', accentedPlayers.length);
accentedPlayers.forEach(p => {
  console.log('Name:', p.playerName);
  console.log('Includes accents:', /[áéíóúñü]/i.test(p.playerName));
});
```

**Expected:** Accents preserved in display, normalized for matching

### Multi-Position Players

**Test Players:** Shohei Ohtani (SP/DH), Utility players (1B/OF, SS/2B)

**Verification:**
```javascript
const multiPosPLayers = useDraftStore.getState().picks.filter(p =>
  p.positions && p.positions.length > 1
);

console.log('Multi-position players:', multiPosPLayers.length);
multiPosPLayers.forEach(p => {
  console.log('Name:', p.playerName);
  console.log('Positions:', p.positions);
});
```

**Expected:** All positions captured in array

### Grid Area Positions at Boundaries

**Test:** First pick (grid-area: 1 / 1), last pick (grid-area: 300 / 12)

**Verification:**
```javascript
const firstPick = useDraftStore.getState().picks.find(p => p.pickNumber === 1);
const lastPickNum = Math.max(...useDraftStore.getState().picks.map(p => p.pickNumber));
const lastPick = useDraftStore.getState().picks.find(p => p.pickNumber === lastPickNum);

console.log('First pick:', firstPick);
console.log('Last pick:', lastPick);
```

**Expected:** Both picks parsed correctly with valid grid positions

### Rapid Pick Detection

**Test:** Back-to-back picks in snake draft turn

**Verification:**
```javascript
// Monitor for duplicate detection
const initialCount = useDraftStore.getState().picks.length;

// Wait for 2 consecutive picks
setTimeout(() => {
  const finalCount = useDraftStore.getState().picks.length;
  const newPicks = useDraftStore.getState().picks.slice(initialCount);

  console.log('New picks detected:', newPicks.length);
  newPicks.forEach((p, i) => {
    console.log(`Pick ${i + 1}:`, p.playerName, 'Team:', p.teamName);
  });

  // Check for duplicates
  const uniqueKeys = new Set(newPicks.map(p => `${p.playerId}:${p.teamId}`));
  console.log('Unique picks:', uniqueKeys.size === newPicks.length ? 'YES' : 'NO (DUPLICATES FOUND)');
}, 10000);
```

**Expected:** Both picks detected, no duplicates

---

## Reporting Template

### Format for Reporting Selector Failures

When reporting issues, include:

**1. Environment:**
```
Browser: Chrome 120.0.6099.129
Extension Version: 1.0.0
ESPN Draft URL: https://fantasy.espn.com/baseball/draft?leagueId=XXXXX
Draft Type: [Snake / Auction]
Date/Time: 2026-02-27 14:30 PST
```

**2. Diagnostic Results:**
```javascript
// Copy-paste output from:
window.espnDraftAssistant.diagnose()
```

**3. Failure Description:**
```
What's broken: [Player names not detected]
When it started: [After pick #15]
Frequency: [All picks / Some picks / Specific positions]
```

**4. Console Logs:**
```
Filter console to show only "[ESPN Draft Assistant]" messages
Copy all warnings and errors
Include timestamps
```

**5. DOM Snapshot:**
```javascript
// For the failing element, run:
const failingElement = document.querySelector('[YOUR_SELECTOR]');
console.log('Element HTML:', failingElement?.outerHTML);
console.log('Element classes:', failingElement?.className);
console.log('Element attributes:', Array.from(failingElement?.attributes || []).map(a => ({name: a.name, value: a.value})));
```

**6. Screenshots:**
- ESPN draft page showing the issue
- Browser console with errors visible
- Extension sidebar state

**7. Steps to Reproduce:**
1. Navigate to draft page
2. Wait for picks to be made
3. Observe failure at pick #X
4. Run diagnostic commands

**8. Expected vs Actual:**
```
Expected: Player name "Mike Trout" detected
Actual: Player name empty/null
```

---

## Summary Checklist

Before releasing new version or after ESPN updates, complete this checklist:

### Pre-Draft Testing
- [ ] Extension loads on draft page
- [ ] Diagnostic functions accessible
- [ ] Draft board detected
- [ ] Empty pick cells visible
- [ ] No console errors

### Snake Draft Testing
- [ ] First pick detected
- [ ] Player name extracted
- [ ] Positions parsed
- [ ] Team ID identified
- [ ] Grid position correct
- [ ] Mid-draft picks all detected
- [ ] Turn boundary picks (2x same team) both detected
- [ ] Late-round picks detected
- [ ] No duplicate picks

### Auction Draft Testing
- [ ] Auction format detected
- [ ] Current player detected
- [ ] Bid amount extracted
- [ ] Player change detected
- [ ] Player assignment detected
- [ ] Cost recorded correctly
- [ ] Budget tracking accurate

### Edge Cases
- [ ] Jr/Sr suffixes handled
- [ ] Accented characters preserved
- [ ] Multi-position players (all positions captured)
- [ ] First/last pick boundary cases
- [ ] Rapid consecutive picks

### Performance
- [ ] No lag during draft
- [ ] Memory usage acceptable (<100MB increase)
- [ ] Console not flooded with warnings

### Documentation
- [ ] Failed selectors documented
- [ ] DOM changes recorded
- [ ] Screenshots captured
- [ ] Report submitted with template

---

**Last Updated:** 2026-02-27
**Extension Version:** 1.0.0
**Maintainer:** Check dom-observers.ts for latest selector definitions
