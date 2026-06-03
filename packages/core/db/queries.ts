import { db } from "./db";
import { OneRM } from "../calc/oneRM";
import type { ID, Mesocycle, Microcycle, Program, ProgramDay } from "../models/types";

export interface CurrentProgramDay {
  program: Program;
  day: ProgramDay;
  micro: Microcycle;
}

export interface ProgramDayView {
  day: ProgramDay;
  exerciseCount: number;
}
export interface MicrocycleView {
  micro: Microcycle;
  days: ProgramDayView[];
}
export interface MesocycleView {
  meso: Mesocycle;
  micros: MicrocycleView[];
}
export interface ProgramStructure {
  program: Program;
  daysPerWeek: number;
  mesos: MesocycleView[];
}

/** Full nested program structure for the detail/calendar view. */
export async function loadProgram(programId: ID): Promise<ProgramStructure | null> {
  const program = await db.programs.get(programId);
  if (!program) return null;

  const mesos = (await db.mesocycles.where("programId").equals(programId).toArray()).sort(
    (a, b) => a.order - b.order,
  );

  const mesoViews: MesocycleView[] = [];
  for (const meso of mesos) {
    const micros = (await db.microcycles.where("mesocycleId").equals(meso.id).toArray()).sort(
      (a, b) => a.weekIndex - b.weekIndex,
    );
    const microViews: MicrocycleView[] = [];
    for (const micro of micros) {
      const days = (await db.programDays.where("microcycleId").equals(micro.id).toArray()).sort(
        (a, b) => a.dayIndex - b.dayIndex,
      );
      const dayViews = await Promise.all(
        days.map(async (day) => ({
          day,
          exerciseCount: day.routineId
            ? await db.routineExercises.where("routineId").equals(day.routineId).count()
            : 0,
        })),
      );
      microViews.push({ micro, days: dayViews });
    }
    mesoViews.push({ meso, micros: microViews });
  }

  return { program, daysPerWeek: mesoViews[0]?.micros[0]?.days.length ?? 0, mesos: mesoViews };
}

/** Routine ids owned by a program day — excluded from the standalone routine list. */
export async function programOwnedRoutineIds(): Promise<Set<ID>> {
  const days = await db.programDays.toArray();
  return new Set(days.map((d) => d.routineId).filter((x): x is ID => !!x));
}

export async function activeProgram(): Promise<Program | undefined> {
  return (await db.programs.toArray()).find((p) => p.isActive);
}

/**
 * First program day not yet completed by a logged session — the iOS
 * "Today's workout" target. A session counts as completed when its
 * `durationSeconds > 0` (see finishSession).
 */
export async function currentProgramDay(): Promise<CurrentProgramDay | undefined> {
  const program = await activeProgram();
  if (!program) return undefined;

  const mesos = (await db.mesocycles.where("programId").equals(program.id).toArray()).sort(
    (a, b) => a.order - b.order,
  );
  if (mesos.length === 0) return undefined;

  const microsByMeso = new Map<ID, Microcycle[]>();
  for (const m of mesos) {
    const ms = (await db.microcycles.where("mesocycleId").equals(m.id).toArray()).sort(
      (a, b) => a.weekIndex - b.weekIndex,
    );
    microsByMeso.set(m.id, ms);
  }

  const orderedDays: { day: ProgramDay; micro: Microcycle }[] = [];
  for (const m of mesos) {
    for (const micro of microsByMeso.get(m.id) ?? []) {
      const days = (await db.programDays.where("microcycleId").equals(micro.id).toArray()).sort(
        (a, b) => a.dayIndex - b.dayIndex,
      );
      for (const day of days) orderedDays.push({ day, micro });
    }
  }
  if (orderedDays.length === 0) return undefined;

  const dayIds = new Set(orderedDays.map(({ day }) => day.id));
  const completedDayIds = new Set(
    (await db.sessions.toArray())
      .filter((s) => s.durationSeconds > 0 && s.programDayID && dayIds.has(s.programDayID))
      .map((s) => s.programDayID as ID),
  );

  const next = orderedDays.find(({ day }) => !completedDayIds.has(day.id));
  if (!next || !next.day.routineId) return undefined;
  return { program, day: next.day, micro: next.micro };
}

/**
 * Best estimated 1RM (Epley) per exercise across every completed working set —
 * the "PR" shown on the active-workout exercise headers. Rounded to a whole
 * number; exercises with no qualifying history are absent from the map.
 *
 * Pass `excludeSessionId` to omit the in-progress workout, so the figure is the
 * record *coming in* (and a set that beats it can be flagged as a new PR).
 */
export async function exerciseE1RMPRs(
  exerciseIds: ID[],
  excludeSessionId?: ID,
): Promise<Map<ID, number>> {
  const out = new Map<ID, number>();
  if (exerciseIds.length === 0) return out;
  const wanted = new Set(exerciseIds);

  const sxByEx = new Map<ID, ID>(); // sessionExerciseId → exerciseId
  for (const sx of await db.sessionExercises.toArray()) {
    if (excludeSessionId && sx.sessionId === excludeSessionId) continue;
    if (sx.exerciseId && wanted.has(sx.exerciseId)) sxByEx.set(sx.id, sx.exerciseId);
  }
  if (sxByEx.size === 0) return out;

  const sets = await db.workoutSets.where("sessionExerciseId").anyOf([...sxByEx.keys()]).toArray();
  for (const s of sets) {
    if (!s.isCompleted || s.kind !== "working" || s.weight <= 0 || s.reps <= 0) continue;
    const exId = sxByEx.get(s.sessionExerciseId);
    if (!exId) continue;
    const e1rm = OneRM.epley(s.weight, s.reps);
    if (e1rm > (out.get(exId) ?? 0)) out.set(exId, e1rm);
  }
  for (const [k, v] of out) out.set(k, Math.round(v));
  return out;
}

/** Exercise count per routine id, for efficient list rendering. */
export async function routineExerciseCounts(routineIds: ID[]): Promise<Map<ID, number>> {
  const counts = new Map<ID, number>();
  if (routineIds.length === 0) return counts;
  const rows = await db.routineExercises.where("routineId").anyOf(routineIds).toArray();
  for (const r of rows) counts.set(r.routineId, (counts.get(r.routineId) ?? 0) + 1);
  return counts;
}

export interface ActiveProgramToday {
  program: Program;
  day: ProgramDay;
  routineId: ID;
  /** 0-based position within the week, and total days that week. */
  dayPos: number;
  daysPerWeek: number;
  weekIndex: number;
  totalWeeks: number;
  isDeload: boolean;
  exerciseCount: number;
  totalSets: number;
}

/**
 * The next workout the active program points at — used by the Workout tab's
 * "Today's workout" CTA. Walks forward from the count of already-logged
 * program-day sessions so the card advances day-by-day through the plan.
 */
export async function activeProgramToday(): Promise<ActiveProgramToday | null> {
  const program = (await db.programs.toArray()).find((p) => p.isActive);
  if (!program) return null;
  const struct = await loadProgram(program.id);
  const micros = struct?.mesos[0]?.micros ?? [];
  if (!micros.length) return null;
  const daysPerWeek = micros[0].days.length;
  if (!daysPerWeek) return null;

  // How many of this program's days have already been logged?
  const dayIds = new Set(micros.flatMap((m) => m.days.map((d) => d.day.id)));
  const completed = (await db.sessions.toArray()).filter(
    (s) => s.durationSeconds > 0 && s.programDayID && dayIds.has(s.programDayID),
  ).length;

  const totalWeeks = micros.length;
  const weekIndex = Math.min(totalWeeks - 1, Math.floor(completed / daysPerWeek));
  const dayPos = completed % daysPerWeek;
  const micro = micros[weekIndex];
  const dayView = micro.days[dayPos] ?? micro.days[0];
  if (!dayView?.day.routineId) return null;

  const res = await db.routineExercises.where("routineId").equals(dayView.day.routineId).toArray();
  const totalSets = res.reduce((n, r) => n + Math.max(1, r.targetSets), 0);

  return {
    program,
    day: dayView.day,
    routineId: dayView.day.routineId,
    dayPos,
    daysPerWeek,
    weekIndex,
    totalWeeks,
    isDeload: micro.micro.isDeload,
    exerciseCount: dayView.exerciseCount,
    totalSets,
  };
}

/**
 * All-time best estimated 1RM (Epley) per exercise across finished sessions —
 * the "PR" shown next to each exercise in the active workout. Excludes the
 * in-progress session so a fresh log doesn't count against itself.
 */
export async function bestE1RMByExercise(
  exerciseIds: ID[],
  excludeSessionId: ID,
): Promise<Map<ID, number>> {
  if (!exerciseIds.length) return new Map();
  const wanted = new Set(exerciseIds);
  const finished = (await db.sessions.toArray()).filter(
    (s) => s.durationSeconds > 0 && s.id !== excludeSessionId,
  );
  if (!finished.length) return new Map();
  const sxs = (await db.sessionExercises.where("sessionId").anyOf(finished.map((s) => s.id)).toArray())
    .filter((sx) => sx.exerciseId && wanted.has(sx.exerciseId));
  const sxToEx = new Map(sxs.map((sx) => [sx.id, sx.exerciseId as ID]));
  const sets = await db.workoutSets.where("sessionExerciseId").anyOf(sxs.map((s) => s.id)).toArray();
  const best = new Map<ID, number>();
  for (const s of sets) {
    if (!s.isCompleted || s.kind !== "working") continue;
    const exId = sxToEx.get(s.sessionExerciseId);
    if (!exId) continue;
    const e = OneRM.epley(s.weight, s.reps);
    if (e > (best.get(exId) ?? 0)) best.set(exId, e);
  }
  return best;
}
