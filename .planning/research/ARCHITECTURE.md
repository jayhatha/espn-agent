# Architecture Patterns: Mastra AI Agent Integration

**Domain:** AI agent framework integration with existing Fastify + Chrome extension
**Researched:** 2026-03-05
**Confidence:** HIGH (core patterns) / MEDIUM (streaming specifics — SSE event format varies)

---

## Executive Summary

This document covers how Mastra integrates with the existing ESPN Fantasy Baseball backend and Chrome extension. The key architectural insight is that Mastra's `Agent` class from `@mastra/core` is framework-agnostic — you instantiate it like a service class and call `agent.stream()` or `agent.generate()` from any HTTP framework. The `@mastra/fastify` adapter is a convenience wrapper that auto-registers Mastra's built-in REST endpoints, but it requires Fastify v5 (the existing app uses Fastify v4), making direct integration the right path.

**Integration strategy: Use `@mastra/core` Agent class directly inside existing Fastify v4 routes.** Replace `DraftNarratorAgent` (which manually calls OpenAI) with a Mastra `Agent` that has tools, memory, and streaming support. The existing `POST /api/draft/narrate` route becomes the integration point — it calls `mastraAgent.stream()` and pipes chunks to the response.

---

## Critical Constraint: Fastify v4 vs @mastra/fastify

The `@mastra/fastify` adapter package specifies peer dependency `fastify: "^5.0.0"` (confirmed via npm). The existing backend uses Fastify v4. Fastify v5 has breaking changes (schema validation requirements, logger API, redirect arg order, decorator restrictions) that would require systematic updates across all 12 route files.

**Decision: Do not use `@mastra/fastify` adapter. Use `@mastra/core` directly.**

The `Agent` class from `@mastra/core/agent` has no dependency on Fastify. You can call `agent.stream()` from a Fastify v4 route handler the same way you call any async function. The adapter only adds value for auto-generated REST endpoints that expose agents to external callers — not needed here since we control the route contract.

---

## Architecture Overview

### Current Flow (No Streaming, No Memory, No Tools)

```
Chrome Extension
  useNarrator hook fires trigger
    ↓
  POST /api/draft/narrate
  body: NarratorPayload (structured signals)
    ↓
  Fastify route handler
    ↓
  DraftNarratorAgent.narrate(payload)
    → Manually builds prompt string
    → Calls OpenAI chat.completions.create (non-streaming)
    → Returns { narration: string }
    ↓
  Extension receives JSON, calls setNarration(data.narration)
  UI shows full text instantly
```

### Target Flow (Mastra Agent with Streaming + Tools + Memory)

```
Chrome Extension
  useNarrator hook fires trigger
    ↓
  POST /api/draft/narrate (MODIFIED: accepts SSE response)
  body: NarratorPayload
    ↓
  Fastify route handler
    → Sets Content-Type: text/event-stream
    → reply.raw.writeHead(200, SSE headers)
    → Builds message array from NarratorPayload
    ↓
  mastraAgent.stream(messages, { memory: { resource, thread } })
    → Agent decides to call tools if needed:
        getPlayerProjection(playerName)    ← looks up FanGraphs data
        getAuctionComps(playerName)        ← gets market comparables
    → LLM streams token chunks
    ↓
  for await (const chunk of stream.textStream)
    → reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
    ↓
  on finish: reply.raw.write("data: [DONE]\n\n") + reply.raw.end()

Chrome Extension
  useNarrator receives SSE stream
    → Processes tokens as they arrive
    → setNarration accumulates partial text
    → UI shows text as it streams
```

---

## Component Map: New vs Modified

### New Files

| File | Purpose |
|------|---------|
| `packages/backend/src/mastra/index.ts` | Mastra instance (agent registry, memory config) |
| `packages/backend/src/mastra/agents/draft-narrator-agent.ts` | Mastra Agent definition with tools |
| `packages/backend/src/mastra/tools/player-projection-tool.ts` | Tool: look up FanGraphs projection for player |
| `packages/backend/src/mastra/tools/auction-comp-tool.ts` | Tool: get market comps for player at current inflation |
| `packages/backend/src/mastra/tools/draft-state-tool.ts` | Tool: query backend DB for current roster state |

### Modified Files

| File | Change | Why |
|------|--------|-----|
| `packages/backend/src/api/draft.ts` | Replace `DraftNarratorAgent` call with `mastraAgent.stream()`, add SSE headers to `/api/draft/narrate` | Replace non-streaming JSON with streaming SSE |
| `packages/extension/lib/use-narrator.ts` | Change `response.json()` to SSE stream reader | Consume streaming response instead of full JSON |
| `packages/backend/package.json` | Add `@mastra/core`, `@mastra/memory`, `@mastra/pg` | New deps |

### No-Change Files

| File | Why untouched |
|------|--------------|
| `packages/backend/src/agents/draft-narrator.ts` | Deprecated by Mastra agent — keep for reference, delete when stable |
| `packages/backend/src/index.ts` | Server setup unchanged — no adapter needed |
| `packages/extension/lib/engine/` | All deterministic engine logic unchanged |
| `packages/shared/src/` | NarratorPayload type stays as-is |

---

## Folder Structure

Mastra agent definitions live inside the existing backend package, not a separate package:

```
packages/backend/src/
  mastra/
    index.ts                        ← Mastra instance, registers agents
    agents/
      draft-narrator-agent.ts       ← Agent definition with tools + memory
    tools/
      player-projection-tool.ts     ← createTool() for FanGraphs lookups
      auction-comp-tool.ts          ← createTool() for market comps
      draft-state-tool.ts           ← createTool() for DB queries
  api/
    draft.ts                        ← MODIFIED: uses mastraAgent.stream()
  agents/
    draft-narrator.ts               ← OLD: kept temporarily, delete later
```

This colocation approach avoids monorepo compilation issues. Mastra docs confirm workspace packages with uncompiled TypeScript cause `ERR_UNKNOWN_FILE_EXTENSION` errors. Co-locating within the existing compiled package eliminates this.

---

## Component Definitions

### Mastra Instance (`packages/backend/src/mastra/index.ts`)

```typescript
import { Mastra } from "@mastra/core";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { draftNarratorAgent } from "./agents/draft-narrator-agent.js";

export const mastra = new Mastra({
  agents: { draftNarratorAgent },
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL!,
  }),
});

export const draftMemory = new Memory({
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL!,
  }),
  options: {
    lastMessages: 10, // keep 10-message window per draft session
  },
});
```

**Why PostgreSQL for memory:** The existing app already uses PostgreSQL (same `DATABASE_URL`). `@mastra/pg` (v1.7.2 as of March 2026) stores message history in Mastra-managed tables separate from the app's Kysely schema. No schema conflict.

**Why not Redis for memory:** Redis is used for rate limiting and caching but not for conversational memory. PostgreSQL is more appropriate for structured thread history that needs durability.

---

### Draft Narrator Agent (`packages/backend/src/mastra/agents/draft-narrator-agent.ts`)

```typescript
import { Agent } from "@mastra/core/agent";
import { draftMemory } from "../index.js";
import { playerProjectionTool } from "../tools/player-projection-tool.js";
import { auctionCompTool } from "../tools/auction-comp-tool.js";

const SYSTEM_PROMPT = `You are a tactical fantasy baseball auction draft advisor...
[same prompt as current DraftNarratorAgent system prompt]`;

export const draftNarratorAgent = new Agent({
  id: "draft-narrator",
  name: "Draft Narrator",
  instructions: SYSTEM_PROMPT,
  model: "openai/gpt-4.1-mini-2025-04-14",
  tools: { playerProjectionTool, auctionCompTool },
  memory: draftMemory,
});
```

**Why same model as existing:** No regression risk. The existing `MODEL_ID = "gpt-4.1-mini-2025-04-14"` continues.

**Why these two tools first:** They cover the most actionable questions the LLM can't answer from the NarratorPayload alone. Player projection gives it FanGraphs context. Auction comp gives it market pricing context. Both have finite, fast DB queries behind them.

---

### Tool: Player Projection (`packages/backend/src/mastra/tools/player-projection-tool.ts`)

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getDb } from "../../db/connection.js";

export const playerProjectionTool = createTool({
  id: "get-player-projection",
  description: "Look up FanGraphs ROS projections for a player by name",
  inputSchema: z.object({
    playerName: z.string().describe("Player full name, e.g. 'Shohei Ohtani'"),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    playerName: z.string().optional(),
    projectedStats: z.record(z.number()).optional(),
    note: z.string().optional(),
  }),
  execute: async ({ playerName }) => {
    const db = getDb();
    const projection = await db
      .selectFrom("player_projection as pp")
      .innerJoin("player as p", "p.id", "pp.player_id")
      .select(["p.name", "pp.projected_stats"])
      .where("p.name", "ilike", `%${playerName}%`)
      .orderBy("pp.created_at", "desc")
      .executeTakeFirst();

    if (!projection) {
      return { found: false, note: "No FanGraphs projection found" };
    }
    return {
      found: true,
      playerName: projection.name,
      projectedStats: projection.projected_stats as Record<string, number>,
    };
  },
});
```

**Why `getDb()` inside tool:** The tool is called during agent execution inside a Fastify request. `getDb()` returns the existing singleton Kysely instance. Tools are synchronous closures that close over the module scope — using the existing DB connection pattern avoids creating new DB pools.

---

### Modified Fastify Route (`packages/backend/src/api/draft.ts` — narrate endpoint)

```typescript
// POST /api/draft/narrate — MODIFIED for streaming
app.post<{ Body: NarratorPayload }>(
  "/api/draft/narrate",
  { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const payload = request.body as NarratorPayload;

    if (!payload.alerts?.length && !payload.currentAuctionPlayer) {
      return reply.code(400).send({ error: "No meaningful signals provided" });
    }

    // SSE headers — must set before writing to reply.raw
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "https://fantasy.espn.com",
    });

    try {
      const agent = mastra.getAgent("draftNarratorAgent");

      // Convert NarratorPayload to message string (same logic as buildUserMessage)
      const userMessage = buildUserMessage(payload);

      // Thread = draft session; resource = "extension" (no user identity in extension)
      const stream = await agent.stream(
        [{ role: "user", content: userMessage }],
        {
          memory: {
            resource: "extension",
            thread: `draft-session-${Date.now()}`, // or persistent per-session ID
          },
        }
      );

      for await (const chunk of stream.textStream) {
        reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      reply.raw.write("data: [DONE]\n\n");
    } catch (error) {
      request.log.error({ err: error }, "[DraftNarrator] Streaming failed");
      // SSE error event before ending
      reply.raw.write(`data: ${JSON.stringify({ error: "narration failed" })}\n\n`);
    } finally {
      reply.raw.end();
    }
  }
);
```

**Why `reply.raw` instead of Fastify's reply API:** Fastify's reply serialization closes the response after `reply.send()`. For streaming, you must bypass Fastify's response lifecycle and write directly to the underlying Node.js `ServerResponse`. This is documented in the Fastify community and confirmed by existing patterns.

**Why not `@fastify/sse`:** The `@fastify/sse` plugin adds `reply.sse()` convenience but imposes its own event format and lifecycle management. Using `reply.raw` directly gives full control over the SSE wire format, which must match what the extension client expects.

---

### Modified Extension Hook (`packages/extension/lib/use-narrator.ts`)

The `fireNarration` function needs to change from `response.json()` to SSE stream reading:

```typescript
// BEFORE (in fireNarration):
const response = await fetch(`${baseUrl}/api/draft/narrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal: abortControllerRef.current.signal,
});
const data = await response.json();
setNarration(data.narration ?? "");

// AFTER (streaming SSE):
const response = await fetch(`${baseUrl}/api/draft/narrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal: abortControllerRef.current.signal,
});

if (!response.ok || !response.body) {
  throw new Error(`HTTP ${response.status}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let accumulated = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value, { stream: true });
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (data === "[DONE]") break;
    try {
      const parsed = JSON.parse(data);
      if (parsed.text) {
        accumulated += parsed.text;
        setNarration(accumulated); // Update UI progressively
      }
    } catch {
      // Ignore malformed SSE lines
    }
  }
}
```

**Why `fetch` + `ReadableStream` instead of `EventSource`:** `EventSource` only supports GET requests. The narrator sends a POST with a body (NarratorPayload). Chrome extension content scripts support `fetch` with `response.body.getReader()` — this is the standard pattern for POST-based SSE in extensions.

**Why progressive `setNarration`:** Each chunk updates the UI immediately. The user sees text appearing word by word rather than waiting for the full response. This is the primary UX benefit of streaming.

---

## Memory Architecture

### Thread and Resource Strategy

Mastra memory organizes history by `resource` (the owner entity) and `thread` (the conversation session).

For the draft narrator use case:

| Concept | Value | Rationale |
|---------|-------|-----------|
| `resource` | `"extension"` | All draft sessions are from one Chrome extension. No per-user identity in extension context. |
| `thread` | `draft-${leagueId}-${dateStamp}` | One thread per draft session per day per league. Keeps history scoped to one draft. |

**Thread lifecycle:** A draft session is typically 2-3 hours. Using `draft-${leagueId}-${date}` as the thread ID means all narrator calls in one draft share context. The agent's last 10 messages (configured `lastMessages: 10`) give it enough context to avoid repeating advice already given.

**What gets stored:** Mastra automatically stores both user messages (the formatted NarratorPayload text) and agent responses. This means the agent remembers it already said "Ohtani is overpriced" earlier in the draft.

### PostgreSQL Memory Tables

`@mastra/pg` creates its own tables in the same PostgreSQL database. These tables do not conflict with the existing Kysely schema:

```
mastra_messages        ← message history per thread
mastra_threads         ← thread metadata
mastra_resources       ← resource registry
```

**No migration needed in Kysely.** The PostgresStore initializes its own tables on first use. They should be excluded from the Kysely schema file (`packages/backend/src/db/schema.ts`).

---

## Data Flow Diagram

### Full Request Flow: Extension → Backend → Mastra Agent → Tools → Response

```
1. TRIGGER (Chrome extension)
   ─────────────────────────────
   useNarrator detects: new nomination OR alert severity > 0.65 OR pacing change
   Debounce: 1500ms window clusters rapid events
   buildNarratorPayload(signals, triggerReason, context) → NarratorPayload

2. HTTP REQUEST
   ─────────────────────────────
   POST /api/draft/narrate
   Headers: Content-Type: application/json
   Body: NarratorPayload (structured signals, no raw arrays)

3. FASTIFY ROUTE HANDLER (draft.ts)
   ─────────────────────────────
   Validates payload (alerts present OR currentAuctionPlayer present)
   Sets SSE headers via reply.raw.writeHead(200, {...})
   Calls buildUserMessage(payload) → string (same as current DraftNarratorAgent)
   Calls mastra.getAgent("draftNarratorAgent")

4. MASTRA AGENT EXECUTION
   ─────────────────────────────
   agent.stream(messages, { memory: { resource, thread } })
   ├── Memory lookup: fetch last 10 messages for this thread
   ├── LLM decides: do I need tool data?
   │   ├── YES: calls playerProjectionTool({ playerName: "Shohei Ohtani" })
   │   │   └── Tool queries PostgreSQL player_projection table via getDb()
   │   │   └── Returns { projectedStats: { HR: 42, R: 95, ... } }
   │   └── NO: proceeds directly to generation
   └── LLM generates streaming response

5. STREAMING OUTPUT
   ─────────────────────────────
   for await (chunk of stream.textStream)
     reply.raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
   reply.raw.write("data: [DONE]\n\n")
   reply.raw.end()

6. EXTENSION RECEIVES STREAM
   ─────────────────────────────
   response.body.getReader() reads chunks
   Each "data: {...}" line parsed
   accumulated += chunk.text
   setNarration(accumulated) called on each chunk → progressive UI update
   [DONE] sentinel ends read loop
```

---

## Streaming Event Format

**SSE wire format used by the narrate endpoint:**

```
data: {"text":"At "}\n\n
data: {"text":"$45 "}\n\n
data: {"text":"Ohtani "}\n\n
data: {"text":"is overpriced"}\n\n
data: [DONE]\n\n
```

**Error event:**

```
data: {"error":"narration failed"}\n\n
```

**Why not use Mastra's built-in SSE format:** Mastra's built-in event format emits typed events (text-delta, tool-call, tool-result, etc.). For the narrator use case, the extension only needs text chunks plus a done signal. Using a minimal format reduces extension parsing complexity and avoids coupling to Mastra's internal event schema.

---

## Tool Execution Pattern

### How the Agent Decides to Call Tools

Mastra agents use the LLM's function-calling capability. The LLM sees tool descriptions and decides when they add value. For the draft narrator:

- **`get-player-projection`** — agent calls this when a player is nominated and the NarratorPayload has limited stat context, or when it wants to verify a claim before making a recommendation
- **`get-auction-comp`** — agent calls this when the current bid is near a player's estimated value and it needs market context

Tool calls happen before the streaming text response begins. The agent resolves all tools first, then streams the final response.

**Implication:** First token latency is higher when tools fire (one extra DB roundtrip). When no tools fire, first token latency is similar to the current non-streaming implementation (~300-500ms).

### Tool Lifecycle in a Fastify Route

```
Fastify route handler
  └── agent.stream() called
      ├── Mastra internally calls tool execute() functions
      │   └── These call getDb() → Kysely query → PostgreSQL
      └── After all tools resolve, LLM streams text
Fastify route handler still alive (async generator pattern)
  └── for await iterates textStream chunks
      └── reply.raw.write() for each chunk
```

The Fastify route handler remains open (streaming) while the agent executes. The `for await` loop drives the event loop — Node.js does not need any special configuration for this pattern.

---

## Scalability Considerations

| Concern | At current load (1 draft session) | At 100 concurrent sessions | Mitigation |
|---------|-----------------------------------|---------------------------|------------|
| SSE connections held open | 1 persistent connection per narrator call (~15-30s) | 100 simultaneous open HTTP connections | Nginx/reverse proxy keep-alive tuning; each connection is lightweight |
| PostgreSQL memory tables | Minimal (10 messages per thread) | 100 active threads | Thread cleanup job: delete threads older than 24h |
| Tool DB queries | 1-2 queries per agent invocation | 100-200 queries/min | Kysely query already uses indexed lookups; acceptable |
| LLM API cost | Same as current | Same rate, higher volume | Session cap (120 calls/draft) already enforced in useNarrator |

---

## Build Order (Integration Steps)

Dependencies flow strictly top-to-bottom. Each step produces a testable artifact.

### Step 1: Install Packages and Create Mastra Instance
**Files:** `packages/backend/package.json`, `packages/backend/src/mastra/index.ts`
**Action:** `pnpm add @mastra/core @mastra/memory @mastra/pg` in backend package. Create `mastra/index.ts` with PostgresStore using existing `DATABASE_URL`.
**Test:** Import `mastra` in a test file, verify no runtime errors.
**Dependency:** None.

### Step 2: Define Tools
**Files:** `packages/backend/src/mastra/tools/player-projection-tool.ts`, `auction-comp-tool.ts`
**Action:** Implement `createTool()` with `inputSchema`, `outputSchema`, `execute`. Each tool queries existing Kysely DB.
**Test:** Call `tool.execute({ playerName: "Aaron Judge" })` directly in a unit test — verify returns projection data.
**Dependency:** Step 1 (need `getDb()` available).

### Step 3: Define Mastra Agent
**Files:** `packages/backend/src/mastra/agents/draft-narrator-agent.ts`
**Action:** `new Agent({ id, instructions, model, tools, memory })`. Register in `mastra/index.ts`.
**Test:** Call `agent.generate("test message")` in isolation — verify text response. Call with tool trigger input — verify tool fires.
**Dependency:** Steps 1 and 2.

### Step 4: Modify Fastify Route to SSE Streaming
**Files:** `packages/backend/src/api/draft.ts`
**Action:** Replace `DraftNarratorAgent` with `mastra.getAgent(...)`. Add SSE headers. Add `for await` streaming loop over `stream.textStream`. Keep `buildUserMessage()` function unchanged.
**Test:** `curl -N -X POST http://localhost:3001/api/draft/narrate -d '{...}'` — verify SSE chunks arrive progressively.
**Dependency:** Step 3.

### Step 5: Update Extension SSE Consumer
**Files:** `packages/extension/lib/use-narrator.ts`
**Action:** Change `response.json()` to `response.body.getReader()`. Parse `data: {...}` lines. Call `setNarration(accumulated)` on each chunk.
**Test:** In dev with real ESPN draft page — verify text appears progressively in DraftSidebar.
**Dependency:** Step 4.

### Step 6: Memory Thread Persistence (Optional, Deferred)
**Files:** `packages/extension/lib/draft-state.ts` (or equivalent)
**Action:** Generate a stable `threadId` at draft session start. Pass it in the POST body alongside `NarratorPayload`. Backend uses it for memory scoping.
**Test:** Two narrator calls in same session — verify agent references context from first call.
**Dependency:** Step 5.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using @mastra/fastify Adapter
**What:** Installing `@mastra/fastify` and calling `new MastraServer({ app, mastra }).init()`
**Why bad:** Requires Fastify v5. Upgrading from v4 requires schema validation changes on all 12 route files, logger API change, redirect argument order reversal, decorator restriction updates. 1-2 days of migration risk for zero feature benefit.
**Instead:** Use `@mastra/core` Agent class directly. Call `agent.stream()` from existing Fastify v4 route handlers.

### Anti-Pattern 2: Defining Mastra Tools in a Separate Workspace Package
**What:** Creating `packages/mastra-tools/` with TypeScript tool definitions, importing via `workspace:^`
**Why bad:** Mastra transpiles workspace packages at build time. Uncompiled TypeScript causes `ERR_UNKNOWN_FILE_EXTENSION` errors. Pre-compiling the tools package adds a build step dependency.
**Instead:** Co-locate tools inside `packages/backend/src/mastra/tools/`. They're compiled together with the backend.

### Anti-Pattern 3: Using EventSource for POST-Based SSE
**What:** `const es = new EventSource("/api/draft/narrate")` in extension
**Why bad:** `EventSource` only supports GET requests with no body. NarratorPayload cannot be sent.
**Instead:** Use `fetch()` with `response.body.getReader()` to read SSE chunks from a POST response. Chrome extensions fully support this pattern.

### Anti-Pattern 4: Calling `reply.send()` Before SSE Completes
**What:** Using `return reply.send(...)` in the route handler while the stream is ongoing
**Why bad:** Fastify's `reply.send()` finalizes and closes the response. Calling it while `reply.raw` is still open corrupts the stream.
**Instead:** Use only `reply.raw.writeHead()`, `reply.raw.write()`, and `reply.raw.end()` in streaming routes. Do not call `reply.send()` or `return reply.*` after streaming begins.

### Anti-Pattern 5: One Memory Thread Per Request
**What:** Generating a new `threadId` for every narrator call (e.g., `draft-session-${Date.now()}`)
**Why bad:** Each call starts with no context. The agent can't recall it already advised on a player earlier in the draft. Memory becomes useless.
**Instead:** Generate the `threadId` once at draft session start (when the extension loads on the ESPN draft page) and reuse it for all narrator calls in that session. Pass it in the request body.

### Anti-Pattern 6: Awaiting `stream.text` Instead of Iterating `textStream`
**What:** `const text = await stream.text` then sending as JSON response
**Why bad:** This defeats streaming — waits for the full response before sending anything. Identical behavior to the current non-streaming implementation.
**Instead:** Use `for await (const chunk of stream.textStream)` and write each chunk immediately.

---

## Dependency Versions (Verified via npm, March 2026)

| Package | Latest Version | Peer Deps |
|---------|---------------|-----------|
| `@mastra/core` | 1.10.0 | none framework-specific |
| `@mastra/memory` | 1.6.1 | `@mastra/core >= 1.0.0` |
| `@mastra/pg` | 1.7.2 | `@mastra/core >= 1.0.0` |
| `@mastra/fastify` | 1.1.9 | `fastify: ^5.0.0` ← incompatible with existing v4 |

---

## Sources

- [Mastra Server Adapters Documentation](https://mastra.ai/docs/server/server-adapters) — adapter architecture, init() lifecycle
- [Mastra Blog: Announcing Server Adapters](https://mastra.ai/blog/mastra-server-adapters) — Fastify adapter pattern, route registration
- [Mastra Agent.stream() Reference](https://mastra.ai/reference/streaming/agents/stream) — textStream, fullStream, callbacks
- [Mastra Streaming Events Documentation](https://mastra.ai/docs/streaming/events) — event types, Fastify SSE example
- [Mastra Memory Documentation](https://mastra.ai/docs/agents/agent-memory) — thread/resource concepts, PostgreSQL storage
- [Mastra PostgreSQL Storage Reference](https://mastra.ai/docs/memory/storage/memory-with-pg) — PostgresStore configuration
- [Mastra createTool() Reference](https://mastra.ai/reference/tools/create-tool) — tool definition API with Zod schemas
- [Mastra Deployment: Monorepo](https://mastra.ai/docs/deployment/monorepo) — workspace package TypeScript gotcha
- [Fastify v5 Migration Guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/) — breaking changes from v4
- [DeepWiki: Mastra Streaming Architecture](https://deepwiki.com/mastra-ai/mastra/9.6-streaming-architecture-and-sse) — SSE implementation internals
- [npm: @mastra/fastify](https://www.npmjs.com/package/@mastra/fastify) — peer dependency `fastify: ^5.0.0` (confirmed via npm CLI)

---

**Last Updated:** 2026-03-05
**Confidence Level:** HIGH for integration strategy and component boundaries; MEDIUM for SSE event format details (Mastra's internal format may evolve; using minimal custom format mitigates this)
