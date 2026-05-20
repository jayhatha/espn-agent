---
slug: remove-slack-morning-report
date: 2026-05-15
status: in-progress
---

# Remove Slack and Morning Report

## Files to Delete

- `packages/backend/src/agents/morning-report.ts`
- `packages/backend/src/api/slack.ts`
- `packages/backend/src/utils/slack-gateway.ts`
- `packages/backend/src/utils/slack-verify.ts`
- `packages/backend/src/utils/__tests__/slack-verify.test.ts`
- `packages/backend/src/utils/feature-flags.ts`
- `packages/backend/src/utils/notification-bus.ts`
- `packages/backend/src/workers/morning-report-worker.ts`
- `packages/backend/src/workers/slack-approval-worker.ts`

## Files to Modify

- `packages/backend/src/db/schema.ts` — remove Slack table interfaces + Database entries
- `packages/backend/src/agents/standings-change-log.ts` — move StandingsChangeEventPayload inline, remove bus dep
- `packages/backend/src/agents/live-poll.ts` — remove createSlackNotifier, update instantiation
- `packages/backend/src/agents/snapshot-orchestrator.ts` — remove createSlackNotifier, update instantiation
- `packages/backend/src/api/internal.ts` — remove morning-report route and isSlackEnabled
- `packages/backend/src/index.ts` — remove slack import, raw body parser, feature flag block
