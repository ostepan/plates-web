// Exercise → detailed-muscle classification. The coarse MuscleGroup tag on an
// exercise says *which group* a set fatigues; this module says *which heads of
// that group* it fatigues and how hard, by keyword-matching the exercise name
// (seed nameKeys and custom-exercise names alike).
//
// Credits are max-normalized: the most-stimulated head receives the full set
// count (so its reading lines up with the coarse group number) and lesser
// heads receive a fraction. E.g. a bench press set credits midChest 1.0,
// upperChest/lowerChest 0.5 each; a lateral-raise set credits sideDelts 1.0
// and traps ~0.1.
import type { MuscleGroup } from "../models/enums";
import { DETAILED_MUSCLES, type DetailedMuscle } from "../models/muscles";

const HOUR = 3600; // seconds

// Base recovery time (seconds) per detail head under optimal conditions.
// Heads inherit the spirit of BASE_RECOVERY but differentiate where physiology
// does: small rear/side delts bounce back faster than pressing-loaded front
// delts; spinal erectors and the big leg movers are the slowest.
export const DETAIL_BASE_RECOVERY: Record<DetailedMuscle, number> = {
  upperChest: 48 * HOUR,
  midChest: 48 * HOUR,
  lowerChest: 48 * HOUR,
  lats: 48 * HOUR,
  upperBack: 48 * HOUR,
  lowerBack: 72 * HOUR,
  frontDelts: 48 * HOUR,
  sideDelts: 36 * HOUR,
  rearDelts: 36 * HOUR,
  traps: 48 * HOUR,
  biceps: 36 * HOUR,
  triceps: 36 * HOUR,
  forearms: 24 * HOUR,
  quads: 72 * HOUR,
  hamstrings: 72 * HOUR,
  adductors: 48 * HOUR,
  glutes: 72 * HOUR,
  abductors: 48 * HOUR,
  calves: 24 * HOUR,
  abs: 36 * HOUR,
  obliques: 36 * HOUR,
  cardio: 24 * HOUR,
  fullBody: 72 * HOUR,
};

type Split = Partial<Record<DetailedMuscle, number>>;
interface Rule {
  match: RegExp;
  split: Split;
}

// Rules are evaluated against the normalized exercise name (lowercase,
// separators collapsed to "_") for the group being credited; first match wins.
// Splits are relative stimulus shares — they get max-normalized in
// detailCredits, so only the ratios matter.
const RULES: Partial<Record<MuscleGroup, Rule[]>> = {
  chest: [
    { match: /incline|low_to_high|low_cable/, split: { upperChest: 0.6, midChest: 0.3, lowerChest: 0.1 } },
    { match: /decline|dip|high_to_low|high_cable/, split: { lowerChest: 0.6, midChest: 0.4 } },
  ],
  back: [
    { match: /deadlift|rack_pull|good_morning/, split: { lowerBack: 0.5, upperBack: 0.35, lats: 0.15 } },
    { match: /hyperextension|back_extension/, split: { lowerBack: 1 } },
    { match: /pulldown|pullup|pull_up|chinup|chin_up|pullover|straight_arm/, split: { lats: 0.75, upperBack: 0.25 } },
    { match: /row|face_pull/, split: { upperBack: 0.55, lats: 0.45 } },
  ],
  shoulders: [
    { match: /shrug/, split: { traps: 1 } },
    { match: /face_pull/, split: { rearDelts: 0.7, traps: 0.3 } },
    { match: /rear_delt|reverse_pec/, split: { rearDelts: 0.9, traps: 0.1 } },
    { match: /lateral_raise|scaption/, split: { sideDelts: 0.9, traps: 0.1 } },
    { match: /upright_row/, split: { sideDelts: 0.6, traps: 0.4 } },
    { match: /front_raise/, split: { frontDelts: 1 } },
    // chest pressing/fly patterns crediting shoulders as a secondary
    { match: /bench|push_up|pushup|fly|crossover|dip/, split: { frontDelts: 0.9, sideDelts: 0.1 } },
    // rowing/pulling patterns crediting shoulders as a secondary
    { match: /row|pull/, split: { rearDelts: 0.6, traps: 0.25, sideDelts: 0.15 } },
    { match: /press|jerk/, split: { frontDelts: 0.65, sideDelts: 0.3, rearDelts: 0.05 } },
  ],
  legs: [
    { match: /leg_extension|sissy/, split: { quads: 1 } },
    { match: /leg_curl|nordic|hamstring/, split: { hamstrings: 1 } },
    { match: /romanian|stiff|pull_through|good_morning/, split: { hamstrings: 0.9, adductors: 0.1 } },
    { match: /adduction/, split: { adductors: 1 } },
    { match: /sumo|wide/, split: { quads: 0.5, adductors: 0.35, hamstrings: 0.15 } },
    { match: /deadlift/, split: { hamstrings: 0.45, quads: 0.4, adductors: 0.15 } },
    { match: /side_lunge|lateral_lunge/, split: { quads: 0.5, adductors: 0.4, hamstrings: 0.1 } },
  ],
  glutes: [
    { match: /abduction|clamshell|fire_hydrant|lateral_walk/, split: { abductors: 1 } },
  ],
  abs: [
    { match: /oblique|side_plank|russian|twist|rotation|wiper|bicycle/, split: { obliques: 0.8, abs: 0.2 } },
  ],
};

// Generic-movement split per group when no rule matches (or for exercises the
// keywords can't see, like custom names in another language).
const DEFAULT_SPLIT: Partial<Record<MuscleGroup, Split>> = {
  chest: { midChest: 0.5, upperChest: 0.25, lowerChest: 0.25 },
  back: { lats: 0.5, upperBack: 0.35, lowerBack: 0.15 },
  shoulders: { frontDelts: 0.4, sideDelts: 0.35, rearDelts: 0.25 },
  legs: { quads: 0.6, hamstrings: 0.25, adductors: 0.15 },
  glutes: { glutes: 1 },
  abs: { abs: 0.85, obliques: 0.15 },
};

const normalize = (name: string) => name.toLowerCase().replace(/[\s\-./]+/g, "_");

/**
 * Detail-head credit weights for an exercise crediting `group`, derived from
 * the exercise's name(s). Max-normalized: the dominant head is 1.0 and the
 * rest are relative to it, so per-head set counts stay comparable with the
 * coarse per-group counts. Unsplit groups credit their single head at 1.0.
 */
export function detailCredits(name: string, group: MuscleGroup): Partial<Record<DetailedMuscle, number>> {
  const details = DETAILED_MUSCLES[group];
  if (details.length === 1) return { [details[0]]: 1 };

  const hay = normalize(name);
  const split =
    RULES[group]?.find((r) => r.match.test(hay))?.split ?? DEFAULT_SPLIT[group] ?? { [details[0]]: 1 };

  const entries = Object.entries(split) as [DetailedMuscle, number][];
  const max = Math.max(...entries.map(([, w]) => w));
  const out: Partial<Record<DetailedMuscle, number>> = {};
  for (const [d, w] of entries) out[d] = w / max;
  return out;
}
