import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Download, Upload } from "lucide-react";
import { exportBackup, exportCSV, importBackup } from "@core/db/backup";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { downloadText, pickTextFile } from "@app/lib/download";
import { useGoBack } from "@app/hooks/useGoBack";

export function BackupRestore() {
  const { t } = useTranslation();
  const goBack = useGoBack("/profile");
  const [status, setStatus] = useState<string | null>(null);

  const stamp = () => new Date().toISOString().slice(0, 10);

  async function doBackup() {
    downloadText(`plates-${stamp()}.platesbackup`, await exportBackup());
  }
  async function doCSV() {
    downloadText(`plates-${stamp()}.csv`, await exportCSV(), "text/csv");
  }
  async function doRestore() {
    const json = await pickTextFile(".platesbackup,.json,application/json");
    if (!json) return;
    try {
      await importBackup(json);
      setStatus(t("Restore complete. Reloading…"));
      setTimeout(() => location.reload(), 800);
    } catch {
      setStatus(t("Restore failed"));
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Backup")}
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <div className="space-y-3 px-[22px] py-5">
        <Action icon={<Download size={18} strokeWidth={2.25} />} label={t("Export backup (.platesbackup)")} onClick={() => void doBackup()} />
        <Action icon={<Download size={18} strokeWidth={2.25} />} label={t("Export CSV")} onClick={() => void doCSV()} />
        <Action icon={<Upload size={18} strokeWidth={2.25} />} label={t("Restore from backup")} onClick={() => void doRestore()} danger />
        {status && <p className="pt-2 text-[13px] text-ink2">{status}</p>}
        <p className="pt-4 text-[12px] leading-relaxed text-ink3">
          {t("Backups are stored on your device only. Restoring replaces all current data.")}
        </p>
      </div>
    </div>
  );
}

function Action({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border px-4 py-3.5 text-left active:bg-chip ${danger ? "border-bad text-bad" : "border-rule text-ink"}`}
    >
      {icon}
      <span className="font-display font-semibold">{label}</span>
    </button>
  );
}
