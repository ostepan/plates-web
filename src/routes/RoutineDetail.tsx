import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Pencil, Play } from "lucide-react";
import { db } from "@core/db/db";
import { startSessionFromRoutine } from "@core/db/mutations";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { localizedExerciseName } from "@app/lib/format";

export function RoutineDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const routine = useLiveQuery(() => db.routines.get(id), [id]);
  const rows = useLiveQuery(
    async () => {
      const res = (await db.routineExercises.where("routineId").equals(id).toArray()).sort(
        (a, b) => a.order - b.order,
      );
      return Promise.all(res.map(async (re) => ({ re, ex: await db.exercises.get(re.exerciseId) })));
    },
    [id],
    [],
  );

  if (routine === undefined) return null;

  async function start() {
    const sessionId = await startSessionFromRoutine(id);
    navigate(`/active/${sessionId}`, { replace: true });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        leading={
          <IronToolbarButton onClick={() => navigate("/workout")} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
        trailing={
          <IronToolbarButton onClick={() => navigate(`/workout/routine/${id}/edit`)} label={t("Edit")}>
            <Pencil size={16} strokeWidth={2.25} />
          </IronToolbarButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <div className="px-[22px] pb-4 pt-2">
          <p className="eyebrow text-accent mb-1">
            {rows.length} {t("EXERCISES")}
          </p>
          <h1 className="display-title text-[34px] text-ink">{routine?.name}</h1>
          {routine?.notes ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink2">{routine.notes}</p>
          ) : null}
        </div>

        <ul className="divide-y divide-hairline border-y border-hairline">
          {rows.map(({ re, ex }, i) => (
            <li key={re.id} className="flex items-baseline justify-between px-[22px] py-3.5">
              <div className="flex items-baseline gap-3">
                <span className="mono-num w-6 text-ink3">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display font-semibold text-ink">
                  {ex ? localizedExerciseName(ex, i18n.language) : "—"}
                </span>
              </div>
              <span className="mono-num text-[13px] text-ink2">
                {re.targetSets} × {re.targetRepsMin}–{re.targetRepsMax}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-rule p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void start()}
          disabled={rows.length === 0}
          className="flex w-full items-center justify-center gap-2 bg-ink py-4 text-white disabled:opacity-40"
        >
          <Play size={16} strokeWidth={2.5} fill="currentColor" />
          <span className="eyebrow text-[13px]">{t("START WORKOUT")}</span>
        </button>
      </div>
    </div>
  );
}
