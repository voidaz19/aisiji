import { Facet } from "@codemirror/state";

export const markdownEditorNodeId = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null,
});
