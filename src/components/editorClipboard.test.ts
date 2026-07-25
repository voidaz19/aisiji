import { describe, expect, it } from "vitest";
import { planMultilinePaste } from "./editorClipboard";

describe("planMultilinePaste", () => {
  it("preserves surrounding text, blank lines, whitespace, and line order", () => {
    const markdown = "left SELECT right";
    const from = markdown.indexOf("SELECT");
    const to = from + "SELECT".length;

    expect(planMultilinePaste(markdown, from, to, "one\r\n\r\n  three  ")).toEqual({
      currentMarkdown: "left one",
      followingMarkdown: ["", "  three   right"],
    });
  });

  it("lets CodeMirror handle ordinary single-line paste", () => {
    expect(planMultilinePaste("before", 6, 6, " after")).toBeNull();
  });
});
