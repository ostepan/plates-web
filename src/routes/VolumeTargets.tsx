import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { db } from "@core/db/db";
import { updateVolumeTarget } from "@core/db/mutations";
import { weeklyVolumeByMuscle } from "@core/db/analytics";
import { MUSCLE_I18N_KEY, type MuscleGroup } from "@core/models/enums";
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
  const weekly = useLiveQuery(() => weeklyVolumeByMuscle(7), [], []);
  const setsByMuscle = new Map<MuscleGroup, number>(weekly.map((w) => [w.muscleGroup, w.sets]));

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
      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="border-b border-rule px-[22px] pb-4 pt-3">
          <p className="eyebrow text-accent">{t("PER-MUSCLE · WEEKLY SETS")}</p>
          <p className="mt-2 max-w-[320px] text-[13px] leading-relaxed text-ink2">
            {t("MEV minimum, MAV maximum adaptive, MRV maximum recoverable. RP defaults shown — tap to adjust.")}
          </p>
        </div>
        <ul className="px-[22px]">
          {targets.map((tgt) => {
            const sets = setsByMuscle.get(tgt.muscleGroup) ?? 0;
            return (
              <li key={tgt.id} className="border-b border-hairline py-3.5">
                <div className="flex items-baseline justify-between">
                  <p className="font-display text-[15px] font-bold text-ink">{t(MUSCLE_I18N_KEY[tgt.muscleGroup])}</p>
                  <p className="mono-num text-[11px] tabular-nums text-ink3">
                    {sets} {t("sets this wk")}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <Cell label="MEV" stripe="bg-bad">
                    <Stepper width="w-7" value={tgt.mev} min={0} max={tgt.mav} onChange={(v) => void updateVolumeTarget(tgt.id, { mev: v })} />
                  </Cell>
                  <Cell label="MAV" stripe="bg-ok">
                    <Stepper width="w-7" value={tgt.mav} min={tgt.mev} max={tgt.mrv} onChange={(v) => void updateVolumeTarget(tgt.id, { mav: v })} />
                  </Cell>
                  <Cell label="MRV" stripe="bg-warn">
                    <Stepper width="w-7" value={tgt.mrv} min={tgt.mav} max={40} onChange={(v) => void updateVolumeTarget(tgt.id, { mrv: v })} />
                  </Cell>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Cell({ label, stripe, children }: { label: string; stripe: string; children: React.ReactNode }) {
  return (
    <div className="relative border border-rule px-2 py-2 pl-3">
      <span className={`absolute bottom-0 left-0 top-0 w-0.5 ${stripe}`} />
      <p className="eyebrow text-ink3 mb-1 text-[9px]">{label}</p>
      {children}
    </div>
  );
}
