import { invoke } from "@tauri-apps/api/core";
import type { NotebookState, Operation } from "../domain/model";
import { normalizeNotebookState } from "../domain/notebookState";
import { hasTauriRuntime } from "./runtime";

const STORAGE_KEY = "aisiji-notebook-state-v1";
const NATIVE_WRITE_DELAY_MS = 180;

interface NativeOperationPayload {
  operationJson: string;
  opId: string;
  deviceId: string;
  sequence: number;
}

export interface DatabaseMaintenanceReport {
  operationsBefore: number;
  operationsAfter: number;
  compactedOperations: number;
  databaseBytesBefore: number;
  databaseBytesAfter: number;
}

let queuedStateJson: string | null = null;
let queuedOperations: NativeOperationPayload[] = [];
let nativeWriteTimer: ReturnType<typeof setTimeout> | null = null;
let nativeWriteInFlight = false;
let nativeWritePromise: Promise<void> | null = null;

export function readBrowserWorkspace(): NotebookState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeNotebookState(JSON.parse(stored) as Partial<NotebookState>) : null;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: NotebookState, operation?: Operation): void {
  const stateJson = JSON.stringify(normalizeNotebookState(state));
  try {
    localStorage.setItem(STORAGE_KEY, stateJson);
  } catch {
    // Native persistence remains available when browser storage is unavailable.
  }
  if (hasTauriRuntime()) {
    queuedStateJson = stateJson;
    if (operation) queuedOperations.push(nativeOperationPayload(operation));
    scheduleNativeWrite();
  }
}

export async function loadNativeWorkspace(): Promise<NotebookState | null> {
  if (!hasTauriRuntime()) return null;
  const stateJson = await invoke<string | null>("load_workspace");
  return stateJson
    ? normalizeNotebookState(JSON.parse(stateJson) as Partial<NotebookState>)
    : null;
}

export function flushWorkspacePersistence(): void {
  if (!hasTauriRuntime() || nativeWriteInFlight || queuedStateJson === null) return;
  if (nativeWriteTimer !== null) {
    clearTimeout(nativeWriteTimer);
    nativeWriteTimer = null;
  }
  void drainNativeWriteQueue();
}

/** Flushes every queued native snapshot before a destructive follow-up action. */
export async function awaitWorkspacePersistence(): Promise<void> {
  if (!hasTauriRuntime()) return;
  if (nativeWriteTimer !== null) {
    clearTimeout(nativeWriteTimer);
    nativeWriteTimer = null;
  }
  while (nativeWriteInFlight || queuedStateJson !== null) {
    if (nativeWritePromise) await nativeWritePromise;
    else await drainNativeWriteQueue(true);
  }
}

export async function maintainNativeDatabase(): Promise<DatabaseMaintenanceReport | null> {
  if (!hasTauriRuntime()) return null;
  return invoke<DatabaseMaintenanceReport>("maintain_database");
}

function nativeOperationPayload(operation: Operation): NativeOperationPayload {
  return {
    operationJson: JSON.stringify(operation),
    opId: operation.opId,
    deviceId: operation.deviceId,
    sequence: operation.sequence,
  };
}

function scheduleNativeWrite(delay = NATIVE_WRITE_DELAY_MS): void {
  if (nativeWriteTimer !== null || nativeWriteInFlight) return;
  nativeWriteTimer = setTimeout(() => {
    nativeWriteTimer = null;
    void drainNativeWriteQueue();
  }, delay);
}

async function drainNativeWriteQueue(throwOnError = false): Promise<void> {
  if (nativeWritePromise) return nativeWritePromise;
  if (queuedStateJson === null) return;
  const stateJson = queuedStateJson;
  const operations = queuedOperations;
  queuedStateJson = null;
  queuedOperations = [];
  nativeWriteInFlight = true;
  nativeWritePromise = (async () => {
    let retryDelay: number | undefined;
    try {
      await invoke("save_workspace_batch", { stateJson, operations });
    } catch (error) {
      queuedStateJson ??= stateJson;
      queuedOperations = [...operations, ...queuedOperations];
      retryDelay = 1000;
      if (throwOnError) throw error;
    } finally {
      nativeWriteInFlight = false;
      nativeWritePromise = null;
      if (queuedStateJson !== null) scheduleNativeWrite(retryDelay);
    }
  })();
  return nativeWritePromise;
}
