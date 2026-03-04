---
phase: "30"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/dom-observers.ts
  - packages/extension/entrypoints/content.tsx
  - packages/extension/components/DraftSidebar.tsx
  - packages/extension/components/AuctionRecommendations.tsx
autonomous: true
requirements: ["quick-30"]

must_haves:
  truths:
    - "Extension correctly detects auction draft format when ESPN page loads with auction UI elements"
    - "Extension starts auction player observer even when format is detected on delayed re-check"
    - "Currently nominated player is prominently displayed at the top of the sidebar (outside scrollable area) during auction drafts"
    - "Draft efficiency (PickValueTracker) and projected standings (ProjectedStandingsPanel) sections are completely removed from the sidebar"
  artifacts:
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "Improved detectDraftFormat with additional ESPN auction indicators"
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Auction observer started on delayed re-check, not only on initial detection"
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Sidebar with nominated player at top, no PickValueTracker or ProjectedStandingsPanel"
    - path: "packages/extension/components/AuctionRecommendations.tsx"
      provides: "Auction recommendations without duplicate nominated player display"
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/dom-observers.ts"
      via: "detectDraftFormat() and observeCurrentAuctionPlayer()"
      pattern: "detectDraftFormat|observeCurrentAuctionPlayer"
    - from: "packages/extension/components/DraftSidebar.tsx"
      to: "packages/extension/lib/draft-state.ts"
      via: "useDraftStore().currentAuctionPlayer"
      pattern: "currentAuctionPlayer"
---

<objective>
Fix three Chrome extension issues: auction/snake draft format detection, prominent nominated player display, and removal of cluttered sidebar sections.

Purpose: Make the extension correctly detect auction drafts and show the most important information (currently nominated player) prominently during live auction drafts.
Output: Updated extension components with correct format detection, prominent nomination display, and cleaner sidebar.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/entrypoints/content.tsx
@packages/extension/lib/dom-observers.ts
@packages/extension/lib/draft-state.ts
@packages/extension/components/DraftSidebar.tsx
@packages/extension/components/AuctionRecommendations.tsx
@packages/extension/components/PickValueTracker.tsx
@packages/extension/components/ProjectedStandingsPanel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix auction format detection and ensure auction observer starts on delayed re-check</name>
  <files>
    packages/extension/lib/dom-observers.ts
    packages/extension/entrypoints/content.tsx
  </files>
  <action>
**In `packages/extension/lib/dom-observers.ts` — improve `detectDraftFormat()`:**

The current detection checks URL params (`draftType`, `format`) and DOM classes (`[class*="auction"]`, `[class*="bid"]`), plus `winningPrice` elements and `$N...remaining` text patterns. These are insufficient because ESPN auction drafts often don't have "auction" in class names early in page load.

Add these additional detection strategies (insert before the "Default to snake" return):

1. **Nomination queue detection**: ESPN auction drafts show a nomination queue. Check for elements containing text like "Nomination" or "Nominate" or elements with class patterns `[class*="nominat"]`, `[class*="queue"]`.

2. **Budget/dollar display in header area**: Look for any element near the top of the page showing dollar amounts like `$260` or `$XXX remaining` — these are auction-specific. Use a broader search: look for elements whose text matches `/\$\d+\s*(remaining|left|budget)/i` anywhere in the page body text.

3. **Bid button detection**: ESPN auction pages have bid/place bid buttons. Check for `button` elements whose text includes "bid" (case-insensitive): `Array.from(document.querySelectorAll('button')).some(btn => /bid/i.test(btn.textContent || ''))`.

4. **Player nomination area**: Check for elements with text "Up for bid" or "Current nomination" or similar patterns. Use: `document.body?.innerText?.match(/up for bid|current nomination|place.*bid|nominating/i)`.

Each additional check should return `"auction"` if found. Keep the existing checks as-is — these are additive fallbacks.

**In `packages/extension/entrypoints/content.tsx` — fix the delayed re-check to start auction observer:**

The current delayed re-check at line 577-594 re-initializes the draft format but does NOT start the `observeCurrentAuctionPlayer` observer. The `auctionPlayerCleanup` variable is set only once at line 521 and only if the initial detection was auction.

Fix the delayed re-check block (the `setTimeout(() => { ... }, 2000)` block around line 577) to ALSO start the auction player observer when switching from snake to auction:

```typescript
setTimeout(() => {
  const latestDetection = detectDraftFormat();
  if (latestDetection !== "auction") return;

  const latestState = useDraftStore.getState();
  if (latestState.draftFormat === "auction") return;

  latestState.initializeDraft({
    leagueId,
    draftFormat: "auction",
    totalTeams: latestState.totalTeams,
    rosterSize: latestState.rosterSize,
    myTeamId: latestState.myTeamId || teamId || "user",
    budget: latestState.remainingBudget || cachedLeagueConfig?.budget || 260,
  });

  // Start auction player observer since we just switched to auction format
  if (!auctionPlayerCleanup) {
    auctionPlayerCleanup = observeCurrentAuctionPlayer((player) => {
      useDraftStore.getState().setCurrentAuctionPlayer(player);
    });
    console.log("[ESPN Draft Assistant] Started auction player observer after delayed detection");
  }

  refreshAssistantData(); // Throttled, will respect 3s minimum
}, 2000);
```

Note: `auctionPlayerCleanup` is declared with `let` at line 520, so it's mutable and accessible in this scope.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` to verify the extension builds without errors.
  </verify>
  <done>
detectDraftFormat() has 4 additional auction detection strategies (nomination queue, budget display, bid buttons, nomination text). The delayed re-check in content.tsx starts the auction player observer when switching from snake to auction.
  </done>
</task>

<task type="auto">
  <name>Task 2: Move nominated player to top of sidebar and remove PickValueTracker + ProjectedStandingsPanel</name>
  <files>
    packages/extension/components/DraftSidebar.tsx
    packages/extension/components/AuctionRecommendations.tsx
  </files>
  <action>
**In `packages/extension/components/DraftSidebar.tsx`:**

1. **Remove imports** for `PickValueTracker` and `ProjectedStandingsPanel` (lines 7-8).

2. **Add `currentAuctionPlayer` to the destructured state** from `useDraftStore()` (add alongside the existing destructured properties).

3. **Add `rankings` to the destructured state** so we can look up the nominated player's auction value/ranking data.

4. **Add nominated player section** directly after the "Draft Status" section (the `bg-surface-secondary p-4 border-b` div) and BEFORE the `flex-1 overflow-y-auto` main content area. This places it in a fixed position that does NOT scroll away. Style it prominently:

```tsx
{/* Nominated Player Banner — fixed position, does not scroll */}
{draftFormat === "auction" && currentAuctionPlayer && (
  <div className="p-4 bg-accent/5 border-b-2 border-accent">
    <div className="text-xs font-semibold tracking-wide text-accent uppercase mb-1">Now Nominated</div>
    <div className="flex items-center justify-between">
      <div>
        <div className="text-base font-semibold text-content">
          {currentAuctionPlayer.playerName}
        </div>
        {currentAuctionPlayer.positions && currentAuctionPlayer.positions.length > 0 && (
          <div className="text-body-sm text-content-secondary">
            {currentAuctionPlayer.positions.join(" / ")}
          </div>
        )}
      </div>
      <div className="text-right">
        {currentAuctionPlayer.currentBid !== undefined && (
          <div>
            <div className="text-xs text-content-secondary">Current Bid</div>
            <div className="text-h3 font-display text-accent">
              ${currentAuctionPlayer.currentBid}
            </div>
          </div>
        )}
        {/* Show our recommended value if we can find this player in rankings */}
        {(() => {
          const matchedRanking = rankings.find(r =>
            r.playerId === currentAuctionPlayer.playerId ||
            r.playerName.toLowerCase() === currentAuctionPlayer.playerName.toLowerCase()
          );
          if (!matchedRanking?.dollarValue) return null;
          return (
            <div className="text-xs text-content-secondary mt-0.5">
              Our Value: <span className="font-semibold">${matchedRanking.dollarValue}</span>
            </div>
          );
        })()}
      </div>
    </div>
  </div>
)}
```

5. **Remove `<ProjectedStandingsPanel />`** from the main content area (currently at the top of the scrollable section, line 136).

6. **Remove `<PickValueTracker />`** from BOTH the auction branch (line 141) AND the snake branch (line 148) inside the main content area.

After changes, the main content area should look like:
```tsx
<div className="flex-1 overflow-y-auto flex flex-col">
  {draftFormat === "auction" ? (
    <>
      <AuctionBudgetTracker />
      <AuctionRecommendations />
    </>
  ) : (
    <>
      <RosterSummary />
      <SnakeTurnPairs />
      <DraftRecommendations />
    </>
  )}
</div>
```

**In `packages/extension/components/AuctionRecommendations.tsx`:**

Remove the "Current player up for auction" section (lines 216-241) — the `{currentAuctionPlayer && (...)}` block at the top of the return JSX. This was the old location; it's now in DraftSidebar. Also remove `currentAuctionPlayer` from the destructured state since it's no longer used in this component.
  </action>
  <verify>
Run `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` to verify the extension builds without errors. Verify no remaining imports of PickValueTracker or ProjectedStandingsPanel in DraftSidebar.tsx.
  </verify>
  <done>
Nominated player is displayed prominently at the top of the sidebar (outside scrollable area) with current bid and our recommended value. PickValueTracker and ProjectedStandingsPanel are completely removed from the sidebar. AuctionRecommendations no longer has a duplicate nominated player display.
  </done>
</task>

</tasks>

<verification>
1. `pnpm --filter extension build` completes without errors
2. DraftSidebar.tsx has no imports of PickValueTracker or ProjectedStandingsPanel
3. DraftSidebar.tsx renders currentAuctionPlayer banner before the scrollable content area
4. AuctionRecommendations.tsx does not render currentAuctionPlayer (no duplicate)
5. detectDraftFormat() has nomination queue, budget display, bid button, and nomination text detection strategies
6. content.tsx delayed re-check starts observeCurrentAuctionPlayer when switching to auction
</verification>

<success_criteria>
- Extension correctly detects auction format via expanded DOM heuristics
- Auction player observer starts even when format detected on 2-second delayed re-check
- Currently nominated player is shown prominently at top of sidebar with current bid and our value
- PickValueTracker and ProjectedStandingsPanel are removed from sidebar
- Extension builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/30-fix-auction-snake-detection-show-nominat/30-SUMMARY.md`
</output>
