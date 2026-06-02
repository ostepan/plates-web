import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, MoreVertical, Pencil, Play, Plus, Trash2, Zap } from "lucide-react";
import { db } from "@core/db/db";
import {
  createRoutine, deleteRoutine, startProgramDay, startQuickWorkout, unfinishedSession,
} from "@core/db/mutations";
import { currentProgramDay, programOwnedRoutineIds, routineExerciseCounts } from "@core/db/queries";
import type { ID } from "@core/models/types";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { relativeDay } from "@app/lib/format";

export function WorkoutTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [menuId, setMenuId] = useState<ID | null>(null);

  const data = useLiveQuery(
    async () => {
      const owned = await programOwnedRoutineIds();
      const routines = (await db.routines.toArray())
        .filter((r) => !owned.has(r.id))
        .sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt));
      const counts = await routineExerciseCounts(routines.map((r) => r.id));
      const todays = await currentProgramDay();
      const open = await unfinishedSession();
      return { routines, counts, todays, open };
    },
    [],
    undefined,
  );

  async function newRoutine() {
    const id = await createRoutine(t("New routine"));
    navigate(`/workout/routine/${id}/edit`);
  }

  async function startTodaysWorkout(dayId: string) {
    const sessionId = await startProgramDay(dayId);
    if (sessionId) navigate(`/active/${sessionId}`);
  }

  async function quickStart() {
    const id = await startQuickWorkout(t("Quick workout"));
    navigate(`/active/${id}`);
  }

  async function removeRoutine(id: ID, name: string) {
    setMenuId(null);
    if (!window.confirm(`${t("Delete")} "${name}"?`)) return;
    await deleteRoutine(id);
  }

  const routines = data?.routines;
  const todays = data?.todays;
  const open = data?.open;
  const weekContext = todays
    ? todays.micro.isDeload
      ? `${t("Week")} ${todays.micro.weekIndex + 1} · ${t("Deload")}`
      : `${t("Week")} ${todays.micro.weekIndex + 1}`
    : null;

  return (
    <div className="flex h-full flex-col" onClick={() => menuId && setMenuId(null)}>
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
              <p className="font-display text-[15px] font-bold text-ink truncate">
                {open.routineNameSnapshot || t("Workout")}
              </p>
            </div>
            <span className="mono-num shrink-0 text-[11px] text-ink2">{relativeDay(open.date, i18n.language)}</span>
          </button>
        )}

        {/* Today's program workout */}
        {todays && (
          <button
            type="button"
            onClick={() => void startTodaysWorkout(todays.day.id)}
            className="mx-[22px] mt-4 flex w-[calc(100%-44px)] items-center gap-3 border border-ink bg-ink px-4 py-3.5 text-left text-white active:opacity-90"
          >
            <Play size={22} className="shrink-0 text-accent" strokeWidth={2.5} fill="currentColor" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-white/55">{t("TODAY'S WORKOUT")}</p>
              <p className="font-display text-[16px] font-bold">{todays.day.name}</p>
              <p className="mono-num text-[12px] text-white/55">
                {todays.program.name}
                {weekContext ? ` · ${weekContext}` : ""}
              </p>
            </div>
          </button>
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
            <p className="eyebrow text-ink3 px-[22px] pb-2 pt-6">
              {t("MY ROUTINES")} · {String(routines.length).padStart(2, "0")}
            </p>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {routines.map((r, i) => {
                const count = data?.counts.get(r.id) ?? 0;
                return (
                  <li key={r.id} className="relative flex items-center active:bg-chip">
                    <button
                      type="button"
                      onClick={() => navigate(`/workout/routine/${r.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-4 pl-[22px] text-left"
                    >
                      <span className="mono-num w-6 shrink-0 text-ink3">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="font-display font-bold text-ink truncate">{r.name}</p>
                        <p className="mono-num text-[12px] text-ink3">
                          {count} {t(count === 1 ? "exercise" : "exercises")}
                          {r.lastUsed ? ` · ${relativeDay(r.lastUsed, i18n.language)}` : ""}
                        </p>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 pr-[14px]">
                      <button
                        type="button"
                        aria-label={t("Workout options")}
                        onClick={(e) => { e.stopPropagation(); setMenuId(menuId === r.id ? null : r.id); }}
                        className="grid h-8 w-8 place-items-center text-ink3 active:text-ink"
                      >
                        <MoreVertical size={17} strokeWidth={2.25} />
                      </button>
                      <ChevronRight size={18} className="text-ink3" strokeWidth={2.5} />
                    </div>

                    {menuId === r.id && (
                      <div
                        className="absolute right-[14px] top-[calc(100%-8px)] z-30 w-36 border border-ink bg-card shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => { setMenuId(null); navigate(`/workout/routine/${r.id}/edit`); }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-ink2 active:bg-chip"
                        >
                          <Pencil size={14} strokeWidth={2.25} /> {t("Edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeRoutine(r.id, r.name)}
                          className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-2.5 text-left text-[13px] text-accent active:bg-chip"
                        >
                          <Trash2 size={14} strokeWidth={2.25} /> {t("Delete")}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
