import { describe, expect, it } from "vitest";
import { makeOperationChunk, operationPath } from "./protocol";

describe("sync protocol", () => {
  it("creates stable immutable operation paths", () => {
    const chunk = makeOperationChunk("device-a", [
      { opId: "2", deviceId: "device-a", sequence: 2, hlc: "2", baseRevision: 0, kind: "move", entityId: "n", payload: {}, createdAt: 2 },
      { opId: "1", deviceId: "device-a", sequence: 1, hlc: "1", baseRevision: 0, kind: "create", entityId: "n", payload: {}, createdAt: 1 },
    ]);
    expect(chunk.firstSequence).toBe(1);
    expect(operationPath(chunk)).toBe("workspace/ops/device-a/0000000000000001-0000000000000002.json");
  });
});

