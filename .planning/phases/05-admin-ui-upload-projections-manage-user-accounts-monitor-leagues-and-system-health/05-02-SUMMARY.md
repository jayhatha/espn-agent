---
phase: 05-admin-ui
plan: 02
subsystem: frontend-admin-ui
tags:
  - admin
  - ui
  - user-management
  - system-health
  - projections
dependency_graph:
  requires:
    - admin-api-backend
    - auth-context
    - stat-card-component
  provides:
    - admin-dashboard-ui
    - user-role-management-ui
    - batch-upload-ui
    - league-health-ui
  affects:
    - admin-workflow
tech_stack:
  added:
    - none
  patterns:
    - multi-section-dashboard
    - dual-file-upload
    - role-toggle-ui
    - real-time-stats-polling
key_files:
  created:
    - none
  modified:
    - packages/frontend/src/lib/api.ts
    - packages/frontend/src/app/admin/page.tsx
decisions:
  - Remove redundant admin check in AdminPageContent (AdminRoute wrapper already handles this)
  - Use useAuth hook from AuthContext to get current user for self-role-toggle protection
  - Poll system stats every 30 seconds for near-real-time KPI updates
  - Dual drop zones submit together in single batch upload request
  - Show degraded reasons inline below status badge in league health table
metrics:
  duration: 2min
  completed: 2026-02-20
---

# Phase 05 Plan 02: Admin Dashboard UI Summary

**Enhanced admin dashboard with system health KPIs, user management, batch projections upload, and league health monitoring.**

## What Was Built

Transformed the basic admin page (single-file CSV upload + history) into a comprehensive admin dashboard with 4 major sections:

### 1. System Health KPIs

- **4 StatCard components** in responsive grid layout (1/2/4 columns)
- **Total Users** - Count from `api.getAdminStats()`
- **Active Leagues** - Count from stats endpoint
- **Snapshot Health** - Success rate percentage with "X of Y healthy (7d)" subtitle
- **Latest Projections** - Date with staleness indicator (fresh/stale/very stale)
- **Auto-refresh** - 30-second polling interval for near-real-time updates

### 2. User Management

- **User table** with 6 columns: Email, Display Name, Role, Joined, Last Login, Actions
- **Role badges** - Purple for admin, gray for user
- **Role toggle buttons** - "Make Admin" / "Remove Admin" per user
- **Self-protection** - Disable toggle for current user with tooltip "Cannot change own role"
- **Confirmation** - `window.confirm()` before role change
- **Date formatting** - `toLocaleDateString()` for dates, "Never" for null last_login_at
- **Mutation** - `useMutation` with `api.updateUserRole()`, invalidates users query on success
- **Loading/empty states** - Spinner during fetch, "No users found" message

### 3. Upload Projections (Enhanced)

- **Dual drop zones** in 2-column grid (side-by-side on desktop, stacked on mobile)
  - Left: "Batters CSV" with drag/drop or click-to-browse
  - Right: "Pitchers CSV" with same pattern
- **Independent file state** - `batterFile` and `pitcherFile` tracked separately
- **Single upload button** - Enabled when at least one file selected
- **Batch endpoint** - POST to `/api/projections/upload-batch` with FormData
- **Success/error messages** - Green banner for success, red banner for errors
- **FanGraphs instructions** - Kept existing blue info box with links
- **Upload history** - Kept existing table below instructions

### 4. League Health

- **League table** with 4 columns: League Name, ESPN ID, Latest Snapshot, Status
- **Status badges** - Green (healthy), yellow (degraded), red (no_snapshot)
- **Degraded reasons** - Small gray text below badge when `is_degraded === true`
- **Date formatting** - `toLocaleDateString()` for snapshot, "Never" if null
- **Loading/empty states** - Spinner and "No leagues found" message

### Code Quality Improvements

- **Removed redundant admin check** - AdminPageContent no longer duplicates `isAdmin` check (AdminRoute already handles this)
- **Removed unused imports** - Dropped `useRouter` (not needed after removing redundant check)
- **Reused existing components** - StatCard from ui components, AdminRoute wrapper pattern
- **Consistent styling** - Followed existing Tailwind patterns (card sections, tables, badges, buttons)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. **TypeScript compilation:** ✓ PASSED - No errors in frontend
2. **api.ts has 4 admin methods:** ✓ PASSED - getAdminStats, getAdminUsers, updateUserRole, getAdminLeagues
3. **Admin page imports StatCard:** ✓ PASSED - Used 5 times (1 import + 4 instances)
4. **User table with role toggle:** ✓ PASSED - Table with "Make Admin" / "Remove Admin" buttons
5. **Two drop zones:** ✓ PASSED - Batter and pitcher drop zones with single upload button
6. **League health table:** ✓ PASSED - Table with status badges and degraded reasons
7. **No new dependencies:** ✓ PASSED - No npm installs

## Files Changed

### Created
- None

### Modified
- `packages/frontend/src/lib/api.ts` (+20 lines) - Add 4 admin API methods
- `packages/frontend/src/app/admin/page.tsx` (+451 insertions, -172 deletions) - Complete dashboard rewrite

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1    | 73a99e5 | feat(05-02): add admin API methods to frontend client |
| 2    | fc5d314 | feat(05-02): enhance admin dashboard with KPIs, user management, and league health |

## Success Criteria

- [x] Frontend compiles with zero TypeScript errors
- [x] Admin page renders 4 sections: KPIs, Users, Upload, League Health
- [x] User role toggle sends PATCH request and refreshes user list on success
- [x] Upload flow supports two files (batter + pitcher) in single submission
- [x] All data fetched via TanStack Query with proper loading/error states
- [x] Existing Tailwind styling patterns used throughout (no new libraries)
- [x] StatCard component reused from existing UI components

## Next Steps

Phase 05 complete! Admin UI fully functional. All v1 requirements satisfied.

---

## Self-Check: PASSED

**Modified files verification:**
- packages/frontend/src/lib/api.ts: FOUND ✓
- packages/frontend/src/app/admin/page.tsx: FOUND ✓

**Commits verification:**
- 73a99e5: FOUND ✓
- fc5d314: FOUND ✓

All claimed files and commits exist.
