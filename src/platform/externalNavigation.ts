import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { hasTauriRuntime } from "./runtime";

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

export function safeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  // Markdown authors commonly omit the scheme for ordinary web domains.
  // Treat a host-like target as HTTPS, while keeping explicit protocols strict.
  const candidate = /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d+)?(?:[/?#].*)?$/.test(trimmed)
    ? `https://${trimmed}`
    : trimmed;
  try {
    const url = new URL(candidate);
    return EXTERNAL_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function safeRemoteImageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return IMAGE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function localAttachmentPreviewUrl(localPath: string | null): string | null {
  if (!localPath) return null;
  if (hasTauriRuntime()) return convertFileSrc(localPath);
  return localPath.startsWith("blob:") ? localPath : null;
}

export async function openExternalLink(value: string): Promise<boolean> {
  const target = safeExternalUrl(value);
  if (!target) return false;
  if (hasTauriRuntime()) await openUrl(target);
  else window.open(target, "_blank", "noopener,noreferrer");
  return true;
}

export async function openLocalAttachment(localPath: string | null): Promise<boolean> {
  if (!localPath) return false;
  if (hasTauriRuntime()) await openPath(localPath);
  else if (localPath.startsWith("blob:")) window.open(localPath, "_blank", "noopener,noreferrer");
  else return false;
  return true;
}
