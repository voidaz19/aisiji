import { invoke } from "@tauri-apps/api/core";
import { hasTauriRuntime } from "./runtime";

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export interface StoredAttachment {
  sha256: string;
  localPath: string | null;
}

export async function storeAttachment(file: File, attachmentId: string): Promise<StoredAttachment> {
  if (file.size > MAX_ATTACHMENT_SIZE) throw new Error("附件超过 20MB 限制");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (hasTauriRuntime()) {
    const content = Array.from(bytes);
    const sha256 = await invoke<string>("hash_bytes", { content });
    const localPath = await invoke<string>("save_attachment", { attachmentId, content });
    return { sha256, localPath };
  }
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return { sha256, localPath: URL.createObjectURL(file) };
  }
  return { sha256: "local", localPath: URL.createObjectURL(file) };
}

export async function deleteStoredAttachments(attachmentIds: readonly string[]): Promise<number> {
  if (!attachmentIds.length) return 0;
  if (hasTauriRuntime()) {
    return invoke<number>("delete_attachments", { attachmentIds });
  }
  return 0;
}
