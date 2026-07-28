import { ROOT_ID, type NodeRecord, type NotebookState } from "../../../domain/model";
import { visibleNodes } from "../../../domain/tree";
import type { WorkspaceView } from "../../../shared/workspaceView";

export function findDateNode(state: Pick<NotebookState, "nodes">, dateKey: string): NodeRecord | undefined {
  return Object.values(state.nodes).find(
    (node) => node.kind === "date" && node.dateKey === dateKey && !node.deletedAt,
  );
}

export function viewRootId(view: WorkspaceView, todayNode?: NodeRecord): string {
  return view === "today" ? (todayNode?.id ?? ROOT_ID) : ROOT_ID;
}

export function breadcrumbPath(
  nodes: NotebookState["nodes"],
  activeRoot: NodeRecord | null,
  stopRootId: string,
): NodeRecord[] {
  const path: NodeRecord[] = [];
  const visited = new Set<string>();
  let current: NodeRecord | null | undefined = activeRoot;
  while (current && current.id !== ROOT_ID && current.id !== stopRootId && !visited.has(current.id)) {
    path.unshift(current);
    visited.add(current.id);
    const parentId: string | null = current.parentId;
    current = parentId && parentId !== ROOT_ID && parentId !== stopRootId ? nodes[parentId] : undefined;
  }
  return path;
}

export function visibleNodesForView(
  state: Pick<NotebookState, "nodes" | "collapsed">,
  view: WorkspaceView,
  rootId: string,
  query: string,
): NodeRecord[] {
  if (view === "trash") return Object.values(state.nodes).filter((node) => Boolean(node.deletedAt));
  if (view === "search" && query.trim()) {
    const normalizedQuery = query.trim().toLowerCase();
    return Object.values(state.nodes).filter(
      (node) => !node.deletedAt && node.markdown.toLowerCase().includes(normalizedQuery),
    );
  }

  const nodes = visibleNodes(state, rootId, state.collapsed);
  if (view !== "outline" || rootId !== ROOT_ID) return nodes;

  const nonEmptyParentIds = new Set(
    Object.values(state.nodes)
      .filter((node) => !node.deletedAt && node.parentId)
      .map((node) => node.parentId),
  );
  return nodes.filter((node) => node.kind !== "date" || nonEmptyParentIds.has(node.id));
}
