import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import {
  addExerciseToRoutine, createCustomExercise, createRoutine, deleteExercise,
  updateCustomExercise, updateExerciseNotes,
} from "./mutations";
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

  it("createCustomExercise marks isCustom, namespaces nameKey, falls back CS→EN", async () => {
    const id = await createCustomExercise({
      nameEN: "Zercher Squat",
      muscleGroup: "legs",
      secondary: ["glutes", "legs"], // primary should be filtered out of secondary
      equipment: "barbell",
      mechanic: "compound",
    });
    const ex = await db.exercises.get(id);
    expect(ex).toMatchObject({ isCustom: true, nameEN: "Zercher Squat", nameCS: "Zercher Squat" });
    expect(ex!.nameKey).toBe(`custom:${id}`);
    expect(ex!.secondary).toEqual(["glutes"]);
    expect(ex!.defaultRestSeconds).toBe(120);
  });

  it("updateCustomExercise edits a custom exercise and ignores stock", async () => {
    const id = await createCustomExercise({
      nameEN: "Temp", muscleGroup: "chest", equipment: "dumbbell", mechanic: "isolation",
    });
    await updateCustomExercise(id, {
      nameEN: "Renamed Press", nameCS: "Tlak", muscleGroup: "shoulders",
      equipment: "machine", mechanic: "compound", defaultRestSeconds: 90,
    });
    expect(await db.exercises.get(id)).toMatchObject({
      nameEN: "Renamed Press", nameCS: "Tlak", muscleGroup: "shoulders",
      equipment: "machine", mechanic: "compound", defaultRestSeconds: 90,
    });

    const stock = (await db.exercises.toArray()).find((e) => !e.isCustom)!;
    const before = stock.nameEN;
    await updateCustomExercise(stock.id, {
      nameEN: "Hacked", muscleGroup: "abs", equipment: "band", mechanic: "isolation",
    });
    expect((await db.exercises.get(stock.id))?.nameEN).toBe(before);
  });
});
