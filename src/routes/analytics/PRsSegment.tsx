import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { db } from "@core/db/db";
import { prTimeline } from "@core/db/analytics";
import type { Exercise } from "@core/models/types";
import { localizedExerciseName, relativeDay, weightUnit } from "@app/lib/format";

export function PRsSegment() {
  const { t, i18n } = useTranslation();
  const unit = weightUnit();

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

  if (prs.length === 0) {
    return (
      <p className="px-[22px] py-12 text-center text-[13px] text-ink2">
        {t("Finish a workout that beats one of your previous bests and it'll show up on this timeline.")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-hairline">
      {prs.map((p, i) => (
        <li key={`${p.exerciseId}-${p.date}-${i}`} className="flex items-center gap-3 px-[22px] py-3.5">
          <Trophy size={16} className="text-accent" strokeWidth={2.25} />
          <div className="flex-1">
            <p className="font-display font-semibold text-ink">
              {p.exercise ? localizedExerciseName(p.exercise, i18n.language) : "—"}
            </p>
            <p className="mono-num text-[12px] text-ink3">{relativeDay(p.date, i18n.language)}</p>
          </div>
          <span className="mono-num text-[15px] font-bold text-ink">
            {Math.round(p.e1rm)} <span className="text-[12px] font-normal text-ink3">{unit}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
