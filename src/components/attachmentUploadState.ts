import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

interface PendingAttachmentUpload {
  id: string;
  from: number;
  to: number;
  label: string;
}

const addPendingAttachmentUpload = StateEffect.define<PendingAttachmentUpload>({
  map: (value, changes) => ({
    ...value,
    from: changes.mapPos(value.from, -1),
    to: changes.mapPos(value.to, 1),
  }),
});
const removePendingAttachmentUpload = StateEffect.define<string>();
const requestAttachmentInsertion = StateEffect.define<readonly string[]>();

class PendingAttachmentWidget extends WidgetType {
  constructor(private readonly label: string) { super(); }

  eq(other: PendingAttachmentWidget): boolean {
    return this.label === other.label;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-pending-attachment";
    element.setAttribute("data-attachment-control", "true");
    element.setAttribute("aria-live", "polite");
    element.textContent = this.label;
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function decorations(pending: ReadonlyMap<string, PendingAttachmentUpload>): DecorationSet {
  return Decoration.set(
    [...pending.values()]
      .sort((left, right) => left.to - right.to)
      .map((upload) => Decoration.widget({
        widget: new PendingAttachmentWidget(upload.label),
        side: 1,
      }).range(upload.to)),
  );
}

export const pendingAttachmentUploads = StateField.define<ReadonlyMap<string, PendingAttachmentUpload>>({
  create: () => new Map(),
  update: (current, transaction) => {
    const next = new Map<string, PendingAttachmentUpload>();
    for (const [id, upload] of current) {
      next.set(id, {
        ...upload,
        from: transaction.changes.mapPos(upload.from, -1),
        to: transaction.changes.mapPos(upload.to, 1),
      });
    }
    for (const effect of transaction.effects) {
      if (effect.is(addPendingAttachmentUpload)) next.set(effect.value.id, effect.value);
      if (effect.is(removePendingAttachmentUpload)) next.delete(effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field, decorations),
});

export const pendingAttachmentUploadExtension: Extension = pendingAttachmentUploads;

export function attachmentInsertionRequestExtension(
  onRequest: (paths: readonly string[], view: EditorView) => void,
): Extension {
  return EditorView.updateListener.of((update) => {
    for (const transaction of update.transactions) {
      for (const effect of transaction.effects) {
        if (!effect.is(requestAttachmentInsertion)) continue;
        const paths = effect.value;
        queueMicrotask(() => onRequest(paths, update.view));
      }
    }
  });
}

export function requestAttachmentInsertionEffect(paths: readonly string[]): StateEffect<readonly string[]> {
  return requestAttachmentInsertion.of(paths);
}

export function beginPendingAttachmentUpload(
  view: EditorView,
  id: string,
  from: number,
  to: number,
  fileCount: number,
): void {
  view.dispatch({
    effects: addPendingAttachmentUpload.of({
      id,
      from,
      to,
      label: fileCount === 1 ? "正在添加文件..." : `正在添加 ${fileCount} 个文件...`,
    }),
  });
}

export function pendingAttachmentUploadRange(
  view: EditorView,
  id: string,
): { from: number; to: number } | null {
  const upload = view.state.field(pendingAttachmentUploads, false)?.get(id);
  return upload ? { from: upload.from, to: upload.to } : null;
}

export function finishPendingAttachmentUpload(id: string): StateEffect<string> {
  return removePendingAttachmentUpload.of(id);
}
