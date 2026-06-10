// Smart-autotype suggestion engine: given how the last session's set at a given
// position went, propose the *next* target (progressive overload). Pure + DB-free
// so it stays unit-testable, mirroring oneRM.ts / plate.ts.
//
// Double-progression model: climb reps within the target rep window at a fixed
// weight; once the top of the window is reached with reps to spare (RIR), add a
// weight increment and drop back to the bottom of the window. Falling below the
// window at RIR 0 steps the weight back one increment instead.

import { OneRM } from "./oneRM";

export type SuggestReason = "progress" | "addRep" | "hold" | "backOff" | "start";

export interface SetSuggestion {
  weight: number;
  reps: number;
  rir: number;
  reason: SuggestReason;
}

export interface SuggestOptions {
  /** The ghost set at the same position from the last finished session. */
  last?: { weight: number; reps: number; rir?: number };
  /** Routine rep window, if the exercise is in a routine. */
  repMin?: number;
  repMax?: number;
  /** Routine target RIR; defaults to 2 when unset. */
  targetRIR?: number;
  /** Weight increment for one notch up: 2.5 (kg) / 5 (lb). */
  increment: number;
  /** Routine target weight, used to seed a suggestion when there is no history. */
  fallbackWeight?: number;
  /**
   * Recovery guard: when the muscle is under-recovered, don't propose an
   * advance (weight or reps) — repeat last session's working numbers instead.
   */
  holdProgress?: boolean;
}

const round2 = (n: number): number => +n.toFixed(2);

/**
 * Without a routine rep window, stop climbing reps at this ceiling and add
 * weight instead — otherwise the synthesized window slides up with every
 * session and a weight increase is never suggested.
 */
const AUTO_REP_CEILING = 12;

/** Reps at the new weight that keep the Epley e1RM flat (no-window progression). */
function equivalentReps(weight: number, reps: number, newWeight: number): number {
  const e1rm = OneRM.epley(weight, reps);
  if (newWeight <= 0 || e1rm <= newWeight) return 1;
  return Math.max(1, Math.min(reps, Math.round(30 * (e1rm / newWeight - 1))));
}

/**
 * Suggest the next set, or `undefined` when there's nothing to go on (no history
 * and no fallback weight). Callers can compare the result against the set's
 * current values to decide whether to surface it.
 */
export function suggestNextSet(opts: SuggestOptions): SetSuggestion | undefined {
  const targetRIR = opts.targetRIR ?? 2;
  const { last, increment } = opts;

  if (!last || last.weight <= 0) {
    if (opts.fallbackWeight && opts.fallbackWeight > 0) {
      return { weight: opts.fallbackWeight, reps: opts.repMin ?? 0, rir: targetRIR, reason: "start" };
    }
    return undefined;
  }

  // Default the rep window around what was done last time when no routine target.
  const hasWindow = opts.repMax != null;
  const repMin = opts.repMin ?? last.reps;
  const repMax = opts.repMax ?? Math.max(repMin, Math.min(last.reps + 2, AUTO_REP_CEILING));
  const lastRIR = last.rir ?? targetRIR;

  if (opts.holdProgress) {
    return { weight: last.weight, reps: last.reps, rir: targetRIR, reason: "hold" };
  }

  // Ground to a halt below the routine window → step the weight back one
  // increment to get back inside it. Requires a logged RIR of 0 so an unlogged
  // RIR (assumed on-target) or a deliberately short set doesn't trigger it.
  if (hasWindow && last.reps < repMin && last.rir != null && last.rir <= 0) {
    return {
      weight: round2(Math.max(0, last.weight - increment)),
      reps: repMin,
      rir: targetRIR,
      reason: "backOff",
    };
  }

  if (last.reps >= repMax && lastRIR >= targetRIR) {
    const weight = round2(last.weight + increment);
    // With a routine window, restart at its bottom; without one, drop reps just
    // enough to keep the estimated 1RM flat at the heavier weight.
    const reps = hasWindow ? repMin : equivalentReps(last.weight, last.reps, weight);
    return { weight, reps, rir: targetRIR, reason: "progress" };
  }
  if (lastRIR > targetRIR) {
    return { weight: last.weight, reps: Math.min(repMax, last.reps + 1), rir: targetRIR, reason: "addRep" };
  }
  return { weight: last.weight, reps: last.reps, rir: targetRIR, reason: "hold" };
}
