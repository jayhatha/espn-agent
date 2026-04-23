---
quick_id: 20260423-streaming-live-standings
description: Streaming Results — refresh neighborhood standings immediately when live_poll SSE event fires
status: in-progress
created: 2026-04-23
---

# Quick Task: Streaming Results — Live Standings Sync

## Goal

The Streaming Results page's "Standings — Today" neighborhood panel only refreshes every 5 minutes via `refetchInterval`. When the backend live-poll runs and emits a `live_poll` SSE event, the neighborhood standings must be immediately invalidated so users see the updated real-time standings without waiting up to 5 minutes.

## Root Cause

In `changelog/page.tsx`, the SSE `onmessage` handler processes `live_poll` events only to update `lastPolledAt`. It does not call `queryClient.invalidateQueries` for the neighborhood query.

```ts
} else if (msg.type === "live_poll") {
  const d = msg.data as { polledAt: string };
  setLastPolledAt(new Date(d.polledAt)); // ← no invalidation
}
```

## Plan

### Task 1 — Invalidate neighborhood on live_poll SSE event

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx`

In the SSE `onmessage` handler, after processing a `live_poll` event, also call:
```ts
queryClient.invalidateQueries({
  queryKey: ["standings-neighborhood", leagueId],
});
```

This causes the neighborhood to refetch immediately when the live poll fires, showing the fresh standings within seconds of the ESPN poll completing.

### Task 2 — Update neighborhood label from "Standings — Today" to "Live Standings"

**File:** `packages/frontend/src/app/leagues/[id]/changelog/page.tsx`

Update the `StandingsNeighborhood` component header from `Standings — Today` to `Live Standings` to accurately describe the intraday data source (not official end-of-day).

Also pass `snapshotDate` from the API response to show the data timestamp in the header.

## Verification

- [ ] When a `live_poll` SSE event is received, the neighborhood panel refetches (network tab shows a new request)
- [ ] The neighborhood label reads "Live Standings" (not "Standings — Today")  
- [ ] The 5-minute `refetchInterval` remains as a fallback when SSE is disconnected
