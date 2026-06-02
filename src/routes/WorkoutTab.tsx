import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, HeartPulse, Plus } from "lucide-react";
import { db } from "@core/db/db";
import { createRoutine } from "@core/db/mutations";
import { activeProgram, programOwnedRoutineIds } from "@core/db/queries";
import { overviewStats } from "@core/db/analytics";
import { muscleRecovery } from "@core/db/recovery";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { relativeDay } from "@app/lib/format";

export function WorkoutTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const data = useLiveQuery(
    async () => {
      const owned = await programOwnedRoutineIds();
      const routines = (await db.routines.toArray())
        .filter((r) => !owned.has(r.id))
        .sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt));
      const program = await activeProgram();
      const recovery = await muscleRecovery();
      const stats = await overviewStats();
      return { routines, program, lowest: recovery[0], streak: stats.streakDays };
    },
    [],
    undefined,
  );

  const todayLabel = new Date().toLocaleDateString(i18n.language, { weekday: "long", month: "short", day: "numeric" });

  async function newRoutine() {
    const id = await createRoutine(t("New routine"));
    navigate(`/workout/routine/${id}/edit`);
  }

  const routines = data?.routines;

  return (
    <div className="flex h-full flex-col">
      <IronTopBar
        title={t("Workout")}
        leading={
          <IronToolbarButton onClick={() => navigate("/programs")} label={t("Programs")}>
            <CalendarDays size={16} strokeWidth={2.25} />
          </IronToolbarButton>
        }
        trailing={
          <IronToolbarButton tint="bg-accent" onClick={() => void newRoutine()} label={t("New routine")}>
            <Plus size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

      <p className="eyebrow text-ink3 px-[22px] pt-3">
        {todayLabel}
        {data?.streak ? ` · ${data.streak}-${t("day streak")}` : ""}
      </p>

      <button
        type="button"
        onClick={() => navigate("/recovery")}
        className="mx-[22px] mt-4 flex items-center justify-between border border-rule bg-card px-4 py-3 text-left active:bg-chip"
      >
        <span className="flex items-center gap-3">
          <HeartPulse size={18} className="text-accent" strokeWidth={2.25} />
          <span className="font-display font-bold text-ink">{t("Recovery")}</span>
        </span>
        <span className="flex items-center gap-2">
          {data?.lowest && (
            <span className="mono-num text-[12px] text-ink3">
              {t(MUSCLE_I18N_KEY[data.lowest.muscleGroup])} {Math.round(data.lowest.recoveryPercentage)}%
            </span>
          )}
          <ChevronRight size={18} className="text-ink3" strokeWidth={2.5} />
        </span>
      </button>

      {data?.program && (
        <button
          type="button"
          onClick={() => navigate(`/programs/${data.program!.id}`)}
          className="mx-[22px] mt-4 flex items-center justify-between border border-ink bg-ink px-4 py-3.5 text-left text-white"
        >
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-white/55">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {t("ACTIVE PROGRAM")}
            </p>
            <p className="font-display text-[16px] font-bold">{data.program.name}</p>
          </div>
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      )}

      {routines === undefined ? null : routines.length === 0 ? (
        <IronEmptyState
          eyebrow={t("ROUTINES · 00")}
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
