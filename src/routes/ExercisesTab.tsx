import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Lightbulb, Search } from "lucide-react";
import { db } from "@core/db/db";
import {
  ALL_EQUIPMENT, ALL_MUSCLE_GROUPS, MUSCLE_I18N_KEY, type Equipment, type MuscleGroup,
} from "@core/models/enums";
import type { Exercise } from "@core/models/types";
import { IronTopBar } from "@ui/components/IronTopBar";
import { localizedExerciseName } from "@app/lib/format";

export function ExercisesTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [equip, setEquip] = useState<Equipment | "all">("all");
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (exercises ?? []).filter(
      (e) =>
        (muscle === "all" || e.muscleGroup === muscle) &&
        (equip === "all" || e.equipment === equip) &&
        (!q || e.nameEN.toLowerCase().includes(q) || e.nameCS.toLowerCase().includes(q)),
    );
    const byMuscle = new Map<MuscleGroup, Exercise[]>();
    for (const e of list) byMuscle.set(e.muscleGroup, [...(byMuscle.get(e.muscleGroup) ?? []), e]);
    return ALL_MUSCLE_GROUPS.filter((m) => byMuscle.has(m)).map((m) => ({
      muscle: m,
      items: byMuscle.get(m)!.sort((a, b) =>
        localizedExerciseName(a, i18n.language).localeCompare(localizedExerciseName(b, i18n.language)),
      ),
    }));
  }, [exercises, query, muscle, equip, i18n.language]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Exercises")} />

      <div className="space-y-2 px-[22px] py-3">
        <div className="flex items-center gap-2 border border-rule bg-card px-3 py-2.5">
          <Search size={16} className="text-ink3" strokeWidth={2.25} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search exercises")}
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink3"
          />
        </div>
        <div className="flex gap-2">
          <Filter
            label={t("MUSCLE")}
            value={muscle}
            onChange={(v) => setMuscle(v as MuscleGroup | "all")}
            options={[["all", ""], ...ALL_MUSCLE_GROUPS.map((m) => [m, t(MUSCLE_I18N_KEY[m])] as [string, string])]}
          />
          <Filter
            label={t("EQUIPMENT")}
            value={equip}
            onChange={(v) => setEquip(v as Equipment | "all")}
            options={[["all", ""], ...ALL_EQUIPMENT.map((e) => [e, t(`equipment.${e}`)] as [string, string])]}
          />
        </div>
      </div>

      {exercises === undefined ? null : total === 0 ? (
        <p className="px-[22px] py-10 text-center text-[13px] text-ink2">
          {t("Try a different keyword or clear the search.")}
        </p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {groups.map((g) => (
            <section key={g.muscle}>
              <div className="flex items-baseline justify-between border-b border-hairline px-[22px] py-1.5">
                <span className="eyebrow text-ink3">{t(MUSCLE_I18N_KEY[g.muscle])}</span>
                <span className="mono-num text-[11px] text-ink3">{g.items.length}</span>
              </div>
              <ul className="divide-y divide-hairline">
                {g.items.map((ex) => (
                  <li key={ex.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/exercises/${ex.id}`)}
                      className="flex w-full items-center justify-between px-[22px] py-3 text-left active:bg-chip"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-display font-semibold text-ink">
                          <span className="truncate">{localizedExerciseName(ex, i18n.language)}</span>
                          {ex.userNotes ? (
                            <Lightbulb size={12} strokeWidth={2.25} className="shrink-0 text-fade" />
                          ) : null}
                        </p>
                        <p className="eyebrow text-ink3 mt-0.5">
                          {t(`equipment.${ex.equipment}`)} · {t(`mechanic.${ex.mechanic}`)}
                        </p>
                      </div>
                      <ChevronRight size={16} strokeWidth={2.25} className="shrink-0 text-ink3" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="eyebrow flex-1 appearance-none border border-rule bg-card px-3 py-2 text-[11px] text-ink2 outline-none"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {v === "all" ? label : l}
        </option>
      ))}
    </select>
  );
}
