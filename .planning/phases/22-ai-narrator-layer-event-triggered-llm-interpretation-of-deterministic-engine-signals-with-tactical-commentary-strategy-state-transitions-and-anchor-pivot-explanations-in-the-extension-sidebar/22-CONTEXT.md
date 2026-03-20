# Phase 22: AI Narrator Layer - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an LLM narration layer that interprets the deterministic engine's structured signals during live auction drafts. The extension remains the client — it computes engine signals locally, then sends them to a backend endpoint when thresholds are met. The backend calls an LLM and returns a short tactical narrative. The extension displays the narrative alongside existing engine UI.

</domain>

<decisions>
## Implementation Decisions

### Architecture: Hybrid (client engine + server-side LLM)
- Keep the deterministic engine running client-side in the extension (inflation, scarcity, category gaps, budget curve, archetype, alerts) — it's fast (<300ms), tested, works offline
- Add a backend API endpoint that accepts structured engine signals and returns LLM-generated narration
- Extension POSTs signals to backend only when trigger conditions are met
- No API keys stored in the extension — all LLM calls go through the Fastify backend
- Graceful degradation: if backend is unreachable, extension still works with engine signals only (no narration)

### LLM Provider: OpenAI
- Use OpenAI (not Claude) for narration — user preference
- Use a fast, cheap model (gpt-4o-mini or similar) for <2s latency
- Backend manages the OpenAI API key via environment variable

### Trigger conditions (when to call LLM)
- Any alert severity > 0.65
- Strategy state changes (archetype shift, punt detected, budget pressure change)
- User manually requests advice (button in sidebar)
- NOT on every pick — only when something meaningful changes
- Cap at 120 LLM calls per draft session

### Narrator contract
- Output < 120 words
- Tone: tactical, calm, direct, no fluff
- No hedging language, no generic advice
- Never recalculates math or generates values — only interprets structured signals
- High-signal only: if nothing interesting happened, say nothing

### What the LLM receives (structured state only)
- Draft phase (early/mid/late based on picks remaining)
- Active alerts with severity scores
- Category gaps summary (which cats are strong/weak/punted)
- Budget summary (pressure, pacing status, remaining per player)
- Archetype classification + confidence
- Scarcity alerts (positions running out)
- Inflation factor
- Current auction player context (if relevant)
- NEVER: full projection tables, raw player lists, or math formulas

### Strategy object (anchor/pivot logic from spec)
- User can define a primary anchor player and fallback paths
- Engine detects when anchor is lost (outbid) and transitions strategy state
- Narrator explains the transition: "Anchor lost — pivoting to elite OF depth"
- Strategy state tracked in extension store, included in signal payload

### Sidebar presentation
- Narration displayed in a dedicated section (above or below engine alerts)
- Subtle visual treatment — not competing with data-dense engine signals
- Shows timestamp of last narration
- Manual "Ask for advice" button for on-demand narration
- Loading state while waiting for LLM response

### Claude's Discretion
- Exact system prompt wording for the narrator
- How to debounce/deduplicate rapid trigger events
- Whether to cache recent narrations to avoid redundant LLM calls
- OpenAI model selection (gpt-4o-mini vs gpt-4o vs other)
- Strategy object UI (how user defines anchors/fallbacks — could be pre-draft settings or live)
- How to count toward the 120-call cap (display counter? silent cap?)

</decisions>

<specifics>
## Specific Ideas

- Two reference specs inform this phase:
  1. `fantasy_draft_engine_spec.md` — Deterministic Core + AI Narrator Architecture (narrator contract, alert triggers, strategy object, performance constraints)
  2. `antasy Baseball Draft Engine 2.md` — Claude Implementation Specification (SGP model, roster optimizer, auction bid optimizer, Monte Carlo simulation, opponent modeling)
- The second spec describes a Python-based system with OR-Tools optimization and Monte Carlo simulation — we won't build that, but its concepts (opponent modeling, expected auction price, value surplus) can inform what context the narrator receives
- Existing engine signals (DraftEngineSignals) already contain everything the narrator needs: inflation, scarcity[], categoryGaps[], budgetCurve, alerts[], archetype
- The backend already has Fastify routes at `/api/draft/*` — the narrator endpoint fits naturally here
- Extension already has an api-client.ts with rate limiting and timeout handling

</specifics>

<deferred>
## Deferred Ideas

- Monte Carlo draft simulation (from spec 2) — too computationally expensive for real-time, could be a future phase
- OR-Tools roster optimization — requires Python backend, not TypeScript
- Opponent modeling with ML — interesting but out of scope for narrator layer
- Snake draft narration — focus on auction first since that's the active use case
- Championship odds simulator — future phase per spec 1

</deferred>

---

*Phase: 22-ai-narrator-layer*
*Context gathered: 2026-03-05*
