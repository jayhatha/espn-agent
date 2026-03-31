---
phase: 80
slug: standings-swing-attribution-surface-why-projected-standings-changed-between-snapshots
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^1.1.1 |
| **Config file** | `packages/backend/vitest.config.ts` |
| **Quick run command** | `pnpm --filter backend test --run` |
| **Full suite command** | `pnpm --filter backend test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter backend test --run`
- **After every plan wave:** Run `pnpm --filter backend test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 80-01-01 | 01 | 1 | Three-bucket attribution sums to total delta | unit | `pnpm --filter backend test --run` | ❌ W0 | ⬜ pending |
| 80-01-02 | 01 | 1 | actual_performance = currActuals - prevActuals roto delta | unit | `pnpm --filter backend test --run` | ❌ W0 | ⬜ pending |
| 80-01-03 | 01 | 1 | projection_change = 0 when same projections_run_id | unit | `pnpm --filter backend test --run` | ❌ W0 | ⬜ pending |
| 80-01-04 | 01 | 1 | competitor_movement detected when absolute flat, rank changes | unit | `pnpm --filter backend test --run` | ❌ W0 | ⬜ pending |
| 80-01-05 | 01 | 1 | attribution_available = false when no previous snapshot | unit | `pnpm --filter backend test --run` | ❌ W0 | ⬜ pending |
| 80-01-06 | 01 | 1 | LOWER_BETTER category (ERA) directions handled correctly | unit | `pnpm --filter backend test --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/backend/src/agents/__tests__/standings-swing-attribution.test.ts` — stubs for all attribution behaviors

*Existing infrastructure covers framework and config requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend "What Changed?" panel renders correctly | UI display | Visual verification | Navigate to projected standings, verify attribution panel shows with correct bucket breakdown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
