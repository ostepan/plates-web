import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUp, Check, Lightbulb, Plus, Trophy, X } from "lucide-react";
import { db } from "@core/db/db";
import {
  addExerciseToSession, addSet, discardSession, finishSession, lastCompletedSets,
  toggleSetComplete, updateSet,
} from "@core/db/mutations";
import { ExercisePicker } from "@app/components/ExercisePicker";
import { exerciseE1RMPRs } from "@core/db/queries";
import { muscleRecovery } from "@core/db/recovery";
import { OneRM } from "@core/calc/oneRM";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import type { MuscleGroup, SetKind } from "@core/models/enums";
import { STANDARD_KG_PLATES, STANDARD_LB_PLATES, plates } from "@core/calc/plate";
import { supersetBadge } from "@core/superset";
import { formatDuration, localizedExerciseName, weightUnit } from "@app/lib/format";
import { useRestTimer } from "@app/hooks/useRestTimer";
import { RIRPickerSheet, RIRPill, rirPaint } from "@ui/components/RIRPicker";

interface Block {
  sxId: ID;
  exercise?: Exercise;
  sets: WorkoutSet[];
  ghost: WorkoutSet[];
  restSeconds: number;
  target?: { sets: number; min: number; max: number; weight?: number };
  supersetGroupId?: string;
}

/** Compact uppercase muscle code shown on exercise headers (e.g. CHE, SHO). */
const MUSCLE_CODE: Record<MuscleGroup, string> = {
  chest: "CHE", back: "BAC", shoulders: "SHO", biceps: "BIC", triceps: "TRI",
  forearms: "FOR", legs: "LEG", glutes: "GLU", calves: "CAL", abs: "ABS",
  cardio: "CAR", fullBody: "FBD",
};

/** Recovery-% → Iron readiness color (red <50, gold <75, green otherwise). */
function recoveryColor(pct: number): string {
  if (pct < 50) return "text-accent";
  if (pct < 75) return "text-warn";
  return "text-ok";
}

const e1rm = (w: number, r: number) => Math.round(OneRM.epley(w, r));

interface Meta {
  pr: Map<ID, number>;
  rec: Map<MuscleGroup, number>;
  week?: number;
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
            target: re
              ? { sets: re.targetSets, min: re.targetRepsMin, max: re.targetRepsMax, weight: re.targetWeight }
              : undefined,
            supersetGroupId: sx.supersetGroupID,
          };
        }),
      );
    },
    [sessionId],
    [] as Block[],
  );

  // PR / recovery / program-week are effectively static during a workout, so
  // load them once per exercise-set change instead of on every set write.
  const [meta, setMeta] = useState<Meta>();
  const exKey = blocks.map((b) => b.exercise?.id ?? "").join(",");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const ids = blocks.map((b) => b.exercise?.id).filter((x): x is ID => !!x);
      const [pr, recovery] = await Promise.all([exerciseE1RMPRs(ids, sessionId), muscleRecovery()]);
      const rec = new Map(recovery.map((r) => [r.muscleGroup, r.recoveryPercentage]));
      let week: number | undefined;
      const pdId = session?.programDayID;
      if (pdId) {
        const day = await db.programDays.get(pdId);
        const micro = day ? await db.microcycles.get(day.microcycleId) : undefined;
        week = micro ? micro.weekIndex + 1 : undefined;
      }
      if (alive) setMeta({ pr, rec, week });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exKey, session?.programDayID]);

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
  const currentIndex = firstIncomplete === -1 ? blocks.length : firstIncomplete + 1;
  const volumeLabel = volume >= 10_000 ? `${(volume / 1000).toFixed(1)}k` : Math.round(volume).toLocaleString();

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
    <div className="flex h-[100dvh] flex-col bg-bg font-sans">
      {/* ── Sticky header + stats ─────────────────────────────── */}
      <header className="border-b border-rule pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between px-[22px] pb-3 pt-1">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => void discard()}
              aria-label={t("Discard workout")}
              className="-ml-1.5 mt-0.5 grid h-7 w-7 place-items-center text-ink3 active:text-ink"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-eyebrow text-accent">
                <span className="inline-block h-[7px] w-[7px] rounded-full bg-accent" />
                {t("LIVE")}{meta?.week ? ` · ${t("Week")} ${meta.week}` : ""}
              </p>
              <h1 className="font-display text-[22px] font-black leading-[1.1] tracking-display2 text-ink">
                {session.routineNameSnapshot || t("Workout")}
              </h1>
            </div>
          </div>
          <div className="text-right">
            <p className="mono-num text-[22px] font-semibold leading-none tracking-tight text-ink">
              {formatDuration(elapsed)}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink3">{t("ELAPSED")}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-rule">
          <GridStat label={t("SETS")} value={`${completed} / ${totalSets}`} />
          <GridStat label={t("VOLUME")} value={volumeLabel} />
          <GridStat label={t("EXERCISE")} value={`${currentIndex} / ${blocks.length}`} last />
        </div>
      </header>

      {/* ── Scrollable exercise list ──────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        {blocks.map((b, bi) => {
          const isCurrent = bi + 1 === currentIndex;
          const allDone = b.sets.length > 0 && b.sets.every((s) => s.isCompleted);
          const activeSetId = isCurrent ? b.sets.find((s) => !s.isCompleted)?.id : undefined;
          const ssBadge = supersetBadge(blocks.map((x) => ({ supersetGroupId: x.supersetGroupId })), bi);
          const pr = b.exercise ? meta?.pr.get(b.exercise.id) : undefined;
          // New-PR set: the top completed working set whose e1RM beats the
          // record coming in (only flagged when there's an existing record).
          let prSetId: ID | undefined;
          if (pr != null) {
            let best = pr;
            for (const s of b.sets) {
              if (!s.isCompleted || s.kind !== "working" || s.weight <= 0 || s.reps <= 0) continue;
              const e = e1rm(s.weight, s.reps);
              if (e > best) { best = e; prSetId = s.id; }
            }
          }
          const mg = b.exercise?.muscleGroup;
          const recPct = mg ? (meta?.rec.has(mg) ? Math.round(meta.rec.get(mg)!) : 100) : undefined;
          const repTarget = b.target ? (b.target.min === b.target.max ? `${b.target.min}` : `${b.target.min}–${b.target.max}`) : "";
          const tgtText = b.target
            ? b.target.weight && b.target.weight > 0
              ? `${b.target.weight}×${b.target.min}`
              : `${b.target.sets}×${repTarget}`
            : "";

          return (
            <section key={b.sxId} className="border-b border-rule">
              {/* exercise header band */}
              <div className={`px-[22px] pb-2.5 pt-3.5 ${isCurrent ? "bg-accentSoft" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="font-display text-[14px] font-extrabold text-ink3">
                      {String(bi + 1).padStart(2, "0")}
                    </span>
                    {ssBadge && (
                      <span className="mono-num border border-accent px-1 text-[10px] font-bold text-accent">
                        {ssBadge.label}
                      </span>
                    )}
                    <span className="truncate font-display text-[20px] font-extrabold tracking-display2 text-ink">
                      {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
                    </span>
                    {b.exercise?.userNotes && (
                      <button
                        type="button"
                        onClick={() => toggleCues(b.sxId)}
                        aria-label={t("Form cues")}
                        aria-expanded={openCues.has(b.sxId)}
                        className={openCues.has(b.sxId) ? "text-warn" : "text-warn/70"}
                      >
                        <Lightbulb size={14} strokeWidth={2.25} />
                      </button>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-bold uppercase tracking-eyebrow ${isCurrent ? "text-accent" : "text-ink3"}`}
                  >
                    {isCurrent ? `● ${t("Now")}` : allDone ? t("Done") : t("Up next")}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                  {b.target && (
                    <span className="text-ink2">
                      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-ink3">{t("TGT")} </span>
                      <b className="font-display font-bold text-ink">{tgtText}</b>
                    </span>
                  )}
                  {pr != null && (
                    <span className="text-ink2">
                      <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-ink3">{t("PR")} </span>
                      <b className="font-display font-bold text-ink">{pr}</b>
                    </span>
                  )}
                  {recPct != null && mg && (
                    <span className={`ml-auto text-[10px] font-bold ${recoveryColor(recPct)}`}>
                      {MUSCLE_CODE[mg]} {recPct}%
                    </span>
                  )}
                </div>
              </div>

              {b.exercise?.userNotes && openCues.has(b.sxId) && (
                <p className="mx-[22px] mt-2 border-l-2 border-warn bg-warn/10 px-2.5 py-1.5 text-[13px] leading-relaxed text-ink2 whitespace-pre-line">
                  {b.exercise.userNotes}
                </p>
              )}

              <div className="px-[22px] pb-3">
                {/* column header */}
                <div className="grid grid-cols-[26px_1fr_1fr_3rem_3.6rem_2rem] items-center gap-2 border-b border-hairline pb-1.5 pt-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink3">{t("SET")}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink3">{t("WT")}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink3">{t("REPS")}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink3">{t("RIR")}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink3">{t("LAST")}</span>
                  <span />
                </div>
                {b.sets.map((s, i) => (
                  <SetRow
                    key={s.id}
                    set={s}
                    index={i}
                    ghost={b.ghost[i]}
                    active={s.id === activeSetId}
                    isPR={s.id === prSetId}
                    onComplete={(done) => done && rest.start(b.restSeconds)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => void addSet(b.sxId)}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 border border-dashed border-rule py-2.5 text-[11px] font-bold uppercase tracking-eyebrow text-ink2 active:bg-chip"
                >
                  <Plus size={13} strokeWidth={2.75} />
                  {t("Add set")}
                </button>
              </div>
            </section>
          );
        })}

        {/* add exercise mid-workout */}
        <div className="px-[22px] pt-4">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex w-full items-center justify-center gap-1.5 border border-dashed border-rule py-3 text-[11px] font-bold uppercase tracking-eyebrow text-ink2 active:bg-chip"
          >
            <Plus size={14} strokeWidth={2.75} />
            {t("Add exercise")}
          </button>
        </div>

        {/* finish */}
        <div className="px-[22px] pb-5 pt-4">
          {blocks.length > 0 ? (
            <button
              type="button"
              onClick={() => void finish()}
              className="flex w-full items-center justify-center gap-2 bg-ink py-4 text-white active:opacity-90"
            >
              <span className="font-display text-[13px] font-extrabold uppercase tracking-eyebrow">{t("Finish workout")}</span>
              <ArrowRight size={16} strokeWidth={2.75} />
            </button>
          ) : (
            <p className="py-8 text-center text-[13px] text-ink3">{t("Add an exercise to get started.")}</p>
          )}
        </div>
      </div>

      {picking && (
        <ExercisePicker
          onPick={(exerciseId) => {
            void addExerciseToSession(sessionId, exerciseId);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {rest.running && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-rule bg-ink px-5 py-3 text-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <RestRing remaining={rest.remaining} total={rest.total} />
            <span className="eyebrow text-[11px] text-white/55">{t("REST")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => rest.adjust(-15)}
              className="mono-num border border-white/20 px-2.5 py-1.5 text-[12px] font-semibold text-white/80 active:bg-white/10"
            >
              −15s
            </button>
            <button
              type="button"
              onClick={() => rest.adjust(15)}
              className="mono-num border border-white/20 px-2.5 py-1.5 text-[12px] font-semibold text-white/80 active:bg-white/10"
            >
              +15s
            </button>
            <button
              type="button"
              onClick={rest.stop}
              className="bg-accent px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-eyebrow text-white active:opacity-90"
            >
              {t("SKIP")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Countdown ring for the rest banner — accent arc depletes from a full circle
 * (12 o'clock start) to empty as the rest period ends, with the time centered.
 */
function RestRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 17;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  const nearDone = remaining <= 5;
  return (
    <div className="relative h-[52px] w-[52px]">
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3" className="stroke-white/15" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          className={`transition-[stroke-dashoffset] duration-300 ease-linear ${nearDone ? "stroke-warn" : "stroke-accent"}`}
        />
      </svg>
      <span className="mono-num absolute inset-0 grid place-items-center text-[13px] font-bold tabular-nums text-white">
        {formatDuration(remaining)}
      </span>
    </div>
  );
}

function GridStat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`px-[22px] py-2 ${last ? "" : "border-r border-rule"}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ink3">{label}</p>
      <p className="mono-num text-[16px] font-bold tracking-tight text-ink">{value}</p>
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

/** Per-side plate breakdown for the active set — the Iron vertical plate stack. */
function PlateStrip({ total }: { total: number }) {
  const { t } = useTranslation();
  const unit = weightUnit();
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
    <div className="-mx-[22px] mb-1.5 bg-accentSoft/60 px-[22px] py-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="eyebrow text-accentInk text-[9px]">{`${bar} ${unit} ${t("bar")} · ${t("per side")}`}</span>
        <span className="mono-num text-[10px] text-ink2">
          {label}{unloaded > 0 ? ` · +${Math.round(unloaded)} ${t("off")}` : ""}
        </span>
      </div>
      <div className="flex items-end gap-[3px]">
        {perSide.map((w, i) => (
          <div
            key={i}
            className="flex items-center justify-center bg-accent text-white"
            style={{ width: 6 + (w / maxW) * 10, height: 16 + (w / maxW) * 34 }}
          >
            <span className="mono-num text-[8px] font-bold" style={{ writingMode: "vertical-rl" }}>{w}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetRow({
  set,
  index,
  ghost,
  active,
  isPR,
  onComplete,
}: {
  set: WorkoutSet;
  index: number;
  ghost?: WorkoutSet;
  active?: boolean;
  isPR?: boolean;
  onComplete: (done: boolean) => void;
}) {
  const { t } = useTranslation();
  const unit = weightUnit();
  const [weight, setWeight] = useState(set.weight ? String(set.weight) : "");
  const [reps, setReps] = useState(set.reps ? String(set.reps) : "");
  const [menu, setMenu] = useState(false);
  const [rirOpen, setRirOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  // Follow the active set as sets get completed — center it in the scroll area.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  const rirVal = set.rir;
  const badgeLabel = set.kind === "working" ? String(index + 1) : KIND_ABBR[set.kind];
  const accentBadge = set.isCompleted || active || editing;

  const setBadge = (
    <div className="relative">
      <button
        type="button"
        aria-label={t("Set type")}
        onClick={() => setMenu((v) => !v)}
        className={`mono-num grid h-[26px] w-[26px] place-items-center text-[12px] font-extrabold ${
          accentBadge ? "bg-accentSoft text-accent" : "bg-chip text-ink3"
        }`}
      >
        {badgeLabel}
      </button>
      {menu && (
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
          </div>
        </>
      )}
    </div>
  );

  // ── Completed (collapsed) — tap to edit ──────────────────────
  if (set.isCompleted && !editing) {
    const e1 = e1rm(set.weight, set.reps);
    const ghostE1 = ghost ? e1rm(ghost.weight, ghost.reps) : 0;
    const improved = ghostE1 > 0 && e1 > ghostE1;
    const paint = rirPaint(rirVal);
    return (
      <div className="grid grid-cols-[26px_1fr_2rem] items-center gap-2 border-b border-hairline py-2.5">
        {setBadge}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 text-left"
        >
          <span className="font-display text-[15px] font-bold text-ink">
            {set.weight}<span className="text-[10px] font-bold text-ink3"> {unit}</span> × {set.reps}
          </span>
          {rirVal != null && (
            <span className={`text-[10px] font-bold uppercase ${paint.text}`}>{t("RIR")} {rirVal >= 4 ? "4+" : rirVal}</span>
          )}
          {e1 > 0 && (
            <span className="mono-num flex items-center gap-0.5 text-[11px] font-semibold text-ink3">
              ~{e1}
              {improved && !isPR && <ArrowUp size={11} strokeWidth={3} className="text-ok" />}
            </span>
          )}
          {isPR && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-eyebrow text-accent">
              <Trophy size={12} strokeWidth={2.5} />
              {t("PR")}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label="toggle set complete"
          onClick={async () => {
            const done = await toggleSetComplete(set.id);
            onComplete(done);
          }}
          className="grid h-[26px] w-[26px] place-items-center justify-self-end bg-ink text-white"
        >
          <Check size={15} strokeWidth={3} />
        </button>
      </div>
    );
  }

  // ── Pending (greyed, not yet the active set) — tap to edit ───
  if (!active && !editing) {
    return (
      <div
        className="grid grid-cols-[26px_1fr_1fr_3rem_3.6rem_2rem] items-center gap-2 border-b border-hairline py-2.5"
      >
        {setBadge}
        <button type="button" onClick={() => setEditing(true)} className="text-left">
          <span className="mono-num text-[16px] font-bold text-ink3">
            {set.weight || ghost?.weight || 0}<span className="text-[10px] font-semibold"> {unit}</span>
          </span>
        </button>
        <button type="button" onClick={() => setEditing(true)} className="text-left">
          <span className="mono-num text-[16px] font-bold text-ink3">{set.reps || ghost?.reps || 0}</span>
        </button>
        <button type="button" onClick={() => setEditing(true)} className="text-left text-[11px] font-medium text-ink3">
          {rirVal != null ? rirVal : "—"}
        </button>
        <GhostCell ghost={ghost} />
        <button
          type="button"
          aria-label="complete set"
          onClick={async () => {
            await updateSet(set.id, { weight: set.weight || ghost?.weight || 0, reps: set.reps || ghost?.reps || 0 });
            const done = await toggleSetComplete(set.id);
            onComplete(done);
          }}
          className="grid h-[26px] w-[26px] place-items-center justify-self-end border border-rule text-transparent"
        >
          <Check size={15} strokeWidth={3} />
        </button>
      </div>
    );
  }

  // ── Active / editing — full editable row ─────────────────────
  return (
    <>
      <div
        ref={rowRef}
        className={`grid grid-cols-[26px_1fr_1fr_3rem_3.6rem_2rem] items-center gap-2 border-b border-hairline py-2 ${
          active ? "-mx-[22px] bg-accentSoft px-[22px]" : ""
        }`}
      >
        {setBadge}
        <input
          inputMode="decimal"
          value={weight}
          placeholder={ghost ? String(ghost.weight) : "0"}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => void updateSet(set.id, { weight: parseFloat(weight) || 0 })}
          className="mono-num w-full border border-rule bg-card px-1.5 py-1.5 text-[15px] font-bold text-ink outline-none focus:border-ink placeholder:font-normal placeholder:text-ink3/60"
        />
        <input
          inputMode="numeric"
          value={reps}
          placeholder={ghost ? String(ghost.reps) : "0"}
          onChange={(e) => setReps(e.target.value)}
          onBlur={() => void updateSet(set.id, { reps: parseInt(reps, 10) || 0 })}
          className="mono-num w-full border border-rule bg-card px-1.5 py-1.5 text-[15px] font-bold text-ink outline-none focus:border-ink placeholder:font-normal placeholder:text-ink3/60"
        />
        <div className="flex justify-center">
          <RIRPill
            value={rirVal}
            onClick={() => setRirOpen(true)}
            ariaLabel={rirVal == null ? t("Set RIR") : `RIR ${rirVal >= 4 ? "4+" : rirVal}`}
          />
        </div>
        <GhostCell
          ghost={ghost}
          onCopy={() => {
            if (!ghost) return;
            setWeight(String(ghost.weight));
            setReps(String(ghost.reps));
            void updateSet(set.id, { weight: ghost.weight, reps: ghost.reps });
          }}
        />
        <button
          type="button"
          aria-label="complete set"
          onClick={async () => {
            await updateSet(set.id, { weight: parseFloat(weight) || 0, reps: parseInt(reps, 10) || 0 });
            const done = await toggleSetComplete(set.id);
            if (done) setEditing(false);
            onComplete(done);
          }}
          className={`grid h-[26px] w-[26px] place-items-center justify-self-end border ${
            set.isCompleted ? "border-ink bg-ink text-white" : "border-accent text-accent"
          }`}
        >
          <Check size={15} strokeWidth={3} />
        </button>
      </div>
      {active && <PlateStrip total={parseFloat(weight) || 0} />}
      <RIRPickerSheet
        open={rirOpen}
        value={rirVal}
        onChange={(next) => void updateSet(set.id, { rir: next })}
        onClose={() => setRirOpen(false)}
      />
    </>
  );
}

/** "95×10 / prev" last-session cell; tappable to copy when `onCopy` given. */
function GhostCell({ ghost, onCopy }: { ghost?: WorkoutSet; onCopy?: () => void }) {
  const { t } = useTranslation();
  if (!ghost) return <span className="text-[11px] text-ink3/40">·</span>;
  const body = (
    <>
      <span className="mono-num block text-[10px] leading-tight text-ink3">{ghost.weight}×{ghost.reps}</span>
      <span className="block text-[9px] font-semibold uppercase tracking-[0.06em] text-ink3">{t("prev")}</span>
    </>
  );
  return onCopy ? (
    <button type="button" aria-label={`${t("Last")} ${ghost.weight}×${ghost.reps}`} onClick={onCopy} className="text-right">
      {body}
    </button>
  ) : (
    <div className="text-right">{body}</div>
  );
}
