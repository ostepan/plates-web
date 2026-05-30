import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { db } from "@core/db/db";
import { formatDuration, weightUnit } from "@app/lib/format";

export function SessionSummary() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const unit = weightUnit();

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const sxs = await db.sessionExercises.where("sessionId").equals(sessionId).toArray();
    const sets = await db.workoutSets.where("sessionExerciseId").anyOf(sxs.map((s) => s.id)).toArray();
    const working = sets.filter((s) => s.isCompleted && s.kind === "working");
    return { session, exerciseCount: sxs.length, setCount: working.length };
  }, [sessionId]);

  if (!data) return null;
  const { session, exerciseCount, setCount } = data;

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <div className="flex flex-1 flex-col justify-center px-[22px]">
        <p className="eyebrow text-accent mb-1.5">{t("WORKOUT COMPLETE")}</p>
        <h1 className="display-title text-[40px] text-ink">{t("Nice work")}.</h1>
        <p className="mt-2 text-[14px] text-ink2">{session.routineNameSnapshot}</p>

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
