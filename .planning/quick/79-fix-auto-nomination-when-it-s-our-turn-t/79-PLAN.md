# Quick Task 79: Fix auto-nomination — "select" button variant

## Goal
When it's the user's turn to nominate, ESPN changes "Queue" buttons to "Select" buttons.
The auto-nomination code needs to handle this variant in both the player selection step
and the confirmation/submit step.

## Root Cause
`clickNominateButton()` only matches buttons with "nominate" text. When it's your turn,
ESPN may show a different confirmation flow after clicking "Select" (vs "Queue"). The
confirmation button text may not contain "nominate".

## Tasks

### Task 1: Update auto-nomination to handle "Select" variant
**File:** `packages/extension/lib/auto-bid-controller.ts`

1. In `clickNominateButton()`, broaden text matching to also accept "select", "submit",
   "confirm", and other common ESPN action button labels
2. Add selectors for common ESPN submit button patterns that appear during nomination
3. Log which button variant was found for debugging

### Verify
- Extension builds cleanly with `npx wxt build`
- Log output shows button detection working for "select" variant
