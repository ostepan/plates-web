import { create } from "zustand";

/**
 * Global confirm dialog. Replaces native `window.confirm`, which renders an
 * un-styled OS alert that clashes with the Iron design language. A single
 * <ConfirmDialog/> host (mounted app-wide) reads this store; call `ironConfirm`
 * from anywhere and await the user's choice, e.g.
 *
 *   if (!(await ironConfirm({ title: "Delete?", destructive: true }))) return;
 */
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm action in the danger color (deletes, discards). */
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolver: ((value: boolean) => void) | null;
  request: (options: ConfirmOptions) => Promise<boolean>;
  resolve: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolver: null,
  request: (options) =>
    new Promise<boolean>((resolve) => {
      // A new request supersedes any still-open one (treat the old as cancelled).
      get().resolver?.(false);
      set({ open: true, options, resolver: resolve });
    }),
  resolve: (value) => {
    get().resolver?.(value);
    // Keep `options` mounted so the exit animation can still read its text.
    set({ open: false, resolver: null });
  },
}));

export function ironConfirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().request(options);
}
