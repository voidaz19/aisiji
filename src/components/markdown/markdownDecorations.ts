import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";
import {
  attachmentIdFromTarget,
  clickableExternalTarget,
  imagePreviewTarget,
  resolveNodeLink,
} from "./markdownInteractions";
import { markdownSourceMode, setMarkdownSourceMode } from "./markdownPreviewState";
import { markdownEditorNodeId } from "./markdownEditorContext";
import {
  attachmentWidget,
  ExternalLinkWidget,
  imageAttachmentWidget,
  ImageWidget,
  NodeLinkWidget,
} from "./markdownWidgets";

const formatClasses: Record<string, string> = {
  StrongEmphasis: "cm-live-bold",
  Emphasis: "cm-live-italic",
  Strikethrough: "cm-live-strike",
  Highlight: "cm-live-highlight",
  InlineCode: "cm-live-code",
  ATXHeading1: "cm-live-heading cm-live-heading-1",
  ATXHeading2: "cm-live-heading cm-live-heading-2",
  ATXHeading3: "cm-live-heading cm-live-heading-3",
  ATXHeading4: "cm-live-heading cm-live-heading-4",
  ATXHeading5: "cm-live-heading cm-live-heading-5",
  ATXHeading6: "cm-live-heading cm-live-heading-6",
  Blockquote: "cm-live-quote",
};

const hiddenMarkerTypes = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "HighlightMark",
  "CodeMark",
  "HeaderMark",
  "QuoteMark",
]);

const boundaryParentTypes = new Set(Object.keys(formatClasses));
boundaryParentTypes.add("HorizontalRule");

interface RevealedBoundary {
  from: number;
  to: number;
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly markerFrom: number,
    private readonly checked: boolean,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return this.markerFrom === other.markerFrom && this.checked === other.checked;
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "cm-live-task-checkbox";
    checkbox.checked = this.checked;
    checkbox.setAttribute("aria-label", this.checked ? "标记为未完成" : "标记为已完成");
    checkbox.addEventListener("mousedown", (event) => event.preventDefault());
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: { from: this.markerFrom + 1, to: this.markerFrom + 2, insert: this.checked ? " " : "x" },
        userEvent: "input",
      });
      view.focus();
    });
    return checkbox;
  }

  ignoreEvent() {
    return false;
  }
}

function markerEndWithSpacing(state: EditorState, name: string, to: number) {
  if (name !== "HeaderMark" && name !== "QuoteMark") return to;
  let end = to;
  while (end < state.doc.length && /[ \t]/.test(state.sliceDoc(end, end + 1))) end += 1;
  return end;
}

function revealedBoundary(state: EditorState, hasFocus: boolean): RevealedBoundary | null {
  const selection = state.selection.main;
  if (!hasFocus) return null;
  const candidates: RevealedBoundary[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (!boundaryParentTypes.has(node.type.name)) return;
      if (selection.from >= node.from && selection.to <= node.to) {
        candidates.push({ from: node.from, to: node.to });
      }
    },
  });
  candidates.sort((left, right) => (left.to - left.from) - (right.to - right.from));
  return candidates[0] ?? null;
}

interface LinkParts {
  label: string;
  labelFrom: number;
  labelTo: number;
  suffixFrom: number;
  target: string;
}

function linkParts(state: EditorState, node: SyntaxNodeRef): LinkParts | null {
  const marks: Array<{ from: number; to: number }> = [];
  let url: { from: number; to: number } | null = null;
  for (let child = node.node.firstChild; child; child = child.nextSibling) {
    if (child.type.name === "LinkMark") marks.push({ from: child.from, to: child.to });
    else if (child.type.name === "URL") url = { from: child.from, to: child.to };
  }
  if (marks.length < 3 || !url) return null;
  return {
    label: state.sliceDoc(marks[0].to, marks[1].from),
    labelFrom: marks[0].to,
    labelTo: marks[1].from,
    suffixFrom: marks[1].from,
    target: state.sliceDoc(url.from, url.to),
  };
}

function revealsNode(boundary: RevealedBoundary | null, from: number, to: number): boolean {
  return Boolean(boundary && boundary.from === from && boundary.to === to);
}

function caretInsideSource(state: EditorState, hasFocus: boolean, from: number, to: number): boolean {
  const selection = state.selection.main;
  return hasFocus && selection.empty && selection.head > from && selection.head < to;
}

interface MarkdownDecorationSets {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
}

export type MarkdownAtomKind = "hidden" | "component";
export interface MarkdownAtomicRange { from: number; to: number; kind: MarkdownAtomKind }

function buildMarkdownDecorationSets(state: EditorState, hasFocus = false, composing = false): MarkdownDecorationSets {
  const ranges: Range<Decoration>[] = [];
  const atomicRanges: Range<Decoration>[] = [];
  const sourceMode = state.field(markdownSourceMode, false) || composing;
  const editorNodeId = state.facet(markdownEditorNodeId);
  const boundary = sourceMode ? null : revealedBoundary(state, hasFocus);
  const replace = (from: number, to: number, decoration: Decoration, kind: MarkdownAtomKind = "component") => {
    ranges.push(decoration.range(from, to));
    atomicRanges.push(Decoration.replace({ markdownAtom: kind }).range(from, to));
  };
  syntaxTree(state).iterate({
    enter(node) {
      const name = node.type.name;
      const className = formatClasses[name];
      if (className) ranges.push(Decoration.mark({ class: className }).range(node.from, node.to));

      const revealThisNode = revealsNode(boundary, node.from, node.to);
      if (name === "HorizontalRule") {
        if (!sourceMode && !revealThisNode) {
          ranges.push(Decoration.mark({
            class: "cm-live-horizontal-rule",
            attributes: { role: "separator", "aria-label": "分隔线" },
          }).range(node.from, node.to));
        }
        return false;
      }
      if (name === "NodeLink") {
        if (!sourceMode && !revealThisNode) {
          const targetNode = node.node.getChild("NodeLinkTarget");
          const target = targetNode ? state.sliceDoc(targetNode.from, targetNode.to) : "";
          const snapshot = resolveNodeLink(target);
          replace(node.from, node.to, Decoration.replace({
            widget: new NodeLinkWidget(target, snapshot.label, snapshot.available),
          }));
        }
        return false;
      }
      if (name === "Image") {
        const parts = linkParts(state, node);
        if (parts && !sourceMode && !revealThisNode) {
          if (attachmentIdFromTarget(parts.target)) {
            const widget = imageAttachmentWidget(parts.target, parts.label, editorNodeId);
            if (widget) {
              replace(node.from, node.to, Decoration.replace({ widget }));
              return false;
            }
          }
          const source = imagePreviewTarget(parts.target);
          if (source) {
            replace(node.from, node.to, Decoration.replace({
              widget: new ImageWidget(parts.target, parts.label, source),
            }));
            return false;
          }
        }
      }
      if (name === "Link") {
        const parts = linkParts(state, node);
        const editingSource = caretInsideSource(state, hasFocus, node.from, node.to);
        if (parts && !sourceMode && !revealThisNode && !editingSource) {
          if (attachmentIdFromTarget(parts.target)) {
            const widget = attachmentWidget(parts.target, parts.label, editorNodeId);
            if (widget) replace(node.from, node.to, Decoration.replace({ widget }));
            return false;
          }
          const target = clickableExternalTarget(parts.target);
          if (target) {
            replace(node.from, node.to, Decoration.replace({
              widget: new ExternalLinkWidget(parts.label, parts.target, target, node.from, node.to),
            }));
            return false;
          }
        }
      }

      if (name === "NodeTask") {
        const checked = /^\[[xX]\]/.test(state.sliceDoc(node.from, Math.min(node.from + 3, node.to)));
        ranges.push(Decoration.mark({ class: checked ? "cm-live-task is-checked" : "cm-live-task" }).range(node.from, node.to));
      }
      if (name === "NodeTaskMark") {
        if (sourceMode) return;
        const checked = /^\[[xX]\]/.test(state.sliceDoc(node.from, node.to));
        // The task grammar requires a separator after `[ ]`/`[x]`. Keep that
        // separator inside the checkbox component so the caret cannot land
        // between the visual checkbox and its task text.
        const separator = state.sliceDoc(node.to, node.to + 1);
        const componentTo = /^[ \t]$/.test(separator) ? node.to + 1 : node.to;
        replace(node.from, componentTo, Decoration.replace({ widget: new TaskCheckboxWidget(node.from, checked) }));
        return;
      }

      if (hiddenMarkerTypes.has(name)) {
        const parent = node.node.parent;
        const revealThisParent = parent && revealsNode(boundary, parent.from, parent.to);
        if (!sourceMode && !revealThisParent) {
          const to = markerEndWithSpacing(state, name, node.to);
          // Formatting markers stay ordinary editable text. Hide them with a
          // regular mark so they never become replacement or atomic ranges.
          ranges.push(Decoration.mark({ class: "cm-live-hidden-mark" }).range(node.from, to));
        }
      }
    },
  });
  return {
    decorations: Decoration.set(ranges, true),
    atomicRanges: Decoration.set(atomicRanges, true),
  };
}

export function buildMarkdownDecorations(state: EditorState, hasFocus = false): DecorationSet {
  return buildMarkdownDecorationSets(state, hasFocus).decorations;
}

export const markdownLivePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;

  constructor(view: EditorView) {
    const sets = buildMarkdownDecorationSets(view.state, view.hasFocus, view.composing);
    this.decorations = sets.decorations;
    this.atomicRanges = sets.atomicRanges;
  }

  update(update: ViewUpdate) {
    const sourceModeChanged = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(setMarkdownSourceMode)));
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged || sourceModeChanged) {
      const sets = buildMarkdownDecorationSets(update.state, update.view.hasFocus, update.view.composing);
      this.decorations = sets.decorations;
      this.atomicRanges = sets.atomicRanges;
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

export const markdownAtomicRanges = EditorView.atomicRanges.of((view) =>
  view.plugin(markdownLivePreview)?.atomicRanges ?? Decoration.none,
);

export function markdownAtomsAt(
  view: EditorView,
  position: number,
  side: "from" | "to",
): MarkdownAtomicRange[] {
  const matches: MarkdownAtomicRange[] = [];
  for (const source of view.state.facet(EditorView.atomicRanges)) {
    source(view).between(0, view.state.doc.length, (from, to, value) => {
      if ((side === "from" ? from : to) !== position) return;
      const kind = value.spec.markdownAtom as MarkdownAtomKind | undefined;
      if (kind) matches.push({ from, to, kind });
    });
  }
  return matches;
}

export function atMarkdownVisualStart(view: EditorView, position: number): boolean {
  if (position === 0) return true;
  let current = position;
  const visited = new Set<number>();
  while (!visited.has(current)) {
    visited.add(current);
    const previous = markdownAtomsAt(view, current, "to")
      .find((range) => range.kind === "hidden" && range.from < current);
    if (!previous) break;
    current = previous.from;
  }
  return current === 0;
}

export function atMarkdownVisualEnd(view: EditorView, position: number): boolean {
  if (position === view.state.doc.length) return true;
  if (position === 0) return false;
  let current = position;
  const visited = new Set<number>();
  while (!visited.has(current)) {
    visited.add(current);
    const next = markdownAtomsAt(view, current, "from")
      .find((range) => range.kind === "hidden" && range.to > current);
    if (!next) break;
    current = next.to;
  }
  return current === view.state.doc.length;
}
