import { describe, expect, it } from "vitest";
import { createEmptyState } from "./model";
import { createDebugSamples, hasDebugSamples, isDebugSampleNode } from "./debugSamples";
import { childrenOf } from "./tree";

describe("debug samples", () => {
  it("creates a deterministic mixed workspace once", () => {
    const result = createDebugSamples(createEmptyState(), 123);
    expect(result.createdNodeIds.length).toBeGreaterThan(50);
    expect(result.rootId).toBe("debug-sample-overview");
    expect(hasDebugSamples(result.state)).toBe(true);
    expect(childrenOf(result.state, result.rootId).map((node) => node.id)).toEqual([
      "debug-sample-selection",
      "debug-sample-hierarchy",
      "debug-sample-markdown",
      "debug-sample-long-markdown",
    ]);
    expect(new TextEncoder().encode(result.state.nodes["debug-sample-long-markdown"].markdown).byteLength).toBe(100_000);
  });

  it("does not overwrite an existing debug workspace", () => {
    const first = createDebugSamples(createEmptyState(), 123);
    const second = createDebugSamples(first.state, 456);
    expect(second.createdNodeIds).toEqual([]);
    expect(second.state).toBe(first.state);
  });

  it("recognizes only the reserved debug sample prefix", () => {
    expect(isDebugSampleNode("debug-sample-selection-01")).toBe(true);
    expect(isDebugSampleNode("user-debug-sample-note")).toBe(false);
  });
});
