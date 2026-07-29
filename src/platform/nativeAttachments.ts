import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { hasTauriRuntime } from "./runtime";

export type NativeFileDropHandler = (event: DragDropEvent) => void;

export async function chooseAttachmentPaths(): Promise<readonly string[]> {
  if (!hasTauriRuntime()) throw new Error("附件导入仅支持桌面应用");
  const selected = await open({ title: "插入文件", multiple: true, directory: false });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function listenNativeFileDrop(handler: NativeFileDropHandler): Promise<() => void> {
  if (!hasTauriRuntime()) return () => {};
  return getCurrentWebview().onDragDropEvent(({ payload }) => handler(payload));
}
