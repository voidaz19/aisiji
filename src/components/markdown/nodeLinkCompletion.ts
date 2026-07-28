import { CompletionContext, completionStatus, startCompletion, type Completion, type CompletionResult } from "@codemirror/autocomplete";
import { ViewPlugin } from "@codemirror/view";
import { ROOT_ID, type NodeRecord } from "../../domain/model";
import { useNotebookStore } from "../../store/useNotebookStore";

function plainNodeTitle(markdown: string): string {
  const firstLine = markdown.split(/\r?\n/, 1)[0].trim();
  const withoutSyntax = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/[*_~=`]/g, "")
    .trim();
  return withoutSyntax || "未命名节点";
}

function nodePath(state: ReturnType<typeof useNotebookStore.getState>, nodeId: string): string {
  const parts: string[] = [];
  let current: NodeRecord | undefined = state.nodes[nodeId];
  while (current && current.id !== ROOT_ID && parts.length < 4) {
    parts.unshift(current.kind === "date" ? current.dateKey ?? "日期节点" : plainNodeTitle(current.markdown));
    current = current.parentId ? state.nodes[current.parentId] : undefined;
  }
  return parts.join(" / ");
}

export function nodeLinkCompletionSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/\[\[[^\]\n]*/);
  if (!match || (match.from === match.to && !context.explicit)) return null;

  const state = useNotebookStore.getState();
  const usedLabels = new Map<string, number>();
  const options: Completion[] = Object.values(state.nodes)
    .filter((node) => node.id !== ROOT_ID && !node.deletedAt)
    .map((node) => {
      const title = node.kind === "date" ? node.dateKey ?? "日期节点" : plainNodeTitle(node.markdown);
      const duplicateIndex = (usedLabels.get(title) ?? 0) + 1;
      usedLabels.set(title, duplicateIndex);
      const path = nodePath(state, node.id);
      return {
        label: title,
        detail: duplicateIndex > 1 ? `${path}（同名 ${duplicateIndex}）` : path,
        // The completion range starts after `[[`; keep the opening brackets in place.
        apply: `node:${node.id}]]`,
        type: "reference",
      } satisfies Completion;
    });

  return { from: match.from + 2, options, validFor: /^[^\]\n]*$/ };
}

/** Ensures `[[` opens candidates even when an input method batches bracket input. */
export const nodeLinkCompletionTrigger = ViewPlugin.fromClass(class {
  private queued = false;

  constructor(private readonly view: import("@codemirror/view").EditorView) {}

  update(update: import("@codemirror/view").ViewUpdate) {
    if (!update.docChanged || !update.view.hasFocus || completionStatus(update.state) === "active") return;
    const selection = update.state.selection.main;
    if (!selection.empty || !/\[\[[^\]\n]*$/.test(update.state.sliceDoc(0, selection.head))) return;
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.view.hasFocus && completionStatus(this.view.state) !== "active") startCompletion(this.view);
    });
  }
});
