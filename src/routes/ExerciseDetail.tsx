import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Lightbulb, Pencil, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import { deleteExercise, updateExerciseNotes } from "@core/db/mutations";
import { exerciseE1RMSeries, exerciseSessionHistory, type ExerciseHistoryEntry } from "@core/db/analytics";
import { muscleRecovery } from "@core/db/recovery";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import type { Point } from "@core/calc/performance";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { formatDuration, localizedExerciseName, relativeDay, weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";

export function ExerciseDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const cs = i18n.language.startsWith("cs");
  const unit = weightUnit();

  const ex = useLiveQuery(() => db.exercises.get(id), [id], undefined);
  const series = useLiveQuery(() => exerciseE1RMSeries(id), [id], [] as Point[]);
  const history = useLiveQuery(() => exerciseSessionHistory(id, 10), [id], [] as ExerciseHistoryEntry[]);
  const recoveryPct = useLiveQuery(
    async () => {
      const mg = (await db.exercises.get(id))?.muscleGroup;
      if (!mg) return undefined;
      const r = (await muscleRecovery()).find((x) => x.muscleGroup === mg);
      return r ? Math.round(r.recoveryPercentage) : undefined;
    },
    [id],
    undefined,
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

  function onNotesChange(value: string) {
    setNotes(value);
    void updateExerciseNotes(id, value);
  }

  async function onDelete() {
    if (!window.confirm(t("Delete this custom exercise?"))) return;
    await deleteExercise(id);
    navigate("/exercises", { replace: true });
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
          ex.isCustom ? (
            <div className="flex items-center gap-1.5">
              <IronToolbarButton onClick={() => navigate(`/exercises/${id}/edit`)} label={t("Edit")}>
                <Pencil size={16} strokeWidth={2.25} />
              </IronToolbarButton>
              <IronToolbarButton onClick={() => void onDelete()} label={t("Delete exercise")}>
                <Trash2 size={16} strokeWidth={2.25} />
              </IronToolbarButton>
            </div>
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="px-[22px] pb-4 pt-2">
          <p className="eyebrow text-accent mb-1">
            {[t(MUSCLE_I18N_KEY[ex.muscleGroup]), ex.isCustom ? t("Custom") : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1 className="display-title text-[34px] text-ink">
            {localizedExerciseName(ex, i18n.language)}.
          </h1>
        </div>

        {/* Performance: PR / last performed / muscle recovery */}
        <div className="grid grid-cols-3 divide-x divide-hairline border-y border-hairline">
          <Stat
            label={t("Best e1RM")}
            value={series.length ? `${Math.round(Math.max(...series.map((p) => p.value)))}` : "—"}
            sub={series.length ? unit : undefined}
          />
          <Stat
            label={t("Last")}
            value={history.length ? relativeDay(history[0].date, i18n.language) : "—"}
          />
          <Stat
            label={t("Recovery")}
            value={recoveryPct != null ? `${recoveryPct}%` : "—"}
            tone={recoveryPct != null ? (recoveryPct < 50 ? "text-accent" : recoveryPct < 75 ? "text-warn" : "text-ok") : undefined}
          />
        </div>

        {/* e1RM trend */}
        {series.length >= 2 ? (
          <section className="px-[22px] pt-5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="eyebrow text-ink3">{t("e1RM trend")}</p>
              <p className="mono-num text-[11px] text-ink3">
                {Math.round(series[0].value)} → <b className="text-ink">{Math.round(series[series.length - 1].value)}</b> {unit}
              </p>
            </div>
            <Sparkline points={series} />
          </section>
        ) : null}

        {/* Session history */}
        <section className="pt-5">
          <p className="eyebrow text-ink3 mb-1.5 px-[22px]">{t("History")}</p>
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
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="px-[14px] py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{label}</p>
      <p className={`mt-px font-display text-[16px] font-extrabold tracking-[-0.3px] tabular-nums ${tone ?? "text-ink"}`}>
        {value}
        {sub ? <span className="ml-1 text-[10px] font-semibold text-ink3">{sub}</span> : null}
      </p>
    </div>
  );
}

/** Tiny dependency-free e1RM line chart — keeps Recharts out of the main bundle. */
function Sparkline({ points }: { points: Point[] }) {
  const w = 320;
  const h = 88;
  const pad = 5;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="e1RM">
      <line x1={pad} y1={y(max)} x2={w - pad} y2={y(max)} stroke="rgba(23,22,20,0.07)" />
      <line x1={pad} y1={y(min)} x2={w - pad} y2={y(min)} stroke="rgba(23,22,20,0.07)" />
      <path d={d} fill="none" stroke="#171614" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="3" fill="#C64D2A" />
    </svg>
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
