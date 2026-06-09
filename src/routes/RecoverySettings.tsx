import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { updateRecoverySettings } from "@core/db/mutations";
import { getRecoverySettings } from "@core/db/recovery";
import { BASE_RECOVERY } from "@core/calc/recovery";
import { ALL_MUSCLE_GROUPS, MUSCLE_I18N_KEY } from "@core/models/enums";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { Stepper } from "@ui/components/Stepper";
import { useGoBack } from "@app/hooks/useGoBack";

const DAY = 86_400_000;
const HOUR = 3600;

// Local-timezone yyyy-mm-dd ↔ epoch-ms (toISOString would shift across midnight).
const toDateInput = (ts: number | undefined): string => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromDateInput = (v: string): number | undefined => {
  const t = Date.parse(`${v}T00:00:00`);
  return Number.isFinite(t) ? t : undefined;
};

export function RecoverySettings() {
  const { t } = useTranslation();
  const goBack = useGoBack("/recovery");
  // Read-only merge over defaults; updateRecoverySettings creates the row on demand.
  const s = useLiveQuery(() => getRecoverySettings(), []);

  if (!s) return null;

  const thresholdRows = [
    { label: "Ready", key: "readyThreshold", min: s.mostlyRecoveredThreshold + 5, max: 100 },
    { label: "Mostly recovered", key: "mostlyRecoveredThreshold", min: s.partiallyRecoveredThreshold + 5, max: s.readyThreshold - 5 },
    { label: "Partially recovered", key: "partiallyRecoveredThreshold", min: s.recoveringThreshold + 5, max: s.mostlyRecoveredThreshold - 5 },
    { label: "Recovering", key: "recoveringThreshold", min: 0, max: s.partiallyRecoveredThreshold - 5 },
  ] as const;

  const customHours = (mg: string) => {
    const sec = s.customRecoveryTimes[mg];
    return Math.round((sec ?? BASE_RECOVERY[mg as keyof typeof BASE_RECOVERY] ?? 48 * HOUR) / HOUR);
  };

  async function setCustomHours(mg: string, hours: number) {
    const next = { ...s!.customRecoveryTimes, [mg]: hours * HOUR };
    await updateRecoverySettings({ customRecoveryTimes: next });
  }
  async function resetCustom(mg: string) {
    const next = { ...s!.customRecoveryTimes };
    delete next[mg];
    await updateRecoverySettings({ customRecoveryTimes: next });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Recovery settings")}
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {/* Status thresholds */}
        <p className="eyebrow text-ink3 px-[22px] pb-1 pt-4">{t("STATUS THRESHOLDS")}</p>
        <p className="px-[22px] pb-2 text-[12px] leading-snug text-ink2">
          {t("Recovery % needed for each status. Bands can't overlap.")}
        </p>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {thresholdRows.map((row) => (
            <li key={row.key} className="flex items-center justify-between px-[22px] py-3">
              <p className="font-display font-bold text-ink">{t(row.label)}</p>
              <Stepper
                value={s[row.key]}
                min={row.min}
                max={row.max}
                step={5}
                suffix="%"
                width="w-12"
                onChange={(v) => void updateRecoverySettings({ [row.key]: v })}
              />
            </li>
          ))}
        </ul>

        {/* Secondary muscle impact */}
        <p className="eyebrow text-ink3 px-[22px] pb-1 pt-6">{t("SECONDARY MUSCLES")}</p>
        <div className="flex items-center justify-between border-y border-hairline px-[22px] py-3">
          <div className="pr-4">
            <p className="font-display font-bold text-ink">{t("Secondary muscle impact")}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-ink2">
              {t("Indirect sets count at this fraction of a working set.")}
            </p>
          </div>
          <Stepper
            value={Math.round(s.secondaryMuscleImpact * 100)}
            min={0}
            max={100}
            step={10}
            suffix="%"
            width="w-12"
            onChange={(v) => void updateRecoverySettings({ secondaryMuscleImpact: v / 100 })}
          />
        </div>

        {/* Custom recovery times */}
        <p className="eyebrow text-ink3 px-[22px] pb-1 pt-6">{t("RECOVERY TIMES")}</p>
        <p className="px-[22px] pb-2 text-[12px] leading-snug text-ink2">
          {t("Base hours each muscle needs under optimal conditions.")}
        </p>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {ALL_MUSCLE_GROUPS.map((mg) => {
            const isCustom = s.customRecoveryTimes[mg] != null;
            return (
              <li key={mg} className="flex items-center justify-between px-[22px] py-2.5">
                <p className="font-display font-bold text-ink">
                  {t(MUSCLE_I18N_KEY[mg])}
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => void resetCustom(mg)}
                      className="eyebrow ml-2 text-[9px] text-accent"
                    >
                      {t("Reset")}
                    </button>
                  )}
                </p>
                <Stepper
                  value={customHours(mg)}
                  min={12}
                  max={168}
                  step={6}
                  suffix="h"
                  width="w-12"
                  onChange={(v) => void setCustomHours(mg, v)}
                />
              </li>
            );
          })}
        </ul>

        {/* Deload window */}
        <p className="eyebrow text-ink3 px-[22px] pb-1 pt-6">{t("DELOAD WINDOW")}</p>
        <p className="px-[22px] pb-2 text-[12px] leading-snug text-ink2">
          {t("While active, recovery times are multiplied — under 1.0 means lighter training recovers faster.")}
        </p>
        <div className="border-y border-hairline px-[22px] py-3">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <label className="block">
              <span className="eyebrow text-ink3 mb-1 block text-[9px]">{t("Start")}</span>
              <input
                type="date"
                value={toDateInput(s.deloadStartDate)}
                onChange={(e) =>
                  void updateRecoverySettings({ deloadStartDate: fromDateInput(e.target.value) })
                }
                className="border border-rule bg-card px-2 py-1.5 text-[13px] text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="eyebrow text-ink3 mb-1 block text-[9px]">{t("End")}</span>
              <input
                type="date"
                value={toDateInput(s.deloadEndDate)}
                onChange={(e) => {
                  const start = fromDateInput(e.target.value);
                  void updateRecoverySettings({
                    deloadEndDate: start != null ? start + DAY - 1 : undefined, // inclusive
                  });
                }}
                className="border border-rule bg-card px-2 py-1.5 text-[13px] text-ink focus:border-ink focus:outline-none"
              />
            </label>
            <div>
              <span className="eyebrow text-ink3 mb-1 block text-[9px]">{t("Multiplier")}</span>
              <Stepper
                value={Math.round(s.deloadMultiplier * 10) / 10}
                min={0.5}
                max={1.5}
                step={0.1}
                width="w-10"
                onChange={(v) =>
                  void updateRecoverySettings({ deloadMultiplier: Math.round(v * 10) / 10 })
                }
              />
            </div>
          </div>
          {(s.deloadStartDate || s.deloadEndDate) && (
            <button
              type="button"
              onClick={() =>
                void updateRecoverySettings({ deloadStartDate: undefined, deloadEndDate: undefined })
              }
              className="eyebrow mt-3 text-[10px] text-bad"
            >
              {t("Clear deload window")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
