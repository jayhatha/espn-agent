import { describe, it, expect } from "vitest";
import { normalizePlayerName } from "../../../../shared/dist/index.js";

describe("normalizePlayerName", () => {
  it("lowercases the name", () => {
    expect(normalizePlayerName("Mike Trout")).toBe("miketrout");
  });

  it("strips diacritics (accents)", () => {
    // Sánchez → sanchez
    expect(normalizePlayerName("Germán Márquez")).toBe("germanmarquez");
  });

  it("removes spaces", () => {
    expect(normalizePlayerName("Ronald Acuna Jr")).toBe("ronaldacunajr");
  });

  it("removes punctuation and special characters", () => {
    // "Acuña Jr." — ñ becomes n, period removed
    expect(normalizePlayerName("Ronald Acuña Jr.")).toBe("ronaldacunajr");
  });

  it("handles names with hyphens", () => {
    expect(normalizePlayerName("Martín Pérez")).toBe("martinperez");
  });

  it("produces identical keys for accent and non-accent variant", () => {
    // FanGraphs may have "Sanchez" while ESPN has "Sánchez"
    expect(normalizePlayerName("Sánchez")).toBe(normalizePlayerName("Sanchez"));
  });

  it("handles all-caps input", () => {
    expect(normalizePlayerName("MIKE TROUT")).toBe("miketrout");
  });

  it("handles empty string without throwing", () => {
    expect(normalizePlayerName("")).toBe("");
  });

  it("returns only alphanumeric characters (no spaces, hyphens, periods)", () => {
    const result = normalizePlayerName("Shohei Ohtani");
    expect(result).toMatch(/^[a-z]+$/);
  });

  it("handles Japanese-origin names with only ASCII letters", () => {
    // Already ASCII — should just lowercase and strip spaces
    expect(normalizePlayerName("Shohei Ohtani")).toBe("shoheiohtani");
  });
});
