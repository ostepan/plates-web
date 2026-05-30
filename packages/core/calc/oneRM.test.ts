import { describe, expect, it } from "vitest";
import { OneRM } from "./oneRM";

describe("OneRM (parity with iOS OneRMCalculator)", () => {
  it("epley: 100kg × 5 = 116.67", () => {
    expect(OneRM.epley(100, 5)).toBeCloseTo(116.667, 2);
  });
  it("returns the weight itself at 1 rep (epley/brzycki)", () => {
    expect(OneRM.epley(140, 1)).toBe(140);
    expect(OneRM.brzycki(140, 1)).toBe(140);
  });
  it("brzycki: 100kg × 5 = 112.85 (1.0278 − 0.0278r form)", () => {
    expect(OneRM.brzycki(100, 5)).toBeCloseTo(100 / (1.0278 - 0.0278 * 5), 4);
  });
  it("guards: zero/invalid input → 0", () => {
    expect(OneRM.epley(0, 5)).toBe(0);
    expect(OneRM.epley(100, 0)).toBe(0);
    expect(OneRM.brzycki(100, 37)).toBe(0);
  });
  it("wathan does NOT collapse to weight at 1 rep", () => {
    expect(OneRM.wathan(100, 1)).toBeGreaterThan(100);
  });
  it("percentage: 80% of 200 = 160", () => {
    expect(OneRM.percentage(200, 80)).toBe(160);
  });
});
