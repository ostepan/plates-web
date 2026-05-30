// Port of PlatesCore/Calculators/RecoveryCalculator.swift + RecoveryFactors.overallRecoveryScore.
// Works in SECONDS for recovery time (matching the Swift formula); dates are epoch-ms.
import type { MuscleGroup } from "../models/enums";

export interface RecoveryFactorsInput {
  sleepQuality: number;
  nutritionQuality: number;
  stressLevel: number;
  energyLevel: number;
  sorenessLevel: number;
}

/** Overall 0–100 recovery score from the 5 daily factors (stress/soreness inverted). */
export function overallRecoveryScore(f: RecoveryFactorsInput): number {
  const sleep = f.sleepQuality / 10;
  const nutrition = f.nutritionQuality / 10;
  const stress = (10 - f.stressLevel) / 10;
  const energy = f.energyLevel / 10;
  const soreness = (10 - f.sorenessLevel) / 10;
  return ((sleep + nutrition + stress + energy + soreness) / 5) * 100;
}

const HOUR = 3600; // seconds

// Base recovery time (seconds) per muscle group under optimal conditions.
const BASE_RECOVERY: Record<MuscleGroup, number> = {
  chest: 48 * HOUR,
  back: 48 * HOUR,
  shoulders: 48 * HOUR,
  legs: 72 * HOUR,
  glutes: 72 * HOUR,
  biceps: 36 * HOUR,
  triceps: 36 * HOUR,
  forearms: 24 * HOUR,
  calves: 24 * HOUR,
  abs: 36 * HOUR,
  cardio: 24 * HOUR,
  fullBody: 72 * HOUR,
};

export type RecoveryVerdict = "ready" | "acceptable" | "caution" | "notRecommended" | "avoid";

export interface RecoveryResult {
  muscleGroup: MuscleGroup;
  recoveryPercentage: number;
  estimatedReadyAt: number; // epoch ms
  hoursUntilReady: number;
  daysUntilReady: number;
  isReady: boolean;
}

function volumeMultiplier(volume: number): number {
  if (volume <= 0) return 1;
  const additional = Math.max(0, volume - 5);
  return Math.min(2, Math.max(1, 1 + additional * 0.05));
}
function intensityMultiplier(rpe: number): number {
  if (rpe <= 7) return 1;
  if (rpe <= 9) return 1.2;
  return 1.4;
}
function factorsMultiplier(score: number): number {
  const r = score / 100;
  if (r >= 0.8) return 0.8;
  if (r >= 0.6) return 1.0;
  if (r >= 0.4) return 1.3;
  if (r >= 0.2) return 1.6;
  return 2.0;
}
function ageMultiplier(age: number): number {
  if (age < 25) return 0.9;
  if (age <= 35) return 1.0;
  if (age <= 45) return 1.2;
  if (age <= 55) return 1.4;
  return 1.6;
}

export const Recovery = {
  overallRecoveryScore,

  calculateRecovery(opts: {
    muscleGroup: MuscleGroup;
    lastTrainedAt: number;
    factors?: RecoveryFactorsInput | null;
    trainingVolume?: number;
    trainingIntensity?: number;
    userAge?: number | null;
    customRecoveryTimes?: Record<string, number>;
    deloadMultiplier?: number;
  }): RecoveryResult {
    const {
      muscleGroup, lastTrainedAt, factors, trainingVolume = 0,
      trainingIntensity = 7, userAge, customRecoveryTimes, deloadMultiplier = 1,
    } = opts;

    const base = customRecoveryTimes?.[muscleGroup] ?? BASE_RECOVERY[muscleGroup] ?? 48 * HOUR;
    const total =
      base *
      volumeMultiplier(trainingVolume) *
      intensityMultiplier(trainingIntensity) *
      (factors ? factorsMultiplier(overallRecoveryScore(factors)) : 1) *
      (userAge != null ? ageMultiplier(userAge) : 1) *
      deloadMultiplier;

    const timeSince = (Date.now() - lastTrainedAt) / 1000; // seconds
    const recoveryPercentage = Math.min(100, (timeSince / total) * 100);
    const hoursUntilReady = Math.max(0, (total - timeSince) / HOUR);
    return {
      muscleGroup,
      recoveryPercentage,
      estimatedReadyAt: lastTrainedAt + total * 1000,
      hoursUntilReady,
      daysUntilReady: Math.ceil(hoursUntilReady / 24),
      isReady: recoveryPercentage >= 90,
    };
  },

  /** Sets a fatigued muscle can absorb today vs the planned count. */
  recommendedSetCap(plannedSets: number, recoveryPercentage: number, acceptableThreshold = 70): number {
    if (plannedSets <= 0) return 0;
    if (recoveryPercentage >= acceptableThreshold) return plannedSets;
    if (recoveryPercentage < 5) return 0;
    const ratio = Math.max(0, Math.min(1, recoveryPercentage / 100));
    return Math.max(1, Math.round(plannedSets * ratio));
  },

  verdict(recoveryPercentage: number, daysSinceTrained: number): RecoveryVerdict {
    if (recoveryPercentage >= 90) return "ready";
    if (recoveryPercentage >= 70) return "acceptable";
    if (recoveryPercentage >= 50) return "caution";
    if (daysSinceTrained >= 1) return "notRecommended";
    return "avoid";
  },
};
