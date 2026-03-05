---
phase: 22-ai-narrator-layer
plan: 01
subsystem: api
tags: [openai, fastify, llm, draft, narration]

# Dependency graph
requires: []
provides:
  - DraftNarratorAgent class with narrate() method calling OpenAI gpt-4.1-mini
  - NarratorPayload interface (typed structured signal schema)
  - POST /api/draft/narrate endpoint (rate-limited, 503-safe)
  - OPENAI_API_KEY placeholder in .env.example
affects:
  - 22-02 (extension use-narrator hook will POST to this endpoint)
  - 22-03 (DraftNarrator UI component renders the narration returned by this route)

# Tech tracking
tech-stack:
  added: [openai@^6.25.0]
  patterns:
    - Per-request agent instantiation for graceful 503 on missing API key
    - NarratorPayload serialized as labeled text sections for LLM consumption
    - gpt-4.1-mini-2025-04-14 as constant (not inline string) to prevent model ID typo

key-files:
  created:
    - packages/backend/src/agents/draft-narrator.ts
  modified:
    - packages/backend/src/api/draft.ts
    - packages/backend/.env.example
    - packages/backend/package.json

key-decisions:
  - "Per-request DraftNarratorAgent instantiation so OPENAI_API_KEY check converts to 503 (not server crash)"
  - "MODEL_ID = gpt-4.1-mini-2025-04-14 as top-level constant to prevent typo regressions"
  - "buildUserMessage() serializes only summary fields — never raw player arrays or projection tables sent to LLM"
  - "Alerts limited to top 3, scarcity filtered >0.65, category gaps filtered >0.65 to keep prompt concise"
  - "Rate limit 30/min for /api/draft/narrate matches /api/draft/espn limit"
  - "400 guard requires at least one meaningful signal (alerts OR archetype OR currentAuctionPlayer)"

patterns-established:
  - "NarratorPayload schema shared between backend (draft-narrator.ts) and extension (narrator-types.ts) — extension has independent copy to avoid cross-package import"
  - "SYSTEM_PROMPT as module-level constant with explicit baseball context and word limit instruction"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 22 Plan 01: AI Narrator Layer Backend Summary

**OpenAI gpt-4.1-mini backend narration endpoint with DraftNarratorAgent, typed NarratorPayload, and per-request 503 fallback via Fastify rate-limited POST /api/draft/narrate**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-05T06:06:32Z
- **Completed:** 2026-03-05T06:11:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `DraftNarratorAgent` class with `NarratorPayload` interface, system prompt, `buildUserMessage()` serializer, and `narrate()` method calling OpenAI gpt-4.1-mini-2025-04-14 at max_tokens=200 / temperature=0.4
- Added `POST /api/draft/narrate` route to existing `draftRoutes()` function — rate-limited to 30/min, returns 503 gracefully when OPENAI_API_KEY missing or OpenAI fails
- Installed openai@^6.25.0 in backend package; added OPENAI_API_KEY placeholder to .env.example

## Task Commits

Each task was committed atomically:

1. **Task 1: Install OpenAI SDK and create DraftNarratorAgent** - `8eafb4e` (feat)
2. **Task 2: Add POST /api/draft/narrate route to draft.ts** - `389412b` (feat)

## Files Created/Modified

- `packages/backend/src/agents/draft-narrator.ts` - DraftNarratorAgent class with NarratorPayload interface, system prompt constant, buildUserMessage() serializer, and narrate() method
- `packages/backend/src/api/draft.ts` - Added import for DraftNarratorAgent/NarratorPayload and POST /api/draft/narrate route with rate limiting and 503 handling
- `packages/backend/.env.example` - Added OPENAI_API_KEY= placeholder with comment
- `packages/backend/package.json` - Added openai@^6.25.0 dependency

## Decisions Made

- Per-request `DraftNarratorAgent` instantiation (not module-level) so the constructor's `OPENAI_API_KEY` check propagates as a 503 rather than crashing the server at startup or on first request
- `MODEL_ID = "gpt-4.1-mini-2025-04-14"` as a top-level constant (not inline string) to catch model ID typos at definition time — matches research recommendation for Pitfall #5
- `buildUserMessage()` serializes only structured summary fields: alerts (top 3), scarcity (>0.65 index), category gaps (>0.65 risk score) — keeps prompt compact and prevents raw player array injection
- Rate limit 30/min per IP matches the existing `/api/draft/espn` endpoint limit — appropriate for real-time draft use
- 400 guard requires at least one meaningful signal (alerts array non-empty OR archetype present OR currentAuctionPlayer present) to prevent empty narration calls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

External services require manual configuration. The user must add their OpenAI API key:

1. Visit https://platform.openai.com/api-keys
2. Create a new secret key
3. Add to `packages/backend/.env`: `OPENAI_API_KEY=sk-...`
4. Restart the backend server
5. Verify: `curl -X POST http://localhost:3001/api/draft/narrate -H "Content-Type: application/json" -d '{"draftPhase":"mid","alerts":[{"type":"scarcity","severity":0.8,"title":"C scarcity","detail":"Only 2 catchers left"}],"inflation":{"percentOverMarket":15,"confidence":"high"},"budgetSummary":{"remainingBudget":120,"pacingStatus":"on-track","budgetPressure":0.4,"maxBidRecommendation":35},"archetype":null,"topScarcity":[],"categoryGaps":[],"currentAuctionPlayer":null,"triggerReason":"alert","strategy":null}'` — should return `{ narration: "...", generatedAt: "..." }` not a 503

## Next Phase Readiness

- Backend narration endpoint is complete and TypeScript-compiled
- Extension plans 22-02 (use-narrator hook) and 22-03 (DraftNarrator UI component) can now POST to `/api/draft/narrate`
- No blockers

## Self-Check: PASSED

- FOUND: packages/backend/src/agents/draft-narrator.ts
- FOUND: packages/backend/src/api/draft.ts
- FOUND: packages/backend/.env.example
- FOUND commit 8eafb4e (Task 1: DraftNarratorAgent + OpenAI SDK)
- FOUND commit 389412b (Task 2: POST /api/draft/narrate route)

---
*Phase: 22-ai-narrator-layer*
*Completed: 2026-03-05*
