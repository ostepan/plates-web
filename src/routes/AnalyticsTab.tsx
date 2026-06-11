import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IronTopBar } from "@ui/components/IronTopBar";
import { IronSegmented } from "@ui/components/IronSegmented";
import { HistoryList } from "./History";
import { RecoveryComposer } from "./Recovery";
import { OverviewSegment } from "./analytics/OverviewSegment";
import { VolumeSegment } from "./analytics/VolumeSegment";
import { ExerciseSegment } from "./analytics/ExerciseSegment";
import { CompareSegment } from "./analytics/CompareSegment";
import { PRsSegment } from "./analytics/PRsSegment";

// Iron canvas layout: primary History / Charts / Recovery / PRs,
// with a dense secondary picker under Charts.
type Page = "history" | "charts" | "recovery" | "prs";
type ChartPage = "exercise" | "volume" | "compare" | "stats";

export function AnalyticsTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("charts");
  const [chartPage, setChartPage] = useState<ChartPage>("exercise");

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Analytics")} />
      <IronSegmented<Page>
        value={page}
        onChange={setPage}
        options={[
          { value: "history", label: t("History") },
          { value: "charts", label: t("Charts") },
          { value: "recovery", label: t("Recovery") },
          { value: "prs", label: t("PRS") },
        ]}
      />
      {page === "charts" && (
        <IronSegmented<ChartPage>
          dense
          value={chartPage}
          onChange={setChartPage}
          options={[
            { value: "exercise", label: t("Exercise") },
            { value: "volume", label: t("VOLUME") },
            { value: "compare", label: t("COMPARE") },
            { value: "stats", label: t("Stats") },
          ]}
        />
      )}
      {page === "recovery" ? (
        <RecoveryComposer dense />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {page === "history" && <HistoryList />}
          {page === "charts" && chartPage === "exercise" && <ExerciseSegment />}
          {page === "charts" && chartPage === "volume" && <VolumeSegment />}
          {page === "charts" && chartPage === "compare" && <CompareSegment />}
          {page === "charts" && chartPage === "stats" && <OverviewSegment />}
          {page === "prs" && <PRsSegment />}
        </div>
      )}
    </div>
  );
}
