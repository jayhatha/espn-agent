# Phase 94 Verification: Single-User Mode Explicit Gating

## Status: passed

## Must-Haves Checklist

- [x] `middleware/auth.ts`: `authenticate()` checks `process.env.SINGLE_USER_MODE === 'true'` before injecting mock user — else calls `request.jwtVerify()` and returns 401 on failure
- [x] When `SINGLE_USER_MODE` is not set, `authenticate()` runs real JWT verification
- [x] `packages/backend/.env.example` documents `SINGLE_USER_MODE=true` with explanation
- [x] `packages/frontend/src/lib/api.ts` comment updated to reference backend SINGLE_USER_MODE flag
- [x] `CLAUDE.md` Auth Mode section updated: documents the flag, how to enable multi-user mode
- [x] `npx tsc --noEmit` passes with 0 errors in `packages/backend`

## Files Changed

| File                                      | Change                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/backend/src/middleware/auth.ts` | `authenticate()` gated behind `SINGLE_USER_MODE === 'true'`; real JWT path (`request.jwtVerify()`) runs otherwise |
| `packages/backend/.env.example`           | Added `SINGLE_USER_MODE=true` with description                                                                    |
| `packages/frontend/src/lib/api.ts`        | Updated comment to reference backend flag                                                                         |
| `CLAUDE.md`                               | Updated Auth Mode section; added flag documentation                                                               |

## Behavioral Change

**Before:** Mock user always injected. No env var could disable it without code changes.

**After:** `SINGLE_USER_MODE=true` → mock user (identical to before). `SINGLE_USER_MODE` unset or falsy → real JWT verification, 401 on failure.

Local dev with existing `.env` containing `SINGLE_USER_MODE=true` is unaffected.
