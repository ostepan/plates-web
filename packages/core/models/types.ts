// Entity types ported from the iOS SwiftData @Model classes. Relationships are
// foreign-key ids (IndexedDB has no joins). Dates are epoch-ms numbers.
import type {
  Equipment, Gender, Mechanic, MuscleGroup, ProgressionRule,
  SetKind, TrainingExperience, WeightUnit,
} from "./enums";

export type ID = string; // UUID

export interface Exercise {
  id: ID;
  nameKey: string;
  nameEN: string;
  nameCS: string;
  muscleGroup: MuscleGroup;
  secondary: MuscleGroup[];
  equipment: Equipment;
  mechanic: Mechanic;
  instructionsEN?: string;
  instructionsCS?: string;
  /** User-authored form cues — distinct from the read-only stock instructions. */
  userNotes?: string;
  isCustom: boolean;
  defaultRestSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface Routine {
  id: ID;
  name: string;
  notes: string;
  lastUsed?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineExercise {
  id: ID;
  routineId: ID;
  exerciseId: ID;
  order: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRIR?: number;
  targetWeight?: number;
  restSeconds: number;
  supersetGroupId?: ID;
  createdAt: number;
}

export interface SupersetGroup {
  id: ID;
  routineId: ID;
  order: number;
}

export interface Program {
  id: ID;
  name: string;
  author: string;
  weeks: number;
  notes: string;
  isBuiltIn: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Mesocycle {
  id: ID;
  programId: ID;
  order: number;
  progressionRule: ProgressionRule;
  linearStepKg?: number;
  targetRIR?: number;
}

export interface Microcycle {
  id: ID;
  mesocycleId: ID;
  weekIndex: number;
  isDeload: boolean;
}

export interface ProgramDay {
  id: ID;
  microcycleId: ID;
  dayIndex: number;
  name: string;
  routineId?: ID;
}

export interface Session {
  id: ID;
  date: number;
  routineId?: ID;
  routineNameSnapshot: string;
  durationSeconds: number;
  notes: string;
  warmupNotes: string;
  totalVolume: number;
  bodyWeightSnapshot?: number;
  programDayID?: ID;
  recoverySnapshotPercentage?: number;
  wasDeloadAtStart: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionExercise {
  id: ID;
  sessionId: ID;
  exerciseId?: ID;
  order: number;
  notesPerExercise: string;
  prFlagsRaw: number;
  supersetGroupID?: ID;
  createdAt: number;
}

export interface WorkoutSet {
  id: ID;
  sessionExerciseId: ID;
  order: number;
  kind: SetKind;
  weight: number;
  reps: number;
  rir?: number;
  rpe?: number;
  isCompleted: boolean;
  createdAt: number;
}

export interface BodyWeightEntry {
  id: ID;
  date: number;
  weight: number;
  weightUnit: WeightUnit;
  notes: string;
  createdAt: number;
}

export interface UserProfile {
  id: ID;
  age?: number;
  gender?: Gender;
  trainingExperience?: TrainingExperience;
  createdAt: number;
  updatedAt: number;
}

export interface RecoverySettings {
  id: ID;
  secondaryMuscleImpact: number;
  readyThreshold: number;
  mostlyRecoveredThreshold: number;
  partiallyRecoveredThreshold: number;
  recoveringThreshold: number;
  notificationsEnabled: boolean;
  customRecoveryTimes: Record<string, number>;
  deloadStartDate?: number;
  deloadEndDate?: number;
  deloadMultiplier: number;
  createdAt: number;
  updatedAt: number;
}

export interface MuscleVolumeTarget {
  id: ID;
  muscleGroup: MuscleGroup;
  mev: number;
  mav: number;
  mrv: number;
  createdAt: number;
  updatedAt: number;
}

export interface MuscleRecoveryStatus {
  id: ID;
  muscleGroup: MuscleGroup;
  recoveryPercentage: number;
  lastTrainedDate?: number;
  updatedAt: number;
}

export interface RecoveryFactors {
  id: ID;
  date: number;
  sleepQuality: number;
  nutritionQuality: number;
  stressLevel: number;
  energyLevel: number;
  sorenessLevel: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface MuscleRecoveryHistoryPoint {
  id: ID;
  muscleGroup: MuscleGroup;
  date: number;
  recoveryPercentage: number;
}
