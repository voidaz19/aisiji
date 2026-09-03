import { CompletionContext, completionStatus, startCompletion, type Completion, type CompletionResult } from "@codemirror/autocomplete";
import { ViewPlugin } from "@codemirror/view";
import { BUILT_IN_SUPERTAGS, hasSupertag } from "../../domain/supertags";
import { useNotebookStore } from "../../store/useNotebookStore";
import { markdownEditorNodeId, markdownEditorSupertagApply } from "./markdownEditorContext";

function supertagMatch(context: CompletionContext) {
  const match = context.matchBefore(/(?:^|\s)#[^\s#]*/);
  if (!match) return null;
  const triggerFrom = match.from + (match.text.startsWith("#") ? 0 : 1);
  return { ...match, from: triggerFrom };
}

export function supertagCompletionSource(context: CompletionContext): CompletionResult | null {
  const match = supertagMatch(context);
  if (!match || (match.from === match.to && !context.explicit)) return null;
  const apply = context.state.facet(markdownEditorSupertagApply);
  if (!apply) return null;
  const nodeId = context.state.facet(markdownEditorNodeId);
  const state = useNotebookStore.getState();
  const options: Completion[] = BUILT_IN_SUPERTAGS
    .filter((tag) => !nodeId || !hasSupertag(state, nodeId, tag.id))
    .map((tag) => ({
      label: `#${tag.label}`,
      detail: tag.description,
      type: "keyword",
      apply: (view, _completion, from, to) => {
        view.dispatch({ changes: { from, to, insert: "" } });
        apply(view, tag.id);
      },
    } satisfies Completion));
  return { from: match.from, options, validFor: /^[^\s#]*$/ };
}

/** Ensures a batched IME insertion of a tag trigger still opens completion. */
export const supertagCompletionTrigger = ViewPlugin.fromClass(class {
  private queued = false;

  constructor(private readonly view: import("@codemirror/view").EditorView) {}

  update(update: import("@codemirror/view").ViewUpdate) {
    if (!update.docChanged || !update.view.hasFocus || completionStatus(update.state) === "active") return;
    const selection = update.state.selection.main;
    if (!selection.empty || !/(?:^|\s)#[^\s#]*$/.test(update.state.sliceDoc(0, selection.head))) return;
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.view.hasFocus && completionStatus(this.view.state) !== "active") startCompletion(this.view);
    });
  }
});
