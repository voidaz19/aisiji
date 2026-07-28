import { ROOT_ID, type NotebookState } from "./model";

export interface PurgeDeletedNodesResult {
  state: NotebookState;
  purgedNodeIds: string[];
  purgedAttachmentIds: string[];
}

/** Permanently removes every soft-deleted node and records owned by those nodes. */
export function purgeDeletedNodes(state: NotebookState): PurgeDeletedNodesResult {
  const purgedNodeIds = Object.values(state.nodes)
    .filter((node) => node.id !== ROOT_ID && Boolean(node.deletedAt))
    .map((node) => node.id);
  if (!purgedNodeIds.length) return { state, purgedNodeIds: [], purgedAttachmentIds: [] };

  const purgedNodeIdSet = new Set(purgedNodeIds);
  const nodes = Object.fromEntries(
    Object.entries(state.nodes).filter(([nodeId]) => !purgedNodeIdSet.has(nodeId)),
  );
  const fields = Object.fromEntries(
    Object.entries(state.fields).filter(([, field]) => !purgedNodeIdSet.has(field.nodeId)),
  );
  const purgedAttachmentIds: string[] = [];
  const activeNodes = Object.values(state.nodes).filter((node) => !node.deletedAt);
  const attachments = Object.fromEntries(
    Object.entries(state.attachments).flatMap(([attachmentId, attachment]) => {
      if (!purgedNodeIdSet.has(attachment.nodeId)) return [[attachmentId, attachment]];
      const activeReferrer = activeNodes.find((node) => node.markdown.includes(`attachment://${attachmentId}`));
      if (activeReferrer) {
        return [[attachmentId, { ...attachment, nodeId: activeReferrer.id }]];
      }
      purgedAttachmentIds.push(attachmentId);
      return [];
    }),
  );
  const collapsed = Object.fromEntries(
    Object.entries(state.collapsed).filter(([nodeId]) => !purgedNodeIdSet.has(nodeId)),
  );
  const recentPageEdits = Object.fromEntries(
    Object.entries(state.recentPageEdits).filter(([pageId]) => !purgedNodeIdSet.has(pageId)),
  );

  return {
    state: { nodes, fields, attachments, collapsed, recentPageEdits },
    purgedNodeIds,
    purgedAttachmentIds,
  };
}
