---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/dom-observers.ts
  - packages/extension/lib/draft-config-detector.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Extension detects draft picks reliably from ESPN's actual DOM structure"
    - "Config detection works with real ESPN draft page HTML"
    - "Graceful fallback when selectors fail with helpful console warnings"
  artifacts:
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "Updated selectors matching real ESPN draft page"
      min_lines: 200
    - path: "packages/extension/lib/draft-config-detector.ts"
      provides: "Robust config detection with multiple fallback strategies"
      min_lines: 150
  key_links:
    - from: "packages/extension/entrypoints/content.tsx"
      to: "packages/extension/lib/dom-observers.ts"
      via: "observeDraftBoard callback"
      pattern: "observeDraftBoard\\("
    - from: "packages/extension/lib/dom-observers.ts"
      to: "ESPN draft page DOM"
      via: "querySelector on pick elements"
      pattern: "querySelector\\("
---

<objective>
Improve DOM detection robustness in the Chrome extension by analyzing the actual ESPN draft page HTML structure and updating selectors to match reality.

Purpose: Current DOM selectors are placeholders from plan 10-03 with known limitations. Extension fails to detect picks when ESPN's actual DOM differs from assumptions. This plan updates selectors based on the provided Untitled-1.html reference.

Output: Extension reliably detects picks, player names, teams, and config from real ESPN draft pages with graceful degradation.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@packages/extension/lib/dom-observers.ts
@packages/extension/lib/draft-config-detector.ts
@Untitled-1.html
</context>

<tasks>

<task type="auto">
  <name>Task 1: Analyze ESPN HTML and update DOM selectors</name>
  <files>
    packages/extension/lib/dom-observers.ts
  </files>
  <action>
    Analyze Untitled-1.html to find the actual ESPN draft page DOM structure. Extract real class names, data attributes, and element patterns for:

    1. **Draft board container** - Find the actual grid/board wrapper
    2. **Pick rows** - Completed picks vs upcoming picks classes
    3. **Player information** - Name, position, team extraction patterns
    4. **Team/owner information** - Fantasy team identification
    5. **Auction cost** - Bid/price display (if auction draft)
    6. **Pick metadata** - Pick number, player ID, grid position

    Update DRAFT_BOARD_SELECTORS, PICK_ROW_SELECTORS, and COMPLETED_PICK_SELECTORS arrays with real selectors found in the HTML. Order by specificity (most specific first, broader fallbacks last).

    Update parsePickElement() to:
    - Use actual ESPN class names and data attributes
    - Add multiple fallback strategies for each field
    - Improve error logging with specific failure reasons
    - Handle minified/obfuscated class names if present

    Add detailed comments documenting:
    - Which selectors match which ESPN elements
    - Why certain fallbacks exist
    - Known ESPN DOM variations (practice vs real drafts)
  </action>
  <verify>
    ```bash
    cd packages/extension
    # Check selectors updated from placeholders
    grep -c "draft-board-grid-pick-cell" lib/dom-observers.ts
    # Should find actual ESPN classes, not just generic placeholders

    # Verify error handling improved
    grep -c "ESPN Draft Assistant.*failed" lib/dom-observers.ts
    # Should have multiple specific error messages

    # Build extension successfully
    pnpm build
    ```
  </verify>
  <done>
    DOM observer selectors match actual ESPN HTML structure from Untitled-1.html, with multiple fallback strategies and improved error logging. Extension builds without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Improve config detection robustness</name>
  <files>
    packages/extension/lib/draft-config-detector.ts
  </files>
  <action>
    Analyze Untitled-1.html for league configuration elements:

    1. **Team count detection** - Find roster dropdowns, team columns, league info headers with actual selectors
    2. **Scoring categories** - Locate stat headers, category displays, settings panels
    3. **Roster slots** - Find roster composition displays, slot counts

    Update detectTeamCount(), detectCategories(), and detectRosterSlots() with:
    - Real ESPN selectors from the HTML
    - Multiple detection strategies (primary + 3-4 fallbacks each)
    - Better validation of extracted data (filter empty/placeholder options)
    - Logging of which strategy succeeded for debugging

    Enhance validateAndFindElement() in dom-observers.ts (if exists) or add similar validation:
    - Try each selector in order
    - Log warnings when primary fails but fallback succeeds
    - Log DOM snapshot on complete failure (body classes, first 5 elements)

    Improve isPracticeDraft() detection if practice draft HTML differs.
  </action>
  <verify>
    ```bash
    cd packages/extension
    # Check multiple strategies exist
    grep -c "Strategy [0-9]:" lib/draft-config-detector.ts
    # Should have 3+ strategies per detection function

    # Verify validation logging
    grep -c "Could not detect" lib/draft-config-detector.ts
    # Should have specific warnings per failure mode

    pnpm build
    ```
  </verify>
  <done>
    Config detection uses real ESPN selectors with multiple fallback strategies. Each detection function tries 3+ approaches. Helpful warnings logged when detection fails with context about what was missing. Extension builds successfully.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add DOM structure validation and testing helpers</name>
  <files>
    packages/extension/lib/dom-observers.ts
  </files>
  <action>
    Add defensive programming patterns to handle ESPN DOM changes gracefully:

    1. **Enhance validateAndFindElement()** (already exists in dom-observers.ts lines 95-146):
       - Already logs warnings on fallback and errors on complete failure
       - Verify it's used consistently for all critical selectors
       - Ensure DOM snapshot logging is detailed enough for debugging

    2. **Add selector health check function**:
       ```typescript
       export function diagnoseDOMStructure(): {
         draftBoardFound: boolean;
         pickRowsCount: number;
         completedPicksCount: number;
         selectorHealth: Record<string, boolean>;
         recommendations: string[];
       }
       ```
       This can be called from console for debugging: `window.espnDraftAssistant.diagnose()`

    3. **Improve parsePickElement error handling**:
       - Wrap in try-catch (already exists)
       - Log element structure on parse failures (tag, classes, children count)
       - Already has console.error for incomplete data - verify it's detailed enough

    4. **Add selector testing mode** (dev only):
       - Log successful selector matches with element count
       - This helps verify selectors work on different draft types
  </action>
  <verify>
    ```bash
    cd packages/extension
    # Check diagnoseDOMStructure exists
    grep -c "diagnoseDOMStructure" lib/dom-observers.ts
    # Should be 1 (function definition)

    # Check error logging enhanced
    grep -A5 "Error parsing pick" lib/dom-observers.ts | grep -c "console.error"
    # Should have multiple console.error calls with context

    pnpm build
    ```
  </verify>
  <done>
    DOM validation utilities added. diagnoseDOMStructure() function available for debugging. Error logging includes element structure context. Extension builds successfully and can be tested against ESPN draft pages with better diagnostics.
  </done>
</task>

</tasks>

<verification>
1. Extension builds without errors: `cd packages/extension && pnpm build`
2. Selectors updated from placeholders to match Untitled-1.html structure
3. Multiple fallback strategies exist for each detection function
4. Error logging includes specific failure context and DOM snapshots
5. diagnoseDOMStructure() helper available for runtime debugging
</verification>

<success_criteria>
- All DRAFT_BOARD_SELECTORS, PICK_ROW_SELECTORS, COMPLETED_PICK_SELECTORS updated with real ESPN classes
- detectTeamCount(), detectCategories(), detectRosterSlots() each have 3+ fallback strategies
- parsePickElement() tries multiple selectors per field with detailed error logging
- validateAndFindElement() used consistently for critical DOM queries
- diagnoseDOMStructure() function available for debugging
- Extension compiles successfully with `pnpm build`
- Code includes comments explaining ESPN DOM structure and fallback rationale
</success_criteria>

<output>
After completion, create `.planning/quick/10-improve-dom-detection-in-chrome-extensio/10-SUMMARY.md`
</output>
