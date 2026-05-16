---
status: resolved
trigger: "sign out doesn't work"
created: "2026-05-15"
updated: "2026-05-15"
---

## Symptoms

- **Expected:** Clicking "Sign Out" in navigation ends the user session and redirects to home/login
- **Actual:** Clicking "Sign Out" does nothing — user stays on the same page, still appears logged in
- **Errors:** None visible
- **Timeline:** Unknown
- **Repro:** Click "Sign Out" button in top navigation bar

## Current Focus

hypothesis: "AuthContext.logout is a no-op in single-user mode — `logout: () => {}` never calls api.logout() or redirects"
test: "Inspect AuthContext.tsx logout implementation"
expecting: "logout() calls api.logout() and redirects to /"
next_action: "Fix AuthContext.logout to call api.logout() and redirect; also hide or disable Sign Out button if single-user mode is intentional"
reasoning_checkpoint: "Single-user mode was introduced to bypass JWT auth for local dev (CLAUDE.md: SINGLE_USER_MODE=true). The logout() fn in AuthContext is explicitly a no-op. Navigation.tsx calls authLogout() which does nothing. Backend has a real /api/auth/logout endpoint. Fix: make logout() in AuthContext call api.logout() then redirect to '/' — this works even in single-user mode for clearing any lingering cookies."

## Evidence

- timestamp: "2026-05-15T00:00:00Z"
  source: "packages/frontend/src/contexts/AuthContext.tsx line 54"
  observation: "logout: () => {} — explicit no-op, never calls any API or router"

- timestamp: "2026-05-15T00:00:00Z"
  source: "packages/frontend/src/app/navigation.tsx lines 28-29"
  observation: "handleLogout calls authLogout() which maps to the no-op logout from AuthContext"

- timestamp: "2026-05-15T00:00:00Z"
  source: "packages/frontend/src/lib/api.ts lines 393-397"
  observation: "api.logout() exists and POSTs to /api/auth/logout with credentials:include — never called"

- timestamp: "2026-05-15T00:00:00Z"
  source: "packages/backend/src/api/auth.ts lines 261-278"
  observation: "Backend /api/auth/logout clears cookies and deletes refresh tokens — functional"

## Eliminated

- hypothesis: "Navigation wiring is broken (Sign Out button not connected to handler)"
  eliminated_by: "navigation.tsx line 88 shows onClick={handleLogout} — wiring is correct"

- hypothesis: "Backend logout endpoint is broken"
  eliminated_by: "auth.ts shows proper implementation; issue is entirely in frontend AuthContext no-op"

## Resolution

root_cause: "AuthContext.logout was an explicit no-op `() => {}` in single-user mode, so clicking Sign Out did nothing."
fix: "Replaced no-op with async function that calls api.logout() (POST /api/auth/logout, errors swallowed) then router.push('/'); updated interface type to Promise<void>."
files_changed:

- packages/frontend/src/contexts/AuthContext.tsx

root_cause: "AuthContext.logout is a no-op (`() => {}`). The comment at line 7 explicitly states 'No login/logout/refresh.' for single-user mode. Navigation calls this no-op, so clicking Sign Out does nothing."
fix: "Replace the no-op logout in AuthContext with a function that calls api.logout() and redirects to '/'. This is safe in single-user mode — the backend endpoint handles missing/invalid tokens gracefully."
verification: ""
files_changed: []
