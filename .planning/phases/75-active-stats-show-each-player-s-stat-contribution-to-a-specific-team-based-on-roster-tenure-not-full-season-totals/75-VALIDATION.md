---
phase: 75
slug: active-stats-show-each-player-s-stat-contribution-to-a-specific-team-based-on-roster-tenure-not-full-season-totals
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-26
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | packages/backend/vitest.config.ts |
| **Quick run command** | `cd packages/backend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd packages/backend && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/backend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd packages/backend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 75-01-01 | 01 | 1 | ACTIVE-01 | integration | `grep -c "writePlayerPeriodStats" packages/backend/src/agents/snapshot-orchestrator.ts` | ✅ | ⬜ pending |
| 75-01-02 | 01 | 1 | ACTIVE-02, ACTIVE-03 | integration | `grep -c "tenureStats" packages/backend/src/api/recommendations.ts` | ✅ | ⬜ pending |
| 75-02-01 | 02 | 2 | ACTIVE-04, ACTIVE-05, ACTIVE-06 | visual | `grep -c "On Team" packages/frontend/src/components/league/PlayerStatLine.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tenure stats differ from full-season for traded player | ACTIVE-01 | Requires real ESPN data with a mid-season trade | Trigger snapshot, check player_period_stats rows, compare sum vs full-season |
| Rate stats computed correctly from components | ACTIVE-03 | Component math already tested in formulas.ts | Verify PlayerStatLine renders correct AVG/ERA from components |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
