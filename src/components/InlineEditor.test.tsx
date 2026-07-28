import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";
import { InlineEditor } from "./InlineEditor";

function firstContentNode() {
  return Object.values(useNotebookStore.getState().nodes).find(
    (node) => node.kind === "content" && !node.deletedAt,
  )!;
}

function StoreEditor({ nodeId }: { nodeId: string }) {
  const value = useNotebookStore((state) => state.nodes[nodeId].markdown);
  return <InlineEditor nodeId={nodeId} value={value} />;
}

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InlineEditor", () => {
  it("commits root editor content immediately when switching nodes", () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first root");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second root")!;
    const { getByLabelText, rerender } = render(
      <InlineEditor nodeId={first.id} value="first root" variant="root" />,
    );

    rerender(<InlineEditor nodeId={secondId} value="second root" variant="root" />);

    const host = getByLabelText("根节点内容");
    const editor = EditorView.findFromDOM(host)!;
    expect(host.querySelector(".inline-editor-placeholder")).toBeNull();
    expect(editor.state.doc.toString()).toBe("second root");
  });

  it("keeps an offscreen node lightweight until it approaches the viewport", async () => {
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(next: IntersectionObserverCallback) { callback = next; }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = "";
      thresholds = [];
    });
    const node = firstContentNode();
    useNotebookStore.setState({ activeNodeId: null });
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");

    expect(host.querySelector(".cm-editor")).toBeNull();
    expect(host.querySelector(".inline-editor-placeholder")?.textContent).toBe(node.markdown || " ");
    await act(async () => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(host.querySelector(".cm-editor")).not.toBeNull();
    expect(observe).toHaveBeenCalledWith(host);
  });

  it("removes the selected text when Enter splits a node", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "alpha SELECT omega");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;
    const from = editor.state.doc.toString().indexOf("SELECT");

    editor.dispatch({ selection: { anchor: from, head: from + "SELECT".length } });
    fireEvent.keyDown(content, { key: "Enter", code: "Enter" });

    const state = useNotebookStore.getState();
    expect(state.nodes[node.id].markdown).toBe("alpha ");
    expect(state.nodes[state.activeNodeId!].markdown).toBe(" omega");
  });

  it("supports text undo and both redo shortcuts", async () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "start");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;

    editor.dispatch({ changes: { from: editor.state.doc.length, insert: "X" } });
    expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("startX");

    fireEvent.keyDown(content, { key: "z", code: "KeyZ", ctrlKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("start"));

    fireEvent.keyDown(content, { key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("startX"));

    fireEvent.keyDown(content, { key: "z", code: "KeyZ", ctrlKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("start"));

    fireEvent.keyDown(content, { key: "y", code: "KeyY", ctrlKey: true });
    await waitFor(() => expect(useNotebookStore.getState().nodes[node.id].markdown).toBe("startX"));
  });

  it("moves horizontally across adjacent node boundaries", async () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second")!;
    const { getAllByLabelText } = render(
      <>
        <StoreEditor nodeId={first.id} />
        <StoreEditor nodeId={secondId} />
      </>,
    );
    const hosts = getAllByLabelText("节点内容");
    const contents = hosts.map((host) => host.querySelector<HTMLElement>(".cm-content")!);
    const editors = hosts.map((host) => EditorView.findFromDOM(host)!);

    act(() => {
      editors[0].dispatch({ selection: { anchor: editors[0].state.doc.length } });
      editors[0].focus();
    });
    fireEvent.keyDown(contents[0], { key: "ArrowRight", code: "ArrowRight" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(secondId));
    expect(editors[1].state.selection.main.head).toBe(0);

    fireEvent.keyDown(contents[1], { key: "ArrowLeft", code: "ArrowLeft" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(first.id));
    expect(editors[0].state.selection.main.head).toBe(editors[0].state.doc.length);
  });

  it("moves focus to an adjacent virtualized node that is not mounted", async () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second")!;
    const { getByLabelText } = render(
      <div data-tree-row="true" data-navigation-next-key={secondId}>
        <StoreEditor nodeId={first.id} />
      </div>,
    );
    const host = getByLabelText("节点内容");
    const editor = EditorView.findFromDOM(host)!;

    act(() => {
      editor.dispatch({ selection: { anchor: editor.state.doc.length } });
      editor.focus();
    });
    fireEvent.keyDown(host.querySelector<HTMLElement>(".cm-content")!, { key: "ArrowRight", code: "ArrowRight" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(secondId));
    expect(useNotebookStore.getState().activeNodeCursor).toBe(0);
  });

  it("moves vertically across adjacent nodes while preserving the text column", async () => {
    const first = firstContentNode();
    useNotebookStore.getState().editMarkdown(first.id, "first");
    const secondId = useNotebookStore.getState().createSibling(first.id, "second")!;
    const { getAllByLabelText } = render(
      <>
        <StoreEditor nodeId={first.id} />
        <StoreEditor nodeId={secondId} />
      </>,
    );
    const hosts = getAllByLabelText("节点内容");
    const contents = hosts.map((host) => host.querySelector<HTMLElement>(".cm-content")!);
    const editors = hosts.map((host) => EditorView.findFromDOM(host)!);

    act(() => {
      editors[0].dispatch({ selection: { anchor: 3 } });
      editors[0].focus();
    });
    fireEvent.keyDown(contents[0], { key: "ArrowDown", code: "ArrowDown" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(secondId));
    expect(editors[1].state.selection.main.head).toBe(3);

    fireEvent.keyDown(contents[1], { key: "ArrowUp", code: "ArrowUp" });

    await waitFor(() => expect(useNotebookStore.getState().activeNodeId).toBe(first.id));
    expect(editors[0].state.selection.main.head).toBe(3);
  });

  it("pastes multiline text at the selection without loss or reordering", () => {
    const store = useNotebookStore.getState();
    const node = firstContentNode();
    store.editMarkdown(node.id, "left SELECT right");
    const { getByLabelText } = render(<StoreEditor nodeId={node.id} />);
    const host = getByLabelText("节点内容");
    const content = host.querySelector<HTMLElement>(".cm-content")!;
    const editor = EditorView.findFromDOM(host)!;
    const from = editor.state.doc.toString().indexOf("SELECT");

    editor.dispatch({ selection: { anchor: from, head: from + "SELECT".length } });
    fireEvent.paste(content, {
      clipboardData: { getData: () => "one\r\n\r\n  three  " },
    });

    const state = useNotebookStore.getState();
    const siblings = childrenOf(state, node.parentId!).filter((item) => item.kind === "content");
    const nodeIndex = siblings.findIndex((item) => item.id === node.id);
    expect(siblings.slice(nodeIndex, nodeIndex + 3).map((item) => item.markdown)).toEqual([
      "left one",
      "",
      "  three   right",
    ]);
  });
});
