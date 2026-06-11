import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Lightbulb, Plus, Search } from "lucide-react";
import { db } from "@core/db/db";
import { bestE1RMByExercise, lastWorkingSetsByExercise } from "@core/db/analytics";
import {
  ALL_EQUIPMENT, ALL_MUSCLE_GROUPS, MUSCLE_I18N_KEY, type Equipment, type MuscleGroup,
} from "@core/models/enums";
import type { Exercise, ID } from "@core/models/types";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { localizedExerciseName } from "@app/lib/format";

/** "6h" / "2d" — dense last-trained stamp for list rows. */
function compactAgo(ts: number): string {
  const hours = Math.max(0, Math.floor((Date.now() - ts) / 3_600_000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

export function ExercisesTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [equip, setEquip] = useState<Equipment | "all">("all");
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], undefined);
  const prByExercise = useLiveQuery(() => bestE1RMByExercise(), [], new Map<ID, number>());
  const lastByExercise = useLiveQuery(
    () => lastWorkingSetsByExercise(""),
    [],
    new Map<ID, { date: number }>(),
  );

  // Three most recently trained — surfaced above the sections (design: "Recently used").
  const recent = useMemo(() => {
    if (!exercises) return [];
    return exercises
      .map((e) => ({ exercise: e, last: lastByExercise.get(e.id)?.date }))
      .filter((x): x is { exercise: Exercise; last: number } => x.last != null)
      .sort((a, b) => b.last - a.last)
      .slice(0, 3);
  }, [exercises, lastByExercise]);

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
      <IronTopBar
        title={t("Exercises")}
        trailing={
          <IronToolbarButton tint="bg-accent" onClick={() => navigate("/exercises/new")} label={t("New exercise")}>
            <Plus size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

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
        <div className="flex items-center gap-2">
          {/* Muscle chips (design) — equipment keeps the compact select */}
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["all", ...ALL_MUSCLE_GROUPS] as const).map((m) => {
              const active = m === muscle;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMuscle(m)}
                  className={`shrink-0 px-[11px] py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
                    active ? "bg-ink text-white" : "border border-rule text-ink2"
                  }`}
                >
                  {m === "all" ? t("ALL") : t(MUSCLE_I18N_KEY[m])}
                </button>
              );
            })}
          </div>
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
          {/* Recently used — only on the unfiltered view */}
          {!query.trim() && muscle === "all" && equip === "all" && recent.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between border-b border-hairline px-[22px] py-1.5">
                <span className="eyebrow text-ink3">{t("RECENTLY USED")}</span>
              </div>
              <ul className="divide-y divide-hairline">
                {recent.map(({ exercise: ex, last }) => {
                  const pr = prByExercise.get(ex.id);
                  return (
                    <li key={ex.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/exercises/${ex.id}`)}
                        className="flex w-full items-center gap-3 px-[22px] py-3 text-left active:bg-chip"
                      >
                        <span className="mono-num grid h-[30px] w-[30px] shrink-0 place-items-center bg-accentSoft text-[10px] font-extrabold text-accent">
                          {compactAgo(last)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-[15px] font-bold text-ink">
                            {localizedExerciseName(ex, i18n.language)}
                          </span>
                          <span className="eyebrow mt-0.5 block text-[9px] text-ink2">
                            {t(MUSCLE_I18N_KEY[ex.muscleGroup])} · {t(`equipment.${ex.equipment}`)}
                          </span>
                        </span>
                        <span className="mono-num shrink-0 text-[13px] font-bold tabular-nums text-ink">
                          {pr != null ? (
                            <>
                              {Math.round(pr)}
                              <span className="ml-0.5 text-[9px] text-ink3">1RM</span>
                            </>
                          ) : (
                            <span className="text-ink3">—</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {groups.map((g) => (
            <section key={g.muscle}>
              <div className="flex items-baseline justify-between border-b border-hairline px-[22px] py-1.5">
                <span className="eyebrow text-ink3">{t(MUSCLE_I18N_KEY[g.muscle])}</span>
                <span className="mono-num text-[11px] text-ink3">{g.items.length}</span>
              </div>
              <ul className="divide-y divide-hairline">
                {g.items.map((ex) => {
                  const pr = prByExercise.get(ex.id);
                  const last = lastByExercise.get(ex.id)?.date;
                  return (
                    <li key={ex.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/exercises/${ex.id}`)}
                        className="flex w-full items-center gap-3 px-[22px] py-3 text-left active:bg-chip"
                      >
                        <div className="min-w-0 flex-1">
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
                        {pr != null && (
                          <span className="shrink-0 text-right">
                            <span className="mono-num block text-[13px] font-bold tabular-nums text-ink">
                              {Math.round(pr)}
                            </span>
                            <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-ink3">
                              PR
                            </span>
                          </span>
                        )}
                        {last != null && (
                          <span className="mono-num w-7 shrink-0 text-right text-[10px] tabular-nums text-ink3">
                            {compactAgo(last)}
                          </span>
                        )}
                        <ChevronRight size={16} strokeWidth={2.25} className="shrink-0 text-ink3" />
                      </button>
                    </li>
                  );
                })}
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
      className="eyebrow w-[104px] shrink-0 appearance-none border border-rule bg-card px-2.5 py-2 text-[10px] text-ink2 outline-none"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {v === "all" ? label : l}
        </option>
      ))}
    </select>
  );
}
