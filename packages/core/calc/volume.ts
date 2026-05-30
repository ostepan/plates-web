// Port of PlatesCore/Calculators/VolumeCalculator.swift.
import type { MuscleGroup } from "../models/enums";
import type { WorkoutSet } from "../models/types";

export const Volume = {
  /** Total tonnage (weight × reps) of all completed working sets. */
  totalVolume(sets: WorkoutSet[]): number {
    return sets
      .filter((s) => s.isCompleted && s.kind === "working")
      .reduce((sum, s) => sum + s.weight * s.reps, 0);
  },

  /**
   * Working-set count per primary muscle group. Because IndexedDB has no joins,
   * the caller supplies the muscle group for each session-exercise's sets.
   */
  setsPerMuscleGroup(
    groups: { muscleGroup: MuscleGroup; sets: WorkoutSet[] }[],
  ): Partial<Record<MuscleGroup, number>> {
    const counts: Partial<Record<MuscleGroup, number>> = {};
    for (const g of groups) {
      const working = g.sets.filter((s) => s.isCompleted && s.kind === "working").length;
      counts[g.muscleGroup] = (counts[g.muscleGroup] ?? 0) + working;
    }
    return counts;
  },
};
