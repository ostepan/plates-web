import { useTranslation } from "react-i18next";
import { IronTopBar } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";

export function AnalyticsTab() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Analytics")} />
      <IronEmptyState
        eyebrow="STATS · 00"
        title={t("Finish your first\nworkout")}
        body={t(
          "Finish your first workout to start building stats, streak, and consistency heatmap.",
        )}
      />
    </div>
  );
}
