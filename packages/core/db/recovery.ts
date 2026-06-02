import { db } from "./db";
import type { Exercise, ID, RecoveryFactors } from "../models/types";
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

export interface SwapCandidate {
  exercise: Exercise;
  recovery: number;
}
export interface SwapSuggestion {
  routineExerciseId: ID;
  current: Exercise;
  currentRecovery: number;
  candidates: SwapCandidate[];
}

/**
 * For each routine exercise whose primary muscle is fatigued (recovery below
 * `fatigueThreshold`), suggest fresher alternatives. Candidates target a
 * different, more-recovered muscle (≥ `gate` percentage points fresher),
 * ranked by recovery → same equipment → same mechanic, deduped to one per
 * muscle so the picks are varied. Port of iOS `WorkoutRecommender.getSwapSuggestions`.
 */
export async function getSwapSuggestions(
  routineId: ID,
  opts?: { fatigueThreshold?: number; gate?: number; maxPerExercise?: number },
): Promise<SwapSuggestion[]> {
  const fatigueThreshold = opts?.fatigueThreshold ?? 50;
  const gate = opts?.gate ?? 15;
  const maxPer = opts?.maxPerExercise ?? 3;

  const recMap = new Map((await muscleRecovery()).map((r) => [r.muscleGroup, r.recoveryPercentage]));
  const recOf = (m: MuscleGroup) => recMap.get(m) ?? 100; // untrained = fully recovered

  const res = (await db.routineExercises.where("routineId").equals(routineId).toArray()).sort(
    (a, b) => a.order - b.order,
  );
  const allExercises = await db.exercises.toArray();

  const out: SwapSuggestion[] = [];
  for (const re of res) {
    const current = allExercises.find((e) => e.id === re.exerciseId);
    if (!current) continue;
    const currentRecovery = recOf(current.muscleGroup);
    if (currentRecovery >= fatigueThreshold) continue; // not fatigued — no swap needed

    const ranked = allExercises
      .filter((e) => e.id !== current.id)
      .map((e) => ({ exercise: e, recovery: recOf(e.muscleGroup) }))
      .filter((c) => c.recovery >= currentRecovery + gate) // freshness gate
      .sort((a, b) => {
        if (b.recovery !== a.recovery) return b.recovery - a.recovery;
        const eq = Number(b.exercise.equipment === current.equipment) - Number(a.exercise.equipment === current.equipment);
        if (eq !== 0) return eq;
        return Number(b.exercise.mechanic === current.mechanic) - Number(a.exercise.mechanic === current.mechanic);
      });

    // one candidate per muscle group, for variety
    const seen = new Set<MuscleGroup>();
    const candidates: SwapCandidate[] = [];
    for (const c of ranked) {
      if (seen.has(c.exercise.muscleGroup)) continue;
      seen.add(c.exercise.muscleGroup);
      candidates.push(c);
      if (candidates.length >= maxPer) break;
    }

    if (candidates.length) out.push({ routineExerciseId: re.id, current, currentRecovery, candidates });
  }
  return out;
}
