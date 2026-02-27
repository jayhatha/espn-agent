---
phase: quick-18
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "User has a step-by-step checklist for testing DOM selectors on live ESPN draft pages"
    - "Checklist covers both snake and auction draft formats"
    - "Checklist includes diagnostic tools and troubleshooting steps"
  artifacts:
    - path: ".planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md"
      provides: "Manual testing checklist for DOM selector validation"
      min_lines: 100
  key_links: []
---

<objective>
Create a comprehensive manual testing checklist for validating DOM selectors on live ESPN draft pages.

Purpose: Enable manual testing and validation of the extension's DOM selectors during actual ESPN drafts to identify when ESPN changes their DOM structure and provides a systematic approach to debugging selector failures.
Output: Markdown checklist document with step-by-step testing procedures, expected results, and troubleshooting guidance.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@packages/extension/lib/dom-observers.ts
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Create DOM selector validation checklist</name>
  <files>.planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md</files>
  <action>
Create a comprehensive manual testing checklist covering:

**Pre-Test Setup:**
- How to access browser console (Chrome DevTools)
- How to load the extension in development mode
- How to access diagnostic functions (window.espnDraftAssistant.diagnose(), etc.)
- Which ESPN draft URLs to test (practice drafts vs live drafts)

**Core Selector Testing:**
For each selector category from dom-observers.ts:
1. Draft Board Selectors (DRAFT_BOARD_SELECTORS)
   - Manual verification steps
   - Expected DOM structure
   - Primary vs fallback selector testing
   - Console commands to test each selector

2. Pick Row Selectors (PICK_ROW_SELECTORS)
   - How to identify pick cells
   - Grid area style attribute verification
   - Testing during different draft states (pre-draft, active, completed)

3. Completed Pick Selectors (COMPLETED_PICK_SELECTORS)
   - Verifying pick data extraction (player name, team, position, cost)
   - Testing first/last name split patterns
   - Testing position parsing (comma vs slash separation)
   - Testing team ID and fantasy team detection

4. Current Auction Player Selectors (auction only)
   - Verifying current player detection
   - Testing bid amount extraction
   - Testing player change detection

**Diagnostic Tool Usage:**
- Step-by-step guide to using window.espnDraftAssistant.diagnose()
- How to interpret diagnostic output
- Using testParsePick() on specific elements
- Using diagnoseRosters() to verify team roster parsing

**Test Scenarios:**
1. Snake Draft Testing
   - Pre-draft state (no picks yet)
   - First pick made
   - Turn completion (2 picks by same team)
   - Mid-draft state
   - Near-completion state

2. Auction Draft Testing
   - Pre-auction state
   - First player nomination
   - Bidding in progress
   - Player won/assigned
   - Budget tracking

**Failure Modes & Troubleshooting:**
- What to check when draft board not found
- What to check when picks not detected
- What to check when player names missing
- What to check when positions incorrect
- How to inspect DOM structure manually
- How to identify ESPN DOM changes

**Selector Health Verification:**
- Checklist for each selector type
- Pass/fail criteria
- How to document failures for bug reports

**Edge Cases to Test:**
- Players with Jr/Sr suffixes
- Players with accented characters (José, González)
- Multi-position players (1B/OF, SS/2B)
- Players from teams with special abbreviations
- Grid area positions at boundaries (first pick, last pick)
- Rapid pick detection (back-to-back picks)

**Reporting Template:**
- Format for reporting selector failures
- Required information (browser, ESPN URL, console logs, DOM snapshot)
- Screenshots to include

Include actual console commands throughout (copy-pasteable), expected output examples, and specific CSS selectors to test manually.
  </action>
  <verify>
cat .planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md
# Check that file includes all sections, console commands, and is >100 lines
  </verify>
  <done>
Comprehensive DOM selector checklist exists covering pre-test setup, all selector categories, diagnostic tools, test scenarios for both draft formats, failure modes, edge cases, and reporting template with copy-pasteable console commands.
  </done>
</task>

</tasks>

<verification>
- [ ] Checklist file exists and is >100 lines
- [ ] Includes copy-pasteable console commands
- [ ] Covers both snake and auction draft testing
- [ ] Includes all selector categories from dom-observers.ts
- [ ] Provides troubleshooting guidance for common failures
- [ ] Includes reporting template for documenting issues
</verification>

<success_criteria>
Manual tester can follow the checklist step-by-step during a live ESPN draft to validate all DOM selectors, diagnose failures, and report issues with sufficient detail for debugging.
</success_criteria>

<output>
After completion, create `.planning/quick/18-create-dom-selector-validation-checklist/18-SUMMARY.md`
</output>
