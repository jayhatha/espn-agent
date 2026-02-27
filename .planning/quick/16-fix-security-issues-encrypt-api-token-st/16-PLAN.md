---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/backend/src/api/leagues.ts
  - packages/backend/src/db/migrations/012_remove_plaintext_espn_cookies.sql
  - packages/extension/entrypoints/background.ts
autonomous: true
requirements: [SEC-01, SEC-02]

must_haves:
  truths:
    - "ESPN credentials stored only in encrypted form (no plaintext fallback)"
    - "Extension message handler validates sender is from ESPN domain"
    - "Extension message handler rejects messages from arbitrary web pages"
  artifacts:
    - path: "packages/backend/src/db/migrations/012_remove_plaintext_espn_cookies.sql"
      provides: "Migration to drop plaintext ESPN cookie columns"
      min_lines: 10
    - path: "packages/backend/src/api/leagues.ts"
      provides: "League API with encrypted-only storage"
      exports: ["leaguesRoutes"]
    - path: "packages/extension/entrypoints/background.ts"
      provides: "Message handler with sender validation"
      exports: ["default"]
  key_links:
    - from: "packages/backend/src/api/leagues.ts"
      to: "encryptToken/decryptToken"
      via: "import from utils/encryption"
      pattern: "import.*encryption"
    - from: "packages/extension/entrypoints/background.ts"
      to: "sender.url validation"
      via: "chrome.runtime.onMessage listener"
      pattern: "sender\\.url"
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
    packages/backend/src/db/migrations/012_remove_plaintext_espn_cookies.sql
  </files>
  <action>
**Create migration 012_remove_plaintext_espn_cookies.sql:**

Drop plaintext columns `espn_swid` and `espn_s2` from league table. These were kept during Phase 1 for backward compatibility but are now fully migrated to encrypted storage.

```sql
-- Migration 012: Remove plaintext ESPN cookie columns
-- All credentials now stored only in encrypted form

ALTER TABLE league
  DROP COLUMN IF EXISTS espn_swid,
  DROP COLUMN IF EXISTS espn_s2;

-- Add comment documenting encrypted-only storage
COMMENT ON COLUMN league.espn_swid_encrypted IS 'AES-256-GCM encrypted ESPN SWID cookie (encrypted-only storage). Format: [iv:16][authTag:16][encrypted:*]';
COMMENT ON COLUMN league.espn_s2_encrypted IS 'AES-256-GCM encrypted ESPN espn_s2 cookie (encrypted-only storage). Format: [iv:16][authTag:16][encrypted:*]';
```

**Update packages/backend/src/api/leagues.ts:**

1. **Line 183-184**: Remove plaintext storage in league creation:
   - DELETE lines: `espn_swid: auth?.SWID || null,` and `espn_s2: auth?.espn_s2 || null,`
   - Keep only: `espn_swid_encrypted: espnSwidEncrypted,` and `espn_s2_encrypted: espnS2Encrypted,`

2. **Line 159-172**: Make encryption REQUIRED (not optional):
   - Change `if (hasEncryptionKey())` to: `if (!hasEncryptionKey()) { throw new Error("ENCRYPTION_KEY required for ESPN credential storage"); }`
   - Remove warning fallback for plaintext storage

3. **Line 412, 450**: In PATCH `/api/leagues/:id/auth` endpoint:
   - Remove plaintext column updates (`espn_swid`, `espn_s2`)
   - Use only encrypted columns after encryption
   - Add error handling if encryption fails

4. **Line 513, 523**: In GET and POST snapshot trigger endpoints:
   - Replace `league.espn_swid` and `league.espn_s2` with decrypted values:
     ```typescript
     const auth: ESPNAuthCookies = {
       SWID: league.espn_swid_encrypted ? decryptToken(league.espn_swid_encrypted) : undefined,
       espn_s2: league.espn_s2_encrypted ? decryptToken(league.espn_s2_encrypted) : undefined,
     };
     ```
   - Use `auth` object when calling ESPNAdapter methods

5. Add type-safe helper function at top of file:
   ```typescript
   function getLeagueAuth(league: { espn_swid_encrypted: Buffer | null; espn_s2_encrypted: Buffer | null }): ESPNAuthCookies | undefined {
     if (!league.espn_swid_encrypted && !league.espn_s2_encrypted) return undefined;
     return {
       SWID: league.espn_swid_encrypted ? decryptToken(league.espn_swid_encrypted) : undefined,
       espn_s2: league.espn_s2_encrypted ? decryptToken(league.espn_s2_encrypted) : undefined,
     };
   }
   ```

**Critical**: NEVER log decrypted credentials. Use `request.log.info({ leagueId }, "...")` without including auth object.
  </action>
  <verify>
1. Migration runs without errors: `cd packages/backend && npm run migrate`
2. Grep confirms no plaintext storage: `grep -n "espn_swid:" packages/backend/src/api/leagues.ts` returns ZERO lines with plaintext column references (only encrypted)
3. TypeScript compiles: `cd packages/backend && npm run build`
4. Test encryption requirement: Start backend without ENCRYPTION_KEY → should fail at league connection
  </verify>
  <done>
- Migration 012 applied successfully dropping plaintext columns
- `leagues.ts` stores only encrypted credentials in espn_swid_encrypted and espn_s2_encrypted
- All ESPN adapter calls decrypt credentials just-in-time
- ENCRYPTION_KEY is required (startup fails if missing)
- No plaintext credentials in database or logs
  </done>
</task>

<task type="auto">
  <name>Task 2: Validate extension message handler sender origin</name>
  <files>packages/extension/entrypoints/background.ts</files>
  <action>
**Update chrome.runtime.onMessage listener (line 15):**

Add sender validation before processing messages to prevent malicious webpages from sending fake messages to the extension.

Replace current listener with sender validation:

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is from extension context or ESPN domain
  // sender.url is undefined for extension pages (popup, options)
  // sender.url is set for content scripts injected into web pages

  if (sender.url) {
    try {
      const senderUrl = new URL(sender.url);
      // Only accept messages from ESPN fantasy domains or extension pages
      const allowedDomains = [
        'fantasy.espn.com',
        'lm-api-reads.fantasy.espn.com'
      ];

      const isAllowedDomain = allowedDomains.some(domain =>
        senderUrl.hostname === domain || senderUrl.hostname.endsWith('.' + domain)
      );

      if (!isAllowedDomain) {
        console.warn('[ESPN Draft Assistant] Rejected message from unauthorized origin:', senderUrl.hostname);
        sendResponse({ error: 'Unauthorized sender origin' });
        return false;
      }
    } catch (error) {
      console.error('[ESPN Draft Assistant] Invalid sender URL:', sender.url, error);
      sendResponse({ error: 'Invalid sender URL' });
      return false;
    }
  }
  // If sender.url is undefined, message is from extension page (popup/options) - allow it

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

**Why this matters:**
- Without validation, ANY webpage can call `chrome.runtime.sendMessage(EXTENSION_ID, {...})` to trigger handlers
- Malicious page could flood extension with fake draft picks or trigger unauthorized API calls
- Content script runs in isolated world, but message handlers are global to extension

**Security boundary:**
- Extension context (popup, options) → allowed (sender.url undefined)
- ESPN domains → allowed (whitelist match)
- All other domains → rejected with error response
  </action>
  <verify>
1. TypeScript compiles: `cd packages/extension && npm run build`
2. Extension loads in Chrome: `npm run dev` and check chrome://extensions
3. Console shows validation working: Open ESPN draft page → sidebar loads → messages logged as "Message received"
4. Manual test rejection: In browser console on non-ESPN page, run: `chrome.runtime.sendMessage('YOUR_EXT_ID', {type: 'GET_RANKINGS', payload: {leagueId: '123'}}, console.log)` → should log error "Unauthorized sender origin"
  </verify>
  <done>
- Message handler validates sender.url against ESPN domain whitelist
- Messages from non-ESPN domains rejected with error response
- Extension pages (popup, options) allowed when sender.url is undefined
- Console logs rejection attempts for security monitoring
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
- [ ] Migration 012 removes espn_swid and espn_s2 columns from league table
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
