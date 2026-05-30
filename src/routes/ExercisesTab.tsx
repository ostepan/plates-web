import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { db } from "@core/db/db";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import type { Exercise } from "@core/models/types";
import { IronTopBar } from "@ui/components/IronTopBar";

function localizedName(ex: Exercise, lang: string): string {
  return lang.startsWith("cs") ? ex.nameCS : ex.nameEN;
}

export function ExercisesTab() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);

  const filtered = useMemo(() => {
    const list = (exercises ?? [])
      .slice()
      .sort((a, b) => localizedName(a, i18n.language).localeCompare(localizedName(b, i18n.language)));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.nameEN.toLowerCase().includes(q) || e.nameCS.toLowerCase().includes(q),
    );
  }, [exercises, query, i18n.language]);

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Exercises")} />

      <div className="px-[22px] py-3">
        <div className="flex items-center gap-2 border border-rule bg-card px-3 py-2.5">
          <Search size={16} className="text-ink3" strokeWidth={2.25} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search exercises")}
            className="mono-num w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink3"
          />
        </div>
      </div>

      {exercises === undefined ? null : (
        <ul className="flex-1 divide-y divide-hairline overflow-y-auto">
          {filtered.map((ex) => (
            <li key={ex.id} className="flex items-baseline justify-between px-[22px] py-3.5">
              <span className="font-display font-semibold text-ink">
                {localizedName(ex, i18n.language)}
              </span>
              <span className="eyebrow text-ink3">{t(MUSCLE_I18N_KEY[ex.muscleGroup])}</span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-[22px] py-10 text-center text-[13px] text-ink2">
              {t("Try a different keyword or clear the search.")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
