# Domain Pitfalls: Multi-Player Trade Evaluation & Historical Analysis

**Domain:** Fantasy Baseball - Multi-Player Trades & Historical Replay
**Researched:** 2026-02-20
**Context:** Adding N-for-N trade evaluation and historical analysis to existing ESPN Fantasy Baseball app

---

## Critical Context

This document focuses on pitfalls when ADDING multi-player trade evaluation and historical analysis features to the existing system. For general pitfalls (auth, API stability, security), see the base PITFALLS.md.

**Existing System Patterns:**
- Rate stats use component math (H/AB for AVG, never average rates)
- ESPN API is undocumented, read-only, cookie-based auth
- Projections are rest-of-season (not retroactive)
- 10-14 team roto category leagues
- Current trade analysis is 1-for-1 only
- Daily snapshot pipeline with degraded state handling

---

## Table of Contents

### Multi-Player Trade Evaluation
1. [Roster Slot Constraint Violations](#pitfall-1-roster-slot-constraint-violations)
2. [Component Math Errors in Multi-Player Rate Stats](#pitfall-2-component-math-errors-in-multi-player-rate-stats)
3. [Positional Scarcity Ignored in N-for-N](#pitfall-3-positional-scarcity-ignored-in-n-for-n)
4. [VBD/SGP Baseline Shifts from Roster Changes](#pitfall-4-vbdsgp-baseline-shifts-from-roster-changes)
5. [Simulation Explosion (Combinatorial Complexity)](#pitfall-5-simulation-explosion-combinatorial-complexity)
6. [Replacement Player Selection Errors](#pitfall-6-replacement-player-selection-errors)

### Historical Analysis
7. [ESPN Historical Data Deletion](#pitfall-7-espn-historical-data-deletion)
8. [Transaction Deduplication Failures](#pitfall-8-transaction-deduplication-failures)
9. [Snapshot Gaps in Time Series](#pitfall-9-snapshot-gaps-in-time-series)
10. [Retroactive Projection Fallacy](#pitfall-10-retroactive-projection-fallacy)
11. [Rate Stat Interpolation Errors](#pitfall-11-rate-stat-interpolation-errors)
12. [Trade Retrospective Attribution](#pitfall-12-trade-retrospective-attribution)
13. [Settings Changes Mid-Season](#pitfall-13-settings-changes-mid-season)
14. [Backfill Rate Limiting](#pitfall-14-backfill-rate-limiting)

---

## Multi-Player Trade Evaluation

### Pitfall 1: Roster Slot Constraint Violations

**What goes wrong:** N-for-N trade simulation shows "gain +2.5 points" but trade is actually illegal because team would have 4 catchers (league max: 2) or 16 total players (league max: 15).

**Why it happens:**
- Current `TradeRecommendationAgent.simulateTradeImpact()` only looks at category totals, not roster slots
- ESPN API allows unbalanced trades (3-for-1) but enforces position limits
- Utility/bench slot accounting is complex (IF/OF/UTIL overlaps)

**Consequences:**
- Users attempt trades that ESPN rejects with "roster limit error"
- False positives in trade recommendations
- User trust erodes ("app doesn't understand my league rules")

**Prevention:**

1. **Parse roster slot rules from `league_settings_version.settings_json.roster_slots`:**
   ```typescript
   interface RosterSlots {
     C: number;      // Catcher slots
     "1B": number;   // First base slots
     MI: number;     // Middle infield (2B/SS)
     CI: number;     // Corner infield (1B/3B)
     OF: number;     // Outfield
     UTIL: number;   // Utility (any position)
     P: number;      // Pitcher slots
     SP: number;     // Starting pitcher
     RP: number;     // Relief pitcher
     BENCH: number;  // Bench slots
   }
   ```

2. **Validate trade legality BEFORE simulation:**
   ```typescript
   async validateTradeRosterConstraints(
     currentRoster: Player[],
     trade: ProposedTrade,
     rosterSlots: RosterSlots
   ): Promise<{ valid: boolean; violations: string[] }> {
     // Simulate post-trade roster
     const postTradeRoster = currentRoster
       .filter(p => !trade.givePlayers.includes(p.playerId))
       .concat(trade.receivePlayers);

     // Check total roster size
     if (postTradeRoster.length > totalRosterSize) {
       return { valid: false, violations: ["Roster size exceeded"] };
     }

     // Check position-specific limits
     // Handle multi-position eligibility (player can be C/1B)
     // Account for flex slots (UTIL can be filled by any hitter)
   }
   ```

3. **Add constraint violations to trade impact response:**
   ```typescript
   interface TradeImpactAnalysis {
     // ... existing fields
     isLegal: boolean;
     rosterViolations: string[];  // e.g., ["Too many catchers: 4 (max 2)"]
     recommendedDrops?: Player[];  // If 3-for-1, suggest which bench player to drop
   }
   ```

**Detection:**
- Unit test with league having `C: 2, BENCH: 3` and simulate 3-for-1 trade acquiring 2 catchers
- User reports "ESPN rejected trade but app said it was good"
- Trade recommendations include trades that exceed roster size

**Phase Mapping:**
- **Phase 1 (Multi-Player Foundation):** Roster constraint validation, illegal trade filtering
- **Phase 1:** Add `recommendedDrops` for unbalanced trades (3-for-2 requires dropping 1)

**Sources:**
- [Yahoo Fantasy uneven trade error message](https://help.yahoo.com/kb/uneven-trade-error-message-fantasy-sports-sln6976.html)
- [CBS Fantasy Baseball roster rules](https://www.cbssports.com/fantasy/baseball/games/free/rules)

---

### Pitfall 2: Component Math Errors in Multi-Player Rate Stats

**What goes wrong:** 3-for-3 trade simulation calculates AVG impact by subtracting individual player AVGs instead of adjusting underlying H/AB components, producing mathematically impossible results.

**Why it happens:**
- Current `TradeRecommendationAgent` correctly handles rate stats for 1-for-1 trades (lines 615-684 in `trade-recommendation.ts`)
- Multi-player extension might naively sum or average individual rate stats
- Developers forget that AVG(.300) - AVG(.250) ≠ delta_H / delta_AB

**Consequences:**
- Projected AVG after 3-for-3 trade is .318, but component math yields .285
- ERA projections go negative or exceed 15.00 (impossible)
- Users manually calculate and find app is wrong by 20+ batting average points

**Prevention:**

1. **NEVER directly add/subtract rate stat values:**
   ```typescript
   // ❌ WRONG
   const avgDelta = trade.receivePlayers.reduce((sum, p) => sum + p.avg, 0)
                  - trade.givePlayers.reduce((sum, p) => sum + p.avg, 0);

   // ✅ CORRECT (existing pattern from lines 629-654)
   const adjustedComponents: Record<string, number> = { ...currentComponents };

   for (const givePlayer of trade.givePlayers) {
     const proj = projections.get(givePlayer.playerId);
     const components = proj.stat_components_json as Record<string, number>;
     adjustedComponents.H -= (components.H || 0);
     adjustedComponents.AB -= (components.AB || 0);
   }

   for (const receivePlayer of trade.receivePlayers) {
     const proj = projections.get(receivePlayer.playerId);
     const components = proj.stat_components_json as Record<string, number>;
     adjustedComponents.H += (components.H || 0);
     adjustedComponents.AB += (components.AB || 0);
   }

   const projectedAVG = calculateAVG(adjustedComponents);  // H / AB
   ```

2. **Extend existing component math (already implemented for 1-for-1) to N-for-N:**
   - Current code at lines 634-653 already loops over `trade.givePlayers` and `trade.receivePlayers`
   - **This pattern is already correct for multi-player trades!**
   - Risk: future refactors might "optimize" by averaging rates

3. **Add integration tests with known multi-player component math:**
   ```typescript
   test('3-for-3 trade AVG calculation', async () => {
     // Current roster: 1500 H / 5000 AB = .300
     // Give: Player A (50 H, 200 AB), Player B (30 H, 100 AB), Player C (20 H, 80 AB)
     // Receive: Player X (60 H, 180 AB), Player Y (40 H, 120 AB), Player Z (30 H, 90 AB)

     // Post-trade: (1500 - 100 + 130) / (5000 - 380 + 390)
     //           = 1530 / 5010 = .305

     const impact = await agent.analyzeTradeImpact(leagueId, teamId, date, trade);
     expect(impact.categoryImpacts.find(c => c.categoryId === 'AVG').projectedValue)
       .toBeCloseTo(0.305, 3);
   });
   ```

4. **Never store computed rate stats in component adjustment loops:**
   - Only store components (H, AB, IP, ER, BB, K)
   - Calculate rate at the end from final components

**Detection:**
- Projected AVG after trade is > .400 or < .150 (outlier check)
- Component sum (H_final) doesn't equal (H_current - H_give + H_receive)
- Manual spreadsheet calculation disagrees with app by >0.005

**Phase Mapping:**
- **Phase 1 (Multi-Player Foundation):** Integration tests for multi-player component math
- **Phase 1:** Add assertions in simulation code to catch component math bugs

**Current Status:** ✅ IMPLEMENTATION EXISTS - existing code already handles N-for-N correctly (lines 634-653), but risk of regression

**Sources:**
- [Pitcher List: How to Turn Projections Into Rankings](https://pitcherlist.com/fantasy-101-how-to-turn-projections-into-rankings-and-auction-values/)
- Existing implementation: `packages/shared/src/formulas.ts` lines 8-41

---

### Pitfall 3: Positional Scarcity Ignored in N-for-N

**What goes wrong:** 2-for-2 trade shows "+1.5 points" (raw category impact) but ignores that you're trading the #3 catcher (scarce) for the #25 outfielder (plentiful), destroying roster construction.

**Why it happens:**
- Current simulation only looks at category totals, not positional value
- VBD/SGP calculations in `formulas.ts` (lines 120-248) exist but aren't integrated into trade analysis
- "Win the trade" doesn't mean "improve your roster" in multi-position scenarios

**Consequences:**
- Trade 3 elite closers for 3 mediocre starters, gain +2 points in counting stats but lose all saves coverage
- Trade depth (3 bench bats) for a single star, leave roster vulnerable to injuries
- Positional flexibility lost (trade multi-position player for single-position specialist)

**Prevention:**

1. **Calculate positional replacement level for each player:**
   ```typescript
   interface PositionalContext {
     playerId: number;
     primaryPosition: string;
     replacementLevelSGP: number;  // From formulas.ts getReplacementLevel()
     vbd: number;                   // Value over replacement
     isStarterQuality: boolean;     // Above replacement threshold
   }

   async getPositionalContext(
     roster: Player[],
     trade: ProposedTrade,
     rosterSlots: RosterSlots
   ): Promise<Map<number, PositionalContext>> {
     // For each player, determine:
     // 1. What position they'd fill (C/1B/MI/OF/UTIL)
     // 2. Replacement level for that position
     // 3. Value above replacement
   }
   ```

2. **Add positional scarcity warning to trade impact:**
   ```typescript
   interface TradeImpactAnalysis {
     // ... existing fields
     positionalWarnings: string[];  // e.g., ["Trading your only elite catcher"]
     rosterBalance: {
       before: Record<string, number>;  // { "C": 2, "SS": 3, "OF": 5 }
       after: Record<string, number>;
       degradedPositions: string[];     // Positions below optimal depth
     };
   }
   ```

3. **Weight trade recommendations by positional scarcity:**
   ```typescript
   // In generateTradeCandidates(), adjust sorting:
   candidates.sort((a, b) => {
     const aScarcityPenalty = calculateScarcityPenalty(a.trade);
     const bScarcityPenalty = calculateScarcityPenalty(b.trade);

     return (b.deltaOverallPoints - bScarcityPenalty)
          - (a.deltaOverallPoints - aScarcityPenalty);
   });
   ```

4. **Use SGP methodology from formulas.ts:**
   - `calculateTotalSGP()` (lines 155-207) already handles positional value
   - Integrate this into trade simulation to show "SGP lost from scarcity"

**Detection:**
- Trade recommendations always suggest trading catchers for outfielders (scarcity ignored)
- Post-trade roster has 0 players at a required position
- User feedback: "App suggested trading my only good closer"

**Phase Mapping:**
- **Phase 1 (Multi-Player Foundation):** Basic positional balance checks
- **Phase 2 (Advanced Multi-Player):** Full VBD/SGP integration, scarcity scoring

**Sources:**
- [Smart Fantasy Baseball: Standings Gain Points](https://www.smartfantasybaseball.com/2013/03/create-your-own-fantasy-baseball-rankings-part-5-understanding-standings-gain-points/)
- [BaseballHQ: SGP Denominators](https://www.baseballhq.com/articles/gaming/rotisserie/sgp-denominators-for-2024)
- Existing implementation: `packages/shared/src/formulas.ts` lines 213-235

---

### Pitfall 4: VBD/SGP Baseline Shifts from Roster Changes

**What goes wrong:** 3-for-1 trade evaluation uses static replacement level, but adding 1 superstar and dropping 3 bench players CHANGES the replacement level for the entire league, invalidating the original calculation.

**Why it happens:**
- Replacement level is "the Nth best player at a position" (formulas.ts lines 213-235)
- Multi-player trades change the FA pool (dropped players enter waivers)
- Other teams' replacement levels improve (can now pick up your drops)
- Your evaluation assumed static baselines

**Consequences:**
- 3-for-1 trade looks like +4 points, but after you drop 2 bench players, opponents grab them and net +2 points themselves
- "Win the trade" but "lose the waiver wire battle"
- Long-term roster construction damaged

**Prevention:**

1. **Simulate league-wide baseline shift:**
   ```typescript
   async simulateLeagueWideImpact(
     leagueId: number,
     trade: ProposedTrade,
     snapshotDate: string
   ): Promise<{
     yourImpact: number;
     opponentBestCase: number;  // If they optimally pick up your drops
     netAdvantage: number;       // yourImpact - opponentBestCase
   }> {
     // 1. Simulate your team post-trade
     const yourDelta = await this.simulateTradeImpact(...);

     // 2. Simulate best opponent pickup from your drops
     const droppedPlayers = identifyDroppedPlayers(trade);
     const bestOpponentPickup = await this.simulateBestWaiverClaim(
       leagueId,
       droppedPlayers,
       snapshotDate
     );

     return {
       yourImpact: yourDelta,
       opponentBestCase: bestOpponentPickup,
       netAdvantage: yourDelta - bestOpponentPickup
     };
   }
   ```

2. **Add "waiver exposure" warning:**
   ```typescript
   interface TradeImpactAnalysis {
     // ... existing fields
     waiverExposure?: {
       droppedPlayers: Player[];
       estimatedOpponentGain: number;  // Points if best team claims best drop
       netTradeValue: number;           // Delta minus opponent gain
     };
   }
   ```

3. **For 3-for-1 trades, simulate with replacement player added:**
   - Don't just remove 3 and add 1
   - Remove 3, add 1, add best available FA (approximation of optimal roster management)

**Detection:**
- 3-for-1 trade executed, week later opponent is +3 points and you're only +1
- Trade impact showed +4 but actual standings change is +1
- User feedback: "My drops came back to haunt me"

**Phase Mapping:**
- **Phase 2 (Advanced Multi-Player):** League-wide impact simulation
- **Phase 2:** "Waiver exposure" warnings for unbalanced trades

**Sources:**
- [Subvertadown: VBD Baselines Guide](https://subvertadown.com/article/guide-to-understanding-the-different-baselines-in-value-based-drafting-vbd-vols-vs-vorp-vs-man-games-and-beer-)
- [Footballguys: Rethinking VBD](https://subscribers.footballguys.com/apps/article.php?article=HarstadValueOverBaseline)

---

### Pitfall 5: Simulation Explosion (Combinatorial Complexity)

**What goes wrong:** UI adds "Suggest 3-for-3 trades" feature, backend generates 14 million simulations (50 players × 50 players × 50 players combinations), server OOMs, request times out.

**Why it happens:**
- Current `generateTradeCandidates()` is O(roster_size²) for 1-for-1 (lines 309-322)
- N-for-N is O(roster_size^(2N))
- 3-for-3 in 12-team league with 25-player rosters: C(25,3) × C(300,3) = 2,300 × 4,455,100 = 10 billion combinations

**Consequences:**
- Feature unusable (request timeout after 60 seconds)
- Database connection pool exhausted from simulation queries
- Workers crash from memory pressure

**Prevention:**

1. **Impose hard limits on N-for-N generation:**
   ```typescript
   const MAX_SIMULATIONS_MULTI_PLAYER = 1000;  // vs 500 for 1-for-1 (line 288)
   const MAX_PLAYERS_PER_SIDE = 3;             // No 4-for-4 or higher

   if (trade.givePlayers.length > MAX_PLAYERS_PER_SIDE) {
     throw new Error("Trades larger than 3-for-3 not supported");
   }
   ```

2. **Use heuristic filtering before full simulation:**
   ```typescript
   // Step 1: Generate candidate combinations with simple heuristics
   const candidateCombos = generateCandidateCombinations(
     userRoster,
     partnerRoster,
     { maxPerSide: 3, minValueDelta: 5 }  // Only consider if heuristic shows +5
   );

   // Step 2: Sort by heuristic score (counting stats sum)
   candidateCombos.sort((a, b) => b.heuristicScore - a.heuristicScore);

   // Step 3: Simulate top 100 only
   const topCandidates = candidateCombos.slice(0, 100);
   for (const combo of topCandidates) {
     await this.analyzeTradeImpact(...);  // Full simulation
   }
   ```

3. **Offer tiered trade generation:**
   ```typescript
   interface TradeGenerationOptions {
     tradeSizes: Array<{ give: number; receive: number }>;
     // e.g., [{ give: 1, receive: 1 }, { give: 2, receive: 2 }]
     // Don't auto-generate 3-for-3 unless user requests
   }
   ```

4. **Background job for complex trades:**
   ```typescript
   // For 3-for-3 and above, don't block HTTP request
   async generateMultiPlayerTrades(leagueId: number, teamId: number) {
     // Enqueue BullMQ job
     await this.tradeQueue.add('generate-3-for-3', { leagueId, teamId });

     return {
       status: 'processing',
       estimatedCompletionTime: '2-3 minutes'
     };
   }
   ```

**Detection:**
- `/api/leagues/:id/teams/:teamId/trades/recommendations?size=3` times out
- Logs show "simulationsRun: 10000+" but endpoint hasn't returned
- Memory usage spikes to 2GB+ during trade generation

**Phase Mapping:**
- **Phase 1 (Multi-Player Foundation):** Limit to 2-for-2, add simulation caps
- **Phase 2 (Advanced Multi-Player):** Background jobs for 3-for-3+

**Sources:**
- Current implementation: `trade-recommendation.ts` lines 286-407 (optimization strategies)

---

### Pitfall 6: Replacement Player Selection Errors

**What goes wrong:** 3-for-1 trade simulation assumes you'll drop your worst bench player, but ESPN auto-drops your best IL player instead, destroying accuracy.

**Why it happens:**
- Unbalanced trades (receive 3, give 1) require roster cuts
- Simulation must guess which player gets dropped
- ESPN's drop logic: can't drop players in active lineup, prioritizes by roster slot
- App doesn't model ESPN's specific drop rules

**Consequences:**
- Simulation shows +3 points, user accepts trade, ESPN drops wrong player, actual gain is -1
- Trade recommendation includes receiving 3 IL players, league rules forbid
- User frustration: "App told me to accept this trade!"

**Prevention:**

1. **Model ESPN roster slot priority for auto-drops:**
   ```typescript
   function determineAutoDropCandidate(
     currentRoster: Player[],
     incomingPlayers: Player[]
   ): Player {
     // ESPN priority (from observation, not documented):
     // 1. Never drop active lineup players
     // 2. Prefer bench over IL
     // 3. Within bench, drop lowest projected value

     const benchPlayers = currentRoster.filter(p => p.rosterSlot === 'BENCH');
     const ilPlayers = currentRoster.filter(p => p.rosterSlot === 'IL');

     // If bench available, drop lowest value bench player
     if (benchPlayers.length > 0) {
       return findLowestProjectedValue(benchPlayers);
     }

     // Otherwise drop IL (may fail if IL required for roster validity)
     return findLowestProjectedValue(ilPlayers);
   }
   ```

2. **Require user to specify drops for unbalanced trades:**
   ```typescript
   interface ProposedTrade {
     givePlayers: TradePlayer[];
     receivePlayers: TradePlayer[];
     requiredDrops?: TradePlayer[];  // For N-for-M where N < M
   }

   // In API endpoint:
   if (trade.receivePlayers.length > trade.givePlayers.length) {
     if (!trade.requiredDrops || trade.requiredDrops.length !== delta) {
       throw new Error(
         `Trade requires ${delta} drop(s). Please specify which players to drop.`
       );
     }
   }
   ```

3. **Add "assumed drops" to impact analysis:**
   ```typescript
   interface TradeImpactAnalysis {
     // ... existing fields
     assumedDrops?: {
       players: Player[];
       method: 'user-specified' | 'auto-selected' | 'none-required';
       impactIncludesDrops: boolean;  // Is drop impact in deltaOverallPoints?
     };
   }
   ```

**Detection:**
- 3-for-2 trade simulation matches user expectation but post-trade standings don't
- ESPN trade processor returns error "Cannot drop active player"
- User feedback: "It dropped the wrong guy!"

**Phase Mapping:**
- **Phase 1 (Multi-Player Foundation):** Require user-specified drops for unbalanced trades
- **Phase 2 (Advanced Multi-Player):** Auto-drop candidate suggestion with warnings

**Sources:**
- [Yahoo Fantasy uneven trade error](https://help.yahoo.com/kb/uneven-trade-error-message-fantasy-sports-sln6976.html)

---

## Historical Analysis

### Pitfall 7: ESPN Historical Data Deletion

**What goes wrong:** User requests "show my league's 2023 season replay," app tries to backfill via ESPN API, but ESPN returns 404 or empty arrays because they delete data after 1-2 years.

**Why it happens:**
- ESPN deletes historical boxscore data, transaction logs, and even league structures after seasons end
- No official retention policy published
- Community reports data loss for seasons >2 years old
- Some data (transaction events) deleted immediately after roster resets

**Consequences:**
- Historical replay impossible for old leagues
- "Season rewind" feature only works for current + previous season
- User expectations unmet: "My league has 10 years of history!"

**Prevention:**

1. **Document data retention limits upfront:**
   ```markdown
   ## Historical Analysis Limitations

   ESPN deletes historical data after seasons end:
   - **Current season:** Full data available
   - **Previous season:** Most data available (through ~March)
   - **2+ years ago:** Limited or no data

   **Recommendation:** Connect your league NOW to preserve this season's history.
   ```

2. **Archive snapshot data perpetually (don't depend on ESPN):**
   ```typescript
   // ALREADY DOING THIS ✓
   // league_daily_snapshot table stores daily snapshots
   // league_raw_payload archives ESPN responses

   // Extend to capture MORE:
   interface EnhancedSnapshot {
     // ... existing snapshot fields
     preservedForHistorical: boolean;  // Flag for permanent retention
     archiveMetadata: {
       espnDataAvailable: boolean;      // Can we re-fetch from ESPN?
       lastVerifiedDate: string;        // When we last confirmed ESPN has data
     };
   }
   ```

3. **Backfill with degradation:**
   ```typescript
   async backfillHistoricalData(
     leagueId: number,
     startDate: string,
     endDate: string
   ): Promise<BackfillResult> {
     const results = [];

     for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
       try {
         const snapshot = await this.espnAdapter.fetchLeague(leagueId, date);
         results.push({ date, status: 'success', data: snapshot });
       } catch (error) {
         if (error.status === 404) {
           results.push({
             date,
             status: 'data-deleted',
             degraded: true,
             reason: 'ESPN data no longer available'
           });
         }
       }
     }

     return { results, completeness: calculateCompleteness(results) };
   }
   ```

4. **Offer manual upload for historical data:**
   - Let users upload CSV exports from their own archives
   - "If you have old ESPN exports, upload them here for historical analysis"

**Detection:**
- Backfill job returns 404 for dates >1 year ago
- `league_daily_snapshot` table has gaps for old seasons
- User requests "2020 season replay" and gets empty results

**Phase Mapping:**
- **Phase 2 (Historical Foundation):** Document retention limits, enhanced archival flags
- **Phase 3 (Historical Advanced):** Manual CSV upload for old seasons

**Sources:**
- [GitHub: ESPN API historical data discussion](https://github.com/cwendt94/espn-api/blob/master/espn_api/baseball/league.py)
- [Steven Morse: ESPN Fantasy API](https://stmorse.github.io/journal/espn-fantasy-v3.html)
- Community reports: "league data disappearing from previous years"

---

### Pitfall 8: Transaction Deduplication Failures

**What goes wrong:** Backfill fetches 90 days of ESPN data, trade on June 15 appears 90 times in `league_transaction_event` table (once per day's snapshot), breaking trade retrospectives.

**Why it happens:**
- ESPN API returns "all transactions to date" in each league fetch (cumulative, not incremental)
- No unique transaction ID in ESPN responses
- Naive ingestion: `INSERT INTO league_transaction_event (date, type, players)`
- Same trade inserted every snapshot

**Consequences:**
- Trade retrospective shows "You made 90 trades on June 15"
- Database bloat (millions of duplicate rows)
- Timeline visualization broken
- Transaction-based features unusable

**Prevention:**

1. **Generate deterministic transaction hash:**
   ```typescript
   function generateTransactionHash(txn: ESPNTransaction): string {
     // Hash of: date + type + sorted player IDs + teams
     const key = [
       txn.date,
       txn.type,  // 'TRADE', 'ADD', 'DROP'
       txn.teamIds.sort().join(','),
       txn.playerIds.sort().join(',')
     ].join('|');

     return crypto.createHash('sha256').update(key).digest('hex');
   }
   ```

2. **Use hash as deduplication key:**
   ```typescript
   // In transaction ingestion:
   for (const txn of espnTransactions) {
     const hash = generateTransactionHash(txn);

     // Upsert: insert if not exists, update if exists
     await db
       .insertInto('league_transaction_event')
       .values({
         league_id: leagueId,
         transaction_hash: hash,  // NEW: unique constraint
         transaction_date: txn.date,
         transaction_type: txn.type,
         teams_json: txn.teams,
         players_json: txn.players,
         raw_espn_json: txn.raw
       })
       .onConflict((oc) => oc.column('transaction_hash').doNothing())
       .execute();
   }
   ```

3. **Add `league_transaction_event.transaction_hash` column:**
   ```sql
   ALTER TABLE league_transaction_event
     ADD COLUMN transaction_hash VARCHAR(64) UNIQUE;

   CREATE INDEX idx_transaction_hash
     ON league_transaction_event(transaction_hash);
   ```

4. **Idempotent backfill:**
   - Re-running backfill for same date range shouldn't create duplicates
   - Use UPSERT pattern with transaction_hash

**Detection:**
- `SELECT transaction_date, COUNT(*) FROM league_transaction_event GROUP BY transaction_date` shows 90 rows per date
- Trade retrospective UI lists same trade 100 times
- Database size explodes after historical backfill

**Phase Mapping:**
- **Phase 2 (Historical Foundation - CRITICAL):** Add transaction_hash column, deduplication logic
- **Phase 2:** Migration to deduplicate existing data

**Sources:**
- [ESPN Transaction Counter](https://support.espn.com/hc/en-us/articles/360058312172-Transaction-Counter)
- [GitHub: ESPN Fantasy Transaction Importer](https://github.com/wyndylew/espn-flb-transaction-importer)

---

### Pitfall 9: Snapshot Gaps in Time Series

**What goes wrong:** Historical standings chart shows smooth line from April 1 to April 20, then jumps discontinuously to May 5 (15-day gap), making trends impossible to read.

**Why it happens:**
- Daily snapshots fail for various reasons (ESPN API down, server restart, cron job missed)
- Historical backfill can't recover missing days if ESPN data deleted
- Time series queries assume continuous daily data
- No interpolation for missing dates

**Consequences:**
- Charts have visual gaps (broken lines)
- "When did I peak in HR standings?" shows wrong date
- Trade retrospectives fail (need standings on trade_date + 7 days)

**Prevention:**

1. **Detect gaps during time series query:**
   ```typescript
   async getStandingsTimeSeries(
     leagueId: number,
     teamId: number,
     startDate: string,
     endDate: string
   ): Promise<TimeSeriesData> {
     const snapshots = await db
       .selectFrom('team_daily_overall')
       .selectAll()
       .where('league_id', '=', leagueId)
       .where('team_id', '=', teamId)
       .where('snapshot_date', '>=', startDate)
       .where('snapshot_date', '<=', endDate)
       .orderBy('snapshot_date', 'asc')
       .execute();

     const gaps = detectGaps(snapshots, startDate, endDate);

     return {
       data: snapshots,
       gaps,  // Array of { start, end, durationDays }
       completeness: (snapshots.length / expectedDays) * 100
     };
   }
   ```

2. **Interpolation for counting stats (with warnings):**
   ```typescript
   function interpolateGaps(
     snapshots: Snapshot[],
     gaps: Gap[]
   ): Snapshot[] {
     const interpolated = [...snapshots];

     for (const gap of gaps) {
       const before = findSnapshotBefore(gap.start);
       const after = findSnapshotAfter(gap.end);

       if (!before || !after) {
         // Can't interpolate edges, leave gap
         continue;
       }

       // LINEAR interpolation for counting stats (HR, RBI, etc.)
       // This is APPROXIMATION, mark as synthetic
       const syntheticSnapshots = linearInterpolate(before, after, gap);

       syntheticSnapshots.forEach(s => {
         s.is_synthetic = true;  // NEW FLAG
         s.interpolation_method = 'linear';
       });

       interpolated.push(...syntheticSnapshots);
     }

     return interpolated.sort((a, b) => a.date - b.date);
   }
   ```

3. **NEVER interpolate rate stats directly:**
   ```typescript
   // ❌ WRONG: Linear interpolation of AVG
   const interpolatedAVG = avgBefore + ((avgAfter - avgBefore) / gapDays) * dayOffset;

   // ✅ CORRECT: Interpolate components, recalculate rate
   const interpolatedH = hBefore + ((hAfter - hBefore) / gapDays) * dayOffset;
   const interpolatedAB = abBefore + ((abAfter - abBefore) / gapDays) * dayOffset;
   const interpolatedAVG = interpolatedH / interpolatedAB;
   ```

4. **UI treatment of gaps:**
   ```typescript
   // In frontend chart:
   const chartConfig = {
     data: timeSeries,
     annotations: gaps.map(gap => ({
       type: 'region',
       start: gap.start,
       end: gap.end,
       style: { fill: 'yellow', opacity: 0.3 },
       label: `${gap.durationDays} days missing`
     }))
   };
   ```

**Detection:**
- Time series chart has visible breaks
- Query returns 120 days of data in 180-day range (33% missing)
- Tooltip shows "Interpolated (estimated)"

**Phase Mapping:**
- **Phase 2 (Historical Foundation):** Gap detection, UI annotations
- **Phase 3 (Historical Advanced):** Component-based interpolation, completeness scoring

**Sources:**
- [Towards Data Science: Handling Gaps in Time Series](https://towardsdatascience.com/handling-gaps-in-time-series-dc47ae883990/)
- [Time Series Interpolation Techniques](https://fastercapital.com/content/Time-Series-Interpolation--Filling-the-Gaps--Time-Series-Interpolation-Techniques.html)

---

### Pitfall 10: Retroactive Projection Fallacy

**What goes wrong:** Historical "what-if" simulation uses TODAY's projections to simulate a June trade, but June projections were COMPLETELY DIFFERENT (pre-injury, pre-breakout).

**Why it happens:**
- `player_projection` table stores only current projections
- Historical backfill can't recreate what FanGraphs projected on June 15, 2023
- Developers assume "use current projection, subtract actual stats to date"
- This produces anachronistic simulations (using knowledge from the future)

**Consequences:**
- Trade retrospective: "You should have traded for Ohtani in June" (but June projections didn't show his injury)
- "If you'd made this trade, you'd have won!" (but analysis uses post-season projections)
- Misleading "what-if" scenarios that don't reflect real-time decision quality

**Prevention:**

1. **Archive projections at time of snapshot:**
   ```typescript
   // Extend projections_run schema:
   interface ProjectionsRun {
     id: number;
     run_date: Date;
     as_of_date: string;
     source: 'fangraphs' | 'steamer' | 'thebat';
     is_archived: boolean;        // NEW: mark historical projections
     archived_from_date: string;  // NEW: "these were the RoS projections as of X"
   }

   // When user uploads new projections, DON'T delete old ones:
   async ingestProjections(csv: string, asOfDate: string) {
     // Mark previous run as archived (don't delete)
     await db
       .updateTable('projections_run')
       .set({ is_archived: true, archived_from_date: asOfDate })
       .where('run_date', '<', asOfDate)
       .execute();

     // Insert new run
     const newRun = await db
       .insertInto('projections_run')
       .values({ run_date: now(), as_of_date: asOfDate, is_archived: false })
       .execute();
   }
   ```

2. **Query correct historical projection for retrospectives:**
   ```typescript
   async getProjectionsAsOf(date: string): Promise<ProjectionsRun> {
     // Get projections that were current on that historical date
     return db
       .selectFrom('projections_run')
       .selectAll()
       .where('as_of_date', '<=', date)
       .orderBy('as_of_date', 'desc')
       .limit(1)
       .executeTakeFirst();
   }
   ```

3. **Warn when historical projections unavailable:**
   ```typescript
   interface TradeRetrospective {
     tradeDate: string;
     actualImpact: CategoryImpact[];
     simulatedImpact: CategoryImpact[];
     simulationWarnings: string[];  // e.g., ["Using current projections (historical unavailable)"]
   }
   ```

4. **Document projection archival requirements:**
   - Users must upload fresh projections weekly/monthly to build historical record
   - First-time users can't do retrospectives (no historical projection baseline)

**Detection:**
- "What-if" simulation for June trade shows player with 200 projected HR (he hit 50 total)
- Trade retrospective accuracy is terrible (recommendations don't match results)
- All historical simulations use same projection values

**Phase Mapping:**
- **Phase 3 (Historical Advanced):** Projection archival, as-of-date queries
- **Phase 3:** UI warnings when using anachronistic projections

**Sources:**
- Projection staleness already flagged in base PITFALLS.md (Pitfall #7)

---

### Pitfall 11: Rate Stat Interpolation Errors

**What goes wrong:** Time series has 10-day gap, interpolation calculates `AVG_gap = (AVG_before + AVG_after) / 2 = .285`, but component math yields `.301` (20-point error).

**Why it happens:**
- Pitfall #9 solution uses linear interpolation
- Naive developer interpolates rate stats directly instead of components
- Same error as multi-player trade math (Pitfall #2) but in time series context

**Consequences:**
- Historical charts show impossible trends (AVG increasing by 50 points in 1 day)
- ERA goes negative during gap periods
- Users manually verify and find app wrong

**Prevention:**

1. **ALWAYS interpolate components, never rates:**
   ```typescript
   function interpolateSnapshot(
     before: Snapshot,
     after: Snapshot,
     targetDate: string
   ): Snapshot {
     const daysBefore = daysBetween(before.date, targetDate);
     const totalDays = daysBetween(before.date, after.date);
     const ratio = daysBefore / totalDays;

     // ✅ CORRECT: Interpolate H and AB
     const interpolatedH = before.H + (after.H - before.H) * ratio;
     const interpolatedAB = before.AB + (after.AB - before.AB) * ratio;

     // Calculate AVG from interpolated components
     const interpolatedAVG = interpolatedH / interpolatedAB;

     // ❌ WRONG (don't do this):
     // const interpolatedAVG = before.AVG + (after.AVG - before.AVG) * ratio;

     return {
       date: targetDate,
       H: interpolatedH,
       AB: interpolatedAB,
       AVG: interpolatedAVG,
       is_synthetic: true
     };
   }
   ```

2. **Use existing formulas from `formulas.ts`:**
   ```typescript
   import { calculateAVG, calculateERA, calculateWHIP } from '@/shared/formulas';

   // After interpolating components:
   snapshot.AVG = calculateAVG({ H: snapshot.H, AB: snapshot.AB });
   snapshot.ERA = calculateERA({ ER: snapshot.ER, IP: snapshot.IP });
   snapshot.WHIP = calculateWHIP({ H: snapshot.H, BB: snapshot.BB, IP: snapshot.IP });
   ```

3. **Store components in snapshot tables:**
   ```sql
   -- team_daily_category_totals already has components_json ✓ (line 124 in schema.ts)
   -- Ensure interpolation uses this field, not computed value column
   ```

4. **Add test for gap interpolation accuracy:**
   ```typescript
   test('interpolate 7-day gap maintains component math', () => {
     const before = { date: '2025-04-01', H: 100, AB: 300, AVG: 0.333 };
     const after = { date: '2025-04-08', H: 120, AB: 360, AVG: 0.333 };

     const interpolated = interpolateSnapshot(before, after, '2025-04-04');

     // Midpoint components
     expect(interpolated.H).toBeCloseTo(110, 0);
     expect(interpolated.AB).toBeCloseTo(330, 0);

     // AVG calculated from components (not averaged)
     expect(interpolated.AVG).toBeCloseTo(110 / 330, 4);  // 0.3333
     expect(interpolated.AVG).not.toBeCloseTo(0.333, 4);  // Would be same if averaged
   });
   ```

**Detection:**
- Interpolated AVG value is impossible (> .400 or < .150)
- Manual calculation of H/AB doesn't match displayed AVG
- Chart shows discontinuous jumps after gap filling

**Phase Mapping:**
- **Phase 2 (Historical Foundation - CRITICAL):** Component-based interpolation
- **Phase 2:** Integration tests for gap filling accuracy

**Current Status:** ⚠️ RISK - interpolation logic doesn't exist yet, easy to implement wrong

**Sources:**
- Same as Pitfall #2 (component math)

---

### Pitfall 12: Trade Retrospective Attribution

**What goes wrong:** "Trade impact: +3 points" but user's standings actually went +5, app says "trade worked!" but ignores that 2 other trades and 10 waiver moves also happened that week.

**Why it happens:**
- Trade retrospective compares `standings[trade_date]` vs `standings[trade_date + 30]`
- Attributes entire delta to the trade
- Ignores other roster moves, injuries, player performance variance
- No causal isolation

**Consequences:**
- "This trade won you the league!" (actually the waiver pickup did)
- "This trade destroyed you" (actually player got injured post-trade)
- False confidence in trade evaluation accuracy

**Prevention:**

1. **Isolate trade impact using projection-based expectation:**
   ```typescript
   interface TradeRetrospective {
     trade: ProposedTrade;
     tradeDate: string;

     // Simulated impact (what we predicted)
     simulatedImpact: {
       projectedDelta: number;
       categoryImpacts: CategoryImpact[];
     };

     // Actual impact (what happened)
     actualImpact: {
       standingsBefore: number;  // On trade_date
       standingsAfter: number;   // 30 days later
       actualDelta: number;

       // Attribution breakdown
       attributedToTrade: number;     // Based on traded players' actual stats
       attributedToOther: number;     // Residual (other moves, variance)
       otherMovesDuringPeriod: number; // Count of waivers/trades after this trade
     };

     accuracy: {
       projectionError: number;        // actualDelta - projectedDelta
       errorReasons: string[];         // ["Player X injured", "Breakout by Player Y"]
     };
   }
   ```

2. **Calculate "attributed to trade" using actual stats:**
   ```typescript
   async calculateAttributedImpact(
     trade: ProposedTrade,
     tradeDate: string,
     evaluationDate: string  // e.g., 30 days later
   ): Promise<number> {
     // Get actual stats accrued by traded players during period
     const receivedPlayers = trade.receivePlayers;
     const givenPlayers = trade.givePlayers;

     // Stats accumulated between tradeDate and evaluationDate
     const receivedStats = await getPlayerStatsInPeriod(receivedPlayers, tradeDate, evaluationDate);
     const givenStats = await getPlayerStatsInPeriod(givenPlayers, tradeDate, evaluationDate);

     // Calculate category delta using component math
     const categoryDeltas = calculateCategoryDeltas(receivedStats, givenStats);

     // Convert to standings points
     return convertDeltasToStandingsPoints(categoryDeltas);
   }
   ```

3. **Flag confounding variables:**
   ```typescript
   const confounds = [];

   // Check for injuries to traded players
   if (receivedPlayers.some(p => wentOnIL(p, tradeDate, evaluationDate))) {
     confounds.push('Received player(s) injured during evaluation period');
   }

   // Check for other trades
   const otherTrades = await getTradesDuringPeriod(teamId, tradeDate, evaluationDate);
   if (otherTrades.length > 0) {
     confounds.push(`${otherTrades.length} other trades during evaluation period`);
   }

   // Check for waiver activity
   const waiverMoves = await getWaiversDuringPeriod(teamId, tradeDate, evaluationDate);
   if (waiverMoves.length > 5) {
     confounds.push('Heavy waiver activity (impact unclear)');
   }
   ```

4. **Present retrospective with caveats:**
   ```markdown
   ## Trade Retrospective: [Player A] for [Player B]

   **Projected impact:** +2.5 points
   **Actual standings change (30 days):** +4.0 points

   **Attribution:**
   - Directly from trade: +2.0 points
   - Other roster moves: +1.5 points
   - Variance/luck: +0.5 points

   **Confounding factors:**
   - 3 other trades during evaluation period
   - Player C went on IL (unrelated to trade)
   ```

**Detection:**
- Every trade retrospective shows "trade was good!" (confirmation bias)
- Retrospective accuracy is 50% (random)
- Users say "that's not why I won, it was the waiver pickup!"

**Phase Mapping:**
- **Phase 3 (Historical Advanced):** Attribution analysis, confound detection
- **Phase 3:** UI showing breakdown of impact sources

**Sources:**
- Statistical concept: confounding variables, causal inference

---

### Pitfall 13: Settings Changes Mid-Season

**What goes wrong:** Historical replay shows team had 10 roto points in June, 12 in July, but June used 10-team league (10 categories) and July switched to 12-team league (12 categories), making comparison nonsensical.

**Why it happens:**
- Leagues can add/remove categories mid-season (rare but possible)
- Leagues can add teams mid-season (expansion)
- `league_settings_version.effective_date` tracks this (already in schema!)
- Time series queries ignore settings changes

**Consequences:**
- Charts show discontinuous jumps at settings change boundaries
- "You gained 15 points!" (actually league added 5 categories)
- Historical comparisons invalid

**Prevention:**

1. **Use existing `league_settings_version` table (schema.ts lines 56-62):**
   ```typescript
   async getSettingsForDate(
     leagueId: number,
     snapshotDate: string
   ): Promise<LeagueSettings> {
     return db
       .selectFrom('league_settings_version')
       .selectAll()
       .where('league_id', '=', leagueId)
       .where('effective_date', '<=', snapshotDate)
       .orderBy('effective_date', 'desc')
       .limit(1)
       .executeTakeFirst();
   }
   ```

2. **Normalize time series across settings changes:**
   ```typescript
   async getStandingsTimeSeries(
     leagueId: number,
     teamId: number,
     startDate: string,
     endDate: string
   ): Promise<TimeSeriesData> {
     const snapshots = await fetchSnapshots(...);

     // Detect settings changes
     const settingsChanges = await db
       .selectFrom('league_settings_version')
       .selectAll()
       .where('league_id', '=', leagueId)
       .where('effective_date', '>=', startDate)
       .where('effective_date', '<=', endDate)
       .execute();

     if (settingsChanges.length > 1) {
       // Settings changed during period
       return {
         data: snapshots,
         settingsChanges: settingsChanges.map(sc => ({
           date: sc.effective_date,
           changes: diffSettings(previousSettings, sc.settings_json)
         })),
         warning: 'League settings changed during this period. Comparisons may not be valid.'
       };
     }
   }
   ```

3. **Annotate charts at settings change points:**
   ```typescript
   // In frontend:
   const annotations = settingsChanges.map(change => ({
     type: 'line',
     position: change.date,
     label: 'Settings changed',
     style: { stroke: 'red', strokeWidth: 2, strokeDasharray: '5,5' }
   }));
   ```

4. **Recalculate historical points using consistent settings:**
   - For "season summary," pick one settings version (e.g., final)
   - Recompute all historical points using final settings
   - Label as "Normalized to end-of-season settings"

**Detection:**
- Time series chart has vertical jump on specific date
- User says "we changed categories in June but chart doesn't show it"
- Roto points sum doesn't match number of categories × number of teams

**Phase Mapping:**
- **Phase 2 (Historical Foundation):** Settings change detection, UI annotations
- **Phase 3 (Historical Advanced):** Normalized historical recalculation

**Current Status:** ✅ SCHEMA SUPPORTS - `league_settings_version` table exists, just need to use it

**Sources:**
- Existing schema: `packages/backend/src/db/schema.ts` lines 56-62

---

### Pitfall 14: Backfill Rate Limiting

**What goes wrong:** User requests "backfill entire 2024 season" (180 days), app fires 180 ESPN API requests in 10 seconds, ESPN returns 429 Too Many Requests, IP banned for 24 hours, all users impacted.

**Why it happens:**
- Backfill naively loops over dates without rate limiting
- ESPN API has undocumented rate limits
- No exponential backoff on 429 responses
- Single-threaded backfill (can't pause/resume)

**Consequences:**
- ESPN bans app's IP
- All league snapshots fail for 24 hours
- Users complain "app is down"
- Backfill feature becomes unusable

**Prevention:**

1. **Implement rate limiting for backfill:**
   ```typescript
   async backfillHistoricalData(
     leagueId: number,
     startDate: string,
     endDate: string
   ): Promise<void> {
     const dates = generateDateRange(startDate, endDate);

     // Limit: 1 request per 2 seconds (30 per minute, well below ESPN's limit)
     for (const date of dates) {
       await this.rateLimiter.throttle(async () => {
         await this.fetchAndStoreSnapshot(leagueId, date);
       }, { minDelayMs: 2000 });
     }
   }
   ```

2. **Exponential backoff on 429:**
   ```typescript
   async fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
     for (let attempt = 0; attempt < maxRetries; attempt++) {
       const response = await fetch(url);

       if (response.status === 429) {
         const retryAfter = response.headers.get('Retry-After') || (2 ** attempt);
         this.logger.warn({ retryAfter }, 'Rate limited, backing off');
         await sleep(retryAfter * 1000);
         continue;
       }

       return response;
     }

     throw new Error('Max retries exceeded');
   }
   ```

3. **Backfill as background job (BullMQ):**
   ```typescript
   // Don't block HTTP request
   async requestBackfill(leagueId: number, startDate: string, endDate: string) {
     const job = await this.backfillQueue.add('historical-backfill', {
       leagueId,
       startDate,
       endDate
     }, {
       attempts: 3,
       backoff: { type: 'exponential', delay: 60000 }
     });

     return {
       jobId: job.id,
       status: 'queued',
       estimatedDuration: `${daysBetween(startDate, endDate) * 2}s`
     };
   }
   ```

4. **Progress tracking:**
   ```typescript
   interface BackfillStatus {
     jobId: string;
     totalDays: number;
     completedDays: number;
     progress: number;  // 0-100
     status: 'queued' | 'running' | 'completed' | 'failed';
     errors: Array<{ date: string; reason: string }>;
   }
   ```

5. **Circuit breaker on ESPN API:**
   ```typescript
   // If error rate >10% across all requests, pause backfill
   if (this.espnErrorRate > 0.1) {
     this.logger.error('ESPN API error rate too high, pausing backfill');
     throw new Error('ESPN API unhealthy, try again later');
   }
   ```

**Detection:**
- ESPN returns 429 during backfill
- Backfill job completes in 10 seconds (should take 6+ minutes for 180 days)
- All users see "Unable to fetch league data" immediately after backfill starts

**Phase Mapping:**
- **Phase 2 (Historical Foundation - CRITICAL):** Rate limiting, exponential backoff
- **Phase 2:** Background job queue for backfill
- **Phase 3 (Historical Advanced):** Circuit breaker, progress tracking UI

**Sources:**
- [GitHub: ESPN API rate limiting discussion](https://github.com/cwendt94/espn-api)
- Base PITFALLS.md: Pitfall #11 (Missing Rate Limiting)

---

## Summary: Critical Path for Multi-Player Trades & Historical Analysis

### Must-Fix Before Launch

| Pitfall | Phase | Risk Level | Estimated Effort |
|---------|-------|------------|------------------|
| #1: Roster slot validation | Phase 1 | 🚨 Blocker | 1 week |
| #2: Multi-player component math tests | Phase 1 | 🚨 Critical | 3 days |
| #5: Simulation complexity limits | Phase 1 | 🚨 Blocker | 3 days |
| #8: Transaction deduplication | Phase 2 | 🚨 Critical | 1 week |
| #11: Rate stat interpolation | Phase 2 | 🚨 Critical | 3 days |
| #14: Backfill rate limiting | Phase 2 | 🚨 Critical | 3 days |

**Total Critical Work:** ~3 weeks

### Recommended Phases

**Phase 1: Multi-Player Foundation (2-3 weeks)**
- Pitfall #1: Roster constraint validation
- Pitfall #2: Component math testing
- Pitfall #5: Simulation limits (2-for-2 max)
- Pitfall #6: Required drops for unbalanced trades

**Phase 2: Historical Foundation (3-4 weeks)**
- Pitfall #7: Document ESPN data retention
- Pitfall #8: Transaction deduplication
- Pitfall #9: Gap detection in time series
- Pitfall #11: Component-based interpolation
- Pitfall #13: Settings change handling
- Pitfall #14: Backfill rate limiting

**Phase 3: Advanced Features (4-6 weeks)**
- Pitfall #3: Positional scarcity (VBD/SGP integration)
- Pitfall #4: League-wide impact simulation
- Pitfall #5: 3-for-3 trades (background jobs)
- Pitfall #10: Projection archival
- Pitfall #12: Trade attribution analysis

---

## Integration with Existing System

### Leverage Existing Patterns ✅

1. **Component math already correct:** `TradeRecommendationAgent.simulateTradeImpact()` lines 629-654 already handle multi-player rate stats correctly
2. **Settings versioning exists:** `league_settings_version` table ready for historical queries
3. **Degraded state pattern:** Extend to historical gaps (`is_synthetic`, `interpolation_method` flags)
4. **Raw payload archival:** `league_raw_payload` can store historical ESPN responses for deduplication

### New Infrastructure Needed ⚠️

1. **Transaction hash column:** `league_transaction_event.transaction_hash` (Pitfall #8)
2. **Projection archival:** `projections_run.is_archived`, `archived_from_date` (Pitfall #10)
3. **Synthetic snapshot flags:** `league_daily_snapshot.is_synthetic`, `interpolation_method` (Pitfall #9)
4. **Backfill job queue:** BullMQ queue for historical data fetching (Pitfall #14)

---

## Using This Document

**For Feature Planning:**
- Phase 1 must complete before multi-player trades go live
- Phase 2 must complete before historical analysis release
- Phase 3 is optional (advanced features)

**For Code Reviews:**
- Reference pitfall numbers in PRs
- Multi-player trade PRs must address Pitfalls #1, #2, #5, #6
- Historical PRs must address Pitfalls #8, #9, #11, #14

**For Testing:**
- Integration tests from Pitfall #2 (component math)
- Deduplication tests from Pitfall #8
- Gap interpolation tests from Pitfall #11

**For User Documentation:**
- Pitfall #7 → "Historical data limitations" help article
- Pitfall #9 → "Understanding data gaps in charts"
- Pitfall #12 → "How trade retrospectives work (and their limits)"

---

**Last Updated:** 2026-02-20
**Confidence:** HIGH (based on existing codebase analysis + domain research)
**Next Review:** Before Phase 1 kickoff (multi-player trades)

**Sources:**
- [Smart Fantasy Baseball: Standings Gain Points](https://www.smartfantasybaseball.com/2013/03/create-your-own-fantasy-baseball-rankings-part-5-understanding-standings-gain-points/)
- [BaseballHQ: SGP Denominators](https://www.baseballhq.com/articles/gaming/rotisserie/sgp-denominators-for-2024)
- [Subvertadown: VBD Baselines Guide](https://subvertadown.com/article/guide-to-understanding-the-different-baselines-in-value-based-drafting-vbd-vols-vs-vorp-vs-man-games-and-beer-)
- [Yahoo Fantasy: Uneven Trade Error](https://help.yahoo.com/kb/uneven-trade-error-message-fantasy-sports-sln6976.html)
- [ESPN Transaction Counter](https://support.espn.com/hc/en-us/articles/360058312172-Transaction-Counter)
- [Towards Data Science: Handling Gaps in Time Series](https://towardsdatascience.com/handling-gaps-in-time-series-dc47ae883990/)
- [GitHub: ESPN API (cwendt94)](https://github.com/cwendt94/espn-api)
- [Steven Morse: ESPN Fantasy API v3](https://stmorse.github.io/journal/espn-fantasy-v3.html)
