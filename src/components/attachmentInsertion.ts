import type { AttachmentRecord } from "../domain/model";

export interface AttachmentInsertionPlan {
  from: number;
  to: number;
  insert: string;
  anchor: number;
}

function escapeLabel(label: string): string {
  return label.replace(/[\\[\]]/g, "\\$&");
}

export function attachmentMarkdown(attachment: Pick<AttachmentRecord, "id" | "name" | "mime">): string {
  const label = escapeLabel(attachment.name);
  return attachment.mime.startsWith("image/")
    ? `![${label}](attachment://${attachment.id})`
    : `[${label}](attachment://${attachment.id})`;
}

export function planAttachmentInsertion(
  markdown: string,
  selectionFrom: number,
  selectionTo: number,
  attachments: readonly Pick<AttachmentRecord, "id" | "name" | "mime">[],
): AttachmentInsertionPlan | null {
  if (!attachments.length) return null;
  const from = Math.max(0, Math.min(selectionFrom, markdown.length));
  const to = Math.max(from, Math.min(selectionTo, markdown.length));
  const before = from > 0 && !/\s$/.test(markdown.slice(0, from)) ? " " : "";
  const after = to < markdown.length && !/^\s/.test(markdown.slice(to)) ? " " : "";
  const syntax = attachments.map(attachmentMarkdown).join(" ");
  const insert = `${before}${syntax}${after}`;
  return { from, to, insert, anchor: from + insert.length };
}
