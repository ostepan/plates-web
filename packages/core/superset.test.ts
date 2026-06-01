import { describe, expect, it } from "vitest";
import { isInSuperset, supersetBadge } from "./superset";

const items = (keys: (string | undefined)[]) => keys.map((k) => ({ supersetGroupId: k }));

describe("superset badges", () => {
  it("solo exercises have no badge", () => {
    const list = items([undefined, undefined]);
    expect(supersetBadge(list, 0)).toBeNull();
    expect(isInSuperset(list, 0)).toBe(false);
  });

  it("a pair gets A1/A2", () => {
    const list = items(["g1", "g1", undefined]);
    expect(supersetBadge(list, 0)?.label).toBe("A1");
    expect(supersetBadge(list, 1)?.label).toBe("A2");
    expect(supersetBadge(list, 2)).toBeNull();
    expect(isInSuperset(list, 0)).toBe(true);
    expect(isInSuperset(list, 1)).toBe(true);
  });

  it("a second run is lettered B", () => {
    const list = items(["g1", "g1", undefined, "g2", "g2", "g2"]);
    expect(supersetBadge(list, 3)?.label).toBe("B1");
    expect(supersetBadge(list, 5)?.label).toBe("B3");
  });
});
