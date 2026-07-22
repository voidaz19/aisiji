import { invoke } from "@tauri-apps/api/core";
import type { Operation } from "../domain/model";

export interface SyncTransport {
  probe(): Promise<string>;
  list(path: string): Promise<string[]>;
  upload(path: string, body: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<Uint8Array>;
}

export interface WebDavCredentials {
  endpoint: string;
  username: string;
  password: string;
}

export interface OperationChunk {
  version: 1;
  deviceId: string;
  firstSequence: number;
  lastSequence: number;
  operations: Operation[];
}

export class NutstoreWebDavTransport implements SyncTransport {
  constructor(private readonly credentials: WebDavCredentials) {}

  async probe(): Promise<string> {
    return invoke<string>("webdav_probe", { ...this.credentials });
  }

  async list(path: string): Promise<string[]> {
    const entries = await invoke<Array<{ href: string }>>("webdav_list", { ...this.credentials, path });
    return entries.map((entry) => entry.href);
  }

  async upload(path: string, body: Uint8Array, contentType: string): Promise<void> {
    await invoke("webdav_upload", { ...this.credentials, path, content: Array.from(body), contentType });
  }

  async download(path: string): Promise<Uint8Array> {
    const content = await invoke<number[]>("webdav_download", { ...this.credentials, path });
    return new Uint8Array(content);
  }
}

export function makeOperationChunk(deviceId: string, operations: Operation[]): OperationChunk {
  const ordered = [...operations].sort((a, b) => a.sequence - b.sequence);
  return {
    version: 1,
    deviceId,
    firstSequence: ordered[0]?.sequence ?? 0,
    lastSequence: ordered[ordered.length - 1]?.sequence ?? 0,
    operations: ordered,
  };
}

export function operationPath(chunk: OperationChunk): string {
  return `workspace/ops/${chunk.deviceId}/${String(chunk.firstSequence).padStart(16, "0")}-${String(chunk.lastSequence).padStart(16, "0")}.json`;
}
