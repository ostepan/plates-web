import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { db } from "@core/db/db";
import { ALL_MUSCLE_GROUPS, MUSCLE_I18N_KEY, type MuscleGroup } from "@core/models/enums";
import type { ID } from "@core/models/types";
import { localizedExerciseName } from "@app/lib/format";

/** Full-screen exercise chooser. Calls `onPick` with the chosen exercise id. */
export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (exerciseId: ID) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);

  const muscles = useMemo(() => {
    const present = new Set((exercises ?? []).map((e) => e.muscleGroup));
    return ALL_MUSCLE_GROUPS.filter((m) => present.has(m));
  }, [exercises]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (exercises ?? [])
      .filter(
        (e) =>
          (muscle === "all" || e.muscleGroup === muscle) &&
          (!q || e.nameEN.toLowerCase().includes(q) || e.nameCS.toLowerCase().includes(q)),
      )
      .sort((a, b) =>
        localizedExerciseName(a, i18n.language).localeCompare(localizedExerciseName(b, i18n.language)),
      );
  }, [exercises, query, muscle, i18n.language]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-hairline px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5">
        <h1 className="display-title text-[22px]">{t("Pick exercise")}</h1>
        <div className="flex-1" />
        <button type="button" onClick={onClose} aria-label={t("Cancel")} className="grid h-10 w-10 place-items-center bg-ink text-white">
          <X size={18} strokeWidth={2.5} />
        </button>
      </header>

      <div className="space-y-2 px-[22px] py-3">
        <div className="flex items-center gap-2 border border-rule bg-card px-3 py-2.5">
          <Search size={16} className="text-ink3" strokeWidth={2.25} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search exercises")}
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink3"
          />
        </div>
        <div className="-mx-[22px] flex gap-1.5 overflow-x-auto px-[22px] pb-0.5">
          <MuscleChip
            label={t("All")}
            active={muscle === "all"}
            onClick={() => setMuscle("all")}
          />
          {muscles.map((m) => (
            <MuscleChip
              key={m}
              label={t(MUSCLE_I18N_KEY[m])}
              active={muscle === m}
              onClick={() => setMuscle((cur) => (cur === m ? "all" : m))}
            />
          ))}
        </div>
      </div>

      {exercises !== undefined && filtered.length === 0 ? (
        <p className="px-[22px] py-10 text-center text-[13px] text-ink2">
          {t("Try a different keyword or clear the search.")}
        </p>
      ) : null}

      <ul className="flex-1 divide-y divide-hairline overflow-y-auto">
        {filtered.map((ex) => (
          <li key={ex.id}>
            <button
              type="button"
              onClick={() => onPick(ex.id)}
              className="flex w-full items-baseline justify-between px-[22px] py-3.5 text-left active:bg-chip"
            >
              <span className="font-display font-semibold text-ink">
                {localizedExerciseName(ex, i18n.language)}
              </span>
              <span className="eyebrow text-ink3">{t(MUSCLE_I18N_KEY[ex.muscleGroup])}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MuscleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`eyebrow shrink-0 whitespace-nowrap border px-3 py-1.5 text-[11px] ${
        active ? "border-ink bg-ink text-white" : "border-rule bg-card text-ink2"
      }`}
    >
      {label}
    </button>
  );
}
