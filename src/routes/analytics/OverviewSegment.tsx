import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Flame } from "lucide-react";
import { consistency, overviewStats } from "@core/db/analytics";
import { weightUnit } from "@app/lib/format";
import { ConsistencyHeatmap } from "@app/components/ConsistencyHeatmap";

/** 3_420_000 → "3.42M", 74_200 → "74.2k". */
function compactVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

export function OverviewSegment() {
  const { t } = useTranslation();
  const stats = useLiveQuery(() => overviewStats(), []);
  const days = useLiveQuery(() => consistency(12), [], []);
  const unit = weightUnit();
  if (!stats) return null;

  return (
    <div className="space-y-6 px-[22px] py-5">
      {/* Streak hero */}
      <div className="flex items-center gap-4 bg-ink px-[22px] py-5 text-white">
        <Flame size={40} strokeWidth={1.8} className="shrink-0 text-accent" fill="currentColor" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">{t("Current streak")}</p>
          <p className="mt-0.5 font-display text-[34px] font-extrabold leading-none tabular-nums tracking-[-1.2px]">
            {stats.streakDays}{" "}
            <span className="text-[13px] font-bold text-white/50">
              {stats.streakDays === 1 ? t("day") : t("days")}
            </span>
          </p>
          {stats.bestStreakDays > 0 && (
            <p className="mt-0.5 text-[11px] text-white/50">
              {t("Best ever")}: {stats.bestStreakDays} {stats.bestStreakDays === 1 ? t("day") : t("days")}
            </p>
          )}
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 border border-rule">
        {(
          [
            [t("This week"), String(stats.weekSessions), t("sessions")],
            [t("This mo"), String(stats.monthSessions), t("sessions")],
            [t("All-time"), String(stats.workouts), t("sessions")],
            [t("All-vol"), compactVolume(stats.totalVolume), unit],
            [t("Avg dur"), String(stats.avgDurationMin), t("min")],
            [t("Days/wk"), String(stats.daysPerWeek), ""],
          ] as const
        ).map(([label, value, suffix], i) => (
          <div
            key={label}
            className={`px-4 py-3.5 ${i % 2 === 0 ? "border-r border-rule" : ""} ${i < 4 ? "border-b border-rule" : ""}`}
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{label}</p>
            <p className="mt-1 flex items-baseline gap-1">
              <span className="font-display text-[22px] font-extrabold tabular-nums tracking-[-0.5px] text-ink">
                {value}
              </span>
              {suffix && <span className="text-[10px] font-semibold text-ink3">{suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className="eyebrow text-ink3 mb-2">{t("CONSISTENCY")}</p>
        <ConsistencyHeatmap data={days} />
      </div>
    </div>
  );
}
