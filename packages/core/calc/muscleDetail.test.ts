import { describe, expect, it } from "vitest";
import { ALL_MUSCLE_GROUPS } from "../models/enums";
import { DETAILED_MUSCLES, DETAIL_PARENT } from "../models/muscles";
import { DETAIL_BASE_RECOVERY, detailCredits } from "./muscleDetail";

describe("detailCredits (exercise → detail-head split)", () => {
  it("max-normalizes: the dominant head always gets full credit", () => {
    for (const [name, group] of [
      ["exercise.bench_press Bench Press", "chest"],
      ["exercise.lateral_raise Lateral Raise", "shoulders"],
      ["exercise.deadlift Deadlift", "back"],
      ["Some Unknown Custom Movement", "legs"],
    ] as const) {
      const credits = Object.values(detailCredits(name, group));
      expect(Math.max(...credits)).toBe(1);
      expect(Math.min(...credits)).toBeGreaterThan(0);
    }
  });

  it("splits shoulder work into front/side/rear delts and traps", () => {
    const press = detailCredits("exercise.overhead_press Overhead Press", "shoulders");
    expect(press.frontDelts).toBe(1);
    expect(press.sideDelts!).toBeLessThan(1);
    expect(press.traps).toBeUndefined();

    const lateral = detailCredits("exercise.lateral_raise Lateral Raise", "shoulders");
    expect(lateral.sideDelts).toBe(1);
    expect(lateral.frontDelts).toBeUndefined();

    const rear = detailCredits("exercise.rear_delt_fly Rear Delt Fly", "shoulders");
    expect(rear.rearDelts).toBe(1);
    expect(rear.sideDelts).toBeUndefined();

    const shrug = detailCredits("exercise.shrug Barbell Shrug", "shoulders");
    expect(shrug).toEqual({ traps: 1 });
  });

  it("front delts carry the load when shoulders are secondary to pressing", () => {
    const bench = detailCredits("exercise.bench_press Bench Press", "shoulders");
    expect(bench.frontDelts).toBe(1);
    expect(bench.rearDelts).toBeUndefined();
  });

  it("rear delts carry the load when shoulders are secondary to rowing", () => {
    const row = detailCredits("exercise.barbell_row Barbell Row", "shoulders");
    expect(row.rearDelts).toBe(1);
    expect(row.frontDelts).toBeUndefined();
  });

  it("distinguishes chest regions by bench angle", () => {
    expect(detailCredits("exercise.incline_bench_press Incline Bench Press", "chest").upperChest).toBe(1);
    expect(detailCredits("exercise.decline_bench_press Decline Bench Press", "chest").lowerChest).toBe(1);
    expect(detailCredits("exercise.bench_press Bench Press", "chest").midChest).toBe(1);
  });

  it("separates lats, upper back and lower back", () => {
    expect(detailCredits("exercise.lat_pulldown Lat Pulldown", "back").lats).toBe(1);
    expect(detailCredits("exercise.barbell_row Barbell Row", "back").upperBack).toBe(1);
    expect(detailCredits("exercise.hyperextension Hyperextension", "back")).toEqual({ lowerBack: 1 });
    expect(detailCredits("exercise.deadlift Deadlift", "back").lowerBack).toBe(1);
  });

  it("separates quads, hamstrings and adductors", () => {
    expect(detailCredits("exercise.back_squat Back Squat", "legs").quads).toBe(1);
    expect(detailCredits("exercise.leg_extension Leg Extension", "legs")).toEqual({ quads: 1 });
    expect(detailCredits("exercise.leg_curl Lying Leg Curl", "legs")).toEqual({ hamstrings: 1 });
    expect(detailCredits("exercise.romanian_deadlift Romanian Deadlift", "legs").hamstrings).toBe(1);
    expect(detailCredits("exercise.hip_adduction_machine Hip Adduction Machine", "legs")).toEqual({ adductors: 1 });
  });

  it("routes abductor work away from the glutes head and oblique work away from abs", () => {
    expect(detailCredits("exercise.clamshell Clamshell", "glutes")).toEqual({ abductors: 1 });
    expect(detailCredits("exercise.hip_thrust Hip Thrust", "glutes")).toEqual({ glutes: 1 });
    expect(detailCredits("exercise.russian_twist Russian Twist", "abs").obliques).toBe(1);
    expect(detailCredits("exercise.crunch Crunch", "abs").abs).toBe(1);
  });

  it("unsplit groups credit their single head in full", () => {
    expect(detailCredits("exercise.barbell_curl Barbell Curl", "biceps")).toEqual({ biceps: 1 });
    expect(detailCredits("exercise.calf_raise Standing Calf Raise", "calves")).toEqual({ calves: 1 });
  });

  it("only ever credits heads belonging to the credited group", () => {
    for (const group of ALL_MUSCLE_GROUPS) {
      for (const name of ["exercise.bench_press Bench Press", "exercise.deadlift Deadlift", "Mystery"]) {
        for (const d of Object.keys(detailCredits(name, group))) {
          expect(DETAIL_PARENT[d as keyof typeof DETAIL_PARENT]).toBe(group);
        }
      }
    }
  });

  it("taxonomy is complete: every head has a base recovery time and a parent", () => {
    for (const details of Object.values(DETAILED_MUSCLES)) {
      for (const d of details) {
        expect(DETAIL_BASE_RECOVERY[d]).toBeGreaterThan(0);
        expect(DETAIL_PARENT[d]).toBeTruthy();
      }
    }
  });
});
