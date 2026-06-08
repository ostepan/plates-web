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
    expect(s).toEqual({ weight: 60, reps: 8, rir: 2, reason: "hold" });
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
