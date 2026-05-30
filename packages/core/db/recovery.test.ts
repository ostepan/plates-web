import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import {
  addExerciseToRoutine, createRoutine, finishSession, saveRecoveryCheckIn,
  startSessionFromRoutine, toggleSetComplete, updateSet,
} from "./mutations";
import { muscleRecovery, todayFactors } from "./recovery";
import type { ID } from "../models/types";

describe("recovery aggregation (M4)", () => {
  beforeAll(async () => {
    await seedIfNeeded();
    const bench = (await db.exercises.toArray()).find((e) => e.nameEN === "Bench Press")!;
    const routineId = await createRoutine("Push");
    await addExerciseToRoutine(routineId, bench.id);
    const sid = await startSessionFromRoutine(routineId);
    const sx = (await db.sessionExercises.where("sessionId").equals(sid).toArray())[0];
    for (const s of await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray()) {
      await updateSet(s.id, { weight: 100, reps: 5 });
      await toggleSetComplete(s.id);
    }
    await finishSession(sid);
    // back-date the session so chest has partially recovered
    await db.sessions.update(sid as ID, { date: Date.now() - 24 * 3_600_000 });
  });

  it("derives chest recovery from the logged session", async () => {
    const rows = await muscleRecovery();
    const chest = rows.find((r) => r.muscleGroup === "chest");
    expect(chest).toBeTruthy();
    expect(chest!.recoveryPercentage).toBeGreaterThan(0);
    expect(chest!.recoveryPercentage).toBeLessThanOrEqual(100);
    expect(["ready", "acceptable", "caution", "notRecommended", "avoid"]).toContain(chest!.verdict);
  });

  it("upserts a daily check-in (one per day)", async () => {
    await saveRecoveryCheckIn({ sleepQuality: 8, nutritionQuality: 7, stressLevel: 3, energyLevel: 8, sorenessLevel: 2 });
    await saveRecoveryCheckIn({ sleepQuality: 9, nutritionQuality: 9, stressLevel: 2, energyLevel: 9, sorenessLevel: 1 });
    expect(await db.recoveryFactors.count()).toBe(1); // same day → updated, not duplicated
    const today = await todayFactors();
    expect(today!.sleepQuality).toBe(9);
  });
});
