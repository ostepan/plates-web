import { db } from "./db";
import type { ID, RecoveryFactors } from "../models/types";
import type { MuscleGroup } from "../models/enums";
import { Recovery, type RecoveryResult, type RecoveryVerdict } from "../calc/recovery";

const DAY = 86_400_000;
const dayStart = (ts: number) => Math.floor(ts / DAY) * DAY;

export interface MuscleRecovery extends RecoveryResult {
  lastTrainedAt: number;
  daysSinceTrained: number;
  verdict: RecoveryVerdict;
}

/** Most-recent daily check-in (drives the factors multiplier). */
export async function latestFactors(): Promise<RecoveryFactors | undefined> {
  return (await db.recoveryFactors.toArray()).sort((a, b) => b.date - a.date)[0];
}

/** Today's check-in, if one exists (for pre-filling the form). */
export async function todayFactors(): Promise<RecoveryFactors | undefined> {
  const start = dayStart(Date.now());
  return (await db.recoveryFactors.toArray()).find((f) => dayStart(f.date) === start);
}

/** Per-muscle recovery %, fatigued-first. Derives last-trained + volume from finished sessions. */
export async function muscleRecovery(): Promise<MuscleRecovery[]> {
  const sessions = (await db.sessions.where("durationSeconds").above(0).toArray()).sort(
    (a, b) => b.date - a.date,
  );
  if (!sessions.length) return [];

  const exMuscle = new Map((await db.exercises.toArray()).map((e) => [e.id, e.muscleGroup]));
  const sxs = await db.sessionExercises.where("sessionId").anyOf(sessions.map((s) => s.id)).toArray();
  const sets = await db.workoutSets.where("sessionExerciseId").anyOf(sxs.map((s) => s.id)).toArray();

  const workingBySx = new Map<ID, number>();
  for (const s of sets) {
    if (s.isCompleted && s.kind === "working") workingBySx.set(s.sessionExerciseId, (workingBySx.get(s.sessionExerciseId) ?? 0) + 1);
  }
  const sxBySession = new Map<ID, typeof sxs>();
  for (const sx of sxs) {
    const arr = sxBySession.get(sx.sessionId) ?? [];
    arr.push(sx);
    sxBySession.set(sx.sessionId, arr);
  }

  // walk newest→oldest; first session to train a muscle wins (= most recent)
  const last = new Map<MuscleGroup, { date: number; volume: number }>();
  for (const session of sessions) {
    const perMuscle = new Map<MuscleGroup, number>();
    for (const sx of sxBySession.get(session.id) ?? []) {
      const mg = sx.exerciseId ? exMuscle.get(sx.exerciseId) : undefined;
      if (!mg) continue;
      perMuscle.set(mg, (perMuscle.get(mg) ?? 0) + (workingBySx.get(sx.id) ?? 0));
    }
    for (const [mg, vol] of perMuscle) if (vol > 0 && !last.has(mg)) last.set(mg, { date: session.date, volume: vol });
  }

  const factors = await latestFactors();
  const profile = (await db.userProfile.toArray())[0];
  const settings = (await db.recoverySettings.toArray())[0];
  const deload =
    settings?.deloadStartDate && settings?.deloadEndDate &&
    Date.now() >= settings.deloadStartDate && Date.now() <= settings.deloadEndDate
      ? settings.deloadMultiplier ?? 1
      : 1;

  const out: MuscleRecovery[] = [];
  for (const [mg, info] of last) {
    const r = Recovery.calculateRecovery({
      muscleGroup: mg,
      lastTrainedAt: info.date,
      trainingVolume: info.volume,
      factors: factors ?? null,
      userAge: profile?.age ?? null,
      customRecoveryTimes: settings?.customRecoveryTimes,
      deloadMultiplier: deload,
    });
    const daysSinceTrained = Math.floor((Date.now() - info.date) / DAY);
    out.push({ ...r, lastTrainedAt: info.date, daysSinceTrained, verdict: Recovery.verdict(r.recoveryPercentage, daysSinceTrained) });
  }
  return out.sort((a, b) => a.recoveryPercentage - b.recoveryPercentage);
}
