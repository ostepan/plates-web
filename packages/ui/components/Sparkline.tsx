import { motion } from "framer-motion";

export interface SparkPoint {
  date: number;
  value: number;
}

/**
 * e1RM line chart — area fill + per-session dots, matching the Iron MiniChart.
 * The line draws itself left-to-right on mount (skipped under reduced motion
 * via the app-level MotionConfig).
 */
export function Sparkline({
  points,
  height = 96,
  areaClass = "fill-accentSoft",
  strokeClass = "stroke-ink",
  dotClass = "fill-ink",
  ariaLabel = "e1RM",
}: {
  points: SparkPoint[];
  height?: number;
  areaClass?: string;
  strokeClass?: string;
  dotClass?: string;
  ariaLabel?: string;
}) {
  const w = 320;
  const h = height;
  const pad = 5;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={ariaLabel}>
      <motion.path
        d={area}
        className={areaClass}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.25 }}
      />
      <motion.path
        d={d}
        fill="none"
        className={strokeClass}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={x(i)}
          cy={y(p.value)}
          r="2.5"
          className={dotClass}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, delay: 0.1 + (i / Math.max(1, points.length - 1)) * 0.35 }}
        />
      ))}
    </svg>
  );
}
