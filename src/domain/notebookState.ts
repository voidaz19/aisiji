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

/** Picks the freshest durable snapshot while preferring the synchronous browser copy on ties. */
export function selectHydrationWorkspace(
  browserState: NotebookState | null,
  nativeState: NotebookState | null,
): NotebookState | null {
  if (!browserState) return nativeState;
  if (!nativeState) return browserState;
  return workspaceVersion(browserState) >= workspaceVersion(nativeState) ? browserState : nativeState;
}

function workspaceVersion(state: NotebookState): number {
  return Object.values(state.nodes).reduce(
    (latest, node) => Math.max(latest, node.updatedAt, node.deletedAt ?? 0),
    0,
  );
}
