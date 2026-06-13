import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useConfirmStore } from "@app/stores/confirm";

/**
 * Iron-styled confirm dialog host. Mounted once app-wide; driven by the
 * confirm store so any screen can `await ironConfirm(...)` instead of calling
 * the un-styled native `window.confirm`. Scrim + sheet motion match the RIR
 * picker / Iron menu grammar.
 */
export function ConfirmDialog() {
  const { t } = useTranslation();
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const resolve = useConfirmStore((s) => s.resolve);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolve(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, resolve]);

  return (
    <AnimatePresence>
      {open && options && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:items-center sm:pb-5"
          onClick={() => resolve(false)}
          role="dialog"
          aria-modal="true"
          aria-label={options.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="w-full max-w-sm border border-ink bg-card shadow-[0_8px_24px_rgba(23,22,20,0.16)]"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="px-5 pb-4 pt-5">
              <p className="font-display text-[17px] font-extrabold tracking-[-0.2px] text-ink">
                {options.title}
              </p>
              {options.message ? (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink2">{options.message}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => resolve(false)}
                className="border-r border-hairline py-3.5 font-display text-[12px] font-bold uppercase tracking-[0.12em] text-ink2 active:bg-chip"
              >
                {options.cancelLabel ?? t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => resolve(true)}
                className={`py-3.5 font-display text-[12px] font-bold uppercase tracking-[0.12em] text-white active:opacity-90 ${
                  options.destructive ? "bg-bad" : "bg-ink"
                }`}
              >
                {options.confirmLabel ?? t("Confirm")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
