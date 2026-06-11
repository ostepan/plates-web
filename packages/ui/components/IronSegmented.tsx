import { useId } from "react";
import { motion } from "framer-motion";

const GLIDE = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

/**
 * Flat underline segmented control. `dense` is the secondary tier (smaller,
 * chip-filled). The active indicator glides between options via a shared
 * layout animation, scoped per instance so multiple controls don't cross-talk.
 */
export function IronSegmented<T extends string>({
  value,
  options,
  onChange,
  dense = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  dense?: boolean;
}) {
  const id = useId();
  if (dense) {
    return (
      <div className="mx-[22px] mt-2.5 flex border border-rule">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`relative flex-1 py-2 ${active ? "text-white" : "text-ink2"}`}
            >
              {active && (
                <motion.span layoutId={`seg-fill-${id}`} className="absolute inset-0 bg-ink" transition={GLIDE} />
              )}
              <span className="relative text-[10px] font-bold uppercase tracking-[0.08em]">{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex border-b border-hairline">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative flex-1 py-3 ${active ? "text-ink" : "text-ink3"}`}
          >
            <span className="eyebrow text-[11px]">{o.label}</span>
            {active && (
              <motion.span
                layoutId={`seg-line-${id}`}
                className="absolute inset-x-0 -bottom-px h-0.5 bg-ink"
                transition={GLIDE}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
