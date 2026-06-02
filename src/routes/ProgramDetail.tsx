import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Pause, Play, Trash2 } from "lucide-react";
import { activateProgram, deactivateProgram, deleteProgram, startProgramDay } from "@core/db/mutations";
import { loadProgram } from "@core/db/queries";
import type { ProgressionRule } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";

const RULE_KEY: Record<ProgressionRule, string> = {
  linear: "LINEAR",
  doubleProgression: "DOUBLE PROGRESSION",
  percentageOf1RM: "% OF 1RM",
  rirBased: "RIR-BASED",
};

export function ProgramDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const data = useLiveQuery(() => loadProgram(id), [id]);
  if (data === undefined) return null;
  if (data === null) {
    navigate("/programs", { replace: true });
    return null;
  }
  const { program, daysPerWeek, mesos } = data;

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
          <IronToolbarButton onClick={() => navigate("/programs")} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
        trailing={
          program.isBuiltIn ? undefined : (
            <IronToolbarButton onClick={() => void onDelete()} label={t("Delete")}>
              <Trash2 size={16} strokeWidth={2.25} />
            </IronToolbarButton>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <div className="px-[22px] pb-4 pt-2">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-accent">
              {program.weeks} {t("WEEKS")} · {daysPerWeek} {t("DAYS/WK")}
            </p>
            {program.isActive && (
              <span className="eyebrow border border-accent px-1.5 py-0.5 text-accent">{t("ACTIVE")}</span>
            )}
          </div>
          <h1 className="display-title mt-1 text-[32px] text-ink">{program.name}</h1>
          {program.notes && <p className="mt-2 text-[13px] leading-relaxed text-ink2">{program.notes}</p>}
        </div>

        <p className="eyebrow text-ink3 px-[22px] pb-2 pt-2">{t("SCHEDULE")}</p>
        {mesos.map((mv, mi) => (
          <section key={mv.meso.id} className="pb-4">
            <div className="flex items-center justify-between px-[22px] pb-2">
              <span className="eyebrow text-ink2">
                {t("MESOCYCLE")} {mi + 1}
              </span>
              <span className="eyebrow border border-rule px-1.5 py-0.5 text-ink3">
                {t(RULE_KEY[mv.meso.progressionRule])}
              </span>
            </div>
            <div className="space-y-2 px-[22px]">
              {mv.micros.map((wv) => (
                <div key={wv.micro.id} className="flex items-center gap-3">
                  <span className="mono-num w-6 text-[14px] font-bold text-ink">
                    {String(wv.micro.weekIndex + 1).padStart(2, "0")}
                  </span>
                  <span className={`eyebrow w-16 ${wv.micro.isDeload ? "text-fade" : "text-ink3"}`}>
                    {wv.micro.isDeload ? t("DELOAD") : t("WK")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {wv.days.map((dv) => (
                      <button
                        key={dv.day.id}
                        type="button"
                        title={dv.day.name}
                        onClick={() => void startDay(dv.day.id)}
                        className={`mono-num border px-2 py-1 text-[11px] ${
                          wv.micro.isDeload ? "border-rule bg-chip text-ink2" : "border-rule bg-card text-ink"
                        } active:bg-ink active:text-white`}
                      >
                        D{dv.day.dayIndex}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-rule p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void (program.isActive ? deactivateProgram(id) : activateProgram(id))}
          className={`flex w-full items-center justify-center gap-2 py-4 text-white ${
            program.isActive ? "bg-ink2" : "bg-ink"
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
      </div>
    </div>
  );
}
