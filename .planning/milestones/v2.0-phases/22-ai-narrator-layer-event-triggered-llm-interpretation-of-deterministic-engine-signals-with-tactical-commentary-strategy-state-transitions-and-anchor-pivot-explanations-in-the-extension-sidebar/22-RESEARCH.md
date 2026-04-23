# Phase 22: AI Narrator Layer - Research

**Researched:** 2026-03-05
**Domain:** LLM narration layer over deterministic draft signals — OpenAI API integration, Fastify endpoint, React UI, debounce/deduplication, session call cap
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Architecture: Hybrid (client engine + server-side LLM)**
- Keep the deterministic engine running client-side in the extension
- Add a backend API endpoint that accepts structured engine signals and returns LLM-generated narration
- Extension POSTs signals to backend only when trigger conditions are met
- No API keys stored in the extension — all LLM calls go through the Fastify backend
- Graceful degradation: if backend is unreachable, extension still works with engine signals only

**LLM Provider: OpenAI**
- Use OpenAI (not Claude) for narration
- Use a fast, cheap model (gpt-4o-mini or similar) for <2s latency
- Backend manages the OpenAI API key via environment variable

**Trigger conditions**
- Any alert severity > 0.65
- Strategy state changes (archetype shift, punt detected, budget pressure change)
- User manually requests advice (button in sidebar)
- NOT on every pick — only when something meaningful changes
- Cap at 120 LLM calls per draft session

**Narrator contract**
- Output < 120 words
- Tone: tactical, calm, direct, no fluff
- Never recalculates math or generates values — only interprets structured signals
- High-signal only

**What the LLM receives (structured state only)**
- Draft phase, active alerts, category gaps, budget summary, archetype, scarcity, inflation, current auction player
- NEVER: full projection tables, raw player lists, or math formulas

**Strategy object (anchor/pivot logic)**
- User defines primary anchor player and fallback paths
- Engine detects when anchor is lost and transitions strategy state
- Narrator explains the transition

**Sidebar presentation**
- Dedicated narration section
- Manual "Ask for advice" button
- Loading state while waiting for LLM response

### Claude's Discretion (research these)
- Exact system prompt wording for the narrator
- How to debounce/deduplicate rapid trigger events
- Whether to cache recent narrations to avoid redundant LLM calls
- OpenAI model selection (gpt-4o-mini vs gpt-4o vs other)
- Strategy object UI (how user defines anchors/fallbacks)
- How to count toward the 120-call cap

### Deferred Ideas (OUT OF SCOPE)
(none listed — all Claude's discretion areas are in scope)
</user_constraints>

---

## Summary

This phase adds an LLM narration layer on top of the deterministic draft engine. The engine already produces structured signals (alerts, archetype, category gaps, budget curve, inflation, scarcity) — the narrator's job is to interpret these signals into a 1-3 sentence tactical commentary. The architecture is straightforward: a new Fastify `POST /api/draft/narrate` endpoint accepts a structured payload, calls OpenAI, and returns a short string. The extension client adds a trigger-and-debounce layer above the existing `useDraftEngineSignals` hook to decide when to POST.

The codebase is already well-structured for this addition. The extension has a working `api-client.ts` with request deduplication and timeout patterns. The backend's `src/agents/` pattern fits a new `draft-narrator.ts` agent. The extension sidebar (`DraftSidebar.tsx`) has a clean section-based layout where a `DraftNarrator` component can slot in above `EngineAlerts`. The biggest decisions are: (1) model selection, (2) exact system prompt wording, (3) deduplication/debounce strategy, (4) session call cap storage, and (5) the strategy object data structure.

**Primary recommendation:** Use `gpt-4.1-mini` (model ID `gpt-4.1-mini-2025-04-14`) over `gpt-4o-mini` — it has lower TTFT (0.77s vs 3.03s), outperforms gpt-4o-mini on instruction following, and its 1M token context window is overkill for this use case but confirms headroom. Non-streaming chat completions are the right pattern (120-word max output arrives in one shot, no streaming complexity). Store the session call counter in Zustand (not persisted) so it resets on draft reload.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | 6.25.0 (latest) | OpenAI API client for backend | Official SDK, full TypeScript types, handles retries/timeouts |
| Fastify 4 | already installed | Backend HTTP framework | Already in use; adds one route |
| Zustand | ^5.0.11 | Extension state management | Already in use; add narrator state slice |
| React | ^18.2.0 | Extension UI | Already in use |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.22.4 | Request body validation on backend | Already in use in backend; validate narrator payload schema |
| `@sinclair/typebox` | (via Fastify) | Fastify schema validation | Can use inline JSON schema objects (Fastify's built-in approach) — no separate install needed |
| AbortController | browser/node native | Request cancellation | Use in extension to cancel in-flight narrator requests on new trigger |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gpt-4.1-mini` | `gpt-4o-mini` | gpt-4o-mini has TTFT of ~3s vs gpt-4.1-mini's 0.77s; gpt-4.1-mini also better at instruction following |
| `gpt-4.1-mini` | `gpt-4.1-nano` | nano is cheaper but less reliable for instruction-constrained (<120 words, tactical) output |
| Non-streaming | Streaming | Streaming adds complexity for a 120-word cap; non-streaming simpler and adequate |
| Session Zustand counter | Redis/DB persistence | Cap is per-draft-session, not cross-session; Zustand (non-persisted slice) is correct |

**Installation (backend only):**
```bash
cd packages/backend && pnpm add openai@^6.25.0
```

No extension dependencies to add.

---

## Architecture Patterns

### Recommended File Structure

```
packages/backend/src/
├── agents/
│   └── draft-narrator.ts          # NEW: NarratorAgent class, calls OpenAI
├── api/
│   └── draft.ts                   # MODIFY: add POST /api/draft/narrate route

packages/extension/
├── lib/
│   ├── use-narrator.ts            # NEW: hook managing trigger logic, debounce, session cap
│   └── narrator-state.ts         # NEW: Zustand slice for narrator (sessionCallCount, narration, loading)
├── components/
│   └── DraftNarrator.tsx          # NEW: UI component (narration display + "Ask for advice" button)
```

`DraftSidebar.tsx` imports `DraftNarrator` and renders it between header and `EngineAlerts`.

---

### Pattern 1: Backend NarratorAgent

The agent follows the existing agent pattern: constructor accepts `logger`, has a single `narrate(payload)` method.

```typescript
// packages/backend/src/agents/draft-narrator.ts
import OpenAI from "openai";
import type { Logger } from "pino";

export interface NarratorPayload {
  draftPhase: "early" | "mid" | "late";  // pick count buckets: 0-5, 6-15, 16+
  alerts: Array<{
    type: string;
    severity: number;
    title: string;
    detail: string;
    position?: string;
    category?: string;
  }>;
  inflation: {
    percentOverMarket: number;
    confidence: "high" | "low";
  };
  budgetSummary: {
    remainingBudget: number;
    pacingStatus: "ahead" | "on-track" | "behind";
    budgetPressure: number;
    maxBidRecommendation: number;
  };
  archetype: {
    archetypeLabel: string | null;
    archetypeConfidence: number;
    puntedCategories: string[];
    pivotPlayers: Array<{ playerName: string; dollarValue: number; category: string }>;
  } | null;
  topScarcity: Array<{
    position: string;
    scarcityIndex: number;
    myTeamNeeds: boolean;
    supply: number;
    demand: number;
  }>;
  categoryGaps: Array<{
    category: string;
    gapZScore: number;
    categoryRiskScore: number;
  }>;
  currentAuctionPlayer: {
    playerName: string;
    currentBid?: number;
    positions?: string[];
    espnValue?: number;
    maxBidRecommendation?: number;
  } | null;
  triggerReason: "alert" | "archetype_change" | "budget_pressure" | "user_request";
  strategy: {
    anchorPlayerName: string | null;
    anchorAcquired: boolean;
    fallbackPaths: string[];
    strategyState: "nominal" | "anchor_lost" | "pivot_needed";
  } | null;
}

const SYSTEM_PROMPT = `You are a tactical fantasy baseball auction draft advisor.
You receive structured draft signals and produce a single, concise tactical comment.
Rules:
- Maximum 120 words total
- Tone: direct, calm, no fluff. Like a sharp coach talking to a prepared player.
- Never re-derive math or invent values — only interpret the signals given to you
- Focus on the most actionable single insight for the current moment
- If a strategy anchor was lost, explain the pivot clearly
- If a player is currently nominated, lead with bid guidance if relevant
- Use plain language, no jargon for jargon's sake`;

export class DraftNarratorAgent {
  private client: OpenAI;
  private logger?: Logger;

  constructor(logger?: Logger) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable not set");
    }
    this.client = new OpenAI({ apiKey });
    this.logger = logger;
  }

  async narrate(payload: NarratorPayload): Promise<string> {
    const userMessage = this.buildUserMessage(payload);

    const completion = await this.client.chat.completions.create({
      model: "gpt-4.1-mini-2025-04-14",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 200,     // ~120 words at ~1.5 tokens/word with some headroom
      temperature: 0.4,    // Low: tactical, consistent, not creative
    });

    const text = completion.choices[0]?.message?.content ?? "";
    this.logger?.debug({ triggerReason: payload.triggerReason }, "[DraftNarrator] narration generated");
    return text.trim();
  }

  private buildUserMessage(payload: NarratorPayload): string {
    const parts: string[] = [];

    parts.push(`DRAFT PHASE: ${payload.draftPhase}`);
    parts.push(`TRIGGER: ${payload.triggerReason}`);

    if (payload.currentAuctionPlayer) {
      const p = payload.currentAuctionPlayer;
      parts.push(`NOMINATED: ${p.playerName} (${(p.positions || []).join("/")})`
        + (p.currentBid !== undefined ? ` | Current bid: $${p.currentBid}` : "")
        + (p.espnValue !== undefined ? ` | ESPN value: $${p.espnValue}` : "")
        + (p.maxBidRecommendation !== undefined ? ` | Your max: $${p.maxBidRecommendation}` : ""));
    }

    if (payload.alerts.length > 0) {
      parts.push("ACTIVE ALERTS:");
      for (const a of payload.alerts.slice(0, 3)) {
        parts.push(`  - [${a.type.toUpperCase()} sev=${a.severity.toFixed(2)}] ${a.title}: ${a.detail}`);
      }
    }

    parts.push(`INFLATION: ${payload.inflation.percentOverMarket > 0 ? "+" : ""}${Math.round(payload.inflation.percentOverMarket)}% (confidence: ${payload.inflation.confidence})`);

    parts.push(`BUDGET: $${payload.budgetSummary.remainingBudget} remaining | Pacing: ${payload.budgetSummary.pacingStatus} | Max bid: $${payload.budgetSummary.maxBidRecommendation}`);

    if (payload.archetype) {
      const a = payload.archetype;
      parts.push(`ARCHETYPE: ${a.archetypeLabel ?? "unclear"} (confidence: ${Math.round(a.archetypeConfidence * 100)}%)`);
      if (a.puntedCategories.length > 0) {
        parts.push(`PUNTED: ${a.puntedCategories.join(", ")}`);
      }
      if (a.pivotPlayers.length > 0) {
        parts.push(`PIVOT OPTIONS: ${a.pivotPlayers.map(p => `${p.playerName} $${p.dollarValue} (unlocks ${p.category})`).join(", ")}`);
      }
    }

    const highScarcity = payload.topScarcity.filter(s => s.scarcityIndex > 0.65);
    if (highScarcity.length > 0) {
      parts.push(`SCARCITY: ${highScarcity.map(s => `${s.position} ${Math.round(s.scarcityIndex * 100)}%${s.myTeamNeeds ? " (YOU NEED)" : ""}`).join(", ")}`);
    }

    const highRiskCats = payload.categoryGaps.filter(c => c.categoryRiskScore > 0.65);
    if (highRiskCats.length > 0) {
      parts.push(`CAT GAPS: ${highRiskCats.map(c => `${c.category} (risk ${Math.round(c.categoryRiskScore * 100)}%, z=${c.gapZScore.toFixed(1)})`).join(", ")}`);
    }

    if (payload.strategy) {
      const s = payload.strategy;
      parts.push(`STRATEGY: ${s.strategyState.toUpperCase()} | Anchor: ${s.anchorPlayerName ?? "none"} (acquired: ${s.anchorAcquired})`);
      if (s.fallbackPaths.length > 0) {
        parts.push(`  Fallback paths: ${s.fallbackPaths.join(", ")}`);
      }
    }

    return parts.join("\n");
  }
}
```

**Source:** OpenAI Node SDK documentation (github.com/openai/openai-node), confirmed version 6.25.0 from npm registry.

---

### Pattern 2: Backend POST /api/draft/narrate Route

Add to `packages/backend/src/api/draft.ts` (same file as other draft routes). No auth required — the extension doesn't have a session token. Rate limit via existing Fastify rate limit plugin.

```typescript
// Add inside draftRoutes() in draft.ts

app.post<{
  Body: NarratorPayload;
}>(
  "/api/draft/narrate",
  {
    config: {
      rateLimit: {
        max: 30,           // 30 per minute per IP
        timeWindow: "1 minute",
      },
    },
  },
  async (request, reply) => {
    const payload = request.body as NarratorPayload;

    // Basic guard: require at least one meaningful signal
    if (!payload.alerts && !payload.archetype && !payload.currentAuctionPlayer) {
      return reply.code(400).send({ error: "No meaningful signals provided" });
    }

    try {
      const narrator = new DraftNarratorAgent(request.log as any);
      const narration = await narrator.narrate(payload);
      return { narration, generatedAt: new Date().toISOString() };
    } catch (error) {
      request.log.error({ error }, "[DraftNarrator] Failed to generate narration");
      return reply.code(503).send({ error: "Narration service temporarily unavailable" });
    }
  },
);
```

**Note:** CORS is already configured to allow `https://fantasy.espn.com` (the extension's origin). No CORS changes needed.

---

### Pattern 3: Extension Trigger Logic (use-narrator.ts hook)

The trigger logic lives in a custom hook that watches `engineSignals` and fires when conditions are met. The critical debounce/deduplication approach:

1. **Debounce window:** 1500ms after last trigger condition fires (rapid alerts cluster into one call)
2. **Deduplication key:** Hash of `alert IDs + archetypeLabel + pacingStatus + triggerReason` — skip call if identical to last call
3. **Session cap:** `sessionCallCount` in Zustand non-persisted state (resets on draft init/reset)
4. **AbortController:** Cancel in-flight request when a newer trigger fires during the debounce window

```typescript
// packages/extension/lib/use-narrator.ts
import { useEffect, useRef, useCallback } from "react";
import type { DraftEngineSignals } from "./engine";
import { useNarratorStore } from "./narrator-state";
import { useDraftStore } from "./draft-state";
import type { NarratorPayload } from "./narrator-types";

const DEBOUNCE_MS = 1500;
const SESSION_CAP = 120;
const NARRATOR_URL_KEY = "backendUrl";

function buildDedupeKey(signals: DraftEngineSignals, triggerReason: string): string {
  const alertIds = signals.alerts.map(a => a.id).sort().join(",");
  const archetype = signals.archetype?.archetypeLabel ?? "null";
  const pacing = signals.budgetCurve.pacingStatus;
  return `${alertIds}|${archetype}|${pacing}|${triggerReason}`;
}

export function useNarrator(engineSignals: DraftEngineSignals | null) {
  const { sessionCallCount, incrementCallCount, setNarration, setLoading } = useNarratorStore();
  const { remainingBudget, myRoster, currentAuctionPlayer, strategy, leagueCategories, auctionValues } = useDraftStore();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastDedupeKeyRef = useRef<string>("");
  const prevArchetypeRef = useRef<string | null>(null);
  const prevPacingRef = useRef<string | null>(null);

  const fireNarration = useCallback(async (
    signals: DraftEngineSignals,
    triggerReason: NarratorPayload["triggerReason"]
  ) => {
    if (sessionCallCount >= SESSION_CAP) return;

    const dedupeKey = buildDedupeKey(signals, triggerReason);
    if (dedupeKey === lastDedupeKeyRef.current) return; // duplicate
    lastDedupeKeyRef.current = dedupeKey;

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    incrementCallCount();

    try {
      const { backendUrl } = await chrome.storage.local.get([NARRATOR_URL_KEY]);
      const baseUrl = (backendUrl || "http://localhost:3001").replace(/\/+$/, "");

      const payload = buildNarratorPayload(signals, triggerReason, {
        remainingBudget,
        myRoster,
        currentAuctionPlayer,
        strategy,
        auctionValues,
        leagueCategories,
      });

      const response = await fetch(`${baseUrl}/api/draft/narrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setNarration(data.narration ?? "");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn("[Narrator] Failed:", err);
        setLoading(false);
        // Graceful degradation: don't show error — just keep showing engine signals
      }
    } finally {
      setLoading(false);
    }
  }, [sessionCallCount, incrementCallCount, setNarration, setLoading, remainingBudget, myRoster, currentAuctionPlayer, strategy, auctionValues, leagueCategories]);

  // Watch for trigger conditions
  useEffect(() => {
    if (!engineSignals) return;
    if (sessionCallCount >= SESSION_CAP) return;

    let triggerReason: NarratorPayload["triggerReason"] | null = null;

    // Check alert severity trigger
    const highAlerts = engineSignals.alerts.filter(a => a.severity > 0.65);
    if (highAlerts.length > 0) {
      triggerReason = "alert";
    }

    // Check archetype change trigger
    const newArchetype = engineSignals.archetype?.archetypeLabel ?? null;
    if (newArchetype !== prevArchetypeRef.current && engineSignals.archetype?.picksAnalyzed >= 3) {
      triggerReason = "archetype_change";
      prevArchetypeRef.current = newArchetype;
    }

    // Check budget pressure change trigger
    const newPacing = engineSignals.budgetCurve.pacingStatus;
    if (newPacing !== prevPacingRef.current) {
      triggerReason = "budget_pressure";
      prevPacingRef.current = newPacing;
    }

    if (!triggerReason) return;

    // Debounce: clear existing timer and set new one
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fireNarration(engineSignals, triggerReason!);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [engineSignals?.alerts, engineSignals?.archetype, engineSignals?.budgetCurve.pacingStatus]);

  // Manual trigger (for "Ask for advice" button)
  const requestAdvice = useCallback(() => {
    if (!engineSignals || sessionCallCount >= SESSION_CAP) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    fireNarration(engineSignals, "user_request");
  }, [engineSignals, sessionCallCount, fireNarration]);

  return { requestAdvice };
}
```

**Key insight:** The `useEffect` dependency array uses `engineSignals?.alerts` (array reference), `engineSignals?.archetype` (object reference), and `engineSignals?.budgetCurve.pacingStatus` (string). Since `computeDraftEngine` is memoized in `useDraftEngineSignals` and only re-runs on `allPicks` change, these references only change on meaningful events — not on every render.

---

### Pattern 4: Narrator State (Zustand Slice)

A new, non-persisted Zustand store (separate from `draft-state.ts` to avoid polluting the persisted store):

```typescript
// packages/extension/lib/narrator-state.ts
import { create } from "zustand";

interface NarratorState {
  narration: string;
  isLoading: boolean;
  sessionCallCount: number;
  lastTriggeredAt: number | null;

  setNarration: (text: string) => void;
  setLoading: (loading: boolean) => void;
  incrementCallCount: () => void;
  resetSession: () => void;
}

export const useNarratorStore = create<NarratorState>((set) => ({
  narration: "",
  isLoading: false,
  sessionCallCount: 0,
  lastTriggeredAt: null,

  setNarration: (text) => set({ narration: text, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
  incrementCallCount: () => set((state) => ({
    sessionCallCount: state.sessionCallCount + 1,
    lastTriggeredAt: Date.now(),
  })),
  resetSession: () => set({ narration: "", sessionCallCount: 0, lastTriggeredAt: null }),
}));
```

Call `resetSession()` in the extension when `draft-state.ts` `reset()` is called (e.g., on draft restart detected from DOM).

---

### Pattern 5: DraftNarrator UI Component

```tsx
// packages/extension/components/DraftNarrator.tsx
import React from "react";
import { useNarratorStore } from "../lib/narrator-state";

interface DraftNarratorProps {
  onAskAdvice: () => void;
  sessionCallCount: number;
  sessionCap?: number;
}

export default function DraftNarrator({ onAskAdvice, sessionCallCount, sessionCap = 120 }: DraftNarratorProps) {
  const { narration, isLoading } = useNarratorStore();

  const callsRemaining = sessionCap - sessionCallCount;

  return (
    <div className="border-b border-surface-tertiary">
      <div className="px-3 py-2 bg-surface-secondary flex items-center justify-between">
        <span className="text-body-sm font-semibold text-content">AI Advisor</span>
        <div className="flex items-center gap-2">
          <span className="text-body-xs text-content-secondary">{callsRemaining} left</span>
          <button
            onClick={onAskAdvice}
            disabled={isLoading || callsRemaining <= 0}
            className="text-body-xs text-accent hover:text-accent-hover disabled:text-content-secondary px-2 py-1 rounded border border-surface-tertiary disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </div>

      <div className="px-3 py-2 bg-surface min-h-[3rem]">
        {isLoading ? (
          <div className="flex items-center gap-2 text-body-xs text-content-secondary">
            <span className="animate-pulse">Analyzing...</span>
          </div>
        ) : narration ? (
          <p className="text-body-sm text-content leading-relaxed">{narration}</p>
        ) : (
          <p className="text-body-xs text-content-secondary italic">
            Waiting for a significant draft moment...
          </p>
        )}
      </div>
    </div>
  );
}
```

---

### Pattern 6: Strategy Object (Anchor/Pivot)

The strategy object is user-defined (anchor player name + fallback category paths) and lives in Zustand's `draft-state.ts`. It is NOT persisted (anchor changes draft-to-draft).

```typescript
// Add to DraftState in draft-state.ts:
strategy: {
  anchorPlayerName: string | null;      // e.g. "Shohei Ohtani"
  anchorAcquired: boolean;              // flips true when found in myRoster
  fallbackPaths: string[];              // e.g. ["power-speed", "pitching-heavy"]
  strategyState: "nominal" | "anchor_lost" | "pivot_needed";
} | null;
```

**UI for setting anchors:** A simple text input in a collapsible "Strategy" section within the DraftSidebar, shown only in auction draft mode. The user types a player name; the extension watches `myRoster` and `allPicks` to detect if the anchor was acquired or lost (outbid).

Strategy state transitions:
- `nominal` → `anchor_lost`: anchor player appears in `allPicks` but NOT in `myRoster` (outbid)
- `anchor_lost` → `pivot_needed`: when budget pressure becomes "behind" after anchor loss
- Any state → `nominal`: user resets or sets new anchor

The engine does NOT currently track strategy state — this is new state added to the Zustand store and updated by the content script DOM observer.

---

### Anti-Patterns to Avoid

- **Triggering on every `allPicks` change:** The narrator fires on trigger conditions (severity > 0.65, archetype change, pacing change), not on every pick. The `useDraftEngineSignals` hook already debounces recomputation to `allPicks` changes, but that's still every pick.
- **Storing API key in extension storage:** All LLM calls go through the backend. Never add `OPENAI_API_KEY` to `chrome.storage`.
- **Persisting narration in Zustand:** Narrations are ephemeral (per-session). The narrator Zustand store must NOT use the `persist` middleware.
- **Streaming for short outputs:** Non-streaming is simpler and correct for a 120-word max output. Streaming would add complexity with no UX benefit at this output length.
- **Sending raw player arrays to LLM:** The `buildUserMessage()` function serializes only structured summary fields. Never send the full `rankings[]` or `auctionValues[]` arrays.
- **Using `useEffect` with `engineSignals` object directly:** The `engineSignals` object reference changes on every rerender. Use specific sub-fields (`engineSignals?.alerts`, `engineSignals?.archetype`) in the dependency array to prevent excessive trigger evaluations.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAI API calls | Custom fetch wrapper | `openai` npm package | Handles retries, type safety, streaming helpers, error types |
| Request deduplication | Custom Map tracking | `AbortController` + key comparison (already in api-client.ts pattern) | Proven pattern already in codebase |
| Rate limiting backend | Custom counter | Fastify `@fastify/rate-limit` (already installed) | Per-IP limiting, Redis-backed when available |
| Debounce | Manual `setTimeout` tracking | `useRef` + `setTimeout` (simple, framework-free) | External debounce libs add overhead; useRef pattern is idiomatic React |

**Key insight:** The codebase already has the `dedupedRequest` pattern in `api-client.ts` and `throttle` helper. The narrator's deduplication uses a lighter approach (key comparison rather than inflight promise tracking) because narrator calls are intentionally serialized — we never want two concurrent narrator calls.

---

## Common Pitfalls

### Pitfall 1: CORS Block from Extension
**What goes wrong:** Extension on `https://fantasy.espn.com` posts to backend; CORS rejects because the POST route isn't in allowed origins.
**Why it happens:** The backend CORS config explicitly lists `https://fantasy.espn.com` for GET routes already. POST requests with JSON body send a preflight OPTIONS request.
**How to avoid:** The existing CORS config in `src/index.ts` already allows `https://fantasy.espn.com` with `credentials: true`. Verify the `/api/draft/narrate` POST route sends appropriate Content-Type headers and the backend handles OPTIONS preflights (Fastify's `@fastify/cors` handles this by default).
**Warning signs:** 405 Method Not Allowed or CORS errors in the extension console.

### Pitfall 2: Triggering on Every Pick
**What goes wrong:** Trigger logic fires narrator on every `allPicks` change, blowing through the 120-call cap within 20 picks.
**Why it happens:** `engineSignals.alerts` always has items above 0.65 severity (they're filtered to that threshold). Every pick changes `allPicks`, recomputes engine, potentially generates the same high-severity alert again.
**How to avoid:** The deduplication key (`buildDedupeKey`) must include alert IDs. Same alert IDs + same archetype + same pacing = skip the call, even if severity is still high. The debounce window (1500ms) also clusters rapid picks.
**Warning signs:** `sessionCallCount` exceeds 20 before the draft is half over.

### Pitfall 3: OpenAI API Key Not Set
**What goes wrong:** Server throws at startup or on first narrator request.
**Why it happens:** `OPENAI_API_KEY` is not in the backend `.env` file.
**How to avoid:** The `DraftNarratorAgent` constructor throws clearly: `throw new Error("OPENAI_API_KEY environment variable not set")`. The `/api/draft/narrate` route catches this and returns 503. The extension handles 503 gracefully (no crash, no error shown to user — just no narration).
**Warning signs:** 503 response from `/api/draft/narrate` with `"Narration service temporarily unavailable"` message.

### Pitfall 4: Narrator State Accidentally Persisted
**What goes wrong:** The `narration` and `sessionCallCount` survive browser restarts, meaning the cap carries over incorrectly.
**Why it happens:** If `narrator-state.ts` uses the `persist` middleware from Zustand (like `draft-state.ts` does), state is saved to `chrome.storage.local`.
**How to avoid:** Create `narrator-state.ts` as a plain `create<NarratorState>()` call WITHOUT `persist`. The session call count is intentionally ephemeral.
**Warning signs:** `sessionCallCount` starts non-zero when extension loads fresh.

### Pitfall 5: gpt-4.1-mini Model ID Typo
**What goes wrong:** OpenAI API returns 404 with "model not found" if the model ID is wrong.
**Why it happens:** The model ID is `gpt-4.1-mini-2025-04-14`, not `gpt-4.1-mini` alone.
**How to avoid:** Use the full versioned model ID. Define it as a constant at the top of `draft-narrator.ts`.
**Warning signs:** OpenAI SDK throws `NotFoundError` or similar.

### Pitfall 6: Debounce Reference Stale Closure
**What goes wrong:** The debounced `fireNarration` callback captures stale `sessionCallCount` from closure.
**Why it happens:** The `useCallback` for `fireNarration` has `sessionCallCount` in its dependency array, but when the setTimeout fires 1500ms later, the ref-captured closure may be stale.
**How to avoid:** Use a `useRef` for the latest callback (the "latest ref pattern") or read `sessionCallCount` from the Zustand store directly inside the callback rather than from closure. Zustand store reads are always current: `useNarratorStore.getState().sessionCallCount`.
**Warning signs:** Session cap not enforced correctly — narrator fires after 120 calls.

---

## Code Examples

### Non-streaming Chat Completion (Backend)

```typescript
// Source: openai npm package docs, verified version 6.25.0
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const completion = await client.chat.completions.create({
  model: "gpt-4.1-mini-2025-04-14",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ],
  max_tokens: 200,
  temperature: 0.4,
});

const text = completion.choices[0]?.message?.content ?? "";
```

### Abort-controller + fetch pattern (Extension)

```typescript
// Source: MDN Fetch API with AbortController — native browser API
const controller = new AbortController();
const response = await fetch(`${baseUrl}/api/draft/narrate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal: controller.signal,
});
// To cancel: controller.abort();
```

### Zustand non-persisted store creation

```typescript
// Source: Zustand docs — omit persist middleware for session-only state
import { create } from "zustand";

const useNarratorStore = create<NarratorState>((set) => ({
  // state and actions
}));
// No `persist` wrapper = not saved to chrome.storage.local
```

### Reading Zustand state outside React (for stale closure avoidance)

```typescript
// Source: Zustand docs — .getState() for non-reactive reads
const currentCount = useNarratorStore.getState().sessionCallCount;
if (currentCount >= SESSION_CAP) return;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gpt-4o-mini` for fast/cheap | `gpt-4.1-mini-2025-04-14` | April 2025 | Lower TTFT (0.77s vs 3.03s), better instruction following |
| `gpt-3.5-turbo` | deprecated in favor of `gpt-4o-mini` → `gpt-4.1-mini` | 2023-2025 | Don't use `gpt-3.5-turbo` |
| Custom retry logic | `openai` SDK handles retries natively | v4+ | Don't add manual retry loop around OpenAI calls |
| Streaming always | Non-streaming for short outputs | Current best practice | For ≤200 tokens output, non-streaming is simpler with no latency difference at the UX level |

**Deprecated/outdated:**
- `gpt-3.5-turbo`: Do not use; `gpt-4.1-mini` is cheaper and better
- `gpt-4o-mini`: Still valid but superseded by `gpt-4.1-mini` (lower latency, better instruction following per benchmarks)
- `openai` SDK versions < 4: breaking API changes; current project should install `^6.25.0`

---

## Open Questions

1. **System prompt wording — final version**
   - What we know: The tactical, direct tone is locked. The 120-word limit is locked. The no-math-recalculation rule is locked.
   - What's unclear: The exact wording for the "strategy anchor lost" transition explanation. Should the prompt explicitly mention "you are watching a fantasy baseball auction draft" or keep it abstract?
   - Recommendation: Include the baseball auction context explicitly. The model performs better with concrete domain context. Draft the prompt in the `DraftNarratorAgent` constant, then iterate during implementation.

2. **Narration caching — last N narrations**
   - What we know: Deduplication by key prevents identical calls. But if the same signal state returns after a few picks (e.g., inflation persists), should we re-trigger?
   - What's unclear: Whether the 1500ms debounce + deduplication key is sufficient, or if a TTL cache (e.g., "don't call narrator for same key within 60 seconds") adds value.
   - Recommendation: Start with deduplication key only. Add a 60-second TTL cache as `lastKeyFiredAtRef` if users report repetitive narrations in testing.

3. **Strategy anchor UI — where exactly in sidebar**
   - What we know: The DraftSidebar has fixed sections. Adding a collapsible "Strategy Setup" section with a text input is the natural fit.
   - What's unclear: Whether the anchor UI should be a pre-draft setup (before picks start) or inline during draft.
   - Recommendation: Show the Strategy Setup section as collapsible panel, always accessible during draft. Pre-populate nothing; user types player name. Simple text match (normalized name comparison) against `allPicks` and `myRoster`.

4. **OPENAI_API_KEY in deployment**
   - What we know: Backend reads from `process.env.OPENAI_API_KEY`.
   - What's unclear: Whether there's a `.env` file convention or Doppler/secrets manager in use.
   - Recommendation: Add `OPENAI_API_KEY=` to the backend `.env.example` file with a comment. The planner should include a task for this.

---

## Sources

### Primary (HIGH confidence)
- `openai` npm package registry — version 6.25.0 confirmed via `npm info openai version`
- `github.com/openai/openai-node` — TypeScript chat completions usage pattern
- Codebase files read directly: `packages/extension/lib/engine/types.ts`, `api-client.ts`, `draft-state.ts`, `use-draft-engine.ts`, `DraftSidebar.tsx`, `packages/backend/src/index.ts`, `packages/backend/src/api/draft.ts`

### Secondary (MEDIUM confidence)
- `artificialanalysis.ai/models/gpt-4-1-mini` — gpt-4.1-mini TTFT 0.77s, 63.5 t/s, $0.40/$1.60 per 1M tokens (cross-referenced with GitHub release notes)
- `github.blog/changelog/2025-04-14` — gpt-4.1-mini GA release date confirmed April 14, 2025
- `artificialanalysis.ai/models/gpt-4o-mini` — gpt-4o-mini TTFT 3.03s comparison baseline
- WebSearch results on Fastify TypeScript POST route patterns (consistent with existing codebase patterns)

### Tertiary (LOW confidence)
- WebSearch on system prompt best practices for concise tactical output — general prompting guidance, not domain-specific
- WebSearch on React debounce patterns — standard patterns, but not LLM-call-specific

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — openai 6.25.0 confirmed from npm; gpt-4.1-mini confirmed released April 2025
- Architecture: HIGH — patterns derived directly from existing codebase conventions (agent pattern, api-client.ts, Zustand)
- System prompt: MEDIUM — general best practices applied; requires iteration during implementation
- Pitfalls: HIGH — derived from direct codebase analysis + known Zustand/React debounce gotchas

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (OpenAI model landscape moves fast; gpt-4.1-mini model ID may have a newer snapshot; re-verify before implementation)
