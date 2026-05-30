import { describe, expect, it } from "vitest";
import { Recovery, overallRecoveryScore } from "./recovery";

const HOUR_MS = 3_600_000;

describe("Recovery (parity with RecoveryCalculator.swift)", () => {
  it("overall score inverts stress + soreness", () => {
    expect(overallRecoveryScore({ sleepQuality: 5, nutritionQuality: 5, stressLevel: 5, energyLevel: 5, sorenessLevel: 5 })).toBeCloseTo(50, 6);
    expect(overallRecoveryScore({ sleepQuality: 10, nutritionQuality: 10, stressLevel: 1, energyLevel: 10, sorenessLevel: 1 })).toBeCloseTo(96, 6);
  });

  it("chest at 24h of a 48h base ⇒ ~50%", () => {
    const r = Recovery.calculateRecovery({ muscleGroup: "chest", lastTrainedAt: Date.now() - 24 * HOUR_MS });
    expect(r.recoveryPercentage).toBeCloseTo(50, 1);
    expect(r.isReady).toBe(false);
  });

  it("high volume lengthens recovery (25 sets ⇒ 2× base)", () => {
    const r = Recovery.calculateRecovery({ muscleGroup: "chest", lastTrainedAt: Date.now() - 24 * HOUR_MS, trainingVolume: 25 });
    expect(r.recoveryPercentage).toBeCloseTo(25, 1); // 24h of a 96h window
  });

  it("recommendedSetCap scales with recovery", () => {
    expect(Recovery.recommendedSetCap(10, 100)).toBe(10);
    expect(Recovery.recommendedSetCap(10, 70)).toBe(10);
    expect(Recovery.recommendedSetCap(10, 50)).toBe(5);
    expect(Recovery.recommendedSetCap(10, 20)).toBe(2);
    expect(Recovery.recommendedSetCap(10, 3)).toBe(0);
  });

  it("verdict thresholds", () => {
    expect(Recovery.verdict(95, 2)).toBe("ready");
    expect(Recovery.verdict(75, 2)).toBe("acceptable");
    expect(Recovery.verdict(55, 2)).toBe("caution");
    expect(Recovery.verdict(40, 1)).toBe("notRecommended");
    expect(Recovery.verdict(40, 0)).toBe("avoid");
  });
});
