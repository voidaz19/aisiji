import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { describe, expect, it } from "vitest";
import { createMarkdownEditorExtensions } from "./markdownEditor";
import { nodeLinkCompletionSource } from "./nodeLinkCompletion";

function nodeNames(markdown: string): string[] {
  const state = EditorState.create({
    doc: markdown,
    extensions: createMarkdownEditorExtensions(),
  });
  const names: string[] = [];
  syntaxTree(state).iterate({ enter: (node) => { names.push(node.type.name); } });
  return names;
}

describe("node Markdown language", () => {
  it("offers node titles and applies stable ids for node links", () => {
    const state = EditorState.create({ doc: "[[" });
    const result = nodeLinkCompletionSource(new CompletionContext(state, 2, true));

    expect(result?.options.length).toBeGreaterThan(0);
    expect(result?.options[0].label).toBeTruthy();
    expect(result?.from).toBe(2);
    expect(result?.options[0].apply).toMatch(/^node:[^\]]+\]\]$/);
  });
  it.each([
    ["**bold**", "StrongEmphasis"],
    ["*italic*", "Emphasis"],
    ["~~strike~~", "Strikethrough"],
    ["==highlight==", "Highlight"],
    ["`code`", "InlineCode"],
    ["# heading", "ATXHeading1"],
    ["#### heading", "ATXHeading4"],
    ["###### heading", "ATXHeading6"],
    ["> quote", "Blockquote"],
    ["---", "HorizontalRule"],
    ["[ ] todo", "NodeTask"],
    ["[x] done", "NodeTask"],
    ["[[node:content-1]]", "NodeLink"],
  ])("parses %s as %s", (source, expected) => {
    expect(nodeNames(source)).toContain(expected);
  });

  it("does not treat escaped, unclosed, or code-contained markers as formatting", () => {
    expect(nodeNames("\\*escaped*")).not.toContain("Emphasis");
    expect(nodeNames("**unclosed")).not.toContain("StrongEmphasis");
    expect(nodeNames("`**code**`")).not.toContain("StrongEmphasis");
  });

  it("keeps an in-progress strike delimiter as text instead of a code fence", () => {
    expect(nodeNames("~~~")).not.toContain("FencedCode");
    expect(nodeNames("~~~")).not.toContain("CodeMark");
    expect(nodeNames("`code`")).toContain("InlineCode");
  });

  it("preserves nested syntax nodes", () => {
    const names = nodeNames("**bold *italic***");
    expect(names).toContain("StrongEmphasis");
    expect(names).toContain("Emphasis");
  });

  it("treats a leading reference-like label as text without disabling inline formatting", () => {
    const names = nodeNames("[1]:note **bold**");
    expect(names).not.toContain("LinkReference");
    expect(names).toContain("StrongEmphasis");
  });

  it("keeps ordinary inline links available for the planned link preview", () => {
    expect(nodeNames("[label](https://example.com)")).toContain("Link");
  });

  it("does not accept malformed or whitespace-containing node links", () => {
    expect(nodeNames("[[node:]]")).not.toContain("NodeLink");
    expect(nodeNames("[[node:has space]]")).not.toContain("NodeLink");
  });
});
