import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { canExecuteDraftMove } from "../domain/commands/moveNode";
import { childrenOf, lastVisibleNodeInSubtree } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";
import { planMultilinePaste } from "./editorClipboard";
import { createEditorKeymap } from "./editorKeymap";
import { crossNodeNavigationKeymap } from "./editorNavigation";
import { editorTheme } from "./editorTheme";
import { EditorCommandMenu, type FileInsertOutcome, type FileInsertStatus } from "./EditorCommandMenu";
import { requestAttachmentInsertionEffect } from "./attachmentUploadState";
import { createMarkdownEditorExtensions } from "./markdown/markdownEditor";
import { runWithEditorNode, runWithPersistedEditor, type EditorTarget } from "./editorTarget";
import { chooseAttachmentPaths } from "../platform/nativeAttachments";

interface Props {
  /** Parent the eventual real node should be created under. */
  parentId: string;
}

/**
 * Renders in place of an empty node's content area. It looks and behaves
 * like a real editor (same theme, same live-preview), but holds no node
 * identity. The moment the user types the first character, a real node is
 * created with that text as its initial content, and DOM focus + caret are
 * handed off to the newly created node's own InlineEditor. This mirrors
 * Tana's outliner feel: blank rows are directly typable, and materialize
 * into real nodes only once there is something to persist.
 */
export function GhostEditor({ parentId }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const targetRef = useRef<EditorTarget | null>(null);
  const handedOff = useRef(false);
  const composing = useRef(false);
  const [fileStatus, setFileStatus] = useState<FileInsertStatus>({ kind: "idle", message: "" });
  const createChild = useNotebookStore((state) => state.createChild);
  const toggleNode = useNotebookStore((state) => state.toggleNode);

  const shouldFocus = useNotebookStore((state) => state.activeGhostParentId === parentId);

  const pickFiles = useCallback(async (): Promise<FileInsertOutcome> => {
    try {
      const paths = await chooseAttachmentPaths();
      if (!paths.length) return { inserted: 0, failed: 0 };
      const editor = view.current;
      const target = targetRef.current;
      if (!editor || !target) throw new Error("虚节点编辑器尚未就绪");
      const accepted = await runWithPersistedEditor(
        target,
        editor,
        findRealEditor,
        (_nodeId, persistedEditor) => {
          persistedEditor.dispatch({ effects: requestAttachmentInsertionEffect(paths) });
          return true;
        },
      );
      if (!accepted) throw new Error("无法创建附件节点");
      setFileStatus({ kind: "idle", message: "" });
      return { inserted: 0, failed: 0 };
    } catch (error) {
      setFileStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "无法选择文件",
      });
      return { inserted: 0, failed: 1 };
    }
  }, []);

  useEffect(() => {
    if (!host.current) return;
    handedOff.current = false;
    composing.current = false;

    const materialize = (requestedMarkdown?: string): string | null => {
      const current = view.current;
      if (!current || handedOff.current || composing.current || current.composing) return null;
      const text = requestedMarkdown ?? current.state.doc.toString();
      if (!text && requestedMarkdown === undefined) return null;
      handedOff.current = true;
      const caret = current.state.selection.main.head;
      const newNodeId = createChild(parentId, text);
      current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: "" } });
      handedOff.current = false;
      if (newNodeId) focusRealEditor(newNodeId, caret);
      return newNodeId;
    };
    const target: EditorTarget = {
      kind: "draft",
      nodeId: null,
      parentId,
      materialize: (markdown) => materialize(markdown),
    };
    targetRef.current = target;

    const createBlankChild = () => {
      createChild(parentId, "");
      return true;
    };

    const state = EditorState.create({
      doc: "",
      extensions: [
        ...createMarkdownEditorExtensions(null, {
          applySupertag: (editor, supertagId) => runWithEditorNode(target, editor, (nodeId) => {
            useNotebookStore.getState().addSupertag(nodeId, supertagId);
            return true;
          }),
        }),
        history(),
        EditorView.lineWrapping,
        keymap.of([
          ...createEditorKeymap({
            enter: (editor) => {
              if (editor.state.doc.length > 0) {
                materialize();
              } else {
                createBlankChild();
              }
              return true;
            },
            createChild: createBlankChild,
            indent: (editor) => {
              if (!canExecuteDraftMove(useNotebookStore.getState(), { type: "indent", parentId })) return true;
              // Draft commands are handed to the persisted row after its
              // first stable layout has been captured.
              return runWithEditorNode(target, editor, (nodeId) => {
                useNotebookStore.getState().indent(nodeId);
                return true;
              });
            },
            outdent: (editor) => {
              const notebook = useNotebookStore.getState();
              if (!canExecuteDraftMove(notebook, {
                type: "outdent",
                parentId,
                boundaryRootId: notebook.activeRootId,
              })) return true;
              return runWithEditorNode(target, editor, (nodeId) => {
                useNotebookStore.getState().outdent(nodeId);
                return true;
              });
            },
            backspace: (editor) => {
              if (!editor.state.selection.main.empty || editor.state.selection.main.head !== 0) return false;
              const notebook = useNotebookStore.getState();
              const siblings = childrenOf(notebook, parentId).filter((node) => node.kind !== "date");
              const previous = siblings[siblings.length - 1];
              if (previous) {
                const target = lastVisibleNodeInSubtree(notebook, previous.id) ?? previous;
                notebook.focusNode(target.id, "end");
              } else if (notebook.nodes[parentId]?.kind === "content") {
                toggleNode(parentId);
                notebook.focusNode(parentId, "end");
              } else if (notebook.nodes[parentId]) {
                toggleNode(parentId);
              } else {
                const row = host.current?.closest<HTMLElement>("[data-tree-block-kind='placeholder']");
                row?.classList.remove("is-shaking");
                if (row) void row.offsetWidth;
                row?.classList.add("is-shaking");
                if (row) setTimeout(() => row.classList.remove("is-shaking"), 220);
              }
              return true;
            },
            delete: () => true,
            remove: () => true,
          }),
          ...crossNodeNavigationKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (handedOff.current || !update.docChanged) return;
          if (!composing.current && !update.view.composing) materialize();
        }),
        EditorView.domEventHandlers({
          focus: () => {
            useNotebookStore.getState().focusGhost(parentId);
            return false;
          },
          compositionstart: () => {
            composing.current = true;
            return false;
          },
          compositionend: () => {
            composing.current = false;
            queueMicrotask(materialize);
            return false;
          },
          paste: (event) => {
            const text = event.clipboardData?.getData("text/plain") ?? "";
            const plan = planMultilinePaste("", 0, 0, text);
            if (!plan) return false;
            event.preventDefault();
            const firstId = createChild(parentId, plan.currentMarkdown);
            let insertionAnchor = firstId;
            for (const line of plan.followingMarkdown) {
              const createdId = createChild(parentId, line);
              if (createdId) insertionAnchor = createdId;
            }
            if (insertionAnchor && insertionAnchor !== firstId) {
              useNotebookStore.getState().focusNode(insertionAnchor, 0);
            }
            return true;
          },
        }),
        editorTheme,
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => {
      if (targetRef.current === target) targetRef.current = null;
      view.current?.destroy();
      view.current = undefined;
    };
  }, [parentId, createChild, toggleNode]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    if (shouldFocus) {
      queueMicrotask(() => {
        if (view.current && !view.current.hasFocus) {
          view.current.focus();
        }
      });
    }
  }, [shouldFocus]);

  return (
    <div className="inline-editor-shell">
      <div className="inline-editor ghost-editor" ref={host} aria-label="新建节点" />
      <EditorCommandMenu
        getEditor={() => view.current}
        onPickFiles={pickFiles}
        onRetryFiles={pickFiles}
        fileStatus={fileStatus}
      />
    </div>
  );
}

function focusRealEditor(nodeId: string, caret: number, attempt = 0): void {
  requestAnimationFrame(() => {
    const editor = findRealEditor(nodeId);
    if (!editor) {
      if (attempt < 5) focusRealEditor(nodeId, caret, attempt + 1);
      return;
    }
    const pos = Math.min(caret, editor.state.doc.length);
    editor.dispatch({ selection: { anchor: pos } });
    editor.focus();
  });
}

function findRealEditor(nodeId: string): EditorView | null {
  const host = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] .inline-editor`);
  return host ? EditorView.findFromDOM(host) : null;
}
