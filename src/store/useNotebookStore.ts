import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { createSeedState, ensureDateNode, indentNode, moveAfter, moveAsFirstChild, moveAsLastChild, moveBefore, outdentNode, updateMarkdown, deleteSubtree, restoreSubtree, toggleCollapsed, setChildrenExpanded, isNodeExpanded, hasChildren, childrenOf, createNode } from "../domain/tree";
import { newId, ROOT_ID, type AttachmentRecord, type FieldType, type NodeField, type Operation, type NotebookState } from "../domain/model";

const STORAGE_KEY = "aisiji-notebook-state-v1";
const DEVICE_KEY = "aisiji-device-id";

function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function localDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function readInitialState(): NotebookState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as NotebookState;
  } catch {
    // Native builds can start before a browser storage adapter is available.
  }
  return createSeedState(localDateKey());
}

function persist(state: NotebookState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* native persistence arrives through Tauri */ }
  if (hasTauriRuntime()) void invoke("save_workspace", { stateJson: JSON.stringify(state) }).catch(() => undefined);
}

function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = newId("device");
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

interface NotebookStore extends NotebookState {
  activeRootId: string;
  activeNodeId: string | null;
  /** Cursor position hint consumed once when an editor gains focus via activeNodeId. */
  activeNodeCursor: number | "end" | null;
  rootHistory: string[];
  query: string;
  lastSync: "idle" | "syncing" | "error";
  pendingOperations: Operation[];
  initialize: () => void;
  setQuery: (query: string) => void;
  setActiveNode: (nodeId: string | null) => void;
  /** Focus a node and optionally place the cursor at a specific position. */
  focusNode: (nodeId: string, cursor?: number | "end") => void;
  /** Merge current node content onto the previous sibling (or parent), then delete it. */
  mergeWithPrev: (nodeId: string) => void;
  enterNode: (nodeId: string) => void;
  goBack: () => void;
  /** 确保今日日期节点存在并返回其 id，副作用：写入 store。 */
  ensureTodayNode: () => string;
  openRoot: (nodeId: string) => void;
  goToRoot: () => void;
  toggleNode: (nodeId: string) => void;
  toggleChildren: (parentId: string) => void;
  createSibling: (nodeId: string | null, markdown?: string) => string | null;
  /** Split a node's content at the cursor: keep `before` in place, create a new sibling with `after`. */
  splitNode: (nodeId: string, before: string, after: string) => string | null;
  createChild: (parentId: string, markdown?: string) => string | null;
  editMarkdown: (nodeId: string, markdown: string) => void;
  indent: (nodeId: string) => void;
  outdent: (nodeId: string) => void;
  moveBefore: (nodeId: string, targetId: string) => void;
  moveAfter: (nodeId: string, targetId: string) => void;
  moveFirstChild: (nodeId: string, parentId: string) => void;
  moveLastChild: (nodeId: string, parentId: string) => void;
  remove: (nodeId: string) => void;
  restore: (nodeId: string) => void;
  addField: (nodeId: string, key: string, type: FieldType, value: string) => void;
  updateField: (fieldId: string, value: string) => void;
  addAttachment: (nodeId: string, file: File) => Promise<void>;
  hydrate: () => Promise<void>;
}

function op(kind: string, entityId: string, payload: Record<string, unknown>, baseRevision = 0): Operation {
  return {
    opId: newId("op"),
    deviceId: deviceId(),
    sequence: Date.now(),
    hlc: `${Date.now()}-${deviceId()}`,
    baseRevision,
    kind,
    entityId,
    payload,
    createdAt: Date.now(),
  };
}

export const useNotebookStore = create<NotebookStore>((set, get) => {
  const initial = readInitialState();
  if (!initial.attachments) initial.attachments = {};
  const commit = (next: NotebookState, operation?: Operation) => {
    persist(next);
    if (operation && hasTauriRuntime()) {
      void invoke("append_operation", {
        operationJson: JSON.stringify(operation),
        opId: operation.opId,
        deviceId: operation.deviceId,
        sequence: operation.sequence,
      }).catch(() => undefined);
    }
    set({ ...next, pendingOperations: operation ? [...get().pendingOperations, operation] : get().pendingOperations });
  };
  return {
    ...initial,
    activeRootId: ROOT_ID,
    activeNodeId: Object.values(initial.nodes).find((node) => node.kind === "content" && !node.deletedAt)?.id ?? null,
    activeNodeCursor: null,
    rootHistory: [],
    query: "",
    lastSync: "idle",
    pendingOperations: [],
    hydrate: async () => {
      if (!hasTauriRuntime()) return;
      try {
        const stateJson = await invoke<string | null>("load_workspace");
        if (!stateJson) return;
        const persistedState = JSON.parse(stateJson) as NotebookState;
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
      set({ activeRootId: node.parentId ?? ROOT_ID, activeNodeId: node.id });
    },
    setQuery: (query) => set({ query }),
    setActiveNode: (activeNodeId) => set({ activeNodeId, activeNodeCursor: null }),
    focusNode: (nodeId, cursor = 0) => set({ activeNodeId: nodeId, activeNodeCursor: cursor }),
    mergeWithPrev: (nodeId) => {
      const state = get();
      const node = state.nodes[nodeId];
      if (!node) return;
      // Find previous sibling (excluding date nodes), or fall back to parent
      const siblings = childrenOf(state, node.parentId ?? ROOT_ID).filter((n) => n.kind !== "date");
      const idx = siblings.findIndex((s) => s.id === nodeId);
      let prevId: string | null = null;
      if (idx > 0) {
        prevId = siblings[idx - 1].id;
      } else {
        // First child — try to merge into parent (if it's not a date node)
        const parent = (node.parentId && node.parentId !== ROOT_ID) ? state.nodes[node.parentId] : null;
        if (parent && parent.kind !== "date") prevId = parent.id;
      }
      if (!prevId) return;
      const prev = state.nodes[prevId];
      if (!prev) return;
      // Position cursor at the join point (end of prev content)
      const mergePos = prev.markdown.length;
      let next = updateMarkdown(state, prevId, prev.markdown + node.markdown);
      // If the node being merged away has children, reparent them onto the
      // merge target instead of letting deleteSubtree wipe them out —
      // merging a node's text shouldn't destroy its subtree.
      for (const child of childrenOf(next, nodeId)) {
        next = moveAsLastChild(next, child.id, prevId);
      }
      next = deleteSubtree(next, nodeId);
      commit(next);
      // Set active node and cursor hint in one batch
      set({ activeNodeId: prevId, activeNodeCursor: mergePos });
    },
    enterNode: (nodeId) => {
      const node = get().nodes[nodeId];
      if (!node) return;
      set({ activeRootId: nodeId, activeNodeId: null, rootHistory: [...get().rootHistory, get().activeRootId] });
    },
    goBack: () => {
      const history = [...get().rootHistory];
      const previous = history.pop();
      set({ activeRootId: previous ?? ROOT_ID, rootHistory: history });
    },
    openRoot: (nodeId) => {
      if (nodeId === ROOT_ID) {
        set({ activeRootId: ROOT_ID, activeNodeId: null, rootHistory: [] });
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
      set({ activeRootId: nodeId, activeNodeId: null, rootHistory: history });
    },
    goToRoot: () => get().openRoot(ROOT_ID),
    ensureTodayNode: () => {
      const dateKey = localDateKey();
      const result = ensureDateNode(get(), dateKey);
      commit(result.state);
      return result.node.id;
    },
    toggleNode: (nodeId) => commit(toggleCollapsed(get(), nodeId)),
    toggleChildren: (parentId) => {
      const state = get();
      const expandableChildren = childrenOf(state, parentId).filter((child) => hasChildren(state, child.id));
      if (!expandableChildren.length) return;
      const expanded = expandableChildren.some((child) => !isNodeExpanded(state, child.id));
      commit(setChildrenExpanded(state, parentId, expanded), op("toggle_children", parentId, { expanded }));
    },
    createSibling: (nodeId, markdown = "") => {
      const current = nodeId ? get().nodes[nodeId] : undefined;
      const parentId = current?.parentId ?? get().activeRootId ?? ROOT_ID;
      // Insert right after the node the user pressed Enter on, instead of
      // always appending to the end of the sibling list.
      const result = createNode(get(), parentId, markdown, "content", null, nodeId);
      commit(result.state, op("create_node", result.node.id, { node: result.node }));
      set({ activeNodeId: result.node.id, activeNodeCursor: 0 });
      return result.node.id;
    },
    splitNode: (nodeId, before, after) => {
      const current = get().nodes[nodeId];
      if (!current) return null;
      const parentId = current.parentId ?? ROOT_ID;
      let next = updateMarkdown(get(), nodeId, before);
      const result = createNode(next, parentId, after, "content", null, nodeId);
      next = result.state;
      commit(next, op("create_node", result.node.id, { node: result.node }));
      set({ activeNodeId: result.node.id, activeNodeCursor: 0 });
      return result.node.id;
    },
    createChild: (parentId, markdown = "") => {
      const result = createNode(get(), parentId, markdown);
      const next = parentId ? { ...result.state, collapsed: { ...result.state.collapsed, [parentId]: false } } : result.state;
      commit(next, op("create_node", result.node.id, { node: result.node }));
      set({ activeNodeId: result.node.id, activeNodeCursor: 0 });
      return result.node.id;
    },
    editMarkdown: (nodeId, markdown) => {
      const previous = get().nodes[nodeId];
      const next = updateMarkdown(get(), nodeId, markdown);
      commit(next, op("update_markdown", nodeId, { markdown }, previous?.revision ?? 0));
    },
    indent: (nodeId) => commit(indentNode(get(), nodeId), op("indent", nodeId, {})),
    outdent: (nodeId) => commit(outdentNode(get(), nodeId), op("outdent", nodeId, {})),
    moveBefore: (nodeId, targetId) => commit(moveBefore(get(), nodeId, targetId), op("move_before", nodeId, { targetId })),
    moveAfter: (nodeId, targetId) => commit(moveAfter(get(), nodeId, targetId), op("move_after", nodeId, { targetId })),
    moveFirstChild: (nodeId, parentId) => commit(moveAsFirstChild(get(), nodeId, parentId), op("move_child", nodeId, { parentId })),
    moveLastChild: (nodeId, parentId) => commit(moveAsLastChild(get(), nodeId, parentId), op("move_child", nodeId, { parentId })),
    remove: (nodeId) => commit(deleteSubtree(get(), nodeId), op("delete_subtree", nodeId, {})),
    restore: (nodeId) => commit(restoreSubtree(get(), nodeId), op("restore_subtree", nodeId, {})),
    addField: (nodeId, key, type, value) => {
      const field: NodeField = { id: newId("field"), nodeId, key, type, value, updatedAt: Date.now() };
      const next = { ...get(), fields: { ...get().fields, [field.id]: field } };
      commit(next, op("set_field", field.id, { field }));
    },
    updateField: (fieldId, value) => {
      const field = get().fields[fieldId];
      if (!field) return;
      const next = { ...get(), fields: { ...get().fields, [fieldId]: { ...field, value, updatedAt: Date.now() } } };
      commit(next, op("set_field", fieldId, { field: next.fields[fieldId] }));
    },
    addAttachment: async (nodeId, file) => {
      if (file.size > 20 * 1024 * 1024) throw new Error("附件超过 20MB 限制");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const id = newId("attachment");
      let sha256 = "local";
      let localPath: string | null = null;
      if (hasTauriRuntime()) {
        sha256 = await invoke<string>("hash_bytes", { content: Array.from(bytes) });
        localPath = await invoke<string>("save_attachment", { attachmentId: id, content: Array.from(bytes) });
      } else if (globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        sha256 = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
        localPath = URL.createObjectURL(file);
      }
      const attachment: AttachmentRecord = { id, nodeId, name: file.name, mime: file.type || "application/octet-stream", size: file.size, sha256, localPath, remotePath: `workspace/blobs/${sha256}/${id}`, pinned: false, createdAt: Date.now() };
      const next = { ...get(), attachments: { ...get().attachments, [id]: attachment } };
      commit(next, op("add_attachment", id, { attachment }));
      const syntax = attachment.mime.startsWith("image/") ? `![${attachment.name}](attachment://${id})` : `[${attachment.name}](attachment://${id})`;
      const current = get().nodes[nodeId]?.markdown ?? "";
      get().editMarkdown(nodeId, current ? `${current} ${syntax}` : syntax);
    },
  };
});
