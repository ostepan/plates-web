import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, ChevronDown, Lightbulb, Minus, Plus, Timer, X } from "lucide-react";
import { db } from "@core/db/db";
import {
  addExerciseToSession, addSet, deleteSet, discardSession, finishSession, toggleSetComplete, updateSet,
} from "@core/db/mutations";
import { ExercisePicker } from "@app/components/ExercisePicker";
import { bestE1RMByExercise, exerciseE1RMSeries, lastWorkingSetsByExercise } from "@core/db/analytics";
import { Performance, type Point } from "@core/calc/performance";
import { EXPAND, FADE_FAST, FadeSlide } from "@ui/components/motion";
import { RIRPickerSheet, rirPaint } from "@ui/components/RIRPicker";
import { Sparkline } from "@ui/components/Sparkline";
import { getRecoverySettings, muscleRecovery } from "@core/db/recovery";
import { Recovery } from "@core/calc/recovery";
import { OneRM } from "@core/calc/oneRM";
import { STANDARD_KG_PLATES, STANDARD_LB_PLATES, plates } from "@core/calc/plate";
import { suggestNextSet, type SetSuggestion } from "@core/calc/progression";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import type { MuscleGroup, SetKind } from "@core/models/enums";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import { supersetBadge } from "@core/superset";
import { formatDuration, localizedExerciseName, relativeDay, weightUnit } from "@app/lib/format";
import { useRestTimerStore } from "@app/stores/restTimer";
import { ironConfirm } from "@app/stores/confirm";

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
  // Subscribe only to whether a rest is running — `remaining` ticks every
  // second and would re-render the whole exercise list with it (it stuttered
  // the set-editor animation). The countdown display lives in <RestBar/>.
  const restRunning = useRestTimerStore((s) => s.endsAt != null);
  const restStartStore = useRestTimerStore((s) => s.start);
  const restStop = useRestTimerStore((s) => s.stop);
  const restStart = useCallback(
    (seconds: number) => restStartStore(seconds, sessionId),
    [restStartStore, sessionId],
  );
  const [picking, setPicking] = useState(false);
  const [editingSetId, setEditingSetId] = useState<ID | null>(null);
  // Per-exercise rest overrides for this session — tweak rest mid-workout
  // without touching the exercise's saved default. Keyed by sessionExercise id;
  // survives the blocks live-query re-running on every set change.
  const [restOverrides, setRestOverrides] = useState<Record<ID, number>>({});
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

  // Stopwatch visibility only — its ticking state lives inside <StopwatchBar/>
  // so 10Hz updates can't re-render the exercise list.
  const [swOpen, setSwOpen] = useState(false);

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
    restStop();
    await finishSession(sessionId);
    navigate(`/summary/${sessionId}`, { replace: true });
  }
  async function discard() {
    if (
      !(await ironConfirm({
        title: t("Discard workout") + "?",
        message: t("Logged sets will be deleted. This can't be undone."),
        confirmLabel: t("Discard"),
        destructive: true,
      }))
    )
      return;
    restStop();
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
            <ElapsedClock since={session.createdAt} />
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
          const effectiveRest = restOverrides[b.sxId] ?? b.restSeconds;
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
                <div className="grid grid-cols-[30px_1fr_1fr_64px_70px_30px] gap-1.5 py-1.5">
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
                    equipment={b.exercise?.equipment}
                    exerciseId={b.exercise?.id}
                    lastSets={b.ghost}
                    lastDate={b.lastDate}
                    recovery={b.recovery}
                    editing={s.id === editingSetId}
                    onEdit={() => setEditingSetId(s.id)}
                    onCloseEdit={() => setEditingSetId(null)}
                    onComplete={(done) => done && restStart(effectiveRest)}
                  />
                ))}
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void addSet(b.sxId)}
                    className="py-[9px] text-left font-display text-[11px] font-bold uppercase tracking-[0.09em] text-ink2 active:text-ink"
                  >
                    {t("+ Add set")}
                  </button>
                  <RestControl
                    seconds={effectiveRest}
                    onChange={(s) => setRestOverrides((m) => ({ ...m, [b.sxId]: s }))}
                  />
                </div>
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

      {(swOpen || restRunning) && (
        <div className="absolute inset-x-0 bottom-0">
          {swOpen && <StopwatchBar padBottom={!restRunning} onClose={() => setSwOpen(false)} />}
          {restRunning && <RestBar />}
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

/**
 * Header session clock. Isolated so its 1Hz tick re-renders only this leaf —
 * not the whole exercise list (which made the set-editor animation stutter).
 */
function ElapsedClock({ since }: { since: number }) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.round((Date.now() - since) / 1000));
    tick();
    const h = window.setInterval(tick, 1000);
    return () => window.clearInterval(h);
  }, [since]);
  return (
    <div className="text-right">
      <p className="font-display text-[22px] font-semibold tracking-[-0.5px] tabular-nums text-ink">
        {formatDuration(elapsed)}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink3">{t("ELAPSED")}</p>
    </div>
  );
}

/** Free-running stopwatch bar (timed sets, carries, planks) — owns its 10Hz tick. */
function StopwatchBar({ padBottom, onClose }: { padBottom: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [ms, setMs] = useState(0);
  const base = useRef(0);
  useEffect(() => {
    if (!running) return;
    const h = window.setInterval(() => setMs(Date.now() - base.current), 100);
    return () => window.clearInterval(h);
  }, [running]);
  function toggle() {
    if (running) {
      setMs(Date.now() - base.current);
      setRunning(false);
    } else {
      base.current = Date.now() - ms;
      setRunning(true);
    }
  }
  return (
    <div
      className={`flex items-center justify-between border-t border-rule bg-ink px-5 py-3 text-white ${
        padBottom ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : ""
      }`}
    >
      <span className="eyebrow text-[11px] text-white/60">{t("STOPWATCH")}</span>
      <span className="mono-num text-[22px] font-bold tabular-nums">{formatStopwatch(ms)}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={toggle} className="eyebrow text-[11px]">
          {running ? t("PAUSE") : t("START")}
        </button>
        <button
          type="button"
          onClick={() => { setRunning(false); setMs(0); }}
          className="eyebrow text-[11px] text-white/70"
        >
          {t("RESET")}
        </button>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="text-white/70">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

/** Rest countdown bar — subscribes to the per-second tick so the list doesn't. */
function RestBar() {
  const { t } = useTranslation();
  const remaining = useRestTimerStore((s) => s.remaining);
  const total = useRestTimerStore((s) => s.total);
  const stop = useRestTimerStore((s) => s.stop);
  const adjust = useRestTimerStore((s) => s.adjust);
  return (
    <div className="flex items-center justify-between gap-3 border-t-2 border-accent bg-ink px-5 py-3 text-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <span className="eyebrow text-[11px] text-accent">{t("REST")}</span>
      <span className="mono-num text-[22px] font-bold">{formatDuration(remaining)}</span>
      <span className="relative h-1 min-w-0 flex-1 overflow-hidden bg-white/[0.18]">
        <span
          className="absolute bottom-0 left-0 top-0 bg-accent transition-[width] duration-500 ease-linear"
          style={{ width: `${total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0}%` }}
        />
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => adjust(-15)} className="mono-num text-[13px] text-white/70">−15s</button>
        <button type="button" onClick={() => adjust(15)} className="mono-num text-[13px] text-white/70">+15s</button>
        <button type="button" onClick={stop} className="eyebrow text-[11px]">{t("SKIP")}</button>
      </div>
    </div>
  );
}

/** Per-exercise rest adjuster in the set footer — change rest mid-workout. */
function RestControl({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <Timer size={12} strokeWidth={2.25} className="text-ink3" />
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("REST")}</span>
      <button
        type="button"
        aria-label={t("Decrease rest")}
        onClick={() => onChange(Math.max(0, seconds - 15))}
        className="grid h-[22px] w-[22px] place-items-center border border-rule text-ink2 active:bg-chip"
      >
        <Minus size={12} strokeWidth={2.5} />
      </button>
      <span className="mono-num w-10 text-center text-[12px] font-bold tabular-nums text-ink">
        {formatDuration(seconds)}
      </span>
      <button
        type="button"
        aria-label={t("Increase rest")}
        onClick={() => onChange(seconds + 15)}
        className="grid h-[22px] w-[22px] place-items-center border border-rule text-ink2 active:bg-chip"
      >
        <Plus size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
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

/** Why the suggestion says what it says — shown in the set editor's eyebrow. */
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
  equipment,
  exerciseId,
  lastSets,
  lastDate,
  recovery,
  editing,
  onEdit,
  onCloseEdit,
  onComplete,
}: {
  set: WorkoutSet;
  index: number;
  ghost?: WorkoutSet;
  suggest?: SetSuggestion;
  active?: boolean;
  equipment?: string;
  exerciseId?: ID;
  lastSets: WorkoutSet[];
  lastDate?: number;
  recovery?: { code: string; pct: number };
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onComplete: (done: boolean) => void;
}) {
  const { t } = useTranslation();
  const unit = weightUnit();
  // Briefly tint the row accent after logging, then settle.
  const [justLogged, setJustLogged] = useState(false);
  useEffect(() => {
    if (!justLogged) return;
    const h = window.setTimeout(() => setJustLogged(false), 700);
    return () => window.clearTimeout(h);
  }, [justLogged]);

  const badgeLabel = set.kind === "working" ? index + 1 : KIND_ABBR[set.kind];
  // Completed (or special kind) badge → peach + accent; plain pending → chip + ink2.
  const badgeHot = set.isCompleted || (set.kind !== "working" && set.kind !== "warmup");
  // Suggestions target working sets — warm-ups follow their own logic.
  const showSuggest = suggest && set.kind !== "warmup";
  // Display values: logged numbers, else the suggested (or last-time) prefill.
  const dispWeight = set.weight || (showSuggest ? suggest.weight : ghost?.weight) || 0;
  const dispReps = set.reps || (showSuggest ? suggest.reps : ghost?.reps) || 0;
  const dispRir = set.rir ?? (showSuggest ? suggest.rir : ghost?.rir);

  /** Quick-log from the check square — completes with the displayed numbers. */
  async function toggle() {
    if (!set.isCompleted) {
      await updateSet(set.id, { weight: dispWeight, reps: dispReps });
    }
    const done = await toggleSetComplete(set.id);
    if (done) setJustLogged(true);
    onComplete(done);
  }

  // Editor takes over the row entirely (design: tap set to edit + log);
  // it morphs out of the row — starting at row height, not zero — and
  // collapses back into it on close.
  if (editing) {
    return (
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key="editor"
          className="-mx-[22px] overflow-hidden"
          initial={{ height: 48, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 48, opacity: 0 }}
          transition={{ height: EXPAND, opacity: { duration: 0.16, ease: "easeOut" } }}
        >
          <SetEditor
            set={set}
            initial={{ weight: dispWeight, reps: dispReps, rir: dispRir ?? 2 }}
            reason={showSuggest && !set.isCompleted ? t(SUGGEST_REASON_KEY[suggest.reason]) : undefined}
            equipment={equipment}
            exerciseId={exerciseId}
            ghost={ghost}
            lastSets={lastSets}
            lastDate={lastDate}
            recovery={recovery}
            suggest={showSuggest && !set.isCompleted ? suggest : undefined}
            onCancel={onCloseEdit}
            onCommit={async (v) => {
              await updateSet(set.id, { weight: v.weight, reps: v.reps, rir: v.rir });
              if (!set.isCompleted) {
                const done = await toggleSetComplete(set.id);
                if (done) setJustLogged(true);
                onComplete(done);
              }
              onCloseEdit();
            }}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Set-type + delete moved into the editor; the badge is now a plain
  // indicator and a tap anywhere on the row opens the editor.
  const Badge = (
    <span
      className={`flex h-[26px] w-[26px] items-center justify-center font-display text-[12px] font-extrabold ${
        badgeHot ? "bg-accentSoft text-accent" : "bg-chip text-ink2"
      }`}
    >
      {badgeLabel}
    </span>
  );

  // ---- COMPLETED: compact summary row (tap to revise, check to un-complete) ----
  if (set.isCompleted) {
    const beatGhost = ghost ? set.weight * set.reps > ghost.weight * ghost.reps : false;
    const underGhost = ghost ? set.weight * set.reps < ghost.weight * ghost.reps : false;
    const e1rm = set.kind !== "warmup" && set.weight > 0 ? Math.round(OneRM.epley(set.weight, set.reps)) : null;
    return (
      <AnimatePresence initial={false} mode="wait">
      <motion.div
        key="done"
        role="button"
        tabIndex={0}
        onClick={onEdit}
        onKeyDown={(e) => e.key === "Enter" && onEdit()}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: FADE_FAST }}
        transition={{ duration: 0.15 }}
        className={`flex cursor-pointer items-center border-b border-hairline py-[11px] ${justLogged ? "animate-logflash" : ""}`}
      >
        <div className="w-[30px]">{Badge}</div>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="font-display text-[15px] font-bold tabular-nums text-ink">
            {set.weight}
            <span className="ml-0.5 text-[10px] font-bold text-ink3">{unit}</span>
            <span className="mx-1">×</span>
            {set.reps}
          </span>
          {set.rir != null ? (
            <span className={`font-display text-[11px] font-bold ${rirColorClass(set.rir)}`}>RIR {set.rir}</span>
          ) : null}
          {e1rm ? <span className="mono-num text-[11px] font-semibold text-ink3">~{e1rm}</span> : null}
          {beatGhost ? <ArrowUp size={10} strokeWidth={3} className="text-ok" /> : null}
          {underGhost ? <ArrowDown size={10} strokeWidth={3} className="text-fade" /> : null}
        </div>
        <button
          type="button"
          aria-label={t("un-complete set")}
          onClick={(e) => { e.stopPropagation(); void toggle(); }}
          className="flex h-[22px] w-[22px] items-center justify-center bg-ink text-white"
        >
          <Check size={12} strokeWidth={3} />
        </button>
      </motion.div>
      </AnimatePresence>
    );
  }

  // ---- PENDING / CURRENT: display row — tap to open the editor ----
  return (
    <AnimatePresence initial={false} mode="wait">
    <motion.div
      key="pending"
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => e.key === "Enter" && onEdit()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: FADE_FAST }}
      transition={{ duration: 0.15 }}
      className="grid cursor-pointer grid-cols-[30px_1fr_1fr_64px_70px_30px] items-center gap-1.5 border-b border-hairline py-[11px]"
      style={
        active
          ? { background: "linear-gradient(90deg, transparent 0%, #F3DCCF 50%, transparent 100%)" }
          : undefined
      }
    >
      <div>{Badge}</div>
      <span className={`font-display text-[16px] font-bold tabular-nums ${active ? "text-ink" : "text-ink3"}`}>
        {dispWeight || "—"}
        {dispWeight ? <span className="ml-0.5 text-[10px] font-semibold text-ink3">{unit}</span> : null}
      </span>
      <span className={`font-display text-[16px] font-bold tabular-nums ${active ? "text-ink" : "text-ink3"}`}>
        {dispReps || "—"}
      </span>
      <span
        className={`text-[11px] font-bold tabular-nums ${
          set.rir != null ? rirColorClass(set.rir) : dispRir != null ? "text-ink3" : "text-ink3/60"
        }`}
      >
        {dispRir != null ? `RIR ${dispRir}` : "—"}
      </span>
      {ghost ? (
        <span className="text-right leading-tight">
          <span className="mono-num block text-[11px] tabular-nums text-ink2">{ghost.weight}×{ghost.reps}</span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.06em] text-ink3">{t("prev")}</span>
        </span>
      ) : (
        <span className="text-right text-ink3/40">·</span>
      )}
      <button
        type="button"
        aria-label={t("complete set")}
        onClick={(e) => { e.stopPropagation(); void toggle(); }}
        className="flex h-[22px] w-[22px] items-center justify-center justify-self-end"
      >
        {active ? (
          <span className="grid h-[22px] w-[22px] place-items-center border-2 border-accent">
            <span className="h-2 w-2 bg-accent" />
          </span>
        ) : (
          <span className="h-[22px] w-[22px] border border-rule" />
        )}
      </button>
    </motion.div>
    </AnimatePresence>
  );
}

/** Plate tier → mini visual block size for the editor's per-side strip. */
function plateBlock(p: number, maxPlate: number): { w: number; h: number } {
  const f = p / maxPlate;
  return { w: Math.round(7 + f * 7), h: Math.round(18 + f * 34) };
}

/** "102,5" / "102.5" → 102.5; empty or junk → null. */
function parseDecimal(s: string): number | null {
  const trimmed = s.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Inline dark set editor (design: "Logging set"). Replaces the row — typed
 * weight/reps inputs, RIR dropdown, last-time/recovery/trend context strip
 * with an e1RM sparkline, per-side plate breakdown on barbell lifts, one Log tap.
 */
function SetEditor({
  set,
  initial,
  reason,
  equipment,
  exerciseId,
  ghost,
  lastSets,
  lastDate,
  recovery,
  suggest,
  onCommit,
  onCancel,
}: {
  set: WorkoutSet;
  initial: { weight: number; reps: number; rir: number | undefined };
  reason?: string;
  equipment?: string;
  exerciseId?: ID;
  ghost?: WorkoutSet;
  lastSets: WorkoutSet[];
  lastDate?: number;
  recovery?: { code: string; pct: number };
  suggest?: SetSuggestion;
  onCommit: (v: { weight: number; reps: number; rir: number | undefined }) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const unit = weightUnit();
  const [weight, setWeight] = useState(initial.weight ? String(initial.weight) : "");
  const [reps, setReps] = useState(initial.reps ? String(initial.reps) : "");
  const [rir, setRir] = useState<number | undefined>(initial.rir);
  const [rirOpen, setRirOpen] = useState(false);

  const weightNum = parseDecimal(weight);
  const repsNum = parseDecimal(reps);
  const valid =
    weightNum != null && weightNum >= 0 && repsNum != null && Number.isInteger(repsNum) && repsNum >= 0;

  // e1RM history for the inline trend — only queried while the editor is open,
  // and deferred until the expand animation has settled so the full-history
  // scan can't steal frames from it.
  const [historyReady, setHistoryReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = window.setTimeout(() => {
      setHistoryReady(true);
      // If the editor opened near the bottom edge, nudge it fully into view
      // (only scrolls when needed) — after the expand, never during it.
      rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 380);
    return () => window.clearTimeout(h);
  }, []);
  const seriesRaw = useLiveQuery(
    () => (historyReady && exerciseId ? exerciseE1RMSeries(exerciseId) : Promise.resolve(null)),
    [historyReady, exerciseId],
  );
  // null/undefined = still loading — render nothing rather than flashing
  // the "no history" hint at exercises that do have history.
  const seriesKnown = Array.isArray(seriesRaw);
  const series = seriesKnown ? seriesRaw : ([] as Point[]);
  const recent = series.slice(-10);
  const velocity = Performance.velocity(series);
  const velPerMonth = velocity ? Math.round(velocity.unitsPerMonth * 10) / 10 : null;

  // Typed weight vs the lined-up set from last session.
  const delta =
    ghost && weightNum != null && weightNum !== ghost.weight
      ? Math.round((weightNum - ghost.weight) * 100) / 100
      : null;

  const bar = unit === "kg" ? 20 : 45;
  const maxPlate = unit === "kg" ? 25 : 45;
  const plateWeight = weightNum ?? 0;
  const breakdown =
    equipment === "barbell" && plateWeight > bar
      ? plates(plateWeight, bar, unit === "kg" ? STANDARD_KG_PLATES : STANDARD_LB_PLATES).perSide
      : [];
  const grouped: { plate: number; count: number }[] = [];
  for (const p of breakdown) {
    const last = grouped[grouped.length - 1];
    if (last && last.plate === p) last.count += 1;
    else grouped.push({ plate: p, count: 1 });
  }

  const rirTint = rirPaint(rir);
  // appearance-none + rounded-none: iOS Safari otherwise rounds the inputs,
  // leaving them visibly mismatched against the square RIR button.
  const inputClass =
    "mt-1.5 block h-11 w-full appearance-none rounded-none border border-white/15 bg-white/[0.08] text-center font-display text-[22px] font-extrabold tabular-nums tracking-[-0.6px] text-white outline-none focus:border-accent";

  return (
    <div ref={rootRef} className="bg-ink px-[22px] py-4 text-white">
      <div className="mb-3.5 flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
          {set.isCompleted ? t("Revise set") : t("Logging set")}
          {reason ? <span className="ml-2 font-semibold normal-case tracking-normal text-white/55">{reason}</span> : null}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/55"
        >
          {t("Cancel")}
        </button>
      </div>

      {/* Set type — moved here from the row badge so it's editable in context. */}
      <div className="mb-3.5 -mx-[22px] flex gap-1.5 overflow-x-auto px-[22px] pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none]">
        {SET_KINDS.map((k) => {
          const on = set.kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => void updateSet(set.id, { kind: k })}
              className={`shrink-0 appearance-none border px-2.5 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.08em] ${
                on ? "border-accent bg-accent text-white" : "border-white/15 text-white/55 active:border-white/40"
              }`}
            >
              {t(KIND_LABEL[k])}
            </button>
          );
        })}
      </div>

      <FadeSlide delay={0.06}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor={`w-${set.id}`} className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">
              {t("Weight")} <span className="text-white/35">{unit}</span>
            </label>
            <input
              id={`w-${set.id}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onFocus={(e) => e.target.select()}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`r-${set.id}`} className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">
              {t("Reps")}
            </label>
            <input
              id={`r-${set.id}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              onFocus={(e) => e.target.select()}
              className={inputClass}
            />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">RIR</p>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={rirOpen}
              onClick={() => setRirOpen(true)}
              className={`relative mt-1.5 flex h-11 w-full appearance-none items-center justify-center rounded-none border bg-white/[0.08] font-display text-[22px] font-extrabold tabular-nums tracking-[-0.6px] ${
                rir != null ? `${rirTint.ring} ${rirTint.text}` : "border-white/15 text-white/45"
              }`}
            >
              {rir != null ? (rir >= 4 ? "4+" : rir) : "—"}
              <ChevronDown size={14} strokeWidth={2.5} className="absolute right-2 text-white/45" />
            </button>
          </div>
        </div>

        {suggest && !set.isCompleted ? (
          <button
            type="button"
            onClick={() => {
              setWeight(String(suggest.weight));
              setReps(String(suggest.reps));
              if (suggest.rir != null) setRir(suggest.rir);
            }}
            className="mt-2.5 inline-flex items-center gap-1.5 border border-white/20 px-2 py-1 active:border-accent"
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/45">{t("Suggested")}</span>
            <span className="mono-num text-[11px] font-bold tabular-nums text-white/80">
              {suggest.weight}×{suggest.reps}
              {suggest.rir != null ? ` @${suggest.rir}` : ""}
            </span>
          </button>
        ) : null}
      </FadeSlide>

      {/* Context strip: last session, recovery, e1RM trend + sparkline.
          Always rendered — placeholders make the feature discoverable on
          fresh exercises instead of silently disappearing. */}
      <div className="mt-3.5 border-t border-white/10 pt-3">
        <div className="grid grid-cols-3 gap-3">
          <FadeSlide delay={0.16}>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">{t("Last")}</p>
            {lastSets.length ? (
              <>
                <p className="mono-num mt-0.5 text-[12px] font-bold tabular-nums text-white">{lastSummary(lastSets)}</p>
                <p className="mt-0.5 text-[9px] text-white/45">
                  {lastDate != null ? relativeDay(lastDate, i18n.language) : ""}
                  {delta != null ? (
                    <span className={`ml-1.5 font-bold ${delta > 0 ? "text-ok" : "text-fade"}`}>
                      {delta > 0 ? "+" : ""}
                      {delta} {unit}
                    </span>
                  ) : null}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-[12px] text-white/35">—</p>
            )}
          </FadeSlide>
          <FadeSlide delay={0.22}>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">{t("Recovery")}</p>
            {recovery ? (
              <>
                <p className={`mt-0.5 text-[12px] font-bold tabular-nums ${recoveryColor(recovery.pct)}`}>
                  {recovery.code} {recovery.pct}%
                </p>
                <span className="mt-1 block h-[3px] w-12 overflow-hidden bg-white/15">
                  <motion.span
                    className={`block h-full ${recoveryBarClass(recovery.pct)}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, recovery.pct))}%` }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
                  />
                </span>
              </>
            ) : (
              <p className="mt-0.5 text-[12px] text-white/35">—</p>
            )}
          </FadeSlide>
          <FadeSlide delay={0.28}>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">{t("Trend")}</p>
            {velPerMonth != null ? (
              <p
                className={`mt-0.5 text-[12px] font-bold tabular-nums ${
                  velPerMonth > 0 ? "text-ok" : velPerMonth < 0 ? "text-fade" : "text-white/70"
                }`}
              >
                {velPerMonth > 0 ? "+" : ""}
                {velPerMonth}/{t("mo")}
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] text-white/35">—</p>
            )}
          </FadeSlide>
        </div>
        {seriesKnown ? (
          <FadeSlide className="mt-2.5">
            {recent.length >= 2 ? (
              <Sparkline
                points={recent}
                height={44}
                areaClass="fill-white/[0.06]"
                strokeClass="stroke-accent"
                dotClass="fill-white/70"
              />
            ) : (
              <p className="border-t border-dashed border-white/15 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/30">
                {t("No history yet")}
              </p>
            )}
          </FadeSlide>
        ) : null}
      </div>

      {/* Per-side plate breakdown — barbell lifts only */}
      {grouped.length > 0 && (
        <div className="mt-3.5 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/55">
              {t("Per side")} · {bar} {unit} {t("bar")}
            </p>
            <p className="mono-num text-[10px] tabular-nums text-white/70">
              {grouped.map((g) => `${g.count}×${g.plate}`).join(" · ")}
            </p>
          </div>
          <div className="flex items-end gap-[3px]">
            {breakdown.map((p, i) => {
              const { w, h } = plateBlock(p, maxPlate);
              return (
                <motion.span
                  key={i}
                  className="grid shrink-0 origin-bottom place-items-center bg-accent font-display text-[10px] font-extrabold tabular-nums text-ink [text-orientation:mixed] [writing-mode:vertical-rl]"
                  style={{ width: `${w}px`, height: `${h}px` }}
                  initial={{ opacity: 0, scaleY: 0.4 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}
                >
                  {p}
                </motion.span>
              );
            })}
          </div>
        </div>
      )}

      <motion.button
        type="button"
        disabled={!valid}
        onClick={() => valid && onCommit({ weight: weightNum, reps: repsNum, rir })}
        whileTap={{ scale: 0.97 }}
        className="mt-3.5 w-full bg-accent py-3.5 font-display text-[13px] font-extrabold uppercase tracking-[0.14em] text-white disabled:opacity-40"
      >
        {set.isCompleted ? t("Save") : t("Log")}
        {valid ? ` ${weightNum} × ${repsNum}` : ""}
      </motion.button>

      <button
        type="button"
        onClick={() => {
          void deleteSet(set.id);
          onCancel();
        }}
        className="mt-3 w-full py-2 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 active:text-bad"
      >
        {t("Delete set")}
      </button>

      <RIRPickerSheet open={rirOpen} value={rir} onChange={setRir} onClose={() => setRirOpen(false)} />
    </div>
  );
}
