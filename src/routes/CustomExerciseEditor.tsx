import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft } from "lucide-react";
import { db } from "@core/db/db";
import { createCustomExercise, updateCustomExercise, type ExerciseInput } from "@core/db/mutations";
import {
  ALL_EQUIPMENT, ALL_MUSCLE_GROUPS, MUSCLE_I18N_KEY,
  type Equipment, type Mechanic, type MuscleGroup,
} from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { Stepper } from "@ui/components/Stepper";

const MECHANICS: Mechanic[] = ["compound", "isolation"];

export function CustomExerciseEditor() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { t } = useTranslation();

  const existing = useLiveQuery(
    async () => (id ? await db.exercises.get(id) : undefined),
    [id],
    undefined,
  );

  const [nameEN, setNameEN] = useState("");
  const [nameCS, setNameCS] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("chest");
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<Equipment>("barbell");
  const [mechanic, setMechanic] = useState<Mechanic>("compound");
  const [rest, setRest] = useState(120);
  const [instrEN, setInstrEN] = useState("");
  const [instrCS, setInstrCS] = useState("");

  // Populate the form once when editing an existing exercise.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (existing && loadedFor.current !== existing.id) {
      setNameEN(existing.nameEN);
      setNameCS(existing.nameCS === existing.nameEN ? "" : existing.nameCS);
      setMuscleGroup(existing.muscleGroup);
      setSecondary(existing.secondary);
      setEquipment(existing.equipment);
      setMechanic(existing.mechanic);
      setRest(existing.defaultRestSeconds);
      setInstrEN(existing.instructionsEN ?? "");
      setInstrCS(existing.instructionsCS ?? "");
      loadedFor.current = existing.id;
    }
  }, [existing]);

  // Stock exercises aren't structurally editable — bounce to the detail view.
  useEffect(() => {
    if (isEdit && existing && !existing.isCustom) navigate(`/exercises/${id}`, { replace: true });
  }, [isEdit, existing, id, navigate]);

  if (isEdit && existing === undefined) return null; // loading

  const canSave = nameEN.trim().length > 0;

  function toggleSecondary(m: MuscleGroup) {
    setSecondary((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function save() {
    if (!canSave) return;
    const input: ExerciseInput = {
      nameEN, nameCS, muscleGroup, secondary, equipment, mechanic,
      defaultRestSeconds: rest,
      instructionsEN: instrEN,
      instructionsCS: instrCS,
    };
    if (isEdit && id) {
      await updateCustomExercise(id, input);
      navigate(`/exercises/${id}`, { replace: true });
    } else {
      const newId = await createCustomExercise(input);
      navigate(`/exercises/${newId}`, { replace: true });
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        leading={
          <IronToolbarButton onClick={() => navigate(isEdit ? `/exercises/${id}` : "/exercises")} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
        trailing={
          <IronToolbarButton
            tint={canSave ? "bg-accent" : "bg-ink3"}
            onClick={() => void save()}
            label={t("Save")}
          >
            <Check size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="px-[22px] pb-4 pt-2">
          <p className="eyebrow text-accent mb-1">{t("Custom")}</p>
          <h1 className="display-title text-[34px] text-ink">
            {isEdit ? t("Edit exercise") : t("New exercise")}.
          </h1>
        </div>

        <div className="space-y-5 px-[22px]">
          <Field label={t("Name")}>
            <TextInput value={nameEN} onChange={setNameEN} placeholder={t("Exercise name")} />
          </Field>
          <Field label={t("Name (Czech)")}>
            <TextInput value={nameCS} onChange={setNameCS} placeholder={nameEN || t("Optional")} />
          </Field>

          <Field label={t("Primary muscle")}>
            <Select
              value={muscleGroup}
              onChange={(v) => setMuscleGroup(v as MuscleGroup)}
              options={ALL_MUSCLE_GROUPS.map((m) => [m, t(MUSCLE_I18N_KEY[m])])}
            />
          </Field>

          <Field label={t("Secondary")}>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MUSCLE_GROUPS.filter((m) => m !== muscleGroup).map((m) => {
                const on = secondary.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleSecondary(m)}
                    aria-pressed={on}
                    className={`eyebrow border px-2 py-1 text-[10px] ${
                      on ? "border-ink bg-ink text-white" : "border-rule text-ink2"
                    }`}
                  >
                    {t(MUSCLE_I18N_KEY[m])}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t("Equipment")}>
            <Select
              value={equipment}
              onChange={(v) => setEquipment(v as Equipment)}
              options={ALL_EQUIPMENT.map((e) => [e, t(`equipment.${e}`)])}
            />
          </Field>

          <Field label={t("Mechanic")}>
            <div className="flex gap-1.5">
              {MECHANICS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMechanic(m)}
                  aria-pressed={mechanic === m}
                  className={`eyebrow flex-1 border py-2 text-[11px] ${
                    mechanic === m ? "border-ink bg-ink text-white" : "border-rule text-ink2"
                  }`}
                >
                  {t(`mechanic.${m}`)}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t("Default rest")}>
            <Stepper value={rest} onChange={setRest} min={0} max={600} step={15} suffix="s" width="w-12" />
          </Field>

          <Field label={t("Instructions")}>
            <Textarea value={instrEN} onChange={setInstrEN} placeholder={t("How to perform it (optional)")} />
          </Field>
          <Field label={t("Instructions (Czech)")}>
            <Textarea value={instrCS} onChange={setInstrCS} placeholder={t("Optional")} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="eyebrow text-ink3 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-rule bg-card px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink3 focus:border-ink2"
    />
  );
}

function Textarea({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-y border border-rule bg-card px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink3 focus:border-ink2"
    />
  );
}

function Select({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none border border-rule bg-card px-3 py-2.5 text-[14px] text-ink outline-none focus:border-ink2"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
