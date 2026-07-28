import { cloneState, createEmptyState, newId, ROOT_ID, type NodeRecord, type NotebookState } from "./model";

export type ChildIndex = ReadonlyMap<string, readonly NodeRecord[]>;

function compareSiblings(a: NodeRecord, b: NodeRecord): number {
  if (a.kind === "date" && b.kind === "date") {
    return (b.dateKey ?? "").localeCompare(a.dateKey ?? "");
  }
  return a.sortKey - b.sortKey || a.createdAt - b.createdAt;
}

/** Builds a sorted active-child lookup for reuse within one immutable state calculation. */
export function buildChildIndex(state: Pick<NotebookState, "nodes">): ChildIndex {
  const index = new Map<string, NodeRecord[]>();
  for (const node of Object.values(state.nodes)) {
    if (node.id === ROOT_ID || node.deletedAt || !node.parentId) continue;
    const children = index.get(node.parentId);
    if (children) children.push(node);
    else index.set(node.parentId, [node]);
  }
  for (const children of index.values()) children.sort(compareSiblings);
  return index;
}

export function childrenOf(
  state: Pick<NotebookState, "nodes">,
  parentId: string,
  childIndex?: ChildIndex,
): NodeRecord[] {
  return [...(childIndex?.get(parentId) ?? buildChildIndex(state).get(parentId) ?? [])];
}

export function visibleNodes(
  state: Pick<NotebookState, "nodes" | "collapsed">,
  rootId: string,
  _collapsed: Record<string, boolean> = state.collapsed,
): NodeRecord[] {
  const childIndex = buildChildIndex(state);
  const result: NodeRecord[] = [];
  const visit = (parentId: string, depth: number) => {
    for (const node of childIndex.get(parentId) ?? []) {
      result.push({ ...node, depth } as NodeRecord & { depth: number });
      if (isNodeExpanded(state, node.id, childIndex)) visit(node.id, depth + 1);
    }
  };
  visit(rootId, 0);
  return result;
}

export function isNodeExpanded(
  state: Pick<NotebookState, "nodes" | "collapsed">,
  nodeId: string,
  childIndex?: ChildIndex,
): boolean {
  const node = state.nodes[nodeId];
  if (!node) return false;
  const hasChildren = childIndex
    ? (childIndex.get(nodeId)?.length ?? 0) > 0
    : childrenOf(state, nodeId).length > 0;
  if (state.collapsed[nodeId] !== undefined) return !state.collapsed[nodeId];
  return hasChildren;
}

export function hasChildren(state: Pick<NotebookState, "nodes">, nodeId: string, childIndex?: ChildIndex): boolean {
  return childIndex
    ? (childIndex.get(nodeId)?.length ?? 0) > 0
    : childrenOf(state, nodeId).length > 0;
}

/** Returns the final node currently visible inside a node's expanded subtree. */
export function lastVisibleNodeInSubtree(state: Pick<NotebookState, "nodes" | "collapsed">, nodeId: string): NodeRecord | undefined {
  const childIndex = buildChildIndex(state);
  let current = state.nodes[nodeId];
  while (current && isNodeExpanded(state, current.id, childIndex)) {
    const children = childIndex.get(current.id) ?? [];
    if (!children.length) break;
    current = children[children.length - 1];
  }
  return current;
}

export function isDescendant(state: NotebookState, nodeId: string, possibleAncestor: string): boolean {
  let current = state.nodes[nodeId]?.parentId ?? null;
  while (current) {
    if (current === possibleAncestor) return true;
    current = state.nodes[current]?.parentId ?? null;
  }
  return false;
}

function activeChildren(state: NotebookState, parentId: string, ignoreId?: string): NodeRecord[] {
  return childrenOf(state, parentId).filter((node) => node.id !== ignoreId && node.kind !== "date");
}

function sortKeyBetween(before: NodeRecord | undefined, after: NodeRecord | undefined): number {
  if (!before && !after) return 1000;
  if (!before) return (after?.sortKey ?? 1000) - 1000;
  if (!after) return before.sortKey + 1000;
  if (after.sortKey - before.sortKey > 0.0001) return (before.sortKey + after.sortKey) / 2;
  return before.sortKey + 0.5;
}

function normalizeChildren(state: NotebookState, parentId: string): void {
  childrenOf(state, parentId)
    .filter((node) => node.kind !== "date")
    .forEach((node, index) => {
      state.nodes[node.id] = { ...node, sortKey: (index + 1) * 1000 };
    });
}

function touch(node: NodeRecord, now = Date.now()): NodeRecord {
  return { ...node, revision: node.revision + 1, updatedAt: now };
}

export function createNode(
  state: NotebookState,
  parentId: string,
  markdown = "",
  kind: "content" | "date" = "content",
  dateKey: string | null = null,
  afterId?: string | null,
  options: { nodeId?: string; now?: number } = {},
): { state: NotebookState; node: NodeRecord } {
  const next = cloneState(state);
  const now = options.now ?? Date.now();
  // Date nodes live in their own ordering track (sorted by dateKey), so
  // always exclude them when anchoring a new node's sortKey. This keeps
  // content-node sortKey arithmetic self-contained and prevents a date
  // node's sortKey from forcing new content nodes before or after all dates.
  const siblings = childrenOf(next, parentId).filter((sibling) => sibling.kind !== "date");
  // By default a new node is appended after the last sibling. When afterId
  // names a specific sibling (e.g. pressing Enter on that node), the new
  // node is inserted right after it instead of always landing at the end.
  const afterIndex = afterId ? siblings.findIndex((sibling) => sibling.id === afterId) : -1;
  const before = afterIndex >= 0 ? siblings[afterIndex] : siblings[siblings.length - 1];
  const after = afterIndex >= 0 ? siblings[afterIndex + 1] : undefined;
  const node: NodeRecord = {
    id: options.nodeId ?? newId(kind),
    kind,
    parentId,
    sortKey: sortKeyBetween(before, after),
    markdown,
    dateKey,
    deletedAt: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  next.nodes[node.id] = node;
  return { state: next, node };
}

export function updateMarkdown(state: NotebookState, nodeId: string, markdown: string, now = Date.now()): NotebookState {
  const node = state.nodes[nodeId];
  if (!node || node.deletedAt) return state;
  const next = cloneState(state);
  next.nodes[nodeId] = touch({ ...node, markdown }, now);
  return next;
}

export function toggleCollapsed(state: NotebookState, nodeId: string): NotebookState {
  const next = cloneState(state);
  next.collapsed[nodeId] = isNodeExpanded(state, nodeId);
  return next;
}

export function setChildrenExpanded(state: NotebookState, parentId: string, expanded: boolean): NotebookState {
  const next = cloneState(state);
  for (const child of childrenOf(state, parentId)) {
    if (hasChildren(state, child.id)) next.collapsed[child.id] = !expanded;
  }
  return next;
}

export function moveBefore(state: NotebookState, nodeId: string, targetId: string, now = Date.now()): NotebookState {
  return moveRelative(state, nodeId, targetId, "before", now);
}

export function moveAfter(state: NotebookState, nodeId: string, targetId: string, now = Date.now()): NotebookState {
  return moveRelative(state, nodeId, targetId, "after", now);
}

function moveRelative(state: NotebookState, nodeId: string, targetId: string, position: "before" | "after", now: number): NotebookState {
  const moving = state.nodes[nodeId];
  const target = state.nodes[targetId];
  if (!moving || !target || moving.kind === "date" || target.kind === "date" || moving.id === target.id) return state;
  if (isDescendant(state, targetId, nodeId)) return state;
  const parentId = target.parentId ?? ROOT_ID;
  const next = cloneState(state);
  const siblings = activeChildren(next, parentId, nodeId);
  const targetIndex = siblings.findIndex((node) => node.id === targetId);
  const before = position === "before" ? siblings[targetIndex - 1] : siblings[targetIndex];
  const after = position === "before" ? siblings[targetIndex] : siblings[targetIndex + 1];
  next.nodes[nodeId] = touch({ ...moving, parentId, sortKey: sortKeyBetween(before, after) }, now);
  normalizeChildren(next, parentId);
  return next;
}

export function moveAsFirstChild(state: NotebookState, nodeId: string, parentId: string, now = Date.now()): NotebookState {
  const moving = state.nodes[nodeId];
  const parent = state.nodes[parentId];
  if (!moving || !parent || moving.kind === "date" || isDescendant(state, parentId, nodeId)) return state;
  const next = cloneState(state);
  const first = activeChildren(next, parentId, nodeId)[0];
  next.nodes[nodeId] = touch({ ...moving, parentId, sortKey: sortKeyBetween(undefined, first) }, now);
  normalizeChildren(next, parentId);
  return next;
}

export function moveAsLastChild(state: NotebookState, nodeId: string, parentId: string, now = Date.now()): NotebookState {
  const moving = state.nodes[nodeId];
  const parent = state.nodes[parentId];
  if (!moving || moving.kind === "date" || !parent || isDescendant(state, parentId, nodeId)) return state;
  const next = cloneState(state);
  const siblings = activeChildren(next, parentId, nodeId);
  const last = siblings[siblings.length - 1];
  next.nodes[nodeId] = touch({ ...moving, parentId, sortKey: sortKeyBetween(last, undefined) }, now);
  normalizeChildren(next, parentId);
  if (parentId !== ROOT_ID) next.collapsed[parentId] = false;
  return next;
}

export function indentNode(state: NotebookState, nodeId: string, now = Date.now()): NotebookState {
  const node = state.nodes[nodeId];
  if (!node || node.kind === "date") return state;
  const parentId = node.parentId ?? ROOT_ID;
  const index = childrenOf(state, parentId).findIndex((item) => item.id === nodeId);
  const previous = childrenOf(state, parentId)[index - 1];
  if (!previous || previous.kind === "date") return state;
  // Indenting changes the hierarchy without reordering the existing content:
  // append after the previous sibling's current children.
  return moveAsLastChild(state, nodeId, previous.id, now);
}

export function outdentNode(state: NotebookState, nodeId: string, now = Date.now()): NotebookState {
  const node = state.nodes[nodeId];
  if (!node || !node.parentId || node.kind === "date") return state;
  const parent = state.nodes[node.parentId];
  if (!parent) return state;
  const next = moveAfter(state, nodeId, parent.id, now);
  if (childrenOf(next, parent.id).length > 0) return next;
  return { ...next, collapsed: { ...next.collapsed, [parent.id]: true } };
}

export function deleteSubtree(state: NotebookState, nodeId: string, now = Date.now()): NotebookState {
  const node = state.nodes[nodeId];
  if (!node) return state;
  const next = cloneState(state);
  const visit = (id: string) => {
    const current = next.nodes[id];
    if (!current) return;
    next.nodes[id] = { ...current, deletedAt: now, revision: current.revision + 1, updatedAt: now };
    childrenOf(next, id).forEach((child) => visit(child.id));
  };
  visit(nodeId);
  return next;
}

export function deleteSubtrees(state: NotebookState, nodeIds: readonly string[], now = Date.now()): NotebookState {
  return nodeIds.reduce((next, nodeId) => deleteSubtree(next, nodeId, now), state);
}

export function restoreSubtree(state: NotebookState, nodeId: string, now = Date.now()): NotebookState {
  const node = state.nodes[nodeId];
  if (!node) return state;
  const next = cloneState(state);
  const visit = (id: string) => {
    const current = next.nodes[id];
    if (!current) return;
    next.nodes[id] = { ...current, deletedAt: null, revision: current.revision + 1, updatedAt: now };
    Object.values(next.nodes).filter((child) => child.parentId === id).forEach((child) => visit(child.id));
  };
  visit(nodeId);
  return next;
}

export function createSeedState(dateKey: string): NotebookState {
  let state = createEmptyState();
  const dateResult = createNode(state, ROOT_ID, dateKey, "date", dateKey);
  state = dateResult.state;
  const childResult = createNode(state, dateResult.node.id, "", "content");
  return childResult.state;
}

export function dateNodeFor(state: NotebookState, dateKey: string): NodeRecord | undefined {
  return Object.values(state.nodes).find((node) => node.kind === "date" && node.dateKey === dateKey && !node.deletedAt);
}

export function ensureDateNode(state: NotebookState, dateKey: string): { state: NotebookState; node: NodeRecord } {
  const existing = dateNodeFor(state, dateKey);
  if (existing) return { state, node: existing };
  return createNode(state, ROOT_ID, dateKey, "date", dateKey);
}
