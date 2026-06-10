import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { db } from "@core/db/db";
import { prTimeline } from "@core/db/analytics";
import type { MuscleGroup } from "@core/models/enums";
import type { Exercise } from "@core/models/types";
import { localizedExerciseName, weightUnit } from "@app/lib/format";

type PRFilter = "all" | "big4" | "upper" | "lower";

const UPPER: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps", "forearms"];
const LOWER: MuscleGroup[] = ["legs", "glutes", "calves"];
const BIG4 = /bench press|squat|deadlift|overhead press/i;

const FILTERS: { id: PRFilter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "big4", label: "BIG-4" },
  { id: "upper", label: "UPPER" },
  { id: "lower", label: "LOWER" },
];

export function PRsSegment() {
  const { t, i18n } = useTranslation();
  const unit = weightUnit();
  const [filter, setFilter] = useState<PRFilter>("all");

  const prs = useLiveQuery(
    async () => {
      const list = await prTimeline();
      const ids = [...new Set(list.map((p) => p.exerciseId))];
      const exMap = new Map(
        (await db.exercises.bulkGet(ids)).filter((e): e is Exercise => !!e).map((e) => [e.id, e]),
      );
      return list.map((p) => ({ ...p, exercise: exMap.get(p.exerciseId) }));
    },
    [],
    [],
  );

  const filtered = useMemo(
    () =>
      prs.filter((p) => {
        if (filter === "all" || !p.exercise) return filter === "all";
        if (filter === "big4") return BIG4.test(p.exercise.nameEN);
        if (filter === "upper") return UPPER.includes(p.exercise.muscleGroup);
        return LOWER.includes(p.exercise.muscleGroup);
      }),
    [prs, filter],
  );

  if (prs.length === 0) {
    return (
      <p className="px-[22px] py-12 text-center text-[13px] text-ink2">
        {t("Finish a workout that beats one of your previous bests and it'll show up on this timeline.")}
      </p>
    );
  }

  return (
    <div className="pb-10 pt-1">
      {/* Filter chips */}
      <div className="flex gap-1.5 px-[22px]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-[11px] py-1.5 text-[10px] font-bold tracking-[0.1em] ${
              f.id === filter ? "bg-ink text-white" : "border border-rule text-ink2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <p className="px-[22px] py-10 text-center text-[13px] text-ink2">{t("No PRs in this group yet.")}</p>
      ) : (
        <div className="px-[22px] pt-5">
          {filtered.map((p, i) => (
            <div key={`${p.exerciseId}-${p.date}-${i}`} className="relative flex gap-3.5">
              {/* Rail + dot */}
              <div className="relative w-3.5 shrink-0">
                {i < filtered.length - 1 && (
                  <span className="absolute bottom-[-8px] left-[6px] top-1.5 w-[2px] bg-rule" />
                )}
                <span className="relative z-[1] mt-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-accent">
                  <Trophy size={8} strokeWidth={3} className="text-white" />
                </span>
              </div>
              <div className="flex-1 pb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink3">
                  {new Date(p.date).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })} · e1RM
                </p>
                <div className="mt-0.5 flex items-baseline gap-2.5">
                  <span className="font-display text-[17px] font-extrabold tracking-[-0.4px] text-ink">
                    {p.exercise ? localizedExerciseName(p.exercise, i18n.language) : "—"}
                  </span>
                  <span className="ml-auto font-display text-[17px] font-extrabold tabular-nums tracking-[-0.4px] text-ink">
                    {Math.round(p.e1rm)}
                    <span className="ml-0.5 text-[10px] font-bold text-ink3">{unit}</span>
                  </span>
                </div>
                {p.prevE1rm > 0 && (
                  <p className="mono-num mt-0.5 text-[11px] font-bold text-accent">
                    +{Math.round((p.e1rm - p.prevE1rm) * 10) / 10} {t("from previous PR")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
