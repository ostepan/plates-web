import { db } from "./db";
import type { ID, Session } from "../models/types";
import type { MuscleGroup } from "../models/enums";
import { OneRM } from "../calc/oneRM";
import type { Point } from "../calc/performance";

const DAY = 86_400_000;
const dayStart = (ts: number) => Math.floor(ts / DAY) * DAY;

async function finishedSessions(): Promise<Session[]> {
  return (await db.sessions.where("durationSeconds").above(0).toArray()).sort((a, b) => a.date - b.date);
}

async function setsBySessionExercise(sessionIds: ID[]) {
  const sxs = (await db.sessionExercises.where("sessionId").anyOf(sessionIds).toArray());
  const sets = await db.workoutSets.where("sessionExerciseId").anyOf(sxs.map((s) => s.id)).toArray();
  const byId = new Map<ID, typeof sets>();
  for (const s of sets) {
    const arr = byId.get(s.sessionExerciseId) ?? [];
    arr.push(s);
    byId.set(s.sessionExerciseId, arr);
  }
  return { sxs, byId };
}

/** Best e1RM (Epley) per finished session that trained the exercise — the progress series. */
export async function exerciseE1RMSeries(exerciseId: ID): Promise<Point[]> {
  const sessions = await finishedSessions();
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  const sxBySession = new Map<ID, (typeof sxs)[number]>();
  for (const sx of sxs) if (sx.exerciseId === exerciseId) sxBySession.set(sx.sessionId, sx);

  const points: Point[] = [];
  for (const session of sessions) {
    const sx = sxBySession.get(session.id);
    if (!sx) continue;
    const working = (byId.get(sx.id) ?? []).filter((s) => s.isCompleted && s.kind === "working");
    if (!working.length) continue;
    const best = Math.max(...working.map((s) => OneRM.epley(s.weight, s.reps)));
    if (best > 0) points.push({ date: session.date, value: Math.round(best * 10) / 10 });
  }
  return points;
}

export interface MuscleVolumeRow {
  muscleGroup: MuscleGroup;
  sets: number;
  mev: number;
  mav: number;
  mrv: number;
}

/** Working sets per primary muscle group over the last `sinceDays`, joined with targets. */
export async function weeklyVolumeByMuscle(sinceDays = 7): Promise<MuscleVolumeRow[]> {
  const since = Date.now() - sinceDays * DAY;
  const sessions = (await finishedSessions()).filter((s) => s.date >= since);
  const exMuscle = new Map((await db.exercises.toArray()).map((e) => [e.id, e.muscleGroup]));
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));

  const counts = new Map<MuscleGroup, number>();
  for (const sx of sxs) {
    const mg = sx.exerciseId ? exMuscle.get(sx.exerciseId) : undefined;
    if (!mg) continue;
    const working = (byId.get(sx.id) ?? []).filter((s) => s.isCompleted && s.kind === "working").length;
    counts.set(mg, (counts.get(mg) ?? 0) + working);
  }

  const targets = await db.muscleVolumeTargets.toArray();
  return targets
    .map((t) => ({ muscleGroup: t.muscleGroup, sets: counts.get(t.muscleGroup) ?? 0, mev: t.mev, mav: t.mav, mrv: t.mrv }))
    .sort((a, b) => b.sets - a.sets);
}

export interface OverviewStats {
  workouts: number;
  totalVolume: number;
  totalSets: number;
  streakDays: number;
}

export async function overviewStats(): Promise<OverviewStats> {
  const sessions = await finishedSessions();
  const { byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  let totalSets = 0;
  for (const arr of byId.values()) totalSets += arr.filter((s) => s.isCompleted && s.kind === "working").length;
  const totalVolume = sessions.reduce((v, s) => v + s.totalVolume, 0);

  // streak = consecutive calendar days (ending today or yesterday) with a workout
  const days = new Set(sessions.map((s) => dayStart(s.date)));
  let streak = 0;
  let cursor = dayStart(Date.now());
  if (!days.has(cursor)) cursor -= DAY; // allow "yesterday" to keep a streak alive
  while (days.has(cursor)) {
    streak++;
    cursor -= DAY;
  }

  return { workouts: sessions.length, totalVolume, totalSets, streakDays: streak };
}

/** Per-day workout counts for a heatmap, oldest→newest, covering `weeks`. */
export async function consistency(weeks = 12): Promise<{ date: number; count: number }[]> {
  const sessions = await finishedSessions();
  const counts = new Map<number, number>();
  for (const s of sessions) {
    const d = dayStart(s.date);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const today = dayStart(Date.now());
  const out: { date: number; count: number }[] = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = today - i * DAY;
    out.push({ date: d, count: counts.get(d) ?? 0 });
  }
  return out;
}

export interface PR {
  exerciseId: ID;
  date: number;
  e1rm: number;
}

/** Chronological list of e1RM personal records across all exercises (newest first). */
export async function prTimeline(): Promise<PR[]> {
  const sessions = await finishedSessions();
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  const sxBySession = new Map<ID, (typeof sxs)[number][]>();
  for (const sx of sxs) {
    const arr = sxBySession.get(sx.sessionId) ?? [];
    arr.push(sx);
    sxBySession.set(sx.sessionId, arr);
  }

  const best = new Map<ID, number>();
  const prs: PR[] = [];
  for (const session of sessions) {
    for (const sx of sxBySession.get(session.id) ?? []) {
      if (!sx.exerciseId) continue;
      const working = (byId.get(sx.id) ?? []).filter((s) => s.isCompleted && s.kind === "working");
      if (!working.length) continue;
      const e1rm = Math.max(...working.map((s) => OneRM.epley(s.weight, s.reps)));
      const prev = best.get(sx.exerciseId) ?? 0;
      if (e1rm > prev + 0.01) {
        best.set(sx.exerciseId, e1rm);
        prs.push({ exerciseId: sx.exerciseId, date: session.date, e1rm: Math.round(e1rm * 10) / 10 });
      }
    }
  }
  return prs.reverse();
}
