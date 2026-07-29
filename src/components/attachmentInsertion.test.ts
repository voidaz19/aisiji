import { describe, expect, it } from "vitest";
import { attachmentMarkdown, planAttachmentInsertion } from "./attachmentInsertion";

const image = { id: "image", name: "preview.png", mime: "image/png" };
const pdf = { id: "pdf", name: "guide.pdf", mime: "application/pdf" };

describe("attachment insertion", () => {
  it("uses image syntax only for image attachments and escapes labels", () => {
    expect(attachmentMarkdown(image)).toBe("![preview.png](attachment://image)");
    expect(attachmentMarkdown({ id: "file", name: "a[b].txt", mime: "text/plain" }))
      .toBe("[a\\[b\\].txt](attachment://file)");
  });

  it("replaces the selection and preserves ordered attachment spacing", () => {
    expect(planAttachmentInsertion("left OLD right", 5, 8, [image, pdf])).toEqual({
      from: 5,
      to: 8,
      insert: "![preview.png](attachment://image) [guide.pdf](attachment://pdf)",
      anchor: 69,
    });
  });

  it("does not add unnecessary spaces at document boundaries", () => {
    expect(planAttachmentInsertion("", 0, 0, [pdf])).toEqual({
      from: 0,
      to: 0,
      insert: "[guide.pdf](attachment://pdf)",
      anchor: 29,
    });
  });
});
