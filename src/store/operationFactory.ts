import { newId, type Operation } from "../domain/model";

const DEVICE_KEY = "aisiji-device-id";
let volatileDeviceId: string | null = null;

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = newId("device");
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    volatileDeviceId ??= newId("device");
    return volatileDeviceId;
  }
}

export function createOperation(
  kind: string,
  entityId: string,
  payload: Record<string, unknown>,
  baseRevision = 0,
): Operation {
  const now = Date.now();
  const currentDeviceId = deviceId();
  return {
    opId: newId("op"),
    deviceId: currentDeviceId,
    sequence: now,
    hlc: `${now}-${currentDeviceId}`,
    baseRevision,
    kind,
    entityId,
    payload,
    createdAt: now,
  };
}
