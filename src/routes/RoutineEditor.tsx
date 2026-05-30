import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Plus, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import {
  addExerciseToRoutine, removeRoutineExercise, renameRoutine, updateRoutineExercise,
} from "@core/db/mutations";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { Stepper } from "@ui/components/Stepper";
import { ExercisePicker } from "@app/components/ExercisePicker";
import { localizedExerciseName } from "@app/lib/format";

export function RoutineEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [picking, setPicking] = useState(false);

  const routine = useLiveQuery(() => db.routines.get(id), [id]);
  const rows = useLiveQuery(
    async () => {
      const res = (await db.routineExercises.where("routineId").equals(id).toArray()).sort(
        (a, b) => a.order - b.order,
      );
      return Promise.all(
        res.map(async (re) => ({ re, ex: await db.exercises.get(re.exerciseId) })),
      );
    },
    [id],
    [],
  );

  if (routine === undefined) return null;

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Edit routine")}
        trailing={
          <IronToolbarButton onClick={() => navigate(`/workout/routine/${id}`)} label={t("Save")}>
            <Check size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="px-[22px] py-4">
          <p className="eyebrow text-ink3 mb-1.5">{t("NAME")}</p>
          <input
            defaultValue={routine?.name ?? ""}
            onBlur={(e) => void renameRoutine(id, e.target.value)}
            placeholder={t("e.g. Push Day")}
            className="display-title w-full bg-transparent text-[26px] text-ink outline-none placeholder:text-ink3"
          />
        </div>

        <p className="eyebrow text-ink3 px-[22px] pb-2 pt-2">{t("EXERCISES")}</p>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {rows.map(({ re, ex }) => (
            <li key={re.id} className="px-[22px] py-3.5">
              <div className="flex items-center justify-between">
                <span className="font-display font-semibold text-ink">
                  {ex ? localizedExerciseName(ex, i18n.language) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => void removeRoutineExercise(re.id)}
                  aria-label={t("Delete")}
                  className="grid h-8 w-8 place-items-center text-ink3 active:text-bad"
                >
                  <Trash2 size={16} strokeWidth={2.25} />
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Field label={t("SETS")}>
                  <Stepper value={re.targetSets} min={1} max={12}
                    onChange={(v) => void updateRoutineExercise(re.id, { targetSets: v })} />
                </Field>
                <Field label={t("REPS")}>
                  <div className="flex items-center gap-1">
                    <Stepper value={re.targetRepsMin} min={1} max={re.targetRepsMax}
                      onChange={(v) => void updateRoutineExercise(re.id, { targetRepsMin: v })} />
                    <span className="text-ink3">–</span>
                    <Stepper value={re.targetRepsMax} min={re.targetRepsMin} max={50}
                      onChange={(v) => void updateRoutineExercise(re.id, { targetRepsMax: v })} />
                  </div>
                </Field>
                <Field label={t("REST")}>
                  <Stepper value={re.restSeconds} min={0} max={600} step={15} suffix="s" width="w-12"
                    onChange={(v) => void updateRoutineExercise(re.id, { restSeconds: v })} />
                </Field>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setPicking(true)}
          className="mx-[22px] mt-5 flex items-center gap-2 border border-ink px-4 py-3 text-ink active:bg-chip"
        >
          <Plus size={16} strokeWidth={2.5} />
          <span className="eyebrow text-[12px]">{t("ADD EXERCISE")}</span>
        </button>
      </div>

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(exerciseId) => {
            void addExerciseToRoutine(id, exerciseId);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow text-ink3 mb-1 text-[9px]">{label}</p>
      {children}
    </div>
  );
}
