---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/api/leagues.ts
  - packages/backend/src/db/migrations/015_remove_plaintext_espn_cookies.sql
  - packages/extension/entrypoints/background.ts
autonomous: true
requirements: [SEC-01, SEC-02]

must_haves:
  truths:
    - "ESPN credentials stored only in encrypted form (no plaintext fallback)"
    - "Extension message handler validates sender is from ESPN domain"
    - "Extension message handler rejects messages from arbitrary web pages"
    - "Backend requires ENCRYPTION_KEY at startup (fails if missing)"
  artifacts:
    - path: "packages/backend/src/db/migrations/015_remove_plaintext_espn_cookies.sql"
      provides: "Migration to drop plaintext ESPN cookie columns"
      min_lines: 10
    - path: "packages/backend/src/api/leagues.ts"
      provides: "League API with encrypted-only storage (no plaintext writes or fallbacks)"
      exports: ["leaguesRoutes"]
    - path: "packages/extension/entrypoints/background.ts"
      provides: "Message handler with sender validation"
      exports: ["default"]
  key_links:
    - from: "packages/backend/src/api/leagues.ts"
      to: "encryptToken/decryptToken"
      via: "import from utils/encryption"
      pattern: "import.*encryption"
    - from: "packages/backend/src/api/leagues.ts"
      to: "NO plaintext column writes"
      via: "insertInto/updateTable .set() calls"
      pattern: "espn_s(wid|2)_encrypted"
      must_not_match: "espn_s(wid|2):\\s"
    - from: "packages/extension/entrypoints/background.ts"
      to: "sender.url validation"
      via: "chrome.runtime.onMessage listener"
      pattern: "sender\\.url.*allowedDomains"
---

<objective>
Fix critical security vulnerabilities: remove plaintext ESPN credential storage and validate extension message sender origins.

Purpose: Prevent credential exposure in database dumps and protect against malicious webpage attacks on extension message handlers.
Output: Encrypted-only credential storage, sender-validated message handlers, migration to clean up plaintext columns.
</objective>

<execution_context>
@/Users/jay-work/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jay-work/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/codebase/CONCERNS.md
@packages/backend/src/utils/encryption.ts
@packages/backend/src/api/leagues.ts
@packages/extension/entrypoints/background.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove plaintext ESPN credential storage and migrate to encrypted-only</name>
  <files>
    packages/backend/src/api/leagues.ts
    packages/backend/src/db/migrations/015_remove_plaintext_espn_cookies.sql
  </files>
  <action>
**Create migration 015_remove_plaintext_espn_cookies.sql:**

Drop plaintext columns `espn_swid` and `espn_s2` from league table. These were kept during Phase 1 for backward compatibility but are now fully migrated to encrypted storage.

```sql
-- Migration 015: Remove plaintext ESPN cookie columns
-- All credentials now stored only in encrypted form

ALTER TABLE league
  DROP COLUMN IF EXISTS espn_swid,
  DROP COLUMN IF EXISTS espn_s2;

-- Add comment documenting encrypted-only storage
COMMENT ON COLUMN league.espn_swid_encrypted IS 'AES-256-GCM encrypted ESPN SWID cookie (encrypted-only storage). Format: [iv:16][authTag:16][encrypted:*]';
COMMENT ON COLUMN league.espn_s2_encrypted IS 'AES-256-GCM encrypted ESPN espn_s2 cookie (encrypted-only storage). Format: [iv:16][authTag:16][encrypted:*]';
```

**Update packages/backend/src/api/leagues.ts:**

**CRITICAL: Remove ALL plaintext column writes and fallback reads.**

1. **Line 183-186**: Remove plaintext storage in POST `/api/leagues/connect` league creation:
   - DELETE these exact lines:
     ```typescript
     espn_swid: auth?.SWID || null,
     espn_s2: auth?.espn_s2 || null,
     ```
   - Keep ONLY encrypted columns:
     ```typescript
     espn_swid_encrypted: espnSwidEncrypted,
     espn_s2_encrypted: espnS2Encrypted,
     ```

2. **Line 449-450**: Remove plaintext storage in PATCH `/api/leagues/:leagueId/auth` endpoint:
   - DELETE these exact lines from the `.set()` call:
     ```typescript
     espn_swid: SWID || null,
     espn_s2: espn_s2 || null,
     ```
   - Keep ONLY encrypted columns in `.set()`:
     ```typescript
     espn_swid_encrypted: espnSwidEncrypted,
     espn_s2_encrypted: espnS2Encrypted,
     ```

3. **Line 159-172**: Make encryption REQUIRED at credential storage time:
   - Change conditional from `if (hasEncryptionKey())` to:
     ```typescript
     if (!hasEncryptionKey()) {
       throw new Error("ENCRYPTION_KEY required for ESPN credential storage");
     }
     ```
   - Remove any warning logs about plaintext fallback

4. **Lines 503-529**: Remove plaintext fallback logic in POST `/api/leagues/:leagueId/snapshot` endpoint:
   - REPLACE entire auth building block (lines 503-529) with encrypted-only decryption:
     ```typescript
     // Build auth cookies from encrypted credentials (required)
     let auth: ESPNAuthCookies | undefined;

     if (league.espn_swid_encrypted && league.espn_s2_encrypted) {
       if (!hasEncryptionKey()) {
         return reply
           .code(500)
           .send({ error: "ENCRYPTION_KEY not configured - cannot decrypt credentials" });
       }
       try {
         auth = {
           SWID: decryptToken(league.espn_swid_encrypted),
           espn_s2: decryptToken(league.espn_s2_encrypted),
         };
       } catch (error) {
         request.log.error({ error }, "Failed to decrypt ESPN cookies");
         return reply
           .code(500)
           .send({ error: "Failed to decrypt ESPN credentials" });
       }
     }
     ```
   - DELETE all plaintext fallback logic (lines 513-529 in current code)
   - NO `else if (league.espn_swid && league.espn_s2)` branch

5. **Find and update GET `/api/leagues/:leagueId/snapshot`**: Apply same encrypted-only logic (no plaintext fallback)

**Why these changes matter:**
- Current code STILL WRITES plaintext columns (lines 183-186, 449-450) → violates SEC-01
- Current code reads plaintext fallback (lines 513-529) → contradicts "encrypted-only" must_have
- Migration 012 drops columns, so these writes/reads will break anyway

**Critical**: NEVER log decrypted credentials. Use `request.log.info({ leagueId }, "...")` without including auth object.
  </action>
  <verify>
1. Migration runs without errors: `cd packages/backend && npm run migrate`
2. Grep confirms NO plaintext column writes in league creation: `grep -E "espn_(swid|s2):\s" packages/backend/src/api/leagues.ts` returns ZERO matches
3. Grep confirms NO plaintext fallback reads: `grep -n "league.espn_swid[^_]" packages/backend/src/api/leagues.ts` returns ZERO matches (only espn_swid_encrypted references allowed)
4. TypeScript compiles: `cd packages/backend && npm run build`
5. Test encryption requirement: Attempt POST /api/leagues/connect without ENCRYPTION_KEY → should return 500 "ENCRYPTION_KEY required"
  </verify>
  <done>
- Migration 015 applied successfully dropping plaintext columns espn_swid and espn_s2
- `leagues.ts` writes ONLY to encrypted columns (espn_swid_encrypted, espn_s2_encrypted) in both POST /connect and PATCH /auth
- `leagues.ts` reads ONLY from encrypted columns (no plaintext fallback) in snapshot endpoints
- ENCRYPTION_KEY is required at credential storage time (throws error if missing)
- Decryption errors return 500 (no silent fallback to plaintext)
- No plaintext credentials in database, code, or logs
  </done>
</task>

<task type="auto">
  <name>Task 2: Validate extension message handler sender origin</name>
  <files>packages/extension/entrypoints/background.ts</files>
  <action>
**CRITICAL: Add sender validation to prevent arbitrary webpage attacks.**

**Update chrome.runtime.onMessage listener (starting at line 15):**

The current message handler accepts messages from ANY origin - a malicious webpage could send fake messages to trigger handlers. Add sender validation BEFORE processing any messages.

**REPLACE the entire chrome.runtime.onMessage.addListener block (lines 15-39) with:**

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // SECURITY: Validate sender origin before processing messages
  // Prevents malicious webpages from sending fake messages to extension

  if (sender.url) {
    // Message from content script - validate it's from ESPN domain
    try {
      const senderUrl = new URL(sender.url);

      // Whitelist of allowed ESPN domains
      const allowedDomains = [
        'fantasy.espn.com',
        'lm-api-reads.fantasy.espn.com'
      ];

      const isAllowedDomain = allowedDomains.some(domain =>
        senderUrl.hostname === domain || senderUrl.hostname.endsWith('.' + domain)
      );

      if (!isAllowedDomain) {
        console.warn('[ESPN Draft Assistant] SECURITY: Rejected message from unauthorized origin:', senderUrl.hostname);
        sendResponse({ error: 'Unauthorized sender origin' });
        return false;
      }

      // Additional validation: verify sender is from this extension (prevents extension spoofing)
      if (sender.id && sender.id !== chrome.runtime.id) {
        console.warn('[ESPN Draft Assistant] SECURITY: Rejected message from different extension:', sender.id);
        sendResponse({ error: 'Invalid sender extension' });
        return false;
      }
    } catch (error) {
      console.error('[ESPN Draft Assistant] Invalid sender URL:', sender.url, error);
      sendResponse({ error: 'Invalid sender URL' });
      return false;
    }
  }
  // If sender.url is undefined, message is from extension page (popup, options) - allow it

  console.log('[ESPN Draft Assistant] Message received:', message.type);

  if (message.type === 'GET_RANKINGS') {
    handleGetRankings(message.payload)
      .then(sendResponse)
      .catch((error) => {
        console.error('[ESPN Draft Assistant] Error fetching rankings:', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_AUCTION_VALUES') {
    handleGetAuctionValues(message.payload)
      .then(sendResponse)
      .catch((error) => {
        console.error('[ESPN Draft Assistant] Error fetching auction values:', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  }

  return false;
});
```

**Security validations added:**
1. **sender.url domain check**: Verifies sender.url matches ESPN domain whitelist (fantasy.espn.com or lm-api-reads.fantasy.espn.com)
2. **sender.id check**: Verifies sender.id === chrome.runtime.id to prevent extension spoofing attacks

**Why this matters:**
- Without validation, ANY webpage can call `chrome.runtime.sendMessage(EXTENSION_ID, {...})` to trigger handlers
- Malicious page could flood extension with fake messages or trigger unauthorized operations
- Content scripts run in isolated world, but message handlers are global to extension

**Security boundary after changes:**
- Extension internal pages (popup, options) → allowed (sender.url undefined)
- ESPN fantasy domains → allowed (whitelist match + extension ID match)
- All other origins → rejected with error logged to console
  </action>
  <verify>
1. TypeScript compiles: `cd packages/extension && npm run build`
2. Extension loads in Chrome: `npm run dev` and check chrome://extensions for no errors
3. Grep confirms sender validation present: `grep -n "allowedDomains" packages/extension/entrypoints/background.ts` shows whitelist array
4. Grep confirms sender.id validation present: `grep -n "sender.id.*chrome.runtime.id" packages/extension/entrypoints/background.ts` shows extension ID check
5. Manual test (when extension has UI): Open ESPN fantasy page → messages from content script allowed. Open non-ESPN page → console test `chrome.runtime.sendMessage(...)` rejected with "Unauthorized sender origin"
  </verify>
  <done>
- Message handler validates sender.url against ESPN domain whitelist (fantasy.espn.com, lm-api-reads.fantasy.espn.com)
- Message handler validates sender.id === chrome.runtime.id to prevent extension spoofing
- Messages from non-ESPN domains rejected with error response and warning logged
- Extension internal pages (popup, options) allowed when sender.url is undefined
- All security rejections logged to console for monitoring
  </done>
</task>

</tasks>

<verification>
Run after both tasks complete:

1. **Security audit - no plaintext credentials:**
   ```bash
   # Database schema check (should NOT have espn_swid or espn_s2 columns)
   psql -d espn_agent_dev -c "\d league" | grep -E "espn_s(wid|2)\s"

   # Code check (should only reference encrypted columns)
   grep -r "espn_swid[^_]" packages/backend/src/ --include="*.ts" | grep -v "espn_swid_encrypted"
   ```
   Expected: Zero matches for plaintext column references

2. **Extension security - sender validation:**
   ```bash
   # Build extension
   cd packages/extension && npm run build

   # Verify validation code present
   grep -A 5 "sender.url" packages/extension/entrypoints/background.ts | grep "allowedDomains"
   ```
   Expected: Whitelist check present in message handler

3. **Integration test - encrypted credentials work:**
   - Start backend with ENCRYPTION_KEY set
   - POST /api/leagues/connect with ESPN credentials
   - Verify league created with only espn_swid_encrypted populated
   - Trigger snapshot → should fetch ESPN data successfully
</verification>

<success_criteria>
- [ ] Migration 015 removes espn_swid and espn_s2 columns from league table
- [ ] leagues.ts stores ESPN credentials ONLY in encrypted columns (no plaintext fallback)
- [ ] ESPN adapter calls decrypt credentials just-in-time for API requests
- [ ] Backend requires ENCRYPTION_KEY env var (fails at startup if missing)
- [ ] Extension message handler validates sender origin against ESPN domain whitelist
- [ ] Extension rejects messages from non-ESPN domains with error response
- [ ] No plaintext credentials appear in database, logs, or code
</success_criteria>

<output>
After completion, create `.planning/quick/16-fix-security-issues-encrypt-api-token-st/16-SUMMARY.md`
</output>
