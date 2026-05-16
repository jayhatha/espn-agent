# Phase 95: NotificationBus → SlackNotifier Rename — Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode)

<domain>
## Phase Boundary

Rename the `NotificationBus` interface and its two implementations to names that accurately describe what they do — Slack notifications — rather than implying a general event bus architecture that does not exist.

Callers: `live-poll.ts`, `snapshot-orchestrator.ts`, `standings-change-log.ts`
File: `packages/backend/src/utils/notification-bus.ts`

</domain>

<decisions>
## Renames

| Old                           | New                                                              |
| ----------------------------- | ---------------------------------------------------------------- |
| `NotificationBus` (interface) | `SlackNotifier`                                                  |
| `NoOpNotificationBus`         | `NullSlackNotifier`                                              |
| `SlackWebhookNotificationBus` | `SlackWebhookNotifier`                                           |
| `createNotificationBus()`     | `createSlackNotifier()`                                          |
| File: `notification-bus.ts`   | Keep filename (avoids import churn for non-TypeScript consumers) |

The `StandingsChangeEventPayload` interface name is accurate — keep it.

</decisions>

<code_context>

## Existing Code Insights

- `notification-bus.ts`: interface + 2 classes + 1 factory function
- 3 callers: `live-poll.ts` (import + usage), `snapshot-orchestrator.ts` (import + usage), `standings-change-log.ts` (import as type + constructor param)
- All callers use `createNotificationBus()` factory or `NotificationBus` type — both need updating

</code_context>

<specifics>
## Requirements

1. Rename all 4 symbols in `notification-bus.ts`
2. Update all 3 callers
3. `npx tsc --noEmit` passes with 0 errors

</specifics>
