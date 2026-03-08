# Quick Task 79: Fix auto-nomination — "select" button + player search

## Goal
Two issues with auto-nomination:
1. When it's the user's turn, ESPN changes "Queue" buttons to "Select" — confirmation
   button matching only looked for "nominate" text
2. If the player isn't visible in the scrollable table, the button can't be found at all

## Fix
1. `clickNominateButton()` broadened to match "nominate", "select", "submit", "confirm"
2. Added `searchAndNominate()`: when queue/select button not in DOM, type the player's
   name into ESPN's `.playersSearch input.form__control`, wait 800ms for table filter,
   then find and click the button
3. Added `clearPlayerSearch()`: clicks `.player--search--clear` (or resets input) after
   nomination to restore the full player list
4. Uses React-compatible `nativeInputValueSetter` for ESPN's controlled input

## Status: EXECUTED
