---
phase: quick-18
plan: 01
subsystem: testing-documentation
tags: [testing, documentation, dom-selectors, chrome-extension, manual-testing]
dependency_graph:
  requires: [dom-observers.ts, content.tsx]
  provides: [manual-testing-checklist]
  affects: [qa-process, bug-reporting]
tech_stack:
  added: []
  patterns: [manual-testing, diagnostic-tools, health-checks]
key_files:
  created:
    - .planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md
  modified: []
decisions:
  - "Checklist covers both snake and auction draft formats for comprehensive testing"
  - "Copy-pasteable console commands throughout for ease of use during live drafts"
  - "Health check script provides automated pass/fail criteria for selector validation"
  - "Edge case testing includes Jr/Sr suffixes, accented characters, multi-position players, and grid boundaries"
  - "Reporting template includes all required information for debugging selector failures"
metrics:
  duration_minutes: 29
  tasks_completed: 1
  files_created: 1
  lines_added: 1252
  completed_date: 2026-02-27
---

# Quick Task 18: Create DOM Selector Validation Checklist - Summary

**One-liner:** Comprehensive 1250+ line manual testing checklist with copy-pasteable console commands for validating extension DOM selectors during live ESPN drafts.

## What Was Built

Created a systematic manual testing checklist (`DOM-SELECTORS-CHECKLIST.md`) covering:

1. **Pre-Test Setup** - DevTools access, extension loading, diagnostic function usage
2. **Core Selector Testing** - Draft board, pick rows, completed picks, current auction player
3. **Diagnostic Tool Usage** - `diagnose()`, `testPick()`, `diagnoseRosters()` with expected outputs
4. **Test Scenarios** - Snake and auction drafts at all stages (pre-draft, first pick, mid-draft, completion)
5. **Failure Modes** - Troubleshooting guides for board not found, picks not detected, missing names, incorrect positions
6. **Selector Health Verification** - Complete health check script with pass/fail criteria
7. **Edge Cases** - Jr/Sr suffixes, accented characters, multi-position players, grid boundaries, rapid picks
8. **Reporting Template** - Standardized format for documenting selector failures

## Deviations from Plan

None - plan executed exactly as written.

## Task Completion

### Task 1: Create DOM selector validation checklist ✅

**Files Created:**
- `.planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md` (1252 lines)

**Content Includes:**

**Pre-Test Setup:**
- Browser console access instructions (Chrome DevTools F12)
- Development mode extension loading steps
- Practice vs live draft URLs with tradeoffs
- Diagnostic function access verification

**Core Selector Testing:**
1. **Draft Board Selectors** - Primary `.draftBoardContainer` + 10 fallbacks, manual verification steps, expected results, troubleshooting
2. **Pick Row Selectors** - Grid-area primary + 12 secondary selectors, grid area validation, testing across draft states
3. **Completed Pick Selectors** - 9 selector strategies, player name extraction (combined + split patterns), position parsing (comma/slash separation), team ID detection, cost extraction for auction
4. **Current Auction Player** - 8 selectors, bid tracking, player change detection

**Diagnostic Tool Usage:**
- `window.espnDraftAssistant.diagnose()` - Complete DOM health check with interpretation guide
- `window.espnDraftAssistant.testPick(element)` - Single element parsing test
- `window.espnDraftAssistant.diagnoseRosters()` - Team roster verification
- Expected outputs and failure interpretation for each

**Test Scenarios:**

**Snake Draft:**
- Pre-draft (empty board verification)
- First pick (detection, data completeness)
- Turn completion (consecutive picks, no deduplication conflicts)
- Mid-draft (50+ picks, gap detection, team distribution)
- Near-completion (250+ picks, performance check)

**Auction Draft:**
- Pre-auction (format detection, budget initialization)
- First nomination (current player detection)
- Bidding in progress (real-time bid updates)
- Player won (cost recording, budget updates)
- Budget tracking (spending calculation, warnings)

**Failure Modes & Troubleshooting:**
- Draft board not found (4-step diagnostic, wait/retry, SPA route checks)
- Picks not detected (selector verification, manual parse trigger, error inspection)
- Player names missing (name element inspection, first/last split testing, alternative text containers)
- Positions incorrect (element inspection, split logic testing, badge/pill detection)

**Selector Health Verification:**
- 100+ line complete health check script
- Automated testing of all selector categories
- Pass/fail criteria (100% name extraction, 90% position/team extraction)
- Visual pass/fail report with emoji indicators

**Edge Cases:**
- Jr/Sr suffixes (Fernando Tatis Jr., verification commands)
- Accented characters (José Ramírez, normalization testing)
- Multi-position players (1B/OF, SS/2B, all positions captured)
- Grid boundaries (first pick 1/1, last pick 300/12)
- Rapid picks (back-to-back snake turns, duplicate detection)

**Reporting Template:**
- Environment (browser, version, URL, draft type, timestamp)
- Diagnostic results (diagnose() output)
- Failure description (what/when/frequency)
- Console logs (filtered, timestamped)
- DOM snapshot (element HTML, classes, attributes)
- Screenshots (draft page, console, sidebar)
- Steps to reproduce
- Expected vs actual

**Verification:**
```bash
cat .planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md
# File exists with 1252 lines
# 58 JavaScript code blocks with copy-pasteable commands
# Covers both snake and auction drafts
# All selector categories from dom-observers.ts included
# Troubleshooting for 4 major failure modes
# Complete reporting template
```

**Done:** Comprehensive DOM selector checklist exists covering pre-test setup, all selector categories, diagnostic tools, test scenarios for both draft formats, failure modes, edge cases, and reporting template with copy-pasteable console commands.

**Commit:** `b82ce60`

## Verification Results

✅ Checklist file exists and is 1252 lines (required >100 lines)
✅ Includes 58 copy-pasteable JavaScript console command blocks
✅ Covers both snake and auction draft testing with scenario checklists
✅ Includes all selector categories from dom-observers.ts (board, picks, completed, auction)
✅ Provides troubleshooting guidance for 4 common failure modes
✅ Includes standardized reporting template with 8 required sections

## Self-Check

**Files Created:**
```bash
[ -f ".planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md" ] && echo "FOUND" || echo "MISSING"
```
Result: FOUND ✅

**Line Count:**
```bash
wc -l .planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md
```
Result: 1252 lines (required minimum: 100) ✅

**Console Commands:**
```bash
grep -c '```javascript' .planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md
```
Result: 58 JavaScript code blocks ✅

**Content Coverage:**
```bash
grep -E "(Pre-Test Setup|Draft Board|Pick Row|Completed Pick|Auction Player|diagnose|Snake Draft|Auction Draft|Troubleshooting|Edge Cases|Reporting Template)" .planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md | wc -l
```
Result: All major sections present ✅

**Commit Exists:**
```bash
git log --oneline --all | grep -q "b82ce60" && echo "FOUND" || echo "MISSING"
```
Result: FOUND ✅

## Self-Check: PASSED ✅

All files created, content comprehensive, commits verified.

## Impact

**Testing Process:**
- Manual testers can now systematically validate all DOM selectors during live ESPN drafts
- Copy-pasteable console commands eliminate testing friction
- Automated health check script provides objective pass/fail criteria
- Edge case checklist ensures robust validation across player types and draft states

**Bug Reporting:**
- Standardized reporting template ensures all required debugging information is captured
- DOM snapshots, console logs, and diagnostic outputs enable faster issue diagnosis
- Expected vs actual comparisons clarify exact failure points

**Maintenance:**
- Checklist documents current selector strategies for future reference
- Troubleshooting guides reduce time to identify ESPN DOM changes
- Selector health verification enables proactive monitoring for ESPN updates

**Documentation Value:**
- 1250+ lines provide comprehensive coverage for QA team
- 58 copy-pasteable JavaScript commands reduce testing time
- Scenario-based organization (pre-draft, first pick, mid-draft, etc.) mirrors real draft flow
- Edge case testing ensures robustness across player name variations and draft formats

## Next Steps

**Usage:**
1. Share checklist with QA team before next release
2. Run checklist during practice drafts to establish baseline
3. Repeat after ESPN updates or user-reported selector failures
4. Update checklist when new selectors added to dom-observers.ts

**Continuous Improvement:**
- Add new edge cases as discovered in production
- Expand auction-specific testing as more auction features added
- Create automated version of health check for CI/CD pipeline (future enhancement)
- Track selector failure patterns to identify most fragile selectors

## Files Changed

**Created:**
- `.planning/quick/18-create-dom-selector-validation-checklist/DOM-SELECTORS-CHECKLIST.md` (1252 lines)
  - Pre-test setup guide
  - Core selector testing for all categories
  - Diagnostic tool usage with expected outputs
  - Test scenarios for snake and auction drafts
  - Failure modes and troubleshooting
  - Selector health verification script
  - Edge case testing checklist
  - Issue reporting template

## Success Criteria Met

✅ Manual tester can follow the checklist step-by-step during a live ESPN draft
✅ All DOM selectors validated systematically (board, picks, completed, auction)
✅ Diagnostic tools usage documented with expected outputs
✅ Failures diagnosed with specific troubleshooting steps
✅ Issues reported with sufficient detail for debugging (8-section template)
✅ Both snake and auction draft formats covered
✅ Edge cases tested (Jr/Sr, accents, multi-position, boundaries, rapid picks)

## Conclusion

Successfully created a comprehensive 1250+ line manual testing checklist that enables systematic validation of the extension's DOM selectors during live ESPN drafts. The checklist includes copy-pasteable console commands, automated health check scripts, scenario-based testing flows, troubleshooting guides for common failures, edge case coverage, and a standardized reporting template. This documentation provides QA teams with everything needed to validate selector robustness, identify ESPN DOM changes proactively, and report issues with complete debugging information.
