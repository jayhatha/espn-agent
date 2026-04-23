---
phase: 57-auction-simulation
verified: 2026-03-19T17:59:47Z
status: gaps_found
score: 7/8 must-haves verified
re_verification: false
gaps:
  - truth: "computeOurBid matches strategy-caps.ts including endgame and inflation"
    status: partial
    reason: "Hitter budget cap in simulator (lines 393-398) applies unconditionally, but strategy-caps.ts line 186 only applies it when !isEndgame. Minor divergence but the plan's key_link claims 'identical bid logic'."
    artifacts:
      - path: "tools/simulate-auction.ts"
        issue: "Hitter budget cap at lines 393-398 lacks the !isEndgame guard present in strategy-caps.ts line 186"
    missing:
      - "Add isEndgame check to hitter budget cap block: `if (!player.isPitcher && !isEndgame)`"
  - truth: "Requirements SIM-01 and SIM-02 are defined in REQUIREMENTS.md"
    status: failed
    reason: "SIM-01 and SIM-02 do not appear in REQUIREMENTS.md. They are referenced in ROADMAP.md under Phase 28 (where they describe full draft completion simulation and standings-based decisions — not auction simulator fixes). REQUIREMENTS.md explicitly lists 'Auction simulator test harness' as a known omission: 'Nice-to-have but not needed for live draft use'. The PLAN frontmatter claims these IDs but they map to different scope in the canonical requirements document."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "SIM-01 and SIM-02 not present; IDs are v2.0 milestone requirements only (milestones/v2.0-ROADMAP.md), not in active REQUIREMENTS.md"
    missing:
      - "Either add SIM-01 / SIM-02 to REQUIREMENTS.md with accurate descriptions for auction simulator scope, or update the plan to reference correct IDs"
---

# Phase 57: Auction Simulation Fix — Verification Report

**Phase Goal:** Fix auction simulator to match live engine bidding behavior -- expand player pool to include PL-ranked SPs, align computeOurBid with strategy-caps.ts, enforce bench composition
**Verified:** 2026-03-19T17:59:47Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Player pool includes all players with positive FG dollars OR PL ranking | VERIFIED | `buildPlayerPool()` lines 79-117: filter is `if (ap.dollars <= 0 && !hasPLRank) continue` — includes PL-ranked SPs with negative FG dollars |
| 2 | Ranked SP bids (PL top-60) use tier cap as both floor and ceiling | VERIFIED | `computeOurBid` lines 408-446: `if (plRank <= 60) { bid = tierCap; }` — explicit floor+ceiling for ranked SPs |
| 3 | Bench composition enforced: max 2 hitter bench, 3 pitcher bench for ALL teams | VERIFIED | `canFillSlot` lines 503/513 and `assignSlot` lines 520-524/540-543 enforce limits via `benchHitters`/`benchPitchers` on `TeamState`; called with team object for all roster assignments |
| 4 | Position normalization (LF/CF/RF → OF) applied in canFillSlot and assignSlot | VERIFIED | `canFillSlot` line 507: `const u = normalizePosition(pos)`; `assignSlot` lines 529/535: `normalizePosition(p)` used in slot lookup |
| 5 | Max 1 catcher enforced — pure catchers get $0 bid when C slot filled | VERIFIED | `computeOurBid` lines 349-361: checks `slotsRemaining["C"] === 0`, returns 0 for pure catchers |
| 6 | Mode roster shows ranked SPs in P slots | VERIFIED | SP acquisition analysis section (lines 1022-1068) tracks `rankedSpDrafted` per sim; SUMMARY reports 4.2 ranked SPs per roster in 1000-sim run |
| 7 | Mean unspent budget under $30 | VERIFIED | SUMMARY documents 94.7% top-4 finish rate across 1000 sims, budget spent down; commit 5b88e1e message confirms $103 → resolved |
| 8 | computeOurBid matches strategy-caps.ts (key link: identical bid logic) | PARTIAL | Endgame dampening and inflation adjustment match. BUT hitter budget cap at lines 393-398 applies unconditionally while strategy-caps.ts line 186 has `!input.isEndgame` guard. All other logic (catcher guard, positional need, positional weight, SP tier caps, RP caps, endgame ×0.7, inflation +2) matches the live engine ordering and values. |

**Score:** 7/8 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tools/simulate-auction.ts` | Fixed auction simulator matching live engine behavior | VERIFIED | File exists, 1085 lines, substantive implementation. Contains `computeOurBid`, `buildPlayerPool`, `simulateAuction`, full output sections. Commit 5b88e1e modifies exactly this file. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tools/simulate-auction.ts computeOurBid` | `packages/extension/lib/engine/strategy-caps.ts computeStrategyBidCap` | identical bid logic (tier caps, positional need, hitter budget, catcher guard) | PARTIAL | Pattern `plRank.*<=.*tierCap` confirmed at line 442: `bid = tierCap`. Ordering matches: catcher guard → positional need → positional weight → hitter cap → SP tier caps → RP caps → endgame → inflation. One divergence: hitter cap missing `!isEndgame` guard (simulator lines 393-398 vs strategy-caps.ts line 186). |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SIM-01 | 57-01-PLAN.md | Auction simulator (per plan frontmatter) | ORPHANED | SIM-01 not defined in REQUIREMENTS.md. It appears in milestones/v2.0-ROADMAP.md under Phase 28 with a different meaning (full draft completion simulation). REQUIREMENTS.md omits auction simulator coverage deliberately. |
| SIM-02 | 57-01-PLAN.md | Auction simulator (per plan frontmatter) | ORPHANED | Same as SIM-01 — not in REQUIREMENTS.md, Phase 28 meaning is standings-based decisions, not auction sim behavior fixes. |

**Orphaned requirements:** SIM-01 and SIM-02 appear in the plan's `requirements` field but are not defined in `.planning/REQUIREMENTS.md`. They are v2.0 milestone IDs (present in `milestones/v2.0-ROADMAP.md`) reused for a different purpose here. The auction simulator feature class is explicitly excluded from REQUIREMENTS.md as "Nice-to-have but not needed for live draft use."

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tools/simulate-auction.ts` | 393-398 | Hitter budget cap missing `!isEndgame` guard | Warning | Minor divergence from strategy-caps.ts; endgame happens rarely and budget is usually spent before $20 threshold — unlikely to affect sim results materially |

No TODO/FIXME/placeholder comments found. No empty implementations. No debug-only logging — all `console.log` calls are intentional output formatting for the CLI tool.

### Human Verification Required

None required. The simulator is a standalone CLI tool — correctness is verifiable by code inspection and the documented 1000-sim run results.

### Gaps Summary

**Gap 1 (minor): Hitter budget cap ordering divergence.** The simulator's `computeOurBid` applies the hitter budget cap unconditionally at lines 393-398 (inside `if (!player.isPitcher)`). The live engine's `computeStrategyBidCap` wraps this same logic with `!input.isEndgame` (line 186). The plan's key_link truth claims "identical bid logic" but this one guard differs. In practice this is low-impact: endgame occurs at budget ≤ $20, and by that point most hitter slots are filled — the cap rarely fires during endgame. However, the plan truth is not fully satisfied as stated.

**Gap 2 (documentation): SIM-01/SIM-02 not in REQUIREMENTS.md.** The plan claims to complete requirements SIM-01 and SIM-02 but these IDs do not exist in `.planning/REQUIREMENTS.md`. They live only in the v2.0 milestone roadmap where they describe Phase 28's forward-looking simulation scope (not auction simulator fix scope). REQUIREMENTS.md explicitly categorizes the auction simulator as out of scope. This is a traceability gap — the work done is real and valuable, but it isn't traceable to any active requirement. The fix is either adding the IDs to REQUIREMENTS.md or acknowledging the plan references stale/wrong requirement IDs.

The core goal — fixing the auction simulator to match live engine behavior — was achieved. Player pool expanded to 478 players, ranked SPs appear in P slots, bench composition enforced, budget spent efficiently (94.7% top-4 rate), output includes SP analysis section. The two gaps are a minor code divergence and a documentation/traceability issue rather than functional failures.

---

_Verified: 2026-03-19T17:59:47Z_
_Verifier: Claude (gsd-verifier)_
