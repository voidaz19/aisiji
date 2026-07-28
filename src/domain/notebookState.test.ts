import { describe, expect, it } from "vitest";
import { createSeedState, updateMarkdown } from "./tree";
import { selectHydrationWorkspace } from "./notebookState";

describe("workspace hydration", () => {
  it("keeps the newer synchronous browser snapshot when native batching lags", () => {
    const nativeState = createSeedState("2026-07-27");
    const nodeId = Object.values(nativeState.nodes).find((node) => node.kind === "content")!.id;
    const latestTimestamp = Math.max(...Object.values(nativeState.nodes).map((node) => node.updatedAt)) + 1;
    const browserState = updateMarkdown(nativeState, nodeId, "latest", latestTimestamp);

    expect(selectHydrationWorkspace(browserState, nativeState)).toBe(browserState);
  });

  it("uses a newer native snapshot and prefers browser UI state on timestamp ties", () => {
    const browserState = createSeedState("2026-07-27");
    const nodeId = Object.values(browserState.nodes).find((node) => node.kind === "content")!.id;
    const nativeState = updateMarkdown(browserState, nodeId, "native", Date.now() + 1000);

    expect(selectHydrationWorkspace(browserState, nativeState)).toBe(nativeState);
    expect(selectHydrationWorkspace(
      { ...browserState, collapsed: { [nodeId]: true } },
      browserState,
    )?.collapsed[nodeId]).toBe(true);
  });
});
