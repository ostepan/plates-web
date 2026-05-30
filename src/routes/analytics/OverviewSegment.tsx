import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, HeartPulse } from "lucide-react";
import { consistency, overviewStats } from "@core/db/analytics";
import { weightUnit } from "@app/lib/format";
import { ConsistencyHeatmap } from "@app/components/ConsistencyHeatmap";

export function OverviewSegment() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const stats = useLiveQuery(() => overviewStats(), []);
  const days = useLiveQuery(() => consistency(12), [], []);
  const unit = weightUnit();
  if (!stats) return null;

  return (
    <div className="space-y-7 px-[22px] py-5">
      <dl className="grid grid-cols-2 gap-y-6">
        <Stat label={t("WORKOUTS")} value={String(stats.workouts)} />
        <Stat label={t("VOLUME")} value={`${Math.round(stats.totalVolume)} ${unit}`} />
        <Stat label={t("SETS")} value={String(stats.totalSets)} />
        <Stat label={t("STREAK")} value={`${stats.streakDays}`} />
      </dl>

      <div>
        <p className="eyebrow text-ink3 mb-2">{t("CONSISTENCY")}</p>
        <ConsistencyHeatmap data={days} />
      </div>

      <div className="-mx-[22px] divide-y divide-hairline border-t border-hairline">
        <NavRow icon={<HeartPulse size={18} className="text-accent" strokeWidth={2.25} />} label={t("Recovery")} onClick={() => navigate("/recovery")} />
        <NavRow label={t("History")} onClick={() => navigate("/history")} />
      </div>
    </div>
  );
}

function NavRow({ icon, label, onClick }: { icon?: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between px-[22px] py-4 text-left active:bg-chip">
      <span className="flex items-center gap-3 font-display font-bold text-ink">
        {icon}
        {label}
      </span>
      <ChevronRight size={18} className="text-ink3" strokeWidth={2.5} />
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow text-ink3 text-[9px]">{label}</p>
      <p className="mono-num mt-0.5 text-[28px] font-black text-ink">{value}</p>
    </div>
  );
}
