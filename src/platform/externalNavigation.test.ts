import { describe, expect, it } from "vitest";
import {
  localAttachmentPreviewUrl,
  safeExternalUrl,
  safeRemoteImageUrl,
} from "./externalNavigation";

describe("external navigation safety", () => {
  it("allows only configured external protocols", () => {
    expect(safeExternalUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(safeExternalUrl("bilibili.com")).toBe("https://bilibili.com/");
    expect(safeExternalUrl("www.bilibili.com/video/BV1")).toBe("https://www.bilibili.com/video/BV1");
    expect(safeExternalUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("file:///secret.txt")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("javascript:example.com")).toBeNull();
  });

  it("allows remote images only over HTTP or HTTPS", () => {
    expect(safeRemoteImageUrl("https://example.com/image.png")).toBe("https://example.com/image.png");
    expect(safeRemoteImageUrl("mailto:test@example.com")).toBeNull();
    expect(safeRemoteImageUrl("data:image/png;base64,AAAA")).toBeNull();
  });

  it("uses only browser-created blob URLs outside Tauri", () => {
    expect(localAttachmentPreviewUrl("blob:preview")).toBe("blob:preview");
    expect(localAttachmentPreviewUrl("C:\\secret.txt")).toBeNull();
    expect(localAttachmentPreviewUrl(null)).toBeNull();
  });
});
