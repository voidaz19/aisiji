import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GhostEditor } from "./GhostEditor";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";

function activeContentNodes() {
  return Object.values(useNotebookStore.getState().nodes).filter(
    (node) => node.kind === "content" && !node.deletedAt,
  );
}

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => cleanup());

describe("GhostEditor", () => {
  it("creates a real empty node when Enter is pressed", async () => {
    const parent = activeContentNodes()[0];
    const beforeCount = activeContentNodes().length;
    const { getByLabelText } = render(<GhostEditor parentId={parent.id} />);
    const host = getByLabelText("新建节点");
    const content = host.querySelector<HTMLElement>(".cm-content")!;

    fireEvent.keyDown(content, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(activeContentNodes()).toHaveLength(beforeCount + 1));
    const created = activeContentNodes().find((node) => node.parentId === parent.id && node.markdown === "");
    expect(created).toBeDefined();
  });

  it("splits multiline paste into ordered child nodes", async () => {
    const parent = activeContentNodes()[0];
    const { getByLabelText } = render(<GhostEditor parentId={parent.id} />);
    const host = getByLabelText("新建节点");
    const content = host.querySelector<HTMLElement>(".cm-content")!;

    fireEvent.paste(content, {
      clipboardData: { getData: () => "one\r\ntwo" },
    });

    await waitFor(() => {
      expect(childrenOf(useNotebookStore.getState(), parent.id).map((node) => node.markdown)).toContain("two");
    });
    expect(childrenOf(useNotebookStore.getState(), parent.id).map((node) => node.markdown)).toEqual(["one", "two"]);
  });

  it("moves Backspace from a ghost to the previous real sibling", () => {
    const previous = activeContentNodes()[0];
    const parentId = previous.parentId!;
    const { getByLabelText } = render(<GhostEditor parentId={parentId} />);
    const host = getByLabelText("新建节点");
    const content = host.querySelector<HTMLElement>(".cm-content")!;

    fireEvent.keyDown(content, { key: "Backspace", code: "Backspace" });

    const state = useNotebookStore.getState();
    expect(state.activeNodeId).toBe(previous.id);
    expect(state.activeNodeCursor).toBe("end");
  });

  it("collapses an empty parent when Backspace removes its only virtual child", () => {
    const parent = activeContentNodes()[0];
    useNotebookStore.getState().toggleNode(parent.id);
    const { getByLabelText } = render(<GhostEditor parentId={parent.id} />);
    const host = getByLabelText("新建节点");
    const content = host.querySelector<HTMLElement>(".cm-content")!;

    fireEvent.keyDown(content, { key: "Backspace", code: "Backspace" });

    expect(useNotebookStore.getState().collapsed[parent.id]).toBe(true);
    useNotebookStore.getState().toggleNode(parent.id);
    expect(useNotebookStore.getState().collapsed[parent.id]).toBe(false);
  });

  it("waits until Chinese composition ends before materializing a real node", async () => {
    const parentId = activeContentNodes()[0].parentId!;
    const beforeCount = activeContentNodes().length;
    const { getByLabelText } = render(<GhostEditor parentId={parentId} />);
    const host = getByLabelText("新建节点");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;

    fireEvent.compositionStart(content);
    editor.dispatch({ changes: { from: 0, insert: "中文" }, selection: { anchor: 2 } });
    expect(activeContentNodes()).toHaveLength(beforeCount);

    fireEvent.compositionEnd(content);

    await waitFor(() => {
      const nodes = activeContentNodes();
      expect(nodes).toHaveLength(beforeCount + 1);
      expect(nodes.some((node) => node.parentId === parentId && node.markdown === "中文")).toBe(true);
    });
  });

  it("focuses only the ghost requested for a specific parent", async () => {
    const firstParent = activeContentNodes()[0];
    const secondParentId = useNotebookStore.getState().createSibling(firstParent.id, "second parent")!;
    const { getAllByLabelText } = render(
      <>
        <GhostEditor parentId={firstParent.id} />
        <GhostEditor parentId={secondParentId} />
      </>,
    );
    const hosts = getAllByLabelText("新建节点");

    act(() => useNotebookStore.getState().focusGhost(secondParentId));

    await waitFor(() => {
      expect(hosts[0].querySelector(".cm-focused")).toBeNull();
      expect(hosts[1].querySelector(".cm-focused")).not.toBeNull();
    });
  });
});
