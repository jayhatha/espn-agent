# Frontend Code Review

**Analysis Date:** 2026-03-26
**Scope:** In-season app (`app/leagues/`, `components/league/`, `components/shell/`, `components/ui/`, `lib/`, `contexts/`)
**Excluded:** Chrome extension, `app/draft/live/`

---

## Critical Issues (fix immediately)

### 1. Missing React key on Fragment in standings page category matrix

**File:** `packages/frontend/src/app/leagues/[id]/standings/page.tsx`, line 384

The `renderCategoryBreakdown` function maps over `overallStandings` and returns a bare `<>...</>` Fragment containing a `<tr>` and optionally a `<GapDetailRow>`. The `key` is placed on the inner `<tr>` instead of the Fragment wrapper. React will emit a "Each child in a list should have a unique key" console warning, and the reconciler cannot correctly diff these nodes when the gap-detail row appears/disappears.

```tsx
// BROKEN: key is on <tr>, not the Fragment
return (
  <>
    <tr key={team.team_id} ...>
    ...
    </tr>
    {showGapDetail && isSelected && expandedCategory && (
      <GapDetailRow key={`gap-${team.team_id}-${expandedCategory}`} ... />
    )}
  </>
);
```

**Fix:** Move key to the Fragment:
```tsx
return (
  <React.Fragment key={team.team_id}>
    <tr ...>...</tr>
    {showGapDetail && isSelected && expandedCategory && (
      <GapDetailRow ... />
    )}
  </React.Fragment>
);
```

### 2. `useSearchParams()` without `<Suspense>` boundary causes Next.js build error

**File:** `packages/frontend/src/app/leagues/[id]/page.tsx`, line 95

Next.js 14+ requires `useSearchParams()` to be wrapped in a `<Suspense>` boundary, or the page will fail to statically render and may throw during build. The `auth/callback/page.tsx` correctly wraps it in `<Suspense>`, but the league detail page does not.

```tsx
// line 95 -- no Suspense wrapper
const searchParams = useSearchParams();
```

**Fix:** Either wrap `LeagueDetailPageContent` in `<Suspense>` in the default export, or replace `useSearchParams` with reading the query param from `window.location` inside a `useEffect` (the `snapshotting` param is only used for an ephemeral banner).

### 3. Home page API response type mismatch

**File:** `packages/frontend/src/app/page.tsx`, line 28

```tsx
api.getLeagues().then((leagues: { id: number }[]) => {
```

The `api.getLeagues()` returns `{ leagues: League[] }` (an object with a `leagues` property), not a bare array. This means `leagues.length` is always truthy (it's an object), so the redirect to `/onboarding` never fires, and `leagues[0].id` is `undefined`, causing a redirect to `/leagues/undefined`.

**Fix:**
```tsx
api.getLeagues().then((data: { leagues: { id: number }[] }) => {
  if (data.leagues.length === 0) {
    router.push("/onboarding");
  } else {
    router.push(`/leagues/${data.leagues[0].id}`);
  }
})
```

### 4. TeamSelector `useEffect` has unstable dependency causing infinite re-renders

**File:** `packages/frontend/src/components/league/TeamSelector.tsx`, lines 40-51

The `useEffect` lists `onSelect` as a dependency, but `onSelect` is a callback created inline in the parent (`handleTeamSelect` in the league detail page). Since `handleTeamSelect` is not wrapped in `useCallback`, it creates a new function reference every render, causing the effect to re-fire infinitely when `autoDetectedTeamId` is falsy and a stored team exists.

```tsx
useEffect(() => {
  if (autoDetectedTeamId) {
    handleSelect(autoDetectedTeamId);  // calls onSelect
    return;
  }
  const stored = localStorage.getItem(`league_${leagueId}_team`);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed)) onSelect(parsed);
  }
}, [leagueId, autoDetectedTeamId, onSelect]); // onSelect changes every render
```

**Fix:** Either:
- Wrap `handleTeamSelect` / `onTeamSelect` in `useCallback` in every parent, OR
- Remove `onSelect` from the dependency array and use a ref to hold the latest callback, OR
- Use the `handleSelect` function (which calls both `onSelect` and writes to localStorage) for the stored-team path as well

---

## Major Issues (fix before next milestone)

### 5. Duplicate `API_URL` export -- `lib/constants.ts` vs `lib/api.ts`

**Files:**
- `packages/frontend/src/lib/constants.ts`, line 13: `export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";`
- `packages/frontend/src/lib/api.ts`, line 1: `const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";`

The `API_URL` in `constants.ts` is exported but appears unused by any in-season code (only possibly used by draft/admin code). Having two separate declarations means one could be changed without the other.

**Fix:** Remove the duplicate from `constants.ts` (or have `api.ts` import from `constants.ts`). Verify no other files import `API_URL` from `constants.ts`.

### 6. `alert()` calls for user feedback instead of toast/notification system

**Files:**
- `packages/frontend/src/app/leagues/[id]/page.tsx`, lines 142, 154
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx`, line 228
- `packages/frontend/src/app/leagues/[id]/projections/page.tsx`, line 29

Four places use `window.alert()` for success/error feedback. This blocks the main thread and provides a jarring UX.

**Fix:** Introduce a lightweight toast system (e.g., `sonner` or a custom context-based toast). Replace all `alert()` calls with toast notifications.

### 7. Inconsistent team selection pattern -- localStorage read duplicated across 7+ pages

Every sub-page under `/leagues/[id]/` independently reads `localStorage.getItem(`league_${leagueId}_team`)` in its own `useEffect`. This means:
- Team selection is not reactive -- selecting a team on the dashboard does not update the waivers page if it's already mounted
- The same boilerplate code is repeated in: `standings/page.tsx`, `waivers/page.tsx`, `trades/page.tsx`, `trends/page.tsx`, `lineup/page.tsx`, `streaming/page.tsx`, and the shell components (`LeagueNav.tsx`, `TopBar.tsx`, `SignalsPanel.tsx`)

**Files:** `standings/page.tsx:97-103`, `waivers/page.tsx:154-159`, `trades/page.tsx:118-124`, `trends/page.tsx:169-175`, `lineup/page.tsx:86-92`, `streaming/page.tsx:50` (uses TeamSelector component), `LeagueNav.tsx:53-59`, `TopBar.tsx:94-100`, `SignalsPanel.tsx:108-115`

**Fix:** Create a `useSelectedTeam(leagueId)` hook or a React context at the league layout level that:
- Reads from localStorage on mount
- Provides `selectedTeamId` and `setSelectedTeamId`
- Syncs to localStorage on change
- Is shared across all league sub-pages

### 8. Massive page components with no extraction -- readability and maintainability

Several page files are excessively large single-component files:

| File | Lines |
|------|-------|
| `moves/page.tsx` | 1,433 |
| `trends/page.tsx` | 956 |
| `trades/page.tsx` | 946 |
| `waivers/page.tsx` | 850 |
| `standings/page.tsx` | 782 |

These contain inline interface definitions, helper functions, sub-components, and complex JSX all in one file. This makes them hard to navigate and maintain.

**Fix:** For each large page:
1. Extract interface types to a shared types file or co-located `types.ts`
2. Extract sub-components (e.g., the trade candidate card, the waiver recommendation card) to co-located component files
3. Extract helper functions (formatting, grouping) to utility files

### 9. N+1 API calls in standings page for category rank history fallback

**File:** `packages/frontend/src/app/leagues/[id]/standings/page.tsx`, lines 115-138

When projected standings are unavailable, the component fires one API call per category sequentially in a loop:

```tsx
for (const cat of data.categories) {
  try {
    const res = await api.getCategoryRankTimeSeries(
      parseInt(leagueId, 10),
      cat.category_id,
      { teamIds: String(selectedTeamId) },
    );
    results[cat.category_id] = ...;
  } catch {
    results[cat.category_id] = [];
  }
}
```

For a 10-category league, this fires 10 sequential HTTP requests. Each waits for the previous to complete.

**Fix:** Use `Promise.all` (or `Promise.allSettled`) to parallelize:
```tsx
const entries = await Promise.allSettled(
  data.categories.map(cat =>
    api.getCategoryRankTimeSeries(parseInt(leagueId, 10), cat.category_id, { teamIds: String(selectedTeamId) })
  )
);
```

### 10. Redundant API calls across LeagueNav, TopBar, SignalsPanel, and dashboard

The same waiver recommendations and trade candidates data is fetched independently by:
- `SignalsPanel.tsx` (query key: `["signals-waivers", id, teamId]`)
- `LeagueNav.tsx` (query key: `["signals-waivers", id, teamId]`)
- `page.tsx` dashboard (query key: `["dashboard-waivers", leagueId, selectedTeamId]`)

The first two share query keys so TanStack Query deduplicates them, but the dashboard uses different query keys (`dashboard-waivers` vs `signals-waivers`), causing a duplicate fetch.

**Fix:** Align query keys. Use `["waivers", leagueId, teamId]` consistently across all consumers, or have the dashboard read from the signals query.

### 11. `fetchAPI` does not send `credentials: 'include'` for regular API calls

**File:** `packages/frontend/src/lib/api.ts`, line 17-32

The `fetchAPI` function does not include `credentials: 'include'`. Only the explicit `login`, `signup`, and `logout` methods pass `credentials: 'include'`. In single-user mode this may be fine, but if cookie-based auth is ever re-enabled, all API calls will fail because cookies won't be sent.

**Fix:** Add `credentials: 'include'` to the default `fetchAPI`:
```tsx
const res = await fetch(`${API_URL}${endpoint}`, {
  credentials: 'include',
  ...options,
  headers: { ... },
});
```

### 12. Double navigation visible on league list and connect pages

**Files:**
- `packages/frontend/src/app/layout.tsx`, line 33: Renders `<Navigation />` on every page
- `packages/frontend/src/app/leagues/[id]/layout.tsx`, line 2: Renders `<LeagueNav />`

The global `<Navigation>` component hides itself when `pathname.startsWith("/leagues/") && pathname.split("/").length > 3` (i.e., on league sub-pages). But on `/leagues` (league list) and `/leagues/connect`, the global Navigation is shown. These pages do NOT have the league layout's sidebar, which is correct. However, they also show the league layout's `<TopBar>` and `<SignalsPanel>` when accessed from a league context, because the league layout wraps ALL pages under `/leagues/[id]/`.

The actual issue: `/leagues` and `/leagues/connect` show the global nav with the "ESPN Fantasy Baseball Assistant" brand, but when you navigate to `/leagues/[id]`, the global nav disappears and the sidebar `LeagueNav` takes over. There's no smooth transition -- it's a jarring layout shift.

**Impact:** Low severity but poor UX. Not a bug per se, but disorienting.

---

## Minor Issues (fix when convenient)

### 13. `as any` type assertions scattered through the codebase

**Files:**
- `packages/frontend/src/components/league/GsTracker.tsx`, line 99: `variant={statusVariant as any}` -- `statusVariant` is `"success" | "warning" | "danger"` but Badge expects different variant types
- `packages/frontend/src/app/leagues/[id]/standings/page.tsx`, line 127: `(res as any).series`
- Multiple instances of `(error as Error).message` pattern (technically correct but hides type narrowing)

**Fix:** Define proper types for API responses. For the Badge variant mismatch, map `statusVariant` to valid Badge variant values.

### 14. Index-based keys in list renders

**Files:**
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx`, line 763: `key={idx}` for trade candidates
- `packages/frontend/src/app/leagues/[id]/trades/page.tsx`, lines 794, 817: `key={i}` for player names in trade cards
- `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`, line 355: `key={i}` for legality issues
- `packages/frontend/src/app/leagues/[id]/trends/page.tsx`, line 762: `key={idx}` for efficiency warnings

Using array index as key can cause rendering bugs when items are reordered or removed.

**Fix:** Use stable identifiers where available:
- Trade candidates: `key={`${candidate.partnerTeamId}-${candidate.trade.givePlayers.map(p=>p.playerId).join('-')}`}`
- Player names in cards already have `playerName` available
- Legality issues: `key={issue}` (assuming unique text)

### 15. No `staleTime` override on frequently-changing data

Several queries use the global default `staleTime` of 5 minutes, which may be too long for data that changes frequently (e.g., after triggering a snapshot). Conversely, the TopBar's league status query uses `staleTime: 60_000` (1 minute), which is more appropriate.

**File:** `packages/frontend/src/app/providers.tsx`, line 14: `staleTime: 5 * 60_000`

**Impact:** After uploading projections or triggering a snapshot, users must wait up to 5 minutes or manually refresh before seeing updated data.

**Fix:** Set lower `staleTime` on queries that follow mutations (e.g., after snapshot creation, after projections upload). The `invalidateQueries` calls in mutation `onSuccess` handlers help, but only if the stale data hasn't been served to other components in the meantime.

### 16. `parseInt(leagueId, 10)` repeated ~40 times across page files

Every page that reads `params.id` as a string must convert it with `parseInt()` for every API call. This is error-prone (could forget the radix) and noisy.

**Files:** All page files under `app/leagues/[id]/`

**Fix:** Create a `useLeagueId()` hook:
```tsx
function useLeagueId(): number {
  const params = useParams();
  return parseInt(params.id as string, 10);
}
```

### 17. Settings page is a stub

**File:** `packages/frontend/src/app/leagues/[id]/settings/page.tsx`

The entire page is:
```tsx
export default function SettingsPage() {
  return (
    <div className="bg-shell-panel border border-shell-border rounded-lg p-6">
      <h1 className="text-shell-text font-semibold text-lg mb-2">Settings</h1>
      <p className="text-shell-muted text-sm">Coming soon.</p>
    </div>
  );
}
```

This is a visible nav item in `LeagueNav` that leads to an empty page.

**Fix:** Either implement settings (ESPN auth management, notification preferences) or hide the nav item until it's ready.

### 18. `globalIdx` computed but unused in waivers page

**File:** `packages/frontend/src/app/leagues/[id]/waivers/page.tsx`, line 473

```tsx
const globalIdx = groupIdx * 100 + idx;
```

This variable is declared but never used.

**Fix:** Remove the unused variable.

### 19. Multiple interface definitions duplicated across files

The `Team`, `RosterPlayer`, `TeamOverviewCategory`, and other interfaces are defined independently in multiple page files:
- `Team` interface: `page.tsx`, `trades/page.tsx`, `streaming/page.tsx`, `lineup/page.tsx`, `trends/page.tsx`
- `RosterPlayer` interface: `waivers/page.tsx`, `trades/page.tsx`, `lineup/page.tsx`

**Fix:** Create a shared `types/league.ts` file and import from there.

### 20. `getESPNTradeUrl` accepts optional `teamId` but never uses it

**File:** `packages/frontend/src/lib/espn-links.ts`, line 20

```tsx
export function getESPNTradeUrl(leagueId: number, season: number, teamId?: number): string {
  return `https://fantasy.espn.com/baseball/league/trade?leagueId=${leagueId}&seasonId=${season}`;
  // teamId parameter is accepted but not included in URL
}
```

**Fix:** Either remove the unused `teamId` parameter or append it to the URL if ESPN supports it.

### 21. `Content-Type: application/json` header set on GET requests

**File:** `packages/frontend/src/lib/api.ts`, line 22

The `fetchAPI` function always sets `Content-Type: application/json`, even for GET requests which have no body. While browsers generally ignore this, it's technically incorrect and some CDN/proxy configurations may flag it.

**Fix:** Only set `Content-Type` when there's a body:
```tsx
headers: {
  ...(options.body ? { 'Content-Type': 'application/json' } : {}),
  ...options.headers,
},
```

### 22. Missing `aria-label` on several interactive elements

Various `<button>` elements (especially tab toggles and sort controls) lack `aria-label` attributes. The sidebar's focus trap and keyboard handling in `LeagueNav.tsx` is well done, but other interactive elements are less accessible.

**Files:** Tab buttons in `standings/page.tsx`, `waivers/page.tsx`, `trades/page.tsx`, `trends/page.tsx`

**Fix:** Add descriptive `aria-label` attributes to tab buttons and controls.

---

## Positive Patterns (keep doing)

### API client is well-centralized
All API calls go through `packages/frontend/src/lib/api.ts`. No pages hardcode `localhost:3001` directly. The earlier CLAUDE.md concern about this is resolved.

### Consistent use of TanStack Query
Every data-fetching component uses `useQuery` with proper `enabled` guards. Query keys are generally well-structured with appropriate dependencies.

### Proper `enabled` guards prevent premature fetches
Queries that depend on `selectedTeamId` correctly use `enabled: !!selectedTeamId`, preventing API calls before the user has selected a team.

### Good error and loading state handling
Most pages follow a consistent pattern: loading skeleton -> error alert -> content. The `LoadingSpinner`, `LoadingSkeleton`, and `ErrorAlert` UI components are reused consistently.

### Accessible navigation
`LeagueNav.tsx` implements proper focus trap, Escape-to-close, body scroll lock, and aria attributes for the mobile drawer. This is thorough accessibility work.

### Design system components are well-structured
The `components/ui/` directory provides consistent primitives (`Card`, `Button`, `Badge`, `Heading`, `Text`, `Container`, etc.) that are used throughout. Dark mode support is built into the design tokens.

### Shell architecture (LeagueNav + TopBar + SignalsPanel)
The three-panel layout with persistent navigation, a status bar, and a signals sidebar provides good information density without overwhelming the user. The SignalsPanel correctly hides on smaller viewports (`hidden xl:flex`).

### Component-based stat formulas imported from shared package
The `@espn-fantasy/shared` package provides `calculateAVG`, `calculateOBP`, `calculateERA`, `calculateWHIP`, `computeMarginalGains`, `computeAtRiskCategories`, ensuring consistent math between frontend and backend.

### Recharts integration with theme support
The `useChartTheme` hook and `chart-theme.ts` provide consistent chart styling that respects the dark mode theme, including grid lines, axis ticks, and tooltip styling.
