import { db } from "./db";
import type { ID, Mesocycle, Microcycle, Program, ProgramDay } from "../models/types";

export interface ProgramDayView {
  day: ProgramDay;
  exerciseCount: number;
}
export interface MicrocycleView {
  micro: Microcycle;
  days: ProgramDayView[];
}
export interface MesocycleView {
  meso: Mesocycle;
  micros: MicrocycleView[];
}
export interface ProgramStructure {
  program: Program;
  daysPerWeek: number;
  mesos: MesocycleView[];
}

/** Full nested program structure for the detail/calendar view. */
export async function loadProgram(programId: ID): Promise<ProgramStructure | null> {
  const program = await db.programs.get(programId);
  if (!program) return null;

  const mesos = (await db.mesocycles.where("programId").equals(programId).toArray()).sort(
    (a, b) => a.order - b.order,
  );

  const mesoViews: MesocycleView[] = [];
  for (const meso of mesos) {
    const micros = (await db.microcycles.where("mesocycleId").equals(meso.id).toArray()).sort(
      (a, b) => a.weekIndex - b.weekIndex,
    );
    const microViews: MicrocycleView[] = [];
    for (const micro of micros) {
      const days = (await db.programDays.where("microcycleId").equals(micro.id).toArray()).sort(
        (a, b) => a.dayIndex - b.dayIndex,
      );
      const dayViews = await Promise.all(
        days.map(async (day) => ({
          day,
          exerciseCount: day.routineId
            ? await db.routineExercises.where("routineId").equals(day.routineId).count()
            : 0,
        })),
      );
      microViews.push({ micro, days: dayViews });
    }
    mesoViews.push({ meso, micros: microViews });
  }

  return { program, daysPerWeek: mesoViews[0]?.micros[0]?.days.length ?? 0, mesos: mesoViews };
}

/** Routine ids owned by a program day — excluded from the standalone routine list. */
export async function programOwnedRoutineIds(): Promise<Set<ID>> {
  const days = await db.programDays.toArray();
  return new Set(days.map((d) => d.routineId).filter((x): x is ID => !!x));
}

export async function activeProgram(): Promise<Program | undefined> {
  return (await db.programs.toArray()).find((p) => p.isActive);
}
