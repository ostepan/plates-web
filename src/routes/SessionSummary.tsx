import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
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
    const sxs = await db.sessionExercises.where("sessionId").equals(sessionId).toArray();
    const sets = await db.workoutSets.where("sessionExerciseId").anyOf(sxs.map((s) => s.id)).toArray();
    const working = sets.filter((s) => s.isCompleted && s.kind === "working");
    const highlights = await sessionHighlights(sessionId);
    const ids = [...new Set([...highlights.prs.map((p) => p.exerciseId), ...highlights.plateaus])];
    const exMap = new Map(
      (await db.exercises.bulkGet(ids)).filter((e): e is Exercise => !!e).map((e) => [e.id, e]),
    );
    return { session, exerciseCount: sxs.length, setCount: working.length, highlights, exMap };
  }, [sessionId]);

  if (!data) return null;
  const { session, exerciseCount, setCount, highlights, exMap } = data;
  const exName = (id: ID) => {
    const e = exMap.get(id);
    return e ? localizedExerciseName(e, i18n.language) : "—";
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-[22px] py-6">
        <p className="eyebrow text-accent mb-1.5">{t("WORKOUT COMPLETE")}</p>
        <h1 className="display-title text-[40px] text-ink">{t("Nice work")}.</h1>
        <p className="mt-2 text-[14px] text-ink2">{session.routineNameSnapshot}</p>

        {highlights.prs.length > 0 && (
          <div className="mt-5 border border-accent bg-accentSoft px-4 py-3">
            <p className="eyebrow flex items-center gap-1.5 text-accentInk">
              <Trophy size={13} strokeWidth={2.5} />
              {highlights.prs.length}{" "}
              {t(highlights.prs.length === 1 ? "personal record" : "personal records")}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {highlights.prs.map((pr) => (
                <li key={pr.exerciseId} className="mono-num text-[13px] text-accentInk">
                  {exName(pr.exerciseId)} · {Math.round(pr.e1rm)} {unit}
                </li>
              ))}
            </ul>
          </div>
        )}
        {highlights.plateaus.length > 0 && (
          <p className="mono-num mt-3 text-[12px] text-warn">
            {t("Plateau watch")}: {highlights.plateaus.map(exName).join(", ")}
          </p>
        )}

        <dl className="mt-8 grid grid-cols-2 gap-y-6">
          <Stat label={t("TIME")} value={formatDuration(session.durationSeconds)} />
          <Stat label={t("VOLUME")} value={`${Math.round(session.totalVolume)} ${unit}`} />
          <Stat label={t("SETS")} value={String(setCount)} />
          <Stat label={t("EXERCISES")} value={String(exerciseCount)} />
        </dl>
      </div>

      <div className="border-t border-rule p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => navigate("/workout", { replace: true })}
          className="w-full bg-ink py-4 text-white"
        >
          <span className="eyebrow text-[13px]">{t("DONE")}</span>
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow text-ink3 text-[9px]">{label}</p>
      <p className="mono-num mt-0.5 text-[26px] font-black text-ink">{value}</p>
    </div>
  );
}
