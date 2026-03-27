---
phase: 77
slug: sp-sit-start-recommendations-from-pitcherlist-and-rotoballer-scrape-weekly-rankings-match-to-rostered-sps-display-start-sit-verdict-with-source-links
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.1.1 (backend) |
| **Config file** | packages/backend/vitest.config.ts |
| **Quick run command** | `pnpm --filter backend test -- --run src/adapters/__tests__/pitcherlist.test.ts` |
| **Full suite command** | `pnpm --filter backend test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run relevant test file via `pnpm --filter backend test -- --run <path>`
- **After every plan wave:** Run `pnpm --filter backend test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 1 | SITSTART-01 Pitcherlist + SITSTART-02 Rotoballer | unit | `pnpm --filter backend test -- --run src/adapters/__tests__/pitcherlist.test.ts` | ❌ W0 | ⬜ pending |
| 77-01-01 | 01 | 1 | SITSTART-02 Rotoballer degradation | unit | `pnpm --filter backend test -- --run src/adapters/__tests__/rotoballer.test.ts` | ❌ W0 | ⬜ pending |
| 77-01-02 | 01 | 1 | SITSTART-03 Name matching + SITSTART-04 API | unit | `pnpm --filter backend test -- --run src/agents/__tests__/sit-start-advisor.test.ts` | ❌ W0 | ⬜ pending |
| 77-02-01 | 02 | 2 | SITSTART-05 Frontend tab | manual | Browser check — TypeScript compilation gate | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/backend/src/adapters/__tests__/pitcherlist.test.ts` — stubs for Pitcherlist parsing
- [ ] `packages/backend/src/adapters/__tests__/rotoballer.test.ts` — stubs for Rotoballer graceful degradation
- [ ] `packages/backend/src/agents/__tests__/sit-start-advisor.test.ts` — stubs for name matching + verdict merging
- [ ] `pnpm --filter backend add cheerio` — cheerio needed for HTML parsing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend sit/start tab renders | SITSTART-05 | Visual check | Navigate to pitching usage page, verify 4th tab shows sit/start verdicts |
| Source links open correctly | SITSTART-05 | External URL | Click Pitcherlist/Rotoballer source links, verify they open correct articles |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
