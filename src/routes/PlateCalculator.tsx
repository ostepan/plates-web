import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { STANDARD_KG_PLATES, STANDARD_LB_PLATES, plates } from "@core/calc/plate";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";

export function PlateCalculator() {
  const { t } = useTranslation();
  const goBack = useGoBack("/profile");
  const unit = weightUnit();
  const defaultBar = unit === "kg" ? 20 : 45;
  const [target, setTarget] = useState(unit === "kg" ? 100 : 225);
  const [bar, setBar] = useState(defaultBar);

  const result = useMemo(
    () => plates(target, bar, unit === "kg" ? STANDARD_KG_PLATES : STANDARD_LB_PLATES),
    [target, bar, unit],
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Plate Calculator")}
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

      <div className="space-y-6 px-[22px] py-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("TARGET")}>
            <input
              type="number"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value) || 0)}
              className="mono-num w-full border border-rule bg-card px-3 py-2.5 text-[18px] font-bold text-ink outline-none focus:border-ink"
            />
          </Field>
          <Field label={t("BAR")}>
            <input
              type="number"
              inputMode="decimal"
              value={bar}
              onChange={(e) => setBar(Number(e.target.value) || 0)}
              className="mono-num w-full border border-rule bg-card px-3 py-2.5 text-[18px] font-bold text-ink outline-none focus:border-ink"
            />
          </Field>
        </div>

        <div>
          <p className="eyebrow text-ink3 mb-3">{t("PER SIDE")}</p>
          {result.perSide.length === 0 ? (
            <p className="text-[13px] text-ink2">{t("Just the bar.")}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-1.5">
              {result.perSide.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center bg-ink px-2 text-white"
                  style={{ height: `${28 + Math.min(72, p * 2.2)}px`, minWidth: "2.6rem" }}
                >
                  <span className="mono-num text-[13px] font-bold">{p}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mono-num mt-3 text-[12px] text-ink3">
            {result.perSide.length} {t("plates / side")}
            {result.unloaded > 0 && (
              <span className="text-bad"> · {result.unloaded} {unit} {t("unmatched")}</span>
            )}
          </p>
        </div>

        <div className="border-t border-hairline pt-4">
          <p className="mono-num text-[14px] text-ink2">
            {bar} {unit} {t("bar")} + 2 × ({result.perSide.join(" + ") || "0"}) = {" "}
            <span className="font-bold text-ink">{target - result.unloaded} {unit}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow text-ink3 mb-1.5">{label}</p>
      {children}
    </div>
  );
}
