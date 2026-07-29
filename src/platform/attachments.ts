import { invoke } from "@tauri-apps/api/core";
import { hasTauriRuntime } from "./runtime";

export interface StoredAttachment {
  name: string;
  mime: string;
  size: number;
  sha256: string;
  localPath: string | null;
}

export interface AttachmentPathSource {
  path: string;
}

export async function storeAttachment(source: AttachmentPathSource, attachmentId: string): Promise<StoredAttachment> {
  if (!hasTauriRuntime()) throw new Error("附件导入仅支持桌面应用");
  return invoke<StoredAttachment>("save_attachment_from_path", {
    attachmentId,
    sourcePath: source.path,
  });
}

export async function deleteStoredAttachments(attachmentIds: readonly string[]): Promise<number> {
  if (!attachmentIds.length) return 0;
  if (hasTauriRuntime()) {
    return invoke<number>("delete_attachments", { attachmentIds });
  }
  return 0;
}
