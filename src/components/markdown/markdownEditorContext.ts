import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export const markdownEditorNodeId = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});

/** Applies a data-backed supertag after the editor has consumed its trigger text. */
export type SupertagApply = (editor: EditorView, supertagId: string) => boolean;

export const markdownEditorSupertagApply = Facet.define<SupertagApply | null, SupertagApply | null>({
  combine: (values) => values[0] ?? null,
});
