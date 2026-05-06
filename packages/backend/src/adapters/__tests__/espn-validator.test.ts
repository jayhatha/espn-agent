import { describe, it, expect } from "vitest";
import { EspnResponseValidator } from "../../adapters/espn/validator.js";

const validator = new EspnResponseValidator();

// ─── extractStructure ──────────────────────────────────────────────────────

describe("EspnResponseValidator.extractStructure", () => {
  it("replaces primitive values with their typeof strings", () => {
    // Arrange
    const obj = { name: "Mike", age: 30, active: true };

    // Act
    const result = validator.extractStructure(obj) as Record<string, unknown>;

    // Assert
    expect(result.name).toBe("string");
    expect(result.age).toBe("number");
    expect(result.active).toBe("boolean");
  });

  it("preserves object shape (key names, nesting)", () => {
    const obj = { teams: [{ id: 1, name: "A" }] };
    const result = validator.extractStructure(obj) as any;

    // Key exists and is an array
    expect(Array.isArray(result.teams)).toBe(true);
    // First element has id and name keys typed
    expect(result.teams[0].id).toBe("number");
    expect(result.teams[0].name).toBe("string");
  });

  it("returns [] for empty arrays", () => {
    const obj = { items: [] };
    const result = validator.extractStructure(obj) as any;
    expect(result.items).toEqual([]);
  });

  it("represents array with only first element (schema not data)", () => {
    // Array of 3 numbers — structure is just [typeof first]
    const result = validator.extractStructure([10, 20, 30]) as any;
    expect(result).toEqual(["number"]);
  });

  it("returns null for null input", () => {
    expect(validator.extractStructure(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(validator.extractStructure(undefined)).toBeNull();
  });

  it("stops recursing at depth > 3 and returns typeof", () => {
    // Build 5 levels of nesting
    const deep = { a: { b: { c: { d: { e: "leaf" } } } } };
    const result = validator.extractStructure(deep) as any;

    // depth 0→a, 1→b, 2→c, 3→d (still recurses), 4→e (> 3 cutoff) → "string"
    // At depth 4, the code returns typeof(obj) which is "object" for { e: "leaf" }
    // So result.a.b.c.d is "object" (not descended further)
    expect(result.a.b.c.d).toBe("object");
  });
});

// ─── computeSchemaFingerprint ──────────────────────────────────────────────

describe("EspnResponseValidator.computeSchemaFingerprint", () => {
  it("returns a 16-character hex string", () => {
    const fp = validator.computeSchemaFingerprint({ id: 1, name: "test" });
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces identical fingerprints for structurally identical data", () => {
    const a = { id: 1, name: "Mike Trout" };
    const b = { id: 99, name: "Shohei Ohtani" }; // different values, same shape

    const fpA = validator.computeSchemaFingerprint(a);
    const fpB = validator.computeSchemaFingerprint(b);

    expect(fpA).toBe(fpB);
  });

  it("produces different fingerprints for different shapes", () => {
    const withRoster = { id: 1, name: "League", teams: [{ id: 1 }] };
    const withoutRoster = { id: 1, name: "League" };

    const fpWith = validator.computeSchemaFingerprint(withRoster);
    const fpWithout = validator.computeSchemaFingerprint(withoutRoster);

    expect(fpWith).not.toBe(fpWithout);
  });

  it("is deterministic across multiple calls with same structure", () => {
    const data = { settings: { name: "Test", scoringFormat: "roto" } };
    const fp1 = validator.computeSchemaFingerprint(data);
    const fp2 = validator.computeSchemaFingerprint(data);
    expect(fp1).toBe(fp2);
  });
});
