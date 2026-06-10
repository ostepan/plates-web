import { db } from "./db";
import type { ID, Session, WorkoutSet } from "../models/types";
import type { MuscleGroup } from "../models/enums";
import { OneRM } from "../calc/oneRM";
import { Performance, type Point } from "../calc/performance";

const DAY = 86_400_000;

export interface SessionHighlights {
  prs: { exerciseId: ID; e1rm: number }[];
  plateaus: ID[];
}

/** PRs set + plateaus detected for a just-finished session (for the summary). */
export async function sessionHighlights(sessionId: ID): Promise<SessionHighlights> {
  const session = await db.sessions.get(sessionId);
  if (!session) return { prs: [], plateaus: [] };
  const sxs = await db.sessionExercises.where("sessionId").equals(sessionId).toArray();
  const exerciseIds = [...new Set(sxs.map((s) => s.exerciseId).filter((x): x is ID => !!x))];

  const prs: { exerciseId: ID; e1rm: number }[] = [];
  const plateaus: ID[] = [];
  for (const exId of exerciseIds) {
    const series = await exerciseE1RMSeries(exId); // all finished sessions, incl. this one
    if (!series.length) continue;
    const current = series.find((p) => p.date === session.date)?.value ?? series[series.length - 1].value;
    const priorMax = Math.max(0, ...series.filter((p) => p.date !== session.date).map((p) => p.value));
    if (current > priorMax + 0.01) prs.push({ exerciseId: exId, e1rm: Math.round(current * 10) / 10 });
    if (Performance.detectPlateau(series)) plateaus.push(exId);
  }
  return { prs, plateaus };
}
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

/**
 * Best Epley e1RM for every exercise across all finished sessions — computed in
 * a single DB pass. Use this when you need PRs for many exercises at once (e.g.
 * the active-workout header), instead of calling `exerciseE1RMSeries` per
 * exercise, which re-scans the whole history each time.
 */
/**
 * Most-recent completed working sets ("ghost" values) for every exercise, from
 * finished sessions, in a single DB pass. Companion to `bestE1RMByExercise` for
 * the active-workout view — replaces N calls to `lastCompletedSets`, each of
 * which re-scans the session history.
 */
export interface LastPerformance {
  /** Date of the most recent finished session that trained the exercise. */
  date: number;
  sets: WorkoutSet[];
}

export async function lastWorkingSetsByExercise(excludeSessionId: ID): Promise<Map<ID, LastPerformance>> {
  const sessions = (await finishedSessions())
    .filter((s) => s.id !== excludeSessionId)
    .sort((a, b) => b.date - a.date); // newest first
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  const sxsBySession = new Map<ID, typeof sxs>();
  for (const sx of sxs) {
    const arr = sxsBySession.get(sx.sessionId) ?? [];
    arr.push(sx);
    sxsBySession.set(sx.sessionId, arr);
  }
  const out = new Map<ID, LastPerformance>();
  for (const session of sessions) {
    for (const sx of sxsBySession.get(session.id) ?? []) {
      if (!sx.exerciseId || out.has(sx.exerciseId)) continue; // first (newest) wins
      const sets = (byId.get(sx.id) ?? [])
        .filter((s) => s.isCompleted && s.kind === "working")
        .sort((a, b) => a.order - b.order);
      if (sets.length) out.set(sx.exerciseId, { date: session.date, sets });
    }
  }
  return out;
}

export interface ExerciseHistoryEntry {
  sessionId: ID;
  date: number;
  sets: WorkoutSet[];
  bestE1RM: number;
}

/** Recent finished sessions that trained the exercise (newest first) with their completed working sets. */
export async function exerciseSessionHistory(exerciseId: ID, limit = 10): Promise<ExerciseHistoryEntry[]> {
  const sessions = (await finishedSessions()).sort((a, b) => b.date - a.date);
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  const sxBySession = new Map<ID, (typeof sxs)[number]>();
  for (const sx of sxs) if (sx.exerciseId === exerciseId) sxBySession.set(sx.sessionId, sx);

  const out: ExerciseHistoryEntry[] = [];
  for (const session of sessions) {
    const sx = sxBySession.get(session.id);
    if (!sx) continue;
    const sets = (byId.get(sx.id) ?? [])
      .filter((s) => s.isCompleted && s.kind === "working")
      .sort((a, b) => a.order - b.order);
    if (!sets.length) continue;
    const best = Math.max(...sets.map((s) => OneRM.epley(s.weight, s.reps)));
    out.push({ sessionId: session.id, date: session.date, sets, bestE1RM: Math.round(best * 10) / 10 });
    if (out.length >= limit) break;
  }
  return out;
}

export interface TruePR {
  weight: number;
  reps: number;
  date: number;
}

/** Heaviest completed working set ever logged for the exercise — the "true PR". */
export async function exerciseTruePR(exerciseId: ID): Promise<TruePR | null> {
  const sessions = await finishedSessions();
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  const dateBySession = new Map(sessions.map((s) => [s.id, s.date]));
  let best: TruePR | null = null;
  for (const sx of sxs) {
    if (sx.exerciseId !== exerciseId) continue;
    for (const s of byId.get(sx.id) ?? []) {
      if (!s.isCompleted || s.kind !== "working") continue;
      if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) {
        best = { weight: s.weight, reps: s.reps, date: dateBySession.get(sx.sessionId) ?? s.createdAt };
      }
    }
  }
  return best;
}

export async function bestE1RMByExercise(): Promise<Map<ID, number>> {
  const sessions = await finishedSessions();
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  const best = new Map<ID, number>();
  for (const sx of sxs) {
    if (!sx.exerciseId) continue;
    for (const s of byId.get(sx.id) ?? []) {
      if (!s.isCompleted || s.kind !== "working") continue;
      const e = OneRM.epley(s.weight, s.reps);
      if (e > (best.get(sx.exerciseId) ?? 0)) best.set(sx.exerciseId, e);
    }
  }
  return best;
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
  bestStreakDays: number;
  weekSessions: number;
  monthSessions: number;
  avgDurationMin: number;
  daysPerWeek: number;
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

  // best streak ever — longest run of consecutive workout days
  const sortedDays = [...days].sort((a, b) => a - b);
  let bestStreak = 0;
  let run = 0;
  let prevDay = Number.NaN;
  for (const d of sortedDays) {
    run = d - prevDay === DAY ? run + 1 : 1;
    prevDay = d;
    if (run > bestStreak) bestStreak = run;
  }

  const now = Date.now();
  const weekSessions = sessions.filter((s) => s.date >= now - 7 * DAY).length;
  const monthSessions = sessions.filter((s) => s.date >= now - 30 * DAY).length;
  const avgDurationMin = sessions.length
    ? Math.round(sessions.reduce((v, s) => v + s.durationSeconds, 0) / sessions.length / 60)
    : 0;
  // training days per week, averaged over the span from first workout to today
  const spanWeeks = sortedDays.length
    ? Math.max(1, (dayStart(now) - sortedDays[0]) / DAY + 1) / 7
    : 1;
  const daysPerWeek = sortedDays.length ? Math.round((sortedDays.length / spanWeeks) * 10) / 10 : 0;

  return {
    workouts: sessions.length,
    totalVolume,
    totalSets,
    streakDays: streak,
    bestStreakDays: bestStreak,
    weekSessions,
    monthSessions,
    avgDurationMin,
    daysPerWeek,
  };
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
  sessionId: ID;
  date: number;
  e1rm: number;
  /** Previous best e1RM (0 when this is the first record for the exercise). */
  prevE1rm: number;
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
        prs.push({
          exerciseId: sx.exerciseId,
          sessionId: session.id,
          date: session.date,
          e1rm: Math.round(e1rm * 10) / 10,
          prevE1rm: Math.round(prev * 10) / 10,
        });
      }
    }
  }
  return prs.reverse();
}

export interface HistoryRow {
  id: ID;
  date: number;
  name: string;
  durationSeconds: number;
  volume: number;
  /** Completed working sets. */
  sets: number;
  /** e1RM personal records set in this session. */
  prs: number;
  notes: string;
}

/** Finished sessions (newest first) with set counts + PR counts for the history list. */
export async function historyRows(): Promise<HistoryRow[]> {
  const sessions = await finishedSessions();
  const { sxs, byId } = await setsBySessionExercise(sessions.map((s) => s.id));
  const setsBySession = new Map<ID, number>();
  for (const sx of sxs) {
    const working = (byId.get(sx.id) ?? []).filter((s) => s.isCompleted && s.kind === "working").length;
    setsBySession.set(sx.sessionId, (setsBySession.get(sx.sessionId) ?? 0) + working);
  }
  const prsBySession = new Map<ID, number>();
  for (const pr of await prTimeline()) {
    prsBySession.set(pr.sessionId, (prsBySession.get(pr.sessionId) ?? 0) + 1);
  }
  return sessions
    .map((s) => ({
      id: s.id,
      date: s.date,
      name: s.routineNameSnapshot,
      durationSeconds: s.durationSeconds,
      volume: s.totalVolume,
      sets: setsBySession.get(s.id) ?? 0,
      prs: prsBySession.get(s.id) ?? 0,
      notes: s.notes,
    }))
    .reverse();
}
