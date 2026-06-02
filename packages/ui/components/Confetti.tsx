import { useEffect, useRef } from "react";

// Iron-palette confetti (accent / ok / warn / info / ink).
const COLORS = ["#C64D2A", "#3FA055", "#D4A544", "#5B7FA1", "#171614"];

/**
 * Lightweight canvas confetti burst — no dependency. Fires once on mount and
 * stops after `durationMs`. Respects prefers-reduced-motion. Port of the iOS
 * ConfettiView celebration on the workout summary.
 */
export function Confetti({ count = 120, durationMs = 1800 }: { count?: number; durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const canvas = ref.current;
    if (!canvas || reduce) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    interface P { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string }
    let parts: P[] | null = null;
    let W = 0;
    let H = 0;
    let start = 0;
    let raf = 0;

    // Size the backing buffer from the laid-out box. Done inside the rAF loop
    // (not at effect time) so it runs after layout settles — the canvas rect
    // can read 0 on the very first mount tick.
    const ensureSized = (): boolean => {
      const r = canvas.getBoundingClientRect();
      const w = r.width || window.innerWidth;
      const h = r.height || window.innerHeight;
      if (!w || !h) return false;
      if (w !== W || h !== H) {
        W = w;
        H = h;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return true;
    };

    const frame = (now: number) => {
      if (!ensureSized()) {
        raf = requestAnimationFrame(frame);
        return;
      }
      if (!parts) {
        start = now;
        parts = Array.from({ length: count }, () => ({
          x: Math.random() * W,
          y: -20 - Math.random() * H * 0.3,
          vx: (Math.random() - 0.5) * 6,
          vy: 3 + Math.random() * 4,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          color: COLORS[(Math.random() * COLORS.length) | 0],
        }));
      }
      const elapsed = now - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - (durationMs - 500)) / 500); // fade out last 500ms
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.vx *= 0.99;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < durationMs) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [count, durationMs]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60] h-screen w-screen" aria-hidden="true" />;
}
