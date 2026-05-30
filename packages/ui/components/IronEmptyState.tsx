import { ArrowRight } from "lucide-react";

/**
 * Editorial empty state — accent eyebrow, huge display title (trailing period),
 * body copy, optional ink CTA. Port of iOS `IronEmptyState`.
 */
export function IronEmptyState({
  eyebrow,
  title,
  body,
  actionLabel,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center px-[22px]">
      {eyebrow && <p className="eyebrow text-accent mb-1.5">{eyebrow}</p>}
      <h2 className="display-title text-[36px] text-ink">
        {title}
        <span>.</span>
      </h2>
      {body && <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-ink2">{body}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex w-fit items-center gap-2 bg-ink px-[22px] py-3.5 text-white"
        >
          <span className="eyebrow text-[13px]">{actionLabel}</span>
          <ArrowRight size={16} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
