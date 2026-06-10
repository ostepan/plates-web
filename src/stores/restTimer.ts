import { create } from "zustand";

/**
 * Global countdown rest timer. Lives outside the ActiveWorkout component so
 * the countdown survives navigating to other screens (exercise detail, tabs)
 * and can be surfaced by the floating timer pill anywhere in the app.
 * Fires a Web Notification (if granted) + a short beep at zero — the web
 * replacement for the iOS Live Activity rest push.
 */
interface RestTimerState {
  endsAt: number | null;
  remaining: number;
  /** Duration the current rest period started with — denominator for the ring. */
  total: number;
  /** Session the rest belongs to, so the floating pill can deep-link back. */
  sessionId: string | null;
  start: (seconds: number, sessionId?: string) => void;
  stop: () => void;
  adjust: (delta: number) => void;
}

let intervalHandle: number | null = null;

function clearTick() {
  if (intervalHandle != null) {
    window.clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export const useRestTimerStore = create<RestTimerState>((set, get) => {
  const tick = () => {
    const { endsAt } = get();
    if (endsAt == null) {
      clearTick();
      return;
    }
    const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    set({ remaining: left });
    if (left <= 0) {
      clearTick();
      notifyDone();
      set({ endsAt: null });
    }
  };

  return {
    endsAt: null,
    remaining: 0,
    total: 0,
    sessionId: null,

    start: (seconds, sessionId) => {
      if (seconds <= 0) return;
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      set({
        total: seconds,
        endsAt: Date.now() + seconds * 1000,
        remaining: seconds,
        ...(sessionId !== undefined ? { sessionId } : {}),
      });
      clearTick();
      intervalHandle = window.setInterval(tick, 250);
    },

    stop: () => {
      clearTick();
      set({ endsAt: null });
    },

    adjust: (delta) => {
      const { endsAt, total } = get();
      if (endsAt == null) return;
      set({
        endsAt: Math.max(Date.now(), endsAt + delta * 1000),
        // Grow/shrink the denominator with the timer so the ring fraction stays sane.
        total: Math.max(1, total + delta),
      });
    },
  };
});

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
