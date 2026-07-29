import { describe, expect, it } from "vitest";
import { attachmentPreviewKind } from "./attachmentPreview";

describe("attachment preview classification", () => {
  it.each([
    ["audio/mpeg", "voice.mp3", "audio"],
    ["application/octet-stream", "voice.FLAC", "audio"],
    ["video/mp4", "clip.mp4", "video"],
    ["application/octet-stream", "clip.webm", "video"],
    ["application/pdf", "manual.bin", "pdf"],
    ["application/octet-stream", "manual.PDF", "pdf"],
    ["text/plain; charset=utf-8", "notes.txt", "text"],
    ["application/json", "data.json", "text"],
    ["application/octet-stream", "source.ts", "text"],
    ["application/zip", "archive.zip", "file"],
  ])("classifies %s / %s as %s", (mime, name, expected) => {
    expect(attachmentPreviewKind(mime, name)).toBe(expected);
  });
});
