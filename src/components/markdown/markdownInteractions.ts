import type { AttachmentRecord } from "../../domain/model";
import {
  localAttachmentPreviewUrl,
  openExternalLink,
  openLocalAttachment,
  safeExternalUrl,
  safeRemoteImageUrl,
} from "../../platform/externalNavigation";
import { useNotebookStore } from "../../store/useNotebookStore";

export interface NodeLinkSnapshot {
  id: string;
  label: string;
  available: boolean;
}

export interface AttachmentSnapshot {
  id: string;
  label: string;
  mime: string;
  previewUrl: string | null;
  available: boolean;
}

export function nodeIdFromTarget(target: string): string | null {
  return target.startsWith("node:") && /^node:[A-Za-z0-9._-]+$/.test(target)
    ? target.slice(5)
    : null;
}

export function attachmentIdFromTarget(target: string): string | null {
  if (!target.startsWith("attachment://")) return null;
  const id = target.slice("attachment://".length);
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}

export function resolveNodeLink(target: string): NodeLinkSnapshot {
  const id = nodeIdFromTarget(target) ?? "";
  const node = id ? useNotebookStore.getState().nodes[id] : undefined;
  const available = Boolean(node && !node.deletedAt && node.kind !== "root");
  return {
    id,
    label: available ? (node!.kind === "date" ? node!.dateKey ?? "日期节点" : node!.markdown.trim() || "未命名节点") : target,
    available,
  };
}

export function followNodeLink(target: string): boolean {
  const snapshot = resolveNodeLink(target);
  if (!snapshot.available) return false;
  useNotebookStore.getState().openRoot(snapshot.id);
  return true;
}

export function resolveAttachment(target: string, fallbackLabel: string): AttachmentSnapshot | null {
  const id = attachmentIdFromTarget(target);
  if (!id) return null;
  const attachment: AttachmentRecord | undefined = useNotebookStore.getState().attachments[id];
  return {
    id,
    label: attachment?.name || fallbackLabel || id,
    mime: attachment?.mime ?? "",
    previewUrl: localAttachmentPreviewUrl(attachment?.localPath ?? null),
    available: Boolean(attachment?.localPath),
  };
}

export async function followMarkdownTarget(target: string): Promise<boolean> {
  const attachmentId = attachmentIdFromTarget(target);
  if (attachmentId) {
    const attachment = useNotebookStore.getState().attachments[attachmentId];
    return openLocalAttachment(attachment?.localPath ?? null);
  }
  return openExternalLink(target);
}

export function clickableExternalTarget(target: string): string | null {
  return safeExternalUrl(target);
}

export function imagePreviewTarget(target: string): string | null {
  const attachment = resolveAttachment(target, "");
  return attachment
    ? (attachment.mime.startsWith("image/") ? attachment.previewUrl : null)
    : safeRemoteImageUrl(target);
}
