import { EditorState, StateField, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";

export const livePreview = StateField.define({
  create: (state) => decorate(state),
  update: (decorations, transaction) => transaction.docChanged || transaction.selection ? decorate(transaction.state) : decorations,
  provide: (field) => EditorView.decorations.from(field),
});

function decorate(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>();
  const text = state.doc.toString();
  const cursor = state.selection.main.head;
  const patterns: Array<[RegExp, string]> = [
    [/\*\*([^*\n]+)\*\*/g, "cm-live-bold"],
    [/~~([^~\n]+)~~/g, "cm-live-strike"],
    [/==([^=\n]+)==/g, "cm-live-highlight"],
    [/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "cm-live-italic"],
  ];
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
  for (const [pattern, className] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const contentStart = start + match[0].indexOf(match[1]);
      const contentEnd = contentStart + match[1].length;
      ranges.push({ from: contentStart, to: contentEnd, decoration: Decoration.mark({ class: className }) });
      if (cursor < start || cursor > start + match[0].length) {
        ranges.push({ from: start, to: contentStart, decoration: Decoration.replace({}) });
        ranges.push({ from: contentEnd, to: start + match[0].length, decoration: Decoration.replace({}) });
      }
    }
  }
  let offset = 0;
  for (const line of text.split("\n")) {
    const start = offset;
    const end = start + line.length;
    if (/^#{1,3}\s/.test(line)) ranges.push({ from: start, to: end, decoration: Decoration.mark({ class: "cm-live-heading" }) });
    if (/^\s*\[[ xX]\]\s/.test(line)) ranges.push({ from: start, to: end, decoration: Decoration.mark({ class: "cm-live-task" }) });
    offset = end + 1;
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let lastEnd = -1;
  for (const range of ranges) {
    if (range.from < lastEnd || range.from === range.to) continue;
    builder.add(range.from, range.to, range.decoration);
    lastEnd = range.to;
  }
  return builder.finish();
}

export const editorTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontFamily: "inherit", fontSize: "14.5px", lineHeight: "1.6", outline: "none", border: "0" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { padding: "0", caretColor: "#4f46e5", fontFamily: "inherit", color: "#191919", lineHeight: "1.6", wordBreak: "break-word", overflowWrap: "anywhere" },
  ".cm-scroller": { overflow: "visible", lineHeight: "1.6", fontFamily: "inherit" },
  ".cm-line": { padding: "0", fontFamily: "inherit" },
  ".cm-gutters": { display: "none" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "#dbe0ff" },
  ".cm-live-bold": { fontWeight: "650" },
  ".cm-live-italic": { fontStyle: "italic" },
  ".cm-live-strike": { textDecoration: "line-through", color: "#9ca3af" },
  ".cm-live-highlight": { backgroundColor: "#fef3c7", borderRadius: "3px" },
  ".cm-live-heading": { fontWeight: "700", fontSize: "1.12em" },
  ".cm-live-task": { color: "#6b7280" },
});
