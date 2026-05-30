import { db } from "./db";
import type {
  Exercise, ID, Mesocycle, Microcycle, Program, ProgramDay, Routine, RoutineExercise,
} from "../models/types";
import type { Equipment, Mechanic, MuscleGroup, ProgressionRule } from "../models/enums";
import exercisesJson from "../seed/exercises.json";
import programsJson from "../seed/programs.json";

// ---- seed JSON shapes ----
interface ExerciseSeed {
  key: string; en: string; cs: string; muscle: string; secondary?: string[];
  equipment: string; mechanic: string; rest: number;
}
interface DayExSeed { key: string; sets: number; repsMin: number; repsMax: number; rest: number }
interface DaySeed { dayIndex: number; name: string; exercises: DayExSeed[] }
interface WeekSeed { isDeload: boolean; days?: DaySeed[]; copyOfWeek?: number }
interface MesoSeed {
  weekCount: number; progressionRule: string; linearStepKg?: number; targetRIR?: number; weeks: WeekSeed[];
}
interface ProgramSeed { name: string; author: string; weeks: number; notes: string; mesocycles: MesoSeed[] }

const newId = (): ID => crypto.randomUUID();
const now = (): number => Date.now();

function toExercise(s: ExerciseSeed): Exercise {
  const t = now();
  return {
    id: newId(), nameKey: s.key, nameEN: s.en, nameCS: s.cs,
    muscleGroup: s.muscle as MuscleGroup, secondary: (s.secondary ?? []) as MuscleGroup[],
    equipment: s.equipment as Equipment, mechanic: s.mechanic as Mechanic,
    isCustom: false, defaultRestSeconds: s.rest, createdAt: t, updatedAt: t,
  };
}

/**
 * Expands the program seed into Program → Mesocycle → Microcycle → ProgramDay,
 * minting a real Routine (+ RoutineExercises) per program-day. `copyOfWeek`
 * weeks reuse an earlier week's days. Port of iOS `ProgramSeedLoader`.
 */
async function expandPrograms(): Promise<void> {
  const existing = new Set((await db.programs.toArray()).map((p) => p.name));
  const exByKey = new Map((await db.exercises.toArray()).map((e) => [e.nameKey, e.id]));

  const programs: Program[] = [];
  const mesocycles: Mesocycle[] = [];
  const microcycles: Microcycle[] = [];
  const programDays: ProgramDay[] = [];
  const routines: Routine[] = [];
  const routineExercises: RoutineExercise[] = [];
  const t = now();

  for (const p of programsJson as ProgramSeed[]) {
    if (existing.has(p.name)) continue;
    const programId = newId();
    programs.push({
      id: programId, name: p.name, author: p.author, weeks: p.weeks, notes: p.notes,
      isBuiltIn: true, isActive: false, createdAt: t, updatedAt: t,
    });

    p.mesocycles.forEach((meso, mi) => {
      const mesoId = newId();
      mesocycles.push({
        id: mesoId, programId, order: mi,
        progressionRule: meso.progressionRule as ProgressionRule,
        linearStepKg: meso.linearStepKg, targetRIR: meso.targetRIR,
      });

      meso.weeks.forEach((week, wi) => {
        const microId = newId();
        microcycles.push({ id: microId, mesocycleId: mesoId, weekIndex: wi, isDeload: !!week.isDeload });

        const srcDays = week.days ?? (week.copyOfWeek != null ? meso.weeks[week.copyOfWeek]?.days : undefined) ?? [];
        for (const day of srcDays) {
          const routineId = newId();
          routines.push({ id: routineId, name: day.name, notes: "", createdAt: t, updatedAt: t });
          day.exercises.forEach((ex, oi) => {
            const exerciseId = exByKey.get(ex.key);
            if (!exerciseId) return;
            routineExercises.push({
              id: newId(), routineId, exerciseId, order: oi,
              targetSets: ex.sets, targetRepsMin: ex.repsMin, targetRepsMax: ex.repsMax,
              restSeconds: ex.rest, createdAt: t,
            });
          });
          programDays.push({ id: newId(), microcycleId: microId, dayIndex: day.dayIndex, name: day.name, routineId });
        }
      });
    });
  }

  if (!programs.length) return;
  await db.transaction(
    "rw",
    [db.programs, db.mesocycles, db.microcycles, db.programDays, db.routines, db.routineExercises],
    async () => {
      await db.programs.bulkAdd(programs);
      await db.mesocycles.bulkAdd(mesocycles);
      await db.microcycles.bulkAdd(microcycles);
      await db.programDays.bulkAdd(programDays);
      await db.routines.bulkAdd(routines);
      await db.routineExercises.bulkAdd(routineExercises);
    },
  );
}

/** First-run seeding — idempotent (only seeds empty tables / new program names). */
export async function seedIfNeeded(): Promise<void> {
  if ((await db.exercises.count()) === 0) {
    await db.exercises.bulkAdd((exercisesJson as ExerciseSeed[]).map(toExercise));
  }
  await expandPrograms();
}
