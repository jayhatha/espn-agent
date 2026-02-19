# Stack Research: Fantasy Baseball Analysis Tools & Sports Dashboards (2025)

**Research Date**: 2026-02-19
**Target**: Enhancement stack for ESPN Fantasy Baseball command center
**Scope**: Visualization, UI components, real-time patterns, ESPN-specific tooling

---

## Executive Summary

Fantasy sports dashboards in 2025 converge on:
- **Recharts** for sports-specific visualizations (already installed, should activate)
- **shadcn/ui + Radix UI** for accessible, composable dashboard components
- **TanStack Table v8** for complex stat tables with sorting/filtering
- **TanStack Query v5** for data fetching (already in use, expand usage)
- **Server-Sent Events (SSE)** for real-time updates (simpler than WebSockets for ESPN polling)
- **Zod** for runtime validation (already in backend, extend to frontend)

**Key Finding**: Your current stack (Fastify, Next.js 14, TanStack Query v5, Recharts, Tailwind) is aligned with 2025 best practices. Focus on **activating unused tools** (Recharts) and **filling component gaps** (shadcn/ui, TanStack Table).

---

## 1. Visualization Libraries

### Primary Recommendation: **Recharts 2.x** ✅ Already Installed

**Current Version in Project**: `^2.10.4`
**Latest Stable (Jan 2025)**: `2.12.x`
**Confidence**: **HIGH** (95%) - Industry standard for React sports dashboards

#### Rationale
- **Declarative React API** - Fits Next.js/React Server Components model
- **Sports-optimized charts**: Line charts (trends), bar charts (standings), area charts (projections), scatter plots (trade analysis)
- **Responsive by default** - Critical for mobile fantasy managers
- **Large community** - Fantasy football/baseball examples abundant
- **Recharts vs alternatives**:
  - vs **Nivo**: Recharts has better TypeScript support, simpler API
  - vs **Victory**: Recharts has better Next.js SSR compatibility
  - vs **Chart.js + react-chartjs-2**: Recharts is more React-idiomatic
  - vs **Tremor**: Too opinionated for custom sports UI
  - vs **Visx (Airbnb)**: Too low-level, slower dev velocity

#### Action Items
1. **Upgrade**: `pnpm add recharts@^2.12.0` in frontend package
2. **Activate unused Recharts** - Currently installed but unused (per CLAUDE.md known issues)
3. **Chart types needed**:
   - **Line charts**: Category rank over time, projected standings trends
   - **Bar charts**: Current standings, category totals
   - **Area charts**: Cumulative stats over season
   - **Scatter plots**: Trade impact analysis (X=category gain, Y=overall points delta)
   - **Composed charts**: Combine actual + projected lines

#### Example Use Cases
```typescript
// Category trend over time
<LineChart data={categoryRankTimeSeries}>
  <Line dataKey="avg_rank" stroke="#8884d8" name="AVG Rank" />
  <Line dataKey="hr_rank" stroke="#82ca9d" name="HR Rank" />
  <XAxis dataKey="snapshot_date" />
  <YAxis reversed domain={[1, numTeams]} />
  <Tooltip />
  <Legend />
</LineChart>

// Projected vs actual standings
<ComposedChart data={standingsData}>
  <Bar dataKey="current_points" fill="#8884d8" name="Current" />
  <Line dataKey="projected_points" stroke="#ff7300" name="Projected" />
  <XAxis dataKey="team_name" />
  <YAxis />
</ComposedChart>
```

#### Known Limitations
- **Performance**: 500+ data points can lag (use sampling for long time series)
- **Customization ceiling**: Deep customization requires dropping to D3.js
- **Animation overhead**: Disable for real-time updating charts (`isAnimationActive={false}`)

---

### Alternative Considered: **Observable Plot**

**Confidence**: **MEDIUM** (60%) - Emerging option for data-dense sports viz

#### Why NOT Recommended (Yet)
- **React integration**: Requires `useEffect` + ref juggling (not declarative)
- **Bundle size**: Includes full D3 (~200KB vs Recharts ~100KB)
- **Community**: Smaller ecosystem for sports-specific examples
- **Future consideration**: If you need publication-quality charts for marketing/blog

---

## 2. Component Libraries

### Primary Recommendation: **shadcn/ui + Radix UI**

**Version**: shadcn/ui CLI latest (copies components, no version)
**Radix UI**: `@radix-ui/react-*@^1.2.x`
**Confidence**: **HIGH** (90%) - Fastest-growing pattern for data dashboards

#### Rationale
- **Copy-paste components**: No library dependency, full customization
- **Accessibility**: WCAG 2.1 AA out-of-box (critical for public app)
- **Tailwind-native**: Seamless integration with your existing Tailwind setup
- **Composability**: Build complex dashboard layouts (tabs, dialogs, dropdowns, tooltips)
- **Headless**: Style sports themes without fighting component opinions
- **TypeScript**: Full type safety for props/variants

#### Action Items
1. **Install shadcn/ui CLI**: `pnpm dlx shadcn-ui@latest init` in frontend package
2. **Core components to add** (via `pnpm dlx shadcn-ui@latest add <component>`):
   - **Card**: Team cards, stat cards, player cards
   - **Table**: Simple roster displays (defer to TanStack Table for complex)
   - **Tabs**: Category tabs (hitting/pitching), view tabs (standings/trends/waivers)
   - **Dialog**: Add/drop confirmations, trade proposal modals
   - **Select**: Team picker, league picker, date range picker
   - **Badge**: Status indicators (fresh/degraded, active/injured)
   - **Tooltip**: Stat explanations, formula breakdowns
   - **Separator**: Visual hierarchy in dense stat layouts
   - **Skeleton**: Loading states for async data
   - **Alert**: Degraded data warnings, stale projection notices
3. **Custom components to build** (using Radix primitives):
   - **PlayerCard**: Photo, name, team, position, key stats
   - **TeamHealthWidget**: Roster status, injury indicators, category strengths
   - **ActionItemCard**: Waiver/trade recommendation with CTA

#### vs Alternatives
- vs **Material-UI (MUI)**: Too heavy (bundle size), opinionated design doesn't fit sports aesthetic
- vs **Chakra UI**: Good alternative, but less momentum than shadcn in 2025
- vs **Ant Design**: Enterprise-focused, not sports-optimized
- vs **Headless UI (Tailwind)**: Good, but shadcn provides more batteries-included
- vs **Mantine**: Excellent, but CSS-in-JS approach conflicts with Tailwind

#### Example Implementation
```typescript
// Team health dashboard widget
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

export function TeamHealthCard({ team, categories }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{team.name}</CardTitle>
        <Badge variant={team.rank <= 3 ? "success" : "default"}>
          Rank {team.rank}
        </Badge>
      </CardHeader>
      <CardContent>
        {categories.map(cat => (
          <Tooltip key={cat.name}>
            <TooltipTrigger>
              <Badge variant={cat.rank <= numTeams/2 ? "success" : "destructive"}>
                {cat.name}: {cat.rank}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Current: {cat.current} | Projected: {cat.projected}
            </TooltipContent>
          </Tooltip>
        ))}
      </CardContent>
    </Card>
  )
}
```

---

## 3. Data Table Library

### Primary Recommendation: **TanStack Table v8**

**Current Version**: Not installed
**Latest Stable**: `@tanstack/react-table@^8.20.x`
**Confidence**: **HIGH** (95%) - Gold standard for sports stat tables

#### Rationale
- **Headless**: Full control over rendering (works with shadcn Table component)
- **Performance**: Virtualizes 1000+ row tables (full roster/free agent lists)
- **Sorting**: Multi-column (e.g., sort by HR then RBI)
- **Filtering**: Client-side (position, team, availability) + server-side (search)
- **Grouping**: By position, by team, by status
- **Column pinning**: Keep player name visible while scrolling stats
- **Row selection**: Multi-select for add/drop, trade builder
- **TypeScript**: Fully typed column definitions
- **TanStack ecosystem**: Works seamlessly with TanStack Query (already in use)

#### Action Items
1. **Install**: `pnpm add @tanstack/react-table@^8.20.0` in frontend
2. **Use cases**:
   - **Free agent table**: Filter by position, sort by projected stats, select for add
   - **Roster table**: Group by position, sort by category impact, highlight injuries
   - **Trade candidate table**: Sort by projected points delta, filter by position scarcity
   - **Standings table**: Sort by category, highlight user's team
   - **Transaction history**: Filter by type, sort by date

#### Example Column Definition
```typescript
import { createColumnHelper } from '@tanstack/react-table'

const columnHelper = createColumnHelper<PlayerProjection>()

const columns = [
  columnHelper.accessor('player_name', {
    header: 'Player',
    cell: info => <PlayerNameCell player={info.row.original} />,
    enablePinning: true, // Keep visible while scrolling
  }),
  columnHelper.accessor('proj_hr', {
    header: 'HR',
    cell: info => info.getValue()?.toFixed(0),
    sortingFn: 'basic',
  }),
  columnHelper.accessor('proj_rbi', {
    header: 'RBI',
    cell: info => info.getValue()?.toFixed(0),
  }),
  // Derived column for rate stats
  columnHelper.display({
    id: 'proj_avg',
    header: 'AVG',
    cell: ({ row }) => {
      const { proj_ab, proj_h } = row.original
      return proj_ab > 0 ? (proj_h / proj_ab).toFixed(3) : '---'
    },
  }),
]
```

#### vs Alternatives
- vs **AG Grid**: Overkill (enterprise features you don't need), expensive for commercial
- vs **react-data-grid**: Good, but less flexible than TanStack
- vs **Mantine DataTable**: Tied to Mantine ecosystem
- vs **HTML table + custom sorting**: Reinventing the wheel, accessibility issues

---

## 4. Real-Time Data Patterns

### Primary Recommendation: **Server-Sent Events (SSE)**

**Confidence**: **HIGH** (85%) - Best fit for ESPN API polling model

#### Rationale
- **ESPN API is poll-based**: No native WebSockets, so SSE matches your polling backend
- **Simpler than WebSockets**: One-way server→client (perfect for score updates, transaction alerts)
- **HTTP/2 friendly**: Reuses existing connections
- **Automatic reconnection**: Browser handles reconnect logic
- **Event types**: Name events for different updates (`snapshot-complete`, `transaction-new`, `projection-updated`)
- **Fastify support**: `@fastify/sse` plugin available

#### Action Items
1. **Backend**: Install `@fastify/sse` (or manual implementation)
2. **Endpoints to create**:
   - `GET /api/leagues/:id/events` - Stream snapshot completions, transaction alerts
   - `GET /api/teams/:teamId/events` - Stream waiver/trade notifications for user's team
3. **Frontend**: Use native `EventSource` API (no library needed)
4. **Fallback**: Polling with TanStack Query `refetchInterval` for browsers without SSE

#### Example Implementation
```typescript
// Backend (Fastify)
app.get('/api/leagues/:id/events', async (req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')

  const leagueId = req.params.id

  // Listen to Redis pub/sub for league events
  const subscriber = redis.duplicate()
  await subscriber.subscribe(`league:${leagueId}:events`)

  subscriber.on('message', (channel, message) => {
    const event = JSON.parse(message)
    reply.raw.write(`event: ${event.type}\n`)
    reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`)
  })

  req.raw.on('close', () => {
    subscriber.unsubscribe()
    subscriber.quit()
  })
})

// Frontend (React)
useEffect(() => {
  const eventSource = new EventSource(`/api/leagues/${leagueId}/events`)

  eventSource.addEventListener('snapshot-complete', (e) => {
    const snapshot = JSON.parse(e.data)
    queryClient.invalidateQueries({ queryKey: ['league', leagueId, 'standings'] })
    toast.success('Standings updated!')
  })

  eventSource.addEventListener('transaction-new', (e) => {
    const txn = JSON.parse(e.data)
    if (txn.team_id === selectedTeamId) {
      toast.info(`New transaction: ${txn.description}`)
    }
  })

  return () => eventSource.close()
}, [leagueId])
```

#### vs Alternatives
- vs **WebSockets**: Overkill (you don't need client→server messaging), harder infrastructure (load balancing, sticky sessions)
- vs **Polling only**: Works, but SSE reduces server load and improves UX latency
- vs **Firebase Realtime DB**: Vendor lock-in, unnecessary for self-hosted data
- vs **Pusher/Ably**: Same vendor lock-in concern

---

### Secondary Pattern: **Optimistic Updates**

**Confidence**: MEDIUM (70%) - Improves perceived performance

#### Use Cases
- **Add/drop waiver**: Immediately show player on roster before server confirms
- **Lineup changes**: Update UI instantly, revert on error
- **Trade proposals**: Show "pending" state before backend processes

#### TanStack Query Integration
```typescript
const addPlayerMutation = useMutation({
  mutationFn: (player) => api.addPlayer(leagueId, teamId, player),
  onMutate: async (newPlayer) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['roster', teamId] })

    // Snapshot previous value
    const previousRoster = queryClient.getQueryData(['roster', teamId])

    // Optimistically update
    queryClient.setQueryData(['roster', teamId], old => [...old, newPlayer])

    return { previousRoster }
  },
  onError: (err, newPlayer, context) => {
    // Revert on error
    queryClient.setQueryData(['roster', teamId], context.previousRoster)
  },
  onSettled: () => {
    // Refetch to sync with server
    queryClient.invalidateQueries({ queryKey: ['roster', teamId] })
  },
})
```

---

## 5. Form & Validation

### Primary Recommendation: **React Hook Form + Zod**

**React Hook Form**: `^7.53.x`
**Zod**: `^3.22.4` (already in backend)
**Confidence**: **HIGH** (90%)

#### Rationale
- **Zod already in backend**: Reuse schema definitions frontend/backend
- **Type safety**: Infer TypeScript types from Zod schemas
- **Performance**: React Hook Form uses uncontrolled inputs (minimal re-renders)
- **Integration**: `@hookform/resolvers` connects RHF + Zod seamlessly
- **shadcn/ui compatibility**: Form component included in shadcn

#### Action Items
1. **Install frontend**: `pnpm add react-hook-form @hookform/resolvers`
2. **Share Zod schemas**: Move schemas to `packages/shared/src/schemas.ts`
3. **Use cases**:
   - League connection form (ESPN league ID + cookies)
   - Trade proposal builder (multi-select players)
   - Filter forms (free agent search, date range)

#### Example
```typescript
// shared/src/schemas.ts
export const leagueConnectionSchema = z.object({
  leagueId: z.string().regex(/^\d+$/, 'Must be numeric'),
  swid: z.string().min(1, 'SWID required for private leagues').optional(),
  espn_s2: z.string().min(1, 'espn_s2 required for private leagues').optional(),
})

// frontend form
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leagueConnectionSchema } from '@espn-fantasy/shared/schemas'

const form = useForm({
  resolver: zodResolver(leagueConnectionSchema),
})

const onSubmit = form.handleSubmit(async (data) => {
  await connectLeagueMutation.mutateAsync(data)
})
```

---

## 6. Date/Time Handling

### Primary Recommendation: **date-fns** ✅ Already Installed

**Current Version**: Backend `^2.30.0`, Frontend `^3.0.6`
**Latest Stable**: `^4.1.0`
**Confidence**: **HIGH** (95%)

#### Rationale
- **Tree-shakeable**: Import only functions you need (vs Moment.js)
- **Immutable**: No mutation bugs
- **TypeScript**: Full type definitions
- **Sports-specific needs**: Format game dates, calculate days until trade deadline, time since last update

#### Action Items
1. **Standardize version**: Upgrade backend to `^3.0.0` (breaking changes in v3)
2. **Timezone handling**: Add `date-fns-tz` to frontend (already in backend)
3. **Common utilities** in `packages/shared/src/date-utils.ts`:
   ```typescript
   export const formatGameDate = (date: Date) => format(date, 'MMM d, yyyy')
   export const formatLastUpdated = (date: Date) => formatDistanceToNow(date, { addSuffix: true })
   export const isWithinSeasonDates = (date: Date, season: { start: Date, end: Date }) =>
     isWithinInterval(date, season)
   ```

---

## 7. Toast Notifications

### Primary Recommendation: **sonner**

**Version**: `^1.7.x`
**Confidence**: **HIGH** (85%)

#### Rationale
- **Beautiful defaults**: Sports-appropriate design (no config needed)
- **Promise toasts**: Perfect for mutations (`toast.promise(mutation, {...})`)
- **Positioning**: Bottom-right (mobile-friendly, doesn't block stats)
- **Action buttons**: "View trade", "Undo add/drop"
- **Accessibility**: Screen reader support
- **Lightweight**: ~4KB

#### Use Cases
- Snapshot completion: "Standings updated 2 minutes ago"
- Waiver added: "Added Juan Soto to your roster"
- Trade evaluated: "This trade improves your projected rank by 2 spots"
- Error handling: "Failed to connect to ESPN. Check your cookies."
- Degraded data: "Projections are stale. Upload new CSV to refresh."

#### vs Alternatives
- vs **react-hot-toast**: Sonner has better API, promise support
- vs **react-toastify**: More config required, less modern
- vs **Custom**: Reinventing the wheel

---

## 8. State Management

### Primary Recommendation: **TanStack Query + URL State** (No Global Store)

**Confidence**: **HIGH** (90%)

#### Rationale
- **TanStack Query IS state management**: Server state in cache, sync/async mutations
- **URL state for UI**: Selected team, active tab, date range (via Next.js `useSearchParams`)
- **localStorage for preferences**: Theme, default team per league (already in use per CLAUDE.md)
- **No Redux/Zustand needed**: Complexity not justified for current scope

#### URL State Pattern
```typescript
// app/leagues/[id]/page.tsx
import { useSearchParams } from 'next/navigation'

export default function LeaguePage({ params }) {
  const searchParams = useSearchParams()
  const selectedTeamId = searchParams.get('team') || getStoredTeamId(params.id)
  const activeTab = searchParams.get('tab') || 'standings'

  // Update URL when team changes
  const setSelectedTeam = (teamId: string) => {
    const url = new URLSearchParams(searchParams)
    url.set('team', teamId)
    router.push(`?${url.toString()}`)
    localStorage.setItem(`league_${params.id}_team`, teamId)
  }

  return (
    <Tabs value={activeTab} onValueChange={tab => router.push(`?tab=${tab}`)}>
      <TabsList>
        <TabsTrigger value="standings">Standings</TabsTrigger>
        <TabsTrigger value="waivers">Waivers</TabsTrigger>
        <TabsTrigger value="trades">Trades</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
```

#### When to Add Zustand (Future)
- **Cross-cutting UI state**: Global filters, multi-step wizards (draft assistant)
- **Real-time collaboration**: Multiple users building trades together
- **Offline mode**: Queue mutations for replay on reconnect

---

## 9. ESPN-Specific Tooling

### Current Approach: Custom Adapter ✅

**Confidence**: **HIGH** (95%) - Continue custom approach

#### Rationale
- **No official ESPN Fantasy API SDK**: ESPN doesn't provide official libraries
- **Existing adapter works**: `packages/backend/src/adapters/espn.ts` is correct pattern
- **Community libraries are stale**: Most ESPN fantasy wrappers (espn-fantasy-football-api, etc.) are outdated, football-focused

#### Enhancements Needed
1. **Retry logic**: Exponential backoff for rate limits
   ```typescript
   import { retry } from '@lifeomic/attempt' // or axios-retry

   async fetchLeague(leagueId: string) {
     return retry(async () => {
       return axios.get(`${ESPN_BASE_URL}/...`, {
         headers: { Cookie: `SWID=${swid}; espn_s2=${espn_s2}` },
         timeout: 10000,
       })
     }, {
       maxAttempts: 3,
       delay: 1000,
       factor: 2, // 1s, 2s, 4s
       handleError: (err, context) => {
         if (err.response?.status === 429) return // Retry rate limits
         throw err // Don't retry client errors
       }
     })
   }
   ```

2. **Redis caching**: Move from in-memory to Redis (already available via `@fastify/redis`)
   ```typescript
   const cacheKey = `espn:league:${leagueId}:${date}`
   const cached = await redis.get(cacheKey)
   if (cached) return JSON.parse(cached)

   const data = await fetchFromESPN(leagueId)
   await redis.setex(cacheKey, 300, JSON.stringify(data)) // 5 min TTL
   return data
   ```

3. **Free agent fetching**: Implement missing endpoint
   ```typescript
   // ESPN API endpoint (discovered via browser DevTools)
   GET /apis/v3/games/flb/seasons/2025/segments/0/leagues/{leagueId}/players?
     scoringPeriodId={currentWeek}&
     view=players_wl& // wl = waiver/free agents
     limit=500
   ```

4. **Activity feed parsing**: For transaction annotations
   ```typescript
   GET /apis/v3/games/flb/seasons/2025/segments/0/leagues/{leagueId}?view=kona_league_communication
   ```

---

## 10. Error Monitoring

### Primary Recommendation: **Sentry** (Future Production Must-Have)

**Confidence**: **HIGH** (90%)

#### Rationale
- **Fantasy sports context**: Capture league ID, team ID, snapshot date on errors
- **Performance monitoring**: Identify slow ESPN API calls, heavy chart renders
- **User feedback**: "Report a bug" widget in dashboard
- **Release tracking**: Tie errors to deployments
- **Free tier**: 5K events/month sufficient for MVP

#### Action Items (Post-MVP)
1. Install: `@sentry/nextjs` (frontend), `@sentry/node` (backend)
2. Configure context:
   ```typescript
   Sentry.setContext('fantasy', {
     leagueId,
     teamId,
     snapshotDate,
     isDegraded,
   })
   ```

#### vs Alternatives
- vs **LogRocket**: Better for session replay, overkill for backend errors
- vs **Rollbar**: Good, but Sentry has better Next.js integration
- vs **Console.log**: Not acceptable for production

---

## 11. Testing (Existing Stack OK)

### Current: **Vitest** ✅

**Confidence**: **HIGH** (95%) - Keep Vitest

#### Rationale
- **Vite-powered**: Faster than Jest (important for TDD)
- **ESM-native**: Matches backend `"type": "module"`
- **Jest-compatible API**: Easy migration if needed

#### Enhancements
1. **Frontend testing**: Add Vitest + Testing Library
   ```bash
   pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```
2. **Component tests**: shadcn/ui components, Recharts charts (snapshot tests)
3. **Integration tests**: TanStack Query hooks with MSW (Mock Service Worker)

---

## 12. Build & Dev Tools (Existing Stack OK)

### Current: **Turbo + pnpm** ✅

**Confidence**: **HIGH** (100%) - Perfect for monorepo

- **Turbo**: Best-in-class monorepo task runner (2025 standard)
- **pnpm**: Fast, disk-efficient, strict peer deps
- **tsx**: Fast TypeScript execution for backend dev

**No changes needed.**

---

## What NOT to Use

### ❌ Avoid: GraphQL (Apollo, urql, tRPC)
**Why**: REST endpoints are simple, typed with Zod. GraphQL overhead not justified for ~15 endpoints.
**Exception**: If adding real-time multiplayer draft (then consider tRPC for type safety).

### ❌ Avoid: Framer Motion
**Why**: Animation library. Sports dashboards prioritize data density over motion. Use CSS transitions.
**Exception**: Onboarding tour, celebration animations (post-MVP).

### ❌ Avoid: Styled Components / Emotion
**Why**: CSS-in-JS conflicts with Tailwind. Runtime cost. Stick to Tailwind + shadcn/ui.

### ❌ Avoid: Lodash
**Why**: Native ES6 methods + TypeScript cover 90% of use cases. Tree-shaking issues.
**Exception**: `lodash-es` for specific utilities like `groupBy` (used sparingly).

### ❌ Avoid: Moment.js
**Why**: Deprecated, not tree-shakeable. You already use date-fns.

### ❌ Avoid: Class Variance Authority (CVA) standalone
**Why**: shadcn/ui includes CVA. Don't install separately.

### ❌ Avoid: Axios (Long-term)
**Why**: Backend already uses Axios, but consider migrating to native `fetch` (available in Node 18+).
**Why Not Now**: Axios retry plugins are mature. Migrate post-MVP.

---

## Recommended Package Additions (Summary)

### Frontend (`packages/frontend`)
```bash
pnpm add @tanstack/react-table@^8.20.0
pnpm add react-hook-form@^7.53.0 @hookform/resolvers@^3.9.0
pnpm add sonner@^1.7.0
pnpm add date-fns@^3.0.6 date-fns-tz@^2.0.0 # Upgrade from 3.0.6 to latest 3.x
pnpm add recharts@^2.12.0 # Upgrade from 2.10.4

# shadcn/ui (via CLI, not package.json)
pnpm dlx shadcn-ui@latest init
pnpm dlx shadcn-ui@latest add card table tabs dialog select badge tooltip separator skeleton alert
```

### Backend (`packages/backend`)
```bash
# Retry logic
pnpm add @lifeomic/attempt@^4.0.0

# SSE (optional, can implement manually)
pnpm add @fastify/sse@^6.0.0

# Upgrade date-fns to match frontend
pnpm add date-fns@^3.0.0 date-fns-tz@^2.0.0
```

### Shared (`packages/shared`)
```bash
# No new dependencies - extend existing types.ts and formulas.ts
```

---

## Version Summary Table

| Library | Current | Recommended | Priority | Confidence |
|---------|---------|-------------|----------|------------|
| Recharts | 2.10.4 | 2.12.x | HIGH (activate unused) | 95% |
| TanStack Table | - | 8.20.x | HIGH (free agents, rosters) | 95% |
| shadcn/ui | - | Latest CLI | HIGH (dashboard UI) | 90% |
| React Hook Form | - | 7.53.x | MEDIUM (forms) | 90% |
| sonner | - | 1.7.x | MEDIUM (UX) | 85% |
| date-fns | 2.30.0 (BE), 3.0.6 (FE) | 3.x (both) | LOW (standardize) | 95% |
| @lifeomic/attempt | - | 4.0.x | MEDIUM (ESPN reliability) | 80% |
| @fastify/sse | - | 6.0.x | LOW (real-time nice-to-have) | 70% |

---

## Implementation Roadmap

### Phase 1: Activate Existing Tools (Week 1)
1. Upgrade Recharts to 2.12.x
2. Build first chart: Category rank trends (line chart)
3. Build second chart: Projected vs current standings (bar chart)
4. Replace hardcoded `localhost:3001` with `lib/api.ts` client

### Phase 2: Component Foundation (Week 2)
1. Install shadcn/ui CLI
2. Add core components: Card, Table, Tabs, Dialog, Select, Badge, Tooltip
3. Build shared PlayerCard, TeamHealthWidget components
4. Replace duplicated UI code in `app/leagues/[id]/*` pages

### Phase 3: Data Tables (Week 3)
1. Install TanStack Table
2. Build FreeAgentTable with sorting, filtering, row selection
3. Build RosterTable with grouping by position
4. Build TradeRecommendationTable with delta sorting

### Phase 4: Forms & UX (Week 4)
1. Install React Hook Form + sonner
2. Rebuild league connection form with validation
3. Add toast notifications for mutations (add/drop, trades)
4. Implement optimistic updates for waivers

### Phase 5: Real-Time (Post-MVP)
1. Implement SSE for snapshot completion events
2. Add Redis caching to ESPN adapter
3. Add retry logic with exponential backoff
4. Implement free agent fetching from ESPN

---

## Confidence Levels Explained

- **95-100% (HIGH)**: Industry standard, low risk, proven at scale (Recharts, TanStack Table, shadcn/ui)
- **80-94% (MEDIUM-HIGH)**: Strong consensus, minor trade-offs (SSE, React Hook Form, sonner)
- **60-79% (MEDIUM)**: Emerging best practice, needs validation (Observable Plot alternative)
- **<60% (LOW)**: Experimental, wait-and-see

---

## Open Questions for Future Research

1. **Draft assistant real-time**: If adding live draft room, revisit WebSockets vs SSE
2. **Mobile app**: If building React Native companion, evaluate Expo vs bare workflow
3. **AI agent observability**: If expanding LLM usage (trade analysis, waiver reasoning), evaluate LangSmith vs Helicone
4. **Caching strategy**: Evaluate SWR vs TanStack Query for offline-first mode
5. **Chart performance**: If time series grows >1000 points, evaluate downsample libraries (e.g., `downsample`, `simplify-js`)

---

## References

- Recharts docs: https://recharts.org/
- shadcn/ui: https://ui.shadcn.com/
- TanStack Table: https://tanstack.com/table/latest
- TanStack Query: https://tanstack.com/query/latest
- Radix UI: https://www.radix-ui.com/
- React Hook Form: https://react-hook-form.com/
- Zod: https://zod.dev/
- date-fns: https://date-fns.org/
- sonner: https://sonner.emilkowal.ski/

---

**Research Completed**: 2026-02-19
**Next Step**: Create roadmap milestone tasks based on Phase 1-5 implementation plan.
