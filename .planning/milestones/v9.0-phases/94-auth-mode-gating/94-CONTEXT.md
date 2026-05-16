# Phase 94: Single-User Mode Explicit Gating — Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Replace the unconditional mock-user bypass in `middleware/auth.ts` with an explicit `SINGLE_USER_MODE=true` environment check. Currently the bypass is always active — there is no way to disable it without editing source code. This makes it impossible to audit which routes lack authorization checks, and prevents testing the real auth path.

The change is additive: when `SINGLE_USER_MODE=true`, behavior is identical to today. When unset, the real JWT path runs. The auth code already exists (JWT validation is implemented) — this phase just gates which path is taken.

</domain>

<decisions>
## Implementation Decisions

### SINGLE_USER_MODE is the gate variable

Consistent with the existing comment "v4.0 single-user mode". Name matches the assessment recommendation.

### Default to real auth when SINGLE_USER_MODE is unset

Fail-secure: missing env var → real auth runs. Explicit opt-in for bypass.

### Document in .env.example and CLAUDE.md

The bypass must be discoverable. Current CLAUDE.md references the bypass in passing but doesn't document the flag.

### Frontend api.ts comment updated

The `// AUTH BYPASSED` comment in api.ts should note the SINGLE_USER_MODE flag for consistency.

</decisions>

<code_context>

## Existing Code Insights

- `packages/backend/src/middleware/auth.ts` — currently injects MOCK_USER unconditionally in `authenticate()`
- `packages/frontend/src/lib/api.ts` — has `// AUTH BYPASSED: Single-user mode (v4.0)` comment only
- No `.env.example` currently documents SINGLE_USER_MODE
- JWT validation code is already in the file (preserved from when auth was real), so re-enabling it is gating not rewriting

</code_context>

<specifics>
## Specific Requirements

1. `middleware/auth.ts`: `authenticate()` checks `process.env.SINGLE_USER_MODE === 'true'` before injecting MOCK_USER — else runs real JWT validation
2. A `.env.example` (or update to existing) documents `SINGLE_USER_MODE=true`
3. CLAUDE.md Known Issues section updated to reflect this is now a named flag
4. TypeScript compile passes

</specifics>

<deferred>
## Deferred

- Multi-user mode activation (just the gating, not the full auth flow)
- `requireLeagueAccess` real implementation (depends on user ownership table being populated)

</deferred>
