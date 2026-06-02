import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Countdown rest timer. Fires a Web Notification (if granted) + a short beep
 * when it reaches zero — the web replacement for the iOS rest-timer push.
 */
export function useRestTimer() {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  // Duration the current rest period started with — denominator for the ring.
  const [total, setTotal] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    if (endsAt == null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        notifyDone();
        setEndsAt(null);
      }
    };
    tick();
    const h = window.setInterval(tick, 250);
    return () => window.clearInterval(h);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    firedRef.current = false;
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setTotal(seconds);
    setEndsAt(Date.now() + seconds * 1000);
  }, []);

  const stop = useCallback(() => setEndsAt(null), []);
  const adjust = useCallback((delta: number) => {
    setEndsAt((e) => (e == null ? null : Math.max(Date.now(), e + delta * 1000)));
    // Grow/shrink the denominator with the timer so the ring fraction stays sane.
    setTotal((tt) => Math.max(1, tt + delta));
  }, []);

  return { running: endsAt != null, remaining, total, start, stop, adjust };
}

function notifyDone() {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Plates", { body: "Rest complete", silent: false });
    }
    if ("vibrate" in navigator) navigator.vibrate?.(200);
    // short beep
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    }
  } catch {
    /* notifications are best-effort */
  }
}
