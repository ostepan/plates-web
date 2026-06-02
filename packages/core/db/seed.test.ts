import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";

describe("seedIfNeeded — idempotent & concurrency-safe", () => {
  it("seeds exactly 165 exercises with no duplicates under a StrictMode double-invoke", async () => {
    // React StrictMode double-invokes the seeding effect in dev; simulate two
    // overlapping calls. The non-atomic count-then-insert used to let both
    // observe an empty store and each insert the full library.
    await Promise.all([seedIfNeeded(), seedIfNeeded()]);

    expect(await db.exercises.count()).toBe(165);
    const keys = (await db.exercises.toArray()).map((e) => e.nameKey);
    expect(new Set(keys).size).toBe(keys.length); // no duplicate nameKeys
  });

  it("does not duplicate programs or volume targets on a third run", async () => {
    const programs = await db.programs.count();
    const routines = await db.routines.count();
    const targets = await db.muscleVolumeTargets.count();
    expect(programs).toBeGreaterThan(0);
    expect(targets).toBe(10);

    await seedIfNeeded();

    expect(await db.exercises.count()).toBe(165);
    expect(await db.programs.count()).toBe(programs);
    expect(await db.routines.count()).toBe(routines);
    expect(await db.muscleVolumeTargets.count()).toBe(targets);
  });
});
