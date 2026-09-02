export const ROOT_ID = "root";

export type NodeKind = "root" | "content" | "date";

export type FieldType = "text" | "number" | "date" | "boolean" | "node";

export interface NodeRecord {
  id: string;
  kind: NodeKind;
  parentId: string | null;
  sortKey: number;
  markdown: string;
  dateKey: string | null;
  deletedAt: number | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  /** Optional capabilities attached to the node without changing its tree identity. */
  supertagIds?: string[];
}

export interface NodeField {
  id: string;
  nodeId: string;
  key: string;
  type: FieldType;
  value: string;
  updatedAt: number;
}

export interface AttachmentRecord {
  id: string;
  nodeId: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  localPath: string | null;
  remotePath: string;
  pinned: boolean;
  createdAt: number;
}

export interface NotebookState {
  nodes: Record<string, NodeRecord>;
  fields: Record<string, NodeField>;
  attachments: Record<string, AttachmentRecord>;
  collapsed: Record<string, boolean>;
  /** Last edit time keyed by the page (active root) where the edit occurred. */
  recentPageEdits: Record<string, number>;
}

export interface Operation {
  opId: string;
  deviceId: string;
  sequence: number;
  hlc: string;
  baseRevision: number;
  kind: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export function newId(prefix = "node"): string {
  const uuid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function createEmptyState(): NotebookState {
  const rootNode: NodeRecord = {
    id: ROOT_ID,
    kind: "root",
    parentId: null,
    sortKey: 0,
    markdown: "",
    dateKey: null,
    deletedAt: null,
    revision: 1,
    createdAt: 0,
    updatedAt: 0,
  };
  return { nodes: { [ROOT_ID]: rootNode }, fields: {}, attachments: {}, collapsed: {}, recentPageEdits: {} };
}

export function cloneState(state: NotebookState): NotebookState {
  return {
    nodes: { ...state.nodes },
    fields: { ...state.fields },
    attachments: { ...state.attachments },
    collapsed: { ...state.collapsed },
    recentPageEdits: { ...state.recentPageEdits },
  };
}
