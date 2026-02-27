---
phase: quick-15
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/extension/lib/dom-observers.ts
  - packages/extension/entrypoints/content.tsx
autonomous: true
requirements: [QUICK-15]

must_haves:
  truths:
    - "MutationObserver pick parsing catches all promise rejections"
    - "No duplicate sidebars can be created by concurrent mounting"
    - "window.espnDraftAssistant is not exposed in production builds"
  artifacts:
    - path: "packages/extension/lib/dom-observers.ts"
      provides: "Safe async pick parsing without fire-and-forget promises"
      pattern: "(await Promise\\.all|for.*of.*pickElements)"
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Single-threaded sidebar mounting with guard flag"
      pattern: "isMounting|mountSidebar.*return"
    - path: "packages/extension/entrypoints/content.tsx"
      provides: "Production-safe debug utilities"
      pattern: "process\\.env\\.NODE_ENV.*development|import\\.meta\\.env\\.DEV"
  key_links:
    - from: "packages/extension/lib/dom-observers.ts"
      to: "emitPick(pick)"
      via: "Promise.all with error handling"
      pattern: "Promise\\.all.*emitPick"
    - from: "packages/extension/entrypoints/content.tsx"
      to: "mountSidebar()"
      via: "isMounting guard flag"
      pattern: "isMounting.*true"
---

<objective>
Fix three critical extension bugs that could cause data loss, duplicate UI, and security concerns.

Purpose: Prevent unhandled promise rejections in pick detection, eliminate race conditions in sidebar mounting, and avoid exposing diagnostic functions in production.
Output: Production-ready extension with proper async handling and environment-based feature gating.
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
@packages/extension/entrypoints/content.tsx
</context>

<tasks>

<task type="auto">
  <name>Fix async forEach promise rejections in MutationObserver</name>
  <files>packages/extension/lib/dom-observers.ts</files>
  <action>
Replace the forEach async callback pattern (lines 260-265) with Promise.all to properly catch rejections:

**Current problematic code:**
```typescript
pickElements.forEach(async (pickElement) => {
  try {
    const pick = parsePickElement(pickElement);
    if (pick) {
      await emitPick(pick);
    }
  } catch (error) {
    // This catch won't work - promise is fire-and-forget
  }
});
```

**Fix to:**
```typescript
const pickPromises = pickElements.map(async (pickElement) => {
  try {
    const pick = parsePickElement(pickElement);
    if (pick) {
      await emitPick(pick);
    }
  } catch (error) {
    console.error(
      "[ESPN Draft Assistant] Error parsing pick from mutation:",
      error,
      { element: pickElement }
    );
  }
});

await Promise.all(pickPromises);
```

Wrap the entire Promise.all in try/catch at the outer level to handle any errors that slip through. This ensures all pick parsing promises are awaited and any rejections are properly caught.
  </action>
  <verify>
1. Search for `forEach(async` in dom-observers.ts - should find 0 matches
2. Search for `Promise.all` in the pick parsing section - should find 1 match
3. Run `pnpm --filter extension build` - should succeed without TypeScript errors
  </verify>
  <done>
MutationObserver uses Promise.all pattern instead of forEach with async callbacks, eliminating fire-and-forget promises that could cause unhandled rejections.
  </done>
</task>

<task type="auto">
  <name>Add mounting guard to prevent sidebar race condition</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
Add a module-level `isMounting` guard flag to prevent concurrent sidebar creation from multiple sources (MutationObserver line 522, heartbeat line 535, popout close line 548, initial mount line 510):

**Add after the reactRootInstance declaration (around line 115):**
```typescript
let isMounting = false;
```

**Update mountSidebar function (line 384) to check and set guard:**
```typescript
const mountSidebar = () => {
  if (isPopoutOpen || isMounting) {
    return;
  }

  isMounting = true;

  try {
    if (!document.body) {
      return;
    }

    const existingRoot = document.getElementById(SIDEBAR_ROOT_ID);
    if (existingRoot) {
      const existingShadowRoot = existingRoot.shadowRoot;
      const existingMountPoint = existingShadowRoot?.querySelector(
        '[data-espn-assistant-mount="true"]',
      );

      if (existingMountPoint && existingMountPoint.childElementCount > 0) {
        return;
      }

      existingRoot.remove();
    }

    // ... rest of mounting logic ...

    console.log("[ESPN Draft Assistant] Sidebar rendered");
  } finally {
    isMounting = false;
  }
};
```

The guard prevents re-entry during mount operations. The try/finally ensures the flag is always reset even if mounting fails.
  </action>
  <verify>
1. Grep for `isMounting` in content.tsx - should find 3 occurrences (declaration, check, reset)
2. Verify the check happens before `if (!document.body)` in mountSidebar
3. Verify finally block resets flag after mount completes
4. Run `pnpm --filter extension build` - should succeed
  </verify>
  <done>
mountSidebar() has isMounting guard that prevents concurrent execution from MutationObserver, heartbeat timers, and popout close events. Sidebar mounting is now single-threaded.
  </done>
</task>

<task type="auto">
  <name>Remove debug globals from production builds</name>
  <files>packages/extension/entrypoints/content.tsx</files>
  <action>
Wrap the window.espnDraftAssistant diagnostic utilities (lines 124-137) in a development-only guard:

**Replace the entire block:**
```typescript
// Expose diagnostic functions for debugging
// Usage: window.espnDraftAssistant.diagnose()
// Usage: window.espnDraftAssistant.testPick(element)
// Usage: window.espnDraftAssistant.diagnoseRosters()
(window as any).espnDraftAssistant = {
  diagnose: diagnoseDOMStructure,
  testPick: testParsePick,
  diagnoseRosters: () => {
    // ...
  },
  version: "1.0.0",
};
console.log(
  "[ESPN Draft Assistant] Diagnostic tools available at window.espnDraftAssistant",
);
```

**With:**
```typescript
// Expose diagnostic functions for debugging (development only)
if (import.meta.env.DEV) {
  (window as any).espnDraftAssistant = {
    diagnose: diagnoseDOMStructure,
    testPick: testParsePick,
    diagnoseRosters: () => {
      const { teamRosters } = useDraftStore.getState();
      console.log("Stored Team Rosters:", Array.from(teamRosters.entries()));

      const domRosters = parseTeamRostersFromDOM();
      console.log("DOM-Parsed Rosters:", Array.from(domRosters.entries()));
    },
    version: "1.0.0",
  };
  console.log(
    "[ESPN Draft Assistant] Diagnostic tools available at window.espnDraftAssistant",
  );
}
```

WXT (Vite-based) provides `import.meta.env.DEV` which is true in development and false in production builds. This ensures diagnostic functions are tree-shaken from production bundles.
  </action>
  <verify>
1. Grep for `import.meta.env.DEV` in content.tsx - should find 1 match wrapping espnDraftAssistant
2. Run `pnpm --filter extension build` - should succeed
3. Check `.output/chrome-mv3/content-scripts/content.js` for "espnDraftAssistant" - should NOT be present in production build
  </verify>
  <done>
window.espnDraftAssistant diagnostic utilities are only exposed in development builds via import.meta.env.DEV guard. Production builds do not expose global debugging functions.
  </done>
</task>

</tasks>

<verification>
## Overall Verification

1. **Promise rejection handling:** `grep -n "forEach(async" packages/extension/lib/dom-observers.ts` returns no matches
2. **Mounting guard:** `grep -n "isMounting" packages/extension/entrypoints/content.tsx` shows declaration, check in mountSidebar, and finally reset
3. **Production safety:** Production build of content.js does not contain "espnDraftAssistant" string
4. **No TypeScript errors:** `pnpm --filter extension build` succeeds
5. **Manual test:** Load extension in Chrome, verify picks are detected without console errors, sidebar mounts once, and window.espnDraftAssistant is undefined in production

All three critical bugs must be fixed without introducing regressions to pick detection or sidebar functionality.
</verification>

<success_criteria>
- [ ] MutationObserver uses Promise.all instead of forEach with async callbacks
- [ ] Pick parsing errors are properly caught and logged
- [ ] Sidebar mounting has re-entry guard preventing duplicate creation
- [ ] Debug globals only exposed when import.meta.env.DEV is true
- [ ] Extension builds without TypeScript errors
- [ ] Production bundle does not contain espnDraftAssistant global
</success_criteria>

<output>
After completion, create `.planning/quick/15-fix-critical-extension-bugs-async-foreac/15-SUMMARY.md`
</output>
