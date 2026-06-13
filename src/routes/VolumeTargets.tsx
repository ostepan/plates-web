import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { db } from "@core/db/db";
import { applyVolumePreset, updateVolumeTarget } from "@core/db/mutations";
import { weeklyVolumeByMuscle } from "@core/db/analytics";
import { RP_HYPERTROPHY_TARGETS, STRENGTH_531_TARGETS } from "@core/db/seed";
import { MUSCLE_I18N_KEY, type MuscleGroup } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { Stepper } from "@ui/components/Stepper";
import { useGoBack } from "@app/hooks/useGoBack";
import { ironConfirm } from "@app/stores/confirm";

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

  // Which preset (if any) the current targets correspond to — drives the chips.
  const matchesPreset = (preset: [MuscleGroup, number, number, number][]) =>
    targets.length > 0 &&
    preset.every(([mg, mev, mav, mrv]) => {
      const row = targets.find((x) => x.muscleGroup === mg);
      return row && row.mev === mev && row.mav === mav && row.mrv === mrv;
    });
  const activePreset = matchesPreset(RP_HYPERTROPHY_TARGETS)
    ? "rp"
    : matchesPreset(STRENGTH_531_TARGETS)
      ? "strength"
      : "custom";

  async function pickPreset(preset: [MuscleGroup, number, number, number][], name: string) {
    if (!(await ironConfirm({ title: t("Replace all targets with the {{name}} preset?", { name }) }))) return;
    await applyVolumePreset(preset);
  }

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
        {/* Presets */}
        <div className="flex gap-1.5 px-[22px] pt-3.5">
          {(
            [
              ["rp", "RP HYPERTROPHY", RP_HYPERTROPHY_TARGETS],
              ["strength", "5/3/1 STRENGTH", STRENGTH_531_TARGETS],
              ["custom", t("CUSTOM"), null],
            ] as const
          ).map(([key, label, preset]) => (
            <button
              key={key}
              type="button"
              disabled={key === "custom" || key === activePreset}
              onClick={() => preset && void pickPreset(preset, label)}
              className={`px-2.5 py-1.5 text-[9px] font-bold tracking-[0.1em] ${
                key === activePreset ? "bg-ink text-white" : "border border-rule text-ink2"
              }`}
            >
              {label}
            </button>
          ))}
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
