import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, Plus } from "lucide-react";
import { db } from "@core/db/db";
import { createRoutine } from "@core/db/mutations";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { relativeDay } from "@app/lib/format";

export function WorkoutTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const routines = useLiveQuery(
    async () => (await db.routines.toArray()).sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt)),
    [],
    undefined,
  );

  async function newRoutine() {
    const id = await createRoutine(t("New routine"));
    navigate(`/workout/routine/${id}/edit`);
  }

  return (
    <div className="flex h-full flex-col">
      <IronTopBar
        title={t("Workout")}
        leading={
          <IronToolbarButton onClick={() => navigate("/history")} label={t("History")}>
            <CalendarDays size={16} strokeWidth={2.25} />
          </IronToolbarButton>
        }
        trailing={
          <IronToolbarButton tint="bg-accent" onClick={() => void newRoutine()} label={t("New routine")}>
            <Plus size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      {routines === undefined ? null : routines.length === 0 ? (
        <IronEmptyState
          eyebrow="ROUTINES · 00"
          title={t("Build your\nfirst routine")}
          body={t(
            "Pick exercises, set target reps and rest. Reuse from the workout tab whenever you're ready to lift.",
          )}
          actionLabel={t("NEW ROUTINE")}
          onAction={() => void newRoutine()}
        />
      ) : (
        <>
          <p className="eyebrow text-ink3 px-[22px] pb-2 pt-4">{t("MY ROUTINES")}</p>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {routines.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/workout/routine/${r.id}`)}
                  className="flex w-full items-center justify-between px-[22px] py-4 text-left active:bg-chip"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="mono-num w-6 text-ink3">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-display font-bold text-ink">{r.name}</span>
                  </div>
                  {r.lastUsed && (
                    <span className="mono-num text-[12px] text-ink3">{relativeDay(r.lastUsed, i18n.language)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
