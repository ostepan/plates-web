import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import { activateProgram, deactivateProgram, deleteProgram, startProgramDay } from "@core/db/mutations";
import { loadProgram } from "@core/db/queries";
import type { ID } from "@core/models/types";
import type { ProgressionRule } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { useGoBack } from "@app/hooks/useGoBack";

const RULE_KEY: Record<ProgressionRule, string> = {
  linear: "LINEAR",
  doubleProgression: "DOUBLE PROGRESSION",
  percentageOf1RM: "% OF 1RM",
  rirBased: "RIR-BASED",
};

const RULE_DESC: Record<ProgressionRule, string> = {
  linear: "Add a fixed increment each session as long as every set hits its target.",
  doubleProgression: "Work up the rep range first, then add weight and drop back to the bottom.",
  percentageOf1RM: "Loads prescribed as a percentage of your training max; raise the max each cycle.",
  rirBased: "Loads autoregulated to land on the target reps-in-reserve.",
};

export function ProgramDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/programs");
  const { t } = useTranslation();

  const data = useLiveQuery(() => loadProgram(id), [id]);
  // Day ids already logged — drives the done/today cell states.
  const doneDayIds = useLiveQuery(
    async () => {
      const sessions = await db.sessions.where("durationSeconds").above(0).toArray();
      return new Set(sessions.map((s) => s.programDayID).filter((x): x is ID => !!x));
    },
    [],
    new Set<ID>(),
  );

  if (data === undefined) return null;
  if (data === null) {
    navigate("/programs", { replace: true });
    return null;
  }
  const { program, daysPerWeek, mesos } = data;

  // Walk the plan in order: completed count, current pointer, totals.
  const orderedDays = mesos.flatMap((mv) => mv.micros.flatMap((wv) => wv.days.map((dv) => dv.day)));
  const totalDays = orderedDays.length;
  const completedCount = orderedDays.filter((d) => doneDayIds.has(d.id)).length;
  const currentDay = program.isActive ? orderedDays.find((d) => !doneDayIds.has(d.id)) : undefined;
  const progressPct = totalDays ? Math.round((completedCount / totalDays) * 100) : 0;
  const currentIdx = currentDay ? orderedDays.indexOf(currentDay) : -1;
  const currentWeek = currentIdx >= 0 && daysPerWeek ? Math.floor(currentIdx / daysPerWeek) + 1 : null;
  const currentDayPos = currentIdx >= 0 && daysPerWeek ? (currentIdx % daysPerWeek) + 1 : null;
  const dayHeaders = mesos[0]?.micros[0]?.days.map((dv) => dv.day.name) ?? [];

  async function startDay(dayId: string) {
    const sessionId = await startProgramDay(dayId);
    if (sessionId) navigate(`/active/${sessionId}`, { replace: true });
  }

  async function onDelete() {
    if (!window.confirm(t("Delete this program? Past sessions are kept."))) return;
    await deleteProgram(id);
    navigate("/programs", { replace: true });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
        trailing={
          program.isBuiltIn ? undefined : (
            <div className="flex items-center gap-1.5">
              <IronToolbarButton onClick={() => navigate(`/programs/${id}/edit`)} label={t("Edit")}>
                <Pencil size={16} strokeWidth={2.25} />
              </IronToolbarButton>
              <IronToolbarButton onClick={() => void onDelete()} label={t("Delete")}>
                <Trash2 size={16} strokeWidth={2.25} />
              </IronToolbarButton>
            </div>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <div className="px-[22px] pb-4 pt-2">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-accent">
              {t(RULE_KEY[mesos[0]?.meso.progressionRule ?? "linear"])} · {program.weeks} {t("WEEKS")} ·{" "}
              {daysPerWeek} {t("DAYS/WK")}
            </p>
            {program.isActive && (
              <span className="eyebrow border border-accent px-1.5 py-0.5 text-accent">{t("ACTIVE")}</span>
            )}
          </div>
          <h1 className="display-title mt-1 text-[32px] text-ink">{program.name}</h1>
          {program.notes && <p className="mt-2 text-[13px] leading-relaxed text-ink2">{program.notes}</p>}
        </div>

        {/* Progress strip — only meaningful while the program is running */}
        {program.isActive && (
          <div className="grid grid-cols-3 border-y border-rule">
            {(
              [
                [t("Week"), currentWeek != null ? `${currentWeek} ${t("of")} ${program.weeks}` : "—"],
                [t("Day"), currentDayPos != null ? `${currentDayPos} ${t("of")} ${daysPerWeek}` : "—"],
                [t("Progress"), `${progressPct}%`],
              ] as const
            ).map(([label, value], i) => (
              <div key={label} className={`px-3.5 py-3 ${i < 2 ? "border-r border-rule" : ""}`}>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{label}</p>
                <p className="mt-0.5 font-display text-[18px] font-extrabold tabular-nums tracking-[-0.4px] text-ink">
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Calendar grid */}
        <div className="px-[22px] pt-5">
          <p className="eyebrow text-ink3 mb-2.5">{t("SCHEDULE")}</p>
          <div
            className="mb-1.5 grid gap-1"
            style={{ gridTemplateColumns: `40px repeat(${Math.max(1, daysPerWeek)}, 1fr)` }}
          >
            <span />
            {dayHeaders.map((name, i) => (
              <span
                key={i}
                className="truncate text-center font-display text-[9px] font-bold uppercase tracking-[0.08em] text-ink3"
                title={name}
              >
                {name}
              </span>
            ))}
          </div>
          {mesos.map((mv, mi) => (
            <div key={mv.meso.id} className={mi ? "mt-3" : ""}>
              {mesos.length > 1 && (
                <p className="eyebrow mb-1.5 text-[9px] text-ink2">
                  {t("MESOCYCLE")} {mi + 1} · {t(RULE_KEY[mv.meso.progressionRule])}
                </p>
              )}
              {mv.micros.map((wv) => (
                <div
                  key={wv.micro.id}
                  className="mb-1 grid gap-1"
                  style={{ gridTemplateColumns: `40px repeat(${Math.max(1, daysPerWeek)}, 1fr)` }}
                >
                  <span className="flex flex-col justify-center">
                    <span className="font-display text-[14px] font-extrabold tabular-nums text-ink">
                      {String(wv.micro.weekIndex + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-[0.06em] ${
                        wv.micro.isDeload ? "text-fade" : "text-ink3"
                      }`}
                    >
                      {wv.micro.isDeload ? t("DELOAD") : t("WK")}
                    </span>
                  </span>
                  {wv.days.map((dv) => {
                    const done = doneDayIds.has(dv.day.id);
                    const isToday = currentDay?.id === dv.day.id;
                    return (
                      <button
                        key={dv.day.id}
                        type="button"
                        title={dv.day.name}
                        aria-label={`${dv.day.name}${done ? ` — ${t("done")}` : isToday ? ` — ${t("today")}` : ""}`}
                        onClick={() => void startDay(dv.day.id)}
                        className={`grid aspect-square place-items-center border font-display font-extrabold ${
                          done
                            ? "border-ink bg-ink text-white"
                            : isToday
                              ? "border-accent bg-accentSoft text-accentInk"
                              : wv.micro.isDeload
                                ? "border-rule bg-[#f9f4e5] text-ink"
                                : "border-rule bg-card text-ink"
                        } active:bg-chip`}
                      >
                        {done ? (
                          <Check size={14} strokeWidth={2.5} />
                        ) : isToday ? (
                          <span className="text-[9px] uppercase tracking-[0.08em]">{t("Today")}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Progression note */}
        <div className="mx-[22px] mt-5 border border-rule px-3.5 py-3">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("Progression rule")}</p>
          <p className="text-[13px] leading-relaxed text-ink">
            {t(RULE_DESC[mesos[0]?.meso.progressionRule ?? "linear"])}
          </p>
        </div>
      </div>

      <div className="border-t border-rule p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => void (program.isActive ? deactivateProgram(id) : activateProgram(id))}
            className={`flex flex-1 items-center justify-center gap-2 py-4 ${
              program.isActive ? "border border-ink text-ink" : "bg-ink text-white"
            }`}
          >
            {program.isActive ? (
              <Pause size={16} strokeWidth={2.5} fill="currentColor" />
            ) : (
              <Play size={16} strokeWidth={2.5} fill="currentColor" />
            )}
            <span className="eyebrow text-[13px]">
              {program.isActive ? t("DEACTIVATE") : t("ACTIVATE PROGRAM")}
            </span>
          </button>
          {program.isActive && currentDay && (
            <button
              type="button"
              onClick={() => void startDay(currentDay.id)}
              className="flex flex-[1.4] items-center justify-center gap-2 bg-ink py-4 text-white"
            >
              <span className="eyebrow text-[13px]">{t("TODAY'S WORKOUT")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
