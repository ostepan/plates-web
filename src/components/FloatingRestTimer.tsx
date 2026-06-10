import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRestTimerStore } from "@app/stores/restTimer";
import { formatDuration } from "@app/lib/format";

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Floating rest-timer pill (Iron "in-app floating timer FAB"). Rendered
 * app-wide so a running countdown stays visible after navigating away from
 * the active workout; tapping it jumps back to the live session. Hidden on
 * the active-workout screen itself, where the sticky rest bar already shows.
 */
export function FloatingRestTimer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const endsAt = useRestTimerStore((s) => s.endsAt);
  const remaining = useRestTimerStore((s) => s.remaining);
  const total = useRestTimerStore((s) => s.total);
  const sessionId = useRestTimerStore((s) => s.sessionId);

  if (endsAt == null || pathname.startsWith("/active/")) return null;

  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  return (
    <button
      type="button"
      onClick={() => sessionId && navigate(`/active/${sessionId}`)}
      aria-label={t("Rest timer — back to workout")}
      className="fixed bottom-[96px] right-[18px] z-50 flex items-center gap-2.5 rounded-full bg-ink py-2.5 pl-2.5 pr-3.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
    >
      <span className="relative block h-9 w-9">
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
          <circle cx="18" cy="18" r={RING_R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r={RING_R}
            fill="none"
            stroke="#C64D2A"
            strokeWidth="3"
            strokeDasharray={`${fraction * RING_C} ${RING_C}`}
            strokeLinecap="round"
            transform="rotate(-90 18 18)"
          />
        </svg>
      </span>
      <span className="text-left">
        <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-accent">{t("REST")}</span>
        <span className="mono-num block text-[15px] font-semibold leading-none tracking-[-0.3px]">
          {formatDuration(remaining)}
        </span>
      </span>
    </button>
  );
}
