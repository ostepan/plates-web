import { describe, expect, it } from "vitest";
import { suggestNextSet } from "./progression";

describe("suggestNextSet (smart-autotype progression)", () => {
  it("progresses weight when last hit top of range with RIR to spare", () => {
    const s = suggestNextSet({
      last: { weight: 100, reps: 12, rir: 2 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5,
    });
    expect(s).toEqual({ weight: 102.5, reps: 8, rir: 2, reason: "progress" });
  });

  it("adds a rep when there were reps in reserve below the top of the range", () => {
    const s = suggestNextSet({
      last: { weight: 100, reps: 9, rir: 3 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5,
    });
    expect(s).toEqual({ weight: 100, reps: 10, rir: 2, reason: "addRep" });
  });

  it("holdProgress pins the suggestion to last session's numbers", () => {
    // would otherwise progress (top of window, RIR to spare)
    const s = suggestNextSet({
      last: { weight: 100, reps: 12, rir: 3 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5, holdProgress: true,
    });
    expect(s).toEqual({ weight: 100, reps: 12, rir: 2, reason: "hold" });
  });

  it("holds when last set met target RIR but not the top of the range", () => {
    const s = suggestNextSet({
      last: { weight: 100, reps: 9, rir: 2 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5,
    });
    expect(s).toEqual({ weight: 100, reps: 9, rir: 2, reason: "hold" });
  });

  it("does not exceed repMax when adding a rep at the top of the range", () => {
    const s = suggestNextSet({
      last: { weight: 100, reps: 12, rir: 1 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5,
    });
    // reps already at max but RIR below target → hold, no overflow.
    expect(s).toEqual({ weight: 100, reps: 12, rir: 2, reason: "hold" });
  });

  it("seeds from fallbackWeight when there is no history", () => {
    const s = suggestNextSet({ repMin: 8, repMax: 12, increment: 2.5, fallbackWeight: 60 });
    expect(s).toEqual({ weight: 60, reps: 8, rir: 2, reason: "start" });
  });

  it("backs off one increment after grinding to RIR 0 below the window", () => {
    const s = suggestNextSet({
      last: { weight: 100, reps: 6, rir: 0 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5,
    });
    expect(s).toEqual({ weight: 97.5, reps: 8, rir: 2, reason: "backOff" });
  });

  it("does not back off when RIR was not logged or the set stopped early", () => {
    // No RIR logged → assume on-target, hold instead of backing off.
    const noRIR = suggestNextSet({
      last: { weight: 100, reps: 6 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5,
    });
    expect(noRIR).toEqual({ weight: 100, reps: 6, rir: 2, reason: "hold" });
    // Below the window but with reps in reserve → cut short, not a grind; add a rep.
    const early = suggestNextSet({
      last: { weight: 100, reps: 6, rir: 3 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 2.5,
    });
    expect(early).toEqual({ weight: 100, reps: 7, rir: 2, reason: "addRep" });
  });

  it("never backs off below zero weight", () => {
    const s = suggestNextSet({
      last: { weight: 2, reps: 4, rir: 0 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 5,
    });
    expect(s).toEqual({ weight: 0, reps: 8, rir: 2, reason: "backOff" });
  });

  it("progresses weight at the no-window rep ceiling, keeping e1RM flat", () => {
    // 80×12 → e1RM 112; at 82.5 that's ≈10.7 reps → 11.
    const s = suggestNextSet({ last: { weight: 80, reps: 12, rir: 3 }, increment: 2.5 });
    expect(s).toEqual({ weight: 82.5, reps: 11, rir: 2, reason: "progress" });
  });

  it("progresses weight without a window even when reps started above the ceiling", () => {
    // 40×15 → e1RM 60; at 42.5 that's ≈12.4 reps → 12.
    const s = suggestNextSet({ last: { weight: 40, reps: 15, rir: 2 }, increment: 2.5 });
    expect(s).toEqual({ weight: 42.5, reps: 12, rir: 2, reason: "progress" });
  });

  it("returns undefined with no history and no fallback", () => {
    expect(suggestNextSet({ increment: 2.5 })).toBeUndefined();
    expect(suggestNextSet({ increment: 2.5, fallbackWeight: 0 })).toBeUndefined();
    expect(suggestNextSet({ last: { weight: 0, reps: 0 }, increment: 2.5 })).toBeUndefined();
  });

  it("uses default rep window (last..last+2) and RIR=2 when no routine target", () => {
    // reps below the synthesized max and RIR equals default target → hold.
    const hold = suggestNextSet({ last: { weight: 80, reps: 5, rir: 2 }, increment: 5 });
    expect(hold).toEqual({ weight: 80, reps: 5, rir: 2, reason: "hold" });
    // high RIR with no routine → add a rep.
    const add = suggestNextSet({ last: { weight: 80, reps: 5, rir: 4 }, increment: 5 });
    expect(add).toEqual({ weight: 80, reps: 6, rir: 2, reason: "addRep" });
  });

  it("rounds progressed weight to 2 decimals (lb increment)", () => {
    const s = suggestNextSet({
      last: { weight: 135, reps: 12, rir: 3 },
      repMin: 8, repMax: 12, targetRIR: 2, increment: 5,
    });
    expect(s).toEqual({ weight: 140, reps: 8, rir: 2, reason: "progress" });
  });
});
