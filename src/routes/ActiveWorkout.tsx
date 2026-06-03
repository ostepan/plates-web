import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, ChevronDown, Lightbulb, Minus, Plus, Trash2, X } from "lucide-react";
import { db } from "@core/db/db";
import {
  addSet, deleteSet, discardSession, finishSession, lastCompletedSets, updateSet,
} from "@core/db/mutations";
import { bestE1RMByExercise } from "@core/db/queries";
import { muscleRecovery } from "@core/db/recovery";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import type { SetKind } from "@core/models/enums";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import type { RecoveryVerdict } from "@core/calc/recovery";
import { OneRM } from "@core/calc/oneRM";
import { STANDARD_KG_PLATES, STANDARD_LB_PLATES, plates } from "@core/calc/plate";
import { supersetBadge } from "@core/superset";
import { formatDuration, localizedExerciseName, weightUnit } from "@app/lib/format";
import { useRestTimer } from "@app/hooks/useRestTimer";

interface Block {
  sxId: ID;
  exercise?: Exercise;
  sets: WorkoutSet[];
  ghost: WorkoutSet[];
  restSeconds: number;
  pr?: number;
  target?: { sets: number; min: number; max: number };
  supersetGroupId?: string;
}

const SET_KINDS: SetKind[] = ["working", "warmup", "dropset", "amrap", "restPause", "myoReps"];
const KIND_ABBR: Record<SetKind, string> = {
  working: "", warmup: "W", dropset: "D", amrap: "A", restPause: "RP", myoReps: "M",
};
const KIND_LABEL: Record<SetKind, string> = {
  working: "Working", warmup: "Warm-up", dropset: "Drop set", amrap: "AMRAP", restPause: "Rest-pause", myoReps: "Myo-reps",
};

/** RIR text color → matches the Iron RIRStyle scale (0 redlined → 4 fresh). */
function rirColorClass(rir: number | undefined): string {
  if (rir == null || Number.isNaN(rir)) return "text-ink3";
  if (rir <= 0) return "text-bad";
  if (rir === 1) return "text-fade";
  if (rir === 2) return "text-warn";
  if (rir === 3) return "text-ok/80";
  return "text-ok";
}
/** Same scale as hex, for use on the dark set editor. */
const RIR_HEX = ["#C64D2A", "#D97E3E", "#D4A544", "#9BA85A", "#3FA055"];
const rirHex = (r: number | undefined) =>
  r == null ? "#FFFFFF" : RIR_HEX[Math.min(4, Math.max(0, Math.floor(r)))];

const RECOVERY_TEXT: Record<RecoveryVerdict, string> = {
  ready: "text-ok", acceptable: "text-info", caution: "text-warn", notRecommended: "text-fade", avoid: "text-bad",
};

export function ActiveWorkout() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const rest = useRestTimer();
  const [restTotal, setRestTotal] = useState(0);
  const unit = weightUnit();

  const [openCues, setOpenCues] = useState<Set<ID>>(() => new Set());
  const [collapsedEx, setCollapsedEx] = useState<Set<ID>>(() => new Set());
  const [editingSetId, setEditingSetId] = useState<ID | null>(null);

  const toggle = (set: Set<ID>, id: ID) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const recovery = useLiveQuery(() => muscleRecovery(), [], []);
  const blocks = useLiveQuery(
    async (): Promise<Block[]> => {
      const sess = await db.sessions.get(sessionId);
      const res = sess?.routineId
        ? await db.routineExercises.where("routineId").equals(sess.routineId).toArray()
        : [];
      const targetByEx = new Map(res.map((r) => [r.exerciseId, r]));
      const sxs = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray()).sort(
        (a, b) => a.order - b.order,
      );
      const prMap = await bestE1RMByExercise(
        sxs.map((sx) => sx.exerciseId).filter((x): x is ID => !!x),
        sessionId,
      );
      return Promise.all(
        sxs.map(async (sx) => {
          const exercise = sx.exerciseId ? await db.exercises.get(sx.exerciseId) : undefined;
          const sets = (await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray()).sort(
            (a, b) => a.order - b.order,
          );
          const ghost = sx.exerciseId ? await lastCompletedSets(sx.exerciseId, sessionId) : [];
          const re = sx.exerciseId ? targetByEx.get(sx.exerciseId) : undefined;
          return {
            sxId: sx.id, exercise, sets, ghost,
            restSeconds: exercise?.defaultRestSeconds ?? 120,
            pr: sx.exerciseId ? prMap.get(sx.exerciseId) : undefined,
            target: re ? { sets: re.targetSets, min: re.targetRepsMin, max: re.targetRepsMax } : undefined,
            supersetGroupId: sx.supersetGroupID,
          };
        }),
      );
    },
    [sessionId],
    [] as Block[],
  );

  const recByMuscle = new Map(recovery.map((r) => [r.muscleGroup, r]));

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(Math.round((Date.now() - session.createdAt) / 1000));
    tick();
    const h = window.setInterval(tick, 1000);
    return () => window.clearInterval(h);
  }, [session]);

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
  const currentIdx = firstIncomplete === -1 ? blocks.length - 1 : firstIncomplete;
  const currentExercise = firstIncomplete === -1 ? blocks.length : firstIncomplete + 1;
  const nextBlock = blocks[currentIdx + 1];
  const volLabel = volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : String(Math.round(volume));

  async function finish() {
    await finishSession(sessionId);
    navigate(`/summary/${sessionId}`, { replace: true });
  }
  async function discard() {
    if (!confirm(t("Discard workout") + "?")) return;
    await discardSession(sessionId);
    navigate("/workout", { replace: true });
  }
  function startRest(seconds: number) {
    setRestTotal(seconds);
    rest.start(seconds);
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      {/* Sticky header */}
      <header className="border-b border-rule px-[22px] pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => void discard()}
            aria-label={t("Discard workout")}
            className="grid h-10 w-10 place-items-center bg-ink text-white"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
          <button type="button" onClick={() => void finish()} className="bg-accent px-5 py-2.5 text-white">
            <span className="eyebrow text-[12px]">{t("FINISH")}</span>
          </button>
        </div>
        <div className="mt-2.5 flex items-end justify-between">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {t("LIVE")}
            </p>
            <h1 className="display-title text-[24px] text-ink">{session.routineNameSnapshot || t("Workout")}</h1>
          </div>
          <div className="text-right">
            <p className="mono-num text-[24px] font-bold text-ink">{formatDuration(elapsed)}</p>
            <p className="eyebrow text-ink3 text-[9px]">{t("ELAPSED")}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 border-b border-rule">
        <GridStat label={t("SETS")} value={`${completed}/${totalSets}`} />
        <GridStat label={t("VOLUME")} value={volLabel} />
        <GridStat label={t("EXERCISE")} value={`${currentExercise}/${blocks.length}`} last />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-40">
        {blocks.map((b, bi) => {
          const exDone = b.sets.length > 0 && b.sets.every((s) => s.isCompleted);
          const isCurrent = bi === currentIdx && !exDone;
          const isFuture = bi > currentIdx;
          // Done exercises start collapsed; tapping the header opens them.
          const showCollapsed = exDone && !collapsedEx.has(`open:${b.sxId}` as ID);
          const activeSetId = isCurrent ? b.sets.find((s) => !s.isCompleted)?.id : undefined;
          const rec = b.exercise ? recByMuscle.get(b.exercise.muscleGroup) : undefined;
          const top = b.sets.length ? Math.max(...b.sets.map((s) => s.weight)) : 0;
          const blockVol = b.sets.reduce((v, s) => v + s.weight * s.reps, 0);
          const badge = supersetBadge(blocks.map((x) => ({ supersetGroupId: x.supersetGroupId })), bi);

          return (
            <section key={b.sxId} className="border-b border-rule">
              {/* Header */}
              <button
                type="button"
                disabled={!exDone}
                onClick={() => exDone && setCollapsedEx((s) => toggle(s, `open:${b.sxId}` as ID))}
                className={`w-full px-[22px] pt-4 pb-1.5 text-left ${isCurrent ? "bg-accentSoft" : ""} ${
                  exDone ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-2.5">
                    <span className="mono-num text-[13px] font-bold text-ink3">{String(bi + 1).padStart(2, "0")}</span>
                    {badge && (
                      <span className="mono-num self-center border border-accent px-1 text-[10px] font-bold text-accent">{badge.label}</span>
                    )}
                    <span className={`font-display text-[19px] font-extrabold leading-tight ${isFuture ? "text-ink2" : "text-ink"}`}>
                      {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
                    </span>
                    {b.exercise?.userNotes ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={t("Form cues")}
                        onClick={(e) => { e.stopPropagation(); setOpenCues((s) => toggle(s, b.sxId)); }}
                        className={`self-center ${openCues.has(b.sxId) ? "text-fade" : "text-ink3"}`}
                      >
                        <Lightbulb size={14} strokeWidth={2.25} />
                      </span>
                    ) : null}
                  </div>
                  {exDone ? (
                    <span className="eyebrow flex shrink-0 items-center gap-1 text-ok">
                      <Check size={12} strokeWidth={3} /> {t("DONE")}
                      <ChevronDown
                        size={13}
                        strokeWidth={2.5}
                        className={`text-ink3 transition-transform ${showCollapsed ? "" : "rotate-180"}`}
                      />
                    </span>
                  ) : isCurrent ? (
                    <span className="eyebrow shrink-0 text-accent">● {t("NOW")}</span>
                  ) : (
                    <span className="eyebrow shrink-0 text-ink3">{t("UP NEXT")}</span>
                  )}
                </div>
                <div className="mt-1.5 ml-[26px] flex items-center gap-3.5 text-[11px] text-ink2">
                  {b.target && (
                    <span>
                      <span className="eyebrow mr-1 text-ink3 text-[9px]">{t("TGT")}</span>
                      <b className="font-display text-ink">
                        {b.target.sets}×{b.target.min}{b.target.min !== b.target.max ? `–${b.target.max}` : ""}
                      </b>
                    </span>
                  )}
                  {b.pr ? (
                    <span>
                      <span className="eyebrow mr-1 text-ink3 text-[9px]">{t("PR")}</span>
                      <b className="font-display text-ink">{Math.round(b.pr)}</b>
                    </span>
                  ) : null}
                  {rec && (
                    <span className={`mono-num ml-auto font-bold ${RECOVERY_TEXT[rec.verdict]}`}>
                      {t(MUSCLE_I18N_KEY[rec.muscleGroup]).slice(0, 3).toUpperCase()} {Math.round(rec.recoveryPercentage)}%
                    </span>
                  )}
                </div>
              </button>

              {b.exercise?.userNotes && openCues.has(b.sxId) ? (
                <p className="mx-[22px] mt-2.5 border border-fade bg-card px-3 py-2 text-[13px] leading-relaxed text-ink2 whitespace-pre-line">
                  <b className="text-ink">{t("Form cue")}.</b> {b.exercise.userNotes}
                </p>
              ) : null}

              {showCollapsed ? (
                <button
                  type="button"
                  onClick={() => setCollapsedEx((s) => toggle(s, `open:${b.sxId}` as ID))}
                  className="flex w-full items-center gap-4 px-[22px] pb-4 pt-1 pl-[48px] text-left text-[11px] text-ink2"
                >
                  <span>{t("Top")} <b className="font-display text-ink">{top} × {b.sets.at(-1)?.reps ?? 0}</b></span>
                  <span>{t("Vol")} <b className="font-display text-ink">{blockVol >= 1000 ? `${(blockVol / 1000).toFixed(1)}k` : Math.round(blockVol)}</b></span>
                  <span className="eyebrow ml-auto text-ink3 text-[9px]">{t("Tap to revise")} ↓</span>
                </button>
              ) : (
                <div className="px-[22px] pb-3">
                  <div className="grid grid-cols-[1.9rem_1fr_1fr_3rem_3.6rem_1.9rem] items-center gap-1.5 border-b border-hairline py-1.5">
                    <span className="eyebrow text-ink3 text-[9px]">{t("SET")}</span>
                    <span className="eyebrow text-ink3 text-[9px]">{unit.toUpperCase()}</span>
                    <span className="eyebrow text-ink3 text-[9px]">{t("REPS")}</span>
                    <span className="eyebrow text-ink3 text-[9px]">{t("RIR")}</span>
                    <span className="eyebrow text-right text-ink3 text-[9px]">{t("LAST")}</span>
                    <span />
                  </div>
                  {b.sets.map((s, i) =>
                    editingSetId === s.id ? (
                      <SetEditor
                        key={s.id}
                        set={s}
                        index={i}
                        ghost={b.ghost[i]}
                        unit={unit}
                        onClose={() => setEditingSetId(null)}
                        onLogged={() => { setEditingSetId(null); startRest(b.restSeconds); }}
                      />
                    ) : s.isCompleted ? (
                      <DoneRow
                        key={s.id}
                        set={s}
                        index={i}
                        ghost={b.ghost[i]}
                        onTap={() => setEditingSetId(s.id)}
                      />
                    ) : (
                      <PendingRow
                        key={s.id}
                        set={s}
                        index={i}
                        ghost={b.ghost[i]}
                        active={s.id === activeSetId}
                        onTap={() => setEditingSetId(s.id)}
                      />
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => void addSet(b.sxId)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 border border-dashed border-rule py-2 text-ink2 active:bg-chip"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                    <span className="eyebrow text-[11px]">{t("Add set")}</span>
                  </button>
                </div>
              )}
            </section>
          );
        })}

        <div className="px-[22px] pt-5">
          <button
            type="button"
            onClick={() => void finish()}
            className="flex w-full items-center justify-center gap-2.5 bg-ink py-4 text-white"
          >
            <span className="eyebrow text-[13px]">{t("FINISH WORKOUT")}</span>
          </button>
        </div>
      </div>

      {rest.running && (
        <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t-2 border-accent bg-ink px-[18px] py-3 text-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="shrink-0">
            <p className="eyebrow text-accent">{t("REST")}</p>
            <p className="mono-num text-[22px] font-bold leading-none">{formatDuration(rest.remaining)}</p>
          </div>
          <div className="relative h-1 flex-1 overflow-hidden bg-white/20">
            <div
              className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500 ease-linear"
              style={{ width: `${restTotal ? (rest.remaining / restTotal) * 100 : 0}%` }}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => rest.adjust(-15)} className="mono-num text-[12px] text-white/70">−15</button>
            <button type="button" onClick={() => rest.adjust(15)} className="mono-num text-[12px] text-white/70">+15</button>
          </div>
          {nextBlock?.exercise && (
            <div className="hidden shrink-0 text-right text-[10px] leading-tight text-white/60 min-[400px]:block">
              {t("Next")}
              <br />
              <span className="font-bold text-white">{localizedExerciseName(nextBlock.exercise, i18n.language)}</span>
            </div>
          )}
          <button type="button" onClick={rest.stop} className="shrink-0 bg-accent px-3 py-2">
            <span className="eyebrow text-[10px]">{t("SKIP")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function GridStat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`px-[22px] py-2.5 ${last ? "" : "border-r border-rule"}`}>
      <p className="eyebrow text-ink3 text-[9px]">{label}</p>
      <p className="mono-num text-[18px] font-bold text-ink">{value}</p>
    </div>
  );
}

/** Compact, collapsed completed set: weight × reps, RIR, est. 1RM, trend arrow. */
function DoneRow({ set, index, ghost, onTap }: { set: WorkoutSet; index: number; ghost?: WorkoutSet; onTap: () => void }) {
  const label = set.kind === "working" ? index + 1 : KIND_ABBR[set.kind];
  const e1rm = Math.round(OneRM.epley(set.weight, set.reps));
  const cur = set.weight * set.reps;
  const prev = ghost ? ghost.weight * ghost.reps : 0;
  const dir = !ghost ? "none" : cur > prev ? "up" : cur < prev ? "down" : "equal";
  return (
    <button
      type="button"
      onClick={onTap}
      className="flex w-full items-center gap-2.5 border-b border-hairline py-2.5 text-left"
    >
      <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-accentSoft font-display text-[12px] font-extrabold text-accent">
        {label}
      </span>
      <span className="flex flex-1 flex-wrap items-center gap-2 font-display text-[15px] font-bold text-ink">
        <span className="mono-num">
          {set.weight}<span className="ml-0.5 text-[10px] text-ink3">{weightUnit()}</span> × {set.reps}
        </span>
        {set.rir != null && <span className={`mono-num text-[11px] font-bold ${rirColorClass(set.rir)}`}>RIR {set.rir}</span>}
        {e1rm > 0 && <span className="mono-num text-[11px] font-semibold text-ink3">~{e1rm}</span>}
        {dir === "up" && <ArrowUp size={11} strokeWidth={3} className="text-ok" />}
        {dir === "down" && <ArrowDown size={11} strokeWidth={3} className="text-fade" />}
      </span>
      <span className="grid h-[22px] w-[22px] place-items-center bg-ink text-white">
        <Check size={12} strokeWidth={3} />
      </span>
    </button>
  );
}

/** Pending / current set row — tap anywhere to open the editor. */
function PendingRow({
  set, index, ghost, active, onTap,
}: { set: WorkoutSet; index: number; ghost?: WorkoutSet; active?: boolean; onTap: () => void }) {
  const { t } = useTranslation();
  const label = set.kind === "working" ? index + 1 : KIND_ABBR[set.kind];
  const hasWeight = set.weight > 0 || set.reps > 0;
  return (
    <button
      type="button"
      onClick={onTap}
      className={`grid w-full grid-cols-[1.9rem_1fr_1fr_3rem_3.6rem_1.9rem] items-center gap-1.5 border-b border-hairline py-2 text-left ${
        active ? "-mx-[22px] bg-gradient-to-r from-transparent via-accentSoft to-transparent px-[22px]" : ""
      }`}
    >
      <span
        className={`grid h-[26px] w-[26px] place-items-center rounded-full font-display text-[12px] font-extrabold ${
          active ? "bg-accentSoft text-accent" : set.kind !== "working" ? "border border-accent text-accent" : "border border-rule text-ink3"
        }`}
      >
        {label}
      </span>
      <span className={`mono-num text-[16px] font-bold ${hasWeight ? (active ? "text-ink" : "text-ink2") : "text-ink3/70"}`}>
        {set.weight || (ghost ? ghost.weight : 0)}
      </span>
      <span className={`mono-num text-[16px] font-bold ${hasWeight ? (active ? "text-ink" : "text-ink2") : "text-ink3/70"}`}>
        {set.reps || (ghost ? ghost.reps : 0)}
      </span>
      <span className={`mono-num text-[11px] font-bold ${rirColorClass(set.rir)}`}>
        {set.rir != null ? `RIR ${set.rir}` : "—"}
      </span>
      <span className="mono-num text-right text-[10px] leading-tight text-ink3">
        {ghost ? (
          <>
            {ghost.weight}×{ghost.reps}
            <br />
            <span className="eyebrow text-[8px]">{t("prev")}</span>
          </>
        ) : null}
      </span>
      <span className="flex justify-end">
        {active ? (
          <span className="grid h-[22px] w-[22px] place-items-center border-2 border-accent">
            <span className="h-2 w-2 bg-accent" />
          </span>
        ) : (
          <span className="h-[22px] w-[22px] border border-rule" />
        )}
      </span>
    </button>
  );
}

/** Dark inline editor — steppers + editable fields + plate stack + Log. */
function SetEditor({
  set, index, ghost, unit, onClose, onLogged,
}: {
  set: WorkoutSet;
  index: number;
  ghost?: WorkoutSet;
  unit: "kg" | "lb";
  onClose: () => void;
  onLogged: () => void;
}) {
  const { t } = useTranslation();
  // Seed from the set; fall back to ghost (last session) when blank.
  const [weight, setWeight] = useState(set.weight || ghost?.weight || 0);
  const [reps, setReps] = useState(set.reps || ghost?.reps || 0);
  const [rir, setRir] = useState<number>(set.rir ?? ghost?.rir ?? 2);
  const [kind, setKind] = useState<SetKind>(set.kind);
  const wStep = unit === "kg" ? 2.5 : 5;
  const wasDone = set.isCompleted;

  async function commit() {
    await updateSet(set.id, { weight, reps, rir, kind, isCompleted: true });
    if (wasDone) onClose();
    else onLogged();
  }
  async function markUndone() {
    await updateSet(set.id, { weight, reps, rir, kind, isCompleted: false });
    onClose();
  }
  async function remove() {
    await deleteSet(set.id);
    onClose();
  }

  const fields: { label: string; value: number; step: number; min: number; set: (v: number) => void; tint?: string }[] = [
    { label: t("Weight"), value: weight, step: wStep, min: 0, set: setWeight },
    { label: t("Reps"), value: reps, step: 1, min: 0, set: setReps },
    { label: t("RIR"), value: rir, step: 1, min: 0, set: (v) => setRir(Math.min(6, v)), tint: rirHex(rir) },
  ];

  return (
    <div className="-mx-[22px] my-1 bg-ink px-[22px] py-4 text-white">
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow text-accent">
          {set.kind === "working" ? `${t("SET")} ${index + 1}` : KIND_ABBR[set.kind]} · {wasDone ? t("EDIT") : t("LOGGING")}
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void remove()} aria-label={t("Delete")} className="text-white/55 active:text-bad">
            <Trash2 size={15} strokeWidth={2.25} />
          </button>
          <button type="button" onClick={onClose} className="eyebrow text-[11px] text-white/55">{t("Cancel")}</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {fields.map((f) => (
          <div key={f.label}>
            <p className="eyebrow text-[9px] text-white/55">{f.label}</p>
            <div className="mt-1.5 flex items-center gap-1">
              <button
                type="button"
                aria-label={`${f.label} −`}
                onClick={() => f.set(Math.max(f.min, +(f.value - f.step).toFixed(2)))}
                className="grid h-7 w-7 shrink-0 place-items-center bg-white/10 font-display text-[16px] font-extrabold text-white active:bg-white/20"
              >
                <Minus size={14} strokeWidth={2.75} />
              </button>
              <input
                inputMode="decimal"
                value={String(f.value)}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  f.set(Number.isFinite(n) ? Math.max(f.min, n) : 0);
                }}
                style={{ color: f.tint }}
                className="mono-num w-full min-w-0 bg-transparent text-center text-[22px] font-extrabold tracking-tight outline-none"
              />
              <button
                type="button"
                aria-label={`${f.label} +`}
                onClick={() => f.set(+(f.value + f.step).toFixed(2))}
                className="grid h-7 w-7 shrink-0 place-items-center bg-accent font-display text-[16px] font-extrabold text-white active:opacity-80"
              >
                <Plus size={14} strokeWidth={2.75} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Set kind */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SET_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
              k === kind ? "bg-accent text-white" : "bg-white/10 text-white/60"
            }`}
          >
            {KIND_ABBR[k] || t(KIND_LABEL[k])}
          </button>
        ))}
      </div>

      <DarkPlateStrip total={weight} unit={unit} />

      <button
        type="button"
        onClick={() => void commit()}
        className="mt-3.5 w-full bg-accent py-3.5 text-white"
      >
        <span className="eyebrow text-[13px]">
          {wasDone ? t("Save") : t("Log")} {weight} × {reps}
        </span>
      </button>
      {wasDone && (
        <button type="button" onClick={() => void markUndone()} className="mt-2 w-full py-1 text-center">
          <span className="eyebrow text-[10px] text-white/55">{t("Mark not done")}</span>
        </button>
      )}
    </div>
  );
}

/** Per-side plate breakdown, on the dark editor (accent plates on ink). */
function DarkPlateStrip({ total, unit }: { total: number; unit: "kg" | "lb" }) {
  const { t } = useTranslation();
  const bar = unit === "kg" ? 20 : 45;
  const available = unit === "kg" ? STANDARD_KG_PLATES : STANDARD_LB_PLATES;
  if (!total || total <= bar) return null;
  const { perSide, unloaded } = plates(total, bar, available);
  if (perSide.length === 0) return null;
  const counts = new Map<number, number>();
  for (const p of perSide) counts.set(p, (counts.get(p) ?? 0) + 1);
  const label = [...counts.entries()].map(([w, n]) => `${n}×${w}`).join(" · ");
  const maxW = Math.max(...available);
  return (
    <div className="mt-3.5 border-t border-white/10 pt-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow text-[9px] text-white/55">{`${bar} ${unit} ${t("bar")} · ${t("per side")}`}</span>
        <span className="mono-num text-[10px] text-white/70">
          {label}{unloaded > 0 ? ` · +${Math.round(unloaded)} ${t("off")}` : ""}
        </span>
      </div>
      <div className="flex items-end gap-[3px]">
        {perSide.map((w, i) => (
          <div
            key={i}
            className="flex items-center justify-center bg-accent text-white"
            style={{ width: 7 + (w / maxW) * 9, height: 18 + (w / maxW) * 34 }}
          >
            <span className="mono-num text-[8px] font-bold" style={{ writingMode: "vertical-rl" }}>{w}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
