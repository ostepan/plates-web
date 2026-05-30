// Port of PlatesCore/Calculators/OneRMCalculator.swift — estimated 1-rep-max.
// Formulas + guards match the Swift source 1:1 (verified against it).
import type { OneRMFormula } from "../models/enums";

export const OneRM = {
  epley(weight: number, reps: number): number {
    if (reps <= 0 || weight <= 0) return 0;
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
  },

  brzycki(weight: number, reps: number): number {
    if (reps <= 0 || weight <= 0 || reps >= 37) return 0;
    if (reps === 1) return weight;
    return weight / (1.0278 - 0.0278 * reps);
  },

  lombardi(weight: number, reps: number): number {
    if (reps <= 0 || weight <= 0) return 0;
    return weight * Math.pow(reps, 0.1);
  },

  wathan(weight: number, reps: number): number {
    if (reps <= 0 || weight <= 0) return 0;
    return (100 * weight) / (48.8 + 53.8 * Math.exp(-0.075 * reps));
  },

  estimate(weight: number, reps: number, formula: OneRMFormula = "epley"): number {
    switch (formula) {
      case "epley": return OneRM.epley(weight, reps);
      case "brzycki": return OneRM.brzycki(weight, reps);
      case "lombardi": return OneRM.lombardi(weight, reps);
      case "wathan": return OneRM.wathan(weight, reps);
    }
  },

  /** Working weight for a given % of an estimated 1RM. */
  percentage(oneRM: number, percent: number): number {
    return (oneRM * percent) / 100;
  },
};
