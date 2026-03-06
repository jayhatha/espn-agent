# Feature Research

**Domain:** Mastra AI agent layer for fantasy baseball auction draft advisor
**Researched:** 2026-03-05
**Confidence:** HIGH (Mastra docs verified), MEDIUM (tool granularity patterns), HIGH (existing codebase)

---

## Context: What Already Exists

The current narrator is a stateless single-call pattern: the extension builds a
`NarratorPayload` from all engine signals, POSTs it to `/api/draft/narrate`, and
the backend sends the entire payload as a text block to GPT-4.1-mini in one
completion. No tools. No memory. No streaming. No multi-step reasoning.

What Mastra unlocks beyond this:

- **Tools**: Agent queries individual signals on demand instead of receiving all
  signals as a 800-token text wall. The agent decides what to read based on the
  user's question and the trigger type.
- **Memory**: Draft session context persists across the 120-call window. The agent
  accumulates strategy history, notices when it is giving redundant advice, and
  references earlier decisions.
- **Streaming**: Text arrives token-by-token in the sidebar instead of after a
  full 1-2 second wait. The user sees the agent "thinking."
- **Multi-step reasoning**: Agent calls `get_scarcity`, sees the result, then
  conditionally calls `get_top_targets` before composing its response. The chain is
  visible in the `fullStream` as `tool-call` and `tool-result` chunks.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the Mastra agent layer must have to be meaningfully better than the current narrator.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Streaming response | Current narrator has 1-2s blocking wait with no feedback; streaming feels responsive and makes the agent feel intelligent | LOW | `agent.stream()` returns `textStream` async iterator (HIGH confidence — Mastra docs). Wire SSE from Fastify endpoint to extension via chunked fetch |
| Session memory (thread-scoped) | Agent should not give identical advice twice in the same draft or forget what it said 3 picks ago | MEDIUM | Mastra `Memory` with `threadId = draftSessionId` and `scope: "thread"`. Uses existing PostgreSQL via `PostgresStore`. Default 10-message window; set `lastMessages: 40` for a full draft session |
| Tool-based signal access | Agent should pull the signal it needs rather than receiving all signals as a text wall — reduces hallucination, improves focus on the relevant domain | MEDIUM | 8 focused `createTool()` functions (see Tool Granularity section). Tools access engine signals via a module-level singleton set at request start |
| maxSteps > 1 for tool reasoning | Agent needs at least 2-3 LLM iterations to call a tool, receive the result, and formulate advice | LOW | Set `maxSteps: 4` on agent definition. Mastra default is 1, which breaks tool use. Do not exceed 5 for latency reasons |
| Graceful degradation | If Mastra backend is unreachable, extension still shows engine signals | LOW | Already handled in `use-narrator.ts`. Adapt to streaming endpoint — if stream fails, fall back to engine-only mode silently |

### Differentiators (Competitive Advantage)

Features that meaningfully exceed the current narrator.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Conversational follow-up | User can ask "why did you say that?" within the draft session; agent has context to answer without re-explaining setup | MEDIUM | Requires thread-scoped memory. Extension sends same `threadId` with every request in the draft session. Agent references prior tool results from memory |
| Working memory for draft strategy | Agent remembers the user's stated strategy (e.g., "targeting SP depth"), notices when archetype shifts, and references it explicitly | MEDIUM | Mastra working memory with template for draft state. Scope: thread. Agent updates via `updateWorkingMemory` tool automatically during conversation |
| Tool-call transparency in UI | Sidebar shows "Checking scarcity..." and "Checking targets..." as agent works, then streams final text | MEDIUM | Parse `tool-call` chunks from `fullStream` SSE. Display tool name as ephemeral status indicator. Much better UX than blank spinner for 1-3 seconds |
| Nomination-specific reasoning chain | When a player is nominated, agent calls `get_optimization` then `get_scarcity` in sequence before responding — visible chain of thought | MEDIUM | Set `toolChoice: "required"` on nomination triggers. System prompt specifies which tools to call for each trigger type (nomination, alert, budget_pressure, user_request) |
| Strategy transition narration | Agent notices archetype shift from working memory and narrates the pivot: "You have shifted from HR focus to balanced — adjust remaining budget targets accordingly" | HIGH | Requires working memory populated over multiple turns. Needs careful system prompt engineering. Not viable until working memory is stable across sessions |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Semantic recall across past draft seasons | "Agent remembers you punted saves last year" sounds compelling | Requires vector DB (Pinecone or pgvector), embedding model calls on every message, meaningful additional infrastructure cost and latency. Draft context changes year-to-year (projections, player pool). Cross-draft recall provides nearly zero tactical value during a live draft | Thread-scoped working memory is sufficient for one draft session. Keep semantic recall as future consideration only if user feedback demands it |
| Full player database tool | Single `get_player_info(name)` tool that returns all projections plus value for any player | Creates a massive token dump in the context window. Research confirms LLMs perform worse when they receive more data than needed. Agent will call it indiscriminately and fill the context window | Split into purpose-specific tools: `get_player_bid_guidance(name)` returns max bid plus market price only. `get_top_targets(position)` returns a ranked shortlist. Never expose raw projection rows to the agent |
| Agent-initiated picks or auto-bid | Agent proactively fires bids or nominates players autonomously | Chrome extension cannot reliably submit bids to ESPN's DOM without brittle selector hacks. High risk of unintended auction actions at wrong prices. Users would not trust it | Keep agent advisory-only. It recommends, user decides. "Should bid $X" is the right abstraction |
| Real-time opponent roster tracking via ESPN API | Agent calls ESPN API during live draft to enrich opponent context | ESPN API rate limiting during a live auction draft would cause failures at the worst moment. Adds latency to the hot path | Use the `opponentPressure` data already computed in the engine signals. Do not add ESPN API calls to the narration path |
| Streaming directly from extension (no Fastify proxy) | Eliminate round-trip through backend for lower latency | OpenAI API keys must not live in the Chrome extension (visible in chrome.storage to any injected script). Current architecture correctly proxies through Fastify | Accept 1-3 second first-token latency. SSE through Fastify is the correct and secure architecture |
| Fully autonomous agent without trigger conditions | Agent watches ESPN DOM continuously and fires advice every few seconds | Would exhaust the 120-call session cap within minutes. LLM latency creates a noisy, distracting experience during fast-paced auction. | Keep trigger-gated architecture. Mastra agent replaces the LLM call within existing trigger logic — it does not replace the trigger logic itself |

---

## Tool Granularity Recommendation

**Use 8 focused tools, not 1 composite tool or 20 atomic tools.**

The current narrator sends a single 800-token text block — the equivalent of
one composite "get everything" tool. The LLM must parse all signals to find what
matters. The opposite extreme (one tool per field) adds too many tool descriptions
to the context window, degrades model selection accuracy, and increases latency
through unnecessary LLM calls.

The right granularity is one tool per conceptual domain. Each tool returns a
focused data shape under 200 tokens. The agent selects 1-3 tools per response
based on the trigger type.

**Recommended tool set:**

```
get_budget_status()
  Returns: remainingBudget, pacingStatus, budgetPressure, maxBidRecommendation
  When agent uses it: budget_pressure trigger, user asks about spending

get_inflation_state()
  Returns: percentOverMarket, confidence
  When agent uses it: draft is running hot or cold, user asks about market conditions

get_scarcity(position?: string)
  Returns: top scarcity positions with myTeamNeeds flags, optionally filtered by position
  When agent uses it: alert trigger involving scarcity, nomination where position matters

get_category_gaps()
  Returns: category gaps sorted by risk score with z-scores
  When agent uses it: alert trigger involving category weakness, strategy questions

get_optimization()
  Returns: shouldBid, maxBid, valueSurplus, simulationEV, confidence, opponentPressure
  When agent uses it: any nomination trigger — this is the primary bid guidance tool

get_top_targets(n?: number)
  Returns: top N remaining targets with SGP value, max bid, expected market price
  When agent uses it: user asks what to focus on next, after agent recommends PASS

get_draft_phase()
  Returns: draftPhase (early/mid/late), picksRemaining, myRosterCount
  When agent uses it: framing advice, phase transitions

get_archetype()
  Returns: current archetype classification, confidence score
  When agent uses it: strategy questions, when working memory shows archetype shift
```

**Why this granularity works:**
- Each tool has one clear purpose. LLM picks the right one more reliably with descriptive names
- Return shapes are small — tool results stay under 200 tokens each
- Agent calls 1-3 tools per response. Nomination trigger: `get_optimization` + `get_scarcity`. Alert: `get_category_gaps` + `get_budget_status`. User request: agent decides based on question
- Tools are all read-only. They pull data from the engine signals snapshot set at request start. No side effects, no ESPN API calls, no database queries in the hot path

**Implementation pattern (HIGH confidence — verified against Mastra docs):**

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getBudgetStatus = createTool({
  id: "get_budget_status",
  description: "Get current budget pacing, remaining budget, and max bid recommendation for this team",
  inputSchema: z.object({}),
  outputSchema: z.object({
    remainingBudget: z.number(),
    pacingStatus: z.enum(["ahead", "on-track", "behind"]),
    budgetPressure: z.number(),
    maxBidRecommendation: z.number(),
  }),
  execute: async () => {
    const signals = getCurrentSignals(); // module-level singleton
    if (!signals) throw new Error("No signals loaded for this request");
    return {
      remainingBudget: signals.budgetCurve.remainingBudget,
      pacingStatus: signals.budgetCurve.pacingStatus,
      budgetPressure: signals.budgetCurve.budgetPressure,
      maxBidRecommendation: signals.budgetCurve.maxBidRecommendation,
    };
  },
});
```

---

## Feature Dependencies

```
Streaming response
    └──requires──> Mastra agent.stream() on backend
                       └──requires──> Fastify SSE endpoint (/api/draft/agent)
                       └──requires──> Extension chunked fetch or EventSource consumer

Session memory (thread-scoped)
    └──requires──> @mastra/memory + @mastra/pg packages installed
    └──requires──> PostgresStore (reuses existing DATABASE_URL)
    └──requires──> draftSessionId (UUID) generated in extension at draft start
    └──requires──> threadId sent by extension with every request

Tool-based signal access
    └──requires──> 8 createTool() definitions
    └──requires──> Module-level signals singleton (setCurrentSignals / getCurrentSignals)
    └──requires──> maxSteps: 4 on agent definition

Conversational follow-up
    └──requires──> Session memory (threadId already being sent)
    └──requires──> Extension preserves same threadId across turns in the same session

Tool-call transparency in UI
    └──requires──> Extension iterates fullStream (not just textStream)
    └──requires──> Sidebar renders tool-call chunk payloads as ephemeral status

Working memory for draft strategy
    └──requires──> Session memory (all infrastructure above)
    └──requires──> Working memory template defined on Memory instance with scope: "thread"
    └──requires──> System prompt that instructs agent to populate working memory

Strategy transition narration
    └──requires──> Working memory for draft strategy (must be populated over multiple turns)
    └──requires──> get_archetype tool
    └──requires──> System prompt that compares current vs stored archetype
```

### Dependency Notes

- **Session memory requires PostgresStore**: Use the existing PostgreSQL database.
  Do not add libSQL or a second database. Use `connectionString: process.env.DATABASE_URL`.
  Prefix Mastra tables with `mastra_` or use a `mastra` schema to avoid collisions
  with the existing Kysely schema. PostgresStore is production-ready per Mastra docs.

- **Tool-call transparency requires fullStream not textStream**: `agent.stream().textStream`
  only emits text chunks. To see `tool-call` and `tool-result` events, iterate
  `agent.stream().fullStream` and switch on `chunk.type`. This is the more complex
  streaming path but necessary for the "Checking scarcity..." status indicator.

- **maxSteps: 4 is required for tool use**: Mastra defaults to `maxSteps: 1`. At 1,
  the agent cannot call a tool and then reason about the result — it stops after the
  first LLM call. Set to 4. Do not exceed 5 without benchmarking latency impact.

- **Module-level singleton is not concurrency-safe**: The pattern `setCurrentSignals()`
  / `getCurrentSignals()` works correctly for single-request-at-a-time. For production
  under concurrent requests, use Node.js `AsyncLocalStorage` to scope the signals to
  each request context. This is a MEDIUM complexity addition but necessary before launch.

---

## MVP Definition

### Launch With (v1 — Mastra agent replaces current narrator)

Goal: feature parity with current narrator plus streaming, tools, and memory.
These items are all dependencies of each other — none is useful without the others.

- [ ] Streaming response from `/api/draft/agent` via SSE — eliminates blank wait period, tokens appear immediately
- [ ] 8 focused tools defined and wired to engine signals singleton — agent queries what it needs per trigger type
- [ ] maxSteps: 4 on agent definition — enables tool call plus reflection loop
- [ ] Thread-scoped session memory with PostgresStore — agent does not repeat itself within a draft
- [ ] Extension generates `draftSessionId` (UUID) at draft start and sends it as `threadId` with every request
- [ ] Sidebar renders streaming text with ephemeral "Checking [tool]..." status from tool-call chunks
- [ ] AsyncLocalStorage for signals singleton — safe under concurrent requests

### Add After Validation (v1.x)

Add these once the Mastra agent works correctly in 2-3 real draft sessions.

- [ ] Working memory template for draft strategy — add when user feedback confirms agent loses track of strategy within a session
- [ ] Conversational follow-up ("why did you say that?") — memory is already wired, follow-up is nearly free at this point
- [ ] Tool-call transparency: full named tool indicators in sidebar — add when UX feedback says spinner is insufficient

### Future Consideration (v2+)

Defer until explicit user demand exists.

- [ ] Strategy transition narration — requires working memory validated across many sessions; high system prompt engineering cost
- [ ] Snake draft mode — current system is auction-only; requires different tool set and trigger logic
- [ ] Semantic recall across past draft seasons — only if users specifically request cross-season memory; adds vector DB infrastructure

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Streaming response | HIGH | LOW | P1 |
| 8 focused tools | HIGH | MEDIUM | P1 |
| maxSteps: 4 | HIGH | LOW | P1 |
| Session memory (thread-scoped) | MEDIUM | MEDIUM | P1 |
| Extension sends threadId | MEDIUM | LOW | P1 |
| Sidebar streaming + tool status | MEDIUM | MEDIUM | P1 |
| AsyncLocalStorage for concurrency | MEDIUM | MEDIUM | P1 |
| Working memory for draft strategy | MEDIUM | MEDIUM | P2 |
| Conversational follow-up | MEDIUM | LOW (needs memory first) | P2 |
| Strategy transition narration | HIGH | HIGH | P3 |
| Semantic recall across drafts | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have — Mastra agent is not meaningfully better than the current narrator without these
- P2: Should have — meaningful UX improvement, add after core is working in production
- P3: Nice to have — defer until user feedback requests it

---

## Mastra-Specific Implementation Facts

These are HIGH confidence (verified against Mastra documentation, not training data):

**agent.stream() full API:**
```typescript
const stream = await draftAdvisorAgent.stream(userMessage, {
  maxSteps: 4,
  memory: {
    thread: draftSessionId,   // scopes memory to this draft session
    resource: userId,         // stable user identifier
  },
});

// Text-only path (simpler, no tool visibility):
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

// Full stream path (needed for tool-call transparency):
for await (const chunk of stream.fullStream) {
  switch (chunk.type) {
    case "text-delta":
      // stream text to sidebar
      break;
    case "tool-call":
      // show "Checking chunk.payload.toolName..." in sidebar
      break;
    case "tool-result":
      // tool completed — hide status indicator
      break;
    case "finish":
      // entire response complete
      break;
  }
}
```

**Working memory configuration (thread-scoped):**
```typescript
const memory = new Memory({
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL,
  }),
  options: {
    workingMemory: {
      enabled: true,
      scope: "thread",  // isolated to this draft session, not shared across sessions
      template: `# Draft Session State
- Primary archetype:
- Punted categories:
- Budget approach:
- Anchors acquired:
- Key advice already given:`,
    },
    lastMessages: 40,  // covers a full 120-call draft session
  },
});
```

**Fastify SSE endpoint (Mastra uses Hono internally, so wire manually):**
```typescript
app.post("/api/draft/agent", async (req, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  // Set signals singleton for this request (replace with AsyncLocalStorage in production)
  setCurrentSignals(req.body.engineSignals);

  const stream = await draftAdvisorAgent.stream(req.body.message, {
    maxSteps: 4,
    memory: { thread: req.body.threadId, resource: req.body.userId },
  });

  for await (const chunk of stream.fullStream) {
    reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  reply.raw.end();
});
```

**Tool input structure (Zod-typed, zero dependencies on external data):**

The `execute` function in a Mastra tool receives only `inputData` (the validated
Zod input). It cannot receive request context via DI. Access engine signals through
module-level closure or AsyncLocalStorage. This is the documented pattern.

```typescript
// signals-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { DraftEngineSignals } from "../types";

export const signalsStorage = new AsyncLocalStorage<DraftEngineSignals>();

// In route handler:
signalsStorage.run(req.body.engineSignals, async () => {
  const stream = await agent.stream(...);
  // ...
});

// In tool execute:
execute: async () => {
  const signals = signalsStorage.getStore();
  if (!signals) throw new Error("Signals not available in this context");
  return signals.budgetCurve;
}
```

---

## Sources

- [Mastra agent overview](https://mastra.ai/docs/agents/overview) — agent definition, tools, stream API
- [Mastra createTool reference](https://mastra.ai/reference/tools/create-tool) — tool structure, inputSchema, execute context
- [Mastra ChunkType reference](https://mastra.ai/reference/streaming/ChunkType) — 23 fullStream chunk types including tool-call and tool-result
- [Mastra agent.stream() reference](https://mastra.ai/reference/streaming/agents/stream) — stream options, maxSteps, memory config
- [Mastra memory overview](https://mastra.ai/docs/memory/overview) — four memory types, storage requirements
- [Mastra working memory docs](https://mastra.ai/docs/memory/working-memory) — template format, scope options, update mechanism
- [Mastra storage backends](https://mastra.ai/docs/memory/storage) — PostgreSQL, libSQL, 10 providers
- [Mastra agent memory guide blog](https://mastra.ai/blog/agent-memory-guide) — threadId, resourceId, session pattern
- [Mastra streaming + SSE (DeepWiki)](https://deepwiki.com/mastra-ai/mastra/9.6-streaming-architecture-and-sse) — SSE event types, Hono server internals
- Existing narrator: `packages/backend/src/agents/draft-narrator.ts` — current stateless implementation
- Existing trigger logic: `packages/extension/lib/use-narrator.ts` — debounce, deduplication, session cap

---
*Feature research for: Mastra AI agent layer — fantasy baseball draft advisor*
*Researched: 2026-03-05*
