import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import {
  addExerciseToRoutine, createRoutine, finishSession, lastCompletedSets,
  startSessionFromRoutine, toggleSetComplete, unfinishedSession, updateSet,
} from "./mutations";

describe("core logging loop (against in-memory IndexedDB)", () => {
  beforeAll(async () => {
    await seedIfNeeded();
  });

  it("seeds the exercise library", async () => {
    expect(await db.exercises.count()).toBeGreaterThan(100);
  });

  it("runs create routine → start → log → finish → history → ghost", async () => {
    const bench = (await db.exercises.toArray()).find((e) => e.nameEN === "Bench Press")!;
    expect(bench).toBeTruthy();

    // build a routine
    const routineId = await createRoutine("Test Push");
    await addExerciseToRoutine(routineId, bench.id);

    // start a session — should pre-seed 3 working sets
    const sessionId = await startSessionFromRoutine(routineId);
    const sx = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray())[0];
    let sets = await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray();
    expect(sets).toHaveLength(3);

    // it's the unfinished session
    expect((await unfinishedSession())?.id).toBe(sessionId);

    // log two completed sets: 100×5 and 100×5
    sets = sets.sort((a, b) => a.order - b.order);
    for (const s of sets.slice(0, 2)) {
      await updateSet(s.id, { weight: 100, reps: 5 });
      await toggleSetComplete(s.id);
    }

    await finishSession(sessionId);
    const finished = await db.sessions.get(sessionId);
    expect(finished!.durationSeconds).toBeGreaterThan(0);
    expect(finished!.totalVolume).toBe(1000); // 2 × (100×5)

    // appears in history (durationSeconds > 0)
    const history = (await db.sessions.toArray()).filter((s) => s.durationSeconds > 0);
    expect(history.map((s) => s.id)).toContain(sessionId);

    // ghost: a NEW session for the same exercise sees last session's sets
    const next = await startSessionFromRoutine(routineId);
    const ghost = await lastCompletedSets(bench.id, next);
    expect(ghost).toHaveLength(2);
    expect(ghost[0]).toMatchObject({ weight: 100, reps: 5 });
  });
});
