import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GhostEditor } from "./GhostEditor";
import { InlineEditor } from "./InlineEditor";
import type { AttachmentRecord } from "../domain/model";
import type { AttachmentPathSource } from "../platform/attachments";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";

const nativeAttachmentMocks = vi.hoisted(() => ({
  chooseAttachmentPaths: vi.fn(),
  listenNativeFileDrop: vi.fn(async () => vi.fn()),
}));

vi.mock("../platform/nativeAttachments", () => nativeAttachmentMocks);

function activeContentNodes() {
  return Object.values(useNotebookStore.getState().nodes).filter(
    (node) => node.kind === "content" && !node.deletedAt,
  );
}

function GhostAttachmentHarness({ parentId }: { parentId: string }) {
  const nodes = useNotebookStore((state) => state.nodes);
  const children = Object.values(nodes)
    .filter((node) => node.parentId === parentId && node.kind === "content" && !node.deletedAt)
    .sort((left, right) => left.sortKey - right.sortKey || left.createdAt - right.createdAt);
  return (
    <>
      {children.map((node) => (
        <div key={node.id} data-node-id={node.id}>
          <InlineEditor nodeId={node.id} value={node.markdown} />
        </div>
      ))}
      <GhostEditor parentId={parentId} />
    </>
  );
}

function attachmentFor(nodeId: string, name: string): AttachmentRecord {
  return {
    id: `attachment-${name}`,
    nodeId,
    name,
    mime: "text/plain",
    size: 3,
    sha256: `hash-${name}`,
    localPath: `C:\\app\\attachments\\${name}`,
    remotePath: `remote/${name}`,
    pinned: false,
    createdAt: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  useNotebookStore.setState(useNotebookStore.getInitialState(), true);
  nativeAttachmentMocks.chooseAttachmentPaths.mockReset();
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

  it("materializes before applying Tab indentation", async () => {
    const store = useNotebookStore.getState();
    const parent = activeContentNodes()[0];
    const previous = store.createChild(parent.id, "previous");
    const { getByLabelText } = render(<GhostEditor parentId={parent.id} />);
    const content = getByLabelText("新建节点").querySelector<HTMLElement>(".cm-content")!;
    content.focus();

    fireEvent.keyDown(content, { key: "Tab", code: "Tab", keyCode: 9, which: 9 });

    await waitFor(() => {
      const created = Object.values(useNotebookStore.getState().nodes)
        .find((node) => node.kind === "content" && node.markdown === "" && node.id !== parent.id && node.id !== previous);
      expect(created).toBeDefined();
      expect(useNotebookStore.getState().nodes[created!.id].parentId).toBe(previous);
    });
  });

  it("opens the shared command menu when Control is released alone", async () => {
    const parent = activeContentNodes()[0];
    const { getByLabelText, getByRole } = render(<GhostEditor parentId={parent.id} />);
    const content = getByLabelText("新建节点").querySelector<HTMLElement>(".cm-content")!;
    content.focus();

    fireEvent.keyDown(document, { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireEvent.keyUp(document, { key: "Control", code: "ControlLeft" });

    await waitFor(() => getByRole("dialog", { name: "插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "粗体" }));

    await waitFor(() => {
      expect(Object.values(useNotebookStore.getState().nodes).some(
        (node) => node.kind === "content" && node.markdown === "****",
      )).toBe(true);
    });
  });

  it("does not materialize when file selection is cancelled", async () => {
    const parent = activeContentNodes()[0];
    const beforeCount = activeContentNodes().length;
    nativeAttachmentMocks.chooseAttachmentPaths.mockResolvedValue([]);
    const { getByRole } = render(<GhostEditor parentId={parent.id} />);

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "插入文件" }));

    await waitFor(() => expect(nativeAttachmentMocks.chooseAttachmentPaths).toHaveBeenCalledOnce());
    expect(activeContentNodes()).toHaveLength(beforeCount);
  });

  it("materializes once and hands selected files to the real editor", async () => {
    const parent = activeContentNodes()[0];
    const path = "C:\\source\\ghost.txt";
    nativeAttachmentMocks.chooseAttachmentPaths.mockResolvedValue([path]);
    const addAttachment = vi.fn(async (nodeId: string, _source: AttachmentPathSource) =>
      attachmentFor(nodeId, "ghost.txt"));
    useNotebookStore.setState({ addAttachment });
    const { getByRole } = render(<GhostAttachmentHarness parentId={parent.id} />);

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "插入文件" }));

    await waitFor(() => {
      const children = childrenOf(useNotebookStore.getState(), parent.id);
      expect(children).toHaveLength(1);
      expect(children[0].markdown).toBe("[ghost.txt](attachment://attachment-ghost.txt)");
    });
    const created = childrenOf(useNotebookStore.getState(), parent.id)[0];
    expect(addAttachment).toHaveBeenCalledWith(created.id, { path });
  });

  it("keeps failed virtual-node insertions retryable on the real editor", async () => {
    const parent = activeContentNodes()[0];
    const path = "C:\\source\\retry.txt";
    nativeAttachmentMocks.chooseAttachmentPaths.mockResolvedValue([path]);
    const addAttachment = vi.fn()
      .mockRejectedValueOnce(new Error("无法读取文件"))
      .mockImplementationOnce(async (nodeId: string) => attachmentFor(nodeId, "retry.txt"));
    useNotebookStore.setState({ addAttachment });
    const { getAllByRole, getByLabelText, getByRole } = render(<GhostAttachmentHarness parentId={parent.id} />);

    fireEvent.click(getByRole("button", { name: "打开插入与格式菜单" }));
    fireEvent.click(getByRole("button", { name: "插入文件" }));

    await waitFor(() => expect(getByLabelText("节点内容")).toBeTruthy());
    const realEditorShell = getByLabelText("节点内容").closest(".inline-editor-shell")!;
    await waitFor(() => {
      expect(addAttachment).toHaveBeenCalledOnce();
      expect(realEditorShell.querySelector(".cm-pending-attachment")).toBeNull();
    });
    const realMenuTrigger = Array.from(getAllByRole("button", { name: "打开插入与格式菜单" }))
      .find((button) => realEditorShell.contains(button))!;
    fireEvent.click(realMenuTrigger);
    expect(getByRole("status").textContent).toContain("无法读取文件");

    fireEvent.click(getByRole("button", { name: "重试" }));
    await waitFor(() => {
      const created = childrenOf(useNotebookStore.getState(), parent.id)[0];
      expect(created.markdown).toBe("[retry.txt](attachment://attachment-retry.txt)");
    });
    expect(addAttachment).toHaveBeenCalledTimes(2);
    expect(childrenOf(useNotebookStore.getState(), parent.id)).toHaveLength(1);
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
