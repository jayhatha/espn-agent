---
status: awaiting_human_verify
trigger: "rotoballer-scraper-wrong-values"
created: 2026-03-29T00:00:00Z
updated: 2026-03-29T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — scraper hardcoded gid=0, discarding the real gid from the article embed URL. Also, article selection preferred the current-week article over a newly-published next-week article.
test: Force-refreshed scraper after fix — Mike Burrows=50, Painter=55, Eflin=50 all correct. Count increased from 94 to 149.
expecting: User confirms the sit/start tab now shows correct values.
next_action: Await human verification

## Symptoms

expected: RotoBaller scraper returns correct ranking values matching the RotoBaller website, and finds all rostered pitchers including Painter and Eflin
actual: Wrong ranking values (e.g., site shows 50 for Mike Burrows, app shows 65) and some pitchers completely missing (Painter, Eflin)
errors: No error messages — the scraper runs but produces incorrect/incomplete data
reproduction: Check sit/start tab on pitching usage page, compare RotoBaller column values with actual RotoBaller website
started: May have always been wrong — scraper recently built

## Eliminated

- hypothesis: Stale Redis cache serving outdated data
  evidence: Force-refreshed cache (?force=true) still shows same wrong values — root cause is in the scrape logic itself, not caching
  timestamp: 2026-03-29

- hypothesis: Name matching issues for Painter/Eflin
  evidence: Painter and Eflin are completely absent from gid=0 data — they exist on gid=56327054. Not a name matching issue.
  timestamp: 2026-03-29

## Evidence

- timestamp: 2026-03-29
  checked: packages/scraper/src/scrapers/rotoballer.ts findSheetCsvUrl()
  found: Function extracts sheetId from article HTML using regex, then constructs CSV URL as `.../${sheetId}/pub?gid=0&single=true&output=csv` — hardcoded gid=0
  implication: Any week where data is NOT on tab 0 will return wrong/missing data

- timestamp: 2026-03-29
  checked: New article HTML (3-30-4-5-2026) embed URLs
  found: Article embeds `pubhtml?gid=56327054&single=true` — the data is explicitly on tab 56327054
  implication: The correct gid is available in the article HTML but the code throws it away

- timestamp: 2026-03-29
  checked: Google Sheet gid=0 for Mike Burrows
  found: Mike Burrows grade=65 (old week 3/25-3/29)
  implication: This is the stale data being served

- timestamp: 2026-03-29
  checked: Google Sheet gid=56327054 for target pitchers
  found: Mike Burrows grade=50 (4/1), Andrew Painter grade=55 (3/31), Zach Eflin grade=50 (3/31)
  implication: The correct current-week data is on gid=56327054

- timestamp: 2026-03-29
  checked: Rotoballer tag page article list
  found: Two pitcher articles: 3-25-3-29-2026 and 3-30-4-5-2026. urlCoversToday() picks the one covering today (3/29 is in 3/25-3/29 range)
  implication: urlCoversToday correctly picks the old article for today (3/29), but that article's data is gid=0 which is also stale. The new article for 3-30-4-5 has the up-to-date projections in gid=56327054.

## Resolution

root_cause: Two bugs in packages/scraper/src/scrapers/rotoballer.ts. (1) findSheetCsvUrl() hardcoded gid=0 in the CSV export URL, discarding the real gid embedded in the article's pubhtml URL (e.g. ?gid=56327054). RotoBaller rotates weekly data to a new sheet tab each week, so gid=0 always contained the oldest tab's data. (2) urlCoversToday() only matched articles where today's date fell within the week range, causing the old article (3-25-3-29) to win over the newly-published next-week article (3-30-4-5) even when the newer article was already available.
fix: (1) Updated gid extraction regex to capture the gid from the pubhtml embed URL; falls back to gid=0 if not found. (2) Replaced urlCoversToday() with articleRelevanceScore() that gives highest priority (score ~299) to upcoming articles published within 7 days, over current-week articles (score 200), so newly-published next-week articles are always preferred.
verification: Force-refresh after fix returns count=149 (was 94). Mike Burrows=50 (was 65), Andrew Painter=55 (was missing), Zach Eflin=50 (was missing). All match RotoBaller website values.
files_changed:
  - packages/scraper/src/scrapers/rotoballer.ts
