---
phase: 88
phase_name: "CLAUDE.md and AGENTS.md Accuracy Refresh"
project: "ESPN Fantasy Baseball Command Center"
generated: "2026-05-05T00:00:00.000Z"
counts:
  decisions: 3
  lessons: 4
  patterns: 3
  surprises: 2
missing_artifacts:
  - "88-01-SUMMARY.md"
  - "88-01-VERIFICATION.md"
  - "88-01-UAT.md"
---

# Phase 88 Learnings: CLAUDE.md and AGENTS.md Accuracy Refresh

## Decisions

### Verify against code before removing any known-issue entry

Rather than trusting prior session notes or commit messages, each CLAUDE.md known-issue entry was verified by reading the actual source file before being removed. Items with ambiguous evidence (e.g., "this was fixed in v3.0") were re-read to confirm before deletion.

**Rationale:** Documentation rot is compounding — every stale entry that survives becomes evidence that future entries can also survive without verification. Zero-tolerance policy requires code proof.
**Source:** 88-01-PLAN.md (Findings Per Item table)

---

### Retain partial-fix items with explicit scope annotation

Item #4 (shared frontend components / design system) was retained in Known Issues as "PARTIAL" rather than removed. Components exist but there are no design-system tokens, no Storybook catalog, and no semantic spacing scale. Removing it entirely would misrepresent state.

**Rationale:** A partial fix is still debt. The distinction between "done" and "partially done" matters for planning future milestones.
**Source:** 88-01-PLAN.md

---

### AGENTS.md known-gaps sections are authoritative per-agent; CLAUDE.md is the summary

When the two documents diverged (e.g., AGENTS.md still listed "free agents always empty" for ESPNAdapter while CLAUDE.md had already been updated elsewhere), AGENTS.md was treated as the ground truth per-agent and updated to match the code, not the other way around.

**Rationale:** AGENTS.md is consumed by agent implementations; CLAUDE.md is consumed by humans. Agent-level accuracy is higher priority.
**Source:** 88-01-PLAN.md (Changes Made → docs/AGENTS.md)

---

## Lessons

### 10 of 12 known issues were already fixed — tech debt docs age faster than the code

By the time phase 88 ran, 10 of 12 tracked known issues had been resolved across v1.0–v6.0 but the document still listed all 12. The gap between "fixed in code" and "removed from docs" was 3-6 months.

**Context:** Every milestone's PR descriptions and PLAN.md files noted fixes, but no one looped back to update CLAUDE.md's Known Issues section. Documentation updates need to be part of every phase's definition of done, not deferred.
**Source:** 88-01-PLAN.md (Findings Per Item table)

---

### CLAUDE.md's "Implemented Agents" section was more stale than "Known Issues"

The Known Issues section was at least tracking the right categories. The "Implemented Agents" section still listed `PlayerIdentityResolutionAgent` as "currently disconnected from ingest flow" and `WaiverRecommendationAgent` as having an empty free-agent pool — both fixed in prior milestones with no doc update.

**Context:** Prose descriptions of agent behavior are harder to keep current than bullet-point issue lists. Any field that describes runtime behavior ("Currently disconnected") will drift unless tied to a verification step.
**Source:** 88-01-PLAN.md; cross-referenced against packages/backend/src/agents/projections-ingest.ts lines 6, 86, 92

---

### Chrome Extension DOM selector status was not trackable from the backend codebase alone

Item #11 (DOM selectors as placeholders) could only be verified by reading `packages/extension/lib/dom-observers.ts` directly. There was no indicator in CLAUDE.md or AGENTS.md pointing to where DOM selector verification evidence would live.

**Context:** Extension-specific implementation details (selectors, detection logic) need a dedicated reference path in CLAUDE.md so future audits know where to look without a full codebase grep.
**Source:** 88-01-PLAN.md

---

### Phase 87's BullMQ deduplication partially addressed the SnapshotOrchestratorAgent "no job lock" gap

After Phase 87 landed, the AGENTS.md gap "no distributed job lock" in SnapshotOrchestratorAgent was only partially true: manual triggers now deduplicate via BullMQ, but the orchestrator itself has no internal lock. The gap description was updated to be precise rather than simply removed.

**Context:** Infrastructure-level fixes (queue dedup) and application-level fixes (internal mutex) are different. A queue dedup prevents duplicate jobs from entering; an internal lock prevents a running job from being interrupted by a second one that slipped through (e.g., different queue, direct call). The orchestrator still has no internal lock.
**Source:** 88-01-PLAN.md; 87-01-PLAN.md

---

## Patterns

### Evidence-first documentation audit

For each known-issue entry: locate the specific file and line that implements the fix (or absence thereof) before updating the entry. Never rely on milestone summaries or commit messages alone.

```
For each known issue:
  1. Identify the component claimed to be fixed
  2. grep / read the source file
  3. Confirm fix exists OR confirm it doesn't
  4. Update doc to match reality
  5. Cite the file+line as evidence in the PLAN.md findings table
```

**When to use:** Any documentation accuracy audit, post-milestone cleanup, or onboarding doc refresh.
**Source:** 88-01-PLAN.md (Findings Per Item table pattern)

---

### Tiered known-issue states: FIXED / PARTIAL / OPEN

Rather than binary fixed/not-fixed, using three states captures nuance:
- **FIXED** — fully resolved; remove from Known Issues
- **PARTIAL** — addressed but not complete; retain with updated scope description
- **OPEN** — unchanged; retain as-is

**When to use:** Any time a backlog or known-issue list is being trimmed. Prevents both over-claiming (removing PARTIAL as if FIXED) and under-trimming (keeping FIXED items because "it might not be fully done").
**Source:** 88-01-PLAN.md (Item #4 treatment)

---

### Cross-phase artifact chain for verification

Phase 88 directly depended on Phase 87's PLAN.md to accurately describe what the BullMQ change did and didn't fix. Reading the prior phase artifact before updating shared docs prevented a false "fixed" claim on the orchestrator job-lock gap.

**When to use:** Any documentation phase that follows an implementation phase — always read the implementation phase's PLAN.md before writing the docs update.
**Source:** 88-01-PLAN.md; 87-01-PLAN.md

---

## Surprises

### CLAUDE.md's "Implemented Agents" block was a near-verbatim copy of an earlier design doc

The agent descriptions in CLAUDE.md had barely changed since the v1.0 design phase. Fields like "Known gaps" read as design-phase intent rather than post-implementation reality. Several gaps listed had been the original design todos, not actual runtime observations.

**Impact:** Future engineers reading CLAUDE.md would have a significantly incorrect mental model of the system. This kind of inherited doc debt is high-risk during onboarding or handoffs.
**Source:** 88-01-PLAN.md; cross-referenced against packages/backend/src/agents/

---

### The audit completed in one pass — no back-and-forth verification needed

Given 12 items to verify across two documents and ~8 source files, the expectation was multiple read/verify/update cycles. In practice, each item mapped cleanly to a single source file with unambiguous evidence, making the full audit a single-pass operation.

**Impact:** Positive surprise — docs-accuracy phases for a codebase with good test coverage and well-named files are faster than expected. The main cost is the initial setup (mapping each claim to its source file), not the verification itself.
**Source:** 88-01-PLAN.md (Findings Per Item table — all 12 items verified in one read pass)
