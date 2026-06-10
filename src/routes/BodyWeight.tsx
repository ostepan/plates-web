import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import { addBodyWeight, deleteBodyWeight } from "@core/db/mutations";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { relativeDay, weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";

const DAY = 86_400_000;

export function BodyWeight() {
  const { t, i18n } = useTranslation();
  const goBack = useGoBack("/profile");
  const unit = weightUnit();
  const [value, setValue] = useState("");

  const entries = useLiveQuery(
    async () => (await db.bodyWeightEntries.toArray()).sort((a, b) => b.date - a.date),
    [],
    undefined,
  );

  const latest = entries?.[0];
  const week = (entries ?? []).filter((e) => e.date >= Date.now() - 7 * DAY);
  const avg7 = week.length ? week.reduce((s, e) => s + e.weight, 0) / week.length : undefined;
  // Δ 30d — latest vs the oldest weigh-in inside the 30-day window.
  const month = (entries ?? []).filter((e) => e.date >= Date.now() - 30 * DAY);
  const delta30 = latest && month.length > 1 ? latest.weight - month[month.length - 1].weight : undefined;
  const series = month
    .slice()
    .reverse()
    .map((e) => e.weight);

  async function add() {
    const w = parseFloat(value);
    if (!w) return;
    await addBodyWeight(w, unit);
    setValue("");
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Body weight")}
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <div className="flex items-end gap-3 border-b border-hairline px-[22px] py-4">
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={latest ? String(latest.weight) : "0"}
            className="mono-num w-28 border border-rule bg-card px-3 py-2.5 text-[20px] font-bold text-ink outline-none focus:border-ink"
          />
          <span className="mono-num pb-2.5 text-ink3">{unit}</span>
          <div className="flex-1" />
          <button type="button" onClick={() => void add()} className="bg-ink px-5 py-2.5 text-white">
            <span className="eyebrow text-[12px]">{t("LOG WEIGHT")}</span>
          </button>
        </div>

        {latest && (
          <div className="grid grid-cols-3 border-b border-rule">
            <Stat label={t("CURRENT")} value={String(latest.weight)} unit={unit} />
            <Stat label={t("7-DAY AVG")} value={avg7 !== undefined ? avg7.toFixed(1) : "—"} unit={unit} />
            <Stat
              label={t("Δ 30D")}
              value={delta30 !== undefined ? `${delta30 >= 0 ? "+" : ""}${delta30.toFixed(1)}` : "—"}
              unit={delta30 !== undefined ? unit : undefined}
              tone={delta30 !== undefined ? (delta30 > 0 ? "text-accent" : "text-ok") : undefined}
              last
            />
          </div>
        )}

        {series.length >= 2 && (
          <div className="px-[22px] pt-5">
            <p className="eyebrow text-ink3 mb-1.5">{t("LAST 30 DAYS")}</p>
            <WeightChart series={series} />
          </div>
        )}

        {entries === undefined ? null : entries.length === 0 ? (
          <IronEmptyState
            eyebrow={t("BODY WEIGHT · 00")}
            title={t("No weigh-ins\nyet")}
            body={t("Track your weigh-ins and we'll surface 7-day averages + trend deltas on the dashboard.")}
          />
        ) : (
          <div className="pt-5">
            <p className="eyebrow text-ink3 mb-1.5 px-[22px]">{t("RECENT ENTRIES")}</p>
            <ul className="divide-y divide-hairline border-t border-hairline">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-[22px] py-3.5">
                  <div>
                    <span className="mono-num text-[16px] font-bold text-ink">{e.weight} {e.weightUnit}</span>
                    <span className="ml-3 mono-num text-[12px] text-ink3">{relativeDay(e.date, i18n.language)}</span>
                  </div>
                  <button type="button" onClick={() => void deleteBodyWeight(e.id)} aria-label={t("Delete")} className="text-ink3 active:text-bad">
                    <Trash2 size={16} strokeWidth={2.25} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, tone, last }: { label: string; value: string; unit?: string; tone?: string; last?: boolean }) {
  return (
    <div className={`px-3.5 py-3.5 ${last ? "" : "border-r border-rule"}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{label}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={`font-display text-[22px] font-extrabold tabular-nums tracking-[-0.6px] ${tone ?? "text-ink"}`}>
          {value}
        </span>
        {unit && <span className="text-[10px] font-semibold text-ink3">{unit}</span>}
      </p>
    </div>
  );
}

/** Area line chart of recent weigh-ins — dependency-free, matches the Iron MiniChart. */
function WeightChart({ series }: { series: number[] }) {
  const w = 320;
  const h = 96;
  const pad = 5;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (series.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Body weight trend">
      <path d={area} className="fill-accentSoft" />
      <path d={line} className="fill-none stroke-ink" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {series.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="2.5" className="fill-ink" />
      ))}
    </svg>
  );
}
