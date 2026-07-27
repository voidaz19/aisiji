import type { NotebookState } from "../model";
import { createNode, moveAsFirstChild, updateMarkdown } from "../tree";

export type SplitPlacement = "after" | "first-child";

export interface SplitNodeCommand {
  nodeId: string;
  before: string;
  after: string;
  placement: SplitPlacement;
  newNodeId: string;
  now: number;
}

export type SplitNodeResult =
  | { status: "applied"; state: NotebookState; newNodeId: string }
  | { status: "rejected"; state: NotebookState; reason: "node-not-found" | "node-not-editable" };

/** Applies an already-resolved split placement without reading UI/session state. */
export function executeSplitNode(state: NotebookState, command: SplitNodeCommand): SplitNodeResult {
  const current = state.nodes[command.nodeId];
  if (!current) return { status: "rejected", state, reason: "node-not-found" };
  if (current.deletedAt || current.kind !== "content") {
    return { status: "rejected", state, reason: "node-not-editable" };
  }

  const parentId = command.placement === "first-child"
    ? command.nodeId
    : current.parentId;
  if (!parentId) return { status: "rejected", state, reason: "node-not-found" };

  let next = updateMarkdown(state, command.nodeId, command.before, command.now);
  const created = createNode(
    next,
    parentId,
    command.after,
    "content",
    null,
    command.placement === "after" ? command.nodeId : null,
    { nodeId: command.newNodeId, now: command.now },
  );
  next = created.state;

  if (command.placement === "first-child") {
    next = moveAsFirstChild(next, created.node.id, command.nodeId, command.now);
    next = { ...next, collapsed: { ...next.collapsed, [command.nodeId]: false } };
  }

  return { status: "applied", state: next, newNodeId: created.node.id };
}
