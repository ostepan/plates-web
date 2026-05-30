import { db } from "./db";
import type { Exercise, Program } from "../models/types";
import type { Equipment, Mechanic, MuscleGroup } from "../models/enums";
import exercisesJson from "../seed/exercises.json";
import programsJson from "../seed/programs.json";

interface ExerciseSeed {
  key: string;
  en: string;
  cs: string;
  muscle: string;
  secondary?: string[];
  equipment: string;
  mechanic: string;
  rest: number;
}

interface ProgramSeed {
  name: string;
  author: string;
  weeks: number;
  notes: string;
  mesocycles: unknown[];
}

const now = () => Date.now();

function toExercise(s: ExerciseSeed): Exercise {
  const t = now();
  return {
    id: crypto.randomUUID(),
    nameKey: s.key,
    nameEN: s.en,
    nameCS: s.cs,
    muscleGroup: s.muscle as MuscleGroup,
    secondary: (s.secondary ?? []) as MuscleGroup[],
    equipment: s.equipment as Equipment,
    mechanic: s.mechanic as Mechanic,
    isCustom: false,
    defaultRestSeconds: s.rest,
    createdAt: t,
    updatedAt: t,
  };
}

function toProgram(s: ProgramSeed): Program {
  const t = now();
  return {
    id: crypto.randomUUID(),
    name: s.name,
    author: s.author,
    weeks: s.weeks,
    notes: s.notes,
    isBuiltIn: true,
    isActive: false,
    createdAt: t,
    updatedAt: t,
  };
}

/**
 * First-run seeding — mirrors iOS `SeedDataLoader` / `ProgramSeedLoader`.
 * Idempotent: only seeds tables that are empty, and skips programs whose name
 * already exists (so re-seeding after a JSON edit doesn't duplicate).
 *
 * NOTE (M2): only program *metadata* is seeded for now. The mesocycle →
 * microcycle → program-day → routine → exercise expansion lands with Programs.
 */
export async function seedIfNeeded(): Promise<void> {
  const exerciseCount = await db.exercises.count();
  if (exerciseCount === 0) {
    await db.exercises.bulkAdd((exercisesJson as ExerciseSeed[]).map(toExercise));
  }

  const existing = new Set((await db.programs.toArray()).map((p) => p.name));
  const toAdd = (programsJson as ProgramSeed[])
    .filter((p) => !existing.has(p.name))
    .map(toProgram);
  if (toAdd.length) await db.programs.bulkAdd(toAdd);
}
