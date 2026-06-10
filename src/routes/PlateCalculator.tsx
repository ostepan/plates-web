import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { STANDARD_KG_PLATES, STANDARD_LB_PLATES, plates } from "@core/calc/plate";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";

export function PlateCalculator() {
  const { t } = useTranslation();
  const goBack = useGoBack("/profile");
  const unit = weightUnit();
  const kg = unit === "kg";
  const barOptions = kg ? [20, 15, 10, 0] : [45, 35, 25, 0];
  const step = kg ? 2.5 : 5;
  const [target, setTarget] = useState(kg ? 100 : 225);
  const [bar, setBar] = useState(barOptions[0]);

  const result = useMemo(
    () => plates(target, bar, kg ? STANDARD_KG_PLATES : STANDARD_LB_PLATES),
    [target, bar, kg],
  );
  // Group the per-side flat list (e.g. [45,45,25]) into ×count rows.
  const grouped = useMemo(() => {
    const out: { plate: number; count: number }[] = [];
    for (const p of result.perSide) {
      const last = out[out.length - 1];
      if (last && last.plate === p) last.count += 1;
      else out.push({ plate: p, count: 1 });
    }
    return out;
  }, [result]);
  const loaded = bar + result.perSide.reduce((s, p) => s + p, 0) * 2;
  const offBy = Math.round((target - loaded) * 100) / 100;
  const maxPlate = kg ? 25 : 45;

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

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {/* Steppers */}
        <div className="grid grid-cols-2 border-b border-rule">
          <div className="border-r border-rule px-[18px] py-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("TARGET")}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTarget((v) => Math.max(0, v - step))}
                aria-label={t("decrease")}
                className="grid h-7 w-7 shrink-0 place-items-center bg-chip text-ink"
              >
                <Minus size={14} strokeWidth={2.5} />
              </button>
              <span className="flex-1 text-center font-display text-[26px] font-extrabold tabular-nums tracking-[-0.8px] text-ink">
                {target}
                <span className="ml-0.5 text-[11px] font-semibold text-ink3">{unit}</span>
              </span>
              <button
                type="button"
                onClick={() => setTarget((v) => v + step)}
                aria-label={t("increase")}
                className="grid h-7 w-7 shrink-0 place-items-center bg-ink text-white"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <div className="px-[18px] py-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{t("BAR")}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {barOptions.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setBar(o)}
                  className={`px-2 py-1.5 font-display text-[12px] font-bold tabular-nums ${
                    o === bar ? "border border-ink bg-ink text-white" : "border border-rule text-ink2"
                  }`}
                >
                  {o === 0 ? t("none") : o}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Per-side visual */}
        <div className="px-[22px] pt-6">
          <p className="eyebrow text-ink3 mb-2">{t("PER SIDE")}</p>
          <div className="flex h-[100px] items-center gap-0.5">
            {/* Sleeve cap */}
            <span className="h-[18px] w-1.5 shrink-0 bg-ink3" />
            {result.perSide.length === 0 ? (
              <p className="ml-2.5 text-[12px] text-ink2">{t("Just the bar.")}</p>
            ) : (
              result.perSide.map((p, i) => {
                const f = p / maxPlate;
                return (
                  <span
                    key={i}
                    className="grid shrink-0 place-items-center bg-ink font-display text-[11px] font-extrabold tabular-nums text-white [text-orientation:mixed] [writing-mode:vertical-rl]"
                    style={{
                      width: `${Math.round(8 + f * 14)}px`,
                      height: `${Math.round(24 + f * 72)}px`,
                    }}
                  >
                    {p}
                  </span>
                );
              })
            )}
            <span className="h-2 min-w-0 flex-1 bg-ink3" />
          </div>

          {/* Breakdown */}
          {grouped.length > 0 && (
            <div className="mt-5 grid gap-1.5">
              {grouped.map((g) => (
                <div key={g.plate} className="flex items-center bg-chip px-3 py-2">
                  <span className="w-12 font-display text-[15px] font-extrabold tabular-nums text-ink">
                    ×{g.count}
                  </span>
                  <span className="flex-1 font-display text-[14px] font-bold text-ink">
                    {g.plate} {unit} {t("plate")}
                  </span>
                  <span className="mono-num text-[11px] tabular-nums text-ink2">
                    = {Math.round(g.plate * g.count * 100) / 100} {unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loaded total */}
        <div className="mx-[22px] mt-6 flex items-baseline justify-between bg-ink px-4 py-3.5 text-white">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">{t("LOADED")}</p>
            <p className="mt-0.5 font-display text-[30px] font-extrabold tabular-nums tracking-[-1px]">
              {loaded}
              <span className="ml-1 text-[12px] font-bold text-white/50">{unit}</span>
            </p>
          </div>
          {offBy !== 0 && (
            <div className="text-right">
              <p className="text-[10px] text-white/50">{t("off by")}</p>
              <p className="mono-num text-[14px] font-bold tabular-nums text-accent">
                {offBy > 0 ? "+" : ""}
                {offBy} {unit}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
