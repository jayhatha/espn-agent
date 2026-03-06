# Technology Stack Additions

**Project:** ESPN Fantasy Baseball Assistant - Mastra AI Agent Integration
**Researched:** 2026-03-05
**Confidence:** HIGH (Context7 unavailable for Mastra; verified via official docs + npm + GitHub issues + changelogs)

## Executive Summary

Mastra is a TypeScript AI agent framework built on top of Vercel AI SDK. The integration adds typed tools, persistent memory, and streaming to replace the existing stateless `DraftNarratorAgent` OpenAI call. As of March 2026, Mastra 1.9.x is stable with ~300K weekly downloads and official `@mastra/fastify` adapter support.

**Net new packages:** 5 (core + fastify adapter + memory + pg storage + zod upgrade)
**Keep:** `openai` SDK (optional — Mastra has its own routing, but no need to remove existing non-narrator calls)
**Replace:** `DraftNarratorAgent` stateless GPT call → Mastra `Agent` with typed tools and thread memory
**TypeScript config:** Already compatible (`ES2022` target, `bundler` moduleResolution — Mastra requires exactly this)
**Zod conflict:** Existing `zod@^3.22.4` MUST be upgraded to `zod@^4` before installing Mastra (Mastra 1.x imports `zod/v4` subpath absent in v3)

---

## NEW Dependencies (Backend Package Only)

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@mastra/core** | `@latest` (1.9.x) | Agent class, createTool, Mastra instance | Core abstraction. Provides `Agent` class with typed tools, streaming (`.stream()`), memory injection, and LLM provider routing via `"anthropic/model-name"` string format. Built on Vercel AI SDK internally. No separate AI SDK install needed for Anthropic. |
| **@mastra/fastify** | `@latest` (1.9.x) | Registers Mastra HTTP endpoints on existing Fastify server | Official adapter. Calls `MastraServer({ app, mastra }).init()` — registers `/api/agents/*`, `/api/workflows/*` routes alongside existing Fastify routes with zero conflict. Handles SSE streaming automatically. Must be initialized AFTER auth middleware so Mastra routes inherit authentication. |
| **@mastra/memory** | `@latest` (1.4.x) | Thread-based conversation memory across draft sessions | Enables `new Memory({ storage, options: { lastMessages: 20 } })` on the agent. Draft sessions are isolated by `thread` ID. Without this, agent is stateless (same as current narrator). |
| **@mastra/pg** | `@latest` (1.7.x) | PostgreSQL storage backend for Mastra memory | Uses existing `DATABASE_URL` env var. Creates 7 dedicated tables (`mastra_threads`, `mastra_messages`, etc.) in the `public` schema automatically. Pass existing `pg.Pool` if you want shared connection pooling. Does NOT conflict with Kysely — they use separate tables. Set `disableInit: true` only if managing migrations separately. |

### Peer Dependency Upgrade (Required)

| Library | Current | Required | Why |
|---------|---------|---------|-----|
| **zod** | `^3.22.4` | `^4.0.0` | Mastra 1.x imports `zod/v4` subpath which only exists in Zod 4.x. Mastra dev server crashes on startup with Zod 3.x. Fixed in Mastra 1.1.0+ — but the fix requires Zod 4 to be installed. All existing Zod schemas remain compatible (no API breaking changes for schemas used in this codebase). |

---

## Installation

```bash
# In packages/backend
cd packages/backend

# 1. Upgrade Zod FIRST (required before @mastra/core install)
pnpm add zod@^4

# 2. Install Mastra core packages
pnpm add @mastra/core@latest @mastra/fastify@latest @mastra/memory@latest @mastra/pg@latest

# 3. No OPENAI_API_KEY changes needed — add Anthropic key if switching models
# ANTHROPIC_API_KEY=... (optional — Mastra routes to Anthropic without @ai-sdk/anthropic)
# OPENAI_API_KEY=...   (keep — existing non-narrator routes still use openai SDK)
```

**Important version note:** Install all `@mastra/*` packages at the same version. Mixed versions cause runtime errors. Use `@latest` consistently or pin all to the same semver.

---

## Existing Stack: What to Keep

### `openai` SDK — KEEP (do not remove)

The existing `openai@^6.25.0` SDK stays installed. Only the `DraftNarratorAgent` is replaced by Mastra. If other agents or routes use `openai` directly, they continue to work unchanged.

**Model routing in Mastra:** Specify model as `"openai/gpt-4.1-mini"` string — Mastra resolves to the provider internally using your `OPENAI_API_KEY`. No `@ai-sdk/openai` needed. No `@ai-sdk/anthropic` needed for Anthropic either.

### Fastify 4 — KEEP, augment only

`@mastra/fastify` adds to your existing Fastify instance. It does not replace it. Your existing routes (`/api/draft/narrate`, etc.) remain unchanged during the migration period.

### `zod` — UPGRADE, not replace

Zod 4 is backward compatible for schema definitions. The existing schemas in the codebase (`z.object`, `z.string`, `z.number`, `z.array`) are unchanged. Only new Mastra tool schemas use Zod 4 patterns.

### `@mastra/pg` vs Kysely — NO CONFLICT

`@mastra/pg` creates its own tables (`mastra_*`) in PostgreSQL. Kysely manages existing ESPN app tables (`league`, `team`, `player`, etc.). They share the connection string but write to different tables. Use `disableInit: true` if you prefer Mastra tables created via your existing migration pipeline.

---

## Integration Architecture

### Mastra Instance (`packages/backend/src/mastra/index.ts`)

```typescript
import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { draftNarratorAgent } from './agents/draft-narrator-agent.js';

export const mastra = new Mastra({
  agents: { draftNarratorAgent },
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL!,
    // disableInit: true  // Add this if managing mastra_* tables via Kysely migrations
  }),
});
```

### Fastify Integration (`packages/backend/src/index.ts`)

```typescript
import Fastify from 'fastify';
import { MastraServer } from '@mastra/fastify';
import { mastra } from './mastra/index.js';

const app = Fastify({ logger: true });

// Register all existing middleware and auth FIRST
await app.register(jwtPlugin);
await app.register(corsPlugin);
// ... other existing plugins

// Register Mastra AFTER middleware (so Mastra routes inherit auth context)
const mastraServer = new MastraServer({ app, mastra });
await mastraServer.init();

// Existing custom routes continue to work unchanged
await app.register(draftRoutes);
// ...
```

### Draft Narrator Agent (`packages/backend/src/mastra/agents/draft-narrator-agent.ts`)

```typescript
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { z } from 'zod';

const getDraftContextTool = createTool({
  id: 'get-draft-context',
  description: 'Retrieve current draft state signals from the engine',
  inputSchema: z.object({
    sessionId: z.string(),
  }),
  outputSchema: z.object({
    inflation: z.number(),
    budgetRemaining: z.number(),
    topAlerts: z.array(z.object({ title: z.string(), severity: z.number() })),
  }),
  execute: async ({ context }) => {
    // Pull from deterministic engine state
    return { inflation: 0, budgetRemaining: 200, topAlerts: [] };
  },
});

export const draftNarratorAgent = new Agent({
  name: 'draft-narrator-agent',
  instructions: `[existing SYSTEM_PROMPT from DraftNarratorAgent]`,
  model: 'openai/gpt-4.1-mini-2025-04-14', // or 'anthropic/claude-3-5-haiku-20241022'
  tools: { getDraftContextTool },
  memory: new Memory({
    storage: new PostgresStore({
      connectionString: process.env.DATABASE_URL!,
    }),
    options: {
      lastMessages: 10, // Keep draft session context tight
    },
  }),
});
```

### Streaming from Mastra Agent

```typescript
// Agent streaming — Mastra handles SSE automatically via @mastra/fastify routes
// OR if called from an existing Fastify route:
const stream = await draftNarratorAgent.stream('Narrate current draft state', {
  memory: {
    resource: `league-${leagueId}`,
    thread: `draft-session-${sessionId}`,
  },
});

// Pipe textStream to Fastify response
reply.header('Content-Type', 'text/event-stream');
for await (const chunk of stream.textStream) {
  reply.raw.write(`data: ${chunk}\n\n`);
}
```

---

## LLM Provider Configuration

### OpenAI (current model — keep)

```bash
OPENAI_API_KEY=sk-...  # Already set
```

```typescript
model: 'openai/gpt-4.1-mini-2025-04-14'
```

No `@ai-sdk/openai` install needed. Mastra reads `OPENAI_API_KEY` and routes internally.

### Anthropic (optional upgrade path)

```bash
ANTHROPIC_API_KEY=sk-ant-...  # Add to .env
```

```typescript
model: 'anthropic/claude-3-5-haiku-20241022'  // Fast, cheap — similar use case as gpt-4.1-mini
// or
model: 'anthropic/claude-3-5-sonnet-20241022' // Higher reasoning
```

No `@ai-sdk/anthropic` install needed. Mastra reads `ANTHROPIC_API_KEY` and routes internally.

**Recommendation:** Keep `openai/gpt-4.1-mini-2025-04-14` for the narrator initially. The existing `SYSTEM_PROMPT` and `buildUserMessage` logic is already tuned for this model. Swap to Anthropic only if you want to add prompt caching (Anthropic supports this natively, reduces cost for repeated system prompts in live drafts).

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@mastra/fastify` adapter | Separate Mastra server process | Adds deployment complexity (two processes, two ports, CORS). Adapter registers routes in-process. |
| `@mastra/pg` (existing PostgreSQL) | LibSQL / SQLite | You already have PostgreSQL. Adding SQLite creates a second DB to operate. Composite Storage lets you use PG for everything. |
| Mastra model router strings | `@ai-sdk/anthropic` directly | Model router gives provider-agnostic failover. String format `"anthropic/model-name"` is simpler than instantiating AI SDK provider objects. Existing `openai` SDK calls (non-narrator) are unaffected. |
| `zod@^4` (upgrade) | Stay on `zod@^3` + patch | Zod 3 crashes Mastra 1.x dev server (missing `zod/v4` subpath). No option to stay on v3 with current Mastra. Zod 4 API is backward compatible for schemas used in this project. |
| Thread memory (per draft session) | Semantic recall with embeddings | Auction drafts are 2-4 hours. Last 10 messages gives all the context needed. Semantic recall (vector search) is overkill and adds `@mastra/fastembed` + pgvector dependency. |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@ai-sdk/openai` | Unnecessary — Mastra routes to OpenAI internally via string `"openai/model"`. Installing both creates version conflicts with the existing `openai` SDK. | Mastra model string `"openai/gpt-4.1-mini"` |
| `@ai-sdk/anthropic` | Same reason — Mastra reads `ANTHROPIC_API_KEY` directly. | Mastra model string `"anthropic/claude-..."` |
| `@mastra/fastembed` | Requires native binary compilation. Adds `PgVector` + vector column to PostgreSQL. Unnecessary for draft narration (short sessions, not semantic search). | `lastMessages: 10` in `Memory` options |
| `mastra` CLI as dev dep | CLI is for `mastra dev` playground mode. Not needed when embedding Mastra in existing Fastify server via adapter. | `@mastra/fastify` adapter only |
| Separate `@mastra/server` install | `@mastra/fastify` depends on `@mastra/server` internally. Installing it separately causes version drift. | Let `@mastra/fastify` resolve it as a transitive dep |
| `@fastify/sse` plugin | `@mastra/fastify` handles SSE for agent streaming internally. Adding a separate SSE plugin creates conflicts. | Let Mastra adapter handle stream routing |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@mastra/core@1.9.x` | `zod@^4.0.0` | Requires Zod 4. Zod 3 crashes dev server (zod/v4 subpath missing). Fixed in Mastra 1.1.0+ but the fix requires Zod 4 to be present. |
| `@mastra/core@1.9.x` | `fastify@^4.25.2` | Confirmed: `@mastra/fastify` adapter supports Fastify 4. No Fastify 5 required. |
| `@mastra/core@1.9.x` | `typescript@^5.3.3` | Compatible. Mastra requires ES2022 target + bundler moduleResolution — both already in `packages/backend/tsconfig.json`. |
| `@mastra/core@1.9.x` | `openai@^6.25.0` | No conflict. Mastra doesn't use `openai` SDK directly. They coexist independently. |
| `@mastra/pg@1.7.x` | `pg@^8.11.3` | `@mastra/pg` uses `pg` internally. Existing `pg` dep satisfies it (check for version conflicts post-install). |
| All `@mastra/*` packages | Each other at same minor version | Install all `@mastra/*` at `@latest` together. Mixed versions (e.g., `@mastra/core@1.8` + `@mastra/memory@1.4`) cause runtime errors. |

---

## pnpm Monorepo Notes

- Install ALL Mastra packages in `packages/backend/package.json` only. Do not hoist to workspace root — Mastra has path alias resolution issues in some monorepo configurations.
- Mastra's own codebase uses pnpm + Turbo (same as this project). No fundamental incompatibility.
- If TypeScript path alias (`@/`) errors occur during `mastra dev`, use `transpilePackages` in Mastra config — but this only applies if running the Mastra dev playground, not when using `@mastra/fastify` adapter.
- The Fastify adapter approach avoids most monorepo path alias issues since Mastra runs embedded in the existing backend process.

---

## Environment Variables (additions)

```bash
# packages/backend/.env additions:

# Required: already set
OPENAI_API_KEY=sk-...

# Optional: add only if switching narrator to Claude
ANTHROPIC_API_KEY=sk-ant-...

# Already set — @mastra/pg uses this directly
DATABASE_URL=postgresql://user:pass@host:5432/espn_fantasy
```

No new infrastructure (no new Redis queues, no new PostgreSQL databases). Mastra memory writes to existing PostgreSQL.

---

## Migration Plan (Incremental)

### Step 1: Upgrade Zod (no functionality change)

```bash
cd packages/backend
pnpm add zod@^4
pnpm test  # Ensure existing schema usage still works
```

Zod 4 is schema-API compatible. No `z.object()` / `z.string()` calls need changes.

### Step 2: Install Mastra packages

```bash
pnpm add @mastra/core@latest @mastra/fastify@latest @mastra/memory@latest @mastra/pg@latest
```

### Step 3: Create Mastra instance + agent file

New file: `packages/backend/src/mastra/index.ts`
New file: `packages/backend/src/mastra/agents/draft-narrator-agent.ts`

Keep existing `DraftNarratorAgent` in `packages/backend/src/agents/draft-narrator.ts` unchanged during this step.

### Step 4: Register `@mastra/fastify` in Fastify server

Call `MastraServer({ app, mastra }).init()` AFTER existing middleware registration.

### Step 5: Wire Mastra to existing `/api/draft/narrate` route OR keep separate

Two options:
- **Option A:** Keep existing `/api/draft/narrate` route, replace its implementation to call `draftNarratorAgent.generate(payload)`. Extension calls same endpoint.
- **Option B:** Let `@mastra/fastify` expose `/api/agents/draft-narrator-agent/generate` and update extension to call new URL.

Option A is lower risk (no extension changes required).

### Step 6: Delete old `DraftNarratorAgent`

Once Mastra agent is verified in production, delete `packages/backend/src/agents/draft-narrator.ts`.

---

## Version Summary

| Library | Action | Version | Confidence |
|---------|--------|---------|------------|
| `@mastra/core` | ADD | `@latest` (1.9.x) | HIGH (verified via GitHub releases March 4 2026) |
| `@mastra/fastify` | ADD | `@latest` (1.9.x) | HIGH (official docs, same release train) |
| `@mastra/memory` | ADD | `@latest` (1.4.x) | HIGH (official docs, npm page) |
| `@mastra/pg` | ADD | `@latest` (1.7.x) | HIGH (official docs, verified table list) |
| `zod` | UPGRADE `^3` → `^4` | `^4.0.0` | HIGH (Mastra 1.x zod/v4 subpath requirement; confirmed in GitHub issue #5821 + fix in 1.1.0+) |
| `openai` | KEEP | `^6.25.0` | HIGH (no conflict with Mastra) |
| `fastify` | KEEP | `^4.25.2` | HIGH (adapter supports Fastify 4) |
| `typescript` | KEEP | `^5.3.3` | HIGH (ES2022 + bundler already set) |
| `@ai-sdk/anthropic` | DO NOT ADD | N/A | HIGH (Mastra routes internally) |
| `@ai-sdk/openai` | DO NOT ADD | N/A | HIGH (Mastra routes internally, no conflict with existing `openai` SDK) |

---

## Sources

- [Mastra GitHub Releases](https://github.com/mastra-ai/mastra/releases) — Version 1.9.0 confirmed March 4, 2026
- [Mastra Server Adapters Docs](https://mastra.ai/docs/server/server-adapters) — @mastra/fastify setup, route registration, middleware ordering
- [Announcing Mastra 1.0](https://mastra.ai/blog/announcing-mastra-1) — Server adapters, composite storage, AI SDK v6 support, breaking changes list
- [Mastra Changelog 2026-01-30](https://mastra.ai/blog/changelog-2026-01-30) — Zod v3/v4 conflict fix in @mastra/core@1.1.0
- [Anthropic Models on Mastra](https://mastra.ai/models/providers/anthropic) — Model string format, no @ai-sdk/anthropic needed
- [Agent Memory Docs](https://mastra.ai/docs/agents/agent-memory) — @mastra/memory, thread/resource IDs, lastMessages config
- [PostgreSQL Storage Reference](https://mastra.ai/reference/storage/postgresql) — @mastra/pg, auto-created tables list, disableInit option, Pool sharing
- [createTool Reference](https://mastra.ai/reference/tools/create-tool) — inputSchema, outputSchema, execute signature
- [Mastra Server Adapters blog post](https://mastra.ai/blog/mastra-server-adapters) — Rationale, coexistence with existing routes
- [GitHub Issue #5821](https://github.com/mastra-ai/mastra/issues/5821) — Zod v4 compatibility ZodFirstPartyTypeKind error, resolved
- [GitHub Issue #7092](https://github.com/mastra-ai/mastra/issues/7092) — MCPClient.getTools() Zod v4 fix in @mastra/schema-compat
- [WorkOS Mastra Quickstart](https://workos.com/blog/mastra-ai-quick-start) — Agent + tool setup with @ai-sdk/openai pattern
- [Mastra Streaming Overview](https://mastra.ai/docs/streaming/overview) — .stream() vs .streamLegacy(), textStream iteration

---
*Stack research for: Mastra AI agent integration into existing Fastify/pnpm monorepo*
*Researched: 2026-03-05*
