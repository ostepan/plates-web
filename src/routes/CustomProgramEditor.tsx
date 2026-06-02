import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, ChevronLeft, Plus, X } from "lucide-react";
import { db } from "@core/db/db";
import { createCustomProgram, type CustomProgramInput } from "@core/db/mutations";
import { programOwnedRoutineIds } from "@core/db/queries";
import type { ProgressionRule } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { Stepper } from "@ui/components/Stepper";

const RULES: ProgressionRule[] = ["linear", "doubleProgression", "percentageOf1RM", "rirBased"];
const RULE_KEY: Record<ProgressionRule, string> = {
  linear: "LINEAR",
  doubleProgression: "DOUBLE PROGRESSION",
  percentageOf1RM: "% OF 1RM",
  rirBased: "RIR-BASED",
};

interface DayDraft {
  name: string;
  routineId: string;
}

export function CustomProgramEditor() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const routines = useLiveQuery(async () => {
    const owned = await programOwnedRoutineIds();
    return (await db.routines.toArray())
      .filter((r) => !owned.has(r.id))
      .sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt));
  }, [], undefined);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [deloadWeek, setDeloadWeek] = useState(-1); // -1 = none, else 0-based index
  const [rule, setRule] = useState<ProgressionRule>("doubleProgression");
  const [linearStep, setLinearStep] = useState(2.5);
  const [targetRIR, setTargetRIR] = useState(2);
  const [days, setDays] = useState<DayDraft[]>([]);

  if (routines === undefined) return null;
  const noRoutines = routines.length === 0;

  function setWeekCount(w: number) {
    setWeeks(w);
    if (deloadWeek >= w) setDeloadWeek(-1); // deload week no longer exists
  }

  function addDay() {
    if (noRoutines) return;
    setDays((prev) => [...prev, { name: "", routineId: routines![0].id }]);
  }
  function updateDay(i: number, patch: Partial<DayDraft>) {
    setDays((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }
  function removeDay(i: number) {
    setDays((prev) => prev.filter((_, j) => j !== i));
  }
  function moveDay(i: number, dir: -1 | 1) {
    setDays((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const canSave = name.trim().length > 0 && days.length > 0 && days.every((d) => d.routineId);

  async function save() {
    if (!canSave) return;
    const input: CustomProgramInput = {
      name, notes, weeks,
      deloadWeekIndex: deloadWeek >= 0 ? deloadWeek : undefined,
      progressionRule: rule,
      linearStepKg: rule === "linear" || rule === "doubleProgression" ? linearStep : undefined,
      targetRIR: rule === "rirBased" ? targetRIR : undefined,
      days: days.map((d) => ({ name: d.name, routineId: d.routineId })),
    };
    const id = await createCustomProgram(input);
    navigate(`/programs/${id}`, { replace: true });
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
          <IronToolbarButton tint={canSave ? "bg-accent" : "bg-ink3"} onClick={() => void save()} label={t("Save")}>
            <Check size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="px-[22px] pb-4 pt-2">
          <p className="eyebrow text-accent mb-1">{t("Custom")}</p>
          <h1 className="display-title text-[34px] text-ink">{t("New program")}.</h1>
        </div>

        <div className="space-y-5 px-[22px]">
          <Field label={t("Name")}>
            <TextInput value={name} onChange={setName} placeholder={t("Program name")} />
          </Field>
          <Field label={t("Notes")}>
            <Textarea value={notes} onChange={setNotes} placeholder={t("Optional")} />
          </Field>

          <div className="flex items-center justify-between">
            <p className="eyebrow text-ink3">{t("Weeks")}</p>
            <Stepper value={weeks} onChange={setWeekCount} min={1} max={12} />
          </div>

          <Field label={t("Deload week")}>
            <Select
              value={String(deloadWeek)}
              onChange={(v) => setDeloadWeek(Number(v))}
              options={[
                ["-1", t("None")],
                ...Array.from({ length: weeks }, (_, w) => [String(w), `${t("Week")} ${w + 1}`] as [string, string]),
              ]}
            />
          </Field>

          <Field label={t("Progression")}>
            <Select
              value={rule}
              onChange={(v) => setRule(v as ProgressionRule)}
              options={RULES.map((r) => [r, t(RULE_KEY[r])])}
            />
          </Field>

          {(rule === "linear" || rule === "doubleProgression") && (
            <div className="flex items-center justify-between">
              <p className="eyebrow text-ink3">{t("Linear step (kg)")}</p>
              <Stepper value={linearStep} onChange={setLinearStep} min={0.5} max={20} step={0.5} width="w-12" />
            </div>
          )}
          {rule === "rirBased" && (
            <div className="flex items-center justify-between">
              <p className="eyebrow text-ink3">{t("Target RIR")}</p>
              <Stepper value={targetRIR} onChange={setTargetRIR} min={0} max={6} />
            </div>
          )}

          {/* Days */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="eyebrow text-ink3">{t("Training days")}</p>
              <button
                type="button"
                onClick={addDay}
                disabled={noRoutines}
                className="flex items-center gap-1 text-accent disabled:opacity-40"
              >
                <Plus size={14} strokeWidth={2.5} />
                <span className="eyebrow text-[11px]">{t("Add day")}</span>
              </button>
            </div>

            {noRoutines ? (
              <p className="border border-rule bg-card px-3 py-3 text-[13px] text-ink2">
                {t("Create a routine first, then build a program from it.")}
              </p>
            ) : days.length === 0 ? (
              <p className="border border-dashed border-rule px-3 py-3 text-[13px] text-ink3">
                {t("Add at least one training day.")}
              </p>
            ) : (
              <ul className="space-y-2">
                {days.map((d, i) => (
                  <li key={i} className="border border-rule bg-card p-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="mono-num text-[12px] text-ink3">D{i + 1}</span>
                      <input
                        value={d.name}
                        onChange={(e) => updateDay(i, { name: e.target.value })}
                        placeholder={`${t("Day")} ${i + 1}`}
                        className="flex-1 border-b border-hairline bg-transparent px-1 py-1 text-[14px] text-ink outline-none placeholder:text-ink3 focus:border-ink2"
                      />
                      <button type="button" onClick={() => moveDay(i, -1)} aria-label={t("Move up")} className="text-ink3 disabled:opacity-30" disabled={i === 0}>
                        <ArrowUp size={15} strokeWidth={2.25} />
                      </button>
                      <button type="button" onClick={() => moveDay(i, 1)} aria-label={t("Move down")} className="text-ink3 disabled:opacity-30" disabled={i === days.length - 1}>
                        <ArrowDown size={15} strokeWidth={2.25} />
                      </button>
                      <button type="button" onClick={() => removeDay(i)} aria-label={t("Remove")} className="text-bad">
                        <X size={15} strokeWidth={2.25} />
                      </button>
                    </div>
                    <Select
                      value={d.routineId}
                      onChange={(v) => updateDay(i, { routineId: v })}
                      options={routines.map((r) => [r.id, r.name])}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
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
function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-rule bg-card px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink3 focus:border-ink2"
    />
  );
}
function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full resize-y border border-rule bg-card px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink3 focus:border-ink2"
    />
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
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
