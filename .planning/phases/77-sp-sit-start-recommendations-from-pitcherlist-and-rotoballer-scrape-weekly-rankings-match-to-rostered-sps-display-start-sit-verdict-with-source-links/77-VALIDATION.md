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
| **Framework** | jest 29.x (backend) / vitest (frontend) |
| **Config file** | packages/backend/jest.config.ts |
| **Quick run command** | `pnpm --filter backend test -- --testPathPattern sit-start` |
| **Full suite command** | `pnpm --filter backend test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter backend test -- --testPathPattern sit-start`
- **After every plan wave:** Run `pnpm --filter backend test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 77-01-01 | 01 | 1 | Pitcherlist scraping | unit | `pnpm --filter backend test -- --testPathPattern pitcherlist` | ❌ W0 | ⬜ pending |
| 77-01-02 | 01 | 1 | Rotoballer scraping | unit | `pnpm --filter backend test -- --testPathPattern rotoballer` | ❌ W0 | ⬜ pending |
| 77-02-01 | 02 | 2 | Sit/start advisor agent | unit | `pnpm --filter backend test -- --testPathPattern sit-start` | ❌ W0 | ⬜ pending |
| 77-03-01 | 03 | 3 | API endpoint | integration | `pnpm --filter backend test -- --testPathPattern sit-start-api` | ❌ W0 | ⬜ pending |
| 77-04-01 | 04 | 4 | Frontend tab | manual | Browser check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/backend/src/__tests__/pitcherlist-adapter.test.ts` — stubs for Pitcherlist scraping
- [ ] `packages/backend/src/__tests__/rotoballer-adapter.test.ts` — stubs for Rotoballer scraping
- [ ] `packages/backend/src/__tests__/sit-start-advisor.test.ts` — stubs for advisor agent
- [ ] `pnpm --filter backend add -D cheerio` — cheerio needed for HTML parsing

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontend sit/start tab renders | UI display | Visual check | Navigate to pitching usage page, verify 4th tab shows sit/start verdicts |
| Source links open correctly | Link accuracy | External URL | Click Pitcherlist/Rotoballer source links, verify they open correct articles |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
