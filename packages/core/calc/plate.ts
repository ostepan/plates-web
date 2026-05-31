// Port of PlatesCore/Calculators/PlateCalculator.swift — greedy per-side breakdown.

export interface PlateResult {
  perSide: number[];
  unloaded: number;
}

export const STANDARD_KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
export const STANDARD_LB_PLATES = [45, 35, 25, 10, 5, 2.5, 1.25];

/** Largest-first plate breakdown for one side of the bar + any unmatched mass. */
export function plates(target: number, bar: number, available: number[]): PlateResult {
  if (target < bar) return { perSide: [], unloaded: target };
  const perSideTarget = (target - bar) / 2;
  const sorted = [...available].sort((a, b) => b - a);
  let remaining = perSideTarget;
  const picked: number[] = [];
  for (const plate of sorted) {
    while (remaining + 1e-6 >= plate) {
      picked.push(plate);
      remaining -= plate;
    }
  }
  return { perSide: picked, unloaded: Math.max(0, remaining * 2) };
}
