import type { ReactNode } from "react";

/**
 * Flat display-font title bar with optional square leading/trailing slots and a
 * hairline rule below. Port of iOS `IronTopBar`.
 */
export function IronTopBar({
  title,
  leading,
  trailing,
}: {
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="bg-bg border-b border-hairline">
      <div className="flex items-center gap-3 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5">
        <div className="min-w-10 flex items-center justify-start">{leading}</div>
        {title && (
          <h1 className="display-title text-[28px] text-ink truncate">{title}</h1>
        )}
        <div className="flex-1" />
        <div className="min-w-10 flex items-center justify-end">{trailing}</div>
      </div>
    </header>
  );
}

/** Square 40×40 flat icon button (ink fill, cream glyph). */
export function IronToolbarButton({
  children,
  onClick,
  tint = "bg-ink",
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  tint?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid h-10 w-10 place-items-center text-white ${tint}`}
    >
      {children}
    </button>
  );
}
