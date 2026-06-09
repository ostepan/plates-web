import { useLiveQuery } from "dexie-react-hooks";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { db } from "@core/db/db";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { formatDuration, localizedExerciseName, relativeDay, weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";

export function SessionDetail() {
  const { sessionId = "" } = useParams();
  const goBack = useGoBack("/history");
  const { t, i18n } = useTranslation();
  const unit = weightUnit();

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const sxs = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray()).sort(
      (a, b) => a.order - b.order,
    );
    const blocks: { id: ID; exercise?: Exercise; sets: WorkoutSet[] }[] = await Promise.all(
      sxs.map(async (sx) => ({
        id: sx.id,
        exercise: sx.exerciseId ? await db.exercises.get(sx.exerciseId) : undefined,
        sets: (await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray())
          .filter((s) => s.isCompleted)
          .sort((a, b) => a.order - b.order),
      })),
    );
    return { session, blocks };
  }, [sessionId]);

  if (!data) return null;
  const { session, blocks } = data;

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="px-[22px] pb-4 pt-2">
          <p className="eyebrow text-accent mb-1">
            {relativeDay(session.date, i18n.language)} · {formatDuration(session.durationSeconds)}
          </p>
          <h1 className="display-title text-[32px] text-ink">
            {session.routineNameSnapshot || t("Workout")}
          </h1>
          <p className="mono-num mt-1 text-[14px] text-ink2">
            {Math.round(session.totalVolume)} {unit}
          </p>
        </div>

        {blocks.map((b) => (
          <section key={b.id} className="border-t border-hairline px-[22px] py-3">
            <h2 className="font-display font-bold text-ink">
              {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
            </h2>
            <ul className="mt-1.5 space-y-0.5">
              {b.sets.map((s, i) => (
                <li key={s.id} className="mono-num flex gap-3 text-[13px] text-ink2">
                  <span className="text-ink3">{i + 1}</span>
                  <span>
                    {s.weight} {unit} × {s.reps}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
