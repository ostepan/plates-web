import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { seedIfNeeded } from "./seed";
import { activateProgram, deactivateProgram, startProgramDay } from "./mutations";
import { activeProgram, loadProgram, programOwnedRoutineIds } from "./queries";

describe("programs (M2)", () => {
  beforeAll(async () => {
    await seedIfNeeded();
  });

  it("expands the 6 built-in programs into meso/micro/day/routine", async () => {
    expect(await db.programs.count()).toBe(6);
    expect(await db.mesocycles.count()).toBeGreaterThan(0);
    expect(await db.microcycles.count()).toBeGreaterThan(0);
    expect(await db.programDays.count()).toBeGreaterThan(0);
    // every program-day minted a real routine with exercises
    const owned = await programOwnedRoutineIds();
    expect(owned.size).toBe(await db.programDays.count());
  });

  it("PPL has 1 mesocycle × 4 weeks × 6 days, first day fully populated", async () => {
    const ppl = (await db.programs.toArray()).find((p) => p.name === "Push Pull Legs")!;
    const s = await loadProgram(ppl.id);
    expect(s).toBeTruthy();
    expect(s!.mesos).toHaveLength(1);
    expect(s!.mesos[0].micros).toHaveLength(4);
    expect(s!.daysPerWeek).toBe(6);
    expect(s!.mesos[0].micros[3].micro.isDeload).toBe(true); // week 4 = deload
    const firstDay = s!.mesos[0].micros[0].days[0];
    expect(firstDay.exerciseCount).toBe(5); // Tlak A has 5 exercises
  });

  it("activation is exclusive; program-day start stamps the session", async () => {
    const [a, b] = await db.programs.toArray();
    await activateProgram(a.id);
    expect((await activeProgram())?.id).toBe(a.id);
    await activateProgram(b.id);
    const actives = (await db.programs.toArray()).filter((p) => p.isActive);
    expect(actives.map((p) => p.id)).toEqual([b.id]);
    await deactivateProgram(b.id);
    expect(await activeProgram()).toBeUndefined();

    const ppl = (await db.programs.toArray()).find((p) => p.name === "Push Pull Legs")!;
    const day = (await loadProgram(ppl.id))!.mesos[0].micros[0].days[0].day;
    const sessionId = await startProgramDay(day.id);
    expect(sessionId).toBeTruthy();
    const session = await db.sessions.get(sessionId!);
    expect(session!.programDayID).toBe(day.id);
    expect(session!.routineNameSnapshot).toBe(day.name);
  });
});
