import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import { addExerciseToRoutine, createRoutine, finishSession, startSessionFromRoutine, toggleSetComplete, updateSet } from "./mutations";
import { currentStreak, exerciseE1RMSeries, overviewStats, prTimeline, weeklyVolumeByMuscle } from "./analytics";
import type { ID } from "../models/types";

async function logBench(routineId: ID, benchId: ID, weight: number) {
  const sid = await startSessionFromRoutine(routineId);
  const sx = (await db.sessionExercises.where("sessionId").equals(sid).toArray()).find((s) => s.exerciseId === benchId)!;
  const sets = (await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray()).slice(0, 2);
  for (const s of sets) {
    await updateSet(s.id, { weight, reps: 5 });
    await toggleSetComplete(s.id);
  }
  await finishSession(sid);
}

describe("analytics aggregations (M3)", () => {
  let benchId: ID;
  beforeAll(async () => {
    await seedIfNeeded();
    benchId = (await db.exercises.toArray()).find((e) => e.nameEN === "Bench Press")!.id;
    const routineId = await createRoutine("Push");
    await addExerciseToRoutine(routineId, benchId);
    await logBench(routineId, benchId, 100); // e1RM 116.7
    await logBench(routineId, benchId, 105); // e1RM 122.5
  });

  it("seeds RP volume targets", async () => {
    expect(await db.muscleVolumeTargets.count()).toBe(10);
    const chest = (await db.muscleVolumeTargets.toArray()).find((t) => t.muscleGroup === "chest")!;
    expect(chest).toMatchObject({ mev: 10, mav: 14, mrv: 22 });
  });

  it("e1RM series tracks both sessions, increasing", async () => {
    const pts = await exerciseE1RMSeries(benchId);
    expect(pts).toHaveLength(2);
    expect(pts[1].value).toBeGreaterThan(pts[0].value);
    expect(pts[0].value).toBeCloseTo(116.7, 1);
  });

  it("weekly volume credits chest, with targets joined", async () => {
    const rows = await weeklyVolumeByMuscle(7);
    const chest = rows.find((r) => r.muscleGroup === "chest")!;
    expect(chest.sets).toBe(4); // 2 sessions × 2 working sets
    expect(chest.mrv).toBe(22);
  });

  it("overview + PR timeline", async () => {
    const stats = await overviewStats();
    expect(stats.workouts).toBe(2);
    expect(stats.totalSets).toBe(4);
    expect(stats.streakDays).toBeGreaterThanOrEqual(1);

    const prs = await prTimeline();
    expect(prs.length).toBe(2); // both sessions set a new best
    expect(prs[0].e1rm).toBeGreaterThan(prs[1].e1rm); // newest first
  });

  it("currentStreak agrees with overviewStats but reads only sessions", async () => {
    const streak = await currentStreak();
    const stats = await overviewStats();
    expect(streak).toBe(stats.streakDays); // lightweight path == full path
    expect(streak).toBeGreaterThanOrEqual(1); // both sessions logged today
  });
});
