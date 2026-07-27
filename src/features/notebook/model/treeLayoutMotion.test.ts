import { describe, expect, it } from "vitest";
import { treeLayoutMotionProgress } from "./treeLayoutMotion";

describe("tree layout motion", () => {
  it("preserves animation endpoints", () => {
    expect(treeLayoutMotionProgress(0)).toBeCloseTo(0, 4);
    expect(treeLayoutMotionProgress(1)).toBeCloseTo(1, 4);
  });

  it("uses the same non-linear material easing as row motion", () => {
    expect(treeLayoutMotionProgress(0.5)).toBeGreaterThan(0.7);
  });

  it("stays monotonic throughout the animation", () => {
    const samples = Array.from({ length: 21 }, (_, index) => treeLayoutMotionProgress(index / 20));
    expect(samples.every((value, index) => index === 0 || value >= samples[index - 1])).toBe(true);
  });
});
