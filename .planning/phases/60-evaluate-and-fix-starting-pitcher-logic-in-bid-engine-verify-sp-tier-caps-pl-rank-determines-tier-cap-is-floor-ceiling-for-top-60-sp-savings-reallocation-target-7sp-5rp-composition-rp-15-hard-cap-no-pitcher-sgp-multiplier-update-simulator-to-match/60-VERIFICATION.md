---
phase: 60-sp-logic
verified: 2026-03-19T20:20:00Z
status: human_needed
score: 13/13 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 11/13
  gaps_closed:
    - "Ranked SP (top 60) tier cap is floor AND ceiling — endgame cannot violate it"
    - "Requirement IDs SP-TIER, SP-SAVINGS, SP-COMP, RP-CAP, PITCHER-SGP, HIT-PITCH-CONFLICT are tracked in REQUIREMENTS.md"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run npx tsx tools/simulate-auction.ts --sims 200 from repo root"
    expected: "Summary prints avg SP count ~7, avg RP count ~5, budget split ~77/23, no runtime errors"
    why_human: "Requires tsx runtime and live FanGraphs asset JSON files — cannot confirm without execution"
---

# Phase 60: SP Logic Fix Verification Report

**Phase Goal:** Fix SP savings reallocation bug (slot-position ideal vs per-SP rank-based tier caps), verify all SP/RP rules, add 7SP+5RP composition targeting, audit pitching-vs-hitting conflicts
**Verified:** 2026-03-19T20:20:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (60-03-PLAN.md / 60-03-SUMMARY.md)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | SP tier cap is determined by PitcherList rank, not draft order | VERIFIED | `getRankBasedTierCap()` in draft-constants.ts; used at strategy-caps.ts L239 |
| 2 | Ranked SPs (top 60) use tier cap as both floor AND ceiling | VERIFIED | L279-283 sets `bidCap = tierCap` (floor+ceiling); L322-326 re-enforces after endgame dampening with `spCount < 7` guard |
| 3 | SP savings reallocation uses each drafted SP's rank-based tier cap, not slot-position ideal | VERIFIED | strategy-caps.ts L293: `input.draftedSpTierCaps?.[s] ?? getSpTierCap(s)` — uses per-SP caps |
| 4 | RP hard cap is $15 even with SP savings | VERIFIED | strategy-caps.ts L289 `RP_MAX_BID = 15`; L307-310 hard cap enforced; test 5 confirms |
| 5 | No pitcher SGP multiplier exists anywhere in the bid pipeline | VERIFIED | No `pitcherMultiplier` in strategy-caps.ts; test 9 explicitly verifies |
| 6 | SP savings reallocation produces correct results for out-of-order drafting | VERIFIED | Tests 1-3 (out-of-order SP4 before SP1, normal savings, zero savings) all pass |
| 7 | Current-player tierCap uses externalRank via getRankBasedTierCap, not spCount via getSpTierCap | VERIFIED | strategy-caps.ts L239: `tierCap = getRankBasedTierCap(rank)`; test 10 verifies PL#28 with 3 SP4-tier drafted gets $12 not $5 |
| 8 | draftedSpTierCaps wired from use-draft-engine.ts through to computeStrategyBidCap | VERIFIED | use-draft-engine.ts L139-142 builds `draftedSpTierCaps`; L152 passes it |
| 9 | Simulator SP savings uses per-SP rank-based tier caps, matching engine | VERIFIED | simulate-auction.ts L459: `team.spTierCaps[s] ?? getSpTierCap(s)` mirrors engine |
| 10 | Simulator targets 7SP+5RP composition | VERIFIED | simulate-auction.ts L480: `if (team.rpCount >= 5) return 0`; summary prints avg SP/RP counts |
| 11 | Pitching vs hitting conflicts are identified with recommendations | VERIFIED | 60-02-SUMMARY.md contains 5 analyzed conflicts with specific recommendations |
| 12 | Ranked SP tier floor respected in engine under endgame conditions | VERIFIED | strategy-caps.ts L318-326: re-enforce guard after endgame block; 31/31 tests pass including new endgame test at L701 |
| 13 | Requirement IDs SP-TIER, SP-SAVINGS, SP-COMP, RP-CAP, PITCHER-SGP, HIT-PITCH-CONFLICT exist in REQUIREMENTS.md | VERIFIED | REQUIREMENTS.md L29-34 defines all 6 IDs with descriptions; L91-96 adds traceability table entries (Phase 60, Complete) |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/extension/lib/engine/draft-constants.ts` | `getRankBasedTierCap` helper | VERIFIED | Implemented with correct tier breakpoints (1-20→$18, 21-30→$12, 31-40→$10, 41-60→$5, 61+→$3) |
| `packages/extension/lib/engine/strategy-caps.ts` | SP savings fix + rank-based tierCap + endgame floor guard + `draftedSpTierCaps` field | VERIFIED | L239 uses `getRankBasedTierCap(rank)`, L293 uses `draftedSpTierCaps`, L318-326 re-enforces floor after endgame |
| `packages/extension/lib/use-draft-engine.ts` | Passes `draftedSpTierCaps` to `computeStrategyBidCap` | VERIFIED | L139-142 builds and L152 passes `draftedSpTierCaps` |
| `packages/extension/lib/engine/__tests__/bid-ceiling.test.ts` | 10+ SP/RP rule tests + 2 endgame floor tests | VERIFIED | 31 tests total, all pass — includes endgame floor tests at L701 and L718 |
| `tools/simulate-auction.ts` | Fixed SP savings + rank-based tierCap + 7SP+5RP + SP/RP count output | VERIFIED | `spTierCaps`, `rpCount`, `getRankBasedTierCap` inlined, summary output present |
| `.planning/REQUIREMENTS.md` | Phase-60 requirement ID definitions with traceability | VERIFIED | L29-34 definitions, L91-96 traceability table entries |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `use-draft-engine.ts` | `strategy-caps.ts` | `draftedSpTierCaps` param | WIRED | L152 passes `draftedSpTierCaps`; `getRankBasedTierCap` imported at L7 |
| `strategy-caps.ts` | `draft-constants.ts` | `getRankBasedTierCap` | WIRED | L17 imports; L239 uses for current-player tierCap; L323 uses for endgame re-enforce guard |
| `simulate-auction.ts` | engine SP savings logic | mirrored `spTierCaps` | WIRED | `spTierCaps[s] ?? getSpTierCap(s)` at L459 mirrors engine exactly |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| SP-TIER | 60-01-PLAN.md | SP tier cap from PitcherList rank | SATISFIED | `getRankBasedTierCap` in draft-constants.ts; REQUIREMENTS.md L29 |
| SP-SAVINGS | 60-01-PLAN.md, 60-02-PLAN.md | Rank-based per-SP savings reallocation | SATISFIED | `draftedSpTierCaps` in strategy-caps.ts L293; REQUIREMENTS.md L30 |
| SP-COMP | 60-01-PLAN.md, 60-02-PLAN.md | 7SP+5RP composition targeting | SATISFIED | Simulator `rpCount` guard + engine `spCount >= 7` $3 cap; REQUIREMENTS.md L31 |
| RP-CAP | 60-01-PLAN.md | RP hard cap $15 | SATISFIED | `RP_MAX_BID = 15` hard enforced at L307-310; REQUIREMENTS.md L32 |
| PITCHER-SGP | 60-01-PLAN.md | No pitcher SGP multiplier | SATISFIED | No `pitcherMultiplier` in pipeline; REQUIREMENTS.md L33 |
| HIT-PITCH-CONFLICT | 60-02-PLAN.md | Conflict audit documented | SATISFIED | 5 conflicts in 60-02-SUMMARY.md; REQUIREMENTS.md L34 |
| POS-02 (tracked) | — | SP tier caps enforced | SATISFIED | Ranked SP tier floor re-enforced after endgame dampening — floor violation closed by 60-03 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `strategy-caps.ts` | 10 | Module comment says "pitcher dampening" — ambiguous but refers to catcher/need chain, not removed pitcherMultiplier | Info | No functional impact; not blocking |

### Human Verification Required

#### 1. Simulator composition output

**Test:** Run `npx tsx tools/simulate-auction.ts --sims 200` from the repo root
**Expected:** Summary prints `Avg SP count (ranked top-60 PL): 7.0` and `Avg RP count: 5.0` with no runtime errors; budget split shows hitters ~76-78%, pitchers ~22-24%
**Why human:** Requires tsx runtime, FanGraphs asset JSON files in packages/extension/assets, and live execution — cannot confirm without running the process

### Re-verification Gap Summary

**Gap 1 (CLOSED): Engine endgame dampening violated ranked SP tier floor**

Fixed in 60-03. strategy-caps.ts L318-326 now re-enforces the ranked SP tier floor immediately after the endgame dampening block. A PL#25 SP (floor $12) in endgame mode stays at $12 instead of being reduced to ceil(12×0.7)=$9. The guard includes `spCount < 7` to preserve the full-roster $3 cap path. Two tests at L701 and L718 in bid-ceiling.test.ts prove correctness. All 31 tests pass.

**Gap 2 (CLOSED): Phantom requirement IDs in plan frontmatter**

Fixed in 60-03. REQUIREMENTS.md L29-34 now defines all six phase-60 IDs (SP-TIER, SP-SAVINGS, SP-COMP, RP-CAP, PITCHER-SGP, HIT-PITCH-CONFLICT) with descriptions. L91-96 adds traceability table entries mapping each ID to Phase 60 with status Complete.

---

_Verified: 2026-03-19T20:20:00Z_
_Verifier: Claude (gsd-verifier)_
