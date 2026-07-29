import { beforeEach, describe, expect, it } from "vitest";
import { isAttachmentPreviewCollapsed, setAttachmentPreviewCollapsed } from "./attachmentPreviewPreferences";

beforeEach(() => localStorage.clear());

describe("attachment preview preferences", () => {
  it("stores collapse state by node and attachment on the current device", () => {
    setAttachmentPreviewCollapsed("node-a", "file", true);

    expect(isAttachmentPreviewCollapsed("node-a", "file")).toBe(true);
    expect(isAttachmentPreviewCollapsed("node-b", "file")).toBe(false);

    setAttachmentPreviewCollapsed("node-a", "file", false);
    expect(isAttachmentPreviewCollapsed("node-a", "file")).toBe(false);
  });

  it("recovers from malformed device storage", () => {
    localStorage.setItem("aisiji-attachment-preview-collapsed-v1", "not-json");
    expect(isAttachmentPreviewCollapsed("node", "file")).toBe(false);
  });
});
