import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Bell, Check } from "lucide-react";
import { setWeightUnit, weightUnit } from "@app/lib/format";

export const ONBOARDED_KEY = "plates.hasCompletedOnboarding";

/** First-run walkthrough — welcome, unit, notifications. Sets the onboarded flag. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [unit, setUnit] = useState<"kg" | "lb">(weightUnit());
  const [notified, setNotified] = useState(false);
  const last = 2;

  function complete() {
    localStorage.setItem(ONBOARDED_KEY, "true");
    onDone();
  }

  async function requestNotifications() {
    if ("Notification" in window) await Notification.requestPermission();
    setNotified(true);
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <div className="flex items-center justify-between px-[22px] pt-[max(1.25rem,env(safe-area-inset-top))] pb-1.5">
        <span className="mono-num text-[13px] font-black text-ink3">
          {String(page + 1).padStart(2, "0")} / {String(last + 1).padStart(2, "0")}
        </span>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-0.5 w-6 ${i <= page ? "bg-ink" : "bg-rule"}`} />
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-[22px]">
        {page === 0 && (
          <>
            <p className="eyebrow text-accent mb-1.5">{t("WELCOME · 01")}</p>
            <h1 className="font-display text-[56px] font-black tracking-[-0.04em] text-ink">{t("Plates.")}</h1>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink2">
              {t("Built for serious lifters: fast set logging, last-session ghosts, plate calculator, and progress that's easy to read.")}
            </p>
          </>
        )}
        {page === 1 && (
          <>
            <p className="eyebrow text-accent mb-1.5">{t("UNIT · 02")}</p>
            <h1 className="display-title whitespace-pre-line text-[40px] text-ink">{t("Pick your\nunit.")}</h1>
            <div className="mt-7 flex border border-rule">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => { setUnit(u); setWeightUnit(u); }}
                  className={`flex-1 py-4 ${unit === u ? "bg-ink text-white" : "text-ink2"}`}
                >
                  <span className="eyebrow text-[13px]">{u === "kg" ? t("KILOGRAMS") : t("POUNDS")}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {page === 2 && (
          <>
            <p className="eyebrow text-accent mb-1.5">{t("NOTIFICATIONS · 03")}</p>
            <h1 className="display-title whitespace-pre-line text-[40px] text-ink">{t("Rest timer\npings.")}</h1>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink2">
              {t("Plates can ping you when your rest period is done — even with the screen locked. Optional.")}
            </p>
            <button
              type="button"
              onClick={() => void requestNotifications()}
              disabled={notified}
              className={`mt-6 flex items-center justify-center gap-2 py-4 text-white ${notified ? "bg-ok" : "bg-accent"}`}
            >
              {notified ? <Check size={16} strokeWidth={2.5} /> : <Bell size={16} strokeWidth={2.5} />}
              <span className="eyebrow text-[13px]">{notified ? t("NOTIFICATIONS ENABLED") : t("ALLOW NOTIFICATIONS")}</span>
            </button>
          </>
        )}
      </div>

      <div className="flex gap-2.5 px-[22px] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        {page > 0 && (
          <button type="button" onClick={() => setPage((p) => p - 1)} className="flex flex-1 items-center justify-center gap-1.5 border border-rule py-3.5 text-ink">
            <ArrowLeft size={14} strokeWidth={2.5} />
            <span className="eyebrow text-[12px]">{t("BACK")}</span>
          </button>
        )}
        {page < last ? (
          <button type="button" onClick={() => setPage((p) => p + 1)} className="flex flex-1 items-center justify-center gap-1.5 bg-ink py-3.5 text-white">
            <span className="eyebrow text-[12px]">{t("NEXT")}</span>
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        ) : (
          <button type="button" onClick={complete} className="flex-1 border border-ink py-3.5 text-ink">
            <span className="eyebrow text-[12px]">{t("GET STARTED")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
