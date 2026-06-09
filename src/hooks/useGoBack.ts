import { useNavigate } from "react-router-dom";

/**
 * Back-button handler that pops history instead of pushing the parent route.
 * Pushing (e.g. navigate("/recovery")) grows the stack, so the browser/app
 * back button replays the trail — and loops when the parent's own Back is
 * navigate(-1). React Router keeps its position in history.state.idx; idx 0
 * means this is the first in-app entry (deep link / fresh tab), where popping
 * would leave the app, so we land on `fallback` instead.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
