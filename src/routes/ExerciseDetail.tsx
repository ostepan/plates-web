import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Lightbulb, Pencil, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import { deleteExercise, updateExerciseNotes } from "@core/db/mutations";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { formatDuration, localizedExerciseName } from "@app/lib/format";

export function ExerciseDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const cs = i18n.language.startsWith("cs");

  const ex = useLiveQuery(() => db.exercises.get(id), [id], undefined);

  // Local copy of the form cues so live-query re-emits don't clobber typing.
  const [notes, setNotes] = useState("");
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (ex && loadedFor.current !== ex.id) {
      setNotes(ex.userNotes ?? "");
      loadedFor.current = ex.id;
    }
  }, [ex]);

  if (ex === undefined) return null; // loading
  if (ex === null) {
    return (
      <div className="flex h-[100dvh] flex-col bg-bg">
        <IronTopBar
          leading={
            <IronToolbarButton onClick={() => navigate("/exercises")} label={t("Back")}>
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
          <IronToolbarButton onClick={() => navigate("/exercises")} label={t("Back")}>
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

        {/* Meta */}
        <dl className="divide-y divide-hairline border-y border-hairline">
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

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between px-[22px] py-3">
      <dt className="eyebrow text-ink3">{label}</dt>
      <dd className={`text-[14px] text-ink ${mono ? "mono-num" : ""}`}>{value}</dd>
    </div>
  );
}
