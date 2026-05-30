import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { db } from "@core/db/db";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";

export function WorkoutTab() {
  const { t } = useTranslation();
  const routines = useLiveQuery(() => db.routines.toArray(), [], undefined);

  return (
    <div className="flex h-full flex-col">
      <IronTopBar
        title={t("Workout")}
        trailing={
          <IronToolbarButton tint="bg-accent" label={t("New routine")}>
            <Plus size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      {routines === undefined ? null : routines.length === 0 ? (
        <IronEmptyState
          eyebrow="ROUTINES · 00"
          title={t("Build your\nfirst routine")}
          body={t(
            "Pick exercises, set target reps and rest. Reuse from the workout tab whenever you're ready to lift.",
          )}
          actionLabel={t("NEW ROUTINE")}
          onAction={() => {}}
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {routines.map((r) => (
            <li key={r.id} className="px-[22px] py-4">
              <span className="font-display font-bold text-ink">{r.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
