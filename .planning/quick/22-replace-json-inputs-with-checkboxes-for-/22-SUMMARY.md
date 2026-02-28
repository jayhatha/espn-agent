---
phase: quick-22
plan: 01
subsystem: frontend-admin
tags: [ui, auction-validation, usability]

dependency_graph:
  requires: []
  provides: [checkbox-based-category-selection, checkbox-based-roster-selection]
  affects: [auction-validation-ui]

tech_stack:
  added: []
  patterns: [react-hooks, controlled-components, checkbox-forms]

key_files:
  created: []
  modified:
    - packages/frontend/src/app/admin/auction-validation/page.tsx

decisions:
  - Organized categories into Batting (8) and Pitching (7) sections for clarity
  - Pre-select standard 5x5 categories by default to match most common league format
  - Use Map<string, number> for roster slots to handle checkbox state + count values
  - Show number input only when checkbox is checked to reduce visual clutter
  - Add validation messages for empty selections to prevent submission errors

metrics:
  duration_minutes: 1
  completed_date: 2026-02-28
  tasks_completed: 1
  files_modified: 1
  commits: 1
---

# Quick Task 22: Replace JSON Inputs with Checkboxes for Category and Roster Selection

**One-liner:** Checkbox-based category and roster slot selection with standard 5x5 defaults instead of error-prone JSON editing

## Summary

Replaced JSON textarea inputs for categories and roster slots with intuitive checkbox-based selection UI in the auction validation admin page. Categories are organized into Batting and Pitching sections with standard 5x5 categories pre-selected. Roster slots include checkboxes with number inputs, pre-configured with typical league settings.

## Tasks Completed

| Task | Description | Commit | Files Changed |
|------|-------------|--------|---------------|
| 1 | Replace JSON inputs with checkbox-based UI | 2f84614 | page.tsx |

## Implementation Details

### Category Selection UI

**Organization:**
- Two-column grid: Batting Categories | Pitching Categories
- Batting: R, HR, RBI, SB, AVG, OBP, SLG, OPS
- Pitching: K, W, SV, HLD, QS, ERA, WHIP

**State Management:**
```typescript
const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
  new Set(STANDARD_5X5_STAT_KEYS)
);
```

**Pre-selected by default:** R, HR, RBI, SB, AVG, K, W, SV, ERA, WHIP

### Roster Slot Selection UI

**Organization:**
- Two-column grid: Position Players | Pitchers & Bench
- Each slot has checkbox + number input (shown when checked)
- Position Players: C, 1B, 2B, 3B, SS, OF, UTIL
- Pitchers: SP, RP, P, Bench

**State Management:**
```typescript
const [selectedSlots, setSelectedSlots] = useState<Map<string, number>>(
  new Map([
    ["C", 1], ["1B", 1], ["2B", 1], ["3B", 1], ["SS", 1],
    ["OF", 3], ["UTIL", 1], ["SP", 3], ["RP", 2], ["P", 2], ["Bench", 5]
  ])
);
```

### JSON Construction

On form submit, checkbox selections are converted to JSON:

**Categories:**
```typescript
const categoriesArray = AVAILABLE_CATEGORIES
  .filter(cat => selectedCategories.has(cat.stat_key))
  .map(cat => ({
    category_id: cat.category_id,
    stat_key: cat.stat_key,
    name: cat.name,
    type: cat.type,
    direction: cat.direction,
  }));

params.categories = JSON.stringify(categoriesArray);
```

**Roster Slots:**
```typescript
const rosterSlotsObj = Object.fromEntries(selectedSlots);
params.rosterSlots = JSON.stringify(rosterSlotsObj);
```

## Deviations from Plan

None - plan executed exactly as written.

## Testing Recommendations

1. Navigate to `/admin/auction-validation`
2. Verify standard 5x5 categories are pre-checked on page load
3. Toggle category checkboxes and verify selections update
4. Toggle roster slot checkboxes and verify number inputs appear/disappear
5. Change roster slot counts and verify state updates
6. Submit form with ESPN league ID and verify:
   - Network tab shows correct JSON in request body
   - Categories array matches selected checkboxes
   - Roster slots object matches checkbox states and counts
7. Uncheck all categories/slots and verify validation messages appear
8. Test with non-standard configurations (6x6, custom slots)

## Key Links

- **Category checkboxes → API categories parameter:** JSON.stringify(categoriesArray)
- **Roster slot checkboxes → API rosterSlots parameter:** JSON.stringify(Object.fromEntries(selectedSlots))
- **Standard 5x5 defaults:** Pre-selected on mount via useState initialization

## Success Criteria

- [x] Categories displayed as checkboxes in two-column layout (Batting | Pitching)
- [x] Roster slots displayed as checkboxes with number inputs in two-column layout
- [x] Standard 5x5 categories pre-checked by default
- [x] Standard roster slots pre-checked with correct counts
- [x] Form submission builds correct JSON from checkbox selections
- [x] Validation messages shown when no categories or slots selected
- [x] TypeScript compiles without errors
- [x] UI follows existing design patterns (Tailwind classes, spacing)

## Self-Check: PASSED

**Created files:** None

**Modified files:**
```bash
$ ls -la packages/frontend/src/app/admin/auction-validation/page.tsx
-rw-r--r--  1 jay-work  staff  15234 Feb 28 06:09 packages/frontend/src/app/admin/auction-validation/page.tsx
```

**Commits:**
```bash
$ git log --oneline -1 2f84614
2f84614 feat(quick-22): replace JSON inputs with checkbox-based category and roster selection
```

All artifacts present and committed successfully.
