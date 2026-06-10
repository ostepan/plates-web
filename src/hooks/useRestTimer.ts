import { useCallback } from "react";
import { useRestTimerStore } from "@app/stores/restTimer";

/**
 * Component-facing facade over the global rest-timer store. The countdown
 * itself lives in `stores/restTimer.ts` so it keeps running when the user
 * navigates away mid-rest (the floating timer pill picks it up).
 */
export function useRestTimer(sessionId?: string) {
  const endsAt = useRestTimerStore((s) => s.endsAt);
  const remaining = useRestTimerStore((s) => s.remaining);
  const total = useRestTimerStore((s) => s.total);
  const storeStart = useRestTimerStore((s) => s.start);
  const stop = useRestTimerStore((s) => s.stop);
  const adjust = useRestTimerStore((s) => s.adjust);

  const start = useCallback(
    (seconds: number) => storeStart(seconds, sessionId),
    [storeStart, sessionId],
  );

  return { running: endsAt != null, remaining, total, start, stop, adjust };
}
