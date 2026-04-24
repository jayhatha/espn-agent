<!-- generated-by: gsd-doc-writer -->

# Frontend Guide

Next.js 14 App Router frontend for the ESPN Fantasy Baseball Assistant. This guide covers pages, routes, components, API client patterns, and state management.

---

## Table of Contents

1. [Route Tree](#route-tree)
2. [Shell Layout](#shell-layout)
3. [API Client](#api-client)
4. [TanStack Query Patterns](#tanstack-query-patterns)
5. [SSE Streaming](#sse-streaming)
6. [localStorage Patterns](#localstorage-patterns)
7. [Shared Components](#shared-components)
8. [Theme & Styling](#theme--styling)
9. [Auth](#auth)

---

## Route Tree

All routes are under `packages/frontend/src/app/`. Every page is a Client Component (`"use client"`) unless noted.

### Top-Level Routes

| Path                        | File                                    | Purpose                                                                                          | Auth      |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| `/`                         | `app/page.tsx`                          | Home — auto-redirects to first league or `/onboarding`. Falls back to landing page if API fails. | None      |
| `/login`                    | `app/login/page.tsx`                    | Email/password sign-in + OAuth buttons (Google, GitHub)                                          | None      |
| `/signup`                   | `app/signup/page.tsx`                   | Account creation                                                                                 | None      |
| `/onboarding`               | `app/onboarding/page.tsx`               | 4-step wizard: Welcome → Connect League → Select Team → Complete                                 | None      |
| `/auth/callback`            | `app/auth/callback/page.tsx`            | OAuth callback — verifies session via `api.getProfile()`, redirects to `/`                       | None      |
| `/leagues`                  | `app/leagues/page.tsx`                  | List all connected leagues                                                                       | Protected |
| `/leagues/connect`          | `app/leagues/connect/page.tsx`          | Connect ESPN league form (2 steps: form + team picker)                                           | Protected |
| `/admin`                    | `app/admin/page.tsx`                    | Admin panel — users, leagues, projections, backfill jobs                                         | Admin     |
| `/admin/auction-validation` | `app/admin/auction-validation/page.tsx` | Auction value validation tool                                                                    | Admin     |
| `/admin/draft-board`        | `app/admin/draft-board/page.tsx`        | Admin draft board view                                                                           | Admin     |
| `/draft/live`               | `app/draft/live/page.tsx`               | Live draft companion — WebSocket connection to draft engine                                      | None      |

### League Sub-Routes (`/leagues/[id]/...`)

All league sub-routes share the league shell layout (sidebar, top bar, signals panel). The `[id]` segment is the internal league database ID.

| Path                                   | File                              | Purpose                                                                                    |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `/leagues/[id]`                        | `_sections/` composition          | Dashboard — team identity, action items, category stats, roster                            |
| `/leagues/[id]/standings`              | `standings/page.tsx`              | Projected final standings by category; swing attribution panel                             |
| `/leagues/[id]/changelog`              | `changelog/page.tsx`              | Live roto-point change feed via SSE; historical events from REST                           |
| `/leagues/[id]/trends`                 | `trends/page.tsx`                 | Recharts line charts — overall, projected overall, category rank, category total over time |
| `/leagues/[id]/waivers`                | `waivers/page.tsx`                | Waiver recommendations (AI mode) + manual add/drop evaluation                              |
| `/leagues/[id]/trades`                 | `trades/page.tsx`                 | Trade impact analysis + AI trade candidate recommendations                                 |
| `/leagues/[id]/lineup`                 | `lineup/page.tsx`                 | Lineup optimizer — bench/starter swap recommendations                                      |
| `/leagues/[id]/moves`                  | `moves/page.tsx`                  | FAAB market — transaction timeline, team leaderboard, league impact summary                |
| `/leagues/[id]/streaming`              | `streaming/page.tsx`              | Pitching usage: GS pacing, sit/start recommendations, streaming candidates                 |
| `/leagues/[id]/projections`            | `projections/page.tsx`            | Upload FanGraphs CSV projections (drag-and-drop or file picker)                            |
| `/leagues/[id]/settings`               | `settings/page.tsx`               | Settings placeholder ("Coming soon")                                                       |
| `/leagues/[id]/draft/auction`          | `draft/auction/page.tsx`          | Auction dollar valuations (VBD/SGP) with position filter and budget inputs                 |
| `/leagues/[id]/draft/auction/validate` | `draft/auction/validate/page.tsx` | Auction value validation tool                                                              |
| `/leagues/[id]/draft/rankings`         | `draft/rankings/page.tsx`         | Snake draft rankings by tier and SGP score                                                 |

### Dashboard Sections

The `/leagues/[id]` page is composed from five section components in `app/leagues/[id]/_sections/`:

| Section                | File                       | Renders                                                       |
| ---------------------- | -------------------------- | ------------------------------------------------------------- |
| `IdentitySection`      | `IdentitySection.tsx`      | League name, snapshot date, degraded banner, snapshot trigger |
| `ActionsSection`       | `ActionsSection.tsx`       | Action items list (waivers + trade alerts)                    |
| `StatsSection`         | `StatsSection.tsx`         | Overall rank + roto points card                               |
| `CategoryTableSection` | `CategoryTableSection.tsx` | Per-category rank table with projected values                 |
| `RosterSection`        | `RosterSection.tsx`        | Current roster with acquisition type and slot                 |

---

## Shell Layout

The root layout (`app/layout.tsx`) wraps all pages in `<Providers>` and the global `<Navigation>` component.

Inside `/leagues/[id]/`, the nested layout (`app/leagues/[id]/layout.tsx`) overrides the standard layout with a full-height three-column shell:

```
┌──────────────┬──────────────────────────────┬──────────────┐
│  LeagueNav   │  TopBar                       │              │
│  (sidebar,   ├──────────────────────────────│SignalsPanel  │
│  w-60 on md) │  <children>                  │(right panel) │
│              │  (scrollable main content)   │              │
└──────────────┴──────────────────────────────┴──────────────┘
```

- **`LeagueNav`** — left sidebar with 10 nav items; collapses to hamburger on mobile. Reads `localStorage` for selected team to support badge counts.
- **`TopBar`** — shows league name, snapshot date, projected rank, FAAB remaining, GS usage. Reads team from `localStorage`.
- **`SignalsPanel`** — right panel with AI-generated waiver and trade signals, tabbed by type.
- The shell uses `bg-shell-bg` (dark theme) as its root background.

The `<Navigation>` global nav bar hides itself when pathname is inside a league sub-route (3+ path segments under `/leagues/`).

---

## API Client

**File:** `packages/frontend/src/lib/api.ts`

**Base URL:** `process.env.NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`)

All requests use `credentials: "include"` for cookie-based session authentication. No `Authorization` header is set. A `cleanParams()` helper strips `null`/`undefined` values before building query strings.

### Auth

| Method       | Signature                         | Endpoint                |
| ------------ | --------------------------------- | ----------------------- |
| `login`      | `(email, password)`               | `POST /api/auth/login`  |
| `signup`     | `(email, password, displayName?)` | `POST /api/auth/signup` |
| `logout`     | `()`                              | `POST /api/auth/logout` |
| `getProfile` | `()`                              | `GET /api/auth/me`      |

### Leagues

| Method                | Signature          | Endpoint                          |
| --------------------- | ------------------ | --------------------------------- |
| `getLeagues`          | `()`               | `GET /api/leagues`                |
| `getLeagueStatus`     | `(leagueId)`       | `GET /api/leagues/:id/status`     |
| `connectLeague`       | `(data)`           | `POST /api/leagues/connect`       |
| `updateLeagueAuth`    | `(leagueId, auth)` | `PATCH /api/leagues/:id/auth`     |
| `triggerSnapshot`     | `(leagueId)`       | `POST /api/leagues/:id/snapshot`  |
| `getLeagueSeasons`    | `(leagueId)`       | `GET /api/leagues/:id/seasons`    |
| `getLeagueCategories` | `(leagueId)`       | `GET /api/leagues/:id/categories` |
| `getTeams`            | `(leagueId)`       | `GET /api/leagues/:id/teams`      |

### Projections

| Method              | Signature      | Endpoint                                                           |
| ------------------- | -------------- | ------------------------------------------------------------------ |
| `uploadProjections` | `(file: File)` | `POST /api/projections/upload` (multipart — bypasses JSON headers) |
| `getProjections`    | `(limit?)`     | `GET /api/projections?limit=...`                                   |

### Time Series

All accept optional `{ from?, to?, teamIds?, season? }` filter params.

| Method                                                      | Endpoint                                            |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `getOverallTimeSeries(leagueId, params?)`                   | `GET /api/leagues/:id/timeseries/overall`           |
| `getCategoryRankTimeSeries(leagueId, categoryId, params?)`  | `GET /api/leagues/:id/timeseries/category-rank`     |
| `getCategoryTotalTimeSeries(leagueId, categoryId, params?)` | `GET /api/leagues/:id/timeseries/category-total`    |
| `getProjectedOverallTimeSeries(leagueId, params?)`          | `GET /api/leagues/:id/timeseries/projected-overall` |
| `getAnnotations(leagueId, params?)`                         | `GET /api/leagues/:id/timeseries/annotations`       |
| `getInflectionPoints(leagueId, teamId, params?)`            | `GET /api/leagues/:id/timeseries/inflection-points` |

### Standings & Change Log

| Method                                         | Endpoint                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `getProjectedStandings(leagueId, params?)`     | `GET /api/leagues/:id/standings/projected`                         |
| `getStandingsSwing(leagueId, teamId, params?)` | `GET /api/leagues/:id/standings/swing`                             |
| `getChangeLogHistory(leagueId, limit?)`        | `GET /api/leagues/:id/standings/change-log`                        |
| `getChangeLogSSEUrl(leagueId)`                 | Returns URL string: `{API_URL}/api/leagues/:id/standings/live-log` |
| `triggerLiveRefresh(leagueId)`                 | `POST /api/leagues/:id/live-refresh`                               |

### Teams

| Method                                       | Endpoint                                      |
| -------------------------------------------- | --------------------------------------------- |
| `getTeamOverview(leagueId, teamId, params?)` | `GET /api/leagues/:id/teams/:teamId/overview` |
| `getTeamRoster(leagueId, teamId)`            | `GET /api/leagues/:id/teams/:teamId/roster`   |

### Waivers

| Method                                                | Endpoint                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `getWaiverRecommendations(leagueId, teamId, params?)` | `GET /api/leagues/:id/teams/:teamId/waivers/recommendations` |
| `evaluateWaiver(leagueId, teamId, data)`              | `POST /api/leagues/:id/teams/:teamId/waivers/evaluate`       |
| `getFreeAgents(leagueId, params?)`                    | `GET /api/leagues/:id/free-agents`                           |

### Trades

| Method                                               | Endpoint                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `getTradePartners(leagueId, teamId)`                 | `GET /api/leagues/:id/teams/:teamId/trades/partners`                        |
| `getTradeRosters(leagueId, teamId, partnerTeamId)`   | `GET /api/leagues/:id/teams/:teamId/trades/partners/:partnerTeamId/rosters` |
| `validateTrade(leagueId, teamId, data)`              | `POST /api/leagues/:id/teams/:teamId/trades/validate`                       |
| `analyzeTradeImpact(leagueId, teamId, data)`         | `POST /api/leagues/:id/teams/:teamId/trades/impact`                         |
| `getTradeRecommendations(leagueId, teamId, params?)` | `GET /api/leagues/:id/teams/:teamId/trades/recommendations`                 |

### Lineup & Streaming Pitchers

| Method                                                | Endpoint                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `getLineupRecommendations(leagueId, teamId, params?)` | `GET /api/leagues/:id/teams/:teamId/lineup/recommendations` |
| `getStreamingPitchers(leagueId, params?)`             | `GET /api/leagues/:id/streaming-pitchers`                   |
| `getGsSummary(leagueId, teamId)`                      | `GET /api/leagues/:id/teams/:teamId/pitching/gs`            |
| `getGsWeekly(leagueId, teamId, weekStart?)`           | `GET /api/leagues/:id/teams/:teamId/pitching/gs/weekly`     |
| `getGsLeagueOverview(leagueId)`                       | `GET /api/leagues/:id/pitching/gs/league`                   |
| `getStartPlan(leagueId, teamId)`                      | `GET /api/leagues/:id/teams/:teamId/pitching/start-plan`    |
| `getSitStart(leagueId, teamId)`                       | `GET /api/leagues/:id/teams/:teamId/pitching/sit-start`     |

### FAAB

| Method                                            | Endpoint                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `getFaabSummary(leagueId, teamId)`                | `GET /api/leagues/:id/teams/:teamId/faab`                         |
| `getFaabHistory(leagueId, teamId)`                | `GET /api/leagues/:id/teams/:teamId/faab/history`                 |
| `getFaabSuggestedBid(leagueId, teamId, playerId)` | `GET /api/leagues/:id/teams/:teamId/faab/suggested-bid/:playerId` |

### Transaction Impacts

| Method                                             | Endpoint                                                  |
| -------------------------------------------------- | --------------------------------------------------------- |
| `computeTransactionImpacts(leagueId, season)`      | `POST /api/leagues/:id/transaction-impacts/compute`       |
| `getTransactionImpacts(leagueId, teamId, params?)` | `GET /api/leagues/:id/teams/:teamId/transaction-impacts`  |
| `getDraftReport(leagueId, teamId, season?)`        | `GET /api/leagues/:id/teams/:teamId/draft-report`         |
| `getLeagueImpactSummary(leagueId, season?)`        | `GET /api/leagues/:id/transaction-impacts/league-summary` |

### Trends

| Method                                            | Endpoint                                                      |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `getHotColdTrends(leagueId, teamId, options?)`    | `GET /api/leagues/:id/teams/:teamId/trends/hot-cold`          |
| `getLineupEfficiency(leagueId, teamId, options?)` | `GET /api/leagues/:id/teams/:teamId/trends/lineup-efficiency` |

### Auction / Draft

| Method                          | Endpoint                                                                   |
| ------------------------------- | -------------------------------------------------------------------------- |
| `validateAuctionValues(params)` | `GET /api/draft/auction/validate` (query params)                           |
| `get(endpoint)`                 | Generic GET — used by draft rankings and auction valuations pages directly |

### Admin

| Method                                | Endpoint                                 |
| ------------------------------------- | ---------------------------------------- |
| `getAdminStats()`                     | `GET /api/admin/stats`                   |
| `getAdminUsers(page?, limit?)`        | `GET /api/admin/users`                   |
| `updateUserRole(userId, role)`        | `PATCH /api/admin/users/:userId/role`    |
| `getAdminLeagues()`                   | `GET /api/admin/leagues`                 |
| `triggerBackfill(leagueId, data)`     | `POST /api/admin/leagues/:id/backfill`   |
| `clearBackfillData(leagueId, params)` | `DELETE /api/admin/leagues/:id/backfill` |
| `getBackfillJobStatus(jobId)`         | `GET /api/admin/backfill-jobs/:jobId`    |
| `getBackfillJobs()`                   | `GET /api/admin/backfill-jobs`           |
| `triggerPlayerPoolSync(season?)`      | `POST /api/admin/player-pool/sync`       |

---

## TanStack Query Patterns

**Config** (set in `providers.tsx`):

- `staleTime`: 5 minutes
- `gcTime`: 10 minutes
- `refetchOnWindowFocus`: false

All data-fetching pages use `useQuery`. Mutations use `useMutation` and invalidate related query keys on success via `queryClient.invalidateQueries()`.

### Common Query Key Conventions

```ts
// Leagues list
useQuery({ queryKey: ["leagues"], queryFn: () => api.getLeagues() })

// League status
useQuery({ queryKey: ["league", leagueId, "status"], queryFn: () => api.getLeagueStatus(id) })

// Teams
useQuery({ queryKey: ["teams", leagueId], queryFn: () => api.getTeams(id) })

// Projected standings
useQuery({ queryKey: ["standings", "projected", leagueId], queryFn: () => api.getProjectedStandings(id) })

// Time series (overall)
useQuery({ queryKey: ["timeseries", "overall", leagueId, from, to, teamIds], ... })

// Category rank time series
useQuery({ queryKey: ["timeseries", "category-rank", leagueId, categoryId], ... })

// Waiver recommendations
useQuery({ queryKey: ["waivers", leagueId, teamId], queryFn: () => api.getWaiverRecommendations(id, teamId) })

// Trade partners
useQuery({ queryKey: ["trade-partners", leagueId, teamId], queryFn: () => api.getTradePartners(id, teamId) })

// Lineup recommendations
useQuery({ queryKey: ["lineup", leagueId, teamId], queryFn: () => api.getLineupRecommendations(id, teamId) })

// Draft rankings
useQuery({ queryKey: ["draft-rankings", leagueId, position], ... })
```

### Mutation Pattern

```ts
const mutation = useMutation({
  mutationFn: async (data) => api.someMethod(leagueId, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["leagues"] });
    router.push(`/leagues/${data.league.id}`);
  },
});
```

---

## SSE Streaming

The changelog page (`/leagues/[id]/changelog`) uses the browser's native `EventSource` API for live roto-point change events.

### Connection

```ts
const url = api.getChangeLogSSEUrl(leagueIdNum);
// Resolves to: ${API_URL}/api/leagues/:id/standings/live-log

const es = new EventSource(url, { withCredentials: true });
es.onopen = () => setIsConnected(true);
es.onerror = () => setIsConnected(false);
```

### Message Types

| `msg.type`    | Payload                | Action                               |
| ------------- | ---------------------- | ------------------------------------ |
| `"event"`     | `ChangeEvent`          | Add or update event in feed          |
| `"live_poll"` | `{ polledAt: string }` | Update "last polled" timestamp in UI |

### Deduplication & In-Place Updates

```ts
const seenIds = useRef(new Set<number>());

const addEvents = useCallback((incoming: ChangeEvent[]) => {
  setLiveEvents((prev) => {
    // If id already seen, update in-place (intraday delta update)
    // If new, prepend to feed
    ...
  });
}, []);
```

Pre-population: on mount, `getChangeLogHistory()` (REST) loads historical events and seeds `seenIds` to prevent SSE duplicates.

### Game Window

A `isGameWindow()` helper returns `true` when `hours >= 13` (local time, approximate MLB game window). Used to show a "Games live" amber pulse indicator.

---

## localStorage Patterns

| Key                       | Written by                    | Read by                                                     | Value                |
| ------------------------- | ----------------------------- | ----------------------------------------------------------- | -------------------- |
| `league_${leagueId}_team` | `TeamSelector.handleSelect()` | `LeagueNav`, `TopBar`, `SignalsPanel`, all league sub-pages | Numeric team ID      |
| `draft-live-ws-url`       | Draft live page on URL change | Draft live page on mount                                    | WebSocket URL string |

### Reading Pattern (used across all league pages)

```ts
useEffect(() => {
  const stored = localStorage.getItem(`league_${id}_team`);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed)) setTeamId(parsed);
  }
}, [id]);
```

`TeamSelector` additionally accepts an `autoDetectedTeamId` prop — if set (from `league.user_team_id`), it writes that value to localStorage and skips the stored value.

---

## Shared Components

### Shell (`components/shell/`)

**`LeagueNav`**

- Left sidebar with 10 nav items defined in `NAV_ITEMS` constant
- Nav items: Dashboard, Standings, Change Log, Categories, Roster, Waivers, FAAB Market, Pitching Usage, Trades, Settings
- Mobile: hamburger button with full-height overlay, focus trap, Escape key to close, `overflow-hidden` on body
- Active route detection via `usePathname()`
- Reads `localStorage` for team ID to pass badge query context

**`TopBar`**

- Narrow top bar within the league shell
- Shows: Season, projected rank (links to `/standings`), FAAB remaining (links to `/moves`), GS usage (links to `/streaming`)
- Displays degraded warning icon when `latestSnapshot.is_degraded` is true
- Reads team from `localStorage`

**`SignalsPanel`**

- Right panel showing AI action signals
- Fetches waiver recommendations and trade candidates for the selected team
- Tabbed: "All", "Trade", "Waiver"
- Expandable `SignalItem` rows show explanation text and impact delta

### UI (`components/ui/`)

| Component         | Props / Variants                                                               | Notes                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `Button`          | `variant`: `primary \| secondary \| ghost \| danger`; `size`: `sm \| md \| lg` | CVA-based; also exports `buttonVariants` for use with `<Link>`                                             |
| `Card`            | —                                                                              | `rounded-card border bg-white dark:bg-shell-panel`; also exports `CardHeader`, `CardContent`, `CardFooter` |
| `Badge`           | `variant`: `default \| positive \| negative \| warning \| info`                | Inline status label                                                                                        |
| `Input`           | Standard input attrs                                                           | Styled `<input>`                                                                                           |
| `Select`          | Standard select attrs                                                          | Styled `<select>`                                                                                          |
| `Heading`         | `level`: `1–4`                                                                 | Maps to `h1–h4` with responsive `text-h1–h4` sizes                                                         |
| `Text`            | `size`: `sm \| base \| lg`; `color`: `default \| secondary \| tertiary`        | Semantic paragraph text                                                                                    |
| `Container`       | `size?`: `narrow \| default \| wide`                                           | Max-width wrapper with horizontal padding                                                                  |
| `LoadingSpinner`  | `size`: `sm \| md \| lg`; `quips?`: boolean                                    | Shows rotating loading indicator; `quips` shows randomized fun loading text                                |
| `LoadingSkeleton` | —                                                                              | Pulse animation placeholder bar                                                                            |
| `ErrorAlert`      | `message`, `variant`: `error \| warning \| info`                               | Semantic error display                                                                                     |
| `StatCard`        | `label`, `value`, `trend?`                                                     | Single stat + label card                                                                                   |
| `StatsTable`      | `columns: StatsTableColumn[]`, `data`, `sortable?`                             | Configurable data table with optional sorting                                                              |
| `PageHeader`      | `title`, `backLink?`, `actions?`                                               | Page-level title row with optional breadcrumb and right-side action buttons                                |
| `TeamColorBadge`  | `teamName`                                                                     | Team abbreviation badge                                                                                    |
| `Term`            | `definition`, `children`                                                       | Inline term with tooltip definition on hover                                                               |
| `Tooltip`         | `content`, `children`                                                          | Floating tooltip wrapper                                                                                   |

### League (`components/league/`)

| Component                | Purpose                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `TeamSelector`           | Team dropdown with `localStorage` sync and auto-detect support                                               |
| `ActionItemsList`        | List of waiver/trade action items with `ActionItem` type                                                     |
| `AtRiskSummary`          | Summary of categories at risk of rank loss                                                                   |
| `CategoryMiniChart`      | Single-category sparkline using Recharts                                                                     |
| `CategoryOpportunityMap` | Visual grid of category gain/hold/risk status                                                                |
| `CategoryPaceBar`        | Progress bar showing projected pace toward final rank                                                        |
| `CategoryStatsTable`     | Full category standings table; exports `formatStatValue` and `getRankColor` helpers                          |
| `DateRangeFilter`        | From/to date picker for time series filtering                                                                |
| `FaabGauge`              | Circular gauge showing FAAB remaining vs. budget                                                             |
| `GapDetailRow`           | Single row showing gap to overtake next/previous team in a category                                          |
| `GsTracker`              | Pitcher starts used vs. weekly/season cap                                                                    |
| `ImpactBadge`            | `+X.X pts` colored badge (green positive, red negative)                                                      |
| `ImpactDetailCard`       | Expanded card with per-category impact breakdown for a waiver/trade                                          |
| `InflectionPointMarker`  | Chart annotation marker for notable trend inflection points                                                  |
| `PlayerRow`              | Player name, team, positions, and stat columns in a table row                                                |
| `PlayerStatLine`         | Compact inline stat line for a player                                                                        |
| `ScarcityBadge`          | Position scarcity indicator badge                                                                            |
| `SwingAttributionPanel`  | Breaks down projected points delta into actual performance / projection change / competitor movement buckets |
| `TeamHealthOverview`     | High-level team health indicators panel                                                                      |
| `TransactionMarker`      | Recharts `ReferenceDot` annotation for transaction events on line charts                                     |

### Motion (`components/motion/`)

**`FadeIn`** — wraps children in a CSS fade-in animation. Accepts `delay` (ms) prop for staggered entrances.

### Root

**`ProtectedRoute`** and **`AdminRoute`** (in `components/ProtectedRoute.tsx`) — both are pass-through wrappers in v4.0 single-user mode. No auth checks are performed.

---

## Theme & Styling

### Dark / Light Mode

`ThemeProvider` from `next-themes` is configured with:

- `attribute="class"` — theme applied via `.dark` class on `<html>`
- `defaultTheme="dark"` — dark mode by default
- `enableSystem={false}` — system preference ignored
- `disableTransitionOnChange` — no color transition flash on toggle

### Tailwind Custom Tokens (`tailwind.config.js`)

**Shell (dark theme palette):**

```
shell-bg:     #0B0D10   page background
shell-panel:  #111318   card/panel background
shell-border: #1D2128   borders
shell-nav:    #0E1014   sidebar (slightly deeper than bg)
shell-text:   #E2E8F0   primary text
shell-muted:  #94A3B8   secondary/muted text (5:1 on shell-bg, WCAG AA)
shell-accent: #0D9488   interactive highlight (teal-600)
```

**Surface (light theme palette):**

```
surface:           #ffffff
surface-secondary: #f8f9fa
surface-tertiary:  #f1f3f5
```

**Content (light theme text):**

```
content:           #111827
content-secondary: #4b5563
content-tertiary:  #6b7280   (5:1 on white, WCAG AA)
content-inverse:   #ffffff
```

**Semantic colors** (all have `.DEFAULT`, `.light`, `.border`, `.dark`, `.dark-bg`, `.dark-border` sub-tokens):

- `positive` — green (#059669 / #34d399)
- `negative` — red (#dc2626 / #f87171)
- `warning` — amber (#d97706 / #fbbf24)
- `info` — blue (#2563eb / #60a5fa)

**Grafana palette** (`grafana.*`) — used exclusively in the `/draft/live` mobile companion page.

### Typography

| Font           | CSS Variable   | Usage                                     |
| -------------- | -------------- | ----------------------------------------- |
| Inter          | `--font-inter` | `font-sans` — all body text               |
| JetBrains Mono | `--font-mono`  | `font-mono` — stats, numbers, data tables |

Custom `font-size` tokens: `display`, `h1`–`h4`, `body-lg`, `body`, `body-sm`, `caption`, `data` (monospaced, 0.8125rem).

### Utility

**`cn()` (`lib/cn.ts`)** — combines `clsx` + `tailwind-merge`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Used universally for conditional/merged class strings.

---

## Auth

### v4.0 Single-User Mode

Auth is fully bypassed. `AuthContext` always provides a hardcoded mock user:

```ts
const MOCK_USER = {
  id: 1,
  email: "local@espn-agent.local",
  role: "admin",
  displayName: "Local User",
  avatarUrl: null,
};
```

- `ProtectedRoute` and `AdminRoute` render children unconditionally
- `login()`, `signup()`, `logout()` are no-ops
- `loginWithGoogle()` and `loginWithGitHub()` are no-ops

### Session Cookies (Underlying Mechanism)

`fetchAPI()` sends `credentials: "include"` on every request so that session cookies set by the backend are included automatically. No Bearer token or `Authorization` header is used.

### Auth Flow (When Active)

The login/signup/OAuth pages exist and function but are unreachable in single-user mode since `ProtectedRoute` never blocks and `AuthContext` always returns a user.

```
/login    → api.login() → POST /api/auth/login   → sets session cookie
/signup   → api.signup() → POST /api/auth/signup  → sets session cookie
OAuth     → backend redirect → /auth/callback → api.getProfile() → redirect /
```

### `useAuth()` Hook

```ts
const {
  user,
  loading,
  error,
  login,
  signup,
  logout,
  loginWithGoogle,
  loginWithGitHub,
} = useAuth();
```

Must be used inside `<AuthProvider>` (provided by `Providers`). Throws if used outside context.

### Navigation Auth Awareness

The global `<Navigation>` reads `user` from `useAuth()` to conditionally show:

- "Leagues" link (only when `user` is non-null)
- "Admin" link (only when `user.role === "admin"`)
- Login/logout button

In single-user mode this always renders as a logged-in admin.
