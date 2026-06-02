import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IronTopBar } from "@ui/components/IronTopBar";
import { IronSegmented } from "@ui/components/IronSegmented";
import { OverviewSegment } from "./analytics/OverviewSegment";
import { VolumeSegment } from "./analytics/VolumeSegment";
import { ExerciseSegment } from "./analytics/ExerciseSegment";
import { CompareSegment } from "./analytics/CompareSegment";
import { PRsSegment } from "./analytics/PRsSegment";

type Segment = "overview" | "volume" | "exercise" | "compare" | "prs";

export function AnalyticsTab() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<Segment>("overview");

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Analytics")} />
      <IronSegmented<Segment>
        value={segment}
        onChange={setSegment}
        options={[
          { value: "overview", label: t("OVERVIEW") },
          { value: "volume", label: t("VOLUME") },
          { value: "exercise", label: t("CHART") },
          { value: "compare", label: t("COMPARE") },
          { value: "prs", label: t("PRS") },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {segment === "overview" && <OverviewSegment />}
        {segment === "volume" && <VolumeSegment />}
        {segment === "exercise" && <ExerciseSegment />}
        {segment === "compare" && <CompareSegment />}
        {segment === "prs" && <PRsSegment />}
      </div>
    </div>
  );
}
