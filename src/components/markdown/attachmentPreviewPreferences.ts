const STORAGE_KEY = "aisiji-attachment-preview-collapsed-v1";

function preferenceKey(nodeId: string, attachmentId: string): string {
  return `${nodeId}:${attachmentId}`;
}

function readCollapsedKeys(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function isAttachmentPreviewCollapsed(nodeId: string, attachmentId: string): boolean {
  return readCollapsedKeys().has(preferenceKey(nodeId, attachmentId));
}

export function setAttachmentPreviewCollapsed(
  nodeId: string,
  attachmentId: string,
  collapsed: boolean,
): void {
  const keys = readCollapsedKeys();
  const key = preferenceKey(nodeId, attachmentId);
  if (collapsed) keys.add(key);
  else keys.delete(key);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys].sort()));
  } catch {
    // Preview state is a best-effort device preference.
  }
}
