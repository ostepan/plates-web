import { useEffect, useRef } from "react";

/**
 * Iron-styled confirmation dialog — a flat, hairline-ruled card over a dimmed
 * backdrop. Replaces `window.confirm` so destructive actions stay on-brand and
 * keyboard/ screen-reader friendly. Controlled: render with `open` and own the
 * pending state in the parent.
 *
 * Backdrop tap and Escape both cancel. For destructive prompts the *cancel*
 * button takes initial focus, so an accidental Enter can't trigger the
 * irreversible action.
 */
export function IronConfirm({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    focusRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
    >
      <button
        type="button"
        aria-label={cancelLabel}
        onClick={onCancel}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative z-10 w-full max-w-sm border border-ink bg-card p-5 shadow-[0_12px_40px_rgba(23,22,20,0.22)]">
        <h2 className="display-title text-[22px] text-ink">{title}</h2>
        {message && <p className="mt-2 text-[13px] leading-relaxed text-ink2">{message}</p>}
        <div className="mt-5 flex gap-2.5">
          <button
            ref={destructive ? focusRef : undefined}
            type="button"
            onClick={onCancel}
            className="flex-1 border border-rule py-3 text-ink active:bg-chip"
          >
            <span className="eyebrow text-[12px]">{cancelLabel}</span>
          </button>
          <button
            ref={destructive ? undefined : focusRef}
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-3 text-white active:opacity-90 ${destructive ? "bg-bad" : "bg-ink"}`}
          >
            <span className="eyebrow text-[12px]">{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
