import { describe, expect, it } from "vitest";
import {
  GUIDE_EDGE_INSET,
  hierarchyGuideVerticalRange,
  stableRowLayoutCoordinate,
} from "./hierarchyGuideLayout";

describe("hierarchy guide vertical range", () => {
  it("uses an equal inset at both ends of the current subtree", () => {
    expect(hierarchyGuideVerticalRange({
      parentBottom: 40,
      subtreeBottom: 102,
      containerTop: 10,
    })).toEqual({
      y1: 40 - 10 + GUIDE_EDGE_INSET,
      y2: 102 - 10 - GUIDE_EDGE_INSET,
    });
  });

  it("is independent of the following sibling position", () => {
    expect(hierarchyGuideVerticalRange({
      parentBottom: 40,
      subtreeBottom: 102,
      containerTop: 10,
    })).toEqual({
      y1: 40 - 10 + GUIDE_EDGE_INSET,
      y2: 102 - 10 - GUIDE_EDGE_INSET,
    });
  });

  it("removes a temporary row animation offset from vertical coordinates", () => {
    expect(stableRowLayoutCoordinate(274, 250, 100, 50)).toBe(174);
    expect(stableRowLayoutCoordinate(174, 150, 100, 50)).toBe(174);
  });
});
