import Dexie, { type Table } from "dexie";
import type {
  BodyWeightEntry, Exercise, ID, Mesocycle, Microcycle, MuscleRecoveryHistoryPoint,
  MuscleRecoveryStatus, MuscleVolumeTarget, Program, ProgramDay, RecoveryFactors,
  RecoverySettings, Routine, RoutineExercise, Session, SessionExercise, SupersetGroup,
  UserProfile, WorkoutSet,
} from "../models/types";

/**
 * Local-first store — the web analog of the iOS SwiftData container. One object
 * store per entity; relationships are foreign-key ids. Cascade deletes are
 * enforced in `mutations.ts` transactions (IndexedDB has none of its own).
 */
export class PlatesDB extends Dexie {
  exercises!: Table<Exercise, ID>;
  routines!: Table<Routine, ID>;
  routineExercises!: Table<RoutineExercise, ID>;
  supersetGroups!: Table<SupersetGroup, ID>;
  programs!: Table<Program, ID>;
  mesocycles!: Table<Mesocycle, ID>;
  microcycles!: Table<Microcycle, ID>;
  programDays!: Table<ProgramDay, ID>;
  sessions!: Table<Session, ID>;
  sessionExercises!: Table<SessionExercise, ID>;
  workoutSets!: Table<WorkoutSet, ID>;
  bodyWeightEntries!: Table<BodyWeightEntry, ID>;
  userProfile!: Table<UserProfile, ID>;
  recoverySettings!: Table<RecoverySettings, ID>;
  muscleVolumeTargets!: Table<MuscleVolumeTarget, ID>;
  muscleRecoveryStatus!: Table<MuscleRecoveryStatus, ID>;
  recoveryFactors!: Table<RecoveryFactors, ID>;
  muscleRecoveryHistoryPoints!: Table<MuscleRecoveryHistoryPoint, ID>;

  constructor() {
    super("plates");
    this.version(1).stores({
      exercises: "id, muscleGroup, equipment, isCustom",
      routines: "id, lastUsed, createdAt",
      routineExercises: "id, routineId, order, supersetGroupId",
      supersetGroups: "id, routineId",
      programs: "id, name",
      mesocycles: "id, programId, order",
      microcycles: "id, mesocycleId, weekIndex",
      programDays: "id, microcycleId, dayIndex, routineId",
      sessions: "id, date, durationSeconds, routineId, programDayID",
      sessionExercises: "id, sessionId, order",
      workoutSets: "id, sessionExerciseId, order",
      bodyWeightEntries: "id, date",
      userProfile: "id",
      recoverySettings: "id",
      muscleVolumeTargets: "id, &muscleGroup",
      muscleRecoveryStatus: "id, &muscleGroup",
      recoveryFactors: "id, date",
      muscleRecoveryHistoryPoints: "id, muscleGroup, date",
    });

    // v2 → v3 heal + harden the exercise library against double-seeding.
    // A non-atomic count-then-insert in `seed.ts` could insert the ~165
    // exercises twice (React StrictMode double-invokes the seeding effect),
    // leaving duplicate rows. v2 deletes any such duplicates — keeping the
    // first row per `nameKey` — so that v3 can build a *unique* `nameKey`
    // index without a ConstraintError. The unique index then guarantees one
    // row per exercise at the DB level, independent of the seeder. Dexie runs
    // v2's upgrade before applying v3's schema, and a fresh DB is created
    // directly at v3 (empty store, no upgrade) — so both paths are safe.
    this.version(2).upgrade(async (tx) => {
      const seen = new Set<string>();
      const dupeIds: ID[] = [];
      for (const e of await tx.table<Exercise, ID>("exercises").toArray()) {
        if (seen.has(e.nameKey)) dupeIds.push(e.id);
        else seen.add(e.nameKey);
      }
      if (dupeIds.length) await tx.table("exercises").bulkDelete(dupeIds);
    });

    this.version(3).stores({
      exercises: "id, &nameKey, muscleGroup, equipment, isCustom",
    });
  }
}

export const db = new PlatesDB();
