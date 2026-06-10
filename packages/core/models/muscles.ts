// Finer-grained muscle taxonomy layered over the coarse MuscleGroup enum.
// Exercises stay tagged with MuscleGroup (wire-compatible with the iOS seed
// data), and detailed heads are derived per exercise by name classification
// (see calc/muscleDetail.ts) so recovery can track e.g. front vs side vs rear
// delts separately. Groups that don't split reuse their MuscleGroup id as
// their single detail.
import type { MuscleGroup } from "./enums";

export type DetailedMuscle =
  | "upperChest"
  | "midChest"
  | "lowerChest"
  | "lats"
  | "upperBack"
  | "lowerBack"
  | "frontDelts"
  | "sideDelts"
  | "rearDelts"
  | "traps"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "adductors"
  | "glutes"
  | "abductors"
  | "calves"
  | "abs"
  | "obliques"
  | "cardio"
  | "fullBody";

/** Detail heads per coarse group; single-element groups don't split. */
export const DETAILED_MUSCLES: Record<MuscleGroup, DetailedMuscle[]> = {
  chest: ["upperChest", "midChest", "lowerChest"],
  back: ["lats", "upperBack", "lowerBack"],
  shoulders: ["frontDelts", "sideDelts", "rearDelts", "traps"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearms"],
  legs: ["quads", "hamstrings", "adductors"],
  glutes: ["glutes", "abductors"],
  calves: ["calves"],
  abs: ["abs", "obliques"],
  cardio: ["cardio"],
  fullBody: ["fullBody"],
};

export const DETAIL_PARENT: Record<DetailedMuscle, MuscleGroup> = Object.fromEntries(
  Object.entries(DETAILED_MUSCLES).flatMap(([group, details]) =>
    details.map((d) => [d, group as MuscleGroup]),
  ),
) as Record<DetailedMuscle, MuscleGroup>;

/** i18n key per detail head (unsplit groups reuse the group's key). */
export const DETAIL_I18N_KEY: Record<DetailedMuscle, string> = {
  upperChest: "muscle.upper_chest",
  midChest: "muscle.mid_chest",
  lowerChest: "muscle.lower_chest",
  lats: "muscle.lats",
  upperBack: "muscle.upper_back",
  lowerBack: "muscle.lower_back",
  frontDelts: "muscle.front_delts",
  sideDelts: "muscle.side_delts",
  rearDelts: "muscle.rear_delts",
  traps: "muscle.traps",
  biceps: "muscle.biceps",
  triceps: "muscle.triceps",
  forearms: "muscle.forearms",
  quads: "muscle.quads",
  hamstrings: "muscle.hamstrings",
  adductors: "muscle.adductors",
  glutes: "muscle.glutes",
  abductors: "muscle.abductors",
  calves: "muscle.calves",
  abs: "muscle.abs",
  obliques: "muscle.obliques",
  cardio: "muscle.cardio",
  fullBody: "muscle.full_body",
};
