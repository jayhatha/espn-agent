# Phase 12: address codebase concerns - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Systematically address the 316 lines of codebase concerns identified in `.planning/codebase/CONCERNS.md`. This includes fixing known bugs, wiring up incomplete features, cleaning up tech debt, and improving code quality. Scope is limited to addressing existing concerns — new feature development belongs in separate phases.

</domain>

<decisions>
## Implementation Decisions

### Security concerns
- **Deferred** — All security issues (plaintext cookies, weak JWT defaults, Slack OAuth CSRF) are out of scope for this phase
- Rationale: Development-only environment; production hardening happens later
- Security items remain documented in CONCERNS.md for future phases

### Known bugs priority
- **Fix bugs first** — Stabilize existing features before adding new capabilities
- Target bugs:
  - Injury data always empty
  - Draft recommendations returns placeholder
  - Extension cannot detect user team ID
  - DOM selectors are placeholders
- Bug fixes block new feature work; establish stable baseline before expansion

### Tech debt vs feature gaps
- **Mix both based on impact** — Balance cleanup with completion
- Tech debt examples: Frontend API client unused, PlayerIdentityResolution not wired
- Feature gaps examples: Transaction ingestion missing, free agent pool never populated
- Prioritize based on user-facing impact and risk, not just category

### Complexity approach
- **Progressive depth** — Start with quick fixes, then layer in deeper work
- Phase 1: Low-hanging fruit (wire up existing functions, add null checks, consolidate duplicated code)
- Phase 2: Medium complexity (complete partial features, add missing integrations)
- Phase 3: Deep refactors (extract monolithic agents, optimize performance bottlenecks)
- Build momentum with wins before tackling architectural changes

### Claude's Discretion
- Exact sequencing of fixes within each complexity tier
- Breaking large concerns into sub-tasks vs addressing atomically
- Whether to add tests before, during, or after each fix
- Decision on which concerns can be addressed in parallel vs sequentially

</decisions>

<specifics>
## Specific Ideas

- Use CONCERNS.md as the source of truth — every fix should map to a documented concern
- Progressive depth means: wire up fetchFreeAgents() before refactoring TransactionImpactAgent
- "Fix bugs first" means: get injury data, draft recommendations, and team ID detection working
- Mix approach means: while fixing bugs, also clean up obvious tech debt like unused API client

</specifics>

<deferred>
## Deferred Ideas

- Security hardening (plaintext cookies, JWT secrets, OAuth CSRF) — future phase
- Scaling improvements (connection pooling, caching strategy) — address when needed
- Test coverage expansion — add tests strategically, not comprehensively in this phase
- Performance optimization — profile first, optimize later

</deferred>

---

*Phase: 12-address-codebase-concerns*
*Context gathered: 2026-02-26*
