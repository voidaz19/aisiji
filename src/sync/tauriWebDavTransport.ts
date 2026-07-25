import { invoke } from "@tauri-apps/api/core";
import type { SyncTransport } from "./protocol";

export interface WebDavCredentials {
  endpoint: string;
  username: string;
  password: string;
}

export class TauriWebDavTransport implements SyncTransport {
  constructor(private readonly credentials: WebDavCredentials) {}

  probe(): Promise<string> {
    return invoke<string>("webdav_probe", { ...this.credentials });
  }

  async list(path: string): Promise<string[]> {
    const entries = await invoke<Array<{ href: string }>>("webdav_list", { ...this.credentials, path });
    return entries.map((entry) => entry.href);
  }

  async upload(path: string, body: Uint8Array, contentType: string): Promise<void> {
    await invoke("webdav_upload", {
      ...this.credentials,
      path,
      content: Array.from(body),
      contentType,
    });
  }

  async download(path: string): Promise<Uint8Array> {
    const content = await invoke<number[]>("webdav_download", { ...this.credentials, path });
    return new Uint8Array(content);
  }
}
