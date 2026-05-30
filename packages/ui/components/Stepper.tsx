import { Minus, Plus } from "lucide-react";

/** Compact −/value/+ control with monospaced value. Port of the iOS Iron stepper. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  width = "w-9",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  width?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center border border-rule">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        aria-label="decrease"
        className="grid h-8 w-8 place-items-center text-ink2 active:bg-chip"
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <span className={`mono-num text-center text-[14px] font-semibold text-ink ${width}`}>
        {value}
        {suffix}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        aria-label="increase"
        className="grid h-8 w-8 place-items-center text-ink2 active:bg-chip"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
