---
phase: 73
slug: show-current-and-projected-stats-for-each-player-on-waivers-and-roster-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript type-check (tsc --noEmit) |
| **Config file** | packages/frontend/tsconfig.json, packages/backend/tsconfig.json |
| **Quick run command** | `npx tsc --noEmit -p packages/frontend/tsconfig.json && npx tsc --noEmit -p packages/backend/tsconfig.json` |
| **Full suite command** | `npx tsc --noEmit -p packages/frontend/tsconfig.json && npx tsc --noEmit -p packages/backend/tsconfig.json` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit -p packages/frontend/tsconfig.json`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 73-01-01 | 01 | 1 | Backend: expose current stats | type-check | `npx tsc --noEmit -p packages/backend/tsconfig.json` | ✅ | ⬜ pending |
| 73-01-02 | 01 | 1 | Frontend: render player stats | type-check | `npx tsc --noEmit -p packages/frontend/tsconfig.json` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Player stats render correctly | Visual display | Requires visual inspection | Open waivers page, verify stat columns show for hitters and pitchers |
| Rate stats computed correctly | Formula accuracy | Data-dependent | Compare displayed AVG/ERA with manual calculation from components |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
