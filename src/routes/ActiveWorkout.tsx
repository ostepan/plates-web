import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, Lightbulb, MoreHorizontal, Plus } from "lucide-react";
import { db } from "@core/db/db";
import {
  addSet, discardSession, finishSession, lastCompletedSets, toggleSetComplete, updateSet,
} from "@core/db/mutations";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import type { SetKind } from "@core/models/enums";
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
  target?: { sets: number; min: number; max: number };
  supersetGroupId?: string;
}

export function ActiveWorkout() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const rest = useRestTimer();
  const unit = weightUnit();
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
            target: re ? { sets: re.targetSets, min: re.targetRepsMin, max: re.targetRepsMax } : undefined,
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
      <header className="border-b border-hairline px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => void discard()}
            aria-label={t("Discard workout")}
            className="grid h-10 w-10 place-items-center bg-ink text-white"
          >
            <MoreHorizontal size={18} strokeWidth={2.5} />
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
            <h1 className="display-title text-[26px] text-ink">{session.routineNameSnapshot || t("Workout")}</h1>
          </div>
          <div className="text-right">
            <p className="mono-num text-[24px] font-black text-ink">{formatDuration(elapsed)}</p>
            <p className="eyebrow text-ink3 text-[9px]">{t("ELAPSED")}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 border-b border-hairline">
        <GridStat label={t("SETS")} value={`${completed}/${totalSets}`} />
        <GridStat label={t("VOLUME")} value={`${Math.round(volume)}`} />
        <GridStat label={t("EXERCISE")} value={`${currentExercise}/${blocks.length}`} last />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-32">
        {blocks.map((b, bi) => {
          const doneSets = b.sets.filter((s) => s.isCompleted).length;
          const activeSetId = bi + 1 === currentExercise ? b.sets.find((s) => !s.isCompleted)?.id : undefined;
          return (
            <section key={b.sxId} className="border-b border-hairline pb-2">
              <div className="flex items-baseline justify-between px-[22px] pb-1.5 pt-4">
                <div className="flex items-baseline gap-3">
                  <span className="mono-num text-ink3">{String(bi + 1).padStart(2, "0")}</span>
                  {(() => {
                    const badge = supersetBadge(blocks.map((x) => ({ supersetGroupId: x.supersetGroupId })), bi);
                    return badge ? (
                      <span className="mono-num self-center border border-accent px-1 text-[10px] font-bold text-accent">{badge.label}</span>
                    ) : null;
                  })()}
                  <span className="font-display text-[17px] font-bold text-ink">
                    {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
                  </span>
                  {b.exercise?.userNotes ? (
                    <button
                      type="button"
                      onClick={() => toggleCues(b.sxId)}
                      aria-label={t("Form cues")}
                      aria-expanded={openCues.has(b.sxId)}
                      className={`self-center ${openCues.has(b.sxId) ? "text-fade" : "text-ink3"}`}
                    >
                      <Lightbulb size={14} strokeWidth={2.25} />
                    </button>
                  ) : null}
                </div>
                {b.target && (
                  <span className="eyebrow text-ink3">
                    {t("TARGET")} {b.target.sets}×{b.target.min}
                    {b.target.min !== b.target.max ? `–${b.target.max}` : ""}
                  </span>
                )}
              </div>
              {b.exercise?.userNotes && openCues.has(b.sxId) ? (
                <p className="mx-[22px] mb-2 border-l-2 border-fade bg-fade/10 px-2.5 py-1.5 text-[13px] leading-relaxed text-ink2 whitespace-pre-line">
                  {b.exercise.userNotes}
                </p>
              ) : null}
              <div className="mx-[22px] mb-2 flex items-center gap-2">
                <span className="mono-num text-[10px] text-ink3">{doneSets}/{b.sets.length}</span>
                <div className="h-1 flex-1 bg-chip">
                  <div className="h-full bg-ink" style={{ width: `${b.sets.length ? (doneSets / b.sets.length) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="px-[22px]">
                <div className="grid grid-cols-[2rem_1fr_1fr_1.9rem_3.4rem_2.1rem] items-center gap-1.5 pb-1">
                  <span className="eyebrow text-ink3 text-[9px]">{t("SET")}</span>
                  <span className="eyebrow text-ink3 text-[9px]">{unit.toUpperCase()}</span>
                  <span className="eyebrow text-ink3 text-[9px]">{t("REPS")}</span>
                  <span className="eyebrow text-ink3 text-[9px]">{t("RIR")}</span>
                  <span className="eyebrow text-ink3 text-[9px]">{t("LAST")}</span>
                  <span />
                </div>
                {b.sets.map((s, i) => (
                  <SetRow
                    key={s.id}
                    set={s}
                    index={i}
                    ghost={b.ghost[i]}
                    active={s.id === activeSetId}
                    onComplete={(done) => done && rest.start(b.restSeconds)}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => void addSet(b.sxId)}
                  className="mt-1.5 flex items-center gap-1.5 text-ink3 active:text-ink"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  <span className="eyebrow text-[11px]">{t("Add set")}</span>
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {rest.running && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-rule bg-ink px-5 py-3 text-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
  );
}

function GridStat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`px-[22px] py-2.5 ${last ? "" : "border-r border-hairline"}`}>
      <p className="eyebrow text-ink3 text-[9px]">{label}</p>
      <p className="mono-num text-[20px] font-bold text-ink">{value}</p>
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
    <div className="-mx-[22px] mb-1.5 bg-accentSoft/50 px-[22px] py-2">
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
  onComplete,
}: {
  set: WorkoutSet;
  index: number;
  ghost?: WorkoutSet;
  active?: boolean;
  onComplete: (done: boolean) => void;
}) {
  const { t } = useTranslation();
  const [weight, setWeight] = useState(set.weight ? String(set.weight) : "");
  const [reps, setReps] = useState(set.reps ? String(set.reps) : "");
  const [rir, setRir] = useState(set.rir != null ? String(set.rir) : "");
  const [menu, setMenu] = useState(false);

  const ghostText = ghost ? `${ghost.weight}×${ghost.reps}` : "·";
  const cur = (parseFloat(weight) || 0) * (parseInt(reps, 10) || 0);
  const gVol = ghost ? ghost.weight * ghost.reps : 0;
  const dir = !ghost ? "none" : cur === 0 ? "neutral" : cur > gVol ? "up" : cur < gVol ? "down" : "equal";
  const ghostCls =
    dir === "up" ? "border-ok/50 bg-ok/10 text-ok"
      : dir === "down" ? "border-fade/50 bg-fade/10 text-fade"
        : dir === "equal" ? "border-rule bg-chip text-ink3"
          : "border-rule text-ink3";
  const rirVal = rir.trim() === "" ? undefined : parseInt(rir, 10);

  return (
    <>
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_1.9rem_3.4rem_2.1rem] items-center gap-1.5 py-1.5 ${
        active ? "-mx-[22px] bg-accentSoft px-[22px]" : ""
      }`}
    >
      <div className="relative">
        <button
          type="button"
          aria-label={t("Set type")}
          onClick={() => setMenu((v) => !v)}
          className={`mono-num h-7 w-full text-[12px] ${
            set.kind === "working" ? "text-ink3" : "border border-accent font-bold text-accent"
          }`}
        >
          {set.kind === "working" ? index + 1 : KIND_ABBR[set.kind]}
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
      <input
        inputMode="decimal"
        value={weight}
        placeholder={ghost ? String(ghost.weight) : "0"}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => void updateSet(set.id, { weight: parseFloat(weight) || 0 })}
        className="mono-num w-full border border-rule bg-card px-1.5 py-1.5 text-[15px] text-ink outline-none focus:border-ink placeholder:text-ink3/60"
      />
      <input
        inputMode="numeric"
        value={reps}
        placeholder={ghost ? String(ghost.reps) : "0"}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => void updateSet(set.id, { reps: parseInt(reps, 10) || 0 })}
        className="mono-num w-full border border-rule bg-card px-1.5 py-1.5 text-[15px] text-ink outline-none focus:border-ink placeholder:text-ink3/60"
      />
      <input
        inputMode="numeric"
        value={rir}
        placeholder={ghost?.rir != null ? String(ghost.rir) : "–"}
        onChange={(e) => setRir(e.target.value)}
        onBlur={() => void updateSet(set.id, { rir: rir.trim() === "" ? undefined : parseInt(rir, 10) || 0 })}
        className={`mono-num w-full border border-rule bg-card px-1 py-1.5 text-center text-[14px] font-semibold outline-none focus:border-ink placeholder:text-ink3/50 ${rirColorClass(rirVal)}`}
      />
      {ghost ? (
        <button
          type="button"
          aria-label={`${t("Last")} ${ghostText}`}
          onClick={() => {
            setWeight(String(ghost.weight));
            setReps(String(ghost.reps));
            void updateSet(set.id, { weight: ghost.weight, reps: ghost.reps });
          }}
          className={`mono-num inline-flex h-7 items-center justify-center gap-px border px-0.5 text-[9px] font-semibold leading-none ${ghostCls}`}
        >
          {dir === "up" && <ArrowUp size={8} strokeWidth={3} className="shrink-0" />}
          {dir === "down" && <ArrowDown size={8} strokeWidth={3} className="shrink-0" />}
          {ghost.weight}×{ghost.reps}
        </button>
      ) : (
        <span className="text-center text-ink3/40">·</span>
      )}
      <button
        type="button"
        aria-label="complete set"
        title={ghostText}
        onClick={async () => {
          if (!set.isCompleted) {
            await updateSet(set.id, { weight: parseFloat(weight) || 0, reps: parseInt(reps, 10) || 0 });
          }
          const done = await toggleSetComplete(set.id);
          onComplete(done);
        }}
        className={`grid h-8 w-8 place-items-center border ${
          set.isCompleted ? "border-ok bg-ok text-white" : "border-rule text-ink3"
        }`}
      >
        <Check size={16} strokeWidth={2.75} />
      </button>
    </div>
    {active && <PlateStrip total={parseFloat(weight) || 0} />}
    </>
  );
}
