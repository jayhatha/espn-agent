# Project Research Summary

**Project:** ESPN Fantasy Baseball Assistant - Mastra AI Agent Integration
**Domain:** AI agent framework integration into existing Fastify backend + Chrome extension for real-time auction draft advising
**Researched:** 2026-03-05
**Confidence:** HIGH (core integration), MEDIUM (streaming + memory interaction under live draft load)

## Executive Summary

This milestone replaces the stateless `DraftNarratorAgent` (a single OpenAI SDK call per request) with a Mastra-powered agent that has typed tools, thread-scoped memory, and SSE streaming. The existing narrator sends the entire engine signal payload as an 800-token text wall; the Mastra agent instead queries 8 focused tools on demand, remembers what it said earlier in the draft session, and streams text token-by-token to the sidebar. The core integration adds 4 packages (`@mastra/core`, `@mastra/memory`, `@mastra/pg`, and a Zod 4 upgrade) to the backend. Critically, `@mastra/fastify` must NOT be used -- it requires Fastify v5, while the existing backend runs Fastify v4. Instead, the `Agent` class from `@mastra/core` is called directly inside existing Fastify v4 route handlers.

The recommended build order is: (1) prerequisite upgrades (Zod v4, verify Node >= 22.13.0), (2) Mastra instance + PostgresStore wiring, (3) 8 tool definitions pulling from engine signals via AsyncLocalStorage, (4) agent definition with memory, (5) SSE streaming endpoint in the existing `/api/draft/narrate` route using `reply.raw`, (6) extension-side SSE consumer using `fetch` + `ReadableStream`. This order reflects strict dependency chains and ensures each step is independently testable.

The pitfalls research raises strong warnings against tools, memory, and streaming -- arguing the narrator should remain stateless and prompt-only to stay within the 3-second latency budget. These warnings are valuable engineering constraints, not vetoes. The user explicitly requested tools, memory, and streaming as the purpose of this milestone. The correct approach is to implement all three with the safeguards the pitfalls research identifies: cap `maxSteps: 4`, keep tool outputs under 200 tokens each, use `lastMessages: 10` (not 40) to bound context growth, and use `AsyncLocalStorage` for request-scoped signal access. If latency exceeds 5 seconds in testing, tools can be selectively disabled per trigger type (e.g., tools on `user_request` only, prompt-only on `nomination`).

## Key Findings

### Recommended Stack

Four new packages in `packages/backend` only. No new infrastructure services, no new databases, no new Redis queues. Zod v4 upgrade is a blocking prerequisite -- Mastra 1.x imports `zod/v4` subpath which does not exist in Zod 3.

**Core technologies:**
- **@mastra/core** (1.9.x): Agent class, `createTool`, `Mastra` instance. Framework-agnostic -- no Fastify dependency. Call `agent.stream()` from any HTTP handler.
- **@mastra/memory** (1.4.x): Thread-based conversation memory. `lastMessages: 10` scopes context window. Thread ID = draft session, resource ID = extension.
- **@mastra/pg** (1.7.x): PostgreSQL storage for memory. Reuses existing `DATABASE_URL`. Creates `mastra_*` tables in a `mastra` schema (isolated from Kysely-managed tables).
- **zod** (v3 -> v4): Mandatory upgrade. Schema API is backward compatible -- existing `z.object()` / `z.string()` calls unchanged. Must be done BEFORE installing any `@mastra/*` package.

**What NOT to add:**
- `@mastra/fastify` -- requires Fastify v5 peer dep. Upgrading Fastify v4 -> v5 would require changes across all 12 route files for zero feature benefit.
- `@ai-sdk/openai` or `@ai-sdk/anthropic` -- Mastra routes to providers internally via string format (`"openai/gpt-4.1-mini"`). Installing these creates version conflicts.
- `@mastra/fastembed` -- adds native binary + pgvector. Unnecessary for draft narration (short sessions, not semantic search).
- `mastra` CLI -- only needed for `mastra dev` playground. Not needed when embedding via `@mastra/core` directly.
- `@fastify/sse` -- conflicts with manual `reply.raw` SSE pattern needed for Fastify v4 streaming.

**Version constraints:**
- All `@mastra/*` packages must be installed at the same version. Mixed versions cause runtime errors.
- Node.js >= 22.13.0 required (Mastra v1 uses Node 22 features). Current environment is v25.6.0 -- no action needed locally. Verify Docker images and CI runners.

### Expected Features

**Must have (P1 -- agent is not better than current narrator without these):**
- Streaming SSE response from `/api/draft/narrate` -- eliminates 1-2s blank wait
- 8 focused tools wired to engine signals -- agent queries what it needs per trigger type
- `maxSteps: 4` on agent -- enables tool call + reflection loop
- Thread-scoped session memory with PostgresStore -- agent does not repeat itself
- Extension sends stable `threadId` (UUID) per draft session
- Sidebar renders streaming text with ephemeral "Checking [tool]..." status
- `AsyncLocalStorage` for engine signals -- concurrency-safe request scoping

**Should have (P2 -- add after core works in 2-3 real drafts):**
- Working memory template for draft strategy tracking
- Conversational follow-up ("why did you say that?") -- nearly free once memory is wired
- Full tool-call transparency with named indicators in sidebar

**Defer (v2+):**
- Strategy transition narration (requires validated working memory across many sessions)
- Snake draft mode (different tool set and trigger logic)
- Semantic recall across past draft seasons (vector DB infrastructure, near-zero tactical value)
- Agent-initiated bids or autonomous actions (advisory-only is the correct abstraction)

### Architecture Approach

The `Agent` class from `@mastra/core/agent` is framework-agnostic. It is instantiated as a singleton and called from the existing Fastify v4 route handler for `POST /api/draft/narrate`. The route sets SSE headers via `reply.raw.writeHead()`, wraps the request in `AsyncLocalStorage.run()` to scope engine signals, calls `agent.stream()`, and pipes chunks via `reply.raw.write()`. The extension consumes the stream via `fetch()` + `response.body.getReader()` (not `EventSource`, which only supports GET).

**Major components:**
1. **Mastra instance** (`packages/backend/src/mastra/index.ts`) -- registers agent, configures PostgresStore with `schema: 'mastra'` for table isolation from Kysely
2. **Draft narrator agent** (`packages/backend/src/mastra/agents/draft-narrator-agent.ts`) -- Agent definition with 8 tools, memory, system prompt (migrated from existing `SYSTEM_PROMPT`)
3. **8 tool definitions** (`packages/backend/src/mastra/tools/`) -- `get_budget_status`, `get_inflation_state`, `get_scarcity`, `get_category_gaps`, `get_optimization`, `get_top_targets`, `get_draft_phase`, `get_archetype`. All read-only, pull from AsyncLocalStorage-scoped engine signals, return <200 tokens each
4. **Modified route** (`packages/backend/src/api/draft.ts`) -- SSE streaming via `reply.raw`, AsyncLocalStorage wrapping, `buildUserMessage()` reused from existing code
5. **Modified extension hook** (`packages/extension/lib/use-narrator.ts`) -- `fetch` + `ReadableStream` SSE consumer replacing `response.json()`
6. **Signals context** (`packages/backend/src/mastra/signals-context.ts`) -- `AsyncLocalStorage<DraftEngineSignals>` for request-scoped tool access

**Files that do NOT change:** All deterministic engine logic in `packages/extension/lib/engine/`, shared types in `packages/shared/src/`, server setup in `packages/backend/src/index.ts`, existing `NarratorPayload` type.

### Critical Pitfalls

1. **`maxSteps` defaults to 1, silently disabling tools.** Mastra's default means the agent makes one LLM call and stops -- tools are never invoked, no error thrown. Set `maxSteps: 4` explicitly in the agent definition, not at call time.

2. **Fastify v4 incompatibility with `@mastra/fastify`.** The adapter requires Fastify v5 as a peer dependency. Upgrading Fastify would require changes to all 12 route files. Use `@mastra/core` directly instead -- the Agent class has no framework dependency.

3. **PostgreSQL schema collision.** Mastra auto-creates 7 tables via `CREATE TABLE IF NOT EXISTS` but does NOT add new columns on upgrade. Use `schema: 'mastra'` to isolate from Kysely-managed tables. Pin `@mastra/pg` version and treat upgrades as migrations.

4. **Memory growth during 120-call draft session.** With full NarratorPayload per message (400-600 tokens), 120 messages would hit 60K+ tokens. Mitigation: set `lastMessages: 10` (not 40), keep tool outputs under 200 tokens, and monitor per-call latency throughout test sessions. If latency grows >20% over a session, reduce to `lastMessages: 5`.

5. **Tool-calling multiplies LLM calls and latency.** Each tool step adds ~0.5-1s (LLM decision + tool execution + LLM reflection). With 2 tools and `maxSteps: 4`, worst case is 3 LLM calls = 6-9s. Mitigation: system prompt instructs agent to call 1-2 tools maximum per response, tools return minimal data, and per-trigger-type tool guidance in the prompt reduces unnecessary calls. Benchmark early -- if latency exceeds budget, restrict tools to `user_request` trigger type only.

6. **Mastra v1 import paths changed.** Use subpath imports: `@mastra/core/agent`, `@mastra/core/tools`. Top-level `@mastra/core` imports fail. Pin exact version and verify imports in CI.

7. **Chrome extension streaming reliability.** MV3 service workers can be terminated mid-stream. The extension's narrator hook runs in a content script (not service worker), so `fetch` + `ReadableStream` is reliable there. Confirm the streaming consumer does NOT run in the background service worker. The existing `AbortController` pattern in `use-narrator.ts` continues to work with `fetch`.

## Implications for Roadmap

### Phase 1: Prerequisites and Infrastructure

**Rationale:** Zod v4 and Node.js verification are hard blockers -- nothing else installs without them. PostgresStore setup must happen before any agent code.

**Delivers:**
- Zod v4 upgrade with passing test suite
- Node.js >= 22.13.0 verified across local, Docker, CI
- `@mastra/core`, `@mastra/memory`, `@mastra/pg` installed and importable
- Mastra instance created with PostgresStore (`schema: 'mastra'`)
- Mastra tables auto-created, verified isolated from Kysely schema
- `AsyncLocalStorage` signals context module

**Addresses:** Stack prerequisites, Pitfall #3 (schema collision), Pitfall #9 (Node version)
**Avoids:** Installing packages in wrong order, schema conflicts with existing DB

### Phase 2: Tool Definitions and Agent Core

**Rationale:** Tools must exist before the agent can use them. Agent definition depends on tools + memory. This phase produces a testable agent callable from a unit test (no HTTP layer yet).

**Delivers:**
- 8 `createTool()` definitions reading from AsyncLocalStorage-scoped signals
- Zod input/output schemas for each tool
- Draft narrator agent definition with `maxSteps: 4`, tools, memory
- System prompt migrated from existing `DraftNarratorAgent.SYSTEM_PROMPT`
- Unit tests: tool execution with mock signals, agent.generate() with tool invocation

**Addresses:** 8 focused tools (P1 feature), maxSteps (P1 feature), session memory (P1 feature)
**Avoids:** Pitfall #1 (maxSteps default), Pitfall #6 (tool latency -- benchmark here before wiring HTTP)

### Phase 3: SSE Streaming Endpoint

**Rationale:** The HTTP layer connects the agent to the extension. SSE via `reply.raw` is the only pattern that works with Fastify v4. This phase modifies one existing route file.

**Delivers:**
- Modified `POST /api/draft/narrate` with SSE headers via `reply.raw.writeHead()`
- `AsyncLocalStorage.run()` wrapping agent call with request-scoped signals
- `for await` loop over `stream.fullStream` with `text-delta` and `tool-call` chunk types
- `[DONE]` sentinel and error event handling
- `curl` testable: progressive SSE chunks from real agent

**Addresses:** Streaming response (P1 feature), tool-call transparency (P1 feature)
**Avoids:** Pitfall #2 (no @mastra/fastify), Anti-pattern #4 (no reply.send() during stream), Anti-pattern #6 (no await stream.text)

### Phase 4: Extension SSE Consumer

**Rationale:** Final integration point. Extension must switch from `response.json()` to `ReadableStream` SSE parsing. Includes `threadId` generation for memory scoping.

**Delivers:**
- Modified `use-narrator.ts` with `fetch` + `response.body.getReader()` SSE consumer
- Progressive `setNarration(accumulated)` for token-by-token UI update
- Stable `threadId` (UUID) generated at draft session start, reused across all calls
- Ephemeral "Checking [tool]..." status from tool-call chunks in sidebar
- `AbortController` integration verified with streaming
- Graceful degradation: if stream fails, fall back to engine-only mode

**Addresses:** Extension threadId (P1), sidebar streaming + tool status (P1), graceful degradation (P1)
**Avoids:** Pitfall #5 (service worker streaming -- confirmed content script context), Pitfall #8 (AbortController propagation), Anti-pattern #3 (no EventSource for POST), Anti-pattern #5 (no new threadId per request)

### Phase 5: Validation and Hardening

**Rationale:** Memory growth, latency regression, and cost must be validated against real draft sessions before shipping. This is not a feature phase -- it is a test/tune phase.

**Delivers:**
- End-to-end test: 20+ narrator calls in a simulated draft session
- Latency benchmark: per-call latency at call 1 vs call 20 vs call 50
- Cost measurement: token usage per call with tools vs without
- Decision: tools enabled for all triggers vs restricted to `user_request` only
- Decision: `lastMessages: 10` confirmed or reduced to 5
- Cleanup: delete old `DraftNarratorAgent` if Mastra agent is stable

**Addresses:** Pitfall #4 (memory growth), Pitfall #6 (tool latency), cost implications
**Avoids:** Shipping with untested memory accumulation or latency regression

### Phase Ordering Rationale

- **Phase 1 before everything:** Zod v4 and Mastra packages are hard prerequisites. Nothing compiles without them.
- **Phase 2 before Phase 3:** Agent and tools must exist before the HTTP endpoint can call them. Unit testing the agent in isolation catches tool design issues before HTTP complexity.
- **Phase 3 before Phase 4:** Backend SSE endpoint must work before the extension can consume it. `curl` testing validates the wire format.
- **Phase 4 last (before validation):** Extension changes are the final integration point. Changing both backend and extension simultaneously makes debugging impossible.
- **Phase 5 non-optional:** Memory growth and latency are the two most likely failure modes. They only manifest under sustained use, not in unit tests.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (SSE Streaming):** The exact `fullStream` chunk type schema varies across Mastra versions. Verify chunk types (`text-delta`, `tool-call`, `tool-result`, `finish`) against the pinned version's actual output. May need to fall back to `textStream` if `fullStream` format is unstable.
- **Phase 4 (Extension Consumer):** Chrome MV3 content script `ReadableStream` reliability under extension updates and page navigation. Test: does the stream survive if the user switches ESPN tabs mid-response?

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Prerequisites):** Zod v4 upgrade is documented, backward compatible. Package installation is straightforward.
- **Phase 2 (Tools and Agent):** Mastra `createTool()` and `Agent` APIs are well-documented with verified examples.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All 4 packages verified via npm, GitHub releases, official docs. Zod v4 compatibility confirmed via GitHub issue #5821. Fastify v4 compatibility confirmed by using @mastra/core directly (no adapter). |
| Features | HIGH | 8-tool set derived from existing NarratorPayload structure. Memory API verified in Mastra docs. Streaming API verified. Feature scope is clear and bounded. |
| Architecture | HIGH | @mastra/fastify v5 requirement confirmed via npm peer deps -- using @mastra/core directly is the correct path. reply.raw SSE pattern is standard Fastify v4. AsyncLocalStorage is Node.js stdlib. |
| Pitfalls | HIGH | 9 pitfalls with specific mitigations. Key tension (tools/memory/streaming vs latency/cost) explicitly addressed with benchmarking plan rather than premature optimization. |

**Overall confidence:** HIGH

### Gaps to Address

**Tool latency under real conditions:**
- Gap: No measured data on latency with `maxSteps: 4` and 2 tool calls in the Mastra framework (tool schemas add input tokens, extra LLM roundtrips add wall time). Pitfalls research estimates 6-9s worst case.
- Resolution: Phase 2 includes latency benchmarking. If >5s, restrict tools to `user_request` trigger only. Nomination triggers use `maxSteps: 1` (prompt-only, like current narrator).
- Fallback: Tools disabled entirely; agent receives signals in prompt (current behavior) but gains streaming and memory.

**Memory token growth rate:**
- Gap: Exact token count per stored message depends on NarratorPayload size and agent response length. `lastMessages: 10` could be 4K tokens or 12K tokens depending on message sizes.
- Resolution: Phase 5 measures actual token growth. Reduce `lastMessages` or truncate stored messages if growth exceeds budget.

**Cost per session with tools:**
- Gap: Pitfalls research estimates 3.8x cost increase ($0.058 -> $0.22 per 120-call session) with tools enabled. Actual cost depends on how often the LLM decides to call tools.
- Resolution: Phase 5 measures actual token usage. System prompt engineering in Phase 2 guides agent to call tools selectively (1-2 per response, not on every trigger).
- Budget ceiling: If cost exceeds $0.30/session, restrict tools to user-initiated requests only.

**Mastra version stability:**
- Gap: Mastra is actively developed (1.9.x as of March 2026). Minor version bumps have historically included breaking changes (v1 migration guide lists 7 breaking changes).
- Resolution: Pin exact version in package.json. Do not use `@latest` in production. Test before any version bump.

## Sources

### Primary (HIGH confidence)
- [Mastra GitHub Releases](https://github.com/mastra-ai/mastra/releases) -- version 1.9.0 confirmed March 4, 2026
- [Mastra Server Adapters Docs](https://mastra.ai/docs/server/server-adapters) -- adapter architecture, route registration, middleware ordering
- [Mastra v1 Migration Guide](https://mastra.ai/guides/migrations/upgrade-to-v1/overview) -- import subpaths, createTool signature, Node 22 requirement
- [Mastra Agent Memory Docs](https://mastra.ai/docs/agents/agent-memory) -- thread/resource concepts, lastMessages config
- [Mastra PostgreSQL Storage Reference](https://mastra.ai/reference/storage/postgresql) -- auto-created tables, schema isolation, disableInit
- [Mastra createTool Reference](https://mastra.ai/reference/tools/create-tool) -- inputSchema, outputSchema, execute signature
- [Mastra Streaming Overview](https://mastra.ai/docs/streaming/overview) -- stream() vs streamLegacy(), textStream vs fullStream
- [npm: @mastra/fastify](https://www.npmjs.com/package/@mastra/fastify) -- peer dependency `fastify: ^5.0.0` confirmed
- [GitHub Issue #5821](https://github.com/mastra-ai/mastra/issues/5821) -- Zod v4 compatibility, zod/v4 subpath requirement
- [GitHub Issue #11789](https://github.com/mastra-ai/mastra/issues/11789) -- PostgreSQL schema drift on upgrade
- [GitHub Issue #2930](https://github.com/mastra-ai/mastra/issues/2930) -- maxSteps default of 1, docs gap
- [GitHub Issue #5673](https://github.com/mastra-ai/mastra/issues/5673) -- AbortController bug in Mastra client SDK

### Secondary (MEDIUM confidence)
- [Mastra Observational Memory Docs](https://mastra.ai/docs/memory/observational-memory) -- compression triggers at 30K tokens, Gemini 2.5 Flash default
- [GPT-4.1 mini Performance Analysis](https://artificialanalysis.ai/models/gpt-4-1-mini) -- TTFT 0.47-0.77s, 62-79 t/s output
- [DeepWiki: Mastra Streaming Architecture](https://deepwiki.com/mastra-ai/mastra/9.6-streaming-architecture-and-sse) -- SSE internals
- [Mastra Latency Optimization Blog](https://mastra.ai/blog/building-fast-reliable-input-processors) -- sub-500ms achievable

### Tertiary (LOW confidence, needs validation)
- fullStream chunk type schema stability across Mastra minor versions -- no official stability guarantee
- Chrome MV3 content script ReadableStream reliability during page navigation -- needs empirical testing
- Exact cost multiplier with tools enabled -- depends on LLM tool-calling frequency, needs measurement

---
*Research completed: 2026-03-05*
*Ready for roadmap: yes*
