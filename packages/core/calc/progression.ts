// Smart-autotype suggestion engine: given how the last session's set at a given
// position went, propose the *next* target (progressive overload). Pure + DB-free
// so it stays unit-testable, mirroring oneRM.ts / plate.ts.
//
// Double-progression model: climb reps within the target rep window at a fixed
// weight; once the top of the window is reached with reps to spare (RIR), add a
// weight increment and drop back to the bottom of the window.

export type SuggestReason = "progress" | "addRep" | "hold";

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
 * Suggest the next set, or `undefined` when there's nothing to go on (no history
 * and no fallback weight). Callers can compare the result against the set's
 * current values to decide whether to surface it.
 */
export function suggestNextSet(opts: SuggestOptions): SetSuggestion | undefined {
  const targetRIR = opts.targetRIR ?? 2;
  const { last, increment } = opts;

  if (!last || last.weight <= 0) {
    if (opts.fallbackWeight && opts.fallbackWeight > 0) {
      return { weight: opts.fallbackWeight, reps: opts.repMin ?? 0, rir: targetRIR, reason: "hold" };
    }
    return undefined;
  }

  // Default the rep window around what was done last time when no routine target.
  const repMin = opts.repMin ?? last.reps;
  const repMax = opts.repMax ?? last.reps + 2;
  const lastRIR = last.rir ?? targetRIR;

  if (opts.holdProgress) {
    return { weight: last.weight, reps: last.reps, rir: targetRIR, reason: "hold" };
  }

  if (last.reps >= repMax && lastRIR >= targetRIR) {
    return { weight: round2(last.weight + increment), reps: repMin, rir: targetRIR, reason: "progress" };
  }
  if (lastRIR > targetRIR) {
    return { weight: last.weight, reps: Math.min(repMax, last.reps + 1), rir: targetRIR, reason: "addRep" };
  }
  return { weight: last.weight, reps: last.reps, rir: targetRIR, reason: "hold" };
}
