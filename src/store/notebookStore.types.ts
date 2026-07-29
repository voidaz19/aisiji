import type { EmptyNodeTarget } from "../domain/emptyDrop";
import type { AttachmentRecord, FieldType, NotebookState, Operation } from "../domain/model";
import type { AttachmentPathSource } from "../platform/attachments";

export interface NotebookStore extends NotebookState {
  activeRootId: string;
  activeNodeId: string | null;
  /** Cursor position hint consumed once when an editor gains focus via activeNodeId. */
  activeNodeCursor: number | "end" | null;
  /** Parent id of the single ghost editor that should receive keyboard focus. */
  activeGhostParentId: string | null;
  rootHistory: string[];
  query: string;
  lastSync: "idle" | "syncing" | "error";
  pendingOperations: Operation[];
  /** UI-only suppression for the transient child ghost after deleting an empty child. */
  ghostSuppressed: Record<string, boolean>;
  initialize: () => void;
  setQuery: (query: string) => void;
  setActiveNode: (nodeId: string | null) => void;
  focusNode: (nodeId: string, cursor?: number | "end") => void;
  focusGhost: (parentId: string) => void;
  mergeWithPrev: (nodeId: string) => void;
  mergeWithNext: (nodeId: string) => void;
  enterNode: (nodeId: string) => void;
  goBack: () => void;
  ensureTodayNode: () => string;
  openRoot: (nodeId: string) => void;
  goToRoot: () => void;
  toggleNode: (nodeId: string) => void;
  toggleChildren: (parentId: string) => void;
  createSibling: (nodeId: string | null, markdown?: string) => string | null;
  splitNode: (nodeId: string, before: string, after: string) => string | null;
  createChild: (parentId: string, markdown?: string) => string | null;
  editMarkdown: (nodeId: string, markdown: string) => void;
  indent: (nodeId: string) => void;
  outdent: (nodeId: string) => void;
  moveToSlot: (nodeId: string, parentId: string, beforeId: string | null) => void;
  moveToEmptyNode: (nodeId: string, target: EmptyNodeTarget) => void;
  remove: (nodeId: string) => void;
  removeNodes: (nodeIds: string[], focusKey?: string | null) => void;
  restore: (nodeId: string) => void;
  emptyTrash: () => Promise<{ purgedNodes: number; purgedAttachments: number }>;
  maintainStorage: () => Promise<number>;
  addField: (nodeId: string, key: string, type: FieldType, value: string) => void;
  updateField: (fieldId: string, value: string) => void;
  addAttachment: (nodeId: string, source: AttachmentPathSource) => Promise<AttachmentRecord>;
  hydrate: () => Promise<void>;
}
