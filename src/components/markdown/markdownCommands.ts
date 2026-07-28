import { EditorSelection, type StateCommand } from "@codemirror/state";

/** Toggle an inline Markdown delimiter around every current selection. */
export function toggleMarkdownMark(mark: string): StateCommand {
  return ({ state, dispatch }) => {
    const markLength = mark.length;
    const transaction = state.changeByRange((range) => {
      const selected = state.sliceDoc(range.from, range.to);
      const selectedIncludesMarks = !range.empty
        && selected.startsWith(mark)
        && selected.endsWith(mark)
        && selected.length >= markLength * 2;
      if (selectedIncludesMarks) {
        const inner = selected.slice(markLength, -markLength);
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        };
      }

      const surrounded = range.from >= markLength
        && state.sliceDoc(range.from - markLength, range.from) === mark
        && state.sliceDoc(range.to, range.to + markLength) === mark;
      if (surrounded) {
        return {
          changes: [
            { from: range.from - markLength, to: range.from },
            { from: range.to, to: range.to + markLength },
          ],
          range: range.empty
            ? EditorSelection.cursor(range.from - markLength)
            : EditorSelection.range(range.from - markLength, range.to - markLength),
        };
      }

      if (range.empty) {
        return {
          changes: { from: range.from, insert: mark + mark },
          range: EditorSelection.cursor(range.from + markLength),
        };
      }

      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark },
        ],
        range: EditorSelection.range(range.from + markLength, range.to + markLength),
      };
    });
    dispatch(state.update(transaction, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export const toggleBold = toggleMarkdownMark("**");
export const toggleItalic = toggleMarkdownMark("*");
export const toggleStrikethrough = toggleMarkdownMark("~~");
export const toggleHighlight = toggleMarkdownMark("==");
export const toggleInlineCode = toggleMarkdownMark("`");
