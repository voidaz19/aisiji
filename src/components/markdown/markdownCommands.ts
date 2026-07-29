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

function toggleBlockPrefix(prefix: string, pattern: RegExp): StateCommand {
  return ({ state, dispatch }) => {
    const current = state.doc.toString();
    const match = current.match(pattern);
    const removedLength = match?.[0].length ?? 0;
    const addedLength = match ? 0 : prefix.length;
    const changes = match
      ? { from: 0, to: removedLength, insert: "" }
      : { from: 0, insert: prefix };
    const mapPosition = (position: number) => match
      ? Math.max(0, position - removedLength)
      : position + addedLength;
    const selection = EditorSelection.create(state.selection.ranges.map((range) =>
      EditorSelection.range(mapPosition(range.anchor), mapPosition(range.head))));
    dispatch(state.update({ changes, selection, scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export const toggleHeading = toggleBlockPrefix("# ", /^#{1,6}\s+/);
export const toggleQuote = toggleBlockPrefix("> ", /^>\s+/);
export const toggleTask = toggleBlockPrefix("[ ] ", /^\[[ xX]\]\s+/);

export function insertMarkdownText(text: string): StateCommand {
  return ({ state, dispatch }) => {
    const transaction = state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: text },
      range: EditorSelection.cursor(range.from + text.length),
    }));
    dispatch(state.update(transaction, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}
