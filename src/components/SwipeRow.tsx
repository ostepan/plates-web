import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export interface SwipeActionDef {
  icon: ReactNode;
  label: string;
  /** Tailwind background class for the revealed panel, e.g. "bg-bad". */
  bg: string;
  /** Tailwind text class for the panel; defaults to white. */
  fg?: string;
  onAction: () => void;
}

const PANEL = 84; // resting reveal width (px)
const ENGAGE = 8; // horizontal travel before the swipe locks in
const OPEN_AT = 42; // release past this → snap the panel open

/**
 * Swipe-to-reveal row. Dragging horizontally uncovers an action panel on the
 * matching side; release past the threshold rests it open, then tap the panel
 * (or swipe back) to act. Vertical scrolling and inner taps pass through —
 * a tap that follows a real swipe is suppressed so it can't double-fire.
 * Only one row is open at a time; the parent owns `open` / `onOpenChange`.
 */
export function SwipeRow({
  left, right, disabled, open, onOpenChange, children,
}: {
  left?: SwipeActionDef;
  right?: SwipeActionDef;
  disabled?: boolean;
  open: "left" | "right" | null;
  onOpenChange: (side: "left" | "right" | null) => void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const axis = useRef<"none" | "h" | "v">("none");
  const moved = useRef(false);

  const restX = open === "left" ? PANEL : open === "right" ? -PANEL : 0;

  // Snap to the resting position whenever the open state changes from outside
  // (e.g. another row opens, or a scroll closes this one) and we aren't dragging.
  useEffect(() => {
    if (!dragging) setOffset(restX);
  }, [restX, dragging]);

  function onDown(e: ReactPointerEvent) {
    if (disabled) return;
    start.current = { x: e.clientX, y: e.clientY, base: offset };
    axis.current = "none";
    moved.current = false;
  }

  function onMove(e: ReactPointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (axis.current === "none") {
      if (Math.abs(dx) > ENGAGE && Math.abs(dx) > Math.abs(dy)) {
        axis.current = "h";
        setDragging(true);
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
      } else if (Math.abs(dy) > ENGAGE) {
        axis.current = "v"; // vertical intent — let the list scroll
        start.current = null;
        return;
      } else {
        return;
      }
    }
    moved.current = true;
    let next = s.base + dx;
    const max = left ? PANEL : 0;
    const min = right ? -PANEL : 0;
    // rubber-band past the panel edge so it feels bounded, not stuck
    if (next > max) next = max + (next - max) * 0.35;
    if (next < min) next = min + (next - min) * 0.35;
    setOffset(next);
  }

  function onUp() {
    const wasH = axis.current === "h";
    start.current = null;
    axis.current = "none";
    setDragging(false);
    if (!wasH) return;
    if (right && offset <= -OPEN_AT) onOpenChange("right");
    else if (left && offset >= OPEN_AT) onOpenChange("left");
    else onOpenChange(null);
  }

  // A tap on the content after a swipe — or while a panel is open — closes the
  // row instead of activating whatever was tapped.
  function onClickCapture(e: React.MouseEvent) {
    if (moved.current || open) {
      e.preventDefault();
      e.stopPropagation();
      moved.current = false;
      if (open) onOpenChange(null);
    }
  }

  const panelCls = "absolute inset-y-0 flex w-[84px] flex-col items-center justify-center gap-1";

  return (
    <div
      className="relative overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {left && (
        <button
          type="button"
          aria-label={left.label}
          onClick={() => { left.onAction(); onOpenChange(null); }}
          className={`${panelCls} left-0 ${left.bg} ${left.fg ?? "text-white"}`}
          style={{ opacity: offset > 0 ? 1 : 0 }}
        >
          {left.icon}
          <span className="eyebrow text-[9px]">{left.label}</span>
        </button>
      )}
      {right && (
        <button
          type="button"
          aria-label={right.label}
          onClick={() => { right.onAction(); onOpenChange(null); }}
          className={`${panelCls} right-0 ${right.bg} ${right.fg ?? "text-white"}`}
          style={{ opacity: offset < 0 ? 1 : 0 }}
        >
          {right.icon}
          <span className="eyebrow text-[9px]">{right.label}</span>
        </button>
      )}
      <div
        className="relative bg-bg"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.22s cubic-bezier(0.22,1,0.36,1)",
        }}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
