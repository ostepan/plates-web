import { describe, expect, it } from "vitest";
import {
  DOSE_REF, Recovery, ageMultiplier, factorsMultiplier, intensityMultiplier, overallRecoveryScore,
} from "./recovery";

const HOUR_MS = 3_600_000;
const NOW = 1_750_000_000_000; // fixed epoch for determinism

const baseline = (hoursAgo: number, sets = DOSE_REF, rpe?: number) => ({
  trainedAt: NOW - hoursAgo * HOUR_MS,
  sets,
  rpe,
});

describe("Recovery (exponential fatigue model)", () => {
  it("overall score inverts stress + soreness", () => {
    expect(overallRecoveryScore({ sleepQuality: 5, nutritionQuality: 5, stressLevel: 5, energyLevel: 5, sorenessLevel: 5 })).toBeCloseTo(50, 6);
    expect(overallRecoveryScore({ sleepQuality: 10, nutritionQuality: 10, stressLevel: 1, energyLevel: 10, sorenessLevel: 1 })).toBeCloseTo(96, 6);
  });

  it("baseline chest session is 90% recovered (ready) exactly at the 48h base time", () => {
    const r = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(48)], now: NOW });
    expect(r.recoveryPercentage).toBeCloseTo(90, 1);
    expect(r.isReady).toBe(true);
    expect(r.hoursUntilReady).toBeCloseTo(0, 4);
  });

  it("recovers fast early, slow tail (24h of 48h ⇒ ~68%, not linear 50%)", () => {
    const r = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24)], now: NOW });
    expect(r.recoveryPercentage).toBeCloseTo(100 * (1 - Math.exp(-Math.LN10 / 2)), 1); // ≈ 68.4
    expect(r.recoveryPercentage).toBeGreaterThan(60);
    expect(r.isReady).toBe(false);
    expect(r.hoursUntilReady).toBeCloseTo(24, 0); // ready at the 48h mark
  });

  it("rounds the asymptotic tail to 100%", () => {
    const r = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(120)], now: NOW });
    expect(r.recoveryPercentage).toBe(100);
  });

  it("volume scales the dose: 10 sets is twice the fatigue of 5", () => {
    const five = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24, 5)], now: NOW });
    const ten = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24, 10)], now: NOW });
    expect(100 - ten.recoveryPercentage).toBeCloseTo(2 * (100 - five.recoveryPercentage), 5);
    expect(ten.hoursUntilReady).toBeGreaterThan(five.hoursUntilReady);
  });

  it("a tiny session leaves the muscle mostly fresh immediately", () => {
    const r = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(0, 1)], now: NOW });
    expect(r.recoveryPercentage).toBeCloseTo(80, 1); // dose 0.2 ⇒ 20% fatigue
  });

  it("back-to-back sessions stack (superposition)", () => {
    const once = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24)], now: NOW });
    const twice = Recovery.calculateRecovery({
      muscleGroup: "chest",
      impulses: [baseline(24), baseline(48)],
      now: NOW,
    });
    expect(twice.recoveryPercentage).toBeLessThan(once.recoveryPercentage);
    expect(twice.hoursUntilReady).toBeGreaterThan(once.hoursUntilReady);
    // and the stacked ready-time solver agrees with the curve
    const at = Recovery.calculateRecovery({
      muscleGroup: "chest",
      impulses: [baseline(24 + twice.hoursUntilReady), baseline(48 + twice.hoursUntilReady)],
      now: NOW,
    });
    expect(at.recoveryPercentage).toBeCloseTo(90, 1);
  });

  it("higher RPE stretches the recovery window", () => {
    const easy = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24, 5, 7)], now: NOW });
    const hard = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24, 5, 10)], now: NOW });
    expect(hard.recoveryPercentage).toBeLessThan(easy.recoveryPercentage);
    expect(hard.hoursUntilReady).toBeCloseTo(48 * 1.4 - 24, 0);
  });

  it("multipliers are smooth (no cliffs at the old bucket edges)", () => {
    expect(intensityMultiplier(7)).toBe(1);
    expect(intensityMultiplier(8)).toBeCloseTo(1.1, 6);
    expect(intensityMultiplier(9)).toBeCloseTo(1.2, 6);
    expect(intensityMultiplier(10)).toBeCloseTo(1.4, 6);
    expect(intensityMultiplier(11)).toBeCloseTo(1.4, 6); // clamped

    expect(factorsMultiplier(0)).toBeCloseTo(2.0, 6);
    expect(factorsMultiplier(50)).toBeCloseTo(1.15, 6);
    expect(factorsMultiplier(60)).toBeCloseTo(1.0, 6);
    expect(factorsMultiplier(59.9)).toBeCloseTo(1.0015, 3); // ε input ⇒ ε output
    expect(factorsMultiplier(100)).toBeCloseTo(0.8, 6);

    expect(ageMultiplier(20)).toBeCloseTo(0.9, 6);
    expect(ageMultiplier(30)).toBeCloseTo(1.0, 6);
    expect(ageMultiplier(45)).toBeCloseTo(1.3, 6);
    expect(ageMultiplier(70)).toBeCloseTo(1.6, 6);
  });

  it("stale check-ins decay toward a neutral multiplier", () => {
    expect(factorsMultiplier(0, 0)).toBeCloseTo(2.0, 6);
    expect(factorsMultiplier(0, 24)).toBeCloseTo(1.5, 6); // halfway to neutral
    expect(factorsMultiplier(0, 48)).toBeCloseTo(1.0, 6);
    expect(factorsMultiplier(0, 200)).toBeCloseTo(1.0, 6);
    expect(factorsMultiplier(100, 24)).toBeCloseTo(0.9, 6);
  });

  it("bad daily factors slow recovery; a deload multiplier under 1 speeds it up", () => {
    const poor = { sleepQuality: 2, nutritionQuality: 2, stressLevel: 9, energyLevel: 2, sorenessLevel: 9 };
    const base = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24)], now: NOW });
    const tired = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24)], factors: poor, now: NOW });
    const deload = Recovery.calculateRecovery({ muscleGroup: "chest", impulses: [baseline(24)], deloadMultiplier: 0.7, now: NOW });
    expect(tired.recoveryPercentage).toBeLessThan(base.recoveryPercentage);
    expect(deload.recoveryPercentage).toBeGreaterThan(base.recoveryPercentage);
  });

  it("no impulses ⇒ fully recovered", () => {
    const r = Recovery.calculateRecovery({ muscleGroup: "legs", impulses: [], now: NOW });
    expect(r.recoveryPercentage).toBe(100);
    expect(r.isReady).toBe(true);
    expect(r.daysUntilReady).toBe(0);
  });

  it("custom recovery times and thresholds are honored", () => {
    const r = Recovery.calculateRecovery({
      muscleGroup: "chest",
      impulses: [baseline(12)],
      customRecoveryTimes: { chest: 24 * 3600 },
      thresholds: { ready: 80, acceptable: 60, caution: 40 },
      now: NOW,
    });
    // 12h of a 24h window ⇒ same curve point as 24h of 48h (≈68%), not ready at 80
    expect(r.recoveryPercentage).toBeCloseTo(68.4, 1);
    expect(r.isReady).toBe(false);
  });

  it("recommendedSetCap scales with recovery", () => {
    expect(Recovery.recommendedSetCap(10, 100)).toBe(10);
    expect(Recovery.recommendedSetCap(10, 70)).toBe(10);
    expect(Recovery.recommendedSetCap(10, 50)).toBe(5);
    expect(Recovery.recommendedSetCap(10, 20)).toBe(2);
    expect(Recovery.recommendedSetCap(10, 3)).toBe(0);
  });

  it("verdict thresholds (default + custom)", () => {
    expect(Recovery.verdict(95, 2)).toBe("ready");
    expect(Recovery.verdict(75, 2)).toBe("acceptable");
    expect(Recovery.verdict(55, 2)).toBe("caution");
    expect(Recovery.verdict(40, 1)).toBe("notRecommended");
    expect(Recovery.verdict(40, 0)).toBe("avoid");
    expect(Recovery.verdict(75, 2, { ready: 70, acceptable: 50, caution: 30 })).toBe("ready");
  });
});
