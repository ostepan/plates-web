import { motion, type Transition } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Iron motion grammar — the app's shared animation vocabulary, kept in one
 * place so every surface moves with the same feel. Snappy ease-out curves;
 * nothing bouncy (the design system is flat and sharp, springs would clash).
 */

/** Quick fades / slides (content reveals). */
export const EASE_OUT: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };

/** Height expand/collapse (inline editors, sheets). */
export const EXPAND: Transition = { duration: 0.26, ease: [0.16, 1, 0.3, 1] };

/** Fast exit fade so closing never feels laggy. */
export const FADE_FAST: Transition = { duration: 0.1, ease: "easeIn" };

/** Fade-and-rise reveal; stagger sections by passing increasing `delay`s. */
export function FadeSlide({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
