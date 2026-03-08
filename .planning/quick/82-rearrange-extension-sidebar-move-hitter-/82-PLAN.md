---
phase: quick-82
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/components/DraftSidebar.tsx
  - packages/extension/components/DraftNarrator.tsx
autonomous: true
requirements: [QUICK-82]
must_haves:
  truths:
    - "Hitter-pitcher split slider appears directly below the Auto-Pilot toggle, not inside the Draft Status section"
    - "AI Narrator uses a toggle switch (same style as Auto-Pilot) instead of an On/Off text button"
    - "All existing functionality is preserved — auto-pilot, narrator enable/disable, split value persistence"
  artifacts:
    - path: "packages/extension/components/DraftSidebar.tsx"
      provides: "Rearranged sidebar layout with split under auto-pilot"
    - path: "packages/extension/components/DraftNarrator.tsx"
      provides: "Toggle switch for AI narrator enable/disable"
  key_links:
    - from: "DraftSidebar.tsx"
      to: "useDraftStore"
      via: "pitcherHitterSplit and setPitcherHitterSplit still wired"
      pattern: "pitcherHitterSplit"
    - from: "DraftNarrator.tsx"
      to: "localStorage"
      via: "NARRATOR_ENABLED_KEY persistence"
      pattern: "NARRATOR_ENABLED_KEY"
---

<objective>
Rearrange the extension sidebar layout: move the hitter-pitcher split slider from the Draft Status section to underneath the Auto-Pilot toggle, and replace the AI Narrator's On/Off text button with a toggle switch matching the Auto-Pilot style.

Purpose: Better logical grouping (split is a strategy control like auto-pilot) and consistent UI controls.
Output: Updated DraftSidebar.tsx and DraftNarrator.tsx
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/extension/components/DraftSidebar.tsx
@packages/extension/components/DraftNarrator.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Move hitter-pitcher split below Auto-Pilot toggle</name>
  <files>packages/extension/components/DraftSidebar.tsx</files>
  <action>
In DraftSidebar.tsx, relocate the hitter-pitcher split slider from inside the "Draft Status" section (lines 257-275) to directly below the Auto-Pilot toggle section (after line 413, before NominationDiagnostics).

Specifically:
1. Remove the entire hitter-pitcher split block from the Draft Status section — the block starting at `{draftFormat === "auction" && (` on line 256 through the closing `)}` on line 275. This includes the label row ("Hit/Pitch Split" with the numeric display), the range input, and the Pitch/Hit labels.

2. Insert that same block into the Auto-Pilot section (the `{draftFormat === "auction" && (` block starting at line 374). Place it AFTER the auto-pilot status message (after the closing of the `{autoMode && (` conditional around line 411) but still inside the Auto-Pilot wrapper div. Add a `mt-2 pt-2 border-t border-surface-tertiary` top divider to visually separate it from the auto-pilot toggle above.

The split slider markup stays identical — just moves location. Keep the same Tailwind classes, same onChange handler wired to setPitcherHitterSplit, same min/max/value props.
  </action>
  <verify>Build the extension with `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` — no TypeScript errors. Visually confirm in the built output that the slider markup appears after the auto-pilot toggle section, not in the draft status section.</verify>
  <done>Hitter-pitcher split slider renders directly below the Auto-Pilot toggle and status message, with a subtle divider. Draft Status section only shows pick number, remaining budget, and roster count.</done>
</task>

<task type="auto">
  <name>Task 2: Replace AI Narrator On/Off button with toggle switch</name>
  <files>packages/extension/components/DraftNarrator.tsx</files>
  <action>
In DraftNarrator.tsx, replace the current On/Off text button (lines 60-69) with a toggle switch matching the Auto-Pilot toggle style from DraftSidebar.tsx.

Replace:
```tsx
<button
  onClick={() => setEnabled(!enabled)}
  className={`text-body-xs px-2 py-0.5 rounded border transition-colors ${
    enabled
      ? "text-content-secondary border-surface-tertiary hover:border-content-secondary"
      : "text-accent border-accent/30 hover:border-accent/60"
  }`}
>
  {enabled ? "Off" : "On"}
</button>
```

With:
```tsx
<button
  onClick={() => setEnabled(!enabled)}
  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
    enabled ? "bg-accent" : "bg-surface-tertiary"
  }`}
  role="switch"
  aria-checked={enabled}
  aria-label="Toggle AI advisor"
>
  <span
    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
      enabled ? "translate-x-[18px]" : "translate-x-[2px]"
    }`}
  />
</button>
```

This is the exact same toggle switch pattern used for Auto-Pilot in DraftSidebar.tsx. The enabled state, localStorage persistence, and all other logic remain unchanged.
  </action>
  <verify>Build the extension with `cd /Users/jay-work/Code/espn-agent && pnpm --filter extension build` — no TypeScript errors. Grep DraftNarrator.tsx for `role="switch"` to confirm toggle switch is present and the old "Off"/"On" text button is gone.</verify>
  <done>AI Narrator header shows a toggle switch (pill-shaped, same as Auto-Pilot) instead of an On/Off text button. Toggle persists enabled state to localStorage as before.</done>
</task>

</tasks>

<verification>
- `pnpm --filter extension build` succeeds with no errors
- In DraftSidebar.tsx: no `Hit/Pitch Split` text inside the Draft Status section; it appears inside the Auto-Pilot section
- In DraftNarrator.tsx: `role="switch"` attribute present; no "Off"/"On" text button remains
- All imports and state references unchanged — pitcherHitterSplit, setPitcherHitterSplit, enabled/setEnabled still wired correctly
</verification>

<success_criteria>
- Extension builds cleanly
- Hitter-pitcher split slider is positioned below auto-pilot toggle (not in draft status)
- AI narrator uses toggle switch matching auto-pilot style
- No functionality regressions — all state, persistence, and event handlers intact
</success_criteria>

<output>
After completion, create `.planning/quick/82-rearrange-extension-sidebar-move-hitter-/82-SUMMARY.md`
</output>
