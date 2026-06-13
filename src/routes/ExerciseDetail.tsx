import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, Lightbulb, Pencil, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import { addExerciseToRoutine, deleteExercise, updateExerciseNotes } from "@core/db/mutations";
import {
  exerciseE1RMSeries, exerciseSessionHistory, exerciseTruePR,
  type ExerciseHistoryEntry, type TruePR,
} from "@core/db/analytics";
import { programOwnedRoutineIds } from "@core/db/queries";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import type { Point } from "@core/calc/performance";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { Sparkline } from "@ui/components/Sparkline";
import { formatDuration, localizedExerciseName, relativeDay, weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";
import { ironConfirm } from "@app/stores/confirm";

const DAY = 86_400_000;
const PERIODS = [
  { id: "1M", days: 30 },
  { id: "3M", days: 91 },
  { id: "6M", days: 182 },
  { id: "1Y", days: 365 },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

export function ExerciseDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const cs = i18n.language.startsWith("cs");
  const unit = weightUnit();
  const [period, setPeriod] = useState<PeriodId>("3M");
  const [routinePicker, setRoutinePicker] = useState(false);
  const [addedTo, setAddedTo] = useState<string | null>(null);

  const ex = useLiveQuery(() => db.exercises.get(id), [id], undefined);
  const series = useLiveQuery(() => exerciseE1RMSeries(id), [id], [] as Point[]);
  const history = useLiveQuery(() => exerciseSessionHistory(id, 10), [id], [] as ExerciseHistoryEntry[]);
  const truePR = useLiveQuery(() => exerciseTruePR(id), [id], null as TruePR | null);
  const routines = useLiveQuery(
    async () => {
      const owned = await programOwnedRoutineIds();
      return (await db.routines.toArray()).filter((r) => !owned.has(r.id));
    },
    [],
    [],
  );

  // Local copy of the form cues so live-query re-emits don't clobber typing.
  const [notes, setNotes] = useState("");
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (ex && loadedFor.current !== ex.id) {
      setNotes(ex.userNotes ?? "");
      loadedFor.current = ex.id;
    }
  }, [ex]);

  const windowed = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)!.days;
    const since = Date.now() - days * DAY;
    return series.filter((p) => p.date >= since);
  }, [series, period]);

  // Δ over the last 4 weeks of the full series — the "↗ +X in 4w" caption.
  const delta4w = useMemo(() => {
    if (series.length < 2) return null;
    const since = Date.now() - 28 * DAY;
    const inWindow = series.filter((p) => p.date >= since);
    if (inWindow.length < 2) return null;
    return Math.round(inWindow[inWindow.length - 1].value - inWindow[0].value);
  }, [series]);

  // Reached from the exercise list *and* mid-workout — go back to wherever we came from.
  const goBack = useGoBack("/exercises");

  if (ex === undefined) return null; // loading
  if (ex === null) {
    return (
      <div className="flex h-[100dvh] flex-col bg-bg">
        <IronTopBar
          leading={
            <IronToolbarButton onClick={goBack} label={t("Back")}>
              <ChevronLeft size={18} strokeWidth={2.5} />
            </IronToolbarButton>
          }
        />
        <p className="px-[22px] py-10 text-center text-[13px] text-ink2">{t("Not found")}</p>
      </div>
    );
  }

  const instructions = cs
    ? ex.instructionsCS || ex.instructionsEN
    : ex.instructionsEN || ex.instructionsCS;
  const latestE1RM = series.length ? Math.round(series[series.length - 1].value) : null;

  function onNotesChange(value: string) {
    setNotes(value);
    void updateExerciseNotes(id, value);
  }

  async function onDelete() {
    if (!(await ironConfirm({ title: t("Delete this custom exercise?"), confirmLabel: t("Delete"), destructive: true }))) return;
    await deleteExercise(id);
    navigate("/exercises", { replace: true });
  }

  async function addToRoutine(routineId: string, routineName: string) {
    await addExerciseToRoutine(routineId, id);
    setRoutinePicker(false);
    setAddedTo(routineName);
    window.setTimeout(() => setAddedTo(null), 2500);
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRoutinePicker(true)}
              className="border border-rule px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink active:bg-chip"
            >
              {t("Add to routine")}
            </button>
            {ex.isCustom ? (
              <>
                <IronToolbarButton onClick={() => navigate(`/exercises/${id}/edit`)} label={t("Edit")}>
                  <Pencil size={16} strokeWidth={2.25} />
                </IronToolbarButton>
                <IronToolbarButton onClick={() => void onDelete()} label={t("Delete exercise")}>
                  <Trash2 size={16} strokeWidth={2.25} />
                </IronToolbarButton>
              </>
            ) : null}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="px-[22px] pb-4 pt-2">
          <p className="eyebrow text-accent mb-1">
            {[
              t(MUSCLE_I18N_KEY[ex.muscleGroup]),
              t(`equipment.${ex.equipment}`),
              t(`mechanic.${ex.mechanic}`),
              ex.isCustom ? t("Custom") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1 className="display-title text-[34px] text-ink">
            {localizedExerciseName(ex, i18n.language)}.
          </h1>
        </div>

        {addedTo && (
          <p className="mx-[22px] mb-3 flex items-center gap-2 bg-accentSoft px-3 py-2 text-[12px] text-accentInk">
            <Check size={13} strokeWidth={3} /> {t("Added to")} <b>{addedTo}</b>
          </p>
        )}

        {/* Performance: estimated 1RM + true PR (design 2-up) */}
        <div className="grid grid-cols-2 border-y border-rule">
          <div className="border-r border-rule px-[18px] py-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("Est 1RM")}</p>
            <p className="mt-1 font-display text-[34px] font-extrabold leading-none tabular-nums tracking-[-1.2px] text-ink">
              {latestE1RM ?? "—"}
              {latestE1RM != null && <span className="ml-1 text-[12px] font-bold text-ink2">{unit}</span>}
            </p>
            {delta4w != null && delta4w !== 0 && (
              <p className={`mt-1 font-display text-[11px] font-bold ${delta4w > 0 ? "text-accent" : "text-ink3"}`}>
                {delta4w > 0 ? "↗ +" : "↘ "}
                {delta4w} {t("in 4w")}
              </p>
            )}
          </div>
          <div className="px-[18px] py-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("True PR")}</p>
            <p className="mt-1 font-display text-[34px] font-extrabold leading-none tabular-nums tracking-[-1.2px] text-ink">
              {truePR ? truePR.weight : "—"}
              {truePR && <span className="ml-1 text-[12px] font-bold text-ink2">{unit}</span>}
            </p>
            {truePR && (
              <p className="mt-1 text-[11px] text-ink3">
                {new Date(truePR.date).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })} ·{" "}
                {truePR.reps} {t("reps")}
              </p>
            )}
          </div>
        </div>

        {/* e1RM trend with period selector */}
        {series.length >= 2 ? (
          <section className="px-[22px] pt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="eyebrow text-ink3">{t("1RM TREND")}</p>
              <div className="flex gap-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={`px-2 py-[3px] font-display text-[10px] font-bold ${
                      p.id === period ? "bg-ink text-white" : "border border-rule text-ink3"
                    }`}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
            </div>
            {windowed.length >= 2 ? (
              <>
                <Sparkline points={windowed} />
                <div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.05em] text-ink3">
                  <span>
                    {new Date(windowed[0].date).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}
                  </span>
                  <span>
                    {new Date(windowed[windowed.length - 1].date).toLocaleDateString(i18n.language, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </>
            ) : (
              <p className="py-4 text-[12px] text-ink2">{t("Not enough sessions in this window.")}</p>
            )}
          </section>
        ) : null}

        {/* Session history */}
        <section className="pt-5">
          <p className="eyebrow text-ink3 mb-1.5 px-[22px]">{t("SESSIONS")}</p>
          {history.length === 0 ? (
            <p className="px-[22px] py-3 text-[13px] text-ink2">{t("No history yet")}</p>
          ) : (
            <ul className="divide-y divide-hairline border-y border-hairline">
              {history.map((h) => (
                <li key={h.sessionId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/history/${h.sessionId}`)}
                    className="w-full px-[22px] py-3 text-left active:bg-chip/50"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-semibold text-ink">
                        {new Date(h.date).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" })}
                        <span className="ml-2 text-[10px] font-normal text-ink3">{relativeDay(h.date, i18n.language)}</span>
                      </span>
                      <span className="mono-num text-[11px] text-ink3">
                        e1RM <b className="text-ink">{Math.round(h.bestE1RM)}</b>
                      </span>
                    </div>
                    <p className="mono-num mt-0.5 text-[12px] text-ink2">
                      {h.sets.map((s) => `${s.weight}×${s.reps}`).join("  ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Meta */}
        <dl className="mt-5 divide-y divide-hairline border-y border-hairline">
          <MetaRow label={t("Equipment")} value={t(`equipment.${ex.equipment}`)} />
          <MetaRow label={t("Mechanic")} value={t(`mechanic.${ex.mechanic}`)} />
          <MetaRow label={t("Default rest")} value={formatDuration(ex.defaultRestSeconds)} mono />
          {ex.secondary.length > 0 && (
            <MetaRow
              label={t("Secondary")}
              value={ex.secondary.map((m) => t(MUSCLE_I18N_KEY[m])).join(", ")}
            />
          )}
        </dl>

        {/* Instructions (read-only, stock) */}
        {instructions ? (
          <section className="px-[22px] pt-5">
            <p className="eyebrow text-ink3 mb-1.5">{t("Instructions")}</p>
            <p className="text-[14px] leading-relaxed text-ink2 whitespace-pre-line">{instructions}</p>
          </section>
        ) : null}

        {/* Form cues (user-authored) */}
        <section className="px-[22px] pt-5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Lightbulb size={13} strokeWidth={2.25} className="text-fade" />
            <p className="eyebrow text-ink3">{t("Form cues")}</p>
          </div>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={t("Setup, form, reminders — just for you")}
            rows={3}
            className="w-full resize-y border border-rule bg-card px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink3 focus:border-ink2"
          />
        </section>
      </div>

      {/* Routine picker sheet */}
      {routinePicker && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/55" onClick={() => setRoutinePicker(false)}>
          <div className="max-h-[70dvh] w-full overflow-y-auto bg-bg pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow text-ink3 px-[22px] pb-2 pt-5">{t("ADD TO ROUTINE")}</p>
            {routines.length === 0 ? (
              <p className="px-[22px] py-4 text-[13px] text-ink2">{t("No routines yet — create one on the Workout tab.")}</p>
            ) : (
              <ul className="divide-y divide-hairline border-t border-hairline">
                {routines.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => void addToRoutine(r.id, r.name)}
                      className="w-full px-[22px] py-3.5 text-left font-display font-bold text-ink active:bg-chip"
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setRoutinePicker(false)}
              className="eyebrow mt-3 w-full py-2 text-center text-[11px] text-ink2"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between px-[22px] py-3">
      <dt className="eyebrow text-ink3">{label}</dt>
      <dd className={`text-[14px] text-ink ${mono ? "mono-num" : ""}`}>{value}</dd>
    </div>
  );
}

