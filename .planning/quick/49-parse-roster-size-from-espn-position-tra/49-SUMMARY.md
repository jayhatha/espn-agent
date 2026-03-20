# Quick Task 49: Parse Roster Size from Position Tracker

## Problem
Engine warned `rosterSize=20 differs from active slot total=23` because rosterSize defaulted to 25 or came from stale config, while the real league has 28 spots (visible in Position Tracker DOM).

## Solution
Added `detectRosterSizeFromPositionTracker()` that parses "X/N Players" from the `.roster-limits` DOM element to extract the correct total roster size.

## Changes
- **draft-config-detector.ts**: New `detectRosterSizeFromPositionTracker()` function
- **content.tsx**: Called during init, 3s retry, and 5s pick train polling interval

## Commit
fc241ce
