# Quick Task: Detect League Settings — Scoring Categories

**Slug:** detect-league-settings-scoring-categories
**Date:** 2026-05-19

## Goal

Ensure the league's actual scoring categories (from ESPN API) are stored at connect time and accessible via a dedicated API endpoint. Currently categories are only stored during snapshot, leaving newly-connected leagues without settings until the first snapshot completes.

## Root Causes Identified

1. `POST /api/leagues/connect` fetches `mSettings` (has categories) but does NOT write `league_settings_version`
2. No `GET /api/leagues/:id/settings` endpoint — frontend can only see categories via projected standings or team overview (requires snapshot data)
3. No `getLeagueSettings()` in frontend `api.ts`

## What's Already Working

- ESPN adapter correctly parses `scoringItems` → `ESPNScoringCategory[]` via `ESPN_STAT_MAP`
- `getOrCreateSettingsVersion()` in snapshot orchestrator correctly stores categories
- All calculation agents (standings, waiver, trade) read categories from `league_settings_version`
- Standings, team overview, and projected standings API endpoints return categories from stored settings

## Tasks

1. In `packages/backend/src/api/leagues.ts` connect handler: after `normalizeLeagueData`, call `getOrCreateSettingsVersion`-equivalent logic to write `league_settings_version` immediately (before snapshot runs)
2. Add `GET /api/leagues/:leagueId/settings` route in `leagues.ts` that returns `categories`, `roster_slots`, `scoring_format`, `effective_date` from latest `league_settings_version`
3. Add `getLeagueSettings(leagueId: number)` to `packages/frontend/src/lib/api.ts`
4. Commit with atomic message
