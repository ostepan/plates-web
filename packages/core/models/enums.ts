// String-union ports of the iOS PlatesCore enums. Values match the iOS
// `rawValue`s so seed data + any future backup files are wire-compatible.

export type WeightUnit = "kg" | "lb";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "legs"
  | "glutes"
  | "calves"
  | "abs"
  | "cardio"
  | "fullBody";

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  "chest", "back", "shoulders", "biceps", "triceps", "forearms",
  "legs", "glutes", "calves", "abs", "cardio", "fullBody",
];

export type Equipment =
  | "barbell"
  | "dumbbell"
  | "cable"
  | "machine"
  | "bodyweight"
  | "kettlebell"
  | "band"
  | "other";

export const ALL_EQUIPMENT: Equipment[] = [
  "barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band", "other",
];

export type Mechanic = "compound" | "isolation";

export type SetKind = "working" | "warmup" | "dropset" | "amrap" | "restPause" | "myoReps";

export type ProgressionRule =
  | "linear"
  | "doubleProgression"
  | "percentageOf1RM"
  | "rirBased";

export type Gender = "male" | "female" | "other";

export type TrainingExperience = "beginner" | "intermediate" | "advanced";

export type OneRMFormula = "epley" | "brzycki" | "lombardi" | "wathan";

/** i18n key suffix used by the muscle name lookups (`muscle.full_body`, etc.). */
export const MUSCLE_I18N_KEY: Record<MuscleGroup, string> = {
  chest: "muscle.chest",
  back: "muscle.back",
  shoulders: "muscle.shoulders",
  biceps: "muscle.biceps",
  triceps: "muscle.triceps",
  forearms: "muscle.forearms",
  legs: "muscle.legs",
  glutes: "muscle.glutes",
  calves: "muscle.calves",
  abs: "muscle.abs",
  cardio: "muscle.cardio",
  fullBody: "muscle.full_body",
};
