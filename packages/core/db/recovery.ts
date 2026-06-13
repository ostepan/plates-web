import { db } from "./db";
import type { Exercise, ID, RecoveryFactors, RecoverySettings } from "../models/types";
import type { MuscleGroup } from "../models/enums";
import { DETAIL_PARENT, type DetailedMuscle } from "../models/muscles";
import {
  BASE_RECOVERY, RECOVERY_SETTINGS_DEFAULTS, Recovery, overallRecoveryScore,
  type FatigueImpulse, type RecoveryResult, type RecoveryThresholds, type RecoveryVerdict,
} from "../calc/recovery";
import { DETAIL_BASE_RECOVERY, detailCredits } from "../calc/muscleDetail";

const DAY = 86_400_000;
const dayStart = (ts: number) => Math.floor(ts / DAY) * DAY;

/** Sessions older than this can't carry meaningful residual fatigue. */
const IMPULSE_WINDOW_DAYS = 10;

/**
 * Trailing window for per-exercise load baselines — wider than the impulse
 * window so the "heavy vs light" reference stays stable even for a muscle
 * trained only once a week.
 */
const REF_WINDOW_DAYS = 56;

/** Bounds on a single working set's effective-set weight, by load vs the exercise's norm. */
const LOAD_WEIGHT_MIN = 0.5;
const LOAD_WEIGHT_MAX = 2;

/** Median of a numeric list (0 for empty). */
export function medianLoad(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Effective-set weight for one working set: its volume-load (weight × reps)
 * relative to the exercise's recent median, clamped to [LOAD_WEIGHT_MIN,
 * LOAD_WEIGHT_MAX] so a single set can't swing fatigue wildly. Returns 1 (a
 * plain set, the old set-count behavior) when load or baseline is unavailable
 * — e.g. bodyweight or unlogged work, or an exercise with no load history.
 */
export function setLoadWeight(load: number, refLoad: number | undefined): number {
  if (!(load > 0) || !refLoad || refLoad <= 0) return 1;
  return Math.min(LOAD_WEIGHT_MAX, Math.max(LOAD_WEIGHT_MIN, load / refLoad));
}

export interface MuscleRecovery extends RecoveryResult {
  lastTrainedAt: number;
  daysSinceTrained: number;
  verdict: RecoveryVerdict;
}

export type ResolvedRecoverySettings = Omit<RecoverySettings, "id" | "createdAt" | "updatedAt">;

/** The RecoverySettings singleton merged over app defaults (read-only; never creates). */
export async function getRecoverySettings(): Promise<ResolvedRecoverySettings> {
  const row = (await db.recoverySettings.toArray())[0];
  if (row) return row;
  return { ...RECOVERY_SETTINGS_DEFAULTS, notificationsEnabled: false, customRecoveryTimes: {} };
}

export function thresholdsOf(s: {
  readyThreshold: number;
  mostlyRecoveredThreshold: number;
  partiallyRecoveredThreshold: number;
}): RecoveryThresholds {
  return {
    ready: s.readyThreshold,
    acceptable: s.mostlyRecoveredThreshold,
    caution: s.partiallyRecoveredThreshold,
  };
}

/** Most-recent daily check-in (drives the factors multiplier, staleness-decayed). */
export async function latestFactors(): Promise<RecoveryFactors | undefined> {
  return db.recoveryFactors.orderBy("date").last();
}

/** Today's check-in, if one exists (for pre-filling the form). */
export async function todayFactors(): Promise<RecoveryFactors | undefined> {
  const start = dayStart(Date.now());
  return (await db.recoveryFactors.where("date").aboveOrEqual(start).toArray()).find(
    (f) => dayStart(f.date) === start,
  );
}

export interface RecoveryScorePoint {
  date: number;
  score: number;
}

/** Daily overall-recovery score (0–100) for each check-in within the last `days`, oldest→newest. */
export async function recoveryScoreHistory(days = 14): Promise<RecoveryScorePoint[]> {
  const since = dayStart(Date.now()) - (days - 1) * DAY;
  return (await db.recoveryFactors.where("date").aboveOrEqual(since).toArray())
    .sort((a, b) => a.date - b.date)
    .map((f) => ({ date: f.date, score: Math.round(overallRecoveryScore(f)) }));
}

export interface FactorAverages {
  sleepQuality: number;
  nutritionQuality: number;
  stressLevel: number;
  energyLevel: number;
  sorenessLevel: number;
}
const FACTOR_KEYS: (keyof FactorAverages)[] = [
  "sleepQuality",
  "nutritionQuality",
  "stressLevel",
  "energyLevel",
  "sorenessLevel",
];

function averageFactors(rows: RecoveryFactors[]): FactorAverages {
  const n = rows.length || 1;
  const out = {} as FactorAverages;
  for (const k of FACTOR_KEYS) out[k] = rows.reduce((s, r) => s + r[k], 0) / n;
  return out;
}

/**
 * Per-factor averages for the last `days` vs the prior `days` window. Drives the
 * check-in "vs Nd avg" delta and the Trends per-factor insights. `null` when no
 * check-ins exist in either window.
 */
export async function factorTrends(
  days = 7,
): Promise<{ current: FactorAverages; previous: FactorAverages; currentCount: number; previousCount: number } | null> {
  const today = dayStart(Date.now());
  const curSince = today - (days - 1) * DAY;
  const prevSince = curSince - days * DAY;
  const all = await db.recoveryFactors.where("date").aboveOrEqual(prevSince).toArray();
  const current = all.filter((f) => f.date >= curSince);
  const previous = all.filter((f) => f.date < curSince);
  if (!current.length && !previous.length) return null;
  return {
    current: averageFactors(current),
    previous: averageFactors(previous),
    currentCount: current.length,
    previousCount: previous.length,
  };
}

interface ImpulseMaps {
  byGroup: Map<MuscleGroup, FatigueImpulse[]>;
  byDetail: Map<DetailedMuscle, FatigueImpulse[]>;
}

/**
 * Per-muscle fatigue impulses from finished sessions in the trailing window,
 * at both granularities. Each working set credits the exercise's primary muscle
 * group and each secondary group at `secondaryImpact`, weighted by the set's
 * volume-load relative to that exercise's recent norm (`setLoadWeight`) so a
 * heavier session deposits more fatigue than a lighter one; within each credited
 * group the sets fan out to its detail heads per the exercise's `detailCredits`
 * split (dominant head = full credit). RPE is the load-weighted mean of the
 * session's logged RPE/RIR for that muscle (default 7 when nothing is logged).
 */
async function fatigueImpulses(secondaryImpact: number, since: number): Promise<ImpulseMaps> {
  // Load a window wider than the impulse window so per-exercise load baselines stay stable;
  // only sessions in [since, now] become impulses — the older ones just calibrate the baseline.
  const refSince = Math.min(since, Date.now() - REF_WINDOW_DAYS * DAY);
  const sessions = (await db.sessions.where("date").aboveOrEqual(refSince).toArray()).filter(
    (s) => s.durationSeconds > 0,
  );
  if (!sessions.length) return { byGroup: new Map(), byDetail: new Map() };

  const exById = new Map<ID, Exercise>((await db.exercises.toArray()).map((e) => [e.id, e]));
  const sxs = await db.sessionExercises.where("sessionId").anyOf(sessions.map((s) => s.id)).toArray();
  const sets = await db.workoutSets.where("sessionExerciseId").anyOf(sxs.map((s) => s.id)).toArray();
  const sxById = new Map(sxs.map((sx) => [sx.id, sx]));
  const dateBySession = new Map(sessions.map((s) => [s.id, s.date]));

  // Per-exercise reference volume-load: the median completed-working-set weight×reps across the
  // reference window. A set heavier than this norm deposits proportionally more fatigue and a
  // lighter (deload/back-off) set less, self-calibrated per exercise so it needs no absolute units.
  const loadsByExercise = new Map<ID, number[]>();
  for (const set of sets) {
    if (!set.isCompleted || set.kind !== "working") continue;
    const exId = sxById.get(set.sessionExerciseId)?.exerciseId;
    const load = set.weight * set.reps;
    if (!exId || load <= 0) continue;
    const arr = loadsByExercise.get(exId);
    if (arr) arr.push(load);
    else loadsByExercise.set(exId, [load]);
  }
  const refLoad = new Map<ID, number>();
  for (const [exId, xs] of loadsByExercise) refLoad.set(exId, medianLoad(xs));

  // (sessionId, muscle) → { sets, rpeWeight, rpeSets }
  interface Acc { date: number; sets: number; rpeSum: number; rpeSets: number }
  const groupAcc = new Map<string, Acc & { muscle: MuscleGroup }>();
  const detailAcc = new Map<string, Acc & { muscle: DetailedMuscle }>();

  for (const set of sets) {
    if (!set.isCompleted || set.kind !== "working") continue;
    const sx = sxById.get(set.sessionExerciseId);
    const ex = sx?.exerciseId ? exById.get(sx.exerciseId) : undefined;
    const date = sx ? dateBySession.get(sx.sessionId) : undefined;
    if (!sx || !ex || date === undefined || date < since) continue; // impulse window only
    const rpe = set.rpe ?? (set.rir != null ? 10 - set.rir : undefined);
    // This set's fatigue weight: its volume-load vs the exercise's norm (1.0 = a typical set).
    const loadW = setLoadWeight(set.weight * set.reps, refLoad.get(ex.id));

    const tally = <M extends string>(acc: Map<string, Acc & { muscle: M }>, muscle: M, weight: number) => {
      const key = `${sx.sessionId}|${muscle}`;
      const a = acc.get(key) ?? { muscle, date, sets: 0, rpeSum: 0, rpeSets: 0 };
      a.sets += weight;
      if (rpe != null) {
        a.rpeSum += rpe * weight;
        a.rpeSets += weight;
      }
      acc.set(key, a);
    };
    const credit = (group: MuscleGroup, weight: number) => {
      tally(groupAcc, group, weight);
      const splits = Object.entries(detailCredits(`${ex.nameKey} ${ex.nameEN}`, group)) as [DetailedMuscle, number][];
      for (const [d, w] of splits) tally(detailAcc, d, weight * w);
    };
    credit(ex.muscleGroup, loadW);
    if (secondaryImpact > 0) for (const m of ex.secondary) credit(m, secondaryImpact * loadW);
  }

  const collect = <M extends string>(acc: Map<string, Acc & { muscle: M }>): Map<M, FatigueImpulse[]> => {
    const out = new Map<M, FatigueImpulse[]>();
    for (const a of acc.values()) {
      if (a.sets <= 0) continue;
      const arr = out.get(a.muscle) ?? [];
      arr.push({ trainedAt: a.date, sets: a.sets, rpe: a.rpeSets > 0 ? a.rpeSum / a.rpeSets : undefined });
      out.set(a.muscle, arr);
    }
    return out;
  };
  return { byGroup: collect(groupAcc), byDetail: collect(detailAcc) };
}

/**
 * Per-muscle recovery %, fatigued-first. Accumulates residual fatigue from all
 * finished sessions in the trailing window (secondary muscles included), honors
 * "Mark as Ready" overrides, and applies the user's thresholds and deload window.
 */
export async function muscleRecovery(): Promise<MuscleRecovery[]> {
  const { rows } = await computeRecovery();
  return rows;
}

export interface FullRecovery {
  rows: MuscleRecovery[];
  details: DetailedMuscleRecovery[];
}

/**
 * Group and detail-head recovery in one pass. Use this instead of calling
 * `muscleRecovery` and `detailedMuscleRecovery` separately when a screen needs
 * both — it halves the database reads and fatigue computation.
 */
export async function allMuscleRecovery(): Promise<FullRecovery> {
  return computeRecovery();
}

export interface DetailedMuscleRecovery extends MuscleRecovery {
  /** The specific head; `muscleGroup` carries its parent group. */
  detail: DetailedMuscle;
}

/**
 * Per-detail-head recovery (front/side/rear delts, lats vs lower back, …),
 * fatigued-first. Same model and inputs as `muscleRecovery`, but each group's
 * sets fan out to its heads via the per-exercise `detailCredits` split, and
 * each head decays with its own base time. A custom recovery time set for the
 * parent group rescales all of its heads proportionally; "Mark as Ready" on
 * the group clears its heads too.
 */
export async function detailedMuscleRecovery(): Promise<DetailedMuscleRecovery[]> {
  const { details } = await computeRecovery();
  return details;
}

async function computeRecovery(): Promise<{ rows: MuscleRecovery[]; details: DetailedMuscleRecovery[] }> {
  const now = Date.now();
  const settings = await getRecoverySettings();
  const thresholds = thresholdsOf(settings);

  const impulses = await fatigueImpulses(settings.secondaryMuscleImpact, now - IMPULSE_WINDOW_DAYS * DAY);
  if (!impulses.byGroup.size) return { rows: [], details: [] };

  const factors = await latestFactors();
  const profile = (await db.userProfile.toArray())[0];
  // Deload speeds up recovery for sessions *trained during* the window only —
  // a hard session logged before the deload started wasn't any lighter.
  const deloadFor = (trainedAt: number) =>
    settings.deloadStartDate && settings.deloadEndDate &&
    trainedAt >= settings.deloadStartDate && trainedAt <= settings.deloadEndDate
      ? settings.deloadMultiplier
      : 1;
  // "Mark as Ready" wipes fatigue logged before the override; training again re-fatigues.
  const overrideAt = new Map(
    (await db.muscleRecoveryStatus.toArray()).map((s) => [s.muscleGroup, s.updatedAt]),
  );

  const compute = (group: MuscleGroup, all: FatigueImpulse[], baseRecoverySeconds?: number): MuscleRecovery => {
    const cutoff = overrideAt.get(group);
    const active = (cutoff ? all.filter((i) => i.trainedAt > cutoff) : all).map((i) => ({
      ...i,
      deloadMultiplier: deloadFor(i.trainedAt),
    }));
    const r = Recovery.calculateRecovery({
      muscleGroup: group,
      impulses: active,
      factors: factors ?? null,
      factorsAgeHours: factors ? Math.max(0, (now - factors.date) / 3_600_000) : 0,
      userAge: profile?.age ?? null,
      customRecoveryTimes: settings.customRecoveryTimes,
      baseRecoverySeconds,
      thresholds,
      now,
    });
    const lastTrainedAt = Math.max(...all.map((i) => i.trainedAt));
    const daysSinceTrained = Math.floor((now - lastTrainedAt) / DAY);
    return {
      ...r,
      lastTrainedAt,
      daysSinceTrained,
      verdict: Recovery.verdict(r.recoveryPercentage, daysSinceTrained, thresholds),
    };
  };

  const rows: MuscleRecovery[] = [];
  for (const [mg, all] of impulses.byGroup) rows.push(compute(mg, all));

  const details: DetailedMuscleRecovery[] = [];
  for (const [d, all] of impulses.byDetail) {
    const r = compute(DETAIL_PARENT[d], all, detailBaseSeconds(d, settings.customRecoveryTimes));
    details.push({ ...r, detail: d });
  }

  const byPct = (a: MuscleRecovery, b: MuscleRecovery) => a.recoveryPercentage - b.recoveryPercentage;
  return { rows: rows.sort(byPct), details: details.sort(byPct) };
}

/** Head base time, rescaled when the user customized the parent group's time. */
function detailBaseSeconds(d: DetailedMuscle, customRecoveryTimes: Record<string, number>): number {
  const parent = DETAIL_PARENT[d];
  const custom = customRecoveryTimes[parent];
  const scale = custom != null && BASE_RECOVERY[parent] ? custom / BASE_RECOVERY[parent] : 1;
  return DETAIL_BASE_RECOVERY[d] * scale;
}

export interface MuscleHistoryPoint {
  date: number; // day start, epoch ms
  recovery: number; // 0–100 at end of that day
}

/**
 * Retro-computed daily recovery % for one muscle over the last `days`
 * (evaluated at each day's end), for the Trends muscle-history chart.
 */
export async function muscleRecoveryDailyHistory(
  muscle: MuscleGroup,
  days = 14,
): Promise<MuscleHistoryPoint[]> {
  const now = Date.now();
  const settings = await getRecoverySettings();
  const since = dayStart(now) - (days - 1 + IMPULSE_WINDOW_DAYS) * DAY;
  const impulses = (await fatigueImpulses(settings.secondaryMuscleImpact, since)).byGroup.get(muscle) ?? [];
  const profile = (await db.userProfile.toArray())[0];

  const out: MuscleHistoryPoint[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = dayStart(now) - d * DAY;
    const at = Math.min(now, date + DAY - 1);
    const r = Recovery.calculateRecovery({
      muscleGroup: muscle,
      impulses: impulses.filter((i) => i.trainedAt <= at),
      userAge: profile?.age ?? null,
      customRecoveryTimes: settings.customRecoveryTimes,
      thresholds: thresholdsOf(settings),
      now: at,
    });
    out.push({ date, recovery: r.recoveryPercentage });
  }
  return out;
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
 * the partially-recovered threshold), suggest fresher alternatives. Candidates
 * target a different, more-recovered muscle (≥ `gate` percentage points
 * fresher), ranked by recovery → same equipment → same mechanic, deduped to one
 * per muscle so the picks are varied. Port of iOS `WorkoutRecommender.getSwapSuggestions`.
 */
export async function getSwapSuggestions(
  routineId: ID,
  opts?: { fatigueThreshold?: number; gate?: number; maxPerExercise?: number },
): Promise<SwapSuggestion[]> {
  const fatigueThreshold =
    opts?.fatigueThreshold ?? (await getRecoverySettings()).partiallyRecoveredThreshold;
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
