import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { db } from "@core/db/db";
import { updateVolumeTarget } from "@core/db/mutations";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { Stepper } from "@ui/components/Stepper";
import { useGoBack } from "@app/hooks/useGoBack";

export function VolumeTargets() {
  const { t } = useTranslation();
  // Reached from Profile *and* the Recovery trends deload card — pop to origin.
  const goBack = useGoBack("/profile");
  const targets = useLiveQuery(
    async () => (await db.muscleVolumeTargets.toArray()).sort((a, b) => a.muscleGroup.localeCompare(b.muscleGroup)),
    [],
    [],
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Volume targets")}
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <p className="eyebrow text-ink3 px-[22px] py-3">{t("WEEKLY SETS · MEV / MAV / MRV")}</p>
      <ul className="divide-y divide-hairline overflow-y-auto border-t border-hairline">
        {targets.map((tgt) => (
          <li key={tgt.id} className="px-[22px] py-3.5">
            <p className="font-display font-bold text-ink">{t(MUSCLE_I18N_KEY[tgt.muscleGroup])}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Cell label="MEV">
                <Stepper value={tgt.mev} min={0} max={tgt.mav} onChange={(v) => void updateVolumeTarget(tgt.id, { mev: v })} />
              </Cell>
              <Cell label="MAV">
                <Stepper value={tgt.mav} min={tgt.mev} max={tgt.mrv} onChange={(v) => void updateVolumeTarget(tgt.id, { mav: v })} />
              </Cell>
              <Cell label="MRV">
                <Stepper value={tgt.mrv} min={tgt.mav} max={40} onChange={(v) => void updateVolumeTarget(tgt.id, { mrv: v })} />
              </Cell>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow text-ink3 mb-1 text-[9px]">{label}</p>
      {children}
    </div>
  );
}
