import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import { addBodyWeight, deleteBodyWeight } from "@core/db/mutations";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { relativeDay, weightUnit } from "@app/lib/format";

export function BodyWeight() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const unit = weightUnit();
  const [value, setValue] = useState("");

  const entries = useLiveQuery(
    async () => (await db.bodyWeightEntries.toArray()).sort((a, b) => b.date - a.date),
    [],
    undefined,
  );

  const latest = entries?.[0];
  const week = (entries ?? []).filter((e) => e.date >= Date.now() - 7 * 86_400_000);
  const avg7 = week.length ? week.reduce((s, e) => s + e.weight, 0) / week.length : undefined;

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
          <IronToolbarButton onClick={() => navigate("/profile")} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />

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
        <div className="flex gap-8 border-b border-hairline px-[22px] py-4">
          <Stat label={t("LATEST")} value={`${latest.weight} ${unit}`} />
          {avg7 !== undefined && <Stat label={t("7-DAY AVG")} value={`${avg7.toFixed(1)} ${unit}`} />}
        </div>
      )}

      {entries === undefined ? <BodyWeightSkeleton /> : entries.length === 0 ? (
        <IronEmptyState
          eyebrow={t("BODY WEIGHT · 00")}
          title={t("No weigh-ins\nyet")}
          body={t("Track your weigh-ins and we'll surface 7-day averages + trend deltas on the dashboard.")}
        />
      ) : (
        <ul className="divide-y divide-hairline overflow-y-auto">
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
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow text-ink3 text-[9px]">{label}</p>
      <p className="mono-num text-[20px] font-black text-ink">{value}</p>
    </div>
  );
}

/** Placeholder shown while weigh-ins load — mirrors the entry rows. */
function BodyWeightSkeleton() {
  return (
    <ul className="animate-pulse divide-y divide-hairline overflow-y-auto motion-reduce:animate-none" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center justify-between px-[22px] py-3.5">
          <span className="flex items-center gap-3">
            <span className="block h-4 w-20 bg-chip" />
            <span className="block h-3 w-16 bg-chip" />
          </span>
          <span className="block h-4 w-4 bg-chip" />
        </li>
      ))}
    </ul>
  );
}
