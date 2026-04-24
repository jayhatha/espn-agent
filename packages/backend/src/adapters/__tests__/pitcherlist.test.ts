import { describe, it, expect } from "vitest";
import { parsePitcherlistTiers } from "../pitcherlist.js";

/**
 * Pitcherlist Adapter Tests
 *
 * Tests HTML parsing of tier-grouped pitcher rankings from pitcherlist.com.
 * Fixtures match the real 2026 Pitcherlist markup: tier labels in <p> with
 * bold/large text, pitcher entries as <p><strong><a class="player-tag">...</a></strong></p>.
 */

const FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<head><title>SP Streamer Ranks: 3/26 &amp; 3/27 &amp; 3/28 Fantasy Baseball</title></head>
<body>
<article>
  <h1 class="entry-title">SP Streamer Ranks: 3/26 &amp; 3/27 &amp; 3/28 Fantasy Baseball</h1>

  <h2>Thursday 3/26 Starting Pitcher Streamer Rankings</h2>

  <p><span style="color: #3366ff;"><strong><span style="font-size: 20pt;">Auto-Starts</span></strong></span></p>
  <p><strong><a class="player-tag" href="/player/corbin-burnes">Corbin Burnes</a> @ CIN - </strong>Aces gonna ace.</p>
  <p><strong><a class="player-tag" href="/player/tyler-glasnow">Tyler Glasnow</a> vs. SDP - </strong>Aces gonna ace.</p>
  <p><strong><a class="player-tag" href="/player/paul-skenes">Paul Skenes</a> @ NYM - </strong>Aces gonna ace.</p>

  <p><span style="color: #339966; font-size: 20pt;"><strong>Probably Starts</strong></span></p>
  <p><strong><a class="player-tag" href="/player/kyle-bradish">Kyle Bradish</a> vs. MIN - </strong>Good matchup.</p>
  <p><strong><a class="player-tag" href="/player/braxton-garrett">Braxton Garrett</a> vs. ATL - </strong>Decent arm.</p>

  <p><span style="color: #ff9900; font-size: 20pt;"><strong>Questionable Starts</strong></span></p>
  <p><strong><a class="player-tag" href="/player/cristopher-sanchez">Cristopher S&#225;nchez</a> vs. TEX - </strong>Risky.</p>
  <p><strong><a class="player-tag" href="/player/jose-berrios">Jos&#233; Berr&#237;os</a> @ BOS - </strong>Tough matchup.</p>

  <p><span style="font-size: 20pt; color: #ff0000;"><strong>Do Not Starts</strong></span></p>
  <p><strong><a class="player-tag" href="/player/wade-miley">Wade Miley</a> vs. STL - </strong>Just no.</p>
</article>
</body>
</html>
`;

const EMPTY_HTML = "";

const NO_TIERS_HTML = `
<!DOCTYPE html>
<html>
<body>
  <p>Some content with no tier headings</p>
  <h2>Some Other Heading</h2>
  <p>Not a tier</p>
</body>
</html>
`;

// Fallback format: sit/start table (used by the separate "Sit or Start" column)
const TABLE_FALLBACK_HTML = `
<!DOCTYPE html>
<html>
<body>
<article>
  <h1>Sit/Start Week 1</h1>
  <table>
    <tbody>
      <tr>
        <td colspan="6"><strong>Wednesday – 3/25</strong></td>
      </tr>
      <tr>
        <td><strong>Date</strong></td>
        <td><strong>Game</strong></td>
        <td><strong>Away Pitcher</strong></td>
        <td><strong>Sit / Start</strong></td>
        <td><strong>Home Pitcher</strong></td>
        <td><strong>Sit / Start</strong></td>
      </tr>
      <tr>
        <td>3/25</td>
        <td>NYY at SFG</td>
        <td><strong><a class="player-tag" href="/player/max-fried">M. Fried</a></strong></td>
        <td><strong><span style="color: #008000;">Start-8</span></strong></td>
        <td><strong><a class="player-tag" href="/player/logan-webb">L. Webb</a></strong></td>
        <td><strong><span style="color: #008000;">Start-8</span></strong></td>
      </tr>
      <tr>
        <td>3/25</td>
        <td>WSN at CHC</td>
        <td><strong>C. Cavalli</strong></td>
        <td><strong><span style="color: #ff0000;">Sit-2</span></strong></td>
        <td><strong>M. Boyd</strong></td>
        <td><strong><span style="color: #3366ff;">Maybe-6</span></strong></td>
      </tr>
    </tbody>
  </table>
</article>
</body>
</html>
`;

describe("parsePitcherlistTiers", () => {
  it("extracts all 4 tiers with correct verdict mapping", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/sp-streamer-ranks-3-26/");

    const byVerdict: Record<string, number> = {};
    for (const e of entries) {
      byVerdict[e.verdict] = (byVerdict[e.verdict] || 0) + 1;
    }

    expect(byVerdict["start"]).toBe(3);       // Auto-Start tier
    expect(byVerdict["lean_start"]).toBe(2);  // Probably Start tier
    expect(byVerdict["neutral"]).toBe(2);     // Questionable Start tier
    expect(byVerdict["sit"]).toBe(1);         // Do Not Start tier
  });

  it("maps Auto-Start heading to 'start' verdict", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/test/");
    const startEntries = entries.filter(e => e.verdict === "start");
    expect(startEntries.length).toBeGreaterThan(0);
    expect(startEntries[0].playerName).toBe("Corbin Burnes");
  });

  it("maps Probably Start heading to 'lean_start' verdict", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/test/");
    const leanStart = entries.filter(e => e.verdict === "lean_start");
    expect(leanStart.length).toBe(2);
    expect(leanStart[0].playerName).toBe("Kyle Bradish");
  });

  it("maps Questionable Start heading to 'neutral' verdict", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/test/");
    const neutral = entries.filter(e => e.verdict === "neutral");
    expect(neutral.length).toBe(2);
  });

  it("maps Do Not Start heading to 'sit' verdict", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/test/");
    const sit = entries.filter(e => e.verdict === "sit");
    expect(sit.length).toBe(1);
    expect(sit[0].playerName).toBe("Wade Miley");
  });

  it("sets correct source and sourceUrl on all entries", () => {
    const url = "https://pitcherlist.com/sp-streamer-ranks-3-26/";
    const entries = parsePitcherlistTiers(FIXTURE_HTML, url);
    for (const e of entries) {
      expect(e.source).toBe("pitcherlist");
      expect(e.sourceUrl).toBe(url);
    }
  });

  it("sets articleTitle from h1.entry-title", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/test/");
    expect(entries[0].articleTitle).toContain("SP Streamer Ranks");
  });

  it("sets scrapedAt as ISO timestamp string", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/test/");
    expect(entries[0].scrapedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns empty array on empty HTML string (no throw)", () => {
    expect(() => {
      const result = parsePitcherlistTiers(EMPTY_HTML, "https://pitcherlist.com/test/");
      expect(result).toEqual([]);
    }).not.toThrow();
  });

  it("returns empty array on HTML with no tier headings", () => {
    const result = parsePitcherlistTiers(NO_TIERS_HTML, "https://pitcherlist.com/test/");
    expect(result).toEqual([]);
  });

  it("falls back to table parsing for sit/start table format", () => {
    const entries = parsePitcherlistTiers(TABLE_FALLBACK_HTML, "https://pitcherlist.com/sit-start-week-1/");
    expect(entries.length).toBe(4);

    const starts = entries.filter(e => e.verdict === "start");
    expect(starts.length).toBe(2);
    expect(starts.map(e => e.playerName)).toContain("M. Fried");
    expect(starts.map(e => e.playerName)).toContain("L. Webb");

    const sits = entries.filter(e => e.verdict === "sit");
    expect(sits.length).toBe(1);
    expect(sits[0].playerName).toBe("C. Cavalli");

    const maybes = entries.filter(e => e.verdict === "lean_start");
    expect(maybes.length).toBe(1);
    expect(maybes[0].playerName).toBe("M. Boyd");
  });

  it("URL discovery selector pattern: fixture archive HTML yields article URL", async () => {
    const archiveHtml = `
      <html><body>
        <div class="post-listing">
          <article>
            <a href="https://pitcherlist.com/starting-pitcher-streamer-ranks-fantasy-baseball-3-26-3-27-3-28/">SP Streamer Ranks 3/26</a>
          </article>
          <article>
            <a href="https://pitcherlist.com/starting-pitcher-streamer-rankings-fantasy-baseball-3-19-3-20-3-21/">SP Streamer Ranks 3/19</a>
          </article>
        </div>
      </body></html>
    `;

    const { load } = await import("cheerio");
    const $ = load(archiveHtml);
    const url = $("a[href*='starting-pitcher-streamer-rank']").first().attr("href");
    expect(url).toBe("https://pitcherlist.com/starting-pitcher-streamer-ranks-fantasy-baseball-3-26-3-27-3-28/");
  });
});
