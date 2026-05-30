import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { weeklyVolumeByMuscle } from "@core/db/analytics";
import { MUSCLE_I18N_KEY } from "@core/models/enums";

/** Weekly working-sets per muscle vs MEV/MAV/MRV — custom Iron bars. */
export function VolumeSegment() {
  const { t } = useTranslation();
  const rows = useLiveQuery(() => weeklyVolumeByMuscle(7), [], []);

  return (
    <div className="px-[22px] py-5">
      <p className="eyebrow text-ink3 mb-4">{t("THIS WEEK · SETS / MUSCLE")}</p>
      <div className="space-y-3.5">
        {rows.map((r) => {
          const scaleMax = Math.max(r.mrv, r.sets, 1);
          const pct = (n: number) => `${(n / scaleMax) * 100}%`;
          const tone =
            r.sets < r.mev ? "bg-ink3" : r.sets <= r.mav ? "bg-ok" : r.sets <= r.mrv ? "bg-warn" : "bg-bad";
          return (
            <div key={r.muscleGroup}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="eyebrow text-ink2">{t(MUSCLE_I18N_KEY[r.muscleGroup])}</span>
                <span className="mono-num text-[12px] text-ink3">
                  {r.sets} <span className="text-ink3/60">/ {r.mrv}</span>
                </span>
              </div>
              <div className="relative h-2.5 bg-chip">
                <div className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: pct(r.sets) }} />
                {/* MEV / MRV markers */}
                <div className="absolute inset-y-0 w-px bg-ink/30" style={{ left: pct(r.mev) }} />
                <div className="absolute inset-y-0 w-px bg-ink/50" style={{ left: pct(r.mrv) }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mono-num mt-5 text-[11px] text-ink3">{t("marker: MEV · MRV")}</p>
    </div>
  );
}
