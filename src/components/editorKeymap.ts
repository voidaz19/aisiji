import type { EditorView, KeyBinding } from "@codemirror/view";
import { redo } from "@codemirror/commands";

export interface EditorKeymapActions {
  enter: (editor: EditorView) => boolean;
  createChild: () => boolean;
  indent: (editor: EditorView) => boolean;
  outdent: (editor: EditorView) => boolean;
  backspace: (editor: EditorView) => boolean;
  delete: (editor: EditorView) => boolean;
  remove: () => boolean;
}

/** Shared node-editing shortcuts used by both real and transient editors. */
export function createEditorKeymap(actions: EditorKeymapActions): KeyBinding[] {
  return [
    { key: "Enter", run: actions.enter },
    { key: "Mod-Enter", run: actions.createChild },
    { key: "Tab", run: actions.indent },
    { key: "Shift-Tab", run: actions.outdent },
    { key: "Backspace", run: actions.backspace },
    { key: "Delete", run: actions.delete },
    { key: "Mod-Shift-Backspace", run: actions.remove },
    { key: "Mod-Delete", run: actions.remove },
    { key: "Mod-Shift-z", run: redo, preventDefault: true },
  ];
}
