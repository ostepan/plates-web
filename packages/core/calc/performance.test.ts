import { describe, expect, it } from "vitest";
import { Performance, type Point } from "./performance";

const DAY = 86_400_000;
const series = (vals: number[]): Point[] => vals.map((value, i) => ({ date: i * 7 * DAY, value }));

describe("Performance (parity with PerformanceAnalytics.swift)", () => {
  it("flags a plateau when spread ≤ threshold", () => {
    const p = Performance.detectPlateau(series([100, 101, 100.5, 100]));
    expect(p).not.toBeNull();
    expect(p!.spreadPercent).toBeCloseTo(1, 4);
  });

  it("no plateau on a clear rise", () => {
    expect(Performance.detectPlateau(series([100, 105, 110, 120]))).toBeNull();
  });

  it("velocity: +10 every 7 days ⇒ ~42.86 units/month", () => {
    const v = Performance.velocity(series([100, 110, 120]));
    expect(v).not.toBeNull();
    expect(v!.slopePerDay).toBeCloseTo(10 / 7, 5);
    expect(v!.unitsPerMonth).toBeCloseTo((10 / 7) * 30, 4);
  });

  it("velocity null without enough span", () => {
    expect(Performance.velocity([{ date: 0, value: 100 }, { date: DAY, value: 110 }])).toBeNull();
  });

  it("predict1RM projects the line forward, else holds last", () => {
    const proj = Performance.predict1RM(series([100, 110, 120]), 30);
    expect(proj!.value).toBeCloseTo(120 + (10 / 7) * 30, 3);
    const held = Performance.predict1RM([{ date: 0, value: 90 }], 30);
    expect(held!.value).toBe(90);
  });
});
