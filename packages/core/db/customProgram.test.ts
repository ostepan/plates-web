import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import { activateProgram, createCustomProgram, createRoutine, deleteProgram, updateCustomProgram } from "./mutations";

describe("custom program editor", () => {
  beforeAll(async () => {
    await seedIfNeeded();
  });

  it("builds a Meso→Micro→Day subtree, sharing days across weeks with a deload flag", async () => {
    const push = await createRoutine("Push");
    const pull = await createRoutine("Pull");

    const programId = await createCustomProgram({
      name: "My PPL",
      weeks: 4,
      deloadWeekIndex: 3, // 0-based → week 4
      progressionRule: "linear",
      linearStepKg: 2.5,
      days: [
        { name: "Push", routineId: push },
        { name: "Pull", routineId: pull },
      ],
    });

    const program = await db.programs.get(programId);
    expect(program).toMatchObject({ isBuiltIn: false, isActive: false, weeks: 4, author: "You" });

    const mesos = await db.mesocycles.where("programId").equals(programId).toArray();
    expect(mesos).toHaveLength(1);
    expect(mesos[0]).toMatchObject({ progressionRule: "linear", linearStepKg: 2.5 });

    const micros = (await db.microcycles.where("mesocycleId").equals(mesos[0].id).toArray())
      .sort((a, b) => a.weekIndex - b.weekIndex);
    expect(micros).toHaveLength(4);
    expect(micros.filter((m) => m.isDeload).map((m) => m.weekIndex)).toEqual([3]);

    // each week shares the same 2 day templates (4 × 2 = 8 program days)
    const allDays = await db.programDays.where("microcycleId").anyOf(micros.map((m) => m.id)).toArray();
    expect(allDays).toHaveLength(8);
    const wk1 = allDays.filter((d) => d.microcycleId === micros[0].id).sort((a, b) => a.dayIndex - b.dayIndex);
    expect(wk1.map((d) => d.routineId)).toEqual([push, pull]);
    expect(wk1.map((d) => d.dayIndex)).toEqual([1, 2]);
  });

  it("deleteProgram removes the whole subtree but spares built-ins", async () => {
    const r = await createRoutine("Solo");
    const programId = await createCustomProgram({
      name: "Throwaway", weeks: 2, progressionRule: "doubleProgression",
      days: [{ name: "A", routineId: r }],
    });
    const mesoIds = (await db.mesocycles.where("programId").equals(programId).toArray()).map((m) => m.id);
    const microIds = (await db.microcycles.where("mesocycleId").anyOf(mesoIds).toArray()).map((m) => m.id);

    await deleteProgram(programId);

    expect(await db.programs.get(programId)).toBeUndefined();
    expect(await db.mesocycles.where("programId").equals(programId).count()).toBe(0);
    expect(await db.programDays.where("microcycleId").anyOf(microIds).count()).toBe(0);

    // built-in programs are protected
    const builtIn = (await db.programs.toArray()).find((p) => p.isBuiltIn)!;
    await deleteProgram(builtIn.id);
    expect(await db.programs.get(builtIn.id)).toBeTruthy();
  });

  it("updateCustomProgram rebuilds the subtree and preserves the program row", async () => {
    const r1 = await createRoutine("R1");
    const r2 = await createRoutine("R2");
    const pid = await createCustomProgram({
      name: "V1", weeks: 3, progressionRule: "linear", linearStepKg: 2.5,
      days: [{ name: "A", routineId: r1 }],
    });
    await activateProgram(pid);

    await updateCustomProgram(pid, {
      name: "V2", notes: "edited", weeks: 5, deloadWeekIndex: 4,
      progressionRule: "rirBased", targetRIR: 1,
      days: [{ name: "Push", routineId: r1 }, { name: "Pull", routineId: r2 }],
    });

    const p = await db.programs.get(pid);
    expect(p).toMatchObject({ id: pid, name: "V2", notes: "edited", weeks: 5, isActive: true, isBuiltIn: false });

    const mesos = await db.mesocycles.where("programId").equals(pid).toArray();
    expect(mesos).toHaveLength(1);
    expect(mesos[0]).toMatchObject({ progressionRule: "rirBased", targetRIR: 1 });

    const micros = (await db.microcycles.where("mesocycleId").equals(mesos[0].id).toArray())
      .sort((a, b) => a.weekIndex - b.weekIndex);
    expect(micros).toHaveLength(5);
    expect(micros.filter((m) => m.isDeload).map((m) => m.weekIndex)).toEqual([4]);

    const days = await db.programDays.where("microcycleId").anyOf(micros.map((m) => m.id)).toArray();
    expect(days).toHaveLength(10); // 5 weeks × 2 days
  });

  it("updateCustomProgram ignores built-in programs", async () => {
    const builtIn = (await db.programs.toArray()).find((p) => p.isBuiltIn)!;
    const beforeName = builtIn.name;
    const r = await createRoutine("X");
    await updateCustomProgram(builtIn.id, {
      name: "Hacked", weeks: 1, progressionRule: "linear", days: [{ name: "A", routineId: r }],
    });
    expect((await db.programs.get(builtIn.id))?.name).toBe(beforeName);
  });
});
