---
phase: quick-22
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/frontend/src/app/admin/auction-validation/page.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - User can select categories via checkboxes instead of editing JSON
    - User can select roster slots via checkboxes instead of editing JSON
    - Standard 5x5 categories are pre-checked by default
    - Standard roster slots are pre-checked with sensible counts
    - JSON is built from checkbox selections and submitted to API
  artifacts:
    - path: packages/frontend/src/app/admin/auction-validation/page.tsx
      provides: Checkbox-based category and roster selection
      min_lines: 500
  key_links:
    - from: Category checkboxes
      to: API categories parameter
      via: JSON.stringify(selectedCategories)
      pattern: "categories.*JSON\\.stringify"
    - from: Roster slot checkboxes
      to: API rosterSlots parameter
      via: Object.fromEntries(selectedSlots)
      pattern: "rosterSlots.*fromEntries"
---

<objective>
Replace JSON textarea inputs for categories and roster slots with checkbox-based UI for easier configuration

Purpose: Simplify auction validation configuration by replacing error-prone JSON editing with checkbox selections
Output: Updated admin page with checkbox-based category and roster slot selection
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@packages/frontend/src/app/admin/auction-validation/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Replace JSON inputs with checkbox-based category and roster slot selection</name>
  <files>packages/frontend/src/app/admin/auction-validation/page.tsx</files>
  <action>
Replace the categories and rosterSlots JSON textarea inputs with checkbox-based selection UI:

**Categories section:**
- Create state for selected categories: `useState<Category[]>()` with Category interface matching the JSON structure
- Default to standard 5x5 categories pre-checked (R, HR, RBI, SB, AVG, K, W, SV, ERA, WHIP)
- Organize checkboxes in two columns: Batting (5 categories) | Pitching (5 categories)
- Each checkbox shows category name (R, HR, RBI, etc.)
- On form submit, convert selected categories to JSON string for API

**Roster slots section:**
- Create state for selected slots: `useState<Map<string, number>>()` with slot name → count
- Default to standard roster positions pre-checked: C:1, 1B:1, 2B:1, 3B:1, SS:1, OF:3, UTIL:1, SP:3, RP:2, P:2, Bench:5
- Display as checkboxes with number inputs: [✓] C (count: [1])
- Organize in two columns: Position Players (C, 1B, 2B, 3B, SS, OF, UTIL) | Pitchers (SP, RP, P, Bench)
- When checkbox checked, show number input for count (default 1 for most, 3 for OF/SP, 2 for RP/P, 5 for Bench)
- On form submit, convert selected slots to JSON string object for API

**Styling:**
- Use grid layout for two-column organization
- Checkbox + label on left, number input on right (for roster slots)
- Same Tailwind classes as existing form inputs
- Add section headers: "Batting Categories", "Pitching Categories", "Position Players", "Pitchers"

**Preserve:**
- All other form fields unchanged (numTeams, budget, minBid, limit, ESPN fields)
- Existing validation, error display, results display
- Submit handler logic (just change how categories/rosterSlots JSON is built)
  </action>
  <verify>
Open http://localhost:3000/admin/auction-validation in browser and verify:
1. Categories displayed as checkboxes in two columns (Batting | Pitching)
2. Roster slots displayed as checkboxes with number inputs in two columns
3. Standard 5x5 categories pre-checked on page load
4. Standard roster slots pre-checked with correct counts on page load
5. Form submission builds correct JSON from selections and calls API
6. Results display still works after checkbox-based submission
  </verify>
  <done>
Auction validation page uses checkbox-based selection for categories and roster slots, with standard 5x5 defaults pre-checked, and successfully submits to API
  </done>
</task>

</tasks>

<verification>
Manual testing:
1. Navigate to /admin/auction-validation
2. Verify standard categories are pre-checked
3. Uncheck AVG, verify it's removed from submission
4. Toggle roster slot checkboxes, change counts
5. Submit form with ESPN league ID and verify API call succeeds
6. Check browser devtools network tab for correct JSON in request body
</verification>

<success_criteria>
- Categories displayed as checkboxes with sensible two-column layout
- Roster slots displayed as checkboxes with number inputs
- Standard 5x5 categories pre-checked by default
- Standard roster positions pre-checked with correct counts
- Form submission builds correct JSON from checkbox selections
- API validation endpoint receives correct format and returns results
</success_criteria>

<output>
After completion, create `.planning/quick/22-replace-json-inputs-with-checkboxes-for-/22-SUMMARY.md`
</output>
