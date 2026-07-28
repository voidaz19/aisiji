import type { BlockContext, InlineContext, LeafBlock, MarkdownConfig } from "@lezer/markdown";
import { Strikethrough } from "@lezer/markdown";

const highlightDelimiter = { resolve: "Highlight", mark: "HighlightMark" };

const Highlight: MarkdownConfig = {
  defineNodes: ["Highlight", "HighlightMark"],
  parseInline: [{
    name: "Highlight",
    after: "Emphasis",
    parse(context: InlineContext, next: number, position: number) {
      if (next !== 61 || context.char(position + 1) !== 61 || context.char(position + 2) === 61) {
        return -1;
      }
      const before = context.slice(position - 1, position);
      const after = context.slice(position + 2, position + 3);
      return context.addDelimiter(
        highlightDelimiter,
        position,
        position + 2,
        !/\s|^$/.test(after),
        !/\s|^$/.test(before),
      );
    },
  }],
};

class NodeTaskParser {
  nextLine() {
    return true;
  }

  finish(context: BlockContext, leaf: LeafBlock) {
    context.addLeafElement(leaf, context.elt("NodeTask", leaf.start, leaf.start + leaf.content.length, [
      context.elt("NodeTaskMark", leaf.start, leaf.start + 3),
      ...context.parser.parseInline(leaf.content.slice(3), leaf.start + 3),
    ]));
    return true;
  }
}

const NodeTask: MarkdownConfig = {
  defineNodes: [
    { name: "NodeTask", block: true },
    "NodeTaskMark",
  ],
  parseBlock: [{
    name: "NodeTask",
    leaf(_context, leaf) {
      return /^\[[ xX]\][ \t]/.test(leaf.content) ? new NodeTaskParser() : null;
    },
    after: "SetextHeading",
  }],
};

const NodeLink: MarkdownConfig = {
  defineNodes: ["NodeLink", "NodeLinkMark", "NodeLinkTarget"],
  parseInline: [{
    name: "NodeLink",
    before: "Link",
    parse(context: InlineContext, next: number, position: number) {
      if (next !== 91 || context.char(position + 1) !== 91) return -1;
      let close = position + 2;
      while (close + 1 < context.end) {
        if (context.char(close) === 93 && context.char(close + 1) === 93) break;
        close += 1;
      }
      if (close + 1 >= context.end) return -1;
      const target = context.slice(position + 2, close);
      if (!/^node:[A-Za-z0-9._-]+$/.test(target)) return -1;
      return context.addElement(context.elt("NodeLink", position, close + 2, [
        context.elt("NodeLinkMark", position, position + 2),
        context.elt("NodeLinkTarget", position + 2, close),
        context.elt("NodeLinkMark", close, close + 2),
      ]));
    },
  }],
};

const NodeMarkdownSubset: MarkdownConfig = {
  // A node is a standalone line, so reference definitions such as `[1]:url`
  // are ambiguous with user-authored labels and cannot serve later nodes.
  remove: ["LinkReference"],
};

/** Parser extensions for the node-oriented Markdown subset. */
export const nodeMarkdownExtensions = [NodeMarkdownSubset, Strikethrough, Highlight, NodeTask, NodeLink];
