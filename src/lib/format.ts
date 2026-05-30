import type { Exercise } from "@core/models/types";

export function localizedExerciseName(ex: Exercise, lang: string): string {
  return lang.startsWith("cs") ? ex.nameCS : ex.nameEN;
}

/** "12:34" or "1:02:03" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${mm}:${pad(sec)}`;
}

/** Relative day label, e.g. "today" / "2 d ago" — coarse, good enough for lists. */
export function relativeDay(ts: number, lang: string): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return lang.startsWith("cs") ? "dnes" : "today";
  if (days === 1) return lang.startsWith("cs") ? "včera" : "yesterday";
  return lang.startsWith("cs") ? `před ${days} dny` : `${days} d ago`;
}

const WEIGHT_KEY = "plates.preferredWeightUnit";
export function weightUnit(): "kg" | "lb" {
  return (localStorage.getItem(WEIGHT_KEY) as "kg" | "lb") ?? "kg";
}
export function setWeightUnit(u: "kg" | "lb"): void {
  localStorage.setItem(WEIGHT_KEY, u);
}
