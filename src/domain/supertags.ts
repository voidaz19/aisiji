import { cloneState, type NotebookState } from "./model";

export const CANVAS_SUPERTAG_ID = "canvas";

export interface BuiltInSupertag {
  id: string;
  label: string;
  description: string;
}

/** Built-ins are definitions; each node stores only stable identifiers. */
export const BUILT_IN_SUPERTAGS: readonly BuiltInSupertag[] = [
  {
    id: CANVAS_SUPERTAG_ID,
    label: "卡片视图",
    description: "以自动网格展示该节点的直接子节点。",
  },
];

export function hasSupertag(
  state: Pick<NotebookState, "nodes">,
  nodeId: string,
  supertagId: string,
): boolean {
  return state.nodes[nodeId]?.supertagIds?.includes(supertagId) ?? false;
}

export function addSupertag(state: NotebookState, nodeId: string, supertagId: string, now = Date.now()): NotebookState {
  const node = state.nodes[nodeId];
  if (!node || node.deletedAt || node.kind !== "content" || hasSupertag(state, nodeId, supertagId)) return state;
  const next = cloneState(state);
  next.nodes[nodeId] = {
    ...node,
    supertagIds: [...(node.supertagIds ?? []), supertagId],
    revision: node.revision + 1,
    updatedAt: now,
  };
  return next;
}

export function removeSupertag(state: NotebookState, nodeId: string, supertagId: string, now = Date.now()): NotebookState {
  const node = state.nodes[nodeId];
  if (!node || !hasSupertag(state, nodeId, supertagId)) return state;
  const next = cloneState(state);
  next.nodes[nodeId] = {
    ...node,
    supertagIds: node.supertagIds?.filter((id) => id !== supertagId),
    revision: node.revision + 1,
    updatedAt: now,
  };
  return next;
}
