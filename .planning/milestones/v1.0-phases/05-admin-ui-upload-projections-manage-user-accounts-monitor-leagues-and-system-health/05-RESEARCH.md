# Phase 5: Admin UI - Research

**Researched:** 2026-02-20
**Domain:** Next.js admin dashboard, user management, BullMQ monitoring, CSV upload UX
**Confidence:** HIGH

## Summary

Admin dashboards in 2026 favor component-driven architectures using TanStack Table v8 for data grids, shadcn/ui for UI primitives, and layered RBAC enforcement (middleware + route guards + API checks). BullMQ monitoring uses dedicated dashboard libraries like bull-board rather than hand-rolled solutions. CSV upload patterns leverage React Hook Form + Zod for validation with server-side processing via Next.js server actions or API routes.

The ESPN Fantasy Baseball Assistant already has basic admin infrastructure (JWT auth, role-based middleware, admin route wrapper, CSV upload page), making this phase about enhancement and expansion rather than foundation building.

**Primary recommendation:** Adopt TanStack Table + shadcn/ui for user management tables, integrate bull-board for queue monitoring, enhance CSV upload with multi-file support and validation preview, and build system health dashboard using existing Recharts library.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | v8.21.3 | Headless table logic | Industry standard for React data tables - 2288 npm dependents, handles sorting/filtering/pagination/virtualization |
| shadcn/ui | Latest | UI component primitives | 2026 standard for Next.js dashboards - zero runtime dependencies, copy-paste model, full Server Components support |
| @bull-board/fastify | v6.16.2 | BullMQ queue monitoring UI | Official Fastify adapter, battle-tested queue dashboard with job visualization and management |
| React Hook Form | Latest | Form state management | Performance-focused (uncontrolled components), pairs with Zod for validation |
| Zod | v3.22.4 (already installed) | Schema validation | TypeScript-first validation, already in use in backend |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @hookform/resolvers | Latest | Bridge RHF + Zod | When using React Hook Form with Zod validation |
| Recharts | v2.10.4 (installed) | Charts for system health | Already installed, sufficient for admin dashboards |
| clsx | v2.1.0 (installed) | Conditional classes | Already installed for Tailwind utilities |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Table | AG Grid | AG Grid handles 100k+ rows better but adds 143KB bundle weight vs TanStack's 10-15KB |
| shadcn/ui | MUI/Chakra | Traditional component libraries easier to start but lock you into their design system and add runtime dependencies |
| bull-board | Custom dashboard | Custom gives full control but misses edge cases (job retries, stuck queue detection, payload inspection) |
| API routes | Server Actions | Server Actions simpler for forms but API routes better for non-form file uploads and explicit CORS control |

**Installation:**
```bash
# Frontend (packages/frontend)
pnpm add @tanstack/react-table react-hook-form @hookform/resolvers
pnpm dlx shadcn@latest init  # Configure with existing Tailwind
pnpm dlx shadcn@latest add table button input select badge

# Backend (packages/backend)
pnpm add @bull-board/api @bull-board/fastify
```

## Architecture Patterns

### Recommended Project Structure
```
packages/frontend/src/
├── app/admin/
│   ├── page.tsx              # Dashboard overview (existing, enhance)
│   ├── users/
│   │   └── page.tsx          # User management table
│   ├── leagues/
│   │   └── page.tsx          # League monitoring table
│   └── system/
│       └── page.tsx          # System health dashboard
├── components/ui/            # shadcn/ui primitives (table, button, etc.)
├── components/admin/         # Domain-specific admin components
│   ├── UserManagementTable.tsx
│   ├── LeagueHealthTable.tsx
│   ├── SystemMetricsChart.tsx
│   └── CSVUploadForm.tsx
└── lib/
    ├── api.ts                # API client (already exists)
    └── validators.ts         # Zod schemas for forms

packages/backend/src/
├── api/
│   ├── admin-users.ts        # User management endpoints
│   ├── admin-system.ts       # System health endpoints
│   └── admin-queues.ts       # Bull-board integration
└── middleware/
    └── auth.ts               # requireAdmin already exists
```

### Pattern 1: RBAC Layered Defense
**What:** Enforce admin access at multiple levels - middleware, route wrapper, API
**When to use:** All admin functionality
**Example:**
```typescript
// Middleware (backend/src/middleware/auth.ts - already exists)
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply);
  if (request.user.role !== 'admin') {
    return reply.code(403).send({ error: 'Admin access required' });
  }
}

// Route wrapper (frontend/src/components/ProtectedRoute.tsx - already exists)
export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.push('/');
    }
  }, [user, loading]);
  // ...
}

// API route enforcement (backend/src/api/admin-users.ts - NEW)
fastify.get('/api/admin/users', {
  onRequest: [requireAdmin], // ← Enforced at API level
}, async (request, reply) => {
  // ...
});
```

### Pattern 2: TanStack Table + shadcn/ui Data Table
**What:** Headless table logic (TanStack) + styled primitives (shadcn)
**When to use:** User management, league monitoring, any paginated/sortable data
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/data-table

// 1. Define columns (columns.tsx)
import { ColumnDef } from "@tanstack/react-table";

export const userColumns: ColumnDef<User>[] = [
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => (
      <Badge variant={row.getValue("role") === "admin" ? "default" : "secondary"}>
        {row.getValue("role")}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <UserRowActions user={row.original} />,
  },
];

// 2. Build DataTable component (data-table.tsx)
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DataTable<TData, TValue>({
  columns,
  data,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// 3. Use in page
import { userColumns } from "./columns";
import { DataTable } from "@/components/ui/data-table";

export default function UsersPage() {
  const { data: users } = useQuery({ queryKey: ['admin', 'users'], queryFn: api.getAdminUsers });
  return <DataTable columns={userColumns} data={users || []} />;
}
```

### Pattern 3: Bull-Board Integration
**What:** Mount bull-board UI as a Fastify route
**When to use:** BullMQ queue monitoring
**Example:**
```typescript
// Source: https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify-auth

// backend/src/api/admin-queues.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { snapshotQueue } from '../workers/snapshot-worker.js';
import { requireAdmin } from '../middleware/auth.js';

export async function adminQueuesRoutes(fastify: FastifyInstance) {
  const serverAdapter = new FastifyAdapter();

  createBullBoard({
    queues: [new BullMQAdapter(snapshotQueue)],
    serverAdapter,
  });

  serverAdapter.setBasePath('/admin/queues');

  // Protect bull-board routes with admin middleware
  fastify.register(async (fastify) => {
    fastify.addHook('onRequest', requireAdmin);
    fastify.register(serverAdapter.registerPlugin(), {
      prefix: '/admin/queues',
    });
  });
}
```

### Pattern 4: CSV Upload with Validation Preview
**What:** Multi-file upload with client-side preview before server processing
**When to use:** Enhanced projections upload (batters + pitchers in one flow)
**Example:**
```typescript
// Source: Combination of React Hook Form + Zod + Next.js patterns

// lib/validators.ts
import { z } from 'zod';

export const csvUploadSchema = z.object({
  batterFile: z.instanceof(File).refine(
    (file) => file.size < 5 * 1024 * 1024,
    'Batter file must be less than 5MB'
  ).refine(
    (file) => file.name.endsWith('.csv'),
    'Must be a CSV file'
  ).optional(),
  pitcherFile: z.instanceof(File).refine(
    (file) => file.size < 5 * 1024 * 1024,
    'Pitcher file must be less than 5MB'
  ).refine(
    (file) => file.name.endsWith('.csv'),
    'Must be a CSV file'
  ).optional(),
}).refine(
  (data) => data.batterFile || data.pitcherFile,
  'At least one file is required'
);

// components/admin/CSVUploadForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export function CSVUploadForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(csvUploadSchema),
  });

  const onSubmit = async (data: z.infer<typeof csvUploadSchema>) => {
    const formData = new FormData();
    if (data.batterFile) formData.append('batter', data.batterFile);
    if (data.pitcherFile) formData.append('pitcher', data.pitcherFile);

    await fetch('/api/projections/upload-batch', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>Batters CSV</label>
        <input type="file" {...register('batterFile')} accept=".csv" />
        {errors.batterFile && <span>{errors.batterFile.message}</span>}
      </div>
      <div>
        <label>Pitchers CSV</label>
        <input type="file" {...register('pitcherFile')} accept=".csv" />
        {errors.pitcherFile && <span>{errors.pitcherFile.message}</span>}
      </div>
      <button type="submit">Upload Both</button>
    </form>
  );
}
```

### Pattern 5: System Health Metrics Dashboard
**What:** Real-time metrics using existing Recharts library
**When to use:** System health overview
**Example:**
```typescript
// Source: Recharts documentation + system monitoring patterns

// app/admin/system/page.tsx
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function SystemHealthPage() {
  const { data: metrics } = useQuery({
    queryKey: ['admin', 'system', 'metrics'],
    queryFn: api.getSystemMetrics,
    refetchInterval: 30000, // Refresh every 30s
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* KPI Cards */}
      <Card>
        <CardHeader>Snapshot Success Rate</CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {metrics?.snapshotSuccessRate}%
          </div>
        </CardContent>
      </Card>

      {/* Snapshot History Chart */}
      <Card className="col-span-2">
        <CardHeader>Snapshot Activity (7 days)</CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics?.snapshotHistory}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="success" stroke="#10b981" />
              <Line type="monotone" dataKey="failed" stroke="#ef4444" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Client-only RBAC enforcement:** Always verify admin role on backend, never trust client-side checks alone (CVE-2025-29927 Next.js middleware bypass vulnerability exists)
- **Rendering all data at once:** Use pagination/virtualization for tables over 100 rows to avoid performance degradation
- **Global admin role:** Use temporary elevated access patterns where possible, avoid permanent global admin accounts
- **Hand-rolling queue monitoring:** BullMQ job state management is complex (retries, stuck detection, backoff) - use bull-board
- **Inline file validation:** Define Zod schemas separately for reuse between frontend validation and backend verification

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BullMQ queue monitoring | Custom dashboard for jobs, retries, failures | @bull-board/fastify | bull-board handles job state visualization, retry/clean actions, multi-queue support, stuck job detection - complex edge cases already solved |
| Data table sorting/filtering/pagination | Custom table state management | @tanstack/react-table | TanStack Table handles column state, sorting logic, filter functions, pagination calculations - 10+ years of edge cases solved |
| Form validation | Manual input validation with useState | React Hook Form + Zod | RHF minimizes re-renders with uncontrolled components, Zod provides type-safe schemas - performance and type safety out of box |
| CSV parsing | Manual CSV string splitting | csv-parse (already installed) | CSV parsing has edge cases (quoted commas, newlines in fields, escape sequences) - backend already uses csv-parse correctly |
| UI primitives | Custom button/input/badge components | shadcn/ui | Accessibility (ARIA), keyboard navigation, focus management already implemented - copy code you control vs reinventing |

**Key insight:** Admin dashboards have well-established patterns in 2026 - table libraries handle complex state management, specialized dashboards solve monitoring problems, validation libraries provide type safety. The value is in composing these well, not rebuilding them.

## Common Pitfalls

### Pitfall 1: Client-Side Only RBAC
**What goes wrong:** Admin UI restricted in frontend but backend API unprotected, allowing direct API calls to bypass restrictions
**Why it happens:** Middleware can't catch all routes, developers forget to add `requireAdmin` to new endpoints
**How to avoid:** Layered defense - require `onRequest: [requireAdmin]` on EVERY admin API route, use middleware as first line only
**Warning signs:** API routes without `onRequest` hook, 403 errors in production logs from unauthorized attempts

### Pitfall 2: Table Performance Degradation
**What goes wrong:** User management table with 1000+ users renders all rows, causing 3+ second load times and UI freezes
**Why it happens:** React reconciliation struggles with thousands of DOM nodes, default TanStack Table renders all rows
**How to avoid:** Add pagination to tables over 100 rows, use TanStack's `getPaginationRowModel()`, consider virtualization for 10k+ rows
**Warning signs:** Page load time increases linearly with user count, browser dev tools show long scripting tasks

### Pitfall 3: Forgot to Verify File Type on Backend
**What goes wrong:** User uploads .txt file renamed to .csv, backend processing fails with cryptic errors
**Why it happens:** Client-side validation (React Hook Form) can be bypassed with direct API calls or disabled JavaScript
**How to avoid:** Duplicate Zod validation on backend, check file extension AND parse first row to verify CSV structure
**Warning signs:** Upload succeeds but projection ingest fails, no validation errors shown to user

### Pitfall 4: Exposing Sensitive Queue Data
**What goes wrong:** Bull-board shows Redis connection strings, job payloads contain ESPN auth cookies
**Why it happens:** Bull-board default config shows all metadata, job data includes everything passed to worker
**How to avoid:** Configure bull-board with `{ redis: { hide: true } }`, sanitize job data before adding to queue, use read-only mode for non-super-admins
**Warning signs:** Redis URLs visible in bull-board header, auth cookies in job payload inspector

### Pitfall 5: No Rate Limiting on Admin Endpoints
**What goes wrong:** Admin bulk user update endpoint called in loop, database overloaded
**Why it happens:** Admin routes assumed to be protected by RBAC only, forgot rate limiting middleware
**How to avoid:** Backend already has @fastify/rate-limit installed - apply to admin routes too, use stricter limits for destructive operations
**Warning signs:** Database connection pool exhaustion, API response times spike during admin operations

### Pitfall 6: TanStack Table Empty Array WHERE IN Bug
**What goes wrong:** Filtering users by role when no roles selected generates invalid SQL: `WHERE role IN ()`
**Why it happens:** Kysely generates invalid SQL for empty arrays in WHERE IN clauses (already documented in CLAUDE.md)
**How to avoid:** Always check `array.length > 0` before `.where("col", "in", array)`, or return early with empty results
**Warning signs:** SQL errors in logs when clearing table filters, "syntax error near ')'" database errors

### Pitfall 7: Shadow Admin Accounts
**What goes wrong:** Admin manually updates user role in database, bypassing audit trail, creating untracked admin access
**Why it happens:** No UI for role management, direct database access seems faster
**How to avoid:** Build user management UI first, log all role changes to audit table, require admin approval workflow for role elevation
**Warning signs:** Admins asking for database credentials, user role changes with no application logs

## Code Examples

Verified patterns from official sources:

### User Management Table with Actions
```typescript
// Source: https://ui.shadcn.com/docs/components/radix/data-table

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const userColumns: ColumnDef<User>[] = [
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      const role = row.getValue("role") as string;
      return (
        <Badge variant={role === "admin" ? "default" : "secondary"}>
          {role}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Joined",
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return <span>{date.toLocaleDateString()}</span>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditRole(user.id)}>
              Change Role
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
              Reset Password
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => handleDisableUser(user.id)}
            >
              Disable Account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
```

### Backend User Management API
```typescript
// backend/src/api/admin-users.ts
import { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { requireAdmin } from "../middleware/auth.js";

export async function adminUsersRoutes(fastify: FastifyInstance) {
  // List all users (paginated)
  fastify.get('/api/admin/users', {
    onRequest: [requireAdmin],
  }, async (request, reply) => {
    const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };
    const offset = (page - 1) * limit;

    const db = getDb();
    const users = await db
      .selectFrom('users')
      .select(['id', 'email', 'role', 'display_name', 'created_at', 'last_login_at'])
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const totalResult = await db
      .selectFrom('users')
      .select(db.fn.count('id').as('count'))
      .executeTakeFirst();

    return {
      users,
      pagination: {
        page,
        limit,
        total: Number(totalResult?.count || 0),
      },
    };
  });

  // Update user role
  fastify.patch('/api/admin/users/:userId/role', {
    onRequest: [requireAdmin],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { role } = request.body as { role: 'user' | 'admin' };

    if (!['user', 'admin'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }

    const db = getDb();
    await db
      .updateTable('users')
      .set({ role, updated_at: new Date() })
      .where('id', '=', parseInt(userId, 10))
      .execute();

    // TODO: Log to audit table
    fastify.log.info({ adminId: request.user.userId, targetUserId: userId, newRole: role }, 'User role changed');

    return { success: true };
  });

  // Disable user account
  fastify.patch('/api/admin/users/:userId/disable', {
    onRequest: [requireAdmin],
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const db = getDb();

    // Soft delete: could add 'disabled_at' column or set role to 'disabled'
    await db
      .updateTable('users')
      .set({ role: 'disabled', updated_at: new Date() })
      .where('id', '=', parseInt(userId, 10))
      .execute();

    // Delete all refresh tokens to force logout
    await db
      .deleteFrom('refresh_tokens')
      .where('user_id', '=', parseInt(userId, 10))
      .execute();

    fastify.log.info({ adminId: request.user.userId, targetUserId: userId }, 'User account disabled');

    return { success: true };
  });
}
```

### System Health Metrics API
```typescript
// backend/src/api/admin-system.ts
import { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { requireAdmin } from "../middleware/auth.js";
import { sub } from "date-fns";

export async function adminSystemRoutes(fastify: FastifyInstance) {
  fastify.get('/api/admin/system/metrics', {
    onRequest: [requireAdmin],
  }, async (request, reply) => {
    const db = getDb();
    const sevenDaysAgo = sub(new Date(), { days: 7 });

    // Snapshot success rate (last 7 days)
    const snapshots = await db
      .selectFrom('league_daily_snapshot')
      .select(['snapshot_date', 'is_degraded'])
      .where('snapshot_date', '>=', sevenDaysAgo.toISOString().split('T')[0])
      .execute();

    const successCount = snapshots.filter(s => !s.is_degraded).length;
    const snapshotSuccessRate = snapshots.length > 0
      ? Math.round((successCount / snapshots.length) * 100)
      : 0;

    // Snapshot history by day
    const snapshotHistory = snapshots.reduce((acc, s) => {
      const existing = acc.find(item => item.date === s.snapshot_date);
      if (existing) {
        if (s.is_degraded) existing.failed++;
        else existing.success++;
      } else {
        acc.push({
          date: s.snapshot_date,
          success: s.is_degraded ? 0 : 1,
          failed: s.is_degraded ? 1 : 0,
        });
      }
      return acc;
    }, [] as { date: string; success: number; failed: number }[]);

    // Active leagues
    const leagueCount = await db
      .selectFrom('league')
      .select(db.fn.count('id').as('count'))
      .executeTakeFirst();

    // Total users
    const userCount = await db
      .selectFrom('users')
      .select(db.fn.count('id').as('count'))
      .executeTakeFirst();

    // Latest projection run
    const latestProjection = await db
      .selectFrom('projections_run')
      .select(['id', 'as_of_date', 'staleness', 'ingested_at'])
      .orderBy('ingested_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    return {
      snapshotSuccessRate,
      snapshotHistory: snapshotHistory.sort((a, b) => a.date.localeCompare(b.date)),
      leagueCount: Number(leagueCount?.count || 0),
      userCount: Number(userCount?.count || 0),
      latestProjection,
    };
  });

  // League health summary
  fastify.get('/api/admin/system/leagues', {
    onRequest: [requireAdmin],
  }, async (request, reply) => {
    const db = getDb();

    const leagues = await db
      .selectFrom('league')
      .leftJoin('league_daily_snapshot', (join) =>
        join.onRef('league.id', '=', 'league_daily_snapshot.league_id')
           .on(db.fn('date', ['league_daily_snapshot.snapshot_date']), '=', db.fn('date', [db.fn('now', [])]))
      )
      .select([
        'league.id',
        'league.name',
        'league.espn_league_id',
        'league_daily_snapshot.snapshot_date',
        'league_daily_snapshot.is_degraded',
        'league_daily_snapshot.degraded_reasons',
      ])
      .execute();

    return {
      leagues: leagues.map(league => ({
        ...league,
        status: league.snapshot_date
          ? (league.is_degraded ? 'degraded' : 'healthy')
          : 'no_snapshot',
      })),
    };
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-table v7 | @tanstack/react-table v8 | 2022 | Breaking API changes - `useTable` → `useReactTable`, `Header` → `header`, new column definition syntax |
| MUI Data Grid | TanStack Table + shadcn/ui | 2023-2024 | Shift to headless patterns - zero runtime dependencies, copy-paste model, better bundle size |
| NextAuth.js (only) | JWT + httpOnly cookies | 2024-2026 | NextAuth.js middleware only works with JWT (not database sessions), custom JWT solutions more flexible |
| API routes for forms | Server Actions | 2023 (Next.js 13.4) | Server Actions simplify form handling but API routes still preferred for non-form uploads and CORS control |
| arena (Bull) | bull-board (BullMQ) | 2021-2023 | BullMQ replaced Bull, arena maintenance slowed, bull-board became standard |

**Deprecated/outdated:**
- **react-table v7:** Migrated to TanStack Table v8 in 2022, API is incompatible (use migration guide)
- **Bull (not BullMQ):** Original Bull library deprecated in favor of BullMQ which has better Redis clustering and flow support
- **NextAuth.js database sessions with middleware:** Middleware requires JWT session strategy as of v4+
- **Manual RBAC implementations:** 2026 tools (Clerk, Descope, Auth.js) provide RBAC out of box, hand-rolling complex

## Open Questions

1. **Should we add an audit log table for admin actions?**
   - What we know: User role changes and account disabling should be auditable
   - What's unclear: Scope of audit logging (all admin actions? just destructive ones?), retention policy
   - Recommendation: Start with minimal audit - log role changes and account disabling to application logs (already doing), add dedicated audit table in future phase if compliance requires it

2. **How granular should user search/filtering be?**
   - What we know: TanStack Table supports column filtering, basic pagination exists
   - What's unclear: Do admins need to filter by league membership, last login date, OAuth provider?
   - Recommendation: Start with email search only (most common use case), add filters as needed based on admin feedback

3. **Should CSV upload preview show parsed data before processing?**
   - What we know: Users upload wrong files sometimes, backend processing is slow (player matching)
   - What's unclear: Client-side CSV parsing adds bundle weight, preview usefulness vs complexity
   - Recommendation: Show file metadata preview (row count, column headers) without full parse - quick feedback without heavy parsing library

4. **Do we need queue monitoring for all workers or just snapshots?**
   - What we know: Codebase has snapshot-worker, morning-report-worker, slack-approval-worker
   - What's unclear: Whether morning-report and slack-approval are admin-relevant or user-facing
   - Recommendation: Start with snapshot queue only (core to app functionality), add others if failure rates warrant monitoring

## Sources

### Primary (HIGH confidence)
- TanStack Table official docs - https://tanstack.com/table/v8/docs/introduction
- shadcn/ui data table guide - https://ui.shadcn.com/docs/components/radix/data-table
- shadcn/ui Next.js installation - https://ui.shadcn.com/docs/installation/next
- bull-board GitHub repository - https://github.com/felixmosh/bull-board
- bull-board Fastify adapter - https://www.npmjs.com/package/@bull-board/fastify
- Next.js authentication guide - https://nextjs.org/docs/app/guides/authentication

### Secondary (MEDIUM confidence)
- Next.js 14 RBAC patterns - https://www.descope.com/blog/post/auth-nextjs14-app-router
- shadcn/ui admin dashboard templates - https://vercel.com/templates/next.js/next-js-and-shadcn-ui-admin-dashboard
- React Hook Form + Zod file upload - https://medium.com/@christianovik009/adding-file-upload-using-react-hook-form-and-zod-using-nextks-f6def5d6881f
- Next.js 15 server actions file upload - https://strapi.io/blog/epic-next-js-15-tutorial-part-5-file-upload-using-server-actions
- System health monitoring patterns - https://middleware.io/blog/server-health-monitoring/

### Tertiary (LOW confidence - verified with cross-references)
- Admin dashboard security pitfalls - https://linuxsecurity.com/features/10-common-security-mistakes-sysadmins-make-how-to-avoid-these-pitfalls
- React data table performance - https://www.syncfusion.com/blogs/post/render-large-datasets-in-react
- Next.js middleware RBAC common issues - https://clerk.com/docs/references/nextjs/basic-rbac

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - TanStack Table and shadcn/ui are well-documented industry standards with official Next.js 14 support
- Architecture: HIGH - Patterns verified from official docs (shadcn/ui, TanStack Table, bull-board examples)
- Pitfalls: MEDIUM - Mix of documented issues (CVE-2025-29927, TanStack discussions) and general security best practices
- BullMQ monitoring: HIGH - bull-board is the official BullMQ dashboard solution with Fastify adapter

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (30 days - stable ecosystem, unlikely to change rapidly)
