import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Plus } from "lucide-react";
import { db } from "@core/db/db";
import {
  addSet, discardSession, finishSession, lastCompletedSets, toggleSetComplete, updateSet,
} from "@core/db/mutations";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import { formatDuration, localizedExerciseName, weightUnit } from "@app/lib/format";
import { useRestTimer } from "@app/hooks/useRestTimer";

interface Block {
  sxId: ID;
  exercise?: Exercise;
  sets: WorkoutSet[];
  ghost: WorkoutSet[];
  restSeconds: number;
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
          return { sxId: sx.id, exercise, sets, ghost, restSeconds: exercise?.defaultRestSeconds ?? 120 };
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
  const volume = blocks.reduce(
    (v, b) => v + b.sets.filter((s) => s.isCompleted && s.kind === "working").reduce((x, s) => x + s.weight * s.reps, 0),
    0,
  );

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
      <header className="border-b border-hairline px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => void discard()} className="eyebrow text-ink3">
            {t("Discard")}
          </button>
          <button type="button" onClick={() => void finish()} className="bg-ink px-4 py-2 text-white">
            <span className="eyebrow text-[12px]">{t("FINISH")}</span>
          </button>
        </div>
        <div className="mt-3 flex items-end gap-6">
          <Stat label={t("ELAPSED")} value={formatDuration(elapsed)} />
          <Stat label={t("SETS")} value={String(completed)} />
          <Stat label={t("VOLUME")} value={`${Math.round(volume)} ${unit}`} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-32">
        {blocks.map((b) => (
          <section key={b.sxId} className="border-b border-hairline">
            <h2 className="px-[22px] pb-1.5 pt-4 font-display text-[17px] font-bold text-ink">
              {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
            </h2>
            <div className="px-[22px] pb-3">
              <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 pb-1">
                <span className="eyebrow text-ink3 text-[9px]">{t("SET")}</span>
                <span className="eyebrow text-ink3 text-[9px]">{unit.toUpperCase()}</span>
                <span className="eyebrow text-ink3 text-[9px]">{t("REPS")}</span>
                <span />
              </div>
              {b.sets.map((s, i) => (
                <SetRow
                  key={s.id}
                  set={s}
                  index={i}
                  ghost={b.ghost[i]}
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
        ))}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow text-ink3 text-[9px]">{label}</p>
      <p className="mono-num text-[20px] font-bold text-ink">{value}</p>
    </div>
  );
}

function SetRow({
  set,
  index,
  ghost,
  onComplete,
}: {
  set: WorkoutSet;
  index: number;
  ghost?: WorkoutSet;
  onComplete: (done: boolean) => void;
}) {
  const [weight, setWeight] = useState(set.weight ? String(set.weight) : "");
  const [reps, setReps] = useState(set.reps ? String(set.reps) : "");

  const ghostText = ghost ? `${ghost.weight}×${ghost.reps}` : "·";

  return (
    <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 py-1">
      <span className="mono-num text-ink3">{index + 1}</span>
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
