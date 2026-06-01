// Superset badge logic (A1 / B1 …) ported from the iOS RoutineEditorView.
// A "run" = a maximal contiguous block of items sharing a supersetGroupId.
// Each run gets a letter (A, B, C…) in order; each member gets a 1-based position.

export interface SupersetBadge {
  label: string;
  runIndex: number;
}

interface Groupable {
  supersetGroupId?: string;
}

/** Badge for the item at `index`, or null if it isn't in a superset. */
export function supersetBadge(items: Groupable[], index: number): SupersetBadge | null {
  const key = items[index]?.supersetGroupId;
  if (!key) return null;

  // collect group keys in run order
  const seen: string[] = [];
  let last: string | undefined;
  for (const it of items) {
    const k = it.supersetGroupId;
    if (k && k !== last && !seen.includes(k)) seen.push(k);
    last = k;
  }
  const runIndex = seen.indexOf(key);
  if (runIndex < 0) return null;

  const letter = String.fromCharCode(65 + (runIndex % 26));
  let position = 0;
  for (let i = 0; i < index; i++) if (items[i].supersetGroupId === key) position++;
  return { label: `${letter}${position + 1}`, runIndex };
}

/** True when the item shares its group with the item directly above or below. */
export function isInSuperset(items: Groupable[], index: number): boolean {
  const key = items[index]?.supersetGroupId;
  if (!key) return false;
  const prev = index > 0 && items[index - 1].supersetGroupId === key;
  const next = index < items.length - 1 && items[index + 1].supersetGroupId === key;
  return prev || next;
}
