// Write API over the Dexie store. Centralizes the cascade-delete logic and the
// session lifecycle (start → log → finish) ported from the iOS
// ActiveWorkoutFactory / ActiveWorkoutModel.
import { db } from "./db";
import type {
  BodyWeightEntry, ID, MuscleVolumeTarget, Routine, RoutineExercise, Session, SessionExercise, WorkoutSet,
} from "../models/types";
import type { SetKind, WeightUnit } from "../models/enums";

const newId = (): ID => crypto.randomUUID();
const now = (): number => Date.now();

// ---- Routines -------------------------------------------------------------

export async function createRoutine(name: string, notes = ""): Promise<ID> {
  const t = now();
  const id = newId();
  const routine: Routine = { id, name, notes, createdAt: t, updatedAt: t };
  await db.routines.add(routine);
  return id;
}

export async function renameRoutine(id: ID, name: string, notes?: string): Promise<void> {
  await db.routines.update(id, { name, ...(notes !== undefined ? { notes } : {}), updatedAt: now() });
}

export async function addExerciseToRoutine(
  routineId: ID,
  exerciseId: ID,
): Promise<ID> {
  const ex = await db.exercises.get(exerciseId);
  const count = await db.routineExercises.where("routineId").equals(routineId).count();
  const id = newId();
  const re: RoutineExercise = {
    id,
    routineId,
    exerciseId,
    order: count,
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 12,
    restSeconds: ex?.defaultRestSeconds ?? 120,
    createdAt: now(),
  };
  await db.routineExercises.add(re);
  return id;
}

export async function updateRoutineExercise(
  id: ID,
  patch: Partial<Omit<RoutineExercise, "id" | "routineId">>,
): Promise<void> {
  await db.routineExercises.update(id, patch);
}

export async function removeRoutineExercise(id: ID): Promise<void> {
  await db.routineExercises.delete(id);
}

export async function deleteRoutine(routineId: ID): Promise<void> {
  await db.transaction("rw", db.routines, db.routineExercises, db.supersetGroups, async () => {
    await db.routineExercises.where("routineId").equals(routineId).delete();
    await db.supersetGroups.where("routineId").equals(routineId).delete();
    await db.routines.delete(routineId);
  });
}

// ---- Session lifecycle ----------------------------------------------------

/** Create an in-progress Session from a routine, pre-seeding target sets. */
export async function startSessionFromRoutine(
  routineId: ID,
  opts?: { programDayId?: ID },
): Promise<ID> {
  const routine = await db.routines.get(routineId);
  const res = (await db.routineExercises.where("routineId").equals(routineId).toArray())
    .sort((a, b) => a.order - b.order);
  const t = now();
  const sessionId = newId();

  const session: Session = {
    id: sessionId,
    date: t,
    routineId,
    routineNameSnapshot: routine?.name ?? "",
    durationSeconds: 0,
    notes: "",
    warmupNotes: "",
    totalVolume: 0,
    programDayID: opts?.programDayId,
    wasDeloadAtStart: false,
    createdAt: t,
    updatedAt: t,
  };

  const sessionExercises: SessionExercise[] = [];
  const sets: WorkoutSet[] = [];
  for (const re of res) {
    const sxId = newId();
    sessionExercises.push({
      id: sxId,
      sessionId,
      exerciseId: re.exerciseId,
      order: re.order,
      notesPerExercise: "",
      prFlagsRaw: 0,
      supersetGroupID: re.supersetGroupId,
      createdAt: t,
    });
    for (let i = 0; i < Math.max(1, re.targetSets); i++) {
      sets.push({
        id: newId(),
        sessionExerciseId: sxId,
        order: i,
        kind: "working",
        weight: re.targetWeight ?? 0,
        reps: 0,
        rir: re.targetRIR,
        isCompleted: false,
        createdAt: t,
      });
    }
  }

  await db.transaction("rw", db.sessions, db.sessionExercises, db.workoutSets, db.routines, async () => {
    await db.sessions.add(session);
    await db.sessionExercises.bulkAdd(sessionExercises);
    await db.workoutSets.bulkAdd(sets);
    if (routine) await db.routines.update(routineId, { lastUsed: t });
  });

  return sessionId;
}

export async function addSet(sessionExerciseId: ID, kind: SetKind = "working"): Promise<ID> {
  const existing = await db.workoutSets.where("sessionExerciseId").equals(sessionExerciseId).toArray();
  const last = existing.sort((a, b) => a.order - b.order).at(-1);
  const id = newId();
  await db.workoutSets.add({
    id,
    sessionExerciseId,
    order: existing.length,
    kind,
    weight: last?.weight ?? 0,
    reps: last?.reps ?? 0,
    rir: last?.rir,
    isCompleted: false,
    createdAt: now(),
  });
  return id;
}

export async function updateSet(
  id: ID,
  patch: Partial<Pick<WorkoutSet, "weight" | "reps" | "rir" | "rpe" | "kind" | "isCompleted">>,
): Promise<void> {
  await db.workoutSets.update(id, patch);
}

export async function toggleSetComplete(id: ID): Promise<boolean> {
  const set = await db.workoutSets.get(id);
  if (!set) return false;
  const next = !set.isCompleted;
  await db.workoutSets.update(id, { isCompleted: next });
  return next;
}

export async function deleteSet(id: ID): Promise<void> {
  await db.workoutSets.delete(id);
}

/** Finish: stamp duration + total volume so it leaves the in-progress state. */
export async function finishSession(sessionId: ID): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const sxIds = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray()).map((s) => s.id);
  const sets = await db.workoutSets.where("sessionExerciseId").anyOf(sxIds).toArray();
  const totalVolume = sets
    .filter((s) => s.isCompleted && s.kind === "working")
    .reduce((sum, s) => sum + s.weight * s.reps, 0);
  const duration = Math.max(1, Math.round((now() - session.createdAt) / 1000));
  await db.sessions.update(sessionId, {
    durationSeconds: duration,
    totalVolume,
    date: session.createdAt,
    updatedAt: now(),
  });
}

export async function discardSession(sessionId: ID): Promise<void> {
  await db.transaction("rw", db.sessions, db.sessionExercises, db.workoutSets, async () => {
    const sxIds = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray()).map((s) => s.id);
    await db.workoutSets.where("sessionExerciseId").anyOf(sxIds).delete();
    await db.sessionExercises.where("sessionId").equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

/**
 * Most recent completed working sets for an exercise from a *finished* session
 * — the "ghost" values shown while logging. Excludes the current session.
 */
export async function lastCompletedSets(
  exerciseId: ID,
  excludeSessionId: ID,
): Promise<WorkoutSet[]> {
  const finished = (await db.sessions.toArray())
    .filter((s) => s.durationSeconds > 0 && s.id !== excludeSessionId)
    .sort((a, b) => b.date - a.date);
  for (const session of finished) {
    const sx = (await db.sessionExercises.where("sessionId").equals(session.id).toArray())
      .find((s) => s.exerciseId === exerciseId);
    if (!sx) continue;
    const sets = (await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray())
      .filter((s) => s.isCompleted && s.kind === "working")
      .sort((a, b) => a.order - b.order);
    if (sets.length) return sets;
  }
  return [];
}

/** Find the currently in-progress session, if any (durationSeconds === 0). */
export async function unfinishedSession(): Promise<Session | undefined> {
  const open = (await db.sessions.where("durationSeconds").equals(0).toArray())
    .sort((a, b) => b.date - a.date);
  return open[0];
}

// ---- Programs -------------------------------------------------------------

/** Activate a program; only one program is active at a time. */
export async function activateProgram(programId: ID): Promise<void> {
  await db.transaction("rw", db.programs, async () => {
    // booleans aren't valid IndexedDB keys, so scan the (small) program set.
    for (const p of await db.programs.toArray()) {
      if (p.isActive && p.id !== programId) await db.programs.update(p.id, { isActive: false });
    }
    await db.programs.update(programId, { isActive: true, updatedAt: now() });
  });
}

export async function deactivateProgram(programId: ID): Promise<void> {
  await db.programs.update(programId, { isActive: false, updatedAt: now() });
}

/** Start a workout from a program-day (stamps the session with the day id). */
export async function startProgramDay(programDayId: ID): Promise<ID | null> {
  const day = await db.programDays.get(programDayId);
  if (!day?.routineId) return null;
  return startSessionFromRoutine(day.routineId, { programDayId });
}

// ---- Recovery -------------------------------------------------------------

export interface RecoveryCheckInInput {
  sleepQuality: number;
  nutritionQuality: number;
  stressLevel: number;
  energyLevel: number;
  sorenessLevel: number;
  notes?: string;
  date?: number;
}

/** Upsert today's recovery check-in (one per calendar day). */
export async function saveRecoveryCheckIn(input: RecoveryCheckInInput): Promise<void> {
  const date = input.date ?? now();
  const start = Math.floor(date / 86_400_000) * 86_400_000;
  const existing = (await db.recoveryFactors.toArray()).find(
    (f) => Math.floor(f.date / 86_400_000) * 86_400_000 === start,
  );
  const t = now();
  const fields = {
    sleepQuality: input.sleepQuality,
    nutritionQuality: input.nutritionQuality,
    stressLevel: input.stressLevel,
    energyLevel: input.energyLevel,
    sorenessLevel: input.sorenessLevel,
    notes: input.notes ?? "",
  };
  if (existing) {
    await db.recoveryFactors.update(existing.id, { ...fields, updatedAt: t });
  } else {
    await db.recoveryFactors.add({ id: newId(), date, ...fields, createdAt: t, updatedAt: t });
  }
}

// ---- Body weight ----------------------------------------------------------

export async function addBodyWeight(
  weight: number,
  weightUnit: WeightUnit,
  notes = "",
  date = now(),
): Promise<ID> {
  const id = newId();
  const entry: BodyWeightEntry = { id, date, weight, weightUnit, notes, createdAt: now() };
  await db.bodyWeightEntries.add(entry);
  return id;
}

export async function deleteBodyWeight(id: ID): Promise<void> {
  await db.bodyWeightEntries.delete(id);
}

// ---- Volume targets -------------------------------------------------------

export async function updateVolumeTarget(
  id: ID,
  patch: Partial<Pick<MuscleVolumeTarget, "mev" | "mav" | "mrv">>,
): Promise<void> {
  await db.muscleVolumeTargets.update(id, { ...patch, updatedAt: now() });
}
