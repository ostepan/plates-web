import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import { activateProgram, deactivateProgram, finishSession } from "./mutations";
import { currentProgramDay, exerciseE1RMPRs, loadProgram } from "./queries";
import type { ID, SessionExercise, WorkoutSet } from "../models/types";
import type { SetKind } from "../models/enums";

const uid = (): ID => crypto.randomUUID();

async function addExercise(): Promise<ID> {
  const id = uid();
  await db.exercises.add({
    id, nameKey: `test.${id}`, nameEN: "Test Lift", nameCS: "Test",
    muscleGroup: "chest", secondary: [], equipment: "barbell", mechanic: "compound",
    isCustom: true, defaultRestSeconds: 120, createdAt: Date.now(), updatedAt: Date.now(),
  });
  return id;
}

/** Create a (by default finished) session logging one set for `exerciseId`. */
async function logSession(
  exerciseId: ID,
  set: { weight: number; reps: number; kind?: SetKind; isCompleted?: boolean },
  opts?: { finished?: boolean },
): Promise<ID> {
  const sessionId = uid();
  const sxId = uid();
  const t = Date.now();
  await db.sessions.add({
    id: sessionId, date: t, routineNameSnapshot: "Test", durationSeconds: 0,
    notes: "", warmupNotes: "", totalVolume: 0, wasDeloadAtStart: false, createdAt: t, updatedAt: t,
  });
  const sx: SessionExercise = {
    id: sxId, sessionId, exerciseId, order: 0, notesPerExercise: "", prFlagsRaw: 0, createdAt: t,
  };
  await db.sessionExercises.add(sx);
  const ws: WorkoutSet = {
    id: uid(), sessionExerciseId: sxId, order: 0,
    kind: set.kind ?? "working", weight: set.weight, reps: set.reps,
    isCompleted: set.isCompleted ?? true, createdAt: t,
  };
  await db.workoutSets.add(ws);
  if (opts?.finished !== false) await finishSession(sessionId);
  return sessionId;
}

describe("exerciseE1RMPRs", () => {
  it("returns the best Epley e1RM across completed working sets", async () => {
    const ex = await addExercise();
    await logSession(ex, { weight: 100, reps: 5 }); // e1RM 116.67 → 117
    await logSession(ex, { weight: 120, reps: 3 }); // e1RM 132 → 132
    const prs = await exerciseE1RMPRs([ex]);
    expect(prs.get(ex)).toBe(132);
  });

  it("ignores warmup, dropset and incomplete sets", async () => {
    const ex = await addExercise();
    await logSession(ex, { weight: 100, reps: 5 }); // working, counts → 117
    await logSession(ex, { weight: 300, reps: 1, kind: "warmup" }); // ignored (warmup)
    await logSession(ex, { weight: 250, reps: 5, isCompleted: false }); // ignored (incomplete)
    const prs = await exerciseE1RMPRs([ex]);
    expect(prs.get(ex)).toBe(117);
  });

  it("excludeSessionId omits the in-progress workout", async () => {
    const ex = await addExercise();
    await logSession(ex, { weight: 100, reps: 5 }); // history → 117
    const current = await logSession(ex, { weight: 140, reps: 3 }, { finished: false }); // 154

    expect((await exerciseE1RMPRs([ex])).get(ex)).toBe(154); // includes current
    expect((await exerciseE1RMPRs([ex], current)).get(ex)).toBe(117); // record coming in
  });

  it("absent for exercises with no qualifying history", async () => {
    const ex = await addExercise();
    expect((await exerciseE1RMPRs([ex])).has(ex)).toBe(false);
    expect((await exerciseE1RMPRs([])).size).toBe(0);
  });
});

describe("currentProgramDay", () => {
  beforeAll(async () => {
    await seedIfNeeded();
  });

  it("returns undefined when no program is active", async () => {
    const active = (await db.programs.toArray()).filter((p) => p.isActive);
    for (const p of active) await deactivateProgram(p.id);
    expect(await currentProgramDay()).toBeUndefined();
  });

  it("returns the first day, then advances as days are completed", async () => {
    const program = (await db.programs.toArray())[0];
    await activateProgram(program.id);

    const structure = (await loadProgram(program.id))!;
    const days = structure.mesos.flatMap((m) => m.micros.flatMap((mc) => mc.days.map((d) => d.day)));
    expect(days.length).toBeGreaterThan(1);

    const first = await currentProgramDay();
    expect(first?.day.id).toBe(days[0].id);
    expect(first?.program.id).toBe(program.id);

    // Complete day 0 with a finished session → it should drop out of "current".
    const day0Routine = days[0].routineId!;
    const sessionId = crypto.randomUUID();
    const t = Date.now();
    await db.sessions.add({
      id: sessionId, date: t, routineId: day0Routine, routineNameSnapshot: days[0].name,
      durationSeconds: 0, notes: "", warmupNotes: "", totalVolume: 0,
      programDayID: days[0].id, wasDeloadAtStart: false, createdAt: t, updatedAt: t,
    });
    await db.sessionExercises.add({
      id: crypto.randomUUID(), sessionId, exerciseId: undefined, order: 0,
      notesPerExercise: "", prFlagsRaw: 0, createdAt: t,
    });
    await finishSession(sessionId);

    const next = await currentProgramDay();
    expect(next?.day.id).toBe(days[1].id);

    await deactivateProgram(program.id);
  });
});
