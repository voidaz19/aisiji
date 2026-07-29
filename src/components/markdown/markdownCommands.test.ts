import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  toggleBold,
  toggleHighlight,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleQuote,
  toggleStrikethrough,
  toggleTask,
  insertMarkdownText,
} from "./markdownCommands";

type MarkdownCommand = typeof toggleBold;

function runCommand(
  doc: string,
  selection: { anchor: number; head?: number },
  command: MarkdownCommand,
) {
  let state = EditorState.create({ doc, selection });
  command({
    state,
    dispatch: (transaction) => { state = transaction.state; },
  });
  return state;
}

describe("Markdown formatting commands", () => {
  it.each([
    [toggleBold, "**text**"],
    [toggleItalic, "*text*"],
    [toggleStrikethrough, "~~text~~"],
    [toggleHighlight, "==text=="],
    [toggleInlineCode, "`text`"],
  ])("wraps selected text with the requested mark", (command, expected) => {
    const state = runCommand("text", { anchor: 0, head: 4 }, command);
    expect(state.doc.toString()).toBe(expected);
    expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe("text");
  });

  it("removes a surrounding mark while preserving the text selection", () => {
    const state = runCommand("**text**", { anchor: 2, head: 6 }, toggleBold);
    expect(state.doc.toString()).toBe("text");
    expect(state.selection.main).toEqual(EditorSelection.range(0, 4));
  });

  it("inserts an empty pair and places the caret between the marks", () => {
    const state = runCommand("ab", { anchor: 1 }, toggleHighlight);
    expect(state.doc.toString()).toBe("a====b");
    expect(state.selection.main.head).toBe(3);
  });

  it("removes an empty pair around the caret", () => {
    const state = runCommand("a====b", { anchor: 3 }, toggleHighlight);
    expect(state.doc.toString()).toBe("ab");
    expect(state.selection.main.head).toBe(1);
  });

  it.each([
    [toggleHeading, "# text", "text"],
    [toggleQuote, "> text", "text"],
    [toggleTask, "[x] text", "text"],
  ])("toggles a node-level Markdown prefix", (command, prefixed, plain) => {
    const added = runCommand(plain, { anchor: plain.length }, command);
    expect(added.doc.toString()).toBe(
      command === toggleHeading ? "# text" : command === toggleQuote ? "> text" : "[ ] text",
    );
    expect(added.selection.main.head).toBe(added.doc.length);

    const removed = runCommand(prefixed, { anchor: prefixed.length }, command);
    expect(removed.doc.toString()).toBe(plain);
    expect(removed.selection.main.head).toBe(plain.length);
  });

  it("preserves a text selection while mapping it across a block prefix", () => {
    const added = runCommand("text", { anchor: 1, head: 3 }, toggleQuote);
    expect(added.selection.main).toEqual(EditorSelection.range(3, 5));

    const removed = runCommand("> text", { anchor: 3, head: 5 }, toggleQuote);
    expect(removed.selection.main).toEqual(EditorSelection.range(1, 3));
  });

  it("replaces the current selection with inserted Markdown text", () => {
    const state = runCommand("left old right", { anchor: 5, head: 8 }, insertMarkdownText("[["));
    expect(state.doc.toString()).toBe("left [[ right");
    expect(state.selection.main.head).toBe(7);
  });
});
