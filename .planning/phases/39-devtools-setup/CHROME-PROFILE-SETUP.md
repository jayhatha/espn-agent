# Chrome DevTools MCP — Profile Setup Guide

## Why Profile Isolation Matters

The MCP server connects via CDP (Chrome DevTools Protocol) to any tab in the target Chrome instance. A dedicated profile ensures your real ESPN auth cookies (SWID, espn_s2) in your main Chrome profile are never accessible to the MCP process. The isolated instance has its own cookie jar.

## One-Time Setup

```bash
mkdir -p ~/chrome-devtools-profile
```

## Launch Command (macOS)

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/chrome-devtools-profile \
  --no-first-run \
  --no-default-browser-check
```

Log into ESPN Fantasy Baseball in THIS window. Do not use your main Chrome profile.

## Verify Remote Debugging is Active

```bash
curl -s http://127.0.0.1:9222/json/version
```

Expected response: JSON object with `Browser` and `webSocketDebuggerUrl` keys.

If this returns "connection refused", Chrome was not started with `--remote-debugging-port=9222`.

## ESPN Draft URL Pattern

```
https://fantasy.espn.com/baseball/draft?leagueId=YOUR_LEAGUE_ID
```

Navigate to the draft lobby in the isolated Chrome window and enter the auction draft room before running MCP inspection.

## Activate MCP in Claude Code

Restart Claude Code after `.mcp.json` is created. The `chrome-devtools` server will appear in the available tools list. It launches on first use via npx — expect a brief install delay the first time.

## Prerequisites

- **Node.js 20.19+** (required by chrome-devtools-mcp)
- **Chrome** (any recent version; remote debugging has been stable since Chrome 80+)

## iframe Note

ESPN auction draft pages may embed content in iframes. If MCP `querySelector` calls return 0 results on the main frame, use the MCP's frame-targeting capability:

1. Use `list_targets` or equivalent to see all frames/tabs
2. Select the draft iframe target
3. Run selectors against that frame context

## Stopping

Quit the isolated Chrome instance when done. The profile directory persists at `~/chrome-devtools-profile`, so your ESPN login is preserved for the next session.

## Quick Reference

```bash
# Launch isolated Chrome
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=$HOME/chrome-devtools-profile \
  --no-first-run --no-default-browser-check

# Verify debugging port
curl -s http://127.0.0.1:9222/json/version | python3 -m json.tool

# List open tabs
curl -s http://127.0.0.1:9222/json/list | python3 -m json.tool
```
