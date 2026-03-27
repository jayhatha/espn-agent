import { describe, it, expect } from "vitest";
import { parsePitcherlistTiers } from "../pitcherlist.js";

/**
 * Pitcherlist Adapter Tests
 *
 * Tests HTML parsing of tier-grouped pitcher rankings from pitcherlist.com.
 */

const FIXTURE_HTML = `
<!DOCTYPE html>
<html>
<head><title>SP Streamer Ranks: 3/26 &amp; 3/27 &amp; 3/28 Fantasy Baseball</title></head>
<body>
<article>
  <h1 class="entry-title">SP Streamer Ranks: 3/26 &amp; 3/27 &amp; 3/28 Fantasy Baseball</h1>

  <h2>Auto-Start</h2>
  <table>
    <tbody>
      <tr><td><a href="/player/corbin-burnes">Corbin Burnes</a></td><td>MIL</td></tr>
      <tr><td><a href="/player/tyler-glasnow">Tyler Glasnow</a></td><td>LAD</td></tr>
      <tr><td><a href="/player/paul-skenes">Paul Skenes</a></td><td>PIT</td></tr>
    </tbody>
  </table>

  <h2>Probably Start</h2>
  <table>
    <tbody>
      <tr><td><a href="/player/kyle-bradish">Kyle Bradish</a></td><td>BAL</td></tr>
      <tr><td><a href="/player/braxton-garrett">Braxton Garrett</a></td><td>MIA</td></tr>
    </tbody>
  </table>

  <h2>Questionable Start</h2>
  <table>
    <tbody>
      <tr><td><a href="/player/cristopher-sanchez">Cristopher S&#225;nchez</a></td><td>PHI</td></tr>
      <tr><td><a href="/player/jose-berrios">Jos&#233; Berr&#237;os</a></td><td>TOR</td></tr>
    </tbody>
  </table>

  <h2>Do Not Start</h2>
  <table>
    <tbody>
      <tr><td><a href="/player/wade-miley">Wade Miley</a></td><td>CHC</td></tr>
    </tbody>
  </table>
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

describe("parsePitcherlistTiers", () => {
  it("extracts all 4 tiers with correct verdict mapping", () => {
    const entries = parsePitcherlistTiers(FIXTURE_HTML, "https://pitcherlist.com/sp-streamer-ranks-3-26/");

    // Count by verdict
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

    // Simulate the URL discovery logic used in PitcherlistAdapter
    const { load } = await import("cheerio");
    const $ = load(archiveHtml);
    const url = $("a[href*='starting-pitcher-streamer-rank']").first().attr("href");
    expect(url).toBe("https://pitcherlist.com/starting-pitcher-streamer-ranks-fantasy-baseball-3-26-3-27-3-28/");
  });
});
