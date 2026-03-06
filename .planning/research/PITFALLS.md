# Pitfalls Research: Adding Mastra Agent to ESPN Fantasy Baseball Draft Assistant

**Domain:** AI Agent Integration — Mastra + Fastify + Chrome Extension (Real-Time Auction Draft)
**Researched:** 2026-03-05
**Confidence:** HIGH (Mastra v1 docs + official release notes + GitHub issues), MEDIUM (cost estimates based on measured latency + pricing, not direct billing data)

---

## Critical Context

This document covers pitfalls specific to **adding Mastra to an existing system** — not building Mastra from scratch. The existing narrator is a single `new OpenAI()` call wrapped in a Fastify route. Mastra replaces or wraps that. The user constraint is hard: auction picks happen every 30–60 seconds, latency budget is under 3 seconds, and the user pays per-call.

**Existing system facts that affect every pitfall:**
- Current narrator: `DraftNarratorAgent` — raw OpenAI SDK, per-request instantiation, no memory, 120-call session cap
- Extension: Chrome MV3, fetches `POST /api/draft/narrate`, `AbortController` for in-flight cancel
- Backend: Fastify 4, existing `/api/*` routes, PostgreSQL via Kysely, Node.js
- Model: `gpt-4.1-mini-2025-04-14`, `max_tokens: 200`, `temperature: 0.4`
- Latency baseline: 0.47s TTFT + ~2.5s for 200 tokens = ~3s total at p50 (measured, OpenAI API)

---

## Critical Pitfalls

### Pitfall 1: maxSteps Default of 1 Silently Disables Tool Calling

**What goes wrong:**
You register tools on the Mastra agent, call `agent.generate()`, and the tools are never invoked. The agent produces a text response that ignores all the tools entirely. No error is thrown. You spend hours debugging prompt engineering when the issue is a single missing parameter.

**Why it happens:**
Mastra's `maxSteps` defaults to `1`. One step means: one LLM call, no iteration. Tool calling requires at least `maxSteps: 2` — one step to decide to call a tool, one step to process the result and generate a final response. Developers coming from the raw OpenAI SDK (where you manually parse `tool_calls` and loop) don't realize Mastra controls the loop and the default opt-out is this low.

**How to avoid:**
Always set `maxSteps` explicitly. For a narrator with 2–3 tools: `maxSteps: 4` (tool call → tool result → optional second tool → final answer). For a narrator that should answer in one pass without tools, set `maxSteps: 1` intentionally and document why.

```typescript
// Wrong — tools registered but never called
const narrator = new Agent({ tools: { getScarcityData, getBudgetStatus } });
await narrator.generate(messages); // maxSteps = 1, tools ignored

// Correct
await narrator.generate(messages, { maxSteps: 4 });
```

**Warning signs:**
- Agent responds but never calls tools you registered
- Tool execution callbacks (`onStepFinish`) never fire
- Response ignores data that tools would have provided

**Phase to address:** Mastra integration bootstrap phase — set `maxSteps` in the agent definition, not at call time, so it can't be omitted.

---

### Pitfall 2: Fastify Route Prefix Collision with Existing `/api` Routes

**What goes wrong:**
Mastra's Fastify adapter mounts its endpoints under `/api/agents`, `/api/workflows` by default. This project already has `/api/draft/narrate`, `/api/leagues`, etc. The collisions are subtle — Mastra's agent endpoints appear at `/api/agents/narrator/...` which doesn't immediately conflict, but the `/api/v1` prefix expected by future versioning gets tangled, and the middleware ordering breaks: custom routes added before `server.init()` lack Mastra context; those added after have access.

**Why it happens:**
The Fastify adapter documentation says "custom routes you add directly to the app are not affected by this prefix," but CORS configuration, rate limiting, and authentication middleware registered through Fastify's native mechanisms do not automatically apply to Mastra-registered routes. Developers assume `fastify.addHook('onRequest', authenticate)` covers everything; it does not cover Mastra's routes unless registered before `init()`.

**How to avoid:**
1. Use a non-default prefix: `{ prefix: '/api/mastra' }` to isolate Mastra routes from existing `/api/*` routes.
2. Register auth middleware **before** calling `server.init()`.
3. Explicitly configure CORS on the Fastify instance — Mastra's own CORS settings have no effect when using the adapter.
4. Be aware: custom routes registered via `registerApiRoute()` were broken (returning 404 while appearing in OpenAPI) until Mastra v1.4.0 — verify version before relying on this.

```typescript
// Correct ordering
const app = Fastify();
app.addHook('onRequest', authenticate); // BEFORE init
const server = new MastraServer({ app, mastra, prefix: '/api/mastra' });
await server.init();
// Existing routes still at /api/draft/narrate — no conflict
```

**Warning signs:**
- Auth not enforced on Mastra agent endpoints
- CORS errors from extension when hitting Mastra routes but not existing routes
- 404 on agent routes that appear in OpenAPI spec (pre-v1.4.0 bug)

**Phase to address:** Mastra integration bootstrap phase, specifically the "mount Mastra into Fastify" step.

---

### Pitfall 3: PostgreSQL Schema Collision — Mastra Auto-Creates Tables in Your Database

**What goes wrong:**
Mastra's PostgreSQL storage adapter creates its own tables (`mastra_threads`, `mastra_messages`, `mastra_traces`, `mastra_workflow_snapshot`, `mastra_evals`, `mastra_resources`, `mastra_scorers`) in your existing Postgres database on first `init()`. These are unversioned relative to Kysely migrations and invisible to your migration tooling. When you upgrade Mastra versions, new columns may be missing (`requestContext` on `mastra_scorers` is a known example from GitHub issue #11789), and Mastra will crash with schema mismatch errors.

**Why it happens:**
Mastra says "auto-creates necessary tables on first interaction" which sounds safe. But it uses `CREATE TABLE IF NOT EXISTS` — it will not add new columns to existing tables when upgrading. The tables are also not in your Kysely schema, so `db.selectFrom('mastra_threads')` won't typecheck. If you use a separate schema for your app (e.g., `public` vs `app`), the Mastra tables land in `public` by default, mixing concerns.

**How to avoid:**
1. Use Mastra's PostgreSQL storage with `schema: 'mastra'` to isolate tables in their own schema.
2. After any Mastra upgrade, manually inspect for missing columns (run Mastra's schema against your DB).
3. Pin the `@mastra/pg` version in `package.json` and treat upgrades as migrations.
4. Do NOT use the existing Kysely `db` connection for Mastra storage — create a separate `MastraStorage` instance that owns its own connection lifecycle.

```typescript
// Correct — isolated schema, separate from Kysely-managed tables
const mastraStorage = new PostgresStorage({
  connectionString: process.env.DATABASE_URL,
  schema: 'mastra', // Creates tables as mastra.mastra_threads, etc.
});
```

**Warning signs:**
- `ERROR: column "requestContext" of relation "mastra_scorers" does not exist` after upgrade
- Kysely migration tooling shows unexpected tables in schema diff
- Mastra agent silently stores no memory (storage fails but error is swallowed)

**Phase to address:** Mastra integration bootstrap — establish the storage adapter before any agent code.

---

### Pitfall 4: Unbounded Memory Growth During a 3-Hour Draft Session

**What goes wrong:**
You enable Mastra memory with `lastMessages: 20` to give the agent draft context across the 120-call session cap. Over a 3-hour, 25-round auction draft with 13 teams (325 total picks), the thread accumulates 120 messages. With the full structured payload per narration (~400–600 tokens each), the thread context hits 60,000+ tokens before the draft ends. The agent's context window fills, responses degrade, latency spikes, and cost multiplies. With `observationalMemory: true`, background compression agents add further LLM calls (Gemini 2.5 Flash by default) and latency.

**Why it happens:**
Auction draft narration payloads are large (structured JSON signals, player data, alert arrays). Developers set `lastMessages: 20` thinking this caps growth — it does not cap the token size of those 20 messages. The observational memory compression threshold is 30,000 tokens of uncompressed messages before triggering — that threshold can be hit mid-draft, causing a synchronous pause during live bidding.

**How to avoid:**
For the narrator use case, **do not use Mastra persistent memory at all.** The current architecture is correct: stateless per-call with no conversation history. The agent receives the full current engine state in every request — this is already the "working memory." Thread memory is appropriate for multi-turn conversation assistants, not for stateless signal-to-commentary translation.

If context across picks is genuinely needed, pass a manually-constructed condensed summary (last 3 narrations as a string, max 200 tokens) in the request body rather than threading through Mastra memory.

```typescript
// Wrong — memory accumulates 120 narration messages per draft
await agent.generate(messages, { threadId: draftSessionId, resourceId: userId });

// Correct — stateless, full current state sent each call
await agent.generate(messages); // no threadId, no memory overhead
```

**Warning signs:**
- Response latency increases progressively through a draft session
- Agent starts contradicting itself ("you passed on Trout earlier" when it didn't)
- Token usage reported per-call grows over the course of a session

**Phase to address:** Mastra agent design phase — explicitly document the stateless narration pattern as a constraint.

---

### Pitfall 5: Streaming SSE Does Not Work in Chrome Extension Background Service Workers

**What goes wrong:**
You migrate the narrator to use `agent.stream()` for progressive text display (show first words immediately, stream the rest). The extension switches from `fetch()` + `.json()` to reading an SSE stream. This breaks in Chrome MV3 background service workers: `EventSource` is not available in service worker context, and streaming `fetch` responses using `ReadableStream` have known reliability issues in Chrome extensions (connection drops, partial reads, service worker sleep interruption).

**Why it happens:**
Mastra's streaming uses SSE (`text/event-stream`) for agent responses. SSE requires a persistent connection. Chrome MV3 service workers are ephemeral — they can be terminated while a stream is open. The existing extension correctly uses `AbortController` with regular `fetch()` because it understands this constraint. Developers see streaming as a UX improvement and don't check extension execution context compatibility.

**How to avoid:**
Keep the narrator as a non-streaming `agent.generate()` call returning complete text. The latency budget (3s) and output size (200 tokens) don't justify streaming's UX benefit — the user would see words appear over 2.5 seconds rather than the full response at 3s. The abort-and-replace pattern already in `use-narrator.ts` handles stale requests correctly without streaming.

If streaming is genuinely needed in a future iteration, route through the extension's background service worker using `chrome.runtime.sendMessage` to a long-lived offscreen document, not directly from the content script.

**Warning signs:**
- SSE connection drops mid-response in extension (no error, just incomplete text)
- Service worker is killed while stream is open, leaving UI in loading state permanently
- `EventSource is not defined` runtime error in extension console

**Phase to address:** Extension integration phase — explicitly choose non-streaming generate() and document the MV3 constraint.

---

### Pitfall 6: Tool Design That Requires Multiple LLM Iterations Destroys Latency Budget

**What goes wrong:**
You design the Mastra narrator with tools like `getPlayerProjection(playerName)`, `getLiveAuctionValues()`, `getTeamBudgetStatus(teamId)`. The agent decides to call 2–3 tools before answering. With `maxSteps: 4`, the actual execution is: LLM call 1 (decides to call tools) → tool executions (fast, DB queries) → LLM call 2 (processes tool results, decides to call another tool) → LLM call 3 (final answer). That's 3 LLM calls at ~3s each = 9 seconds total. The auction pick is already decided.

**Why it happens:**
Tool-calling agents are designed for use cases where the agent needs to discover information it doesn't have. The narrator is the opposite: it receives a pre-computed payload with all relevant signals already summarized. Giving the narrator tools to look up data it already has in the payload causes it to call those tools redundantly, multiplying LLM calls.

**Cost implication at 120 calls/session:** Current cost = 120 × ~600 input tokens + ~200 output tokens = ~96K tokens total ≈ $0.05/session at gpt-4.1-mini pricing. With 2 extra LLM calls per trigger: cost triples to ~$0.15/session. With tool calls adding context (tool schemas + results): easily 5× the current cost.

**How to avoid:**
Keep the narrator **prompt-only, no tools.** All computation belongs in the deterministic engine (already implemented in Phase 20–23 outputs). The narrator's job is interpretation and articulation of pre-computed signals, not data retrieval. If new data is needed, add it to `NarratorPayload` (extend the TypeScript interface) rather than adding a tool.

Reserve Mastra tools for a separate "on-demand research agent" use case (e.g., "tell me about this player's injury history") that is explicitly user-initiated and not latency-constrained.

```typescript
// Wrong — tools cause multi-step LLM iteration
const narrator = new Agent({
  tools: { getPlayerProjection, getMarketPrice, getBudgetStatus }
});

// Correct — payload already contains all needed data, no tools
const narrator = new Agent({
  // instructions only, no tools
  instructions: SYSTEM_PROMPT,
  model: openai('gpt-4.1-mini-2025-04-14'),
});
```

**Warning signs:**
- Agent response time exceeds 5 seconds
- `onStepFinish` fires more than twice per narration request
- Tool call logs show the agent fetching data already present in the user message

**Phase to address:** Mastra agent design phase — enforce the "no tools on narrator" constraint in the agent definition.

---

### Pitfall 7: Mastra v1 Import Path Changes Break Existing Agent Code

**What goes wrong:**
You install `@mastra/core` and use `import { Agent } from '@mastra/core'`. This worked in pre-v1 but throws a module error in Mastra 1.0+. The framework now requires subpath imports: `import { Agent } from '@mastra/core/agent'`, `import { createTool } from '@mastra/core/tools'`. Additionally, the `createTool` execute function signature changed from `(context)` to `(inputData, context)`, which causes runtime errors when tools are called — not TypeScript errors at compile time if you're using `any`.

**Why it happens:**
Mastra v1 was released in January 2026 and reorganized its package structure for tree-shaking. All tutorials and Stack Overflow answers written before January 2026 use the old import style. The AI SDK model adapter also changed: `openai('gpt-4.1-mini')` now requires `@ai-sdk/openai` and AI SDK v5/v6 — not the `openai` npm package used directly by the existing narrator.

**Breaking changes in v1 relevant to this project:**
- `import { Agent } from '@mastra/core'` → `import { Agent } from '@mastra/core/agent'`
- `createTool` execute: `(context)` → `(inputData, context)`
- `RuntimeContext` renamed to `RequestContext`
- Memory `memoryOptions` parameter renamed to `memory`
- `stream()` returns AI SDK v5 types (not v4); use `streamLegacy()` for v4 compatibility
- Node.js 22.13.0 minimum required
- DB migration required for PostgreSQL and libSQL users

**How to avoid:**
Pin to the specific Mastra version you test against. Read the official v1 migration guide before installing. Run the provided codemods. Treat each Mastra minor version bump as a potential breaking change until the API stabilizes (it is actively developed).

**Warning signs:**
- `Module '"@mastra/core"' has no exported member 'Agent'` TypeScript error
- Tool execute functions receive `undefined` for `context` parameter
- `generateLegacy is not a function` at runtime after upgrading

**Phase to address:** Mastra integration bootstrap — pin version, run codemod, write integration test.

---

### Pitfall 8: AbortController Not Propagated to Mastra Stream

**What goes wrong:**
The extension's `use-narrator.ts` already implements in-flight request cancellation: when a new trigger fires before the previous request completes, `abortControllerRef.current.abort()` is called. With the raw `fetch()` approach this works. After migrating to Mastra client SDK, the abort signal is not propagated to the underlying stream request in certain SDK versions — the request continues server-side after the client aborts, consuming tokens and incurring cost for a response the user will never see.

**Why it happens:**
GitHub issue #5673 confirmed that `@mastra/client-js@0.10.9` had a bug where `signal` passed to `agent.stream()` was not forwarded to the underlying HTTP request. The fix required passing the abort signal at client instantiation, not at the method level. This bug is fixed in post-0.10.9 versions, but the correct usage pattern is non-obvious.

**How to avoid:**
1. Don't use the Mastra client SDK from the extension — continue using raw `fetch()` to `POST /api/draft/narrate`. The extension talks to the Fastify route, which calls `agent.generate()` internally. This avoids the client SDK's abort bug entirely.
2. If using `agent.stream()` server-side (not recommended, see Pitfall 5), pass `abortSignal` through to the agent call from the Fastify request's abort signal.

```typescript
// Extension: keep raw fetch with AbortController (already correct)
const response = await fetch(`${baseUrl}/api/draft/narrate`, {
  method: 'POST',
  signal: abortControllerRef.current.signal, // still works
  body: JSON.stringify(payload),
});

// Fastify route: pass Fastify's request abort signal to Mastra
const narration = await agent.generate(messages, {
  abortSignal: request.raw.socket.destroyed
    ? AbortSignal.abort()
    : undefined,
});
```

**Warning signs:**
- Token usage continues climbing after user navigates away from draft
- Server logs show completed responses with no corresponding frontend receipt
- Cost per session higher than expected given call count

**Phase to address:** Mastra integration phase — explicitly test abort behavior, log token usage per call.

---

### Pitfall 9: Mastra's Node.js 22.13.0 Minimum Conflicts with Production Runtime

**What goes wrong:**
The project runs Node.js 18 LTS or 20 LTS (typical for production backends). Mastra v1 requires Node.js 22.13.0 minimum. Installing Mastra in the backend fails silently or produces cryptic `ERR_UNSUPPORTED_ESM_URL_SCHEME` or native module errors at runtime. Docker base images, CI runners, and Heroku/Railway/Fly.io dyno defaults may all be below this threshold.

**Why it happens:**
Mastra v1 uses features from Node 22 including native fetch improvements, `--experimental-vm-modules` behaviors, and native `AbortController` changes. The requirement is listed in the migration guide but not prominently surfaced in `npm install` output.

**How to avoid:**
Before adding Mastra, verify current Node.js version across: local dev, Docker image, CI runner, production runtime. If below 22.13.0, plan the Node.js upgrade as a prerequisite task in the same phase as Mastra integration. Update `.nvmrc` and `engines` in `package.json` simultaneously.

```json
// package.json
{
  "engines": {
    "node": ">=22.13.0"
  }
}
```

**Warning signs:**
- `npm install @mastra/core` succeeds but `node -e "require('@mastra/core/agent')"` fails
- CI passes (if CI uses newer Node) but production deploy fails
- Cryptic module resolution errors with no clear "Node version" message

**Phase to address:** Pre-integration infrastructure phase — verify and upgrade Node.js before writing any Mastra code.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Wrap existing `DraftNarratorAgent` with Mastra without restructuring | Fast first integration | Mastra's lifecycle management conflicts with per-request class instantiation | Never — restructure at integration time |
| Use Mastra's default `libsql` in-memory storage | No DB config needed | Restarts lose all thread state; fails silently under load | Local dev only, never production |
| Skip pinning `@mastra/core` version | Always gets latest fixes | Breaking changes on any deploy; AI SDK v4/v5/v6 churn is real | Never in production |
| Enable `observationalMemory: true` without a cost model | Better long-context behavior | Adds Gemini 2.5 Flash calls you don't control; cost and latency unpredictable | Never without explicit budget approval |
| Use Mastra tools for data the payload already contains | Feels more "agentic" | 2–3× more LLM calls, 3× cost, 3× latency per narration | Never for this narrator use case |
| Mix Mastra's PostgreSQL tables with Kysely-managed tables in same schema | Simpler config | Schema drift on Mastra upgrades breaks Kysely migrations | Never — use `schema: 'mastra'` isolation |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Mastra + Fastify 4 | Registering routes then calling `init()` | Call `init()` after all hooks but before routes; use `prefix: '/api/mastra'` to avoid collision |
| Mastra + OpenAI | Using `openai` npm package directly | Use `@ai-sdk/openai` with `openai('model-id')` — Mastra uses AI SDK v5/v6 model format |
| Mastra + existing PostgreSQL | Pointing `MastraStorage` at same schema as app tables | Use `{ schema: 'mastra' }` to isolate Mastra tables |
| Mastra + Chrome extension | Using Mastra client SDK from content script | Use raw `fetch()` to Fastify route — client SDK has SSE limitations in MV3 service workers |
| Mastra memory + draft session | Using `threadId` for draft session ID | Do not use memory for narrator — stateless per-call is correct for this use case |
| AI SDK v4 vs v5 | Mixing `stream()` (v5) with v4 model adapters | Use `streamLegacy()`/`generateLegacy()` when using AI SDK v4 models; new methods require v5 |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `maxSteps > 1` with tools on narrator | Each narration takes 6–9s instead of 3s | Keep `maxSteps: 1` for prompt-only narrator, never add tools | On every trigger when tools are present |
| Thread memory enabled during 120-call draft session | Latency grows throughout session; token count grows | Disable memory for narrator agent entirely | After ~30 calls when context fills |
| `observationalMemory` compression triggers mid-pick | 2–5s pause during live auction nomination | Disable observational memory for narrator; use stateless calls | When thread hits ~30K tokens (~50 narrations with full payloads) |
| Structured output with separate extraction model | Two LLM calls per narration (generate + extract) | Use prompt-enforced plain text output, not `structuredOutput` | Every call — doubles cost and latency |
| Tools returning large JSON results | Tool result fills context window, leaving no room for final answer | Cap tool outputs at 500 tokens, filter to only needed fields | When tools return full player arrays or projection tables |
| Full draft state in every narration (unfiltered) | Input token count at 2,000+ per call vs. current ~600 | Pre-filter in `buildNarratorPayload()` before sending to Mastra | Already addressed by existing payload builder — don't regress this |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing Mastra's auto-generated agent endpoints without auth | Any client can call agent with arbitrary prompts — prompt injection, cost exhaustion | Always register auth middleware before `server.init()`; use `prefix: '/api/mastra'` and block from public access |
| Logging full `NarratorPayload` at debug level | Draft strategy leaks in logs; OpenAI API key visible if logged together | Redact `apiKey` field; log only `triggerReason` and call count at debug level |
| Trusting `resourceId` from request body | Caller can impersonate another user's draft session | Derive `resourceId` from authenticated session, never accept it from client |
| OpenAI API key in environment without rotation plan | Key exhausted by runaway agent (no `maxSteps` set) | Set explicit `maxSteps` cap; add server-side rate limiting on `/api/draft/narrate` (already implemented: 30/min) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing "loading" state for full 3s before any text appears | User stresses during live auction nomination — 3s feels eternal when a pick costs $50 | Show last narration until new one replaces it; only show spinner on manual "Ask for advice" button |
| Streaming partial narration tokens | Text reads awkwardly mid-sentence during live bid | Non-streaming generate() gives complete, grammatically correct text atomically |
| Agent "thinking out loud" about tools (tool call reasoning exposed) | Confusing intermediate text like "I need to check the budget first..." | No tools on narrator means no intermediate reasoning visible |
| Memory causing agent to reference prior picks incorrectly | "You passed on Soto earlier" when pick belongs to opponent | Stateless calls with full current state prevent stale cross-pick confusions |

---

## "Looks Done But Isn't" Checklist

- [ ] **Mastra installed:** Verify `@mastra/core` version is pinned; check `node --version >= 22.13.0`; verify imports use subpath style (`@mastra/core/agent`)
- [ ] **Fastify integration:** Confirm auth hook registered before `server.init()`; confirm Mastra routes use non-default prefix; confirm CORS set via Fastify native (not Mastra config)
- [ ] **Database:** Confirm Mastra storage uses `schema: 'mastra'`; run Mastra's schema init; verify no collision with Kysely migration state
- [ ] **Agent definition:** Confirm `maxSteps` is explicitly set; confirm no tools on narrator agent; confirm model uses `@ai-sdk/openai` format
- [ ] **Memory disabled:** Confirm no `threadId` or `resourceId` passed in narrator calls; confirm no memory adapter attached to narrator agent
- [ ] **AbortController:** Confirm extension still uses raw `fetch()` with `signal`; confirm server-side request abort tested manually
- [ ] **Cost baseline:** Measure token count per call before and after Mastra migration; confirm cost ≤ current baseline
- [ ] **Session cap:** Confirm 120-call server-side enforcement still works through Mastra wrapper (it lives in rate limiter on route, not in agent)
- [ ] **Node.js version:** Updated in Docker base image, `.nvmrc`, CI matrix, and `package.json` `engines` field

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| maxSteps too low — tools silently ignored | LOW | Add `maxSteps` param; redeploy |
| Route prefix collision breaks existing endpoints | MEDIUM | Change Mastra prefix; update extension `backendUrl` if path changed; redeploy |
| PostgreSQL schema collision after Mastra upgrade | MEDIUM | Run `ALTER TABLE mastra.mastra_scorers ADD COLUMN IF NOT EXISTS ...` manually; pin Mastra version |
| Memory growth caused draft-session latency spike | LOW | Remove `threadId` from narrator `generate()` call; no data lost (narrator has no state to preserve) |
| Node.js version mismatch breaks production deploy | HIGH | Emergency Node 22 upgrade across all infrastructure; may require Docker base image update and full CI rebuild |
| Cost explosion from accidental tool-calling loop | MEDIUM | Set `maxSteps: 1`; add per-session token budget enforcement via OpenAI's `max_tokens` (already set to 200) |
| v1 import path errors post-upgrade | LOW | Run Mastra's automated codemods: `npx @mastra/codemod`; fix remaining manually |

---

## Cost Estimation: Mastra Agent vs. Current Narrator

All estimates use gpt-4.1-mini-2025-04-14 at $0.40/M input tokens, $1.60/M output tokens (OpenAI API, March 2026).

**Current narrator (raw OpenAI SDK):**
- Input: ~600 tokens/call (system prompt ~200 + payload ~400)
- Output: ~150 tokens/call (120 words)
- Per call: (600 × $0.40 + 150 × $1.60) / 1,000,000 = $0.000240 + $0.000240 = **$0.00048**
- Per 120-call session: **~$0.058**

**Mastra prompt-only agent (no tools, no memory) — target:**
- Overhead: +50–100 tokens input for Mastra's internal prompt formatting
- Per call: ~$0.00053 (+10% vs. current)
- Per 120-call session: **~$0.064** (acceptable)

**Mastra with 2 tools, maxSteps: 4 — worst case:**
- Tool schemas add ~300 input tokens; tool results add ~400 tokens; second LLM call adds another full-context call
- Effective: 3 LLM calls × ~1,500 tokens input + ~150 tokens output = $0.0018 per narration
- Per 120-call session: **~$0.22** (3.8× current cost)

**Mastra with observationalMemory enabled:**
- Adds Gemini 2.5 Flash calls for compression (uncontrolled frequency)
- Estimated +$0.001–0.003 per compression cycle (unknown frequency)
- Not recommended for narrator use case

**Recommendation:** Mastra prompt-only is cost-neutral. Mastra with tools is a cost regression. Do not enable tools on the narrator agent.

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| maxSteps default silently disables tools | Mastra integration bootstrap | Integration test: register a dummy tool, confirm it is never called (tools should not be on narrator) |
| Fastify route prefix collision | Mastra integration bootstrap | `GET /api/draft/narrate` and `GET /api/mastra/agents` both return 200 with no interference |
| PostgreSQL schema collision | Pre-integration infrastructure | `\dn` in psql shows `mastra` schema; `\dt mastra.*` shows Mastra tables; `\dt public.*` shows no Mastra tables |
| Memory growth / thread accumulation | Mastra agent design | 120 calls in a test session: final call latency ≤ first call latency ± 20% |
| SSE streaming breaks in Chrome MV3 | Extension integration | Narrator works after background service worker is killed and restarted mid-session |
| Tools multiply LLM calls | Mastra agent design | Confirm `onStepFinish` fires exactly once per narrate call; token usage per call ≤ 800 |
| v1 import path breaking changes | Version pinning | CI: `tsc --noEmit` passes; no `@mastra/core` top-level imports in codebase |
| AbortController not propagated | Extension integration | Trigger two narrations within 500ms; confirm only one completes (log on server side) |
| Node.js version mismatch | Pre-integration infrastructure | `node --version` in CI, Docker, and production all show ≥22.13.0 |

---

## Sources

- [Mastra Agent Memory Documentation](https://mastra.ai/docs/agents/agent-memory) — thread/resource ownership, lastMessages, storage requirements. Confidence: HIGH.
- [Mastra Memory Overview](https://mastra.ai/docs/memory/overview) — storage backend requirements, auto-table creation. Confidence: HIGH.
- [Mastra Observational Memory](https://mastra.ai/docs/memory/observational-memory) — compression triggers (30K tokens), default model (Gemini 2.5 Flash), async vs. sync behavior. Confidence: HIGH.
- [Mastra Working Memory](https://mastra.ai/docs/memory/working-memory) — scope exclusivity pitfall, storage adapter requirements. Confidence: HIGH.
- [Mastra Server Adapters Documentation](https://mastra.ai/docs/server/server-adapters) — middleware ordering, prefix configuration, CORS behavior in adapters. Confidence: HIGH.
- [Mastra v1 Migration Guide](https://mastra.ai/guides/migrations/upgrade-to-v1/overview) — import subpath changes, createTool signature, Node 22 requirement, DB migration requirement. Confidence: HIGH.
- [Mastra Streaming Migration Guide](https://mastra.ai/blog/migration-guide-streaming) — stream/streamLegacy rename, AI SDK v5 type changes, modelSettings restructure. Confidence: HIGH.
- [Mastra Agent Orchestration Blog](https://mastra.ai/blog/announcing-mastra-improved-agent-orchestration-ai-sdk-v5-support) — maxSteps control, Mastra now owns the agent loop (not AI SDK). Confidence: HIGH.
- [Mastra Server Adapter Announcement](https://mastra.ai/blog/mastra-server-adapters) — Fastify/Express adapter integration pattern. Confidence: HIGH.
- [GitHub Issue #5673: Abort stream not working](https://github.com/mastra-ai/mastra/issues/5673) — AbortController bug in Mastra client SDK v0.10.9, fixed in PR #5686. Confidence: HIGH.
- [GitHub Issue #11789: Missing migration for new columns](https://github.com/mastra-ai/mastra/issues/11789) — PostgreSQL schema drift on Mastra upgrade, requestContext column missing. Confidence: HIGH.
- [GitHub Issue #2930: maxSteps docs unclear](https://github.com/mastra-ai/mastra/issues/2930) — confirms maxSteps default of 1, docs gap acknowledged. Confidence: HIGH.
- [GitHub Issue #11856: Thread and resource isolation](https://github.com/mastra-ai/mastra/issues/11856) — threadId isolation gap in listMessages API. Confidence: HIGH.
- [Mastra Latency Optimization Blog](https://mastra.ai/blog/building-fast-reliable-input-processors) — sub-500ms achievable with prompt surgery, schema optimization. Confidence: HIGH.
- [GPT-4.1 mini Performance Analysis](https://artificialanalysis.ai/models/gpt-4-1-mini) — TTFT 0.47–0.77s, 62–79 t/s output speed, ~3–4s for 200 token completion. Confidence: MEDIUM (measured benchmarks, not real-time SLAs).
- [Mastra Changelog 2026-01-20](https://mastra.ai/blog/changelog-2026-01-20) — v1 release details, adapter packages for Express/Fastify/Hono/Koa. Confidence: HIGH.
- [Dynamic Agents: Runtime Context in Mastra](https://mastra.ai/blog/dynamic-agents) — context injection pattern, per-request isolation requirements. Confidence: HIGH.

---

*Pitfalls research for: Adding Mastra AI agent to ESPN Fantasy Baseball Draft Assistant (Fastify backend + Chrome extension)*
*Researched: 2026-03-05*
