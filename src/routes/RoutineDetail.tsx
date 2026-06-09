import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity, ArrowLeftRight, ChevronLeft, Pencil, Play } from "lucide-react";
import { db } from "@core/db/db";
import { startSessionFromRoutine, updateRoutineExercise } from "@core/db/mutations";
import { getRecoverySettings, getSwapSuggestions, muscleRecovery } from "@core/db/recovery";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import { supersetBadge } from "@core/superset";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { localizedExerciseName, relativeDay } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";

export function RoutineDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/workout");
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
  const verdict = useLiveQuery(async () => {
    const res = await db.routineExercises.where("routineId").equals(id).toArray();
    const exs = (await db.exercises.bulkGet(res.map((r) => r.exerciseId))).filter((e) => !!e);
    const muscles = [...new Set(exs.map((e) => e!.muscleGroup))];
    if (!muscles.length) return null;
    const settings = await getRecoverySettings();
    const line = settings.partiallyRecoveredThreshold;
    const recMap = new Map((await muscleRecovery()).map((r) => [r.muscleGroup, r.recoveryPercentage]));
    const pcts = muscles.map((m) => recMap.get(m) ?? 100); // untrained = recovered
    const readyCount = pcts.filter((p) => p >= line).length;
    const total = muscles.length;
    const avg = pcts.reduce((a, b) => a + b, 0) / total;
    const ratio = readyCount / total;
    let label = "Ready to train", color = "text-ok", bg = "bg-ink";
    const notRecommended = ratio < 0.34;
    if (notRecommended) { label = "Not recommended"; color = "text-bad"; bg = "bg-bad"; }
    else if (ratio < 0.67) { label = "Consider modifying"; color = "text-warn"; bg = "bg-warn"; }
    else if (avg < settings.readyThreshold) { label = "Mostly ready"; color = "text-ok"; }
    return { label, color, bg, readyCount, total, notRecommended, line };
  }, [id]);

  const swaps = useLiveQuery(() => getSwapSuggestions(id), [id], []);

  if (routine === undefined) return null;

  const muscles = [...new Set(rows.map((r) => r.ex?.muscleGroup).filter((m): m is NonNullable<typeof m> => !!m))];

  async function start() {
    if (
      verdict?.notRecommended &&
      !window.confirm(
        t("This routine targets fatigued muscles ({{ready}}/{{total}} ready). Start anyway?", {
          ready: verdict.readyCount,
          total: verdict.total,
        }),
      )
    )
      return;
    const sessionId = await startSessionFromRoutine(id);
    navigate(`/active/${sessionId}`, { replace: true });
  }

  async function swap(routineExerciseId: string, exerciseId: string) {
    await updateRoutineExercise(routineExerciseId, { exerciseId });
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
          <IronToolbarButton onClick={() => navigate(`/workout/routine/${id}/edit`)} label={t("Edit")}>
            <Pencil size={16} strokeWidth={2.25} />
          </IronToolbarButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-28">
        <div className="px-[22px] pb-4 pt-2">
          <p className="eyebrow text-accent mb-1">
            {[...muscles.slice(0, 2).map((m) => t(MUSCLE_I18N_KEY[m])), `${rows.length} ${t(rows.length === 1 ? "EXERCISE" : "EXERCISES")}`].join(" · ")}
          </p>
          <h1 className="display-title text-[34px] text-ink">{routine?.name}.</h1>
          {routine?.lastUsed && (
            <p className="mt-1.5 text-[13px] text-ink2">
              {t("Last performed")} {relativeDay(routine.lastUsed, i18n.language)}
            </p>
          )}
          {routine?.notes ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink2">{routine.notes}</p>
          ) : null}
        </div>

        {verdict && (
          <div className="mx-[22px] mb-4 flex items-center justify-between border border-rule bg-card px-4 py-3">
            <div className="flex items-center gap-3">
              <Activity size={18} className={verdict.color} strokeWidth={2.25} />
              <div>
                <p className="eyebrow text-ink3 text-[9px]">{t("RECOVERY VERDICT")}</p>
                <p className={`font-display font-bold ${verdict.color}`}>{t(verdict.label)}</p>
              </div>
            </div>
            <p className="mono-num text-right text-[12px] leading-tight text-ink3">
              {verdict.readyCount}/{verdict.total}
              <br />≥{verdict.line}%
            </p>
          </div>
        )}

        <ul className="divide-y divide-hairline border-y border-hairline">
          {rows.map(({ re, ex }, i) => {
            const badge = supersetBadge(rows.map((r) => r.re), i);
            return (
            <li key={re.id} className="flex items-baseline justify-between px-[22px] py-3.5">
              <div className="flex items-baseline gap-3">
                <span className="mono-num w-6 text-ink3">{String(i + 1).padStart(2, "0")}</span>
                {badge && (
                  <span className="mono-num self-center border border-accent px-1 text-[10px] font-bold text-accent">{badge.label}</span>
                )}
                <span className="font-display font-semibold text-ink">
                  {ex ? localizedExerciseName(ex, i18n.language) : "—"}
                </span>
              </div>
              <span className="mono-num text-[13px] text-ink2">
                {re.targetSets} × {re.targetRepsMin}–{re.targetRepsMax}
              </span>
            </li>
            );
          })}
        </ul>

        {swaps.length > 0 && (
          <section className="mt-5">
            <p className="eyebrow text-ink3 px-[22px] pb-2">{t("SUGGESTED SWAPS")}</p>
            <ul className="divide-y divide-hairline border-y border-hairline">
              {swaps.map((s) => (
                <li key={s.routineExerciseId} className="px-[22px] py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display font-semibold text-ink">
                      {localizedExerciseName(s.current, i18n.language)}
                    </span>
                    <span className="mono-num text-[11px] text-bad">
                      {Math.round(s.currentRecovery)}% {t("rec")}
                    </span>
                  </div>
                  <p className="eyebrow text-ink3 mb-1.5 mt-1">{t("FRESHER OPTIONS")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.candidates.map((c) => (
                      <button
                        key={c.exercise.id}
                        type="button"
                        onClick={() => void swap(s.routineExerciseId, c.exercise.id)}
                        className="flex items-center gap-1.5 border border-rule bg-card px-2 py-1 text-[12px] text-ink active:bg-ink active:text-white"
                      >
                        <ArrowLeftRight size={11} strokeWidth={2.25} className="text-ink3" />
                        {localizedExerciseName(c.exercise, i18n.language)}
                        <span className="mono-num text-[10px] text-ok">{Math.round(c.recovery)}%</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="border-t border-rule p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void start()}
          disabled={rows.length === 0}
          className={`flex w-full items-center justify-center gap-2 py-4 text-white disabled:opacity-40 ${verdict?.bg ?? "bg-ink"}`}
        >
          <Play size={16} strokeWidth={2.5} fill="currentColor" />
          <span className="eyebrow text-[13px]">{t("START WORKOUT")}</span>
        </button>
      </div>
    </div>
  );
}
