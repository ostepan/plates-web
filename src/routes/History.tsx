import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { db } from "@core/db/db";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { formatDuration, relativeDay, weightUnit } from "@app/lib/format";

export function History() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const unit = weightUnit();

  const sessions = useLiveQuery(
    async () => (await db.sessions.where("durationSeconds").above(0).toArray()).sort((a, b) => b.date - a.date),
    [],
    undefined,
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("History")}
        leading={
          <IronToolbarButton onClick={() => navigate("/workout")} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      {sessions === undefined ? <HistorySkeleton /> : sessions.length === 0 ? (
        <IronEmptyState
          eyebrow={t("HISTORY · 00")}
          title={t("No history\nyet")}
          body={t(
            "Finish your first workout and it'll land here — sortable by month, searchable by exercise or routine name.",
          )}
        />
      ) : (
        <ul className="divide-y divide-hairline overflow-y-auto">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => navigate(`/history/${s.id}`)}
                className="flex w-full items-center justify-between px-[22px] py-4 text-left active:bg-chip"
              >
                <div>
                  <p className="font-display font-bold text-ink">
                    {s.routineNameSnapshot || t("Workout")}
                  </p>
                  <p className="mono-num text-[12px] text-ink3">
                    {relativeDay(s.date, i18n.language)} · {formatDuration(s.durationSeconds)}
                  </p>
                </div>
                <span className="mono-num text-[14px] text-ink2">
                  {Math.round(s.totalVolume)} {unit}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Placeholder shown while history loads — mirrors the session rows. */
function HistorySkeleton() {
  return (
    <ul className="animate-pulse divide-y divide-hairline overflow-y-auto motion-reduce:animate-none" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex items-center justify-between px-[22px] py-4">
          <span>
            <span className="block h-4 w-32 bg-chip" />
            <span className="mt-1.5 block h-2.5 w-24 bg-chip" />
          </span>
          <span className="block h-4 w-16 bg-chip" />
        </li>
      ))}
    </ul>
  );
}
