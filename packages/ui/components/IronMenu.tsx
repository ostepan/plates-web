import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MoreVertical } from "lucide-react";

export interface IronMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/**
 * Compact overflow menu — a square "⋮" trigger that drops a hairline-ruled
 * popover of actions. Used for per-row edit/delete/activate affordances on the
 * Workout tab and Programs list. Closes on outside tap or after a selection.
 */
export function IronMenu({ items, label = "More", align = "right" }: {
  items: IronMenuItem[];
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center text-ink3 active:text-ink"
      >
        <MoreVertical size={18} strokeWidth={2.25} />
      </button>
      <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: align === "right" ? "top right" : "top left" }}
            className={`absolute top-9 z-40 min-w-40 border border-ink bg-card shadow-[0_8px_24px_rgba(23,22,20,0.16)] ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); it.onClick(); }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] active:bg-chip ${
                  it.danger ? "text-bad" : "text-ink"
                } ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                {it.icon}
                <span className="font-display font-semibold">{it.label}</span>
              </button>
            ))}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </div>
  );
}
