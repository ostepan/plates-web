import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUp, Check, Lightbulb, Plus, Sparkles, Timer, X } from "lucide-react";
import { db } from "@core/db/db";
import {
  addExerciseToSession, addSet, deleteSet, discardSession, finishSession, toggleSetComplete, updateSet,
} from "@core/db/mutations";
import { ExercisePicker } from "@app/components/ExercisePicker";
import { bestE1RMByExercise, lastWorkingSetsByExercise } from "@core/db/analytics";
import { getRecoverySettings, muscleRecovery } from "@core/db/recovery";
import { Recovery } from "@core/calc/recovery";
import { suggestNextSet, type SetSuggestion } from "@core/calc/progression";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import type { MuscleGroup, SetKind } from "@core/models/enums";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import { supersetBadge } from "@core/superset";
import { formatDuration, localizedExerciseName, relativeDay, weightUnit } from "@app/lib/format";
import { useRestTimer } from "@app/hooks/useRestTimer";

interface Block {
  sxId: ID;
  exercise?: Exercise;
  sets: WorkoutSet[];
  ghost: WorkoutSet[];
  /** Last session's working set lined up with each of today's rows (none for warm-ups). */
  ghostRows: (WorkoutSet | undefined)[];
  lastDate?: number;
  suggestions: (SetSuggestion | undefined)[];
  restSeconds: number;
  target?: { sets: number; min: number; max: number; weight?: number };
  pr?: number;
  recovery?: { code: string; pct: number };
  supersetGroupId?: string;
}

/** 3-letter muscle code shown in the exercise sub-line (CHE, SHO, …). */
const MUSCLE_CODE: Record<MuscleGroup, string> = {
  chest: "CHE", back: "BAC", shoulders: "SHO", biceps: "BIC", triceps: "TRI",
  forearms: "FOR", legs: "LEG", glutes: "GLU", calves: "CAL", abs: "ABS",
  cardio: "CAR", fullBody: "FUL",
};

/** Compact volume — 5739 → "5.7k". */
function compactVolume(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
}

export function ActiveWorkout() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const rest = useRestTimer();
  const [picking, setPicking] = useState(false);
  const [openCues, setOpenCues] = useState<Set<ID>>(() => new Set());
  const toggleCues = (sxId: ID) =>
    setOpenCues((prev) => {
      const next = new Set(prev);
      next.has(sxId) ? next.delete(sxId) : next.add(sxId);
      return next;
    });

  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  // Below this recovery %, the volume-cap warning arms for a muscle's blocks.
  const capLine =
    useLiveQuery(() => getRecoverySettings(), [])?.mostlyRecoveredThreshold ?? 70;
  const blocks = useLiveQuery(
    async (): Promise<Block[]> => {
      const sess = await db.sessions.get(sessionId);
      const res = sess?.routineId
        ? await db.routineExercises.where("routineId").equals(sess.routineId).toArray()
        : [];
      const targetByEx = new Map(res.map((r) => [r.exerciseId, r]));
      const recovery = await muscleRecovery();
      const recByMuscle = new Map(recovery.map((r) => [r.muscleGroup, r.recoveryPercentage]));
      const prByExercise = await bestE1RMByExercise();
      const lastByExercise = await lastWorkingSetsByExercise(sessionId);
      const settings = await getRecoverySettings();
      const increment = weightUnit() === "kg" ? 2.5 : 5;
      const sxs = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray()).sort(
        (a, b) => a.order - b.order,
      );
      return Promise.all(
        sxs.map(async (sx) => {
          const exercise = sx.exerciseId ? await db.exercises.get(sx.exerciseId) : undefined;
          const sets = (await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray()).sort(
            (a, b) => a.order - b.order,
          );
          const last = sx.exerciseId ? lastByExercise.get(sx.exerciseId) : undefined;
          const ghost = last?.sets ?? [];
          const re = sx.exerciseId ? targetByEx.get(sx.exerciseId) : undefined;
          const prRaw = sx.exerciseId ? prByExercise.get(sx.exerciseId) : undefined;
          const pr = prRaw ? Math.round(prRaw) : undefined;
          const pct = exercise ? recByMuscle.get(exercise.muscleGroup) : undefined;
          // Smart auto-type: hold progression while the muscle is under-recovered.
          const holdProgress = pct != null && pct < settings.mostlyRecoveredThreshold;
          // Ghosts are last session's *working* sets, so line them up with
          // today's rows by working position — warm-up rows would otherwise
          // shift every pairing and inherit full working weights themselves.
          let workingIdx = 0;
          const ghostRows = sets.map((s): WorkoutSet | undefined => {
            if (s.kind === "warmup") return undefined;
            const g = ghost.length ? ghost[Math.min(workingIdx, ghost.length - 1)] : undefined;
            workingIdx += 1;
            return g;
          });
          const suggestions = sets.map((s, i) => {
            if (s.isCompleted || s.kind === "warmup") return undefined;
            const basis = ghostRows[i];
            return suggestNextSet({
              last: basis ? { weight: basis.weight, reps: basis.reps, rir: basis.rir } : undefined,
              repMin: re?.targetRepsMin,
              repMax: re?.targetRepsMax,
              targetRIR: re?.targetRIR,
              increment,
              fallbackWeight: re?.targetWeight,
              holdProgress,
            });
          });
          return {
            sxId: sx.id, exercise, sets, ghost, ghostRows,
            lastDate: last?.date,
            suggestions,
            restSeconds: exercise?.defaultRestSeconds ?? 120,
            target: re
              ? { sets: re.targetSets, min: re.targetRepsMin, max: re.targetRepsMax, weight: re.targetWeight }
              : undefined,
            pr,
            recovery:
              exercise && pct != null ? { code: MUSCLE_CODE[exercise.muscleGroup], pct: Math.round(pct) } : undefined,
            supersetGroupId: sx.supersetGroupID,
          };
        }),
      );
    },
    [sessionId],
    [] as Block[],
  );

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(Math.round((Date.now() - session.createdAt) / 1000));
    tick();
    const h = window.setInterval(tick, 1000);
    return () => window.clearInterval(h);
  }, [session]);

  // Free-running stopwatch (timed sets, carries, planks) — independent of the rest timer.
  const [swOpen, setSwOpen] = useState(false);
  const [swRunning, setSwRunning] = useState(false);
  const [swMs, setSwMs] = useState(0);
  const swBase = useRef(0);
  useEffect(() => {
    if (!swRunning) return;
    const h = window.setInterval(() => setSwMs(Date.now() - swBase.current), 100);
    return () => window.clearInterval(h);
  }, [swRunning]);
  function swToggle() {
    if (swRunning) {
      setSwMs(Date.now() - swBase.current);
      setSwRunning(false);
    } else {
      swBase.current = Date.now() - swMs;
      setSwRunning(true);
    }
  }
  function swReset() {
    setSwRunning(false);
    setSwMs(0);
  }

  if (session === undefined) return null;
  if (session === null) {
    navigate("/workout", { replace: true });
    return null;
  }

  const completed = blocks.reduce((n, b) => n + b.sets.filter((s) => s.isCompleted).length, 0);
  const totalSets = blocks.reduce((n, b) => n + b.sets.length, 0);
  const volume = blocks.reduce(
    (v, b) => v + b.sets.filter((s) => s.isCompleted && s.kind === "working").reduce((x, s) => x + s.weight * s.reps, 0),
    0,
  );
  const firstIncomplete = blocks.findIndex((b) => b.sets.some((s) => !s.isCompleted));
  const currentIndex = firstIncomplete; // -1 if all done
  const currentExercise = firstIncomplete === -1 ? blocks.length : firstIncomplete + 1;

  async function finish() {
    await finishSession(sessionId);
    navigate(`/summary/${sessionId}`, { replace: true });
  }
  async function discard() {
    if (!confirm(t("Discard workout") + "?")) return;
    await discardSession(sessionId);
    navigate("/workout", { replace: true });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      {/* Sticky header + stats */}
      <header className="sticky top-0 z-10 bg-bg">
        <div className="flex items-end justify-between px-[22px] pb-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] bg-accent" />
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
                {t("LIVE")}
              </span>
            </div>
            <h1 className="mt-1 font-display text-[22px] font-extrabold tracking-[-0.5px] text-ink">
              {session.routineNameSnapshot || t("Workout")}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSwOpen((v) => !v)}
              aria-label={t("Stopwatch")}
              aria-pressed={swOpen}
              className={`grid h-9 w-9 place-items-center border ${
                swOpen ? "border-ink bg-ink text-white" : "border-rule text-ink2"
              }`}
            >
              <Timer size={16} strokeWidth={2.25} />
            </button>
            <div className="text-right">
              <p className="font-display text-[22px] font-semibold tracking-[-0.5px] tabular-nums text-ink">
                {formatDuration(elapsed)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink3">{t("ELAPSED")}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3">
          <GridStat label={t("SETS")} value={`${completed}/${totalSets}`} />
          <GridStat label={t("VOLUME")} value={compactVolume(volume)} />
          <GridStat label={t("EXERCISE")} value={`${currentExercise}/${blocks.length}`} />
        </div>
      </header>

      {/* Exercise list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {blocks.map((b, bi) => {
          const isCurrent = bi === currentIndex;
          const activeSetId = isCurrent ? b.sets.find((s) => !s.isCompleted)?.id : undefined;
          const badge = supersetBadge(blocks.map((x) => ({ supersetGroupId: x.supersetGroupId })), bi);
          // Volume-cap guard: sets a fatigued muscle can absorb vs the plan.
          const workingDone = b.sets.filter((s) => s.isCompleted && s.kind === "working").length;
          const plannedSets = b.target?.sets ?? b.sets.filter((s) => s.kind === "working").length;
          const setCap =
            b.recovery && b.recovery.pct < capLine
              ? Recovery.recommendedSetCap(plannedSets, b.recovery.pct, capLine)
              : null;
          const showCapWarning =
            setCap != null && workingDone >= setCap && b.sets.some((s) => !s.isCompleted);
          return (
            <section key={b.sxId}>
              {/* Exercise header bar — peach when current */}
              <div className={`px-[22px] pb-2 pt-[18px] ${isCurrent ? "bg-accentSoft" : "bg-bg"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="font-display text-[14px] font-extrabold text-ink3">{String(bi + 1).padStart(2, "0")}</span>
                    {badge ? (
                      <span className="mono-num border border-accent px-1 text-[10px] font-bold text-accent">{badge.label}</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => b.exercise && navigate(`/exercises/${b.exercise.id}`)}
                      className="text-left font-display text-[20px] font-extrabold tracking-[-0.4px] leading-[22px] text-ink active:text-accent"
                    >
                      {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
                    </button>
                    {b.exercise?.userNotes ? (
                      <button
                        type="button"
                        onClick={() => toggleCues(b.sxId)}
                        aria-label={t("Form cues")}
                        aria-expanded={openCues.has(b.sxId)}
                        className="text-warn"
                      >
                        <Lightbulb size={14} strokeWidth={2} />
                      </button>
                    ) : null}
                  </div>
                  <span
                    className={`flex items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isCurrent ? "text-accent" : "text-ink3"
                    }`}
                  >
                    {isCurrent ? "● " : ""}{isCurrent ? t("Now") : t("Up next")}
                  </span>
                </div>

                {/* Last time / PR / recovery sub-line */}
                <div className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                  {b.ghost.length ? (
                    <span className="text-ink2">
                      <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink3">{t("Last")}</span>
                      <b className="mono-num text-[11px] font-bold text-ink">{lastSummary(b.ghost)}</b>
                      {b.lastDate != null ? (
                        <span className="ml-1.5 text-[9px] text-ink3">{relativeDay(b.lastDate, i18n.language)}</span>
                      ) : null}
                    </span>
                  ) : b.target ? (
                    <span className="text-ink2">
                      <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink3">{t("Tgt")}</span>
                      <b className="font-display text-[11px] font-bold text-ink">
                        {b.target.weight ? `${b.target.weight}×${b.target.min}` : `${b.target.sets}×${b.target.min}`}
                      </b>
                    </span>
                  ) : null}
                  {b.pr != null ? (
                    <span className="text-ink2">
                      <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-ink3">{t("PR")}</span>
                      <b className="font-display text-[11px] font-bold text-ink">{b.pr}</b>
                    </span>
                  ) : null}
                  {b.recovery ? (
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold ${recoveryColor(b.recovery.pct)}`}>
                        {b.recovery.code} {b.recovery.pct}%
                      </span>
                      <span className="h-[3px] w-7 overflow-hidden bg-chip">
                        <span
                          className={`block h-full ${recoveryBarClass(b.recovery.pct)}`}
                          style={{ width: `${Math.max(0, Math.min(100, b.recovery.pct))}%` }}
                        />
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              {b.exercise?.userNotes && openCues.has(b.sxId) ? (
                <p className="mx-[22px] mb-2 border-l-2 border-warn bg-warn/10 px-2.5 py-1.5 text-[13px] leading-relaxed text-ink2 whitespace-pre-line">
                  {b.exercise.userNotes}
                </p>
              ) : null}

              {/* Volume-cap warning for fatigued muscles (iOS parity) */}
              {showCapWarning && b.exercise ? (
                <p className="mx-[22px] mb-2 border-l-2 border-warn bg-warn/10 px-2.5 py-1.5 text-[12px] leading-relaxed text-ink">
                  {t("{{muscle}} is at {{pct}}% — consider stopping at {{cap}} working sets today.", {
                    muscle: t(MUSCLE_I18N_KEY[b.exercise.muscleGroup]),
                    pct: b.recovery!.pct,
                    cap: setCap,
                  })}
                </p>
              ) : null}

              {/* Sets */}
              <div className="px-[22px] pb-3.5">
                <div className="grid grid-cols-[30px_61px_61px_64px_70px_30px] gap-1.5 py-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("SET")}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("Wt")}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("Reps")}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("RIR")}</span>
                  <span className="text-right text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("Last")}</span>
                  <span />
                </div>
                {b.sets.map((s, i) => (
                  <SetRow
                    key={s.id}
                    set={s}
                    index={i}
                    ghost={b.ghostRows[i]}
                    suggest={b.suggestions[i]}
                    active={s.id === activeSetId}
                    onComplete={(done) => done && rest.start(b.restSeconds)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => void addSet(b.sxId)}
                  className="mt-2.5 w-full py-[9px] text-center font-display text-[11px] font-bold uppercase tracking-[0.09em] text-ink2 active:text-ink"
                >
                  {t("+ Add set")}
                </button>
              </div>
            </section>
          );
        })}

        {/* Add exercise / finish */}
        <div className="px-[22px] pb-[max(3.75rem,env(safe-area-inset-bottom))] pt-5">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mb-3 flex h-[46px] w-full items-center justify-center gap-2 border border-ink text-ink active:bg-chip"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span className="font-display text-[12px] font-extrabold uppercase tracking-[0.14em]">{t("ADD EXERCISE")}</span>
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            className="flex h-[54px] w-full items-center justify-center gap-2 bg-ink text-white"
          >
            <span className="font-display text-[14px] font-extrabold uppercase tracking-[0.14em]">{t("Finish workout")}</span>
          </button>
          <button
            type="button"
            onClick={() => void discard()}
            className="mt-3 w-full text-center text-[10px] font-bold uppercase tracking-[0.12em] text-ink3 active:text-ink"
          >
            {t("Discard workout")}
          </button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(exerciseId) => {
            void addExerciseToSession(sessionId, exerciseId);
            setPicking(false);
          }}
        />
      )}

      {(swOpen || rest.running) && (
        <div className="absolute inset-x-0 bottom-0">
          {swOpen && (
            <div
              className={`flex items-center justify-between border-t border-rule bg-ink px-5 py-3 text-white ${
                rest.running ? "" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              }`}
            >
              <span className="eyebrow text-[11px] text-white/60">{t("STOPWATCH")}</span>
              <span className="mono-num text-[22px] font-bold tabular-nums">{formatStopwatch(swMs)}</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={swToggle} className="eyebrow text-[11px]">
                  {swRunning ? t("PAUSE") : t("START")}
                </button>
                <button type="button" onClick={swReset} className="eyebrow text-[11px] text-white/70">
                  {t("RESET")}
                </button>
                <button
                  type="button"
                  onClick={() => { swReset(); setSwOpen(false); }}
                  aria-label={t("Close")}
                  className="text-white/70"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          )}
          {rest.running && (
            <div className="flex items-center justify-between border-t border-rule bg-ink px-5 py-3 text-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <span className="eyebrow text-[11px] text-white/60">{t("REST")}</span>
              <span className="mono-num text-[22px] font-bold">{formatDuration(rest.remaining)}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => rest.adjust(-15)} className="mono-num text-[13px] text-white/70">−15s</button>
                <button type="button" onClick={() => rest.adjust(15)} className="mono-num text-[13px] text-white/70">+15s</button>
                <button type="button" onClick={rest.stop} className="eyebrow text-[11px]">{t("SKIP")}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** "1:23.4" — minutes, seconds, tenths for the in-workout stopwatch. */
function formatStopwatch(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${tenths % 10}`;
}

function GridStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-[14px] py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{label}</p>
      <p className="mt-px font-display text-[16px] font-extrabold tracking-[-0.3px] tabular-nums text-ink">{value}</p>
    </div>
  );
}

const SET_KINDS: SetKind[] = ["working", "warmup", "dropset", "amrap", "restPause", "myoReps"];
const KIND_ABBR: Record<SetKind, string> = {
  working: "", warmup: "W", dropset: "D", amrap: "A", restPause: "RP", myoReps: "M",
};
const KIND_LABEL: Record<SetKind, string> = {
  working: "Working", warmup: "Warm-up", dropset: "Drop set", amrap: "AMRAP", restPause: "Rest-pause", myoReps: "Myo-reps",
};

/** RIR → text color, matching the Iron RIRStyle scale (0 redlined → 4 fresh). */
function rirColorClass(rir: number | undefined): string {
  if (rir == null || Number.isNaN(rir)) return "text-ink";
  if (rir <= 0) return "text-bad";
  if (rir === 1) return "text-fade";
  if (rir === 2) return "text-warn";
  if (rir === 3) return "text-ok/80";
  return "text-ok";
}

/** Recovery %, lower = more fatigued = hotter color. */
function recoveryColor(pct: number): string {
  if (pct < 50) return "text-accent";
  if (pct < 75) return "text-warn";
  return "text-ok";
}

/** Bar variant of `recoveryColor` for the mini recovery gauge. */
function recoveryBarClass(pct: number): string {
  if (pct < 50) return "bg-accent";
  if (pct < 75) return "bg-warn";
  return "bg-ok";
}

/** "80×8/8/7" when the weight held, otherwise "80×8 75×8 …". */
function lastSummary(sets: WorkoutSet[]): string {
  if (!sets.length) return "";
  const sameWeight = sets.every((s) => s.weight === sets[0].weight);
  return sameWeight
    ? `${sets[0].weight}×${sets.map((s) => s.reps).join("/")}`
    : sets.map((s) => `${s.weight}×${s.reps}`).join(" ");
}

/** RIR picker options — value + the short explainer from the analytics glossary. */
const RIR_OPTIONS: { value: number; label: string; explainKey: string }[] = [
  { value: 0, label: "0", explainKey: "rir.explain.0" },
  { value: 1, label: "1", explainKey: "rir.explain.1" },
  { value: 2, label: "2", explainKey: "rir.explain.2" },
  { value: 3, label: "3", explainKey: "rir.explain.3" },
  { value: 4, label: "4+", explainKey: "rir.explain.4plus" },
];

/** Why the suggestion says what it says — chip label per progression reason. */
const SUGGEST_REASON_KEY: Record<SetSuggestion["reason"], string> = {
  progress: "Add weight",
  addRep: "+1 rep",
  hold: "Repeat",
  backOff: "Back off",
  start: "Routine target",
};

function SetRow({
  set,
  index,
  ghost,
  suggest,
  active,
  onComplete,
}: {
  set: WorkoutSet;
  index: number;
  ghost?: WorkoutSet;
  suggest?: SetSuggestion;
  active?: boolean;
  onComplete: (done: boolean) => void;
}) {
  const { t } = useTranslation();
  const unit = weightUnit();
  // Smart autotype: pre-fill from the progression suggestion (falls back to the
  // last session's matching set) so a pending row is loggable with a single tap;
  // persisted on blur/complete as before. Warm-ups follow their own loading.
  const prefill = set.kind !== "warmup" ? suggest : undefined;
  const [weight, setWeight] = useState(
    set.weight ? String(set.weight)
    : prefill?.weight ? String(prefill.weight)
    : ghost?.weight ? String(ghost.weight) : "",
  );
  const [reps, setReps] = useState(
    set.reps ? String(set.reps)
    : prefill?.reps ? String(prefill.reps)
    : ghost?.reps ? String(ghost.reps) : "",
  );
  const [rir, setRir] = useState(set.rir != null ? String(set.rir) : "");
  const [menu, setMenu] = useState(false);
  const [rirMenu, setRirMenu] = useState(false);

  const badgeLabel = set.kind === "working" ? index + 1 : KIND_ABBR[set.kind];
  // Completed (or special kind) badge → peach + accent; plain pending → chip + ink2.
  const badgeHot = set.isCompleted || (set.kind !== "working" && set.kind !== "warmup");
  const rirVal = rir.trim() === "" ? undefined : parseInt(rir, 10);
  // Suggestions target working sets — warm-ups follow their own logic.
  const showSuggest = suggest && set.kind !== "warmup";

  async function toggle() {
    if (!set.isCompleted) {
      // Blank fields complete with the suggested (or last-time) numbers — zero-typing logging.
      const typedW = parseFloat(weight);
      const typedR = parseInt(reps, 10);
      const w = Number.isFinite(typedW) ? typedW : (showSuggest ? suggest.weight : ghost?.weight) ?? 0;
      const r = Number.isFinite(typedR) ? typedR : (showSuggest ? suggest.reps : ghost?.reps) ?? 0;
      setWeight(w ? String(w) : "");
      setReps(r ? String(r) : "");
      await updateSet(set.id, { weight: w, reps: r });
    }
    const done = await toggleSetComplete(set.id);
    onComplete(done);
  }

  function fillSuggestion() {
    if (!showSuggest) return;
    setWeight(String(suggest.weight));
    setReps(String(suggest.reps));
    setRir(String(suggest.rir));
    void updateSet(set.id, { weight: suggest.weight, reps: suggest.reps, rir: suggest.rir });
  }

  const Badge = (
    <button
      type="button"
      aria-label={t("Set type")}
      onClick={() => setMenu((v) => !v)}
      className={`flex h-[26px] w-[26px] items-center justify-center font-display text-[12px] font-extrabold ${
        badgeHot ? "bg-accentSoft text-accent" : "bg-chip text-ink2"
      }`}
    >
      {badgeLabel}
    </button>
  );
  const Menu = menu ? (
    <>
      <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
      <div className="absolute left-0 top-7 z-20 w-32 border border-ink bg-card">
        {SET_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { void updateSet(set.id, { kind: k }); setMenu(false); }}
            className={`block w-full px-3 py-2 text-left text-[12px] ${k === set.kind ? "bg-chip font-bold text-ink" : "text-ink2"}`}
          >
            {KIND_ABBR[k] ? `${KIND_ABBR[k]} · ` : ""}{t(KIND_LABEL[k])}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { void deleteSet(set.id); setMenu(false); }}
          className="block w-full border-t border-rule px-3 py-2 text-left text-[12px] text-bad"
        >
          {t("Delete set")}
        </button>
      </div>
    </>
  ) : null;

  // ---- COMPLETED: compact summary row (tap check to re-open) ----
  if (set.isCompleted) {
    const beatGhost = ghost ? set.weight * set.reps > ghost.weight * ghost.reps : false;
    return (
      <div className="flex items-center py-[11px]">
        <div className="relative w-[30px]">{Badge}{Menu}</div>
        <div className="flex flex-1 items-center gap-2">
          <span className="font-display text-[15px] font-bold text-ink">
            {set.weight}
            <span className="ml-0.5 text-[10px] font-bold text-ink3">{unit}</span>
            <span className="mx-1">×</span>
            {set.reps}
          </span>
          {set.rir != null ? (
            <span className={`font-display text-[11px] font-bold ${rirColorClass(set.rir)}`}>{set.rir} RIR</span>
          ) : null}
          {beatGhost ? <ArrowUp size={10} strokeWidth={3} className="text-ok" /> : null}
        </div>
        <button
          type="button"
          aria-label="edit set"
          onClick={toggle}
          className="flex h-[22px] w-[22px] items-center justify-center bg-ink text-white"
        >
          <Check size={12} strokeWidth={3} />
        </button>
      </div>
    );
  }

  // ---- PENDING: full input row ----
  return (
    <>
      <div className="grid grid-cols-[30px_61px_61px_64px_70px_30px] items-center gap-1.5 py-[7px]">
        <div className="relative">{Badge}{Menu}</div>
        <input
          inputMode="decimal"
          value={weight}
          placeholder={showSuggest ? String(suggest.weight) : ghost ? String(ghost.weight) : "0"}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => void updateSet(set.id, { weight: parseFloat(weight) || 0 })}
          className="mono-num w-full border border-rule bg-card px-1.5 py-1.5 text-[15px] text-ink outline-none focus:border-ink placeholder:text-ink3/60"
        />
        <input
          inputMode="numeric"
          value={reps}
          placeholder={showSuggest ? String(suggest.reps) : ghost ? String(ghost.reps) : "0"}
          onChange={(e) => setReps(e.target.value)}
          onBlur={() => void updateSet(set.id, { reps: parseInt(reps, 10) || 0 })}
          className="mono-num w-full border border-rule bg-card px-1.5 py-1.5 text-[15px] text-ink outline-none focus:border-ink placeholder:text-ink3/60"
        />
        <div className="relative">
          <button
            type="button"
            aria-label="RIR"
            onClick={() => setRirMenu((v) => !v)}
            className={`mono-num w-full border border-rule bg-card px-1 py-1.5 text-center text-[14px] font-semibold ${
              rir.trim() !== "" ? rirColorClass(rirVal) : "text-ink3/50"
            }`}
          >
            {rir.trim() !== "" ? rirVal : showSuggest ? suggest.rir : ghost?.rir != null ? ghost.rir : "–"}
          </button>
          {rirMenu ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setRirMenu(false)} />
              <div className="absolute right-0 top-9 z-20 w-64 border border-ink bg-card">
                <p className="border-b border-rule px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ink3">
                  {t("rir.title")}
                </p>
                {RIR_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setRir(String(o.value));
                      void updateSet(set.id, { rir: o.value });
                      setRirMenu(false);
                    }}
                    className={`flex w-full items-baseline gap-2.5 px-3 py-2 text-left ${o.value === rirVal ? "bg-chip" : ""}`}
                  >
                    <span className={`mono-num w-5 shrink-0 text-[13px] font-bold ${rirColorClass(o.value)}`}>{o.label}</span>
                    <span className="text-[11px] leading-snug text-ink2">{t(o.explainKey)}</span>
                  </button>
                ))}
                {rir.trim() !== "" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRir("");
                      void updateSet(set.id, { rir: undefined });
                      setRirMenu(false);
                    }}
                    className="block w-full border-t border-rule px-3 py-2 text-left text-[11px] text-ink3"
                  >
                    {t("Clear")}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        {ghost ? (
          <span className="text-right leading-tight">
            <span className="mono-num block text-[11px] text-ink2">{ghost.weight}×{ghost.reps}</span>
            <span className="block text-[9px] font-semibold text-ink3">
              {ghost.rir != null ? `${ghost.rir} RIR` : " "}
            </span>
          </span>
        ) : (
          <span className="text-right text-ink3/40">·</span>
        )}
        <button
          type="button"
          aria-label="complete set"
          onClick={toggle}
          className="flex h-[22px] w-[22px] items-center justify-self-end"
        >
          {active ? (
            <span className="m-auto h-2 w-2 bg-accent" />
          ) : (
            <span className="m-auto grid h-[22px] w-[22px] place-items-center border border-rule text-transparent">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </button>
      </div>
      {active && showSuggest ? (
        <button
          type="button"
          onClick={fillSuggestion}
          className="-mx-[22px] mb-1.5 flex w-[calc(100%+44px)] items-center justify-between gap-2 bg-accentSoft/50 px-[22px] py-2 active:bg-accentSoft"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles size={11} strokeWidth={2.25} className="text-accent" />
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink2">{t("Suggested")}</span>
          </span>
          <span className="mono-num text-[13px] font-bold text-ink">
            {suggest.weight}
            <span className="ml-0.5 text-[10px] font-semibold text-ink3">{unit}</span>
            <span className="mx-1">×</span>
            {suggest.reps}
            <span className="ml-1.5 text-[10px] font-semibold text-ink3">@ {suggest.rir} RIR</span>
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-accent">
            {t(SUGGEST_REASON_KEY[suggest.reason])}
          </span>
        </button>
      ) : null}
    </>
  );
}
