import { describe, it, expect } from "vitest";
import { canFillSlot } from "../slot-eligibility.js";

describe("canFillSlot", () => {
  it("returns true for exact match (SS in SS slot)", () => {
    expect(canFillSlot(["SS", "2B"], "SS")).toBe(true);
  });

  it("returns true for MI slot with SS player", () => {
    expect(canFillSlot(["SS", "2B"], "MI")).toBe(true);
  });

  it("returns true for CI slot with 1B or 3B player", () => {
    expect(canFillSlot(["1B", "3B"], "CI")).toBe(true);
  });

  it("returns true for OF slot with LF/CF player", () => {
    expect(canFillSlot(["LF", "CF"], "OF")).toBe(true);
  });

  it("returns true for P slot with SP player", () => {
    expect(canFillSlot(["SP"], "P")).toBe(true);
  });

  it("returns true for UTIL slot with any position (C)", () => {
    expect(canFillSlot(["C"], "UTIL")).toBe(true);
  });

  it("returns true for BN slot with any position (C)", () => {
    expect(canFillSlot(["C"], "BN")).toBe(true);
  });

  it("returns false for SS player in 1B slot", () => {
    expect(canFillSlot(["SS"], "1B")).toBe(false);
  });

  it("returns true for OF literal position in OF slot", () => {
    expect(canFillSlot(["OF"], "OF")).toBe(true);
  });

  it("returns true for DH slot with any position (C)", () => {
    expect(canFillSlot(["C"], "DH")).toBe(true);
  });

  it("returns true for IL slot with any position", () => {
    expect(canFillSlot(["SP"], "IL")).toBe(true);
  });

  it("returns true for P slot with RP player", () => {
    expect(canFillSlot(["RP"], "P")).toBe(true);
  });

  it("returns false for batter in P slot", () => {
    expect(canFillSlot(["1B", "OF"], "P")).toBe(false);
  });

  it("returns true for CI slot with only 1B", () => {
    expect(canFillSlot(["1B"], "CI")).toBe(true);
  });

  it("returns true for MI slot with only 2B", () => {
    expect(canFillSlot(["2B"], "MI")).toBe(true);
  });

  it("returns true for OF slot with RF player", () => {
    expect(canFillSlot(["RF"], "OF")).toBe(true);
  });

  it("does not allow a pitcher in UTIL or DH", () => {
    expect(canFillSlot(["SP"], "UTIL")).toBe(false);
    expect(canFillSlot(["RP"], "DH")).toBe(false);
  });

  it("allows any infielder in IF", () => {
    expect(canFillSlot(["1B"], "IF")).toBe(true);
    expect(canFillSlot(["SS"], "IF")).toBe(true);
    expect(canFillSlot(["OF"], "IF")).toBe(false);
  });

  it("canonicalizes ESPN bench and injured-list aliases", () => {
    expect(canFillSlot(["OF"], "BE")).toBe(true);
    expect(canFillSlot(["SP"], "IL60")).toBe(true);
  });
});
