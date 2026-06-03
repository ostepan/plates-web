import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, Pencil, Play, Plus, Trash2, Zap } from "lucide-react";
import { db } from "@core/db/db";
import { createRoutine, deleteRoutine, startProgramDay, startQuickWorkout, unfinishedSession } from "@core/db/mutations";
import { activeProgramToday, programOwnedRoutineIds } from "@core/db/queries";
import { overviewStats } from "@core/db/analytics";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { IronMenu } from "@ui/components/IronMenu";
import { relativeDay } from "@app/lib/format";

export function WorkoutTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const data = useLiveQuery(
    async () => {
      const owned = await programOwnedRoutineIds();
      const all = (await db.routines.toArray())
        .filter((r) => !owned.has(r.id))
        .sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt));
      const exByMuscle = new Map((await db.exercises.toArray()).map((e) => [e.id, e.muscleGroup]));
      const routines = await Promise.all(
        all.map(async (r) => {
          const res = await db.routineExercises.where("routineId").equals(r.id).toArray();
          const muscles = [...new Set(res.map((re) => exByMuscle.get(re.exerciseId)).filter((m): m is NonNullable<typeof m> => !!m))];
          return { routine: r, exCount: res.length, muscles };
        }),
      );
      const today = await activeProgramToday();
      const stats = await overviewStats();
      const open = await unfinishedSession();
      return { routines, today, streak: stats.streakDays, open };
    },
    [],
    undefined,
  );

  const todayLabel = new Date().toLocaleDateString(i18n.language, { weekday: "long", month: "short", day: "numeric" });

  async function newRoutine() {
    const id = await createRoutine(t("New routine"));
    navigate(`/workout/routine/${id}/edit`);
  }

  async function startToday() {
    if (!data?.today) return;
    const sessionId = await startProgramDay(data.today.day.id);
    if (sessionId) navigate(`/active/${sessionId}`);
  }

  async function quickStart() {
    const id = await startQuickWorkout(t("Quick workout"));
    navigate(`/active/${id}`);
  }

  async function removeRoutine(id: string, name: string) {
    if (!window.confirm(`${t("Delete routine")} "${name}"? ${t("Past sessions are kept.")}`)) return;
    await deleteRoutine(id);
  }

  const routines = data?.routines;
  const today = data?.today;
  const open = data?.open;
  const estMin = today ? Math.max(15, Math.round(today.totalSets * 3.5)) : 0;

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

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {/* Resume an in-progress workout */}
        {open && (
          <button
            type="button"
            onClick={() => navigate(`/active/${open.id}`)}
            className="mx-[22px] mt-4 flex w-[calc(100%-44px)] items-center gap-3 border border-accent bg-accentSoft px-4 py-3.5 text-left active:opacity-90"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center bg-accent text-white">
              <Play size={18} strokeWidth={2.5} fill="currentColor" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-accent">{t("RESUME WORKOUT")}</p>
              <p className="truncate font-display text-[15px] font-bold text-ink">
                {open.routineNameSnapshot || t("Workout")}
              </p>
            </div>
            <span className="mono-num shrink-0 text-[11px] text-ink2">{relativeDay(open.date, i18n.language)}</span>
          </button>
        )}

        <p className="eyebrow px-[22px] pt-3 text-ink3">
          {todayLabel}
          {data?.streak ? ` · ${data.streak}-${t("day streak")}` : ""}
        </p>

        {/* Today's program workout */}
        {today && (
          <div className="mx-[22px] mt-4 bg-ink px-5 pb-4 pt-5 text-white">
            <div className="flex items-center justify-between">
              <p className="eyebrow flex items-center gap-2 text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                {t("TODAY'S WORKOUT")} · {t("WK")} {today.weekIndex + 1} {t("OF")} {today.totalWeeks}
              </p>
              <button
                type="button"
                onClick={() => navigate(`/programs/${today.program.id}`)}
                className="eyebrow text-[10px] text-white/55 active:text-white"
              >
                {t("PLAN")} →
              </button>
            </div>

            <h2 className="display-title mt-2.5 text-[34px] leading-[0.95] text-white">{today.day.name}.</h2>
            <p className="mt-1.5 text-[12px] text-white/60">
              {today.program.name} · {t("Day")} {today.dayPos + 1} {t("of")} {today.daysPerWeek}
              {today.isDeload ? ` · ${t("DELOAD")}` : ""}
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3.5">
              <div className="flex gap-5 text-[11px] text-white/70">
                <span>
                  <b className="mr-1 font-display text-[16px] font-extrabold text-white">{today.exerciseCount}</b>
                  {t("exercises")}
                </span>
                <span>
                  <b className="mr-1 font-display text-[16px] font-extrabold text-white">~{estMin}</b>
                  {t("min")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void startToday()}
                disabled={today.exerciseCount === 0}
                className="flex items-center gap-2 bg-accent px-4 py-2.5 text-white disabled:opacity-40"
              >
                <span className="eyebrow text-[12px]">{t("START")}</span>
                <Play size={12} strokeWidth={2.5} fill="currentColor" />
              </button>
            </div>
          </div>
        )}

        {/* Quick start ad-hoc workout */}
        <button
          type="button"
          onClick={() => void quickStart()}
          className="mx-[22px] mt-3 flex w-[calc(100%-44px)] items-center justify-center gap-2 border border-dashed border-rule py-3 text-[11px] font-bold uppercase tracking-eyebrow text-ink2 active:bg-chip"
        >
          <Zap size={14} strokeWidth={2.5} />
          {t("Quick start")}
        </button>

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
            <p className="eyebrow px-[22px] pb-2 pt-5 text-ink3">{t("MY ROUTINES")}</p>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {routines.map(({ routine: r, exCount, muscles }, i) => (
                <li key={r.id} className="flex items-center active:bg-chip">
                  <button
                    type="button"
                    onClick={() => navigate(`/workout/routine/${r.id}`)}
                    className="flex flex-1 items-center gap-3 py-3.5 pl-[22px] text-left"
                  >
                    <span className="mono-num w-6 shrink-0 text-[14px] font-bold text-ink3">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[17px] font-bold text-ink">{r.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink2">
                        {[
                          ...muscles.slice(0, 2).map((m) => t(MUSCLE_I18N_KEY[m])),
                          r.lastUsed ? relativeDay(r.lastUsed, i18n.language) : t("not used yet"),
                        ].join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-display text-[14px] font-bold text-ink">{exCount}</span>
                      <span className="ml-0.5 text-[10px] font-semibold text-ink3">{t("ex")}</span>
                    </span>
                  </button>
                  <div className="pr-[14px]">
                    <IronMenu
                      label={t("Routine options")}
                      items={[
                        {
                          label: t("Edit"),
                          icon: <Pencil size={15} strokeWidth={2.25} />,
                          onClick: () => navigate(`/workout/routine/${r.id}/edit`),
                        },
                        {
                          label: t("Delete"),
                          icon: <Trash2 size={15} strokeWidth={2.25} />,
                          danger: true,
                          onClick: () => void removeRoutine(r.id, r.name),
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
