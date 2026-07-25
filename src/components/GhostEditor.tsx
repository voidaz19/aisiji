import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { childrenOf } from "../domain/tree";
import { useNotebookStore } from "../store/useNotebookStore";
import { crossNodeNavigationKeymap } from "./editorNavigation";
import { editorTheme, livePreview } from "./editorTheme";

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
  const handedOff = useRef(false);
  const composing = useRef(false);
  const createChild = useNotebookStore((state) => state.createChild);

  const shouldFocus = useNotebookStore((state) => state.activeGhostParentId === parentId);

  useEffect(() => {
    if (!host.current) return;
    handedOff.current = false;
    composing.current = false;

    const materialize = () => {
      const current = view.current;
      if (!current || handedOff.current || composing.current || current.composing) return;
      const text = current.state.doc.toString();
      if (!text) return;
      handedOff.current = true;
      const caret = current.state.selection.main.head;
      const newNodeId = createChild(parentId, text);
      current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: "" } });
      handedOff.current = false;
      if (newNodeId) focusRealEditor(newNodeId, caret);
    };

    const state = EditorState.create({
      doc: "",
      extensions: [
        markdown(),
        livePreview,
        EditorView.lineWrapping,
        keymap.of([
          {
            key: "Backspace",
            run: (editor) => {
              if (!editor.state.selection.main.empty || editor.state.selection.main.head !== 0) return false;
              const notebook = useNotebookStore.getState();
              const siblings = childrenOf(notebook, parentId).filter((node) => node.kind !== "date");
              const previous = siblings[siblings.length - 1];
              if (previous) {
                notebook.focusNode(previous.id, "end");
              } else if (notebook.nodes[parentId]?.kind === "content") {
                notebook.focusNode(parentId, "end");
              } else {
                const row = host.current?.closest<HTMLElement>("[data-ghost-row='true']");
                row?.classList.remove("is-shaking");
                if (row) void row.offsetWidth;
                row?.classList.add("is-shaking");
                if (row) setTimeout(() => row.classList.remove("is-shaking"), 220);
              }
              return true;
            },
          },
          ...crossNodeNavigationKeymap,
          ...defaultKeymap,
          indentWithTab,
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
        }),
        editorTheme,
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => { view.current?.destroy(); view.current = undefined; };
  }, [parentId, createChild]);

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

  return <div className="inline-editor ghost-editor" ref={host} aria-label="新建节点" />;
}

function focusRealEditor(nodeId: string, caret: number, attempt = 0): void {
  requestAnimationFrame(() => {
    const host = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"] .inline-editor`);
    const editor = host ? EditorView.findFromDOM(host) : null;
    if (!editor) {
      if (attempt < 5) focusRealEditor(nodeId, caret, attempt + 1);
      return;
    }
    const pos = Math.min(caret, editor.state.doc.length);
    editor.dispatch({ selection: { anchor: pos } });
    editor.focus();
  });
}
