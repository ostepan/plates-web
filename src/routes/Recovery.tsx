import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, X } from "lucide-react";
import { saveRecoveryCheckIn } from "@core/db/mutations";
import { muscleRecovery, todayFactors } from "@core/db/recovery";
import { MUSCLE_I18N_KEY } from "@core/models/enums";
import type { RecoveryVerdict } from "@core/calc/recovery";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";

const VERDICT: Record<RecoveryVerdict, { key: string; bar: string; text: string }> = {
  ready: { key: "READY", bar: "bg-ok", text: "text-ok" },
  acceptable: { key: "ALMOST", bar: "bg-info", text: "text-info" },
  caution: { key: "RECOVERING", bar: "bg-warn", text: "text-warn" },
  notRecommended: { key: "NEEDS REST", bar: "bg-fade", text: "text-fade" },
  avoid: { key: "JUST TRAINED", bar: "bg-bad", text: "text-bad" },
};

export function Recovery() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [checkingIn, setCheckingIn] = useState(false);
  const rows = useLiveQuery(() => muscleRecovery(), [], undefined);

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Recovery")}
        leading={
          <IronToolbarButton onClick={() => navigate("/analytics")} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

      <div className="px-[22px] py-3">
        <button
          type="button"
          onClick={() => setCheckingIn(true)}
          className="w-full bg-ink py-3 text-white"
        >
          <span className="eyebrow text-[12px]">{t("DAILY CHECK-IN")}</span>
        </button>
      </div>

      {rows === undefined ? null : rows.length === 0 ? (
        <IronEmptyState
          eyebrow={t("RECOVERY · 00")}
          title={t("No recovery\ndata yet")}
          body={t("Complete a workout that trains this muscle, then check back over the next few days.")}
        />
      ) : (
        <ul className="divide-y divide-hairline overflow-y-auto">
          {rows.map((r) => {
            const v = VERDICT[r.verdict];
            return (
              <li key={r.muscleGroup} className="px-[22px] py-3.5">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-bold text-ink">{t(MUSCLE_I18N_KEY[r.muscleGroup])}</span>
                  <span className="mono-num text-[15px] font-bold text-ink">{Math.round(r.recoveryPercentage)}%</span>
                </div>
                <div className="mt-1.5 h-2 bg-chip">
                  <div className={`h-full ${v.bar}`} style={{ width: `${r.recoveryPercentage}%` }} />
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className={`eyebrow text-[9px] ${v.text}`}>{t(v.key)}</span>
                  <span className="mono-num text-[11px] text-ink3">
                    {r.isReady
                      ? t("ready")
                      : r.daysUntilReady <= 1
                        ? t("~1 day")
                        : `~${r.daysUntilReady} ${t("days")}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {checkingIn && <CheckInModal onClose={() => setCheckingIn(false)} />}
    </div>
  );
}

const FACTORS = [
  { key: "sleepQuality", titleKey: "Sleep Quality", subKey: "How was your sleep last night?", invert: false },
  { key: "nutritionQuality", titleKey: "Nutrition Quality", subKey: "How was your nutrition today?", invert: false },
  { key: "stressLevel", titleKey: "Stress Level", subKey: "How stressed are you feeling?", invert: true },
  { key: "energyLevel", titleKey: "Energy Level", subKey: "How is your energy right now?", invert: false },
  { key: "sorenessLevel", titleKey: "Soreness Level", subKey: "How sore are your muscles?", invert: true },
] as const;

function CheckInModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const existing = useLiveQuery(() => todayFactors(), []);
  const [vals, setVals] = useState<Record<string, number>>({
    sleepQuality: 5, nutritionQuality: 5, stressLevel: 5, energyLevel: 5, sorenessLevel: 5,
  });

  // hydrate once from today's check-in
  const [hydrated, setHydrated] = useState(false);
  if (existing && !hydrated) {
    setHydrated(true);
    setVals({
      sleepQuality: existing.sleepQuality, nutritionQuality: existing.nutritionQuality,
      stressLevel: existing.stressLevel, energyLevel: existing.energyLevel, sorenessLevel: existing.sorenessLevel,
    });
  }

  async function save() {
    await saveRecoveryCheckIn({
      sleepQuality: vals.sleepQuality, nutritionQuality: vals.nutritionQuality,
      stressLevel: vals.stressLevel, energyLevel: vals.energyLevel, sorenessLevel: vals.sorenessLevel,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-hairline px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5">
        <h1 className="display-title text-[22px]">{t("Daily Recovery Check-in")}</h1>
        <div className="flex-1" />
        <button type="button" onClick={onClose} aria-label={t("Cancel")} className="grid h-10 w-10 place-items-center bg-ink text-white">
          <X size={18} strokeWidth={2.5} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-[22px] py-5">
        {FACTORS.map((f) => (
          <div key={f.key}>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[15px] font-bold text-ink">{t(f.titleKey)}</span>
              <span className="mono-num text-[18px] font-black text-ink">
                {vals[f.key]}
                <span className="text-[11px] font-normal text-ink3">/10</span>
              </span>
            </div>
            <p className="mb-2 text-[11px] text-ink2">{t(f.subKey)}</p>
            <input
              type="range"
              min={1}
              max={10}
              aria-label={t(f.titleKey)}
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
              className="w-full accent-ink"
            />
          </div>
        ))}
      </div>

      <div className="border-t border-rule p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => void save()} className="w-full bg-ink py-4 text-white">
          <span className="eyebrow text-[13px]">{t("Save")}</span>
        </button>
      </div>
    </div>
  );
}
