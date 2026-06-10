import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import {
  addExerciseToRoutine, createRoutine, finishSession, getOrCreateRecoverySettings, markMuscleReady,
  saveRecoveryCheckIn, startSessionFromRoutine, toggleSetComplete, updateRecoverySettings, updateSet,
} from "./mutations";
import { detailedMuscleRecovery, muscleRecovery, todayFactors } from "./recovery";
import type { ID } from "../models/types";

let routineId: ID;

/** Log a full bench session (all sets 100×5) and back-date it `hoursAgo`. */
async function logBenchSession(hoursAgo: number): Promise<ID> {
  const sid = await startSessionFromRoutine(routineId);
  const sx = (await db.sessionExercises.where("sessionId").equals(sid).toArray())[0];
  for (const s of await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray()) {
    await updateSet(s.id, { weight: 100, reps: 5 });
    await toggleSetComplete(s.id);
  }
  await finishSession(sid);
  await db.sessions.update(sid, { date: Date.now() - hoursAgo * 3_600_000 });
  return sid;
}

describe("recovery aggregation (M4)", () => {
  beforeAll(async () => {
    await seedIfNeeded();
    const bench = (await db.exercises.toArray()).find((e) => e.nameEN === "Bench Press")!;
    routineId = await createRoutine("Push");
    await addExerciseToRoutine(routineId, bench.id);
    await logBenchSession(24); // chest partially recovered
  });

  it("derives chest recovery from the logged session", async () => {
    const rows = await muscleRecovery();
    const chest = rows.find((r) => r.muscleGroup === "chest");
    expect(chest).toBeTruthy();
    expect(chest!.recoveryPercentage).toBeGreaterThan(0);
    expect(chest!.recoveryPercentage).toBeLessThanOrEqual(100);
    expect(["ready", "acceptable", "caution", "notRecommended", "avoid"]).toContain(chest!.verdict);
  });

  it("credits Bench Press secondaries (triceps, shoulders) at reduced dose", async () => {
    const rows = await muscleRecovery();
    const chest = rows.find((r) => r.muscleGroup === "chest")!;
    const triceps = rows.find((r) => r.muscleGroup === "triceps");
    const shoulders = rows.find((r) => r.muscleGroup === "shoulders");
    expect(triceps).toBeTruthy();
    expect(shoulders).toBeTruthy();
    // half the dose (and a shorter base) ⇒ strictly fresher than the prime mover
    expect(triceps!.recoveryPercentage).toBeGreaterThan(chest.recoveryPercentage);
  });

  it("back-to-back sessions stack fatigue", async () => {
    const before = (await muscleRecovery()).find((r) => r.muscleGroup === "chest")!;
    await logBenchSession(48);
    const after = (await muscleRecovery()).find((r) => r.muscleGroup === "chest")!;
    expect(after.recoveryPercentage).toBeLessThan(before.recoveryPercentage);
  });

  it("upserts a daily check-in (one per day)", async () => {
    await saveRecoveryCheckIn({ sleepQuality: 8, nutritionQuality: 7, stressLevel: 3, energyLevel: 8, sorenessLevel: 2 });
    await saveRecoveryCheckIn({ sleepQuality: 9, nutritionQuality: 9, stressLevel: 2, energyLevel: 9, sorenessLevel: 1 });
    expect(await db.recoveryFactors.count()).toBe(1); // same day → updated, not duplicated
    const today = await todayFactors();
    expect(today!.sleepQuality).toBe(9);
  });

  it("settings singleton is created once and drives the secondary impact", async () => {
    const a = await getOrCreateRecoverySettings();
    const b = await getOrCreateRecoverySettings();
    expect(b.id).toBe(a.id);
    expect(await db.recoverySettings.count()).toBe(1);

    await updateRecoverySettings({ secondaryMuscleImpact: 0 });
    const rows = await muscleRecovery();
    expect(rows.find((r) => r.muscleGroup === "triceps")).toBeUndefined(); // secondary-only work gone
    expect(rows.find((r) => r.muscleGroup === "chest")).toBeTruthy();
    await updateRecoverySettings({ secondaryMuscleImpact: 0.5 });
  });

  it("custom thresholds change the verdict bands", async () => {
    await updateRecoverySettings({ readyThreshold: 10, mostlyRecoveredThreshold: 8, partiallyRecoveredThreshold: 5 });
    const chest = (await muscleRecovery()).find((r) => r.muscleGroup === "chest")!;
    expect(chest.verdict).toBe(chest.recoveryPercentage >= 10 ? "ready" : chest.verdict);
    await updateRecoverySettings({ readyThreshold: 90, mostlyRecoveredThreshold: 70, partiallyRecoveredThreshold: 50 });
  });

  it("mark-as-ready wipes accumulated fatigue until the next session", async () => {
    await markMuscleReady("chest");
    const chest = (await muscleRecovery()).find((r) => r.muscleGroup === "chest")!;
    expect(chest.recoveryPercentage).toBe(100);
    expect(chest.verdict).toBe("ready");

    await logBenchSession(0); // training again (after the override) re-fatigues
    const after = (await muscleRecovery()).find((r) => r.muscleGroup === "chest")!;
    expect(after.recoveryPercentage).toBeLessThan(100);
  });

  it("breaks chest down into heads, with mid chest hit hardest by flat bench", async () => {
    const details = await detailedMuscleRecovery();
    const mid = details.find((d) => d.detail === "midChest")!;
    const upper = details.find((d) => d.detail === "upperChest")!;
    const lower = details.find((d) => d.detail === "lowerChest")!;
    expect(mid.muscleGroup).toBe("chest");
    expect(mid.recoveryPercentage).toBeLessThan(upper.recoveryPercentage);
    expect(mid.recoveryPercentage).toBeLessThan(lower.recoveryPercentage);
  });

  it("credits bench's secondary shoulder work to the front delts, not the rear", async () => {
    const details = await detailedMuscleRecovery();
    const front = details.find((d) => d.detail === "frontDelts")!;
    expect(front.muscleGroup).toBe("shoulders");
    expect(front.recoveryPercentage).toBeLessThan(100);
    expect(details.find((d) => d.detail === "rearDelts")).toBeUndefined();
    // unsplit group → head mirrors the group
    expect(details.find((d) => d.detail === "triceps")).toBeTruthy();
  });

  it("mark-as-ready on a group clears its detail heads too", async () => {
    await markMuscleReady("shoulders");
    const front = (await detailedMuscleRecovery()).find((d) => d.detail === "frontDelts")!;
    expect(front.recoveryPercentage).toBe(100);
  });
});
