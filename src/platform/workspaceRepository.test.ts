import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedState } from "../domain/tree";
import type { Operation } from "../domain/model";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./runtime", () => ({ hasTauriRuntime: () => true }));

const { awaitWorkspacePersistence, flushWorkspacePersistence, saveWorkspace } = await import("./workspaceRepository");

function operation(id: string): Operation {
  return {
    opId: id,
    deviceId: "device-test",
    sequence: Number(id.slice(-1)),
    hlc: `${id}-hlc`,
    baseRevision: 0,
    kind: "update_markdown",
    entityId: "node-test",
    payload: { markdown: id },
    createdAt: 1,
  };
}

describe("workspace native persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockClear();
    localStorage.clear();
  });

  it("batches rapid snapshots and operations into one native write", async () => {
    const first = createSeedState("2026-07-27");
    const second = { ...first, collapsed: { "node-test": true } };

    saveWorkspace(first, operation("op-1"));
    saveWorkspace(second, operation("op-2"));

    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(180);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("save_workspace_batch", expect.objectContaining({
      stateJson: JSON.stringify(second),
      operations: [
        expect.objectContaining({ opId: "op-1" }),
        expect.objectContaining({ opId: "op-2" }),
      ],
    }));
    expect(JSON.parse(localStorage.getItem("aisiji-notebook-state-v1") ?? "null")).toEqual(second);

    flushWorkspacePersistence();
    vi.useRealTimers();
  });

  it("waits for the latest queued snapshot before destructive maintenance", async () => {
    const state = createSeedState("2026-07-28");
    saveWorkspace(state, operation("op-3"));

    await awaitWorkspacePersistence();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("save_workspace_batch", expect.objectContaining({
      stateJson: JSON.stringify(state),
      operations: [expect.objectContaining({ opId: "op-3" })],
    }));
  });
});
