import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Iron RIR style helpers — direct port of iOS `RIRStyle.swift`.
 * Color scale: red (failure) → orange (very hard) → amber (productive) →
 * green (easy) → gray (warm-up).
 */
export type RIRBand = "max" | "veryHard" | "productive" | "easy" | "warmup";

export function rirBand(rir: number | undefined | null): RIRBand | null {
  if (rir == null || Number.isNaN(rir)) return null;
  if (rir <= 0) return "max";
  if (rir === 1) return "veryHard";
  if (rir === 2) return "productive";
  if (rir === 3) return "easy";
  return "warmup";
}

/** Tailwind classes for {ring/border, fill bg, text}. */
interface RIRPaint {
  text: string;
  ring: string;
  bg: string;
  bgSoft: string;
}

const PAINT: Record<RIRBand, RIRPaint> = {
  max: { text: "text-bad", ring: "border-bad", bg: "bg-bad/15", bgSoft: "bg-bad/10" },
  veryHard: { text: "text-fade", ring: "border-fade", bg: "bg-fade/15", bgSoft: "bg-fade/10" },
  productive: { text: "text-warn", ring: "border-warn", bg: "bg-warn/15", bgSoft: "bg-warn/10" },
  easy: { text: "text-ok", ring: "border-ok", bg: "bg-ok/15", bgSoft: "bg-ok/10" },
  warmup: { text: "text-ink3", ring: "border-ink3", bg: "bg-ink3/15", bgSoft: "bg-ink3/10" },
};

const NEUTRAL: RIRPaint = {
  text: "text-ink3",
  ring: "border-rule",
  bg: "bg-chip",
  bgSoft: "bg-chip",
};

export function rirPaint(rir: number | undefined | null): RIRPaint {
  const band = rirBand(rir);
  return band ? PAINT[band] : NEUTRAL;
}

export function rirDescriptorKey(rir: number | undefined | null): string | null {
  const band = rirBand(rir);
  if (!band) return null;
  return `rir.descriptor.${band}`;
}

export function rirExplanationKey(rir: number | undefined | null): string | null {
  const band = rirBand(rir);
  if (!band) return null;
  if (rir === undefined || rir === null) return null;
  if (rir >= 4) return "rir.explain.4plus";
  if (rir <= 0) return "rir.explain.0";
  return `rir.explain.${rir}`;
}

/**
 * Tappable RIR pill — shows the current value (or "RIR" placeholder) in a
 * color-coded chip. Tap to open the picker.
 */
export function RIRPill({
  value,
  onClick,
  ariaLabel,
}: {
  value: number | undefined | null;
  onClick: () => void;
  ariaLabel?: string;
}) {
  const paint = rirPaint(value);
  const display = value == null || Number.isNaN(value) ? "RIR" : value >= 4 ? "4+" : String(value);
  const isPlaceholder = value == null || Number.isNaN(value);
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? (isPlaceholder ? "Set RIR" : `RIR ${display}`)}
      onClick={onClick}
      className={`mono-num inline-flex h-7 min-w-[2.4rem] items-center justify-center border px-2 text-[13px] font-bold transition-colors ${
        isPlaceholder
          ? "border-rule bg-card text-ink3"
          : `${paint.ring} ${paint.bgSoft} ${paint.text}`
      }`}
    >
      {display}
    </button>
  );
}

/**
 * Bottom-sheet picker — port of iOS `RIRPickerSheet`. Shows a clear row
 * plus 0–4+, each with descriptor + explanation; current selection gets a
 * checkmark.
 */
export function RIRPickerSheet({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: number | undefined | null;
  onChange: (next: number | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const pick = (next: number | undefined) => {
    onChange(next);
    onClose();
  };

  const rows: Array<{ key: string; rir: number | undefined; label: string }> = [
    { key: "clear", rir: undefined, label: "—" },
    { key: "0", rir: 0, label: "0" },
    { key: "1", rir: 1, label: "1" },
    { key: "2", rir: 2, label: "2" },
    { key: "3", rir: 3, label: "3" },
    { key: "4", rir: 4, label: "4+" },
  ];

  return (
    <AnimatePresence>
    {open && (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("rir.title")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="w-full max-w-md border border-ink bg-card pb-[env(safe-area-inset-bottom)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 56 }}
        animate={{ y: 0 }}
        exit={{ y: 56 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="border-b border-hairline px-4 py-3">
          <p className="font-display text-[15px] font-bold text-ink">{t("rir.title")}</p>
          <p className="text-[12px] text-ink3">{t("rir.subtitle")}</p>
        </div>
        <ul role="listbox" className="divide-y divide-hairline">
          {rows.map(({ key, rir, label }) => {
            const paint = rirPaint(rir);
            const selected =
              (value == null && rir === undefined) ||
              (rir != null && value != null && (rir === 4 ? value >= 4 : value === rir));
            const descKey = rirDescriptorKey(rir);
            const expKey = rirExplanationKey(rir);
            return (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(rir)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-chip"
                >
                  <span
                    className={`mono-num grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] font-bold ${
                      rir === undefined ? "border-rule bg-chip text-ink3" : `${paint.ring} ${paint.bgSoft} ${paint.text}`
                    }`}
                  >
                    {label}
                  </span>
                  <div className="min-w-0 flex-1">
                    {rir === undefined ? (
                      <>
                        <p className="font-display text-[14px] font-semibold text-ink">{t("rir.clear")}</p>
                        <p className="text-[12px] text-ink3">{t("rir.clear.subtitle")}</p>
                      </>
                    ) : (
                      <>
                        <p className={`font-display text-[14px] font-semibold ${paint.text}`}>
                          {descKey ? t(descKey) : ""}
                        </p>
                        <p className="text-[12px] text-ink3">{expKey ? t(expKey) : ""}</p>
                      </>
                    )}
                  </div>
                  {selected && (
                    <Check
                      size={16}
                      strokeWidth={2.75}
                      className={`mt-2 shrink-0 ${rir === undefined ? "text-ink3" : paint.text}`}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </motion.div>
    )}
    </AnimatePresence>
  );
}
