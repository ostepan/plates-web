import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import { addExerciseToRoutine, createRoutine, deleteExercise, updateExerciseNotes } from "./mutations";
import type { Exercise } from "../models/types";

function customExercise(name: string): Exercise {
  const t = Date.now();
  return {
    id: crypto.randomUUID(),
    nameKey: name,
    nameEN: name,
    nameCS: name,
    muscleGroup: "chest",
    secondary: [],
    equipment: "dumbbell",
    mechanic: "compound",
    isCustom: true,
    defaultRestSeconds: 120,
    createdAt: t,
    updatedAt: t,
  };
}

describe("exercise mutations", () => {
  beforeAll(async () => {
    await seedIfNeeded();
  });

  it("updateExerciseNotes persists form cues on any exercise", async () => {
    const ex = (await db.exercises.toArray())[0];
    await updateExerciseNotes(ex.id, "Brace hard, elbows tucked");
    expect((await db.exercises.get(ex.id))?.userNotes).toBe("Brace hard, elbows tucked");
  });

  it("deleteExercise ignores stock exercises", async () => {
    const stock = (await db.exercises.toArray()).find((e) => !e.isCustom)!;
    await deleteExercise(stock.id);
    expect(await db.exercises.get(stock.id)).toBeTruthy();
  });

  it("deleteExercise removes a custom exercise and its routine references", async () => {
    const custom = customExercise("My Custom Press");
    await db.exercises.add(custom);
    const routineId = await createRoutine("Custom test");
    const reId = await addExerciseToRoutine(routineId, custom.id);

    await deleteExercise(custom.id);

    expect(await db.exercises.get(custom.id)).toBeUndefined();
    expect(await db.routineExercises.get(reId)).toBeUndefined();
  });
});
