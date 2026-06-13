import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Trophy } from "lucide-react";
import { db } from "@core/db/db";
import { discardSession } from "@core/db/mutations";
import { sessionHighlights } from "@core/db/analytics";
import { OneRM } from "@core/calc/oneRM";
import type { Exercise, ID, WorkoutSet } from "@core/models/types";
import type { SetKind } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { formatDuration, localizedExerciseName, weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";
import { ironConfirm } from "@app/stores/confirm";

const KIND_ABBR: Record<SetKind, string> = {
  working: "", warmup: "W", dropset: "D", amrap: "A", restPause: "RP", myoReps: "M",
};

/** RIR → text color, matching the Iron RIRStyle scale (0 redlined → 4 fresh). */
function rirColorClass(rir: number): string {
  if (rir <= 0) return "text-bad";
  if (rir === 1) return "text-fade";
  if (rir === 2) return "text-warn";
  if (rir === 3) return "text-ok/80";
  return "text-ok";
}

function recoveryTone(pct: number): { bg: string; key: string } {
  if (pct >= 90) return { bg: "bg-ok", key: "Ready" };
  if (pct >= 70) return { bg: "bg-ok/80", key: "Productive" };
  if (pct >= 50) return { bg: "bg-warn", key: "Moderate" };
  if (pct >= 30) return { bg: "bg-fade", key: "Fatigued" };
  return { bg: "bg-bad", key: "Critical" };
}

export function SessionDetail() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack("/history");
  const { t, i18n } = useTranslation();
  const unit = weightUnit();

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const sxs = (await db.sessionExercises.where("sessionId").equals(sessionId).toArray()).sort(
      (a, b) => a.order - b.order,
    );
    const blocks: { id: ID; exercise?: Exercise; sets: WorkoutSet[] }[] = await Promise.all(
      sxs.map(async (sx) => ({
        id: sx.id,
        exercise: sx.exerciseId ? await db.exercises.get(sx.exerciseId) : undefined,
        sets: (await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray())
          .filter((s) => s.isCompleted)
          .sort((a, b) => a.order - b.order),
      })),
    );
    const highlights = await sessionHighlights(sessionId);
    return { session, blocks, prs: highlights.prs };
  }, [sessionId]);

  if (!data) return null;
  const { session, blocks, prs } = data;
  const prByExercise = new Map(prs.map((p) => [p.exerciseId, p.e1rm]));
  const setCount = blocks.reduce((n, b) => n + b.sets.filter((s) => s.kind === "working").length, 0);

  async function onDelete() {
    if (
      !(await ironConfirm({
        title: t("Delete this session?"),
        message: t("This can't be undone."),
        confirmLabel: t("Delete"),
        destructive: true,
      }))
    )
      return;
    await discardSession(sessionId);
    navigate("/history", { replace: true });
  }

  const dateLabel = new Date(session.date).toLocaleDateString(i18n.language, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const recovery =
    session.recoverySnapshotPercentage != null ? Math.round(session.recoverySnapshotPercentage) : null;
  const tone = recovery != null ? recoveryTone(recovery) : null;

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
        trailing={
          <button
            type="button"
            onClick={() => void onDelete()}
            className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink2 active:text-bad"
          >
            {t("Delete")}
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="border-b border-rule px-[22px] pb-[18px] pt-2">
          <p className="eyebrow text-accent">
            {t("History")} · {dateLabel}
          </p>
          <h1 className="display-title mt-1.5 text-[36px] leading-[0.95] text-ink">
            {session.routineNameSnapshot || t("Workout")}.
          </h1>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-4 border-b border-rule">
          <Stat label={t("TIME")} value={formatDuration(session.durationSeconds)} />
          <Stat label={t("SETS")} value={String(setCount)} />
          <Stat label={t("VOLUME")} value={String(Math.round(session.totalVolume))} unit={unit} />
          <Stat label={t("PRS")} value={String(prs.length)} last />
        </div>

        {/* Recovery-at-start snapshot */}
        {recovery != null && tone && (
          <div className="flex items-center gap-3 border-b border-rule bg-card px-[22px] py-3">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center font-display text-[12px] font-extrabold tabular-nums text-white ${tone.bg}`}
            >
              {recovery}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink3">
                {t("Recovery at start")}
              </span>
              <span className="block font-display text-[15px] font-bold tracking-[-0.2px] text-ink">
                {recovery}% — {t(tone.key)}
              </span>
            </span>
            {session.wasDeloadAtStart && (
              <span className="shrink-0 border border-fade px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[0.08em] text-fade">
                {t("Deload week")}
              </span>
            )}
          </div>
        )}

        {/* Per-exercise sections — every completed set */}
        {blocks.map((b, i) => {
          const vol = b.sets
            .filter((s) => s.kind === "working")
            .reduce((v, s) => v + s.weight * s.reps, 0);
          const prE1rm = b.exercise ? prByExercise.get(b.exercise.id) : undefined;
          // Flag the set that produced the PR e1RM (best working set of a PR exercise).
          const prSetId =
            prE1rm != null
              ? b.sets
                  .filter((s) => s.kind === "working")
                  .reduce<{ id: ID | null; e: number }>(
                    (acc, s) => {
                      const e = OneRM.epley(s.weight, s.reps);
                      return e > acc.e ? { id: s.id, e } : acc;
                    },
                    { id: null, e: 0 },
                  ).id
              : null;
          return (
            <section key={b.id} className="border-b border-hairline px-[22px] pb-4 pt-3.5">
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-[13px] font-extrabold tabular-nums text-ink3">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="flex-1 font-display text-[16px] font-bold tracking-[-0.2px] text-ink">
                  {b.exercise ? localizedExerciseName(b.exercise, i18n.language) : "—"}
                </h2>
                {vol > 0 && (
                  <span className="mono-num text-[13px] font-bold text-ink2">
                    {Math.round(vol)} {unit}
                  </span>
                )}
              </div>
              <ul className="ml-6 mt-2">
                {b.sets.map((s, si) => {
                  const label = s.kind === "working" ? String(si + 1) : KIND_ABBR[s.kind];
                  const e1rm = s.kind !== "warmup" ? Math.round(OneRM.epley(s.weight, s.reps)) : null;
                  return (
                    <li
                      key={s.id}
                      className={`flex items-center gap-2.5 py-1.5 ${si ? "border-t border-hairline" : ""}`}
                    >
                      <span
                        className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full font-display text-[11px] font-extrabold ${
                          s.kind === "warmup" ? "bg-chip text-ink2" : "bg-accentSoft text-accent"
                        }`}
                      >
                        {label}
                      </span>
                      <span className="font-display text-[14px] font-bold tabular-nums text-ink">
                        {s.weight}
                        <span className="ml-0.5 text-[9px] text-ink3">{unit}</span> × {s.reps}
                      </span>
                      {s.rir != null && (
                        <span className={`mono-num text-[10px] font-bold ${rirColorClass(s.rir)}`}>
                          RIR {s.rir}
                        </span>
                      )}
                      {e1rm ? (
                        <span className="mono-num ml-auto text-[10px] font-semibold text-ink3">~{e1rm}</span>
                      ) : null}
                      {s.id === prSetId && (
                        <span className={`flex items-center gap-1 text-accent ${e1rm ? "" : "ml-auto"}`}>
                          <Trophy size={11} strokeWidth={2.5} />
                          <span className="text-[9px] font-bold uppercase tracking-[0.08em]">PR</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {/* Session note */}
        {session.notes ? (
          <div className="mx-[22px] mt-[18px] border border-rule px-3.5 py-3">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("Note")}</p>
            <p className="text-[13px] leading-relaxed text-ink2 whitespace-pre-line">{session.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, last }: { label: string; value: string; unit?: string; last?: boolean }) {
  return (
    <div className={`px-3 py-3.5 ${last ? "" : "border-r border-rule"}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{label}</p>
      <p className="mt-1 font-display text-[20px] font-extrabold tracking-[-0.5px] tabular-nums text-ink">
        {value}
        {unit ? <span className="ml-0.5 text-[10px] font-semibold text-ink3">{unit}</span> : null}
      </p>
    </div>
  );
}
