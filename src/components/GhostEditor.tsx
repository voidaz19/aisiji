import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { useNotebookStore } from "../store/useNotebookStore";
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
  const createChild = useNotebookStore((state) => state.createChild);

  useEffect(() => {
    if (!host.current) return;
    handedOff.current = false;
    const state = EditorState.create({
      doc: "",
      extensions: [
        markdown(),
        livePreview,
        keymap.of([...defaultKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (handedOff.current || !update.docChanged) return;
          const text = update.state.doc.toString();
          if (!text) return;
          handedOff.current = true;
          const caret = update.state.selection.main.head;
          const newNodeId = createChild(parentId, text);
          // Reset this ghost's own document immediately instead of waiting
          // for the parent to re-render and unmount it. Otherwise there is
          // a visible frame where both the ghost and the newly created real
          // node show the same first character, and ghosts that persist
          // regardless of sibling count (e.g. the trailing end-of-tree
          // ghost) would otherwise be stuck showing stale text forever.
          const current = view.current;
          if (current) current.dispatch({ changes: { from: 0, to: current.state.doc.length, insert: "" } });
          handedOff.current = false;
          if (newNodeId) focusRealEditor(newNodeId, caret);
        }),
        editorTheme,
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
    return () => { view.current?.destroy(); view.current = undefined; };
  }, [parentId, createChild]);

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
