import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Download } from "lucide-react";
import { db } from "@core/db/db";
import { overviewStats } from "@core/db/analytics";
import { LANGS, setLanguage, type Lang } from "@core/i18n/i18n";
import { IronTopBar } from "@ui/components/IronTopBar";
import { setWeightUnit, weightUnit } from "@app/lib/format";
import { useInstallPrompt } from "@app/hooks/useInstallPrompt";
import { ONBOARDED_KEY } from "./Onboarding";

/** 3_420_000 → "3.42M", 74_200 → "74.2k". */
function compactVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

export function ProfileTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [unit, setUnit] = useState<"kg" | "lb">(weightUnit());
  const { canInstall, promptInstall } = useInstallPrompt();

  const stats = useLiveQuery(() => overviewStats(), []);
  const latestWeight = useLiveQuery(
    async () => (await db.bodyWeightEntries.toArray()).sort((a, b) => b.date - a.date)[0],
    [],
    undefined,
  );
  const programCounts = useLiveQuery(
    async () => {
      const all = await db.programs.toArray();
      return { total: all.length, active: all.filter((p) => p.isActive).length };
    },
    [],
    undefined,
  );

  function resetOnboarding() {
    if (!window.confirm(t("Show onboarding again on next launch?"))) return;
    localStorage.removeItem(ONBOARDED_KEY);
    window.location.reload();
  }

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Profile")} />

      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {/* Stat strip */}
        {stats && (
          <div className="mx-[22px] mt-5 grid grid-cols-3 border border-rule">
            {(
              [
                [t("Sessions"), String(stats.workouts)],
                [t("Streak"), `${stats.streakDays}d`],
                [t("Vol"), compactVolume(stats.totalVolume)],
              ] as const
            ).map(([label, value], i) => (
              <div key={label} className={`px-3.5 py-3 ${i < 2 ? "border-r border-rule" : ""}`}>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink3">{label}</p>
                <p className="mt-0.5 font-display text-[20px] font-extrabold tabular-nums tracking-[-0.5px] text-ink">
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Tools */}
        <Section title={t("TOOLS")}>
          <Row
            label={t("Plate Calculator")}
            hint={unit === "kg" ? t("20 kg bar · 1.25–25 kg") : t("45 lb bar · 2.5–45 lb")}
            onClick={() => navigate("/profile/plate-calculator")}
          />
          <Row
            label={t("Body weight")}
            hint={latestWeight ? `${t("Current")} ${latestWeight.weight} ${latestWeight.weightUnit}` : t("Log your weigh-ins")}
            onClick={() => navigate("/profile/body-weight")}
          />
          <Row
            label={t("Volume targets")}
            hint={t("MEV / MAV / MRV per muscle")}
            onClick={() => navigate("/profile/volume-targets")}
          />
          <Row
            label={t("Programs")}
            hint={
              programCounts
                ? `${programCounts.total} ${t("programs")}${programCounts.active ? ` · ${programCounts.active} ${t("active")}` : ""}`
                : undefined
            }
            onClick={() => navigate("/programs")}
          />
        </Section>

        {/* Preferences */}
        <Section title={t("PREFERENCES")}>
          <div className="border-t border-hairline py-3.5">
            <p className="eyebrow text-ink3 mb-2">{t("LANGUAGE")}</p>
            <Toggle
              options={LANGS.map((l) => ({ value: l, label: l.toUpperCase() }))}
              value={(i18n.language.startsWith("cs") ? "cs" : "en") as Lang}
              onChange={(v) => setLanguage(v as Lang)}
            />
          </div>
          <div className="border-t border-hairline py-3.5">
            <p className="eyebrow text-ink3 mb-2">{t("UNIT")}</p>
            <Toggle
              options={[{ value: "kg", label: t("KILOGRAMS") }, { value: "lb", label: t("POUNDS") }]}
              value={unit}
              onChange={(v) => { setUnit(v as "kg" | "lb"); setWeightUnit(v as "kg" | "lb"); }}
            />
          </div>
          <Row
            label={t("Recovery settings")}
            hint={t("Thresholds · deload · muscle times")}
            onClick={() => navigate("/recovery/settings")}
          />
        </Section>

        {/* Data */}
        <Section title={t("DATA")}>
          <Row
            label={t("Backup & restore")}
            hint={t("JSON backup · CSV export")}
            onClick={() => navigate("/profile/backup")}
          />
          {canInstall && (
            <Row
              label={t("Install app")}
              hint={t("Add to home screen")}
              icon={<Download size={16} strokeWidth={2.25} className="text-ink3" />}
              onClick={() => void promptInstall()}
            />
          )}
          <Row label={t("Reset onboarding")} hint={t("Show the intro again")} onClick={resetOnboarding} />
        </Section>

        <p className="mono-num pt-7 text-center text-[10px] tracking-[0.06em] text-ink3">
          PLATES · {t("web")}
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-[22px] pt-6">
      <p className="eyebrow text-ink3 mb-2">{title}</p>
      {children}
    </section>
  );
}

function Toggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex border border-rule">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-3 ${value === o.value ? "bg-ink text-white" : "text-ink2"}`}
        >
          <span className="eyebrow text-[13px]">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Row({
  label,
  hint,
  icon,
  onClick,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-hairline py-3.5 text-left active:bg-chip"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[14px] font-bold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-ink2">{hint}</span>}
      </span>
      {icon}
      <ChevronRight size={14} strokeWidth={2.5} className="shrink-0 text-ink3" />
    </button>
  );
}
