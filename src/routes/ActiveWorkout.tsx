import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import { db } from "@core/db/db";
import {
  addSet, discardSession, finishSession, lastCompletedSets, toggleSetComplete, updateSet,
} from "@core/db/mutations";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import type { SetKind } from "@core/models/enums";
import { formatDuration, localizedExerciseName, weightUnit } from "@app/lib/format";
import { useRestTimer } from "@app/hooks/useRestTimer";

interface Block {
  sxId: ID;
  exercise?: Exercise;
  sets: WorkoutSet[];
  ghost: WorkoutSet[];
  restSeconds: number;
  target?: { sets: number; min: number; max: number };
}

export function ActiveWorkout() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const rest = useRestTimer();
  const unit = weightUnit();

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
                  <span className="font-display text-[17px] font-bold text-ink">
                    {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
                  </span>
                </div>
                {b.target && (
                  <span className="eyebrow text-ink3">
                    {t("TARGET")} {b.target.sets}×{b.target.min}
                    {b.target.min !== b.target.max ? `–${b.target.max}` : ""}
                  </span>
                )}
              </div>
              <div className="mx-[22px] mb-2 flex items-center gap-2">
                <span className="mono-num text-[10px] text-ink3">{doneSets}/{b.sets.length}</span>
                <div className="h-1 flex-1 bg-chip">
                  <div className="h-full bg-ink" style={{ width: `${b.sets.length ? (doneSets / b.sets.length) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="px-[22px]">
                <div className="grid grid-cols-[2.2rem_1fr_1fr_2.4rem_2.5rem] items-center gap-2 pb-1">
                  <span className="eyebrow text-ink3 text-[9px]">{t("SET")}</span>
                  <span className="eyebrow text-ink3 text-[9px]">{unit.toUpperCase()}</span>
                  <span className="eyebrow text-ink3 text-[9px]">{t("REPS")}</span>
                  <span className="eyebrow text-ink3 text-[9px]">{t("RIR")}</span>
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

  return (
    <div
      className={`grid grid-cols-[2.2rem_1fr_1fr_2.4rem_2.5rem] items-center gap-2 py-1.5 ${
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
        className="mono-num w-full border border-rule bg-card px-2 py-1.5 text-[15px] text-ink outline-none focus:border-ink placeholder:text-ink3/60"
      />
      <input
        inputMode="numeric"
        value={reps}
        placeholder={ghost ? String(ghost.reps) : "0"}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => void updateSet(set.id, { reps: parseInt(reps, 10) || 0 })}
        className="mono-num w-full border border-rule bg-card px-2 py-1.5 text-[15px] text-ink outline-none focus:border-ink placeholder:text-ink3/60"
      />
      <input
        inputMode="numeric"
        value={rir}
        placeholder={ghost?.rir != null ? String(ghost.rir) : "–"}
        onChange={(e) => setRir(e.target.value)}
        onBlur={() => void updateSet(set.id, { rir: rir.trim() === "" ? undefined : parseInt(rir, 10) || 0 })}
        className="mono-num w-full border border-rule bg-card px-1 py-1.5 text-center text-[14px] text-ink outline-none focus:border-ink placeholder:text-ink3/50"
      />
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
  );
}
