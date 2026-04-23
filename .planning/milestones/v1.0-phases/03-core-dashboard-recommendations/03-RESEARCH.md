# Phase 3: Core Dashboard & Recommendations - Research

**Researched:** 2026-02-19
**Domain:** Dashboard UI/UX, data visualization, recommendation systems
**Confidence:** HIGH

## Summary

Phase 3 delivers the main product value through a team dashboard showing health overview, category analysis, trend charts, and actionable recommendations (waivers + trades). The project already has strong foundations: waiver/trade recommendation agents are implemented and working, Recharts is installed, and component-based UI patterns are established. Research confirms standard approaches: Recharts for charts, structured dashboard layouts with visual hierarchy, and ESPN deep links for action items.

**Primary recommendation:** Build dashboard using existing CategoryStatsTable/StatCard components plus new Recharts charts. Avoid over-engineering—the backend agents already calculate all needed data. Focus on clear presentation and visual hierarchy to help users identify strengths/weaknesses at a glance.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | User sees team dashboard with health overview, strengths, and weaknesses | Dashboard design patterns (visual hierarchy, KPI cards), existing StatCard component, category comparison visualizations |
| DASH-02 | User sees category trend charts (Recharts) instead of tables | Recharts best practices, ResponsiveContainer patterns, existing /trends page as reference (line charts already working) |
| DASH-03 | User sees daily action items with ESPN deep links | ESPN deep link patterns, existing waiver/trade recommendations just need UI refinement |
| DASH-04 | User sees category scarcity analysis (surplus/deficit per category) | Surplus-deficit visualization patterns, percentile/rank-based scarcity detection |
| RECC-01 | User sees waiver add/drop recommendations using real free agent pool | WaiverRecommendationAgent already implemented + free agent fetching from ESPN; UI exists at /waivers page |
| RECC-02 | User sees 1-for-1 trade candidates with accurate projected impact | TradeRecommendationAgent already implemented with rate stat component math; UI exists at /trades page |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | 2.10.4 | Chart rendering | React-native, composable API, widely adopted for dashboards. Installed but underutilized (only /trends page uses it) |
| TanStack Query | 5.17.19 | Data fetching/caching | Already used throughout frontend, standard for React data sync |
| Tailwind CSS | 3.4.1 | Styling | Already used for all UI, utility-first approach matches dashboard needs |
| Next.js 14 | 14.1.0 | App framework | App Router with client components for interactive dashboards |
| date-fns | 3.0.6 | Date formatting | Already installed, standard for date manipulation in charts |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx | 2.1.0 | Conditional classes | Dynamic styling based on category performance (green/yellow/red) |
| React icons | N/A (optional) | Icons for dashboard | Consider lucide-react or heroicons for consistent icon set |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js | Chart.js requires more imperative code, less "React-like". Recharts already installed. |
| Recharts | Victory | Victory has larger bundle size. Recharts has better docs + community. |
| Inline charts | Sparklines lib | For small inline trend indicators, consider react-sparklines. For now, use simplified Recharts. |

**Installation:**
```bash
# All dependencies already installed
# Optional: Add icon library if needed
pnpm add lucide-react --filter=@espn-fantasy/frontend
```

## Architecture Patterns

### Recommended Project Structure

The frontend already follows this structure well:

```
packages/frontend/src/
├── app/leagues/[id]/         # League-specific pages
│   ├── page.tsx              # League detail (overview) - ENHANCE THIS
│   ├── standings/            # Current standings
│   ├── trends/               # Trend charts (reference implementation)
│   ├── waivers/              # Waiver recommendations (already complete)
│   ├── trades/               # Trade analyzer (already complete)
│   └── dashboard/            # NEW: Dedicated dashboard page (optional)
├── components/
│   ├── ui/                   # Generic primitives (StatCard, PageHeader, etc.)
│   └── league/               # Domain components (CategoryStatsTable, TeamSelector, etc.)
└── lib/
    └── api.ts                # Centralized API client
```

**Decision point:** Enhance existing `/leagues/[id]/page.tsx` OR create new `/leagues/[id]/dashboard/page.tsx`?
- **Recommendation:** Enhance existing page.tsx. It already shows team overview with category stats. Add charts + action items there.

### Pattern 1: Dashboard Layout with Visual Hierarchy

**What:** Organize dashboard in order of importance: KPIs → Trends → Details
**When to use:** Every dashboard page
**Example:**

```tsx
// Source: Multiple dashboard design resources + existing league detail page structure
export default function LeagueDashboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <PageHeader title="Team Dashboard" />

      {/* 1. KPI Cards - Most important metrics first */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Overall Rank" value={`${rank}/${totalTeams}`} />
        <StatCard label="Total Points" value={points} trend="up" />
        <StatCard label="Actions Available" value={actionCount} />
      </div>

      {/* 2. Trend Charts - Visual pattern recognition */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium mb-4">Standings Trend</h2>
        <CategoryTrendChart data={trendData} />
      </div>

      {/* 3. Category Analysis - Detailed breakdown */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium mb-4">Category Performance</h2>
        <CategoryStatsTable categories={categories} />
      </div>

      {/* 4. Action Items - What to do next */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium mb-4">Recommended Actions</h2>
        <ActionItemsList items={actions} />
      </div>
    </div>
  );
}
```

**Sources:**
- [Effective Dashboard Design Principles for 2025 | UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [Dashboard Design UX Patterns Best Practices](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)

### Pattern 2: Recharts Responsive Container

**What:** Wrap all charts in ResponsiveContainer for automatic sizing
**When to use:** Every chart component
**Example:**

```tsx
// Source: https://www.dhiwise.com/post/simplify-data-visualization-with-recharts-responsivecontainer
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export function CategoryTrendChart({ data }: { data: any[] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          />
          <YAxis reversed domain={[1, 'dataMax']} label={{ value: 'Rank', angle: -90, position: 'insideLeft' }} />
          <Tooltip labelFormatter={(date) => new Date(date).toLocaleDateString()} />
          <Legend />
          {/* Lines added dynamically per category */}
          <Line type="monotone" dataKey="rank" stroke="#3b82f6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Performance Note:** For high-frequency data, limit data points or use sampling (show every Nth point). Use React.memo for chart components to prevent unnecessary re-renders.

**Source:** [Awesome React Charts Tips: Gradients, Overlays and Responsive SSR in Recharts](https://leanylabs.com/blog/awesome-react-charts-tips/)

### Pattern 3: Surplus/Deficit Visualization

**What:** Show category scarcity using colored bars or badges indicating surplus (strength) vs deficit (weakness)
**When to use:** Category performance analysis
**Example:**

```tsx
// Calculate scarcity score based on rank position
function getScarcityLevel(rank: number, totalTeams: number): 'surplus' | 'neutral' | 'deficit' {
  const percentile = rank / totalTeams;
  if (percentile <= 0.33) return 'surplus';   // Top third
  if (percentile >= 0.67) return 'deficit';   // Bottom third
  return 'neutral';
}

// Visual indicator
function ScarcityBadge({ level }: { level: 'surplus' | 'neutral' | 'deficit' }) {
  const styles = {
    surplus: 'bg-green-100 text-green-800 border-green-300',
    neutral: 'bg-gray-100 text-gray-800 border-gray-300',
    deficit: 'bg-red-100 text-red-800 border-red-300',
  };
  const labels = {
    surplus: 'Strength',
    neutral: 'Average',
    deficit: 'Weakness',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded border ${styles[level]}`}>
      {labels[level]}
    </span>
  );
}
```

**Source:** Synthesized from [Scarcity Principle in UI Design](https://www.nngroup.com/articles/scarcity-principle-ux/) and existing rank color logic in CategoryStatsTable component

### Pattern 4: ESPN Deep Links

**What:** Direct links to ESPN fantasy baseball actions (add/drop, propose trade)
**When to use:** Action items, waiver recommendations, trade suggestions
**Example:**

```tsx
// ESPN URL patterns (based on existing ESPN integration knowledge)
function getESPNPlayerLink(leagueId: number, season: number, playerId: number): string {
  // Player page in league context
  return `https://fantasy.espn.com/baseball/league/transactions?leagueId=${leagueId}&seasonId=${season}&playerId=${playerId}`;
}

function getESPNAddPlayerLink(leagueId: number, season: number, playerId: number): string {
  // Deep link to add player (opens add/drop modal)
  return `https://fantasy.espn.com/baseball/league?leagueId=${leagueId}&seasonId=${season}&view=players&context=add&playerId=${playerId}`;
}

// Action Item Component
function ActionItem({ action }: { action: RecommendedAction }) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
      <div>
        <h3 className="font-medium">{action.title}</h3>
        <p className="text-sm text-gray-600">{action.description}</p>
      </div>
      <a
        href={action.espnLink}
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
      >
        <span>View on ESPN</span>
        <ExternalLinkIcon className="h-4 w-4" />
      </a>
    </div>
  );
}
```

**Important:** ESPN does not provide official deep link documentation. Links observed from ESPN Fantasy Baseball web app behavior. Test links in production to ensure they work correctly.

**Source:** [ESPN Fantasy Baseball Most Added/Dropped](https://fantasy.espn.com/baseball/addeddropped) + [Add or Drop a Player – ESPN Fan Support](https://support.espn.com/hc/en-us/articles/360000065371-Add-or-Drop-a-Player)

### Anti-Patterns to Avoid

- **Information overload:** Don't show all categories + trends + recommendations on one screen. Use tabs or sections to organize.
- **Chart clutter:** Limit to 1-3 lines per chart. More than that becomes unreadable. See existing /trends page for good example.
- **Fake scarcity:** Don't exaggerate urgency with fake countdown timers. Trust in honest data wins long-term user loyalty.
- **Averaging rate stats:** Never average AVG, ERA, WHIP directly. Use component math (existing formulas.ts does this correctly).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG/Canvas | Recharts | Responsive containers, accessibility, legend/tooltip handling, SSR support |
| Date formatting | String manipulation | date-fns (installed) | Locale-aware, timezone handling, consistent formatting |
| Percentile calculations | Manual sorting | Array.sort + index math | Edge cases (ties, empty arrays) already handled |
| ESPN auth flow | Custom OAuth | Existing ESPNAdapter | Cookie-based auth already working, no need to change |
| Player matching | String distance | Existing PlayerIdentityResolutionAgent | Fuzzy matching with team/position boosting, confidence scoring |
| Trade simulation | Manual stat math | Existing TradeRecommendationAgent | Component-based rate stats, re-ranking logic, fairness scoring |

**Key insight:** Phase 1 already built robust backend agents. Don't rebuild that logic in frontend. Trust the API responses and focus on clear presentation.

## Common Pitfalls

### Pitfall 1: ResponsiveContainer Not Working in SSR

**What goes wrong:** Recharts ResponsiveContainer throws errors during server-side rendering because it needs browser dimensions.
**Why it happens:** Next.js App Router renders components on server first, but ResponsiveContainer requires window object.
**How to avoid:** Wrap chart components with "use client" directive (already done in existing /trends page).
**Warning signs:** Hydration mismatch errors, "window is not defined" errors.

**Example:**
```tsx
// ✅ CORRECT
"use client";
import { ResponsiveContainer, LineChart } from 'recharts';

export function TrendChart({ data }) {
  return <ResponsiveContainer>...</ResponsiveContainer>;
}

// ❌ WRONG - Server component with ResponsiveContainer
export function TrendChart({ data }) {
  return <ResponsiveContainer>...</ResponsiveContainer>;
}
```

**Source:** [Awesome React Charts Tips: Responsive SSR in Recharts](https://leanylabs.com/blog/awesome-react-charts-tips/)

### Pitfall 2: Empty Array in WHERE IN Clause

**What goes wrong:** Kysely generates invalid SQL for `.where("col", "in", [])` when array is empty.
**Why it happens:** SQL doesn't allow `WHERE col IN ()` syntax.
**How to avoid:** Always check `array.length > 0` before using IN clauses. Already documented in CLAUDE.md but worth repeating.
**Warning signs:** Database query errors, 500 responses from recommendation endpoints.

**Example:**
```typescript
// ✅ CORRECT
const playerIds = freeAgents.map(fa => fa.playerId);
const projections = playerIds.length > 0
  ? await db.selectFrom("player_projection")
      .where("player_id", "in", playerIds)
      .execute()
  : [];

// ❌ WRONG
const projections = await db.selectFrom("player_projection")
  .where("player_id", "in", [])  // ERROR if array empty
  .execute();
```

**Source:** CLAUDE.md project instructions, existing codebase patterns

### Pitfall 3: Dashboard Clutter (Too Many Visualizations)

**What goes wrong:** Showing 10+ charts/stats on one screen overwhelms users, making it hard to identify what matters.
**Why it happens:** Desire to show "all the data" leads to information overload.
**How to avoid:** Limit to 5-9 visualizations per screen. Use visual hierarchy to prioritize. Show summary first, details on demand.
**Warning signs:** Users complain dashboard is "too busy", bounce rate increases, no clear focal point.

**Guidelines:**
- 3 KPI cards (rank, points, actions available)
- 1-2 trend charts (overall + 1 category)
- 1 category breakdown table
- 1 action items section
- Total: ~6 sections = within cognitive limit

**Source:** [10 Key Dashboard Design Principles: Analytics Best Practice](https://www.yellowfinbi.com/blog/key-dashboard-design-principles-analytics-best-practice) - "The human brain can only comprehend around 7±2 images at one time"

### Pitfall 4: Color-Only Differentiation (Accessibility)

**What goes wrong:** Using only color to indicate good/bad categories fails for colorblind users.
**Why it happens:** Relying on green=good, red=bad without secondary cues.
**How to avoid:** Always pair color with icons, patterns, or text labels. Existing getRankColor() function uses both color and text rank number—good pattern.
**Warning signs:** User reports of "can't tell categories apart", accessibility audit failures.

**Example:**
```tsx
// ✅ CORRECT - Color + icon + text
function CategoryIndicator({ rank, total }) {
  const isGood = rank / total <= 0.33;
  return (
    <div className={isGood ? 'text-green-600' : 'text-red-600'}>
      {isGood ? <TrendingUpIcon /> : <TrendingDownIcon />}
      <span>Rank {rank} - {isGood ? 'Strength' : 'Weakness'}</span>
    </div>
  );
}

// ❌ WRONG - Color only
function CategoryIndicator({ rank, total }) {
  const isGood = rank / total <= 0.33;
  return <div className={isGood ? 'text-green-600' : 'text-red-600'}>●</div>;
}
```

**Source:** [Dashboard Design: Best Practices & How-Tos 2026](https://improvado.io/blog/dashboard-design-guide) - "Ensure accessibility by backing up color with a second cue (icons, patterns, or labels)"

## Code Examples

Verified patterns from official sources and existing codebase:

### Multi-Category Trend Chart

```tsx
// Source: Existing /trends page + Recharts docs
"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface CategoryTrendData {
  date: string;
  [categoryId: string]: number | string;  // categoryId -> rank value
}

export function CategoryTrendChart({
  data,
  categories,
  highlightCategory
}: {
  data: CategoryTrendData[];
  categories: string[];
  highlightCategory?: string;
}) {
  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(date) => new Date(date).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric'
            })}
          />
          <YAxis
            reversed
            domain={[1, 'dataMax']}
            label={{ value: 'Rank', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            labelFormatter={(date) => new Date(date).toLocaleDateString()}
            formatter={(value: number) => [`Rank ${value}`, '']}
          />
          <Legend />
          {categories.map((cat, idx) => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={highlightCategory === cat ? 3 : 2}
              opacity={highlightCategory && highlightCategory !== cat ? 0.4 : 1}
              dot={{ r: highlightCategory === cat ? 4 : 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### Action Items List with ESPN Deep Links

```tsx
// Synthesized from existing waiver/trade UI patterns
interface ActionItem {
  id: string;
  type: 'waiver' | 'trade' | 'lineup';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;  // e.g., "+2.5 points"
  espnLink?: string;
  internalLink?: string;
}

export function ActionItemsList({ items }: { items: ActionItem[] }) {
  const priorityColors = {
    high: 'border-red-300 bg-red-50',
    medium: 'border-yellow-300 bg-yellow-50',
    low: 'border-green-300 bg-green-50',
  };

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No recommended actions at this time.</p>
          <p className="text-sm mt-2">Your team is performing well!</p>
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between p-4 border-2 rounded-lg ${priorityColors[item.priority]}`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase text-gray-600">
                  {item.type}
                </span>
                <span className="text-xs text-gray-500">•</span>
                <span className="text-sm font-semibold text-green-700">
                  {item.impact}
                </span>
              </div>
              <h3 className="font-medium text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            </div>
            <div className="flex gap-2">
              {item.internalLink && (
                <Link
                  href={item.internalLink}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Analyze
                </Link>
              )}
              {item.espnLink && (
                <a
                  href={item.espnLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <span>ESPN</span>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
```

### Strength/Weakness Summary Card

```tsx
// Analyze categories to show top strengths and weaknesses
function analyzeCategories(categories: CategoryData[], totalTeams: number) {
  const withScarcity = categories.map(cat => ({
    ...cat,
    percentile: cat.rank / totalTeams,
  }));

  const strengths = withScarcity
    .filter(c => c.percentile <= 0.33)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);

  const weaknesses = withScarcity
    .filter(c => c.percentile >= 0.67)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3);

  return { strengths, weaknesses };
}

export function TeamHealthOverview({ categories, totalTeams }: { categories: CategoryData[]; totalTeams: number }) {
  const { strengths, weaknesses } = analyzeCategories(categories, totalTeams);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Strengths */}
      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-green-900 mb-4 flex items-center gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Top Strengths
        </h3>
        {strengths.length > 0 ? (
          <ul className="space-y-2">
            {strengths.map(cat => (
              <li key={cat.category_id} className="flex justify-between items-center">
                <span className="font-medium text-gray-900">{cat.name}</span>
                <span className="text-sm text-green-700">Rank #{cat.rank}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">No top-tier categories yet.</p>
        )}
      </div>

      {/* Weaknesses */}
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          Areas for Improvement
        </h3>
        {weaknesses.length > 0 ? (
          <ul className="space-y-2">
            {weaknesses.map(cat => (
              <li key={cat.category_id} className="flex justify-between items-center">
                <span className="font-medium text-gray-900">{cat.name}</span>
                <span className="text-sm text-red-700">Rank #{cat.rank}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">No weak categories—great job!</p>
        )}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Table-based trends | Interactive charts (Recharts) | Recharts 2.x (2020+) | Better pattern recognition, mobile-friendly |
| Static dashboards | Real-time data sync (TanStack Query) | v5 (2024) | Fresh data without manual refresh |
| Server-rendered charts | Client-side responsive charts | Next.js 13+ App Router | Better UX, responsive to screen size |
| Manual ESPN links | Deep links to ESPN actions | ESPN web app evolution | Direct action flow reduces friction |

**Deprecated/outdated:**
- Victory Charts: Larger bundle, less active community than Recharts
- Custom D3 implementations: Recharts abstracts complexity while maintaining flexibility
- Class components for charts: Recharts works best with functional components + hooks

## Open Questions

1. **ESPN Deep Link Stability**
   - What we know: ESPN uses leagueId, seasonId, playerId in URLs
   - What's unclear: Do these links work across seasons? Are there rate limits? Do they require login session?
   - Recommendation: Test in production, add fallback to ESPN homepage if link fails. Monitor for broken links.

2. **Historical Data Availability**
   - What we know: Current snapshot architecture supports daily snapshots going forward
   - What's unclear: Can we backfill past season data? Is there value in showing last season's performance?
   - Recommendation: Start with current-season-only trends. Defer historical backfill to Phase 4 (per roadmap decision).

3. **Chart Performance at Scale**
   - What we know: Recharts can slow down with high-frequency data
   - What's unclear: How many snapshots before chart becomes sluggish? What's the optimal sampling rate?
   - Recommendation: Start with all data points (likely <100 snapshots per season). If slow, sample to every 3rd day.

4. **Action Item Priority Algorithm**
   - What we know: WaiverRecommendationAgent sorts by deltaOverallPoints
   - What's unclear: Should action items consider urgency (waiver deadline), roster constraints, or user preferences?
   - Recommendation: Phase 3 uses simple points-based ranking. Phase 4 can add sophisticated prioritization if needed.

## Sources

### Primary (HIGH confidence)

**Recharts & Charting:**
- [Recharts GitHub Repository](https://github.com/recharts/recharts) - Official repo with examples
- [A Guide to Recharts ResponsiveContainer in Web Development](https://www.dhiwise.com/post/simplify-data-visualization-with-recharts-responsivecontainer) - Responsive patterns
- [Awesome React Charts Tips: Gradients, Overlays and Responsive SSR in Recharts](https://leanylabs.com/blog/awesome-react-charts-tips/) - Performance and SSR
- [Create charts using Recharts | Refine](https://refine.dev/blog/recharts/) - Best practices tutorial

**Dashboard Design:**
- [Effective Dashboard Design Principles for 2025 | UXPin](https://www.uxpin.com/studio/blog/dashboard-design-principles/) - Visual hierarchy, KPI placement
- [Dashboard Design UX Patterns Best Practices](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards) - Layout patterns
- [10 Key Dashboard Design Principles: Analytics Best Practice](https://www.yellowfinbi.com/blog/key-dashboard-design-principles-analytics-best-practice) - 5-9 visualization limit
- [Dashboard Design: Best Practices & How-Tos 2026](https://improvado.io/blog/dashboard-design-guide) - Accessibility, color usage

**Scarcity Visualization:**
- [Scarcity Principle in UI Design: Making Users Click RIGHT NOW or Lose Out - NN/G](https://www.nngroup.com/articles/scarcity-principle-ux/) - Scarcity psychology
- [Visualizing data in user interfaces by Andrew Coyle](https://www.andrewcoyle.com/blog/visualizing-data-in-user-interfaces) - Data viz patterns

**ESPN Integration:**
- [ESPN Fantasy Baseball Most Added/Dropped](https://fantasy.espn.com/baseball/addeddropped) - URL patterns
- [Add or Drop a Player – ESPN Fan Support](https://support.espn.com/hc/en-us/articles/360000065371-Add-or-Drop-a-Player) - User flow documentation

### Secondary (MEDIUM confidence)

- Existing codebase patterns (/trends page, CategoryStatsTable, waiver/trade pages) - Working implementations
- CLAUDE.md project instructions - Documented patterns and known issues

### Tertiary (LOW confidence)

- ESPN deep link construction - Inferred from web app behavior, not officially documented. Needs testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and working
- Architecture: HIGH - Patterns validated by existing working pages
- Pitfalls: HIGH - Documented in multiple official sources + codebase experience

**Research date:** 2026-02-19
**Valid until:** 2026-04-19 (60 days - stable domain with mature libraries)
