import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Clock } from "lucide-react";
import { db } from "@core/db/db";
import { IronTopBar } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";

export function AnalyticsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sessionCount = useLiveQuery(() => db.sessions.where("durationSeconds").above(0).count(), [], 0);

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Analytics")} />

      <button
        type="button"
        onClick={() => navigate("/history")}
        className="flex items-center justify-between border-b border-hairline px-[22px] py-4 text-left active:bg-chip"
      >
        <div className="flex items-center gap-3">
          <Clock size={18} className="text-ink3" strokeWidth={2.25} />
          <span className="font-display font-bold text-ink">{t("History")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="mono-num text-[13px] text-ink3">{sessionCount}</span>
          <ChevronRight size={18} className="text-ink3" strokeWidth={2.5} />
        </div>
      </button>

      {sessionCount === 0 ? (
        <IronEmptyState
          eyebrow="STATS · 00"
          title={t("Finish your first\nworkout")}
          body={t(
            "Finish your first workout to start building stats, streak, and consistency heatmap.",
          )}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-[22px]">
          <p className="text-[13px] text-ink2">{t("Charts land in the next milestone.")}</p>
        </div>
      )}
    </div>
  );
}
