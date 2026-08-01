import type { EditorView } from "@codemirror/view";

/**
 * The editor can point at a persisted node or at a transient insertion draft.
 * Commands should use this target instead of branching on GhostEditor.
 */
export interface EditorTarget {
  kind: "node" | "draft";
  nodeId: string | null;
  parentId: string;
  materialize: (markdown: string) => string | null;
}

export type PersistedEditorResolver = (nodeId: string) => EditorView | null;

/** Resolves the stable node identity required by data-backed commands. */
export function ensureEditorNodeId(target: EditorTarget, editor: EditorView): string | null {
  if (target.nodeId) return target.nodeId;
  if (target.kind !== "draft") return null;
  const nodeId = target.materialize(editor.state.doc.toString());
  if (nodeId) target.nodeId = nodeId;
  return nodeId;
}

/** Runs a command against a stable node, materializing each draft submission once. */
export function runWithEditorNode(
  target: EditorTarget,
  editor: EditorView,
  command: (nodeId: string) => boolean,
): boolean {
  // A draft identity is only valid while its persisted row is taking over.
  // Repeated keys during that short handoff must not target the old node.
  if (target.kind === "draft" && target.nodeId !== null) return true;
  const materializesDraft = target.kind === "draft" && target.nodeId === null;
  const nodeId = ensureEditorNodeId(target, editor);
  if (!nodeId) return false;
  if (!materializesDraft) return command(nodeId);

  // Materialization replaces the placeholder row with a persisted row. Let
  // React commit that handoff and the tree animation hook capture the new
  // stable key before applying a structural command against the real node.
  runAfterDraftHandoff(() => {
    try {
      command(nodeId);
    } finally {
      // A placeholder editor can remain mounted after its previous draft was
      // inserted elsewhere in the tree. Release that submission identity so
      // the same insertion point can materialize the next draft.
      if (target.kind === "draft" && target.nodeId === nodeId) target.nodeId = null;
    }
  });
  return true;
}

/**
 * Runs an editor-backed command on the persisted editor that owns the target.
 * Callers provide the resolver so this lifecycle module stays independent from
 * DOM structure and feature-specific commands.
 */
export async function runWithPersistedEditor(
  target: EditorTarget,
  editor: EditorView,
  resolveEditor: PersistedEditorResolver,
  command: (nodeId: string, persistedEditor: EditorView) => boolean,
): Promise<boolean> {
  if (target.kind === "draft" && target.nodeId !== null) return false;
  const materializesDraft = target.kind === "draft" && target.nodeId === null;
  const nodeId = ensureEditorNodeId(target, editor);
  if (!nodeId) return false;
  if (!materializesDraft) return command(nodeId, editor);

  try {
    const persistedEditor = await resolveAfterDraftHandoff(nodeId, resolveEditor);
    return persistedEditor ? command(nodeId, persistedEditor) : false;
  } finally {
    if (target.kind === "draft" && target.nodeId === nodeId) target.nodeId = null;
  }
}

function runAfterDraftHandoff(command: () => void): void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => window.requestAnimationFrame(command));
    return;
  }
  queueMicrotask(() => queueMicrotask(command));
}

async function resolveAfterDraftHandoff(
  nodeId: string,
  resolveEditor: PersistedEditorResolver,
): Promise<EditorView | null> {
  await nextAnimationFrame();
  await nextAnimationFrame();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const editor = resolveEditor(nodeId);
    if (editor) return editor;
    await nextAnimationFrame();
  }
  return null;
}

function nextAnimationFrame(): Promise<void> {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => queueMicrotask(resolve));
}
