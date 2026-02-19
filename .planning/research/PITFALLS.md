# Pitfalls: Fantasy Baseball Tool Development

> Common mistakes when building fantasy sports tools and transitioning from private tool to public product

**Research Date:** 2026-02-19
**Domain:** Fantasy Baseball Management Tools
**Context:** Brownfield ESPN Fantasy Baseball app → Multi-tenant Public Product

---

## Table of Contents

1. [ESPN API & Data Integration](#espn-api--data-integration)
2. [Statistics Calculation](#statistics-calculation)
3. [Player Identity & Data Quality](#player-identity--data-quality)
4. [Multi-Tenancy & Security](#multi-tenancy--security)
5. [Performance & Scalability](#performance--scalability)
6. [Frontend Architecture](#frontend-architecture)
7. [Product & User Experience](#product--user-experience)
8. [Operational Concerns](#operational-concerns)

---

## ESPN API & Data Integration

### Pitfall 1: Assuming ESPN API Stability

**Problem:** ESPN's undocumented fantasy API changes without notice, breaking cookie auth, payload structures, or rate limits.

**Warning Signs:**
- Sudden 401s across multiple leagues
- New fields appearing in raw payloads with null/unexpected values
- Successful auth but empty response arrays
- Increased 5xx errors during peak times (live drafts, waiver wire processing)

**Prevention Strategy:**
- Store raw ESPN payloads (`league_raw_payload`) with schema fingerprints (ALREADY IMPLEMENTED ✓)
- Implement circuit breakers for ESPN API calls
- Add schema version detection: hash ESPN response structure, alert on new hashes
- Build fallback UI that surfaces degraded states gracefully
- Monitor ESPN community forums/Discord for API change reports

**Phase Mapping:**
- **Phase 1 (Foundation):** Circuit breakers, enhanced logging with request/response correlation IDs
- **Phase 2 (Public Beta):** Schema fingerprint alerting, graceful degradation UI
- **Ongoing:** Community monitoring, quarterly ESPN API audit

**Current Status:** ⚠️ PARTIALLY VULNERABLE - raw payload archival exists but no circuit breakers or schema monitoring

---

### Pitfall 2: Cookie-Based Auth at Scale

**Problem:** ESPN auth cookies (SWID + espn_s2) are user-specific, expire unpredictably, and storing them in plaintext violates user trust + compliance (GDPR, CCPA).

**Warning Signs:**
- Users reporting "league disconnected" without changing passwords
- Support tickets asking "why do you need my cookies?"
- Inability to answer "how are my ESPN credentials stored?"
- Cookies expiring mid-season requiring re-auth

**Prevention Strategy:**
- **Encrypt cookies at rest** (design doc requirement, NOT IMPLEMENTED)
  - Use AWS KMS, GCP Secret Manager, or HashiCorp Vault
  - Never log cookie values (even in error traces)
- Implement cookie refresh flow:
  - Detect 401s → flag league as `auth_expired`
  - Email user with re-auth link (don't auto-disconnect)
- Build OAuth flow (if ESPN ever supports it) or browser extension approach
- Document auth security in public-facing privacy policy

**Phase Mapping:**
- **Phase 1 (Foundation - CRITICAL):** Encrypt cookies at rest, remove cookie values from logs
- **Phase 2 (Public Beta):** Cookie expiration detection + user notification
- **Phase 3 (Public GA):** Browser extension or OAuth alternative

**Current Status:** 🚨 CRITICAL VULNERABILITY - cookies stored in plaintext

---

### Pitfall 3: Free Agent Data Never Fetched

**Problem:** ESPN API free agent endpoint returns empty arrays by default (requires complex filtering/pagination). Waiver recommendations are useless without FA pool.

**Warning Signs:**
- `GET /api/leagues/:id/free-agents` always returns `[]`
- Waiver recommendations hardcoded to 0.5 delta (CURRENT STATE)
- Users manually entering player names to evaluate adds

**Prevention Strategy:**
- Reverse-engineer ESPN's FA endpoint params:
  - `filterSlotIds`, `filterStatsForSourceIds`, `filterStatsForSplitTypeIds`
  - Pagination via `offset` param (default page size: 50)
- Cache FA pool per league (refresh daily or on-demand)
- Pre-populate common player universe from FanGraphs projections
- Consider secondary data source (Yahoo, MLB Stats API) for FA availability

**Phase Mapping:**
- **Phase 1 (Foundation):** ESPN FA endpoint implementation + daily cache
- **Phase 2 (Public Beta):** Hybrid approach (ESPN + FanGraphs player universe)

**Current Status:** 🚨 BLOCKING FEATURE - waiver recommendations non-functional

---

## Statistics Calculation

### Pitfall 4: Rate Stat Projection Math Errors

**Problem:** Averaging rate stats (AVG, ERA, WHIP, OBP) instead of using component-based math produces incorrect projections.

**Warning Signs:**
- Projected AVG = (current .300 + ROS .280) / 2 = .290 (WRONG)
- Trade impact simulations only handle counting stats (CURRENT STATE)
- User reports "projected stats don't match my spreadsheet"

**Prevention Strategy:**
- Always use component formulas from `packages/shared/src/formulas.ts` (ALREADY IMPLEMENTED for display ✓)
- Extend to simulation/projection code:
  - Current: `H_current / AB_current`
  - ROS: `H_ros / AB_ros`
  - Final: `(H_current + H_ros) / (AB_current + AB_ros)`
- Add integration tests comparing to known manual calculations
- Never store computed rate stats in DB (store components only)

**Phase Mapping:**
- **Phase 1 (Foundation - CRITICAL):** Fix `TradeRecommendationAgent` rate stat simulation
- **Phase 1:** Add component-based projection tests (batters + pitchers)

**Current Status:** 🚨 CRITICAL BUG - trade simulations broken for rate stats

---

### Pitfall 5: Incomplete Stat Category Support

**Problem:** League settings allow custom categories (QS, OPS+, K/9) that app doesn't recognize, causing projection failures.

**Warning Signs:**
- Leagues with non-standard categories marked `is_degraded`
- Missing columns in projected standings tables
- User requests for "why isn't OPS+ supported?"

**Prevention Strategy:**
- Parse `league_settings_version.settings_json.categories` dynamically
- Build stat formula registry with fallback:
  - Supported: AVG, HR, RBI, SB, OPS, ERA, WHIP, K, W, SV, QS, HLD
  - Unsupported: Mark category as `degraded`, show "N/A" in UI
- Document supported stat types in onboarding

**Phase Mapping:**
- **Phase 2 (Public Beta):** Dynamic category parsing, graceful "unsupported" UI
- **Phase 3 (Public GA):** Extended stat support (K/9, K/BB, OPS+, etc.)

**Current Status:** ⚠️ RISK - assumes standard ESPN categories

---

## Player Identity & Data Quality

### Pitfall 6: Disconnected Player Matching

**Problem:** `PlayerIdentityResolutionAgent` exists but isn't wired into projections ingest. FanGraphs "Ronald Acuna" vs ESPN "Ronald Acuña Jr." never match.

**Warning Signs:**
- Projections uploaded but team projections stay degraded
- Same player appears twice (ESPN version + FanGraphs version)
- Manual SQL needed to fix player_identity_map

**Prevention Strategy:**
- Integrate fuzzy matching into `ProjectionsIngestAgent`:
  - After CSV parse, call `PlayerIdentityResolutionAgent.resolve()`
  - Store match confidence scores, flag low-confidence (<0.7) for review
- Build admin UI for manual identity mapping
- Fallback chain: exact name match → fuzzy match → manual review queue
- Use MLB Player ID (MLBAM ID) as canonical identifier if available

**Phase Mapping:**
- **Phase 1 (Foundation):** Wire identity resolution into ingest, add confidence threshold
- **Phase 2 (Public Beta):** Admin UI for manual mapping, MLBAM ID integration

**Current Status:** 🚨 BLOCKING FEATURE - projections ingest unreliable

---

### Pitfall 7: Stale Projections Treated as Current

**Problem:** Uploading FanGraphs RoS projections once in April, using them in September without flagging staleness.

**Warning Signs:**
- September projections show 400 AB remaining for injured players
- Users ask "why does it think Ohtani will pitch 100 IP?"
- `projections_run.run_date` is 120+ days old

**Prevention Strategy:**
- Define staleness threshold (e.g., 14 days)
- Mark snapshots as `degraded` when `latest_projection_run.run_date < NOW() - INTERVAL '14 days'`
- Add `degraded_reasons: ["projections_stale"]`
- UI banner: "Projections last updated [date]. Upload fresh data for accurate recommendations."
- Auto-fetch updated FanGraphs Depth Charts (if API available) or prompt user

**Phase Mapping:**
- **Phase 1 (Foundation):** Staleness detection + degraded flag
- **Phase 2 (Public Beta):** UI prompts for re-upload
- **Phase 3 (Public GA):** Automated FanGraphs data refresh (if feasible)

**Current Status:** ⚠️ RISK - no staleness detection

---

### Pitfall 8: Ignoring Injury/Transaction Updates

**Problem:** Projections assume full health. Player gets injured, ESPN marks IL, but app still projects 500 AB.

**Warning Signs:**
- Waiver recs suggest dropping healthy players for IL players
- Trade impact ignores that player is out 6 weeks
- No integration with `league_transaction_event` table

**Prevention Strategy:**
- Parse ESPN injury designations from roster data
- Zero-out projections for IL players (or pro-rate based on return timeline)
- Build transaction feed ingestion (DESIGN DOC PLANNED, NOT IMPLEMENTED)
- Surface injury flags in UI recommendations

**Phase Mapping:**
- **Phase 2 (Public Beta):** Injury status parsing, projection adjustments
- **Phase 3 (Public GA):** Transaction feed integration

**Current Status:** ⚠️ RISK - projections ignore real-world context

---

## Multi-Tenancy & Security

### Pitfall 9: Leaking League Data Across Tenants

**Problem:** User A queries `/api/leagues/123/teams` and sees User B's private league because no authorization checks exist.

**Warning Signs:**
- No user authentication system (CURRENT STATE - auth endpoints exist but not enforced)
- API routes don't verify `userId` owns `leagueId`
- Exposed league IDs in URLs (predictable integers)

**Prevention Strategy:**
- Implement session-based or JWT auth (auth endpoints exist at `api/auth.ts` and `api/auth-oauth.ts` - NOT INTEGRATED)
- Add middleware: `ensureAuthenticated`, `ensureLeagueOwnership`
- Database-level RLS (Row Level Security) in PostgreSQL
- Use UUIDs for league IDs (not auto-increment integers)
- Never trust client-provided `leagueId` without ownership verification

**Phase Mapping:**
- **Phase 1 (Foundation - CRITICAL):** Auth middleware integration, league ownership checks
- **Phase 2 (Public Beta):** PostgreSQL RLS, UUID migration

**Current Status:** 🚨 CRITICAL VULNERABILITY - no authorization layer

---

### Pitfall 10: Unencrypted Sensitive Data

**Problem:** Beyond ESPN cookies, storing user emails, payment info (if monetized), or API keys in plaintext.

**Warning Signs:**
- Database dumps contain readable email addresses
- No encryption key management strategy
- Compliance audit fails (GDPR, SOC 2)

**Prevention Strategy:**
- Encrypt at rest: cookies (Phase 1), PII (Phase 2), payment tokens (Phase 3)
- Use bcrypt/argon2 for passwords (if implementing user accounts)
- TLS for all connections (Postgres, Redis, API)
- Key rotation policy (quarterly)

**Phase Mapping:**
- **Phase 1 (Foundation):** Cookie encryption, TLS enforcement
- **Phase 2 (Public Beta):** PII encryption, key rotation
- **Phase 3 (Public GA):** SOC 2 audit, compliance documentation

**Current Status:** 🚨 CRITICAL VULNERABILITY - plaintext cookies, unclear PII handling

---

### Pitfall 11: Missing Rate Limiting

**Problem:** User (or attacker) spams `/api/leagues/:id/snapshot` triggering thousands of ESPN API calls, burning API quota or getting IP banned.

**Warning Signs:**
- ESPN returns 429 Too Many Requests
- Single user triggering 100+ snapshots/hour
- Redis BullMQ queue backlog explodes

**Prevention Strategy:**
- Per-user rate limits: 10 manual snapshots/day, 100 API calls/hour
- Per-league snapshot lock (prevent concurrent snapshots for same league)
- Exponential backoff on ESPN API failures
- Queue priority: automated daily snapshots > manual triggers

**Phase Mapping:**
- **Phase 1 (Foundation):** Snapshot job lock, basic rate limiting
- **Phase 2 (Public Beta):** Per-user quotas, Redis-based rate limiter

**Current Status:** 🚨 CRITICAL RISK - no rate limiting, no job locks

---

## Performance & Scalability

### Pitfall 12: N+1 Queries in Projections

**Problem:** Loading 500 players → 500 separate `SELECT * FROM player_projection WHERE espn_player_id = ?` queries.

**Warning Signs:**
- `/api/leagues/:id/teams/:teamId/trades/recommendations` takes 10+ seconds
- Database connection pool exhausted
- Logs show thousands of identical query patterns

**Prevention Strategy:**
- Batch load player projections: `WHERE espn_player_id IN (?, ?, ...)`
- Add guard: `if (playerIds.length === 0) return []` (Kysely generates invalid SQL for empty IN clause - KNOWN ISSUE)
- Use Kysely query builder's `.select()` to fetch only needed columns
- Add database indexes: `player_projection(espn_player_id, run_id)`

**Phase Mapping:**
- **Phase 1 (Foundation):** Batch loading, empty array guards
- **Phase 2 (Public Beta):** Database index optimization, query profiling

**Current Status:** ⚠️ RISK - likely present in recommendation endpoints

---

### Pitfall 13: Snapshot Job Concurrency Chaos

**Problem:** Daily cron triggers snapshot for 1,000 leagues at 3 AM, overwhelming Redis/Postgres/ESPN API.

**Warning Signs:**
- BullMQ worker crashes at 3 AM
- ESPN API bans IP for excessive requests
- Database max connections hit (502 errors in API)

**Prevention Strategy:**
- Stagger snapshot jobs: randomize schedule across 3-6 AM window
- Worker concurrency limits: 5 concurrent snapshot jobs max
- Implement job priority: premium users > free users
- Circuit breaker on ESPN API: pause all jobs if error rate >10%

**Phase Mapping:**
- **Phase 2 (Public Beta):** Job staggering, concurrency limits
- **Phase 3 (Public GA):** Priority tiers, circuit breakers

**Current Status:** ⚠️ RISK - single worker, no concurrency management

---

### Pitfall 14: Frontend Hardcoded API URLs

**Problem:** `localhost:3001` hardcoded in all frontend pages. Deploy breaks instantly.

**Warning Signs:**
- `api.ts` client library exists but unused (CURRENT STATE)
- Production frontend tries to call `localhost:3001` → CORS errors
- Each page duplicates fetch logic

**Prevention Strategy:**
- Environment-based API URL: `NEXT_PUBLIC_API_URL`
- Centralize API client: migrate all pages to use `lib/api.ts`
- Build shared fetch wrapper with error handling, retry logic
- Add API health check endpoint for frontend to validate connectivity

**Phase Mapping:**
- **Phase 1 (Foundation - CRITICAL):** Env var API URLs, migrate to `api.ts`
- **Phase 2 (Public Beta):** Shared error handling, retry logic

**Current Status:** 🚨 BLOCKING DEPLOYMENT - hardcoded localhost

---

## Frontend Architecture

### Pitfall 15: No Shared UI Components

**Problem:** Every page re-implements tables, loading spinners, error states. Bug fixes require changes in 10+ files.

**Warning Signs:**
- `packages/frontend/src/components/` is empty (CURRENT STATE)
- Copy-pasted table rendering code across pages
- Inconsistent loading states (some show spinners, some show "Loading...")

**Prevention Strategy:**
- Build component library:
  - `<PlayerTable>`, `<LoadingSpinner>`, `<ErrorBoundary>`, `<StatDisplay>`
- Use TanStack Query's loading/error states consistently
- Storybook for component development (optional but recommended)

**Phase Mapping:**
- **Phase 1 (Foundation):** Extract 5 core components (Table, Loading, Error, Card, Button)
- **Phase 2 (Public Beta):** Full component library, Storybook

**Current Status:** ⚠️ TECH DEBT - maintenance nightmare

---

### Pitfall 16: localStorage Team Selection Breaks Multi-Device

**Problem:** User selects "Team A" on desktop, switches to mobile, sees wrong team (or null).

**Warning Signs:**
- `localStorage` key `league_${leagueId}_team` not synced (CURRENT STATE)
- User confusion: "why does the app forget my team?"
- No server-side user preferences table

**Prevention Strategy:**
- Phase 1: Keep localStorage but add fallback (first team in league)
- Phase 2: Store team preference in database (`user_league_preferences` table)
- Sync on login: server preference > localStorage > default first team

**Phase Mapping:**
- **Phase 1 (Foundation):** Add fallback logic
- **Phase 2 (Public Beta):** Server-side preference storage

**Current Status:** ⚠️ UX ISSUE - works on single device only

---

### Pitfall 17: Recharts Installed But Unused

**Problem:** Trends page renders tables instead of charts. Recharts bundle size shipped but not used.

**Warning Signs:**
- `package.json` includes Recharts (CURRENT STATE)
- Trends page shows tabular data (CURRENT STATE)
- Users expect visual time series charts

**Prevention Strategy:**
- Phase 1: Remove unused dependency (save 100KB bundle size)
- Phase 2: Implement charts with lightweight library (Chart.js, Apache ECharts) or Recharts if needed
- Missing API endpoints: `category-total` and `projected-category` time series (DESIGN DOC NOTED)

**Phase Mapping:**
- **Phase 1 (Foundation):** Remove unused deps OR implement charts (pick one)
- **Phase 2 (Public Beta):** Full time series chart suite

**Current Status:** ⚠️ TECH DEBT - unused dependency, missing features

---

## Product & User Experience

### Pitfall 18: Broken Navigation Links

**Problem:** Home page links to `/projections`, `/waivers`, `/trends` which are 404s. Correct routes are `/leagues/[id]/...`.

**Warning Signs:**
- Home page navigation broken (CURRENT STATE)
- Users land on 404 pages immediately after signup
- Poor first impression

**Prevention Strategy:**
- Fix home page links to require league selection first
- Add league selector dropdown in nav bar
- Redirect `/waivers` → `/leagues` with prompt "Select a league first"

**Phase Mapping:**
- **Phase 1 (Foundation - CRITICAL):** Fix navigation, add league selector

**Current Status:** 🚨 CRITICAL UX - broken onboarding

---

### Pitfall 19: No Onboarding Flow

**Problem:** User signs up, sees empty dashboard, no guidance on "connect ESPN league" → "upload projections" → "view recommendations".

**Warning Signs:**
- High drop-off after signup
- Support tickets: "how do I get started?"
- No empty state UI

**Prevention Strategy:**
- Onboarding checklist:
  1. Connect ESPN League (with cookie tutorial)
  2. Upload FanGraphs Projections (with sample CSV)
  3. View first snapshot
- Empty states: "No leagues connected. Click here to add your first league."
- Tooltips/guided tour (optional: use Intro.js or similar)

**Phase Mapping:**
- **Phase 2 (Public Beta):** Onboarding flow, empty states
- **Phase 3 (Public GA):** Interactive tutorial

**Current Status:** ⚠️ UX RISK - high abandonment likely

---

### Pitfall 20: Ignoring Fantasy Baseball Seasonality

**Problem:** Launching in October (off-season) with features optimized for in-season play (waiver recs, standings projections).

**Warning Signs:**
- October launch plan with no draft tools
- User interest spikes in March, app unprepared
- Ignoring keeper league workflows (year-round activity)

**Prevention Strategy:**
- Season-aware feature prioritization:
  - **Feb-March:** Draft assistant (UNIMPLEMENTED)
  - **April-Sept:** Waivers, trades, standings projections (CURRENT FOCUS)
  - **Oct-Jan:** Keeper decisions, offseason research tools
- Communicate roadmap with seasonal context

**Phase Mapping:**
- **Phase 2 (Public Beta):** Soft launch in Feb with draft tools ready
- **Phase 3 (Public GA):** Full launch by Opening Day (late March)

**Current Status:** ⚠️ TIMING RISK - no draft assistant

---

## Operational Concerns

### Pitfall 21: No ESPN API Monitoring

**Problem:** ESPN API changes on Tuesday, app breaks, nobody notices until user complaints flood in Friday.

**Warning Signs:**
- No alerting on 401/500 error spikes
- Manual checking of app health
- Users report issues before internal team

**Prevention Strategy:**
- Synthetic monitoring: cron job pings ESPN API every 15 min
- Alert on: >5% error rate, new schema fingerprints, avg response time >3s
- Datadog/Sentry/Prometheus integration
- Slack/PagerDuty alerts for critical failures

**Phase Mapping:**
- **Phase 1 (Foundation):** Basic error logging, schema fingerprint detection
- **Phase 2 (Public Beta):** Full monitoring stack, alerting

**Current Status:** 🚨 CRITICAL RISK - blind to failures

---

### Pitfall 22: No Database Backup Strategy

**Problem:** Postgres instance crashes, lose all league connections, projections, historical snapshots.

**Warning Signs:**
- No automated backups configured
- No disaster recovery plan
- Single database instance (no replicas)

**Prevention Strategy:**
- Automated daily backups (retain 30 days)
- Point-in-time recovery (PITR) enabled
- Test restore quarterly
- Read replicas for high availability (Phase 3)

**Phase Mapping:**
- **Phase 1 (Foundation - CRITICAL):** Automated backups, PITR
- **Phase 3 (Public GA):** Read replicas, multi-region

**Current Status:** 🚨 CRITICAL RISK - data loss risk

---

### Pitfall 23: Hardcoded Secrets in Code

**Problem:** ESPN cookie examples, database URLs, Redis passwords in source code or .env files committed to Git.

**Warning Signs:**
- `.env` file in Git history
- Database password in `docker-compose.yml`
- Hardcoded API keys in code

**Prevention Strategy:**
- Git secrets scanning (pre-commit hook or GitHub Advanced Security)
- Use secret managers: AWS Secrets Manager, Railway env vars
- `.env.example` with placeholder values only
- Audit Git history for leaked secrets

**Phase Mapping:**
- **Phase 1 (Foundation - CRITICAL):** Remove secrets from Git, use env vars
- **Phase 2 (Public Beta):** Secret manager integration

**Current Status:** ⚠️ RISK - check Git history for leaks

---

### Pitfall 24: No Feature Flags for Gradual Rollout

**Problem:** Deploy new trade recommendation algorithm, it breaks for 20% of users, forced to rollback entire deploy.

**Warning Signs:**
- All-or-nothing deploys
- Can't disable buggy feature without re-deploy
- A/B testing impossible

**Prevention Strategy:**
- Feature flag system: LaunchDarkly, Unleash, or custom DB table
- Gradual rollout: 5% → 25% → 50% → 100%
- Kill switch for critical features (waiver recs, projections)

**Phase Mapping:**
- **Phase 2 (Public Beta):** Feature flag system
- **Phase 3 (Public GA):** A/B testing framework

**Current Status:** ⚠️ RISK - no rollout control

---

## Summary: Critical Path Items

These pitfalls MUST be addressed before public launch:

| Pitfall | Phase | Risk Level | Estimated Effort |
|---------|-------|------------|------------------|
| #2: Cookie encryption | Phase 1 | 🚨 Critical | 1 week |
| #3: Free agent fetching | Phase 1 | 🚨 Blocker | 2 weeks |
| #4: Rate stat math fix | Phase 1 | 🚨 Critical | 3 days |
| #6: Player identity wiring | Phase 1 | 🚨 Blocker | 1 week |
| #9: Auth + authorization | Phase 1 | 🚨 Critical | 2 weeks |
| #11: Rate limiting | Phase 1 | 🚨 Critical | 3 days |
| #14: Frontend API URLs | Phase 1 | 🚨 Blocker | 2 days |
| #18: Navigation fixes | Phase 1 | 🚨 Critical UX | 1 day |
| #21: Monitoring setup | Phase 1 | 🚨 Critical | 1 week |
| #22: Database backups | Phase 1 | 🚨 Critical | 2 days |

**Total Phase 1 Critical Work:** ~6-7 weeks

---

## Using This Document

**For Roadmap Planning:**
- Filter by "Phase Mapping" to sequence work
- Prioritize 🚨 Critical items before public beta

**For Code Reviews:**
- Reference pitfall numbers in PR comments
- Use as checklist for new features

**For Monitoring:**
- Convert "Warning Signs" into alerts/dashboards
- Weekly review: are we seeing any warning signs?

**For Documentation:**
- Link pitfalls in ADRs (Architecture Decision Records)
- Include in onboarding docs for new developers

---

**Last Updated:** 2026-02-19
**Next Review:** Before each phase kickoff
