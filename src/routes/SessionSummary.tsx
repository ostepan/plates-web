import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, AlertTriangle } from "lucide-react";
import { db } from "@core/db/db";
import { sessionHighlights } from "@core/db/analytics";
import type { Exercise, ID } from "@core/models/types";
import { formatDuration, localizedExerciseName, weightUnit } from "@app/lib/format";

export function SessionSummary() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const unit = weightUnit();

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const sxs = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray()).sort((a, b) => a.order - b.order);
    const allSets = await db.workoutSets.where("sessionExerciseId").anyOf(sxs.map((s) => s.id)).toArray();
    const setsBySx = new Map<ID, typeof allSets>();
    for (const s of allSets) setsBySx.set(s.sessionExerciseId, [...(setsBySx.get(s.sessionExerciseId) ?? []), s]);

    const exMap = new Map((await db.exercises.bulkGet(sxs.map((s) => s.exerciseId).filter((x): x is ID => !!x)))
      .filter((e): e is Exercise => !!e).map((e) => [e.id, e]));

    const breakdown = sxs.map((sx) => {
      const working = (setsBySx.get(sx.id) ?? []).filter((s) => s.isCompleted && s.kind === "working");
      return {
        name: sx.exerciseId ? exMap.get(sx.exerciseId) : undefined,
        volume: working.reduce((v, s) => v + s.weight * s.reps, 0),
      };
    });
    const setCount = allSets.filter((s) => s.isCompleted && s.kind === "working").length;

    const highlights = await sessionHighlights(sessionId);
    const plateauNames = highlights.plateaus.map((id) => exMap.get(id)).filter((e): e is Exercise => !!e);
    return { session, breakdown, setCount, prCount: highlights.prs.length, plateauNames };
  }, [sessionId]);

  if (!data) return null;
  const { session, breakdown, setCount, prCount, plateauNames } = data;
  const weekday = new Date(session.date).toLocaleDateString(i18n.language, { weekday: "long" }).toUpperCase();

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      {/* dark header band */}
      <div className="bg-ink px-[22px] pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-start justify-between">
          <p className="eyebrow text-accent">{t("LOGGED")} · {weekday}</p>
          <button type="button" onClick={() => navigate("/workout", { replace: true })} aria-label={t("Done")} className="-mt-1 text-white/70">
            <X size={20} strokeWidth={2.25} />
          </button>
        </div>
        <h1 className="font-display text-[40px] font-black leading-[0.95] tracking-[-0.03em]">
          {session.routineNameSnapshot || t("Workout")}.
        </h1>
        <p className="mt-2 mono-num text-[13px] text-white/55">
          {Math.round(session.totalVolume)} {unit} · {setCount}× {t("SET")}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 4-stat grid */}
        <div className="grid grid-cols-4 border-b border-hairline">
          <Stat label={t("TIME")} value={formatDuration(session.durationSeconds)} />
          <Stat label={t("SETS")} value={String(setCount)} />
          <Stat label={t("VOLUME")} value={String(Math.round(session.totalVolume))} />
          <Stat label={t("PRS")} value={String(prCount)} last />
        </div>

        {plateauNames.length > 0 && (
          <div className="mx-[22px] mt-4 border border-warn/40 bg-accentSoft/40 px-4 py-3">
            <p className="eyebrow flex items-center gap-1.5 text-warn">
              <AlertTriangle size={13} strokeWidth={2.5} /> {t("PLATEAU WATCH")}
            </p>
            <p className="mt-1 font-display font-bold text-ink">
              {plateauNames.map((e) => localizedExerciseName(e, i18n.language)).join(", ")}
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-ink2">
              {t("Last few sessions flat — consider a deload or changing the rep scheme.")}
            </p>
          </div>
        )}

        <p className="eyebrow text-ink3 px-[22px] pb-2 pt-5">{t("SUMMARY")}</p>
        <ul className="divide-y divide-hairline border-t border-hairline">
          {breakdown.map((b, i) => (
            <li key={i} className="flex items-baseline justify-between px-[22px] py-3">
              <div className="flex items-baseline gap-3">
                <span className="mono-num w-6 text-ink3">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display font-bold text-ink">
                  {b.name ? localizedExerciseName(b.name, i18n.language) : "—"}
                </span>
              </div>
              <span className="mono-num text-[13px] text-ink2">{Math.round(b.volume)} {unit}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-rule p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => navigate("/workout", { replace: true })} className="w-full bg-ink py-4 text-white">
          <span className="eyebrow text-[13px]">{t("SAVE & CLOSE")}</span>
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`px-3 py-3.5 ${last ? "" : "border-r border-hairline"}`}>
      <p className="eyebrow text-ink3 text-[9px]">{label}</p>
      <p className="mono-num mt-0.5 text-[22px] font-black text-ink">{value}</p>
    </div>
  );
}
