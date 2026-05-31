import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Calculator, Scale, Target, DatabaseBackup, Download } from "lucide-react";
import { LANGS, setLanguage, type Lang } from "@core/i18n/i18n";
import { IronTopBar } from "@ui/components/IronTopBar";
import { setWeightUnit, weightUnit } from "@app/lib/format";
import { useInstallPrompt } from "@app/hooks/useInstallPrompt";

export function ProfileTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [unit, setUnit] = useState<"kg" | "lb">(weightUnit());
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Profile")} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="px-[22px] py-5">
          <p className="eyebrow text-ink3 mb-2">{t("LANGUAGE")}</p>
          <Toggle
            options={LANGS.map((l) => ({ value: l, label: l.toUpperCase() }))}
            value={(i18n.language.startsWith("cs") ? "cs" : "en") as Lang}
            onChange={(v) => setLanguage(v as Lang)}
          />
        </section>

        <section className="px-[22px] pb-5">
          <p className="eyebrow text-ink3 mb-2">{t("UNIT")}</p>
          <Toggle
            options={[{ value: "kg", label: t("KILOGRAMS") }, { value: "lb", label: t("POUNDS") }]}
            value={unit}
            onChange={(v) => { setUnit(v as "kg" | "lb"); setWeightUnit(v as "kg" | "lb"); }}
          />
        </section>

        <div className="border-t border-hairline">
          <Row icon={<Calculator size={18} strokeWidth={2.25} />} label={t("Plate Calculator")} onClick={() => navigate("/profile/plate-calculator")} />
          <Row icon={<Scale size={18} strokeWidth={2.25} />} label={t("Body weight")} onClick={() => navigate("/profile/body-weight")} />
          <Row icon={<Target size={18} strokeWidth={2.25} />} label={t("Volume targets")} onClick={() => navigate("/profile/volume-targets")} />
          <Row icon={<DatabaseBackup size={18} strokeWidth={2.25} />} label={t("Backup")} onClick={() => navigate("/profile/backup")} />
          {canInstall && (
            <Row icon={<Download size={18} strokeWidth={2.25} />} label={t("Install app")} onClick={() => void promptInstall()} />
          )}
        </div>
      </div>
    </div>
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

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between border-b border-hairline px-[22px] py-4 text-left active:bg-chip">
      <span className="flex items-center gap-3 font-display font-bold text-ink">
        {icon}
        {label}
      </span>
      <ChevronRight size={18} className="text-ink3" strokeWidth={2.5} />
    </button>
  );
}
