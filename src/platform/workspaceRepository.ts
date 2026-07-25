import { invoke } from "@tauri-apps/api/core";
import type { NotebookState, Operation } from "../domain/model";
import { normalizeNotebookState } from "../domain/notebookState";
import { hasTauriRuntime } from "./runtime";

const STORAGE_KEY = "aisiji-notebook-state-v1";

export function readBrowserWorkspace(): NotebookState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeNotebookState(JSON.parse(stored) as Partial<NotebookState>) : null;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: NotebookState): void {
  const stateJson = JSON.stringify(normalizeNotebookState(state));
  try {
    localStorage.setItem(STORAGE_KEY, stateJson);
  } catch {
    // Native persistence remains available when browser storage is unavailable.
  }
  if (hasTauriRuntime()) {
    void invoke("save_workspace", { stateJson }).catch(() => undefined);
  }
}

export async function loadNativeWorkspace(): Promise<NotebookState | null> {
  if (!hasTauriRuntime()) return null;
  const stateJson = await invoke<string | null>("load_workspace");
  return stateJson
    ? normalizeNotebookState(JSON.parse(stateJson) as Partial<NotebookState>)
    : null;
}

export function appendNativeOperation(operation: Operation): void {
  if (!hasTauriRuntime()) return;
  void invoke("append_operation", {
    operationJson: JSON.stringify(operation),
    opId: operation.opId,
    deviceId: operation.deviceId,
    sequence: operation.sequence,
  }).catch(() => undefined);
}
