import type { NotebookState } from "./model";

/** Removes UI/store fields and fills optional legacy collections before persistence or hydration. */
export function normalizeNotebookState(state: Partial<NotebookState>): NotebookState {
  return {
    nodes: state.nodes ?? {},
    fields: state.fields ?? {},
    attachments: state.attachments ?? {},
    collapsed: state.collapsed ?? {},
  };
}
