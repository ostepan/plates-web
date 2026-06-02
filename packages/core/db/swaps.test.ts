import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import { addExerciseToRoutine, createRoutine } from "./mutations";
import { getSwapSuggestions } from "./recovery";

describe("recovery swap suggestions", () => {
  beforeAll(async () => {
    await seedIfNeeded();
  });

  it("flags a fatigued exercise and offers fresher, varied alternatives", async () => {
    const bench = (await db.exercises.toArray()).find((e) => e.nameEN === "Bench Press" && !e.isCustom)!;
    const routineId = await createRoutine("Chest day");
    const reId = await addExerciseToRoutine(routineId, bench.id);

    // A finished session that trained chest right now → chest recovery ≈ 0%.
    const t = Date.now();
    const sid = crypto.randomUUID();
    const sxid = crypto.randomUUID();
    await db.sessions.add({
      id: sid, date: t, routineId, routineNameSnapshot: "Chest day", durationSeconds: 3600,
      notes: "", warmupNotes: "", totalVolume: 1000, wasDeloadAtStart: false, createdAt: t, updatedAt: t,
    });
    await db.sessionExercises.add({
      id: sxid, sessionId: sid, exerciseId: bench.id, order: 0, notesPerExercise: "", prFlagsRaw: 0, createdAt: t,
    });
    await db.workoutSets.bulkAdd(
      [0, 1, 2, 3].map((i) => ({
        id: crypto.randomUUID(), sessionExerciseId: sxid, order: i,
        kind: "working" as const, weight: 100, reps: 8, isCompleted: true, createdAt: t,
      })),
    );

    const suggestions = await getSwapSuggestions(routineId);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].routineExerciseId).toBe(reId);
    expect(suggestions[0].current.id).toBe(bench.id);
    expect(suggestions[0].currentRecovery).toBeLessThan(50);

    const { candidates, currentRecovery } = suggestions[0];
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.recovery).toBeGreaterThanOrEqual(currentRecovery + 15); // freshness gate
      expect(c.exercise.muscleGroup).not.toBe("chest");
    }
    const muscles = candidates.map((c) => c.exercise.muscleGroup);
    expect(new Set(muscles).size).toBe(muscles.length); // one per muscle (varied)
  });

  it("returns nothing when every targeted muscle is fresh", async () => {
    const curl = (await db.exercises.toArray()).find((e) => e.muscleGroup === "biceps" && !e.isCustom)!;
    const routineId = await createRoutine("Arms");
    await addExerciseToRoutine(routineId, curl.id);
    // no recent biceps session → biceps treated as fully recovered → no swap
    const suggestions = await getSwapSuggestions(routineId);
    expect(suggestions.find((s) => s.current.id === curl.id)).toBeUndefined();
  });
});
