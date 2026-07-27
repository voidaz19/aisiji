import { create } from "zustand";
import { executeDeleteNode, executeDeleteSelection, executeRestoreSubtree } from "../domain/commands/deleteNode";
import { executeMoveNode, type MoveNodeIntent } from "../domain/commands/moveNode";
import { executeSplitNode } from "../domain/commands/splitNode";
import { createSeedState, ensureDateNode, updateMarkdown, toggleCollapsed, setChildrenExpanded, isNodeExpanded, hasChildren, childrenOf, createNode } from "../domain/tree";
import { newId, ROOT_ID, type AttachmentRecord, type NodeField, type Operation, type NotebookState } from "../domain/model";
import { storeAttachment } from "../platform/attachments";
import { appendNativeOperation, loadNativeWorkspace, readBrowserWorkspace, saveWorkspace } from "../platform/workspaceRepository";
import { localDateKey } from "../shared/date";
import type { NotebookStore } from "./notebookStore.types";
import { createOperation } from "./operationFactory";
import { createMergeActions } from "./actions/mergeActions";
import { shakeNodeTree } from "./uiFeedback";

export { localDateKey } from "../shared/date";

function readInitialState(): NotebookState {
  return readBrowserWorkspace() ?? createSeedState(localDateKey());
}

export const useNotebookStore = create<NotebookStore>((set, get) => {
  const initial = readInitialState();
  if (!initial.attachments) initial.attachments = {};
  const commit = (next: NotebookState, operation?: Operation) => {
    saveWorkspace(next);
    if (operation) appendNativeOperation(operation);
    set({ ...next, pendingOperations: operation ? [...get().pendingOperations, operation] : get().pendingOperations });
  };
  const focusAfterNodeRemoval = (
    removedNodeId: string,
    activeNodeId: string | null,
    cursor: number | "end" | null,
    replacementRootId = activeNodeId ?? ROOT_ID,
    activeGhostParentId: string | null = null,
  ) => {
    const current = get();
    const patch: Partial<NotebookStore> = { activeNodeId, activeNodeCursor: cursor, activeGhostParentId };
    if (current.activeRootId === removedNodeId) {
      const rootHistory = [...current.rootHistory];
      if (rootHistory[rootHistory.length - 1] === replacementRootId) rootHistory.pop();
      patch.activeRootId = replacementRootId;
      patch.rootHistory = rootHistory;
    }
    set(patch);
  };
  const moveNode = (
    command: MoveNodeIntent,
    operation: Operation,
  ) => {
    const result = executeMoveNode(get(), { ...command, now: Date.now() });
    if (result.changed) commit(result.state, operation);
  };
  return {
    ...initial,
    activeRootId: ROOT_ID,
    activeNodeId: Object.values(initial.nodes).find((node) => node.kind === "content" && !node.deletedAt)?.id ?? null,
    activeNodeCursor: null,
    activeGhostParentId: null,
    rootHistory: [],
    query: "",
    lastSync: "idle",
    pendingOperations: [],
    ghostSuppressed: {},
    hydrate: async () => {
      try {
        const persistedState = await loadNativeWorkspace();
        if (!persistedState) return;
        set({ ...persistedState, pendingOperations: [] });
      } catch {
        // Browser fallback and first-run native builds use the seed state.
      }
    },
    initialize: () => {
      const dateKey = localDateKey();
      const result = ensureDateNode(get(), dateKey);
      let next = result.state;
      let node = result.node;
      if (!Object.values(next.nodes).some((item) => item.parentId === node.id && !item.deletedAt)) {
        const child = createNode(next, node.id, "");
        next = child.state;
        node = child.node;
      }
      commit(next);
      set({ activeRootId: node.parentId ?? ROOT_ID, activeNodeId: node.id, activeGhostParentId: null });
    },
    setQuery: (query) => set({ query }),
    setActiveNode: (activeNodeId) => set({ activeNodeId, activeNodeCursor: null, activeGhostParentId: null }),
    focusNode: (nodeId, cursor = 0) => set({ activeNodeId: nodeId, activeNodeCursor: cursor, activeGhostParentId: null }),
    focusGhost: (activeGhostParentId) => set({ activeNodeId: null, activeNodeCursor: null, activeGhostParentId }),
    ...createMergeActions({ get, set, commit, focusAfterNodeRemoval }),
    enterNode: (nodeId) => {
      const node = get().nodes[nodeId];
      if (!node) return;
      set({
        activeRootId: nodeId,
        activeNodeId: node.kind === "content" ? nodeId : null,
        activeNodeCursor: node.kind === "content" ? "end" : null,
        activeGhostParentId: node.kind === "content" ? null : nodeId,
        rootHistory: [...get().rootHistory, get().activeRootId],
      });
    },
    goBack: () => {
      const history = [...get().rootHistory];
      const previous = history.pop();
      const activeRootId = previous ?? ROOT_ID;
      const root = get().nodes[activeRootId];
      set({
        activeRootId,
        activeNodeId: null,
        activeNodeCursor: null,
        activeGhostParentId: root?.kind === "content" ? null : activeRootId,
        rootHistory: history,
      });
    },
    openRoot: (nodeId) => {
      if (nodeId === ROOT_ID) {
        set({ activeRootId: ROOT_ID, activeNodeId: null, activeNodeCursor: null, activeGhostParentId: ROOT_ID, rootHistory: [] });
        return;
      }
      const node = get().nodes[nodeId];
      if (!node) return;
      const history: string[] = [ROOT_ID];
      let parentId = node.parentId;
      const visited = new Set<string>();
      while (parentId && parentId !== ROOT_ID && !visited.has(parentId)) {
        history.push(parentId);
        visited.add(parentId);
        parentId = get().nodes[parentId]?.parentId ?? ROOT_ID;
      }
      set({
        activeRootId: nodeId,
        activeNodeId: null,
        activeNodeCursor: null,
        activeGhostParentId: node.kind === "content" ? null : nodeId,
        rootHistory: history,
      });
    },
    goToRoot: () => get().openRoot(ROOT_ID),
    ensureTodayNode: () => {
      const dateKey = localDateKey();
      const result = ensureDateNode(get(), dateKey);
      commit(result.state);
      return result.node.id;
    },
    toggleNode: (nodeId) => {
      const next = toggleCollapsed(get(), nodeId);
      commit(next);
      if (isNodeExpanded(next, nodeId) && !hasChildren(next, nodeId)) {
        set((current) => ({
          ghostSuppressed: { ...current.ghostSuppressed, [nodeId]: false },
        }));
      }
    },
    toggleChildren: (parentId) => {
      const state = get();
      const expandableChildren = childrenOf(state, parentId).filter((child) => hasChildren(state, child.id));
      if (!expandableChildren.length) return;
      const expanded = expandableChildren.some((child) => !isNodeExpanded(state, child.id));
      commit(setChildrenExpanded(state, parentId, expanded), createOperation("toggle_children", parentId, { expanded }));
    },
    createSibling: (nodeId, markdown = "") => {
      const current = nodeId ? get().nodes[nodeId] : undefined;
      const parentId = current?.parentId ?? get().activeRootId ?? ROOT_ID;
      // Insert right after the node the user pressed Enter on, instead of
      // always appending to the end of the sibling list.
      const result = createNode(get(), parentId, markdown, "content", null, nodeId);
      commit(result.state, createOperation("create_node", result.node.id, { node: result.node }));
      set({ activeNodeId: result.node.id, activeNodeCursor: 0, activeGhostParentId: null });
      return result.node.id;
    },
    splitNode: (nodeId, before, after) => {
      const state = get();
      const current = state.nodes[nodeId];
      if (!current) return null;
      const splitsActiveRoot = state.activeRootId === nodeId;
      // When an expanded node already has children, Enter should keep the
      // new line directly beneath it instead of placing a sibling after the
      // whole visible subtree.
      const splitsIntoFirstChild = splitsActiveRoot || (hasChildren(state, nodeId) && isNodeExpanded(state, nodeId));
      const newNodeId = newId("content");
      const result = executeSplitNode(state, {
        nodeId,
        before,
        after,
        placement: splitsIntoFirstChild ? "first-child" : "after",
        newNodeId,
        now: Date.now(),
      });
      if (result.status === "rejected") return null;
      commit(result.state, createOperation("create_node", result.newNodeId, { node: result.state.nodes[result.newNodeId] }));
      set({ activeNodeId: result.newNodeId, activeNodeCursor: 0, activeGhostParentId: null });
      return result.newNodeId;
    },
    createChild: (parentId, markdown = "") => {
      const result = createNode(get(), parentId, markdown);
      const next = parentId ? { ...result.state, collapsed: { ...result.state.collapsed, [parentId]: false } } : result.state;
      commit(next, createOperation("create_node", result.node.id, { node: result.node }));
      set((current) => ({ ghostSuppressed: { ...current.ghostSuppressed, [parentId]: false } }));
      set({ activeNodeId: result.node.id, activeNodeCursor: 0, activeGhostParentId: null });
      return result.node.id;
    },
    editMarkdown: (nodeId, markdown) => {
      const previous = get().nodes[nodeId];
      const next = updateMarkdown(get(), nodeId, markdown);
      commit(next, createOperation("update_markdown", nodeId, { markdown }, previous?.revision ?? 0));
    },
    indent: (nodeId) => moveNode({ type: "indent", nodeId }, createOperation("indent", nodeId, {})),
    outdent: (nodeId) => moveNode({ type: "outdent", nodeId }, createOperation("outdent", nodeId, {})),
    moveToSlot: (nodeId, parentId, beforeId) => moveNode(
      { type: "slot", nodeId, parentId, beforeId },
      createOperation("move_slot", nodeId, { parentId, beforeId }),
    ),
    moveToEmptyNode: (nodeId, target) => moveNode(
      { type: "empty-node", nodeId, target },
      createOperation("move_to_empty_node", nodeId, { target }),
    ),
    remove: (nodeId) => {
      const state = get();
      const node = state.nodes[nodeId];
      if (!node || node.kind === "date") return;
      const parentId = node.parentId ?? ROOT_ID;
      const siblings = childrenOf(state, parentId).filter((n) => n.kind !== "date");
      const idx = siblings.findIndex((s) => s.id === nodeId);
      let nextFocus: string | null = null;
      if (idx > 0) {
        nextFocus = siblings[idx - 1].id;
      } else if (idx < siblings.length - 1) {
        nextFocus = siblings[idx + 1].id;
      } else if (state.nodes[parentId]?.kind === "content") {
        nextFocus = parentId;
      }
      const nextGhostParentId = nextFocus ? null : parentId;
      const result = executeDeleteNode(state, nodeId, Date.now());
      if (result.status === "rejected") {
        if (result.reason === "has-children") shakeNodeTree(state, nodeId);
        return;
      }
      commit(result.state, createOperation("delete_subtree", nodeId, {}));
      focusAfterNodeRemoval(
        nodeId,
        nextFocus,
        nextFocus ? "end" : null,
        nextFocus ?? parentId,
        nextGhostParentId,
      );
    },
    removeNodes: (nodeIds, focusKey = null) => {
      const state = get();
      const result = executeDeleteSelection(state, nodeIds, Date.now());
      const roots = result.roots;
      if (!roots.length) return;

      const next = result.state;
      commit(next, createOperation("delete_subtrees", roots[0], { nodeIds: roots }));

      const activeRootRemoved = roots.some((rootId) => {
        let currentId: string | null = state.activeRootId;
        while (currentId) {
          if (currentId === rootId) return true;
          currentId = state.nodes[currentId]?.parentId ?? null;
        }
        return false;
      });
      if (activeRootRemoved) {
        const parentId = state.nodes[roots[0]]?.parentId ?? ROOT_ID;
        set({
          activeRootId: parentId,
          rootHistory: state.rootHistory.filter((id) => id !== state.activeRootId),
        });
      }

      if (focusKey?.startsWith("ghost:")) {
        set({ activeNodeId: null, activeNodeCursor: null, activeGhostParentId: focusKey.slice(6) });
        return;
      }
      const focusNode = focusKey ? next.nodes[focusKey] : undefined;
      if (focusNode && !focusNode.deletedAt && focusNode.kind === "content") {
        set({ activeNodeId: focusNode.id, activeNodeCursor: 0, activeGhostParentId: null });
      } else if (focusNode && !focusNode.deletedAt && focusNode.kind === "date") {
        set({ activeNodeId: null, activeNodeCursor: null, activeGhostParentId: focusNode.id });
      } else {
        const parentId = state.nodes[roots[0]]?.parentId ?? ROOT_ID;
        set({ activeNodeId: null, activeNodeCursor: null, activeGhostParentId: parentId });
      }
    },
    restore: (nodeId) => commit(executeRestoreSubtree(get(), nodeId, Date.now()), createOperation("restore_subtree", nodeId, {})),
    addField: (nodeId, key, type, value) => {
      const field: NodeField = { id: newId("field"), nodeId, key, type, value, updatedAt: Date.now() };
      const next = { ...get(), fields: { ...get().fields, [field.id]: field } };
      commit(next, createOperation("set_field", field.id, { field }));
    },
    updateField: (fieldId, value) => {
      const field = get().fields[fieldId];
      if (!field) return;
      const next = { ...get(), fields: { ...get().fields, [fieldId]: { ...field, value, updatedAt: Date.now() } } };
      commit(next, createOperation("set_field", fieldId, { field: next.fields[fieldId] }));
    },
    addAttachment: async (nodeId, file) => {
      const id = newId("attachment");
      const { sha256, localPath } = await storeAttachment(file, id);
      const attachment: AttachmentRecord = { id, nodeId, name: file.name, mime: file.type || "application/octet-stream", size: file.size, sha256, localPath, remotePath: `workspace/blobs/${sha256}/${id}`, pinned: false, createdAt: Date.now() };
      const next = { ...get(), attachments: { ...get().attachments, [id]: attachment } };
      commit(next, createOperation("add_attachment", id, { attachment }));
      const syntax = attachment.mime.startsWith("image/") ? `![${attachment.name}](attachment://${id})` : `[${attachment.name}](attachment://${id})`;
      const current = get().nodes[nodeId]?.markdown ?? "";
      get().editMarkdown(nodeId, current ? `${current} ${syntax}` : syntax);
    },
  };
});
