// Recovery model: exponential decay of accumulated training fatigue.
//
// Each session that hits a muscle deposits a fatigue "dose" (working sets,
// scaled by intensity). Doses decay exponentially with a per-muscle time
// constant; recovery is what's left after summing every residual dose:
//
//   fatigue(t)  = Σ dose_i / DOSE_REF × e^(−λ·(t − t_i)/T_i)
//   recovery(t) = 100 × (1 − min(1, fatigue(t)))
//
// λ = ln(10), so a single baseline session (DOSE_REF working sets at RPE ≤ 7)
// reaches 90% ("ready") exactly at the muscle's base recovery time — the same
// calendar semantics as the original linear port of RecoveryCalculator.swift,
// but with a realistic fast-early/slow-tail curve, and with back-to-back
// sessions stacking instead of only the latest one counting.
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
export const BASE_RECOVERY: Record<MuscleGroup, number> = {
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

/** Decay rate: one baseline dose is 90% recovered at exactly the base time. */
export const LAMBDA = Math.log(10);
/** Baseline session: this many working sets at RPE ≤ 7 ⇒ dose 1.0. */
export const DOSE_REF = 5;
/** Doses are capped at this many baselines so one giant session can't blow up. */
export const MAX_DOSE = 3;
/** A factors check-in older than this contributes nothing to the multiplier. */
export const FACTORS_STALE_HOURS = 48;

export interface RecoveryThresholds {
  ready: number; // ≥ ⇒ "ready"
  acceptable: number; // ≥ ⇒ "acceptable" (mostly recovered)
  caution: number; // ≥ ⇒ "caution" (partially recovered)
}
export const DEFAULT_THRESHOLDS: RecoveryThresholds = { ready: 90, acceptable: 70, caution: 50 };

/** App-wide defaults for the RecoverySettings singleton. */
export const RECOVERY_SETTINGS_DEFAULTS = {
  secondaryMuscleImpact: 0.5,
  readyThreshold: 90,
  mostlyRecoveredThreshold: 70,
  partiallyRecoveredThreshold: 50,
  recoveringThreshold: 25,
  deloadMultiplier: 0.7, // deload = lighter work ⇒ faster recovery
} as const;

export type RecoveryVerdict = "ready" | "acceptable" | "caution" | "notRecommended" | "avoid";

/** One session's fatigue contribution to a muscle. */
export interface FatigueImpulse {
  trainedAt: number; // epoch ms
  /** Working sets credited to the muscle (secondary work pre-weighted by the caller). */
  sets: number;
  /** Set-weighted mean RPE of those sets; defaults to 7 (≤7 ⇒ no extra fatigue). */
  rpe?: number;
}

export interface RecoveryResult {
  muscleGroup: MuscleGroup;
  recoveryPercentage: number;
  estimatedReadyAt: number; // epoch ms — when the ready threshold is crossed
  hoursUntilReady: number;
  daysUntilReady: number;
  isReady: boolean;
}

/** Piecewise-linear interpolation over sorted [x, y] anchors, clamped at the ends. */
function lerp(anchors: [number, number][], x: number): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x1, y1] = anchors[i];
    if (x <= x1) {
      const [x0, y0] = anchors[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return anchors[anchors.length - 1][1];
}

/** Effort multiplier on recovery time: 1.0 at RPE ≤ 7 → 1.2 at 9 → 1.4 at 10. */
export function intensityMultiplier(rpe: number): number {
  return lerp([[7, 1.0], [9, 1.2], [10, 1.4]], rpe);
}

/**
 * Daily-factors multiplier on recovery time (0.8 great day → 2.0 terrible day),
 * blended toward neutral 1.0 as the check-in ages (zero weight after 48h) so a
 * stale bad day can't keep inflating recovery times.
 */
export function factorsMultiplier(score: number, ageHours = 0): number {
  const raw = lerp([[0, 2.0], [20, 1.6], [40, 1.3], [60, 1.0], [80, 0.8], [100, 0.8]], score);
  const w = Math.max(0, Math.min(1, 1 - ageHours / FACTORS_STALE_HOURS));
  return 1 + (raw - 1) * w;
}

/** Age multiplier on recovery time: 0.9 at ≤22 → 1.6 at ≥60. */
export function ageMultiplier(age: number): number {
  return lerp([[22, 0.9], [30, 1.0], [40, 1.2], [50, 1.4], [60, 1.6]], age);
}

export interface CalcOptions {
  muscleGroup: MuscleGroup;
  /** Sessions that hit this muscle, any order. Empty ⇒ fully recovered. */
  impulses: FatigueImpulse[];
  factors?: RecoveryFactorsInput | null;
  /** Hours since the factors check-in was logged (drives staleness decay). */
  factorsAgeHours?: number;
  userAge?: number | null;
  customRecoveryTimes?: Record<string, number>; // seconds per muscle
  /** Explicit base recovery time (seconds), e.g. for a detail head; wins over the muscle-group lookup. */
  baseRecoverySeconds?: number;
  deloadMultiplier?: number;
  thresholds?: RecoveryThresholds;
  now?: number; // epoch ms, for deterministic tests
}

export const Recovery = {
  overallRecoveryScore,

  /** Recovery from the full set of recent fatigue impulses (superposition). */
  calculateRecovery(opts: CalcOptions): RecoveryResult {
    const {
      muscleGroup, impulses, factors, factorsAgeHours = 0, userAge,
      customRecoveryTimes, deloadMultiplier = 1, thresholds = DEFAULT_THRESHOLDS,
    } = opts;
    const now = opts.now ?? Date.now();

    const base =
      opts.baseRecoverySeconds ?? customRecoveryTimes?.[muscleGroup] ?? BASE_RECOVERY[muscleGroup] ?? 48 * HOUR;
    // Condition multipliers stretch/shrink the decay time-constant.
    const condition =
      (factors ? factorsMultiplier(overallRecoveryScore(factors), factorsAgeHours) : 1) *
      (userAge != null ? ageMultiplier(userAge) : 1) *
      deloadMultiplier;

    // Residual fatigue per impulse at `now`, plus each impulse's time constant
    // (intensity stretches the individual impulse; conditions stretch all).
    const terms = impulses
      .filter((i) => i.trainedAt <= now && i.sets > 0)
      .map((i) => {
        const T = base * intensityMultiplier(i.rpe ?? 7) * condition; // seconds
        const dose = Math.min(MAX_DOSE, i.sets / DOSE_REF);
        const elapsed = (now - i.trainedAt) / 1000;
        return { dose, T, residual: dose * Math.exp((-LAMBDA * elapsed) / T) };
      });

    const fatigueAt = (dtSeconds: number) =>
      terms.reduce((s, x) => s + x.residual * Math.exp((-LAMBDA * dtSeconds) / x.T), 0);

    const fatigue = fatigueAt(0);
    // Round the asymptotic tail away: below 0.5% residual counts as fully recovered.
    const recoveryPercentage = fatigue <= 0.005 ? 100 : Math.max(0, Math.min(100, 100 * (1 - fatigue)));

    // Time until the ready threshold: residual fatigue ≤ 1 − ready/100.
    const targetFatigue = Math.max(0.001, 1 - thresholds.ready / 100);
    let hoursUntilReady = 0;
    if (fatigue > targetFatigue && terms.length) {
      let lo = 0;
      let hi = (Math.max(...terms.map((x) => x.T)) / LAMBDA) * Math.log(fatigue / targetFatigue) * 1.0001;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (fatigueAt(mid) > targetFatigue) lo = mid;
        else hi = mid;
      }
      hoursUntilReady = hi / HOUR;
    }

    return {
      muscleGroup,
      recoveryPercentage,
      estimatedReadyAt: now + hoursUntilReady * HOUR * 1000,
      hoursUntilReady,
      daysUntilReady: Math.ceil(hoursUntilReady / 24),
      isReady: recoveryPercentage >= thresholds.ready,
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

  verdict(
    recoveryPercentage: number,
    daysSinceTrained: number,
    thresholds: RecoveryThresholds = DEFAULT_THRESHOLDS,
  ): RecoveryVerdict {
    if (recoveryPercentage >= thresholds.ready) return "ready";
    if (recoveryPercentage >= thresholds.acceptable) return "acceptable";
    if (recoveryPercentage >= thresholds.caution) return "caution";
    if (daysSinceTrained >= 1) return "notRecommended";
    return "avoid";
  },
};
