import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureEditorNodeId, runWithEditorNode, type EditorTarget } from "./editorTarget";

describe("editor target", () => {
  let view: EditorView | undefined;

  afterEach(() => {
    view?.destroy();
    vi.restoreAllMocks();
  });

  it("materializes a draft once and hands its command to the persisted row", () => {
    const host = document.createElement("div");
    document.body.append(host);
    view = new EditorView({
      state: EditorState.create({ doc: "draft text" }),
      parent: host,
    });
    let materializeCalls = 0;
    const materializedIds = ["node-1", "node-2"];
    const materialize = (markdown: string) => {
      materializeCalls += 1;
      expect(markdown).toBe("draft text");
      return materializedIds[materializeCalls - 1] ?? null;
    };
    const target: EditorTarget = {
      kind: "draft",
      nodeId: null,
      parentId: "parent-1",
      materialize,
    };
    const command = vi.fn((nodeId: string) => nodeId === "node-1");
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    expect(runWithEditorNode(target, view, command)).toBe(true);
    expect(ensureEditorNodeId(target, view)).toBe("node-1");
    expect(materializeCalls).toBe(1);
    expect(command).not.toHaveBeenCalled();
    expect(runWithEditorNode(target, view, command)).toBe(true);
    expect(materializeCalls).toBe(1);
    expect(command).not.toHaveBeenCalled();

    frames.shift()?.(0);
    expect(command).not.toHaveBeenCalled();
    frames.shift()?.(16);
    expect(command).toHaveBeenCalledOnce();
    expect(command).toHaveBeenCalledWith("node-1");
    expect(target.nodeId).toBeNull();

    expect(runWithEditorNode(target, view, command)).toBe(true);
    expect(materializeCalls).toBe(2);
    frames.shift()?.(32);
    frames.shift()?.(48);
    expect(command).toHaveBeenCalledTimes(2);
    expect(command).toHaveBeenLastCalledWith("node-2");
    expect(target.nodeId).toBeNull();
  });

  it("passes through an existing node identity without materializing", () => {
    const host = document.createElement("div");
    document.body.append(host);
    view = new EditorView({
      state: EditorState.create({ doc: "content" }),
      parent: host,
    });
    const target: EditorTarget = {
      kind: "node",
      nodeId: "node-2",
      parentId: "parent-1",
      materialize: () => { throw new Error("persisted targets must not materialize"); },
    };

    expect(runWithEditorNode(target, view, (nodeId) => nodeId === "node-2")).toBe(true);
  });
});
