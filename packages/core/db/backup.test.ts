import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import { createRoutine } from "./mutations";
import { exportBackup, exportCSV, importBackup } from "./backup";

describe("backup (M5)", () => {
  beforeAll(async () => {
    await seedIfNeeded();
  });

  it("export → wipe → import restores the data", async () => {
    await createRoutine("Roundtrip");
    const exercisesBefore = await db.exercises.count();
    const json = await exportBackup();

    await db.routines.clear();
    await db.exercises.clear();
    expect(await db.exercises.count()).toBe(0);

    await importBackup(json);
    expect(await db.exercises.count()).toBe(exercisesBefore);
    expect((await db.routines.toArray()).some((r) => r.name === "Roundtrip")).toBe(true);
  });

  it("CSV has the expected header", async () => {
    const csv = await exportCSV();
    expect(csv.split("\n")[0]).toBe("date,routine,exercise,set,weight,reps,kind,completed");
  });
});
