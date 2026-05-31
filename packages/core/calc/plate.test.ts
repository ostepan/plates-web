import { describe, expect, it } from "vitest";
import { STANDARD_KG_PLATES, plates } from "./plate";

describe("plate calculator (parity)", () => {
  it("100kg on a 20kg bar ⇒ 40/side = 25+15", () => {
    const r = plates(100, 20, STANDARD_KG_PLATES);
    expect(r.perSide).toEqual([25, 15]);
    expect(r.unloaded).toBe(0);
  });
  it("below the bar ⇒ all unloaded", () => {
    const r = plates(15, 20, STANDARD_KG_PLATES);
    expect(r.perSide).toEqual([]);
    expect(r.unloaded).toBe(15);
  });
  it("leaves an unmatched remainder", () => {
    const r = plates(61, 20, STANDARD_KG_PLATES); // 20.5/side → 20 + 0.5; remainder 0
    expect(r.perSide).toEqual([20, 0.5]);
  });
  it("60kg ⇒ 20/side = 20", () => {
    expect(plates(60, 20, STANDARD_KG_PLATES).perSide).toEqual([20]);
  });
});
