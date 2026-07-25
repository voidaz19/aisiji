import { invoke } from "@tauri-apps/api/core";
import { hasTauriRuntime } from "./runtime";

export interface SyncCredentials {
  endpoint: string;
  username: string;
  password: string;
}

export async function saveSyncCredentials(credentials: SyncCredentials): Promise<void> {
  if (!hasTauriRuntime()) return;
  await invoke("save_sync_credentials", { ...credentials });
}

export async function probeWebDav(credentials: SyncCredentials): Promise<string> {
  if (!hasTauriRuntime()) throw new Error("请在 Tauri 桌面版测试坚果云连接");
  return invoke<string>("webdav_probe", { ...credentials });
}
